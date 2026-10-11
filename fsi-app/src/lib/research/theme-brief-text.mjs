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
