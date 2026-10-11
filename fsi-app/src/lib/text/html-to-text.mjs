// @ts-check
/**
 * Strip HTML markup to plain, whitespace-collapsed text. PURE — no I/O.
 *
 * @param {string|null|undefined} html
 * @param {{maxChars?: number, blankEntities?: boolean}} [opts] blankEntities — replace every HTML
 *   entity (&amp; &#123; …) with a space instead of keeping it verbatim; the remediation capture path
 *   (scripts/remediation/acquire-primaries-batch.mjs) needs this so entity text never becomes a
 *   grounding span. maxChars — when given, the returned text is sliced to this length
 *   (applied AFTER whitespace collapse + trim, so a caller gets exactly maxChars characters of real text,
 *   never a truncated tag or trailing run of collapsed whitespace).
 * @returns {string}
 */

export function htmlToText(html, opts = {}) {
  const { maxChars, blankEntities = false } = opts;
  const text = String(html ?? "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:[a-z]+|#\d+);/gi, (m) => (blankEntities ? " " : m))
    .replace(/\s+/g, " ")
    .trim();
  return typeof maxChars === "number" ? text.slice(0, maxChars) : text;
}
