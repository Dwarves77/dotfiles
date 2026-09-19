// RD-34-referenced-law-exists: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-34-referenced-law-exists',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 20: Referenced-law-exists',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'An intelligence item holding an instrument identifier is NEVER dispositioned absent/unfindable — the only honest terminal is "not found under N variants x M endpoints, logged". Discovery derives the canonical URL from the identifier by machine (identifier-variants.mjs + seek-more generateCandidates, wired into fetchPrimaryWithFallback / fetchPrimaryDeep); the durable N x M exhaustion record is persistExhaustionRecord at the exhaustion point (persistPrimaryExhaustion).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'An item holding an instrument identifier can never be dispositioned as absent or unfindable',
    enforcedBy: [
      'selftest:fsi-app/src/lib/sources/identifier-variants.test.mjs',
      'selftest:fsi-app/src/lib/sources/reground-ladder.golden.test.mjs',
    ],
    residual: 'identifier-variants.test.mjs proves the derivation (the mandated eu_clean_trucking eli/reg/2024/1610/oj -> CELEX 32024R1610 + the fetchable /legal-content URL, separator mutations, UK/US resolvers, SC-13 ranker); reground-ladder.golden.test.mjs proves the WIRING end-to-end (failing item -> declared-primary roadblock -> discovery derives the CELEX candidate -> win, and total exhaustion -> full N x M record). Wired at fetchPrimaryWithFallback (discovery-first, one home) consumed by fetchPrimaryDeep at generate + reground (tsc-checked); persistPrimaryExhaustion writes the durable record. NAMED RESIDUAL: the forbidden-delete-on-identifier-bearing-item half is dispatch-authoring discipline until a delete-path guard reads instrument_identifier.',
  };
