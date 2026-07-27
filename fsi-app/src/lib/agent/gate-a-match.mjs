// gate-a-match.mjs — the SINGLE literal-and-exact matcher for every Gate-A coverage decision.
//
// Doctrine (error-swallow case-file instance 7, operator ruling 2026-07-26): the literal-and-exact rule
// applies to EVERY function that decides whether a fact token is grounded — not only functions that WRITE
// claims (the mint runner) but equally the function that DECIDES COVERAGE (the scanner's isBacked). A
// digit-reduced or fuzzy match at a coverage site invents grounding exactly as a fallback at a write site
// does: "August 2025" is NOT backed by a span that merely contains "2025". Both the scanner (gate-a-scan.mjs)
// and the mint runner (scripts/remediation/gate-a-mint.mjs) import THIS module so they can never diverge again.
//
// Rule: matchers are literal and exact. Anything unmatched fails closed to orphan/hold. No dig-forms, no
// fuzzy, no "close enough" at any grounding site.

/** Whitespace-collapsed, case-insensitive normalization. */
export const norm = (s) => String(s || "").replace(/\s+/g, " ").toLowerCase();

/** The one coverage decision: does `haystack` contain `token` as a normalized literal substring?
 *  No digit reduction, no fuzzy matching. Empty token never matches (fails closed). */
export const containsToken = (haystack, token) => {
  const t = norm(token);
  return t.length > 0 && norm(haystack).includes(t);
};
