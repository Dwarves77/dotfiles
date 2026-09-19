// EP-10-vocab-sync: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-10-vocab-sync',
    skill: 'environmental-policy-and-innovation',
    section: 'Database Field Emission / controlled vocabularies',
    text: 'The in-code metadata vocabularies (metadata-vocab.ts DB_*_VALUES) MUST equal the DB CHECK-constraint value sets on intelligence_items (severity/priority/urgency_tier/format_type/signal_band/theme); a drift silently rejects whole-row writes (the severity 3-way fracture), so an emitted value outside the live constraint fails the write.',
    anchor: 'controlled vocabulary for `intelligence_items.topic_tags`',
    enforcedBy: ['audit:fsi-app/scripts/verify/vocab-sync-audit.mjs'],
    residual: 'vocab-sync-audit.mjs (CI-with-secrets lane) reads pg_get_constraintdef from the catalog and compares each column\'s CHECK value set to the matching metadata-vocab Set — the standing truth-teller for a code-vs-DB vocab drift. It was an unwired lane audit before this registration (the meta-gate blind spot). The meta-gate proves wiring (file tracked + skill-cited) in the secret-less pre-push. topic_tags/compliance_object_tags closed-vocab enforcement at emission time is the generation-side half (system-prompt + parser), reference-layer not mechanized here.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
