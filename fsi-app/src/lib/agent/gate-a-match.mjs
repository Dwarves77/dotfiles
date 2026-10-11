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
