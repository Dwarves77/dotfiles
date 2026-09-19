// PI-2-regulations-only-on-regulations: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'PI-2-regulations-only-on-regulations',
    skill: 'caros-ledge-platform-intent',
    section: 'REGULATIONS / source-category mapping',
    text: 'Regulation-family items surface only on Regulations; non-reg item types route to their own surface (no taxonomy bleed).',
    anchor: 'The four intelligence pages map to the source-category taxonomy',
    enforcedBy: ['audit:fsi-app/scripts/verify/routing.mjs'],
    residual: 'routing.mjs flags item_type↔surface drift over stored data; cross-surface item_type MOVES remain operator-authorized.',
  };
