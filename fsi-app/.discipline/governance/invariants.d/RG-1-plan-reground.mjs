// RG-1-plan-reground: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RG-1-plan-reground',
    skill: 'remediation-discipline',
    section: 'Plan re-grounding (re-read the code before each phase, mechanically)',
    text: 'A multi-phase program re-grounds each phase against the actual code before that phase executes: the governing program doc (docs/program/GOVERNING-PROGRAM.md) declares per-phase the concrete code-dependencies (anchors) the phase plan rests on, and a mechanical gate fails the build when the ACTIVE phase\'s anchors no longer match the code a prior phase changed. The next phase does not proceed on a stale plan.',
    anchor: 'Plan re-grounding (re-read the code before each phase, mechanically)',
    enforcedBy: ['consistency:C5'],
    residual: 'C5 verifies the ACTIVE phase\'s declared present/absent substrings against the real files; a plan-vs-code contradiction surfaces as named drift. It cannot judge whether the rest of the phase plan is sound — the anchors are the operator-declared load-bearing dependencies, and choosing good anchors is the planning judgment C5 makes checkable. Only the ACTIVE phase is checked (between-phase state is ACTIVE_PHASE: none, a no-op).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
