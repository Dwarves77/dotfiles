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
/** @typedef {{ kind: "FACT"|"GAP"|"RELABEL", slot_key: string, source_span?: string, source_url?: string, reason: string }} SlotClaim */

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

/** Max judged nominations per slot (moat binding: bounded judge calls; K stated in the pre-run log). */
export const MAX_JUDGED_NOMINATIONS = 3;

/**
 * Force coverage over the required slots the extractor left untagged. For each slot, judge the TOP-K nominated
 * spans (K <= MAX_JUDGED_NOMINATIONS) — the FIRST judge-confirmed span becomes the FACT; if NONE of the top-K
 * confirm, the slot routes to an honest GAP (genuinely absent) or a 4c RELABEL candidate (prose covers it but
 * no span is judge-supported). A FACT is NEVER emitted without a judge confirmation. The judge is injected
 * (a live spend-client call in prod, a mock in the selftest) and defaults to NOT CONFIRMED under uncertainty.
 * @param {{ slotKey: string, description: string, proseSentences: string[], proseCovers: boolean }[]} uncoveredSlots
 * @param {{ url: string, text: string }[]} pool
 * @param {(slotKey: string, nomination: Nomination) => Promise<JudgeVerdict>} judge
 * @param {number} [k]  top-K nominations to judge per slot (default MAX_JUDGED_NOMINATIONS, capped at it)
 * @returns {Promise<{ facts: SlotClaim[], gaps: SlotClaim[], relabels: SlotClaim[], audit: object[], judgeCalls: number }>}
 */
export async function forceSlotCoverage(uncoveredSlots, pool, judge, k = MAX_JUDGED_NOMINATIONS) {
  const K = Math.max(1, Math.min(k, MAX_JUDGED_NOMINATIONS));
  /** @type {SlotClaim[]} */ const facts = []; /** @type {SlotClaim[]} */ const gaps = []; /** @type {SlotClaim[]} */ const relabels = []; const audit = [];
  let judgeCalls = 0;
  for (const slot of uncoveredSlots || []) {
    const noms = nominateForSlot(slot.description, pool, slot.proseSentences).slice(0, K);
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
