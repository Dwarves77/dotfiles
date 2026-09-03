// Decision logic + per-source assessment for POST /api/worker/check-sources, split out of
// route.ts (BUILDGATE, 2026-09-02, F34's named residual / build-graph proof). Next 16's
// route-type validator rejects a route.ts that exports anything besides route handlers/config
// fields — `next build --webpack` type-checks the whole route module and rejects any other
// export field on it — so these functions move to this sibling module and route.ts imports
// them. Behaviour is unchanged; only the file they live in moved. route.npmtest.mjs now
// imports this module directly instead of route.ts.

import { d3GuardRejection } from "@/lib/d3/hooks.mjs";
import { browserlessRender, BrowserlessError } from "@/lib/sources/browserless";
import { classifyReachability } from "@/lib/sources/reachability.mjs";
import { decideSourceAssessment } from "@/lib/sources/check-sources-decision.mjs";
import { contentFingerprint, isContentChange } from "@/lib/sources/content-change.mjs";
import { extractPortalLinks } from "@/lib/sources/portal-links.mjs";
import { persistPortalCandidates } from "@/lib/intake/portal-harvest";
import { urlIsRoot } from "@/lib/sources/entity-gate.mjs";

type RenderFn = (u: string, o: { maxTextLength?: number }) => Promise<{ status: number; text?: string; html?: string }>;
type ClassifyFn = (r: { status: number | null; errored: boolean }) => string;

// LIMIT PARAMETER (lane CD, check-sources route defect fix, 2026-09-02). Found while building the
// change-detection runtime: this route's due-source batch was a HARDCODED `.limit(10)` — no caller could
// change it. DEFAULT_CHECK_LIMIT keeps that exact prior value so source-monitoring.yml's own behaviour
// (no limit sent) is byte-for-byte unchanged; MAX_CHECK_LIMIT bounds a caller-supplied override so a
// dispatch can never accidentally scan the whole 2,561-row corpus (and its matching Browserless spend) in
// one hourly tick.
export const DEFAULT_CHECK_LIMIT = 10;
export const MAX_CHECK_LIMIT = 50;

/**
 * Pure: validate a caller-supplied `limit` (arrives as a query-string value — always a string — or a
 * JSON body value — string or number — so `raw` is typed `unknown`). Exported so the parsing/validation
 * CONTRACT is unit-testable without constructing a full NextRequest.
 *   - undefined / null / "" (not supplied at all) -> ok, DEFAULT_CHECK_LIMIT (the unchanged prior default).
 *   - anything else must parse as an integer in [1, MAX_CHECK_LIMIT] -> ok, that value.
 *   - anything else (non-numeric, fractional, <1, >MAX_CHECK_LIMIT) -> not ok, a message naming the rule
 *     and the rejected value verbatim (never a bare "invalid limit").
 */
export function validateCheckLimit(raw: unknown): { ok: true; limit: number } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, limit: DEFAULT_CHECK_LIMIT };
  // Only a string (query param) or a number (JSON body) is a legitimate shape — reject anything else
  // BEFORE Number()-coercing it: Number([10]) === 10 and Number(true) === 1 are real JS gotchas that
  // would otherwise let a malformed body value ("limit": [10] or "limit": true) slip through as valid.
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { ok: false, error: `limit must be an integer between 1 and ${MAX_CHECK_LIMIT} (got ${JSON.stringify(raw)})` };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_CHECK_LIMIT) {
    return {
      ok: false,
      error: `limit must be an integer between 1 and ${MAX_CHECK_LIMIT} (got ${JSON.stringify(raw)})`,
    };
  }
  return { ok: true, limit: n };
}

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
): Promise<{ status: string; httpStatus: number; outcome: string; changeDetected: boolean; portalCandidates: number }> {
  const render = opts?.render ?? (browserlessRender as unknown as RenderFn);
  const classify = opts?.classify ?? (classifyReachability as ClassifyFn);

  let outcome: string;
  let httpStatus = 0;
  let renderedText = "";
  let renderedHtml = "";
  try {
    const r = await render(source.url, { maxTextLength: 2000 });
    httpStatus = r.status;
    renderedText = r.text ?? "";
    renderedHtml = r.html ?? "";
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

  // CHANGE DETECTION (P2-6 / S1-10): fingerprint the SAME render the accessibility check paid
  // for (zero extra Browserless units) and compare against sources.last_content_hash (mig 161).
  // change_detected was previously HARDCODED false — zero change rows ever. A thin/failed
  // capture never fingerprints (contentFingerprint -> null) so outages don't read as change,
  // and a first observation only SEEDS the hash. Downstream auto-action on a change is
  // deliberately NOT wired here — that rides the loop flip (operator's word); this makes the
  // signal REAL and queryable (monitoring_queue.change_detected + sources.last_content_changed_at).
  const newHash = isAccessible ? contentFingerprint(renderedText) : null;
  const changeDetected = isContentChange(source.last_content_hash, newHash);

  const updates: Record<string, unknown> = {
    // last_checked stamps "scraped this window" (the batch-coverage marker). next_scheduled_check is
    // NOT written — per-source scheduling is retired under the global cadence.
    last_checked: new Date().toISOString(),
    consecutive_accessible: decision.consecutive_accessible,
    total_checks: (source.total_checks ?? 0) + 1,
  };
  if (newHash) updates.last_content_hash = newHash;
  if (changeDetected) updates.last_content_changed_at = new Date().toISOString();
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
    details: { type: "accessibility_check", success: isAccessible, http_status: httpStatus, reachability: outcome, change_detected: changeDetected, content_hash: newHash },
    created_by: "worker",
  });
  await supabase.from("monitoring_queue").insert({
    source_id: source.id,
    scheduled_check: new Date().toISOString(),
    priority: "normal",
    last_result: isAccessible ? (changeDetected ? "change_detected" : "no_change") : outcome,
    change_detected: changeDetected,
    checked_at: new Date().toISOString(),
    error_message: isAccessible ? null : `${outcome} (HTTP ${httpStatus})`,
  });
  // PORTAL DEEP-LINK DISCOVERY (P2-5 / S2-08): ~55% of sources are root portals whose deep links
  // (the actual instruments) nothing enumerated. For portal-class sources, extract candidate
  // instrument links from the SAME uncapped html this render already returned (zero extra units)
  // into portal_link_candidates (mig 162) — an append-only, deduped DISCOVERY ledger. A candidate
  // is a lead, not an item: fetch+classify through the intake gate rides the loop flip. Upsert on
  // url refreshes last_seen_at/anchor_text only; status + first_seen_at are never overwritten.
  // Non-fatal: a crawl failure never fails the accessibility check.
  let portalCandidates = 0;
  if (isAccessible && renderedHtml && urlIsRoot(source.url)) {
    try {
      const links = extractPortalLinks(renderedHtml, source.url);
      // ONE ledger write-site (B1): the scheduled crawl and the manual harvest runner share
      // persistPortalCandidates so upsert semantics can never drift between the two producers.
      const persisted = await persistPortalCandidates(supabase, source.id, links);
      portalCandidates = persisted.upserted;
      if (portalCandidates) console.log(`[portal-crawl] ${source.name}: ${portalCandidates} candidate deep link(s) recorded`);
    } catch (e) {
      console.warn(`[portal-crawl] extraction failed for ${source.url}: ${(e as Error).message}`);
    }
  }
  return { status: isAccessible ? "accessible" : outcome, httpStatus, outcome, changeDetected, portalCandidates };
}

/** One `results[]` entry, as returned in the route's JSON response. */
export interface CheckSourcesResultEntry {
  source: string;
  status: string;
  httpStatus: number;
  outcome: string;
  changeDetected: boolean;
  portalCandidates: number;
  error?: string;
}

/**
 * Pure: map ONE assessAndUpdateSource() outcome into this route's `results[]` entry shape (lane CD,
 * 2026-09-02 — `httpStatus`/`outcome`/`changeDetected`/`portalCandidates` were computed by
 * assessAndUpdateSource all along but never reached the response body; the route silently kept only
 * `status`). Exported so the response SHAPE is unit-testable against a real assessAndUpdateSource call
 * (with injected render/classify) without a live NextRequest.
 */
export function buildResultEntry(
  sourceName: string,
  assessed: { status: string; httpStatus: number; outcome: string; changeDetected: boolean; portalCandidates: number }
): CheckSourcesResultEntry {
  return {
    source: sourceName,
    status: assessed.status,
    httpStatus: assessed.httpStatus,
    outcome: assessed.outcome,
    changeDetected: assessed.changeDetected,
    portalCandidates: assessed.portalCandidates,
  };
}

/** Pure: the `results[]` entry for a source whose assessment THREW (assessAndUpdateSource itself failed,
 *  not merely returned an inaccessible/error outcome). */
export function buildErrorEntry(sourceName: string, message: string): CheckSourcesResultEntry {
  return { source: sourceName, status: "error", httpStatus: 0, outcome: "error", changeDetected: false, portalCandidates: 0, error: message };
}

/** Pure: the response-level totals derived from a batch of `results[]` entries — never a second DB read,
 *  never anything beyond a fold over what was already computed per source. */
export function summarizeResults(results: CheckSourcesResultEntry[]): { sourcesChecked: number; changesDetected: number; portalCandidates: number } {
  return {
    sourcesChecked: results.length,
    changesDetected: results.filter((r) => r.changeDetected).length,
    portalCandidates: results.reduce((sum, r) => sum + r.portalCandidates, 0),
  };
}
