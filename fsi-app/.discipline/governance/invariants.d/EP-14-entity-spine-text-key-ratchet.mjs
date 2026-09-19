// EP-14-entity-spine-text-key-ratchet: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-14-entity-spine-text-key-ratchet',
    skill: 'environmental-policy-and-innovation',
    section: 'Output Formats / Canonical instrument key (dedup-before-grounding identity)',
    text: 'The "dedup before grounding — entity identity, not title" doctrine EP-11 names for canonical_instrument_key generalises to the whole entity spine (migration 282/283, ADR-024): jurisdiction, instrument, and organisation identity are FK-backed facts (entities/entity_identifiers/entity_refs, instrument_entity_id, organisation_entity_id), not ad-hoc text-key lookups re-derived at each call site. The count of remaining text-keyed reference sites (.eq/.contains on jurisdiction_iso, .eq on canonical_instrument_key, .eq on source_url, ad-hoc new URL(...).host/.hostname host derivation outside the one sanctioned normalizer) must never silently grow — a new text-keyed site next to an FK-backed replacement that already exists for exactly that purpose is the same identity-by-title regression EP-11 exists to prevent, one layer over.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'entity identity, not title',
    enforcedBy: ['fitness:F30', 'selftest:fsi-app/.discipline/fitness/functions/F30-entity-spine.test.mjs'],
    residual: 'F30 is a ONE-DIRECTIONAL ratchet (regression only fails; improvement passes and is reported as a delta) over a committed per-pattern baseline, filesystem-only against fsi-app/src. It measures CALL-SITE SHAPE (the five named regex patterns), not migration-time identity quality — canonical_instrument_key\'s own uniqueness-among-verified-items guarantee remains EP-11\'s (migration 200 + canonical-key-uniqueness.mjs), unchanged and un-duplicated here. Two of the five baseline counts are non-zero today (source_url_eq: 2, url_host_derivation: 13) — pre-existing sites this lane (DP-SPINE) found but whose owning files are outside its write set (F30-entity-spine.mjs\'s header names each site); the ratchet holds them from growing rather than requiring an immediate rewrite, consistent with ADR-024\'s progressive-re-keying decision (no big-bang rewrite).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
