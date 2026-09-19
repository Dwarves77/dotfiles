// EP-4-source-not-item: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-4-source-not-item',
    skill: 'environmental-policy-and-innovation',
    section: 'Integrity Rule — source is a portal, not an item',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A source (portal/registry/official site where legislation lives) is NOT an intelligence item; portals must not be ingested as items.',
    anchor: 'Source classification at every claim',
    enforcedBy: ['audit:fsi-app/scripts/verify/source-vs-item.mjs'],
    residual: 'Title-anchored heuristic over stored rows; ambiguous mixed pages can need human disposition (the 6-HOLD class).',
  };
