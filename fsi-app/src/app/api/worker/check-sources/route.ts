import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isGloballyPaused, getScrapeState } from "@/lib/api/pause";
import { scrapeWindowOpen } from "@/lib/sources/scrape-schedule";
import { d3GuardRejection } from "@/lib/d3/hooks.mjs";
import { browserlessRender, BrowserlessError } from "@/lib/sources/browserless";
import { classifyReachability } from "@/lib/sources/reachability.mjs";
import { decideSourceAssessment } from "@/lib/sources/check-sources-decision.mjs";
import { workerAuthGuard } from "@/lib/api/worker-auth";

type RenderFn = (u: string, o: { maxTextLength?: number }) => Promise<{ status: number }>;
type ClassifyFn = (r: { status: number | null; errored: boolean }) => string;

// Per-source accessibility assessment + status update. Extracted so the consumer's OWN
// stored outcome (sources.status) is testable under a forced failure — verified at the
// consumer, not inherited from the reachability SSOT. render/classify are injectable.
//
// #4 CLASS FIX (non-answer-as-negative): a NON-ANSWER (429/5xx/timeout/abort/403/render-fail)
// is INCONCLUSIVE and must NOT evict (status -> 'inaccessible'); only a definitive DEAD
// (404/410) is evictable, through the existing d3 guard. Pre-fix: any catch -> isAccessible
// =false -> the eviction branch (so a Browserless 429 would mark a live source inaccessible —
// the bug). NOTE: pre-fix the eviction was also INERT in production because the route never
// SELECTed consecutive_accessible/status (undefined === 0 is false); this fix also loads those
// fields so eviction/reactivation actually work, now on the corrected non-answer principle.
export async function assessAndUpdateSource(
  supabase: any,
  source: any,
  opts?: { render?: RenderFn; classify?: ClassifyFn }
): Promise<{ status: string; httpStatus: number; outcome: string }> {
  const render = opts?.render ?? (browserlessRender as unknown as RenderFn);
  const classify = opts?.classify ?? (classifyReachability as ClassifyFn);

  let outcome: string;
  let httpStatus = 0;
  try {
    const r = await render(source.url, { maxTextLength: 2000 });
    httpStatus = r.status;
    outcome = classify({ status: r.status, errored: false });
  } catch (e: unknown) {
    httpStatus = e instanceof BrowserlessError ? (e.status ?? 0) : 0;
    outcome = classify({ status: httpStatus || null, errored: true });
  }
  // Decision delegated to a pure, fixture-tested fn (check-sources-decision.mjs): a non-answer
  // is INCONCLUSIVE (not accessible, NOT evict-eligible); only a definitive DEAD with a 0 streak
  // may consult the eviction guard.
  const decision = decideSourceAssessment({ outcome, source });
  const isAccessible = decision.isAccessible;

  const updates: Record<string, unknown> = {
    // last_checked stamps "scraped this window" (the batch-coverage marker). next_scheduled_check is
    // NOT written — per-source scheduling is retired under the global cadence.
    last_checked: new Date().toISOString(),
    consecutive_accessible: decision.consecutive_accessible,
    total_checks: (source.total_checks ?? 0) + 1,
  };
  if (isAccessible) {
    updates.last_accessible = new Date().toISOString();
    updates.successful_checks = (source.successful_checks ?? 0) + 1;
    if (decision.reactivate) updates.status = "active";
  } else {
    updates.last_inaccessible = new Date().toISOString();
    if (decision.evictEligible) {
      const guard = await d3GuardRejection(supabase, { candidateUrl: source.url, method: "browserless-render" });
      if (guard.outcome === "evict") updates.status = "inaccessible";
    }
    // INCONCLUSIVE: quarantine — record the check, leave status as-is. No eviction.
  }

  await supabase.from("sources").update(updates).eq("id", source.id);
  await supabase.from("source_trust_events").insert({
    source_id: source.id,
    event_type: "accessibility_check",
    details: { type: "accessibility_check", success: isAccessible, http_status: httpStatus, reachability: outcome },
    created_by: "worker",
  });
  await supabase.from("monitoring_queue").insert({
    source_id: source.id,
    scheduled_check: new Date().toISOString(),
    priority: "normal",
    last_result: isAccessible ? "no_change" : outcome,
    change_detected: false,
    checked_at: new Date().toISOString(),
    error_message: isAccessible ? null : `${outcome} (HTTP ${httpStatus})`,
  });
  return { status: isAccessible ? "accessible" : outcome, httpStatus, outcome };
}

/**
 * POST /api/worker/check-sources
 *
 * Monitoring queue worker. Checks sources that are due for scanning.
 * Called by an external cron job (e.g., Railway, Vercel Cron, or GitHub Actions).
 *
 * Authentication: requires WORKER_SECRET header to prevent unauthorized triggers.
 * This is NOT a user-facing API route — it's a system endpoint.
 */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  // Authenticate worker
  const denied = workerAuthGuard(request);
  if (denied) return denied;

  const supabase = getServiceClient();

  // OFF-gate: scraping switched off (cadence 'off' or emergency stop) — exit before any DB scan work.
  if (await isGloballyPaused(supabase)) {
    return NextResponse.json({ message: "Scraping is off (cadence 'off' or emergency stop); worker exiting", checked: 0 });
  }
  // WINDOW-gate (decision C): the AUTOMATED worker fires ONLY on a scheduled scrape day per the global
  // cadence. The hourly cron becomes a "should I run now?" check; off-days no-op. The per-source
  // update_frequency/next_scheduled_check cadence is RETIRED — the global schedule is the only throttle.
  const schedule = await getScrapeState(supabase);
  if (!scrapeWindowOpen(schedule, new Date())) {
    return NextResponse.json({ message: `Not a scheduled scrape day (cadence=${schedule.cadence}); worker exiting`, checked: 0 });
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
      .select("id, name, url, base_tier, last_checked, access_method, auto_run_enabled, status, consecutive_accessible, successful_checks, total_checks")
      .eq("status", "active")
      .eq("processing_paused", false)
      .eq("auto_run_enabled", true)
      .or(`last_checked.is.null,last_checked.lt.${windowStart}`)
      .order("base_tier", { ascending: true })
      .limit(10); // batch size per hourly tick

    if (queueError) {
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    if (!dueSources?.length) {
      return NextResponse.json({ message: "No sources due for checking", checked: 0 });
    }

    const results: { source: string; status: string; error?: string }[] = [];

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
        results.push({ source: source.name, status: assessed.status });
      } catch (e: any) {
        results.push({
          source: source.name,
          status: "error",
          error: e.message,
        });
      }
    }

    return NextResponse.json({
      message: `Checked ${results.length} sources`,
      checked: results.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// (getNextCheck retired — per-source update_frequency cadence is superseded by the global scrape
// schedule; see src/lib/sources/scrape-schedule.ts. next_scheduled_check is no longer computed/written.)
