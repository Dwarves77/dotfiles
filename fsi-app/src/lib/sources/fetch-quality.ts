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
