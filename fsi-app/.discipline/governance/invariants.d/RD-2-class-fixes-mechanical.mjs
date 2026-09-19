// RD-2-class-fixes-mechanical: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-2-class-fixes-mechanical',
    skill: 'remediation-discipline',
    section: 'Section 3 Signal 5',
    text: 'A preservation/architectural argument is encoded as a fitness function (or equivalent mechanical check) in the SAME dispatch that surfaces it — not left as a docstring.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'encode the preservation argument as a fitness function',
    exempt: {
      reason: 'A meta-rule about HOW remediations are scoped (encode-don\'t-document); it governs agent behavior at dispatch time, not a checkable property of a committed file. This very build is its application (rule 019 + F-layer). No standing mechanical signal.',
    },
  };
