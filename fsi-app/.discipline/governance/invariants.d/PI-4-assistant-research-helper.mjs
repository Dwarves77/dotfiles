// PI-4-assistant-research-helper: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'PI-4-assistant-research-helper',
    skill: 'caros-ledge-platform-intent',
    section: 'Why this skill exists',
    text: 'The Intelligence Assistant is a research helper, NOT a synthesis/decision engine.',
    anchor: 'RESEARCH HELPER, not a synthesis',
    exempt: {
      reason: 'Architectural-intent axiom (what NOT to build); not a mechanical row/file invariant. Carried by the skill; violations are scoping decisions caught at design review.',
    },
  };
