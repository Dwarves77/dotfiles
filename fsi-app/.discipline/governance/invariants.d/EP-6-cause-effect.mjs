// EP-6-cause-effect: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-6-cause-effect',
    skill: 'environmental-policy-and-innovation',
    section: 'Cause and Effect Requirement',
    text: 'Every data point carries a sourced cause→mechanical-consequence→workspace-effect chain; data without it is noise and is not output.',
    anchor: 'Cause and Effect Requirement',
    exempt: {
      reason: 'SEMANTIC HALF exempt; STRUCTURAL HALF enforced. Enforced structurally: the per-claim provenance gate (EP-1 → section_claim_provenance + validate_item_provenance, migrations 112/114/121) requires FACT claims to carry a source_span + source_id and keeps ungrounded items off customer surfaces. NOT mechanizable: whether each datapoint\'s cause→mechanical-consequence→workspace-effect CHAIN is present and each link sourced — that is content meaning, no low-false-positive signal. So sourcing is gated; chain-completeness is authoring judgment.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    },
  };
