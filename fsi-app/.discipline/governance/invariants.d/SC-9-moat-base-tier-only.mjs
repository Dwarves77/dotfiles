// SC-9-moat-base-tier-only: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-9-moat-base-tier-only',
    skill: 'source-credibility-model',
    section: 'Section 2 — The six-element model (the moat)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'The reg-fact grounding-tier stamp derives from static base_tier ONLY (the per-host tier_override is the only sanctioned escape); dynamic reputation (effective_tier) and time-in-system never confer reg-fact grounding eligibility — a NULL base_tier resolves to NULL, never to a reputation tier.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'dynamic reputation (effective_tier) and time-in-system never confer reg-fact grounding eligibility',
    enforcedBy: ['fitness:F12'],
    residual: 'F12 runs the pure resolver selftest (institution.selftest.mjs) behaviorally — it catches a reintroduced effective_tier fallback regardless of form, which the corpus claims-tier audit cannot (stamp + audit move together through the same resolver). Defense-in-depth: canonical-pipeline.ts no longer selects effective_tier into the resolver rows.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
