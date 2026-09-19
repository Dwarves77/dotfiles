// RD-1-classify-before-discard: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.
//
  // ───────────────────────────── remediation-discipline ─────────────────────────────
  

export const invariant = {
    id: 'RD-1-classify-before-discard',
    skill: 'remediation-discipline',
    section: 'Section 2 / Section 4 (sweep + classify)',
    text: 'Classify before delete/archive; no archive over an undiagnosed bucket; archives are reversible (prior-value snapshot) and skill-cited.',
    anchor: 'class-over-instance',
    enforcedBy: ['rule:015', 'rule:019'],
    residual: 'rule 015 forces archive/delete through the guarded path (snapshot + cite); rule 019 forces source-archives through reclassifyToSource. "Undiagnosed bucket" judgment (was the diagnosis right?) is not mechanized.',
  };
