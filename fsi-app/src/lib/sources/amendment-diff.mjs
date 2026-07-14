// @ts-check
// FETCH-ALIGN-DIFF ENGINE — the deterministic core (Wave-β B3, operator amendment 2 to the holdings
// audit, 2026-07-14). Given TWO captures of the same instrument (an old/incomplete one and a newer/fuller
// re-collection, or two temporal versions), it:
//   1. SEGMENTS each document into provisions by publisher shape (structural alignment).
//   2. ALIGNS provisions by a stable key (provision number) + a normalized content hash (span-match).
//   3. EXTRACTS the delta: unchanged / added / removed / changed (with a sentence-level change diff).
//   4. ROUTES the delta to timeline-event candidates (the pure transform; DB persistence is the caller's,
//      a write that rides the pass — kept OUT of this $0 deterministic core).
//
// Strategic frame (operator): the incomplete scraping-era corpus is this engine's test set — every
// re-collection heals the corpus AND exercises the amendment-tracking the customer buys. NO LLM, NO fetch:
// pure, node-testable, $0. Publisher-shape detection + clean-text extraction are reused from holdings-audit.

import { detectPublisherShape, extractCleanText } from "./holdings-audit.mjs";

/**
 * Per-shape provision splitters. Each returns the ordered list of provision boundaries as
 * { key, headingIndex } markers over the CLEAN text; the segmenter slices bodies between them.
 * The key is the alignment anchor (provision number). Conservative: a doc with no recognizable
 * provisions falls back to a single "whole" segment (still diffable by hash).
 */
const SHAPE_MARKERS = {
  "eur-lex": /\bArticle\s+(\d+[a-z]?)\b/gi,
  "legislation.gov.uk": /\b(?:Regulation|Section|Article|Paragraph)\s+(\d+[A-Z]?)\b/gi,
  "federal-register": /(?:§\s*(\d+\.\d+[a-z]?)|\bSec(?:tion|\.)\s+(\d+[a-z]?)\b)/gi,
  gazette: /\b(?:Article|Art\.|Art[íi]culo|Articolo|Section|Paragraph|§)\s+(\d+[a-z]?)\b/gi,
  other: /\b(?:Article|Section|Paragraph|Clause|Rule)\s+(\d+[a-z]?)\b/gi,
};

/** PURE. Normalized content hash for span-match: lowercased, whitespace-collapsed, punctuation-trimmed.
 *  A cheap deterministic FNV-1a over the normalized text (no crypto import needed). @param {string} s */
export function normHash(s) {
  const norm = String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\w ]+/g, "").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) { h ^= norm.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * PURE. Segment a document into provisions by publisher shape. Returns ordered
 * [{ key, body, hash }]; when no markers match, one { key:"whole", body, hash } segment.
 * The clean text is derived here so markup can't hide a boundary.
 * @param {string} text  raw or clean document text
 * @param {string} shape publisher shape (detectPublisherShape)
 * @returns {Array<{ key: string, body: string, hash: string }>}
 */
export function segmentByShape(text, shape) {
  const clean = extractCleanText(text);
  if (!clean) return [];
  const re = SHAPE_MARKERS[shape] || SHAPE_MARKERS.other;
  re.lastIndex = 0;
  const marks = [];
  for (let m; (m = re.exec(clean)); ) {
    const num = m[1] || m[2] || "";
    marks.push({ key: `${provisionLabel(shape)} ${num}`.trim(), at: m.index });
  }
  if (!marks.length) return [{ key: "whole", body: clean, hash: normHash(clean) }];
  const segs = [];
  // Preamble before the first marker (recitals/citation) is its own segment when substantial.
  if (marks[0].at > 40) {
    const pre = clean.slice(0, marks[0].at).trim();
    if (pre) segs.push({ key: "preamble", body: pre, hash: normHash(pre) });
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].at;
    const end = i + 1 < marks.length ? marks[i + 1].at : clean.length;
    const body = clean.slice(start, end).trim();
    // Collapse duplicate keys (a TOC "Article 5" + the enacting "Article 5") by keeping the LONGER body.
    const existing = segs.find((s) => s.key === marks[i].key);
    if (existing) { if (body.length > existing.body.length) { existing.body = body; existing.hash = normHash(body); } }
    else segs.push({ key: marks[i].key, body, hash: normHash(body) });
  }
  return segs;
}

function provisionLabel(shape) {
  if (shape === "legislation.gov.uk") return "Section";
  if (shape === "federal-register") return "Sec.";
  return "Article";
}

/**
 * PURE. Sentence-level change diff between two provision bodies (deterministic set difference). Returns the
 * sentences added in `next` and removed from `prev`. Cheap and stable — not an LCS, so a moved sentence
 * shows as remove+add; adequate for a $0 delta preview (the customer-facing prose amendment is pipeline work).
 * @param {string} prevBody @param {string} nextBody
 */
export function segmentTextDiff(prevBody, nextBody) {
  const sents = (s) => String(s || "").split(/(?<=[.;:])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 3);
  const pv = new Map(sents(prevBody).map((s) => [normHash(s), s]));
  const nx = new Map(sents(nextBody).map((s) => [normHash(s), s]));
  const added = [...nx].filter(([h]) => !pv.has(h)).map(([, s]) => s);
  const removed = [...pv].filter(([h]) => !nx.has(h)).map(([, s]) => s);
  return { added, removed };
}

/**
 * PURE. Align two provision lists by key + hash. unchanged = same key, same hash; changed = same key,
 * different hash (carries the sentence diff); added = key only in next; removed = key only in prev.
 * @param {Array<{key:string,body:string,hash:string}>} prev
 * @param {Array<{key:string,body:string,hash:string}>} next
 */
export function alignSegments(prev, next) {
  const pv = new Map(prev.map((s) => [s.key, s]));
  const nx = new Map(next.map((s) => [s.key, s]));
  const unchanged = [], changed = [], added = [], removed = [];
  for (const [key, ns] of nx) {
    const ps = pv.get(key);
    if (!ps) { added.push({ key, body: ns.body }); continue; }
    if (ps.hash === ns.hash) unchanged.push({ key });
    else changed.push({ key, prev: ps.body, next: ns.body, diff: segmentTextDiff(ps.body, ns.body) });
  }
  for (const [key, ps] of pv) if (!nx.has(key)) removed.push({ key, body: ps.body });
  return { unchanged, changed, added, removed };
}

/**
 * PURE. Full document diff: detect shape (from a url when given, else 'other'), segment both, align.
 * @param {string} prevText @param {string} nextText
 * @param {{ url?: string, shape?: string }} [opts]
 */
export function diffDocuments(prevText, nextText, opts = {}) {
  const shape = opts.shape || detectPublisherShape(opts.url);
  const prev = segmentByShape(prevText, shape);
  const next = segmentByShape(nextText, shape);
  const align = alignSegments(prev, next);
  return {
    shape,
    counts: { prev_provisions: prev.length, next_provisions: next.length,
      unchanged: align.unchanged.length, changed: align.changed.length, added: align.added.length, removed: align.removed.length },
    ...align,
  };
}

/**
 * PURE. Route a diff to timeline-event CANDIDATES (kind + provision + label). The transform only — the
 * caller persists (a write that rides the pass; item_timelines is milestone-shaped {item_id, milestone_date,
 * label, sort_order}, so the caller supplies the date and maps `label`). No DB access here ($0 core).
 * @param {ReturnType<typeof diffDocuments>} diff
 * @param {{ milestoneDate?: string }} [opts]
 * @returns {Array<{ kind:'added'|'changed'|'removed', provision:string, label:string, milestone_date: string|null }>}
 */
export function toTimelineEvents(diff, opts = {}) {
  const date = opts.milestoneDate || null;
  const events = [];
  for (const a of diff.added) events.push({ kind: "added", provision: a.key, label: `${a.key} added`, milestone_date: date });
  for (const c of diff.changed) events.push({ kind: "changed", provision: c.key, label: `${c.key} amended`, milestone_date: date });
  for (const r of diff.removed) events.push({ kind: "removed", provision: r.key, label: `${r.key} removed`, milestone_date: date });
  return events;
}
