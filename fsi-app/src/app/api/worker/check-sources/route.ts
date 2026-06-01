import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isGloballyPaused } from "@/lib/api/pause";
import { d3GuardRejection } from "@/lib/d3/hooks.mjs";
import { browserlessRender, BrowserlessError } from "@/lib/sources/browserless";
import { classifyReachability, REACH } from "@/lib/sources/reachability.mjs";

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
  const isAccessible = outcome === REACH.REACHABLE;

  const updates: Record<string, unknown> = {
    last_checked: new Date().toISOString(),
    next_scheduled_check: getNextCheck(source.update_frequency),
  };
  if (isAccessible) {
    updates.last_accessible = new Date().toISOString();
    updates.consecutive_accessible = (source.consecutive_accessible ?? 0) + 1;
    updates.successful_checks = (source.successful_checks ?? 0) + 1;
    updates.total_checks = (source.total_checks ?? 0) + 1;
    if (source.status === "inaccessible") updates.status = "active";
  } else {
    updates.last_inaccessible = new Date().toISOString();
    updates.total_checks = (source.total_checks ?? 0) + 1;
    updates.consecutive_accessible = 0;
    // ONLY a definitive DEAD (404/410) may evict. INCONCLUSIVE (the non-answer) does NOT.
    if (outcome === REACH.DEAD && (source.consecutive_accessible ?? 0) === 0) {
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

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  // Authenticate worker
  const secret = request.headers.get("x-worker-secret");
  if (secret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Global pause gate — short-circuits before any DB scan work.
  if (await isGloballyPaused(supabase)) {
    return NextResponse.json({ message: "Global processing pause is active; worker exiting", checked: 0 });
  }

  try {
    // Step 1: Find sources due for checking. Filter out per-source pause
    // and the Wave 1a auto_run_enabled kill switch. The cold-start script
    // flips all 718 active sources to auto_run_enabled=false on first
    // run; operators re-enable per source after vetting, so by default
    // the worker has nothing to do until at least one source has been
    // turned back on.
    // Phase 1.5: base_tier per system-internal default rule (scheduling
    // priority is anchored to structural classification, not the dynamic
    // credibility signal; using effective_tier would re-shuffle the queue
    // on every Q7 recompute).
    const { data: dueSources, error: queueError } = await supabase
      .from("sources")
      .select("id, name, url, base_tier, update_frequency, last_checked, access_method, auto_run_enabled, status, consecutive_accessible, successful_checks, total_checks")
      .eq("status", "active")
      .eq("processing_paused", false)
      .eq("auto_run_enabled", true)
      .or(`next_scheduled_check.is.null,next_scheduled_check.lte.${new Date().toISOString()}`)
      .order("base_tier", { ascending: true })
      .limit(10); // Process 10 sources per run

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

function getNextCheck(frequency: string): string {
  const now = Date.now();
  const intervals: Record<string, number> = {
    continuous: 3600000,      // 1 hour
    daily: 86400000,          // 24 hours
    "business-daily": 86400000,
    weekly: 604800000,        // 7 days
    biweekly: 1209600000,     // 14 days
    monthly: 2592000000,      // 30 days
    quarterly: 7776000000,    // 90 days
    annual: 31536000000,      // 365 days
    "ad-hoc": 604800000,      // Default to weekly for ad-hoc
  };
  const interval = intervals[frequency] || 604800000;
  return new Date(now + interval).toISOString();
}
