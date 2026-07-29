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
//
// %-SPACING NORMALIZATION (operator ruling 2026-07-29, scoped exactly). PERCENT ONLY: any whitespace run
// (regular, plus U+00A0 no-break and U+202F narrow-no-break, which EU PDFs use) between a COMPLETE numeral
// and an immediately following `%` normalizes to nothing, on BOTH sides of the comparison — so a capture's
// "33 %" grounds the token "33%". Numeral boundaries are respected: "33%" does NOT match inside "133 %" or
// "233%" (the numeral must not be a suffix of a longer number), and only a whitespace run between the
// *complete* numeral and `%` collapses ("3 3 %" does not ground "33%"). Unit-symbol adjacency (GW, MW, EUR…)
// is NOT included — a future ruling may extend it one logged addition at a time, with evidence.

/** Whitespace-collapsed, case-insensitive normalization. Folds U+00A0/U+202F etc. (they are in \s) to space. */
export const norm = (s) => String(s || "").replace(/\s+/g, " ").toLowerCase();

/** Collapse a whitespace run between a digit and an immediately following `%` -> digit`%`. Percent only.
 *  The Unicode spaces are listed explicitly (they are already folded by norm, but this keeps the collapse
 *  correct if ever applied to un-normed text). */
const collapsePctSpace = (s) => String(s).replace(/(\d)[\s\u00A0\u202F]+%/g, "$1%");

/** A numeral-then-% token (e.g. "33%", "55.4%", "100%"): gets boundary-aware matching so it cannot match
 *  as the suffix of a longer number. */
const PCT_TOKEN = /^\d[\d.,]*%$/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The one coverage decision: does `haystack` contain `token` as a normalized literal substring?
 *  No digit reduction, no fuzzy matching. Empty token never matches (fails closed). A numeral+% token
 *  matches only at a numeral boundary (not preceded by a digit or a decimal/grouping separator). */
export const containsToken = (haystack, token) => {
  const t = collapsePctSpace(norm(token));
  if (t.length === 0) return false;
  const h = collapsePctSpace(norm(haystack));
  if (PCT_TOKEN.test(t)) {
    // numeral boundaries respected: the numeral must not be the tail of a longer number.
    return new RegExp("(?<![\\d.,])" + escapeRe(t)).test(h);
  }
  return h.includes(t);
};
