// Fetch-quality pre-filter, non-LLM. Mirror of
// src/lib/sources/fetch-quality.ts so .mjs scripts can use the same
// logic without a build step. Keep the two files in lockstep.

const PROBE_BYTES = 5_000;
const MIN_TEXT_BYTES = 500;

const BLOCK_PATTERNS = [
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

const NOT_FOUND_PATTERNS = [
  /404 not found/i,
  /page not found/i,
  /this page (has moved|cannot be found|doesn'?t exist)/i,
  /the requested url .+ was not found/i,
];

const MAINTENANCE_PATTERNS = [
  /under maintenance/i,
  /temporarily unavailable/i,
  /service unavailable/i,
  /we'?ll be back/i,
  /scheduled maintenance/i,
];

export function checkFetchQuality(input) {
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
