// RD-35-flow-golden-mandate: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-35-flow-golden-mandate',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 21: Caller-count is not wiring verification',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A capability having a test (or callers) does not prove it is wired into the flow that should use it (seek-more had zero live callers while a title-only shadow ran live). Critical-path ladders are verified by behavioral end-to-end goldens: input a failing item, assert each intended rung fires (discovery included), driving the REAL mechanism not a mock. A flow named in doctrine without such a golden is a gap.',
    anchor: 'Critical-path ladders are verified by behavioral end-to-end goldens',
    enforcedBy: ['selftest:fsi-app/src/lib/sources/reground-ladder.golden.test.mjs'],
    residual: 'reground-ladder.golden.test.mjs is the first behavioral flow-golden (Unit 1 exit test): it drives fetchPrimaryWithFallback with the REAL generateCandidates as discovery and asserts each rung fires on a failing item — not a caller-count, not a mock. NAMED RESIDUAL: the meta-gate extension that fails CI on any flow NAMED in doctrine lacking a behavioral golden (the flow-claim scanner, sibling of doctrine-contradiction.mjs) is the enforcement to complete; the WIRING TRUTH SWEEP defines the golden backlog. Until it lands the mandate is carried by this invariant + the register.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
