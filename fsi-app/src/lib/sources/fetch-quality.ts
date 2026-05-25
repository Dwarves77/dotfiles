// Fetch-quality pre-filter, non-LLM.
//
// Cheap pattern-matching gate that runs after a source fetch returns
// and before any LLM classification. Detects HTTP failures, Cloudflare
// or CAPTCHA interstitials, 404 / not-found pages, maintenance pages,
// and content-too-short bodies. The agent must not pay Sonnet or
// Haiku tokens to "classify" a Cloudflare block as a regulation.
//
// All regexes are compiled at module load. The probe window is the
// first 5 KB of the text body; that is enough to catch the gate
// markup which always sits above the fold, and short enough to keep
// the hot path negligible.

const PROBE_BYTES = 5_000;
const MIN_TEXT_BYTES = 500;

const BLOCK_PATTERNS: RegExp[] = [
  /cloudflare/i,
  /just a moment\.?\.?\.?/i,
  /checking your browser/i,
  /attention required/i,
  /challenge-platform/i,
  /captcha/i,
  /recaptcha/i,
  /hcaptcha/i,
  /security check/i,
  /access denied/i,
  /enable javascript/i,
  /please verify you are human/i,
];

const NOT_FOUND_PATTERNS: RegExp[] = [
  /404 not found/i,
  /page not found/i,
  /this page (has moved|cannot be found|doesn'?t exist)/i,
  /the requested url .+ was not found/i,
];

const MAINTENANCE_PATTERNS: RegExp[] = [
  /under maintenance/i,
  /temporarily unavailable/i,
  /service unavailable/i,
  /we'?ll be back/i,
  /scheduled maintenance/i,
];

export interface FetchQualityCheck {
  ok: boolean;
  reason: string | null;
}

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

export interface FetchQualityInput {
  html?: string;
  text?: string;
  httpStatus?: number;
}

export function checkFetchQuality(input: FetchQualityInput): FetchQualityCheck {
  const status = input.httpStatus;
  if (typeof status === "number" && (status < 200 || status >= 400)) {
    return { ok: false, reason: `http_status_${status}` };
  }
  const probe = (input.html ?? input.text ?? "").slice(0, PROBE_BYTES);
  for (const re of BLOCK_PATTERNS) {
    if (re.test(probe)) return { ok: false, reason: "blocked_cloudflare" };
  }
  for (const re of NOT_FOUND_PATTERNS) {
    if (re.test(probe)) return { ok: false, reason: "not_found_page" };
  }
  for (const re of MAINTENANCE_PATTERNS) {
    if (re.test(probe)) return { ok: false, reason: "maintenance_page" };
  }
  const textLen = (input.text ?? "").length;
  if (textLen < MIN_TEXT_BYTES) {
    return { ok: false, reason: `content_too_short_${textLen}` };
  }
  return { ok: true, reason: null };
}
