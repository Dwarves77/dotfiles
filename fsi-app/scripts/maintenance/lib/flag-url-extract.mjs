// flag-url-extract.mjs -- shared pure URL-extraction primitive for integrity_flags rows whose
// description/recommended_actions name one or more URLs (Part 7 task 7.4's two gate resolvers:
// resolve-cited-host-gate.mjs and resolve-error-body-gate.mjs both read this exact shape from
// canonical-pipeline.ts's cited-host-gate/error-body-gate write sites). Extracted here on the second
// confirmed instance (remediation-discipline's recurrence threshold) rather than duplicated a second
// time -- both write sites build `recommended_actions: [{ action, rationale: "<url>...": ... }]` (up to
// 8 entries) and a `description` that also names the URLs inline (up to 6, comma/semicolon-joined,
// truncated to 480 chars) -- so a flag's recommended_actions is the fuller, structured source and
// description is the fallback for an older/hand-written row whose recommended_actions is empty.
//
// The regex is the SAME parenthesis-balanced URL matcher heal-provenance.mjs's own CITED_URL_RE and
// criterion 2's URL_RE (validate-mint-payload.mjs) use, mirrored verbatim -- a URL followed by a
// bracketed identifier (an OJ reference, a CELEX suffix) extracts whole instead of stopping at the first
// unbalanced paren.

export const URL_RE = /https?:\/\/(?:[^\s()\]}"'<>]|\([^\s()]*\))+/g;

/** Strip trailing sentence/list punctuation a regex match can pick up (":", ")", ",", ".", ";") that is
 *  not actually part of the URL -- both write sites' rationale strings put a URL directly against a
 *  trailing ":" or wrap it in "<url> (cited in ...)", either of which the balanced-paren regex above can
 *  swallow whole. Pure. */
export function trimUrlPunctuation(url) {
  let u = String(url ?? "").replace(/[.,;:]+$/, "");
  while (u.endsWith(")") && !u.includes("(")) u = u.slice(0, -1);
  return u;
}

/**
 * Every URL named in one integrity_flags row, deduplicated, order-preserving. `recommended_actions[].
 * rationale` is read first; `description` is read ONLY when recommended_actions yields nothing (an older
 * or hand-written flag, or a malformed recommended_actions). Pure.
 * @param {{ description?: string|null, recommended_actions?: Array<{rationale?:string}>|null }} flag
 * @returns {string[]}
 */
export function extractFlagUrls(flag) {
  const urls = [];
  const seen = new Set();
  const push = (u) => {
    const t = trimUrlPunctuation(u);
    if (!t || seen.has(t)) return;
    seen.add(t);
    urls.push(t);
  };
  for (const action of Array.isArray(flag?.recommended_actions) ? flag.recommended_actions : []) {
    for (const m of String(action?.rationale ?? "").matchAll(URL_RE)) push(m[0]);
  }
  if (!urls.length) {
    for (const m of String(flag?.description ?? "").matchAll(URL_RE)) push(m[0]);
  }
  return urls;
}
