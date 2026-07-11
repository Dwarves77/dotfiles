// Same-origin allowlist for post-auth return paths (Wave-α A6, 2026-07-11).
//
// Closes the open-redirect vectors in the two auth entry points (master gap
// register P1 finding 12 / CODE-4b F3):
//   - /auth/callback concatenated the raw `next` query param into
//     NextResponse.redirect(`${origin}${next}`) — a crafted value beginning
//     with `@host`, `\` or `//` can escape the origin
//     (e.g. `https://app@evil.com` parses host=evil.com).
//   - /login pushed the raw `redirect` param into router.push() —
//     `?redirect=https://evil.com` navigated off-site post-login
//     (phishing-grade).
//
// Rule: accept only a same-origin absolute PATH — starts with a single "/"
// and not "//" (protocol-relative) or "/\" (browser backslash-normalization
// escape). Everything else falls back to "/".
//
// Pure `.mjs` (no framework imports) so it is unit-testable via `node --test`
// and shared by the server route and the client login page alike.

/**
 * @param {string | null | undefined} raw
 * @returns {string} a safe same-origin path, or "/" when `raw` is unsafe.
 */
export function sanitizeReturnPath(raw) {
  if (!raw) return "/";
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}
