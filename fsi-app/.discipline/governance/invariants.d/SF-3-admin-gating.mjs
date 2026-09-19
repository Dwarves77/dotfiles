// SF-3-admin-gating: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SF-3-admin-gating',
    skill: 'sprint-followups-discipline',
    section: 'Post-slim engine state (F2)',
    text: 'Every admin API route calls isPlatformAdmin (admin role gate).',
    anchor: 'F2 (admin-routes-isPlatformAdmin)',
    enforcedBy: ['fitness:F2'],
  };
