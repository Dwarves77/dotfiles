// SC-12-slot-forcing-genuine-support: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-12-slot-forcing-genuine-support',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier — slot-forcing genuine-support (never fabricate a FACT to clear a criterion)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'Slot-forcing closes a required-slot / unlabeled-binding-assertion gap by tagging a FACT with slot_key WHERE the prose covers the slot, or emitting the mandated honest GAP where it does not; a FACT is emitted ONLY where the grounding JUDGE confirms the span supports the assertion (word-overlap NOMINATES candidates, it never decides); a judge-failed assertion routes to the 4c label path or an honest GAP and MUST NOT become a FACT — a FACT is never emitted to clear a criterion.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Slot-forcing genuine-support (never fabricate a FACT to clear a criterion)',
    enforcedBy: ['selftest:fsi-app/src/lib/agent/slot-forcing.test.mjs'],
    residual: 'The selftest proves the PURE decision red-then-green: an unsupported assertion (judge.supports=false) NEVER becomes a FACT (routes to RELABEL where prose covers it, honest GAP where absent); a judge-confirmed span becomes a slot_key-tagged FACT with its verbatim span; nominateForSlot only nominates pool-present clauses over MIN_NOMINATION_SPAN, best-topic-overlap first. This is the integrity rule (no invented facts) mechanized for slot coverage. The WIRING (groundBrief invokes forceSlotCoverage with a LIVE judge = a spend-client call over the item pool, appends the FACT/GAP claims, routes RELABELs to the 4c prose path) is the proof-sample integration — the judge decisions are quoted in the genuine-support audit. Slot-forcing unit, 2026-07-04.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
