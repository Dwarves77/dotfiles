// PI-3-community-coequal: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'PI-3-community-coequal',
    skill: 'caros-ledge-platform-intent',
    section: 'Why this skill exists',
    text: 'Community is a CORE customer-facing surface, co-equal with the four intelligence pages — not onboarding, not a sub-feature.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Community is a CORE customer-facing surface',
    exempt: {
      reason: 'Product-scoping axiom about how Community is treated in design/dispatch; not a code/data row invariant. Carried by the skill; violations surface as design-review/dispatch-scope flags.',
    },
  };
