// SC-1-syndication-math: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.
//
  // ───────────────────────────── source-credibility-model ─────────────────────────────
  

export const invariant = {
    id: 'SC-1-syndication-math',
    skill: 'source-credibility-model',
    section: 'Section 4: Citation Network Semantics',
    text: 'Syndicated republications collapse to ONE corroboration; the honest independent-citer count ≤ naive; trust_score_citation moves 0→>0 only on real corroboration.',
    anchor: 'Citation Network Semantics',
    enforcedBy: ['fitness:F10', 'selftest:fsi-app/src/lib/sources/source-growth.selftest.mjs'],
  };
