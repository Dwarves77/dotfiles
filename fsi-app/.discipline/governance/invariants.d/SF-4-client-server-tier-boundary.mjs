// SF-4-client-server-tier-boundary: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SF-4-client-server-tier-boundary',
    skill: 'sprint-followups-discipline',
    section: 'Post-slim engine state (F8)',
    text: 'Client code does not assign body.tier / body.base_tier / body.effective_tier near a fetch/POST (server owns tier).',
    anchor: 'F8 (client-server tier boundary)',
    enforcedBy: ['fitness:F8'],
  };
