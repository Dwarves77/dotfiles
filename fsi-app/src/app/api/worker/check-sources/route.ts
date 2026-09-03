import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { isGloballyPaused, getScrapeState } from "@/lib/api/pause";
import { scrapeWindowOpen } from "@/lib/sources/scrape-schedule";
import { workerAuthGuard } from "@/lib/api/worker-auth";
import { runReconcilePass } from "@/lib/sources/reconcile";
// The limit-validation contract and the per-source assessment/response-shape logic live in a
// sibling module, not here: a route.ts may export only route handlers/config (F34's named
// residual — `next build --webpack` rejects any other export field). See logic.ts's header.
import {
  validateCheckLimit,
  assessAndUpdateSource,
  buildResultEntry,
  buildErrorEntry,
  summarizeResults,
  type CheckSourcesResultEntry,
} from "./logic";

/**
 * POST /api/worker/check-sources
 *
 * Monitoring queue worker. Checks sources that are due for scanning.
 * Called by an external cron job (e.g., Railway, Vercel Cron, or GitHub Actions).
 *
 * Authentication: requires WORKER_SECRET header to prevent unauthorized triggers.
 * This is NOT a user-facing API route — it's a system endpoint.
 *
 * Optional `limit` (lane CD, 2026-09-02): a JSON body `{"limit": N}` or a `?limit=N` query param bounds
 * how many due sources this tick checks — an integer in [1, MAX_CHECK_LIMIT]; omitted entirely, it stays
 * DEFAULT_CHECK_LIMIT (the prior hardcoded value, so source-monitoring.yml's own no-body POST is
 * unaffected). A body value wins over a query value when both are given. An out-of-range or non-numeric
 * limit is a 400 naming the rejected value, before any DB work.
 */
export async function POST(request: NextRequest) {
  // Authenticate worker
  const denied = workerAuthGuard(request);
  if (denied) return denied;

  // Parse + validate the optional limit override BEFORE any state check or DB work — a malformed request
  // is a client error (400), not a "worker exiting" no-op. request.text() (not request.json()) tolerates
  // the body-less POST source-monitoring.yml actually sends, without throwing on an empty stream.
  let rawLimit: unknown;
  const queryLimit = request.nextUrl.searchParams.get("limit");
  if (queryLimit !== null) rawLimit = queryLimit;
  try {
    const bodyText = await request.text();
    if (bodyText && bodyText.trim().length > 0) {
      const parsedBody: unknown = JSON.parse(bodyText);
      if (parsedBody && typeof parsedBody === "object" && "limit" in (parsedBody as Record<string, unknown>)) {
        rawLimit = (parsedBody as Record<string, unknown>).limit;
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: `invalid JSON body: ${e.message}` }, { status: 400 });
  }
  const limitResult = validateCheckLimit(rawLimit);
  if (!limitResult.ok) {
    return NextResponse.json({ error: limitResult.error }, { status: 400 });
  }
  const limit = limitResult.limit;

  const supabase = getServiceSupabase();

  // OFF-gate: scraping switched off (cadence 'off' or emergency stop) — exit before any DB scan work.
  if (await isGloballyPaused(supabase)) {
    return NextResponse.json({ message: "Scraping is off (cadence 'off' or emergency stop); worker exiting", checked: 0, sourcesChecked: 0, changesDetected: 0, portalCandidates: 0 });
  }
  // WINDOW-gate (decision C): the AUTOMATED worker fires ONLY on a scheduled scrape day per the global
  // cadence. The hourly cron becomes a "should I run now?" check; off-days no-op. The per-source
  // update_frequency/next_scheduled_check cadence is RETIRED — the global schedule is the only throttle.
  const schedule = await getScrapeState(supabase);
  if (!scrapeWindowOpen(schedule, new Date())) {
    return NextResponse.json({ message: `Not a scheduled scrape day (cadence=${schedule.cadence}); worker exiting`, checked: 0, sourcesChecked: 0, changesDetected: 0, portalCandidates: 0 });
  }

  try {
    // Step 1: select the sources to scrape this tick. Option 1 (global cadence): the window-gate above
    // already decided it's a scrape day, on which the WHOLE system scrapes — there is NO per-source
    // "due" filter (update_frequency/next_scheduled_check are retired). For throughput, the hourly ticks
    // BATCH through the corpus using last_checked: a source already checked THIS window (last_checked >=
    // windowStart) is skipped; the rest are covered across the day's remaining ticks. Next scrape day,
    // every source's last_checked is < that day's windowStart again, so the whole corpus re-scrapes.
    // Per-source membership still applies: status='active', not processing_paused, auto_run_enabled
    // (the per-source include/exclude toggle — orthogonal to the global cadence). base_tier orders the
    // batch (structural priority; effective_tier would reshuffle on every Q7 recompute).
    const windowStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())).toISOString();
    const { data: dueSources, error: queueError } = await supabase
      .from("sources")
      .select("id, name, url, base_tier, last_checked, access_method, auto_run_enabled, status, consecutive_accessible, successful_checks, total_checks, last_content_hash")
      .eq("status", "active")
      .eq("processing_paused", false)
      .eq("auto_run_enabled", true)
      .or(`last_checked.is.null,last_checked.lt.${windowStart}`)
      .order("base_tier", { ascending: true })
      .limit(limit); // batch size per hourly tick — caller-supplied via `limit`, defaulting to DEFAULT_CHECK_LIMIT

    if (queueError) {
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    if (!dueSources?.length) {
      return NextResponse.json({ message: "No sources due for checking", checked: 0, sourcesChecked: 0, changesDetected: 0, portalCandidates: 0 });
    }

    const results: CheckSourcesResultEntry[] = [];

    // Step 2: Check each source
    for (const source of dueSources) {
      try {
        // Accessibility check via the D1 canonical fetch (browserlessRender, the single
        // source of truth). The prior plain HEAD with a bot UA returned 403/404 from
        // bot-protected real sources — the 420-class eviction risk. A successful
        // Browserless render is the reliable "reachable" signal; bot blocks no longer
        // masquerade as dead.
        // Assessment + status update is extracted (and reachability now goes through the
        // SSOT classifier) so a NON-ANSWER does not evict and the consumer outcome is testable.
        const assessed = await assessAndUpdateSource(supabase, source);
        results.push(buildResultEntry(source.name, assessed));
      } catch (e: any) {
        results.push(buildErrorEntry(source.name, e.message));
      }
    }

    // Response-only totals (lane CD, 2026-09-02) — derived from `results` above, never a second DB read;
    // nothing about what gets WRITTEN to sources/monitoring_queue/portal_link_candidates changes here.
    const { sourcesChecked, changesDetected, portalCandidates: portalCandidatesTotal } = summarizeResults(results);

    // Step 3: reconcile IN-PROCESS (chain repair, 2026-09-01). check-sources just wrote this batch's
    // monitoring_queue rows with a REAL change_detected (Step 1/S1-10, above) — without this call the
    // queue -> intelligence_changes hop was dead: /api/worker/reconcile had zero callers and no schedule
    // fires it (source-monitoring.yml's cron is intentionally commented out, dispatch-only, per the
    // acquisition-freeze ruling — arming it is a one-line uncomment for later, not this change). Importing
    // the consumer function directly (not an HTTP self-call) means ONE dispatch of this route both detects
    // AND reconciles. Never fatal to the scan response — a reconcile-pass failure is reported alongside
    // the scan results, not thrown; the manual /api/worker/reconcile route remains available to re-drive.
    let reconcile: Awaited<ReturnType<typeof runReconcilePass>> | { error: string };
    try {
      reconcile = await runReconcilePass(supabase);
    } catch (e: any) {
      reconcile = { error: e?.message ?? String(e) };
    }

    return NextResponse.json({
      message: `Checked ${results.length} sources`,
      checked: results.length,
      sourcesChecked,
      changesDetected,
      portalCandidates: portalCandidatesTotal,
      results,
      reconcile,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// (getNextCheck retired — per-source update_frequency cadence is superseded by the global scrape
// schedule; see src/lib/sources/scrape-schedule.ts. next_scheduled_check is no longer computed/written.)
