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

interface BriefContentCheck {
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

