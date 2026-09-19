// AC-3-per-format-design-before-scale: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'AC-3-per-format-design-before-scale',
    skill: 'analysis-construction-spec',
    section: 'Status note',
    text: 'Until a real exemplar per format runs end-to-end, each non-regulatory format is hypothesis, not contract; never batch-generate a format at scale before its per-format design is validated on a sample.',
    anchor: 'until the first real exemplar per format runs end to end',
    exempt: {
      reason: 'Process discipline (operator-gated per-format design conversation before scale runs); not a code/data invariant. Carried by feedback memory + this skill.',
    },
  };
