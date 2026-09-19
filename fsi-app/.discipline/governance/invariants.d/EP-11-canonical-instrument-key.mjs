// EP-11-canonical-instrument-key: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-11-canonical-instrument-key',
    skill: 'environmental-policy-and-innovation',
    section: 'Output Formats / Canonical instrument key (dedup-before-grounding identity)',
    text: 'Every reg-family EU-instrument item carries a canonical instrument key (bare CELEX, derived from instrument_identifier or source_url; NULL when not confidently derivable — a bare YYYY/N is never guessed). Two VERIFIED, non-archived items MUST NOT share a canonical instrument key (that is two live customer-visible copies of one regulation — the PPWR-both-verified twin defect); the key is the join the dedup-before-grounding gate needs.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Two VERIFIED, non-archived items MUST NOT share a canonical instrument key',
    enforcedBy: ['audit:fsi-app/scripts/verify/canonical-key-uniqueness.mjs', 'migration:200'],
    residual: 'Two independent guards: migration 200 = the partial UNIQUE index uq_intelligence_items_canonical_key_verified_live (canonical_instrument_key WHERE verified AND NOT archived) — a DB-level structural bar against a NEW verified twin, plus the BEFORE INSERT/UPDATE normalizing trigger that derives the key; canonical-key-uniqueness.mjs = the live-data lane audit (CI-with-secrets) that mirrors the index AND derives on-the-fly (so it catches a would-be verified twin even before backfill), reaching 0 collisions after the C7.3 merge archives b7736a1a (the one live verified/quarantined 2019/1242 twin lever). The meta-gate proves wiring (file tracked + skill-cited) in the secret-less pre-push. Archived tombstones (verified BUT is_archived — 5cc10a6d PPWR, 6b0939a5 AFIR) are excluded from the guard by construction (WHERE is_archived IS NOT TRUE). Whether two DIFFERENT-format rows are truly one instrument vs item-vs-amendment is a DB-1 item-domain call, not mechanized here (the both-quarantined FuelEU/2024-1610 pairs are the ruling residual).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
