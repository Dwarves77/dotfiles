// @ts-check
// src/lib/text/html-to-text.mjs — THE ONE htmlToText body (Lane LEDGER-TEXT, 2026-09-04).
//
// THE DEFECT THIS CLOSES (coordinator [CONFIRMED], first export run 33902755838, 2026-09-04 17:51):
// scripts/turns/run-ledger-consume.mjs's buildFetchDoc returned `res.text()` RAW — every one of the 400
// exported candidates carried ~6,000 characters of "<!DOCTYPE html><html lang=..." (head, scripts, nav
// markup), and the live plan/apply path fed that same raw HTML straight into firstFetchClassify
// (src/lib/llm/first-fetch-classify.ts's FirstFetchClassifyInput.text is documented "Excerpt text from
// the fetch (already stripped of HTML)" — the contract always assumed stripped text; the caller never
// delivered it), so the classifier's "content excerpt" has been markup since the runtime was built.
//
// Meanwhile this repo had the SAME html-to-text logic re-typed as a private function THREE times:
// src/lib/llm/haiku-classify.ts (with a maxChars arg — dead code, its only caller, haikuClassify, was
// removed 2026-05-11; kept alive only via __internals for tests), src/lib/agent/canonical-pipeline.ts
// (the reference body this module's behaviour is lifted from verbatim), and
// src/lib/sources/officialness.mjs's stripTags (a DIFFERENT, narrower primitive — see that file's own
// comment on why it stays separate, not a fourth copy of this one).
//
// This is now the ONE body. script/style removal, tag strip, whitespace collapse, trim, optional slice —
// exactly canonical-pipeline.ts's pre-consolidation behaviour, byte-for-byte, so every caller that already
// depended on that shape (directFetchClean's HTML branch, the federalregister.gov/eCFR API branches) sees
// no behavior change from the move. Deliberately NOT an entity decoder (neither of the two real bodies
// this consolidates did HTML-entity decoding; a caller that wants entities decoded does that itself, same
// as before this file existed — see officialness.mjs's stripTags for the one copy in this repo that does
// blank entities, and why it is a distinct primitive, not a candidate for this same body).
//
// Plain ESM, no imports, no I/O — both a .ts caller (via the `@/` alias, bundler resolution) and a plain
// `.mjs` script run under bare `node` (scripts/turns/run-ledger-consume.mjs, via a relative path, no jiti
// needed) can import this file unchanged.

/**
 * Strip HTML markup to plain, whitespace-collapsed text. PURE — no I/O.
 *
 * @param {string|null|undefined} html
 * @param {{maxChars?: number}} [opts] maxChars — when given, the returned text is sliced to this length
 *   (applied AFTER whitespace collapse + trim, so a caller gets exactly maxChars characters of real text,
 *   never a truncated tag or trailing run of collapsed whitespace).
 * @returns {string}
 */
export function htmlToText(html, opts = {}) {
  const { maxChars } = opts;
  const text = String(html ?? "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return typeof maxChars === "number" ? text.slice(0, maxChars) : text;
}
