// SC-14-standard-own-body-floor: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-14-standard-own-body-floor',
    skill: 'source-credibility-model',
    section: 'Per-item-type authority floor — the standard floor is the authoring body, scoped by institution',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'For item_type=standard the authority floor is the standards-body tier (T4), SCOPED to the item\'s OWN authoring body: a FACT whose source shares the item\'s own-source institution_id grounds at T4, every other host stays at the reg-family floor T2. A same-tier UNRELATED host is NOT the standard\'s primary and is never promoted. Enforced by validate_item_provenance (migration 202, the standard + own-institution branch) and mirrored in JS by authorityFloorForFact (source-blocks.mjs); the scope is the institution SSOT, never a host-string match.',
    anchor: 'The standard floor is the authoring body, scoped by institution (SC-14)',
    enforcedBy: ['selftest:fsi-app/src/lib/agent/source-blocks.test.mjs', 'migration:202'],
  };
