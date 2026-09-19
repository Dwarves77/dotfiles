// RD-25-paid-row-attribution: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-25-paid-row-attribution',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 18: Snapshot-first grounding (acquisition is locked by default)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A paid ledger row (agent_runs.cost_usd_estimated > 0) MUST carry an intelligence_item_id OR a source_id. A row that is both item- and source-anonymous is the July $65.36 attribution hole (recordSpendCall wrote neither source_id nor, by default, itemId). The spend chokepoint now writes both from the SpendTicket + warns on an attribution-blind paid row; the acquire-justification write carries the attribution.',
    anchor: 'A paid ledger row MUST carry an item id or a source id',
    enforcedBy: ['selftest:fsi-app/src/lib/sources/verify-item.test.mjs'],
    residual: 'I1. The acquire-path attribution is proven by verify-item.test.mjs (logAcquireJustification writes intelligence_item_id + source_id). The general spend-call attribution is the recordSpendCall code (writes source_id + item_id + warns when both null); a full data-invariant audit over agent_runs is the follow-on when the workflow rewire threads itemId+sourceId onto every ticket.',
  };
