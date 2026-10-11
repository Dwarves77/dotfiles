import { buildSubjectRef } from "./flag-namespaces.mjs";

const PER_TOKEN_ITEM_CAP = 6; // caps pairs-per-token at C(6,2)=15; matches discover.mjs's PER_TAG_CAP posture

// Regulation-identifier pattern: "(EU) 2023/1805", "2014/94/EU", "2019/1242", bare "No 1272/2008".
// Deliberately conservative (4-digit year / number, optional /EU or /EC suffix) — a false negative
// (missing a real identifier) is safe here; a false positive would propose a noisy candidate for
// operator review, so the pattern stays narrow rather than permissive.
const REG_ID_RE = /\b(\d{4}\/\d{2,5})(?:\/(?:EU|EC|EEC))?\b/g;

// Capitalized multi-word phrase: 2+ consecutive Capitalized words (a rough named-entity/programme
// proxy). Generic sentence-leading words are excluded via the stoplist below so "The New Rules" does
// not manufacture a candidate on "The New".
const CAP_PHRASE_RE = /\b(?:[A-Z][a-zA-Z0-9]*(?:-[A-Z][a-zA-Z0-9]*)?\s+){1,4}[A-Z][a-zA-Z0-9]*\b/g;
const STOP_LEADING = new Set(["The", "This", "That", "A", "An", "New", "Draft", "Final", "Proposed", "Updated"]);

function extractRegulationIdentifiers(text) {
  const out = new Set();
  for (const m of String(text || "").matchAll(REG_ID_RE)) out.add(m[1]);
  return [...out];
}

function extractCapitalizedPhrases(text) {
  const out = new Set();
  for (const m of String(text || "").matchAll(CAP_PHRASE_RE)) {
    const words = m[0].trim().split(/\s+/);
    if (words.length < 2) continue; // single capitalized word alone is too generic
    while (words.length > 1 && STOP_LEADING.has(words[0])) words.shift();
    if (words.length < 2) continue;
    out.add(words.join(" "));
  }
  return out;
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Build "a|b" (sorted) -> true for every pair that already has a stored edge (any origin) — signal
 * candidates only propose pairs discovery has NOT already connected.
 * @param {Array<{source_item_id:string,target_item_id:string}>} edgeRows
 */
export function buildExistingPairSet(edgeRows) {
  const set = new Set();
  for (const e of Array.isArray(edgeRows) ? edgeRows : []) {
    if (e && typeof e.source_item_id === "string" && typeof e.target_item_id === "string") {
      set.add(pairKey(e.source_item_id, e.target_item_id));
    }
  }
  return set;
}

function indexByToken(items, extractor) {
  const idx = new Map(); // token -> Set<itemId>
  for (const it of items) {
    if (!it || typeof it.id !== "string") continue;
    for (const token of extractor(it.title)) {
      if (!idx.has(token)) idx.set(token, new Set());
      idx.get(token).add(it.id);
    }
  }
  return idx;
}

function candidatesFromIndex(idx, signalKind, existingPairs) {
  const out = [];
  for (const token of [...idx.keys()].sort()) {
    const ids = [...idx.get(token)].sort().slice(0, PER_TOKEN_ITEM_CAP);
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]];
        if (existingPairs.has(pairKey(a, b))) continue; // already discovered by an existing signal
        out.push({ itemA: a, itemB: b, signalKind, value: token });
      }
    }
  }
  return out;
}

/**
 * Detect connection-signal candidates from item titles that discovery's current basis set does not
 * read. PURE — takes the already-loaded corpus + edge set (no new query).
 * @param {Array<{id:string, title?:string}>} items
 * @param {Array<{source_item_id:string,target_item_id:string}>} edgeRows - the SAME edge rows the
 *   caller already loaded (any origin); used only to exclude already-connected pairs.
 * @returns {Array<{
 *   itemA:string, itemB:string, signalKind:'shared_regulation_identifier'|'shared_title_entity',
 *   value:string, subject_ref:string, description:string,
 * }>}
 */
export function detectSignalCandidates(items, edgeRows) {
  const list = (Array.isArray(items) ? items : []).filter((it) => it && typeof it.id === "string");
  const existingPairs = buildExistingPairSet(edgeRows);

  const regIdx = indexByToken(list, extractRegulationIdentifiers);
  const entityIdx = indexByToken(list, extractCapitalizedPhrases);

  const raw = [
    ...candidatesFromIndex(regIdx, "shared_regulation_identifier", existingPairs),
    ...candidatesFromIndex(entityIdx, "shared_title_entity", existingPairs),
  ];

  const out = raw.map((c) => ({
    ...c,
    subject_ref: buildSubjectRef(c.itemA, c.itemB, c.signalKind, c.value),
    description:
      c.signalKind === "shared_regulation_identifier"
        ? `Items ${c.itemA} and ${c.itemB} both name regulation identifier "${c.value}" in their titles, but carry no discovery edge (discover.mjs's basis set does not read raw title text). Operator review only — never auto-adopted.`
        : `Items ${c.itemA} and ${c.itemB} both name "${c.value}" in their titles, but carry no discovery edge (discover.mjs's basis set does not read raw title text). Operator review only — never auto-adopted.`,
  }));

  out.sort((x, y) => (x.subject_ref < y.subject_ref ? -1 : x.subject_ref > y.subject_ref ? 1 : 0));
  return out;
}

export { extractRegulationIdentifiers, extractCapitalizedPhrases };
