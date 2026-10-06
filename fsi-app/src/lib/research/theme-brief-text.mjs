// theme-brief-text.mjs: the ONE render-time pass over a theme brief written BEFORE the structured-sections
// contract (migration 351), lane P3 (2026-10-05). PURE, no DB, no LLM.
//
// WHY. Every theme brief stored today predates the contract (read-only count 2026-10-05: 9 briefs, none with
// `sections`). The generator of that era wrote its own working numbers and raw tag slugs into the prose:
// a bold stats header ("68 members, four surfaces, 409 grounded intra-theme connections, density 0.180"),
// "(dominant signal weight 104.2)", "scores 0.986" and bare 0.895 / 0.762 scores, and tag slugs such as
// emissions-reporting-Scope3 and freight-forwarder. A customer reads none of those. The card beside the text
// already states the live member count and pages once, from the live theme row.
//
// WHAT IT CHANGES, and nothing else. Exactly these patterns:
//   A. the generator's stats header: a whole line that is one bold span starting "<N> member(s)" and
//      containing "density <number>" (it restates member count, pages, connection count and density, all of
//      which the live card shows or which are working numbers). The whole line is removed.
//   B. "dominant signal weight <number>", with its surrounding parentheses when that is all they hold.
//   C. "scores <d.ddd>" and any bare three-decimal number in [0,1] (the generator's score precision).
//      Whole numbers, percentages and other decimals are untouched.
//   D. "density <number>" as a phrase (with its parentheses when that is all they hold).
//   E. slugs: a hyphenated token that is a KEY of the existing tag label tables (tag-labels.mjs, the one
//      label source) is replaced by its human label, case-insensitively. Unknown hyphenated words
//      (same-source, intra-theme, dates) and single-word tag names (shipper, drayage) are never touched.
// After the removals, stranded separators and doubled spaces left by a removal are tidied; no sentence is
// rewritten. A brief written under the contract (it has `sections`) is never passed through this: the caller
// decides, and renders such a brief as written. Pre-contract briefs are re-authored at population.

import { SCENARIO_LABELS, COMPLIANCE_OBJECT_LABELS } from "../connections/tag-labels.mjs";

// Hyphenated keys only: a single-word key is ordinary prose and is never rewritten.
const SLUG_LABELS = new Map(
  [...Object.entries(SCENARIO_LABELS), ...Object.entries(COMPLIANCE_OBJECT_LABELS)].filter(([k]) => k.includes("-")),
);

const NUM = String.raw`\d+(?:\.\d+)?`;
// A. whole-line stats header.
const STATS_HEADER_RE = new RegExp(String.raw`^[ \t]*\*\*\d+ members?\b[^\n]*?density ${NUM}\*\*[ \t]*\r?\n?`, "gim");
// B. dominant signal weight, optionally the only content of a parenthesis.
const WEIGHT_PAREN_RE = new RegExp(String.raw`[ \t]*\(\s*dominant signal weight ${NUM}\s*\)`, "gi");
const WEIGHT_RE = new RegExp(String.raw`[ \t]*dominant signal weight ${NUM}`, "gi");
// D. density phrase, optionally the only content of a parenthesis.
const DENSITY_PAREN_RE = new RegExp(String.raw`[ \t]*\(\s*density ${NUM}\s*\)`, "gi");
const DENSITY_RE = new RegExp(String.raw`[ \t]*density ${NUM}`, "gi");
// C. scores token, then bare three-decimal numbers in [0,1].
const SCORES_RE = /[ \t]+scores[ \t]+[01]\.\d{3}\b/gi;
const BARE_SCORE_RE = /(?<![\d.])[01]\.\d{3}(?!\d|\.\d|%)/g;

function replaceSlugs(text) {
  return text.replace(/(?<![A-Za-z0-9-])[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+(?![A-Za-z0-9-])/g, (tok) => SLUG_LABELS.get(tok.toLowerCase()) ?? tok);
}

function tidy(text) {
  return text
    .replace(/[ \t]+([,.;:)])/g, "$1") // a removal left a space before punctuation
    .replace(/\(\s*\)/g, "") // a parenthesis emptied by a removal
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Clean a pre-contract theme brief's text for customers. Returns the input unchanged when it carries none
 * of the patterns above. @param {unknown} md @returns {string}
 */
export function cleanPreContractBriefText(md) {
  if (typeof md !== "string") return "";
  if (!md) return md;
  let t = md.replace(STATS_HEADER_RE, "");
  t = t.replace(WEIGHT_PAREN_RE, "").replace(WEIGHT_RE, "");
  t = t.replace(DENSITY_PAREN_RE, "").replace(DENSITY_RE, "");
  t = t.replace(SCORES_RE, "").replace(BARE_SCORE_RE, "");
  t = replaceSlugs(t);
  return t === md ? md : tidy(t).trim();
}
