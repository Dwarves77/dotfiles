// @ts-check
// SLOT-FORCING (item 5b, operator ruling 2026-07-04). A grounding-side step that closes required-slot and
// unlabeled-binding-assertion gaps WITHOUT fabricating. For each required slot (or binding-verb section) that
// the extractor left with no slot_key-tagged FACT/GAP claim, it either tags a genuinely-grounded FACT or
// emits the mandated honest GAP.
//
// GENUINE-SUPPORT BINDING (the load-bearing rule): a FACT is emitted ONLY where the grounding JUDGE confirms
// the span supports the assertion. Word-overlap NOMINATES candidates; it NEVER decides. A judge-failed
// assertion routes to the 4c label path (relabel to grounded ANALYSIS in prose) or an honest GAP — a FACT is
// NEVER emitted to clear a criterion. Pure decision logic here (the judge is INJECTED — a live spend-client
// call in production, a mock in the selftest), so the never-fabricate property is red-then-green unit-tested.

/** @typedef {{ span: string, url: string }} Nomination  — a word-overlap candidate, NOT a decision. */
/** @typedef {{ supports: boolean, why?: string }} JudgeVerdict — the grounding judge's per-assertion call. */
/** @typedef {{ url: string, text: string, tier?: number|null }} PoolSource — a fetched pool source + its tier. */
/** @typedef {{ kind: "FACT"|"GAP"|"RELABEL", slot_key: string, source_span?: string, source_url?: string, reason: string }} SlotClaim */

// A meaningful nomination span must be a real clause, not a coincidental fragment (mirrors floor-attribution).
export const MIN_NOMINATION_SPAN = 24;
// An atomic FACT span is a single clause, not an unsplit block; skip clauses beyond this (a delimiter was
// missing) so nominations stay clause-sized and the judge sees one assertion at a time.
const MAX_NOMINATION_SPAN = 1000;

// Clause delimiters in enacted/source text: real newlines, sentence punctuation, AND the HTML whitespace
// ENTITIES that legislation.gov.uk (and similar) leave UN-decoded in the fetched text — `&#xD;` / `&#xA;` /
// `&#x9;` (hex, with optional leading zeros) and `&#13;` / `&#10;` / `&#9;` (decimal). Splitting ON these
// entities keeps every produced clause a VERBATIM substring of the source (the delimiter sits at the boundary
// and is removed; trimming removes only outer whitespace). NOT a broad `&#\w+;` — that would eat apostrophe /
// dash entities mid-word and shatter clauses.
const CLAUSE_DELIM = /(?:&#x0*(?:d|a|9);)|(?:&#0*(?:13|10|9);)|[\r\n]+|(?<=[.!?;:])\s+/gi;

/** Split source text into candidate clauses (verbatim substrings, trimmed). Pure. @param {string} text @returns {string[]} */
function splitClauses(text) {
  return String(text || "").split(CLAUSE_DELIM).map((c) => (c || "").trim()).filter(Boolean);
}

/**
 * NOMINATE candidate spans for a slot DIRECTLY from the POOL SOURCE text via word-overlap (the 5c nomination
 * fix). Splits each pool source into clauses and scores them by topic-word overlap with the slot description +
 * key; returns candidates best-overlap-first (may be empty). Every returned span is a VERBATIM substring of a
 * pool source BY CONSTRUCTION — so a judge-confirmed span is genuinely groundable (the old prose-nomination
 * drew from synthesised brief prose, which is paraphrase and never verbatim in the pool → zero nominations on
 * real items). FLOOR-FIRST is the CALLER's contract: pass the floor-qualifying pool for a FACT, so a confirmed
 * span grounds AT the floor. Nomination ≠ decision — every candidate is handed to the judge. Pure.
 * @param {string} slotDescription  what the slot needs (e.g. "the jurisdictional scope the Order applies to")
 * @param {PoolSource[]} pool        floor-first: the caller passes the FLOOR pool for a FACT
 * @param {string} [slotKey]         the slot key, folded into the topic vocabulary
 * @returns {Nomination[]}
 */
export function nominateForSlot(slotDescription, pool, slotKey = "") {
  const want = new Set(`${slotDescription || ""} ${slotKey}`.toLowerCase().match(/[a-z]{4,}/g) || []);
  /** @type {{span:string,url:string,score:number}[]} */ const cands = [];
  const seen = new Set();
  for (const src of pool || []) {
    for (const clause of splitClauses(src.text)) {
      if (clause.length < MIN_NOMINATION_SPAN || clause.length > MAX_NOMINATION_SPAN) continue;
      const lc = clause.toLowerCase();
      const topicHits = [...want].filter((w) => lc.includes(w)).length;
      if (topicHits === 0) continue;             // must share at least one topic word with the slot
      const key = `${src.url}\u0000${clause}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cands.push({ span: clause, url: src.url, score: topicHits });
    }
  }
  return cands.sort((a, b) => b.score - a.score).map(({ span, url }) => ({ span, url }));
}

/**
 * DECIDE one uncovered slot's claim from the judge's verdict on the best nomination. The ONLY path to a FACT
 * is judgeVerdict.supports === true on a real nomination. Pure.
 * @param {{ slotKey: string, nomination: Nomination|null, judgeVerdict: JudgeVerdict|null, proseCovers: boolean }} a
 * @returns {{ kind: "FACT"|"GAP"|"RELABEL", slot_key: string, source_span?: string, source_url?: string, reason: string }}
 */
export function decideSlotClaim({ slotKey, nomination, judgeVerdict, proseCovers }) {
  if (nomination && judgeVerdict && judgeVerdict.supports === true) {
    return { kind: "FACT", slot_key: slotKey, source_span: nomination.span, source_url: nomination.url, reason: "judge-confirmed span supports the assertion" };
  }
  // NEVER a FACT without judge confirmation.
  if (!proseCovers) {
    return { kind: "GAP", slot_key: slotKey, reason: "slot genuinely not covered in prose/pool — honest GAP" };
  }
  return { kind: "RELABEL", slot_key: slotKey, reason: "prose covers it but the span is not judge-supported as a binding FACT — route to 4c label (grounded analysis), NOT a forced FACT" };
}

/** Max judged nominations per slot (moat binding: bounded judge calls; K stated in the pre-run log). */
export const MAX_JUDGED_NOMINATIONS = 3;

/**
 * Force coverage over the required slots the extractor left untagged. For each slot, nominate VERBATIM spans
 * from the (floor-first) POOL and judge the TOP-K (K <= MAX_JUDGED_NOMINATIONS) — the FIRST judge-confirmed
 * span becomes the FACT (grounded at the floor by construction); if NONE of the top-K confirm, the slot routes
 * to an honest GAP (genuinely absent) or a 4c RELABEL candidate (prose covers it but no span is judge-
 * supported). A FACT is NEVER emitted without a judge confirmation. The judge is injected (a live spend-client
 * call in prod, a mock in the selftest) and defaults to NOT CONFIRMED under uncertainty.
 * @param {{ slotKey: string, description: string, proseCovers: boolean }[]} uncoveredSlots
 * @param {PoolSource[]} pool  floor-first: the FLOOR pool for a FACT (empty for exempt/absent floor → no FACT)
 * @param {(slotKey: string, nomination: Nomination) => Promise<JudgeVerdict>} judge
 * @param {number} [k]  top-K nominations to judge per slot (default MAX_JUDGED_NOMINATIONS, capped at it)
 * @returns {Promise<{ facts: SlotClaim[], gaps: SlotClaim[], relabels: SlotClaim[], audit: object[], judgeCalls: number }>}
 */
export async function forceSlotCoverage(uncoveredSlots, pool, judge, k = MAX_JUDGED_NOMINATIONS) {
  const K = Math.max(1, Math.min(k, MAX_JUDGED_NOMINATIONS));
  /** @type {SlotClaim[]} */ const facts = []; /** @type {SlotClaim[]} */ const gaps = []; /** @type {SlotClaim[]} */ const relabels = []; const audit = [];
  let judgeCalls = 0;
  for (const slot of uncoveredSlots || []) {
    const noms = nominateForSlot(slot.description, pool, slot.slotKey).slice(0, K);
    let confirmed = null, lastVerdict = null;
    for (const nom of noms) {
      lastVerdict = await judge(slot.slotKey, nom); judgeCalls += 1;
      if (lastVerdict && lastVerdict.supports === true) { confirmed = nom; break; } // first confirm wins
    }
    const decision = decideSlotClaim({
      slotKey: slot.slotKey,
      nomination: confirmed,
      judgeVerdict: confirmed ? { supports: true } : (lastVerdict || null),
      proseCovers: !!slot.proseCovers,
    });
    audit.push({ slot: slot.slotKey, nominated: noms.length, judgedTopK: noms.length, judgeConfirmed: !!confirmed, decision: decision.kind, why: (confirmed ? "judge-confirmed" : lastVerdict?.why) });
    if (decision.kind === "FACT") facts.push(decision);
    else if (decision.kind === "GAP") gaps.push(decision);
    else relabels.push(decision);
  }
  return { facts, gaps, relabels, audit, judgeCalls };
}
