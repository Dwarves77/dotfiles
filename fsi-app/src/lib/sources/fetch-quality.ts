// Brief-content quality gate (Phase 2B), non-LLM.
//
// NOTE (2026-07-11, audit CODE-1 F-11): the original pre-classify fetch-quality gate
// (checkFetchQuality + its BLOCK/NOT_FOUND/MAINTENANCE pattern sets) was removed from this
// module — it had zero src/ callers; the script-side pipeline carries its own live copy at
// scripts/lib/fetch-quality.mjs, and capture-time junk detection now lives in
// entity-gate.mjs isErrorBody / transport-escalation.mjs (RD-13/RD-14). Only the
// post-classify brief-content gate below is consumed from src/ (canonical-pipeline.ts).

// Phase 2B (2026-05-24): post-classify content-quality gate. The
// pre-classify gate above catches blocked / not-found / maintenance
// pages at fetch time, but does not catch the case where a fetch
// returns OK content yet the AGENT produces a brief that explains a
// fetch failure rather than describing real content (e.g. IRENA
// "Content unavailable - Source returned 403 Forbidden error" leaked
// into a user-visible finding body per 2026-05-24 browser audit).
//
// This gate runs on the AGENT-PRODUCED full_brief markdown body
// before it is persisted to intelligence_items. When the brief reads
// as a failure-explanation, the persistence is rejected; the prior
// brief (if any) stays in place and the item is queued for re-fetch.
//
// Patterns are conservative: they should fire on briefs that openly
// explain "we tried, it didn't work" and NOT on legitimate briefs
// that reference HTTP status codes as substantive content (e.g. a
// regulatory analysis discussing a 503 declaration somewhere in body).
// We require the pattern to appear in the FIRST 1 KB to favor briefs
// that LEAD with the failure explanation, which is the leak shape
// observed in production.
const BRIEF_FAILURE_PATTERNS: RegExp[] = [
  /content unavailable[ ,.\-]*source/i,
  /\baccess blocked\b/i,
  /\baccess denied\b/i,
  /source returned (\d{3}|an? )/i,
  /could not be accessed/i,
  /\b403 forbidden\b/i,
  /\b401 unauthor[iz]ed\b/i,
  /\b404 not found\b/i,
  /\b502 bad gateway\b/i,
  /\b503 service unavailable\b/i,
];

const BRIEF_PROBE_BYTES = 1_000;

export interface BriefContentCheck {
  ok: boolean;
  reason: string | null;
}

/**
 * Phase 2B (2026-05-24): scan an agent-generated brief body for
 * fetch-failure explanation phrases that should not surface in
 * customer-facing content. Returns ok=false with a `reason` token
 * when the brief reads as a failure explanation.
 */
export function checkBriefContent(body: string | null | undefined): BriefContentCheck {
  if (!body) return { ok: true, reason: null };
  const probe = body.slice(0, BRIEF_PROBE_BYTES);
  for (const re of BRIEF_FAILURE_PATTERNS) {
    if (re.test(probe)) return { ok: false, reason: `brief_failure_${re.source.replace(/[^a-z0-9]/gi, "_").slice(0, 30)}` };
  }
  return { ok: true, reason: null };
}

