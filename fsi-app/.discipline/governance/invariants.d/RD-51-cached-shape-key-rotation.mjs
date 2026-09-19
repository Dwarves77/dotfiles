// RD-51-cached-shape-key-rotation: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-51-cached-shape-key-rotation',
    skill: 'remediation-discipline',
    section: 'Section 2 — Class-Over-Instance (a recurring process failure is prevented mechanically, not by an advisory header)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'The dashboard payload cache key (DASHBOARD_DATA_CACHE_KEY, co-located with the DashboardData interface) must equal "app-data-" + sha1[0:8] of the normalized interface block, and lib/data.ts must consume the constant rather than an inline literal. unstable_cache entries persist across deployments and serve stale-while-revalidate, so a payload shape change without a key rotation lets an old-shape entry reach code compiled against the new shape — PR #395 added recentChanges this way and crashed SSR of / (digest 2552218741, 2026-08-01). The key HAD been rotated correctly one PR earlier (#393): the discipline existed in memory and memory missed once, so the rotation is now mechanical.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'The Class-Over-Instance Principle',
    enforcedBy: ['rule:021'],
    residual: 'The hash covers the DashboardData interface text only; shape drift through nested types (Resource, Supersession, …) is not detected mechanically — nested additions must be optional fields, or the key rotates by hand (stated in the rule header and the constant comment).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
