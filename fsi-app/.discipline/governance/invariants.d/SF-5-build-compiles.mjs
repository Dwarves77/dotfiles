// SF-5-build-compiles: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SF-5-build-compiles',
    skill: 'sprint-followups-discipline',
    section: 'Post-slim engine state (F9)',
    text: 'tsc --noEmit must pass (no shipped type/build break).',
    anchor: 'F9 (build compiles)',
    enforcedBy: ['fitness:F9'],
  };
