// AC-2-grounding-models: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'AC-2-grounding-models',
    skill: 'analysis-construction-spec',
    section: '2. Grounding models',
    text: 'Each section declares one of four grounding models (SPAN / CORROBORATION-COUNT / MATRIX / TRANSITIVE); synthesis sections introduce no new unsourced fact.',
    anchor: 'Grounding models (the four; declared per section)',
    exempt: {
      reason: 'SEMANTIC HALF exempt; STRUCTURAL HALF enforced. Enforced structurally: per-CLAIM grounding is real — section_claim_provenance stores claim_kind (FACT/ANALYSIS/LEGAL/GAP) and validate_item_provenance (migrations 112/114) requires FACT claims grounded with a source_span + a CRITICAL/HIGH tier floor. NOT mechanizable: the per-SECTION grounding-MODEL LABEL (SPAN/CORROBORATION/MATRIX/TRANSITIVE) is not stored as a column, and "synthesis introduces no new unsourced fact" is semantic. So claim grounding is gated; the model-label declaration is construction judgment. (REVISIT: storing grounding_model per section would make the enum mechanizable.)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    },
  };
