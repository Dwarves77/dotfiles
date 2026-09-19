// SC-3-effective-tier-formula: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-3-effective-tier-formula',
    skill: 'source-credibility-model',
    section: 'Section 7: Override Mechanism Rules',
    text: 'effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier); tier weights T1=1.0…T7=0; override never modifies base_tier.',
    anchor: 'effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)',
    enforcedBy: ['fitness:F11', 'selftest:fsi-app/src/lib/trust.selftest.mjs'],
    residual: 'F11 (trust.selftest.mjs) asserts the tier-weight half against the REAL trust.ts: TIER_WEIGHTS = T1=1.0…T7=0 (Q7 verbatim), strictly decreasing, T7 contributes nothing, recency-decay curve, and the citation-component path applies the weights. The OTHER half — effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier) precedence + "override never modifies base_tier" — lives in the SQL daily-recompute job + override endpoint; no JS unit surface. Mechanizable via pgTAP SQL tests, deferred for that infra cost (REVISIT).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
