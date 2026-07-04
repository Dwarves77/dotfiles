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

// A meaningful nomination span must be a real clause, not a coincidental fragment (mirrors floor-attribution).
export const MIN_NOMINATION_SPAN = 24;

/**
 * NOMINATE candidate spans for a slot from the pool text via word-overlap. Nomination ≠ decision — every
 * candidate is handed to the judge. Returns candidates best-overlap-first (may be empty). Pure.
 * @param {string} slotDescription  what the slot needs (e.g. "the headline compliance deadline")
 * @param {{ url: string, text: string }[]} pool
 * @param {string[]} proseSentences  the brief sentences that mention the slot topic (already topic-filtered)
 * @returns {Nomination[]}
 */
export function nominateForSlot(slotDescription, pool, proseSentences) {
  const want = new Set(String(slotDescription || "").toLowerCase().match(/[a-z]{4,}/g) || []);
  /** @type {{span:string,url:string,score:number}[]} */ const cands = [];
  for (const sent of proseSentences || []) {
    if (String(sent).trim().length < MIN_NOMINATION_SPAN) continue;
    const lc = String(sent).toLowerCase();
    // a nomination is only real if the sentence is VERBATIM present in some pool source (the judge will still
    // decide support) — word-overlap picks WHICH source, presence is the floor.
    const src = (pool || []).find((p) => String(p.text || "").toLowerCase().includes(lc.trim()));
    if (!src) continue;
    const topicHits = [...want].filter((w) => lc.includes(w)).length;
    cands.push({ span: String(sent).trim(), url: src.url, score: topicHits });
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

/**
 * Force coverage over the required slots the extractor left untagged. For each, nominate → JUDGE → decide.
 * Returns the claims to APPEND (FACT or GAP) plus the RELABEL routes (handled by the 4c path, no FACT here).
 * The judge is injected: async (slotKey, nomination, assertion) => JudgeVerdict.
 * @param {{ slotKey: string, description: string, proseSentences: string[], proseCovers: boolean }[]} uncoveredSlots
 * @param {{ url: string, text: string }[]} pool
 * @param {(slotKey: string, nomination: Nomination) => Promise<JudgeVerdict>} judge
 * @returns {Promise<{ facts: object[], gaps: object[], relabels: object[], audit: object[] }>}
 */
export async function forceSlotCoverage(uncoveredSlots, pool, judge) {
  const facts = [], gaps = [], relabels = [], audit = [];
  for (const slot of uncoveredSlots || []) {
    const noms = nominateForSlot(slot.description, pool, slot.proseSentences);
    const nomination = noms[0] || null;
    const judgeVerdict = nomination ? await judge(slot.slotKey, nomination) : null;
    const decision = decideSlotClaim({ slotKey: slot.slotKey, nomination, judgeVerdict, proseCovers: !!slot.proseCovers });
    audit.push({ slot: slot.slotKey, nominated: !!nomination, judge: judgeVerdict ? judgeVerdict.supports : null, decision: decision.kind, why: judgeVerdict?.why });
    if (decision.kind === "FACT") facts.push(decision);
    else if (decision.kind === "GAP") gaps.push(decision);
    else relabels.push(decision);
  }
  return { facts, gaps, relabels, audit };
}
