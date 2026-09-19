// RD-8-retrieval-before-generation: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-8-retrieval-before-generation',
    skill: 'remediation-discipline',
    section: 'Section 4.6: Retrieval before generation (check existing work/data before re-deriving)',
    text: 'Before any generation / discovery / re-derivation step, the first action is a RETRIEVAL CHECK — does this output already exist (another column on the row, the item\'s agent_run_searches pool, provisional_sources, the sources registry, prior-session work)? Exhaust retrieval before generation; generate only the genuine residual. Binds hardest before any batch that spends.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Retrieval before generation (check existing work/data before re-deriving)',
    exempt: {
      reason: 'PROCESS discipline applied at planning time (same class as RD-2/RD-3) — "did I check whether this output already exists before (re)generating it?" is judgment exercised when scoping a generation/discovery step, not a checkable property of a committed file or row. No low-false-positive standing signal exists for "this generation re-derived something already persisted": the stores are heterogeneous (a column, the agent_run_searches pool, provisional_sources, the registry, prior sessions), so a mechanical "should have retrieved" detector would be overwhelmingly noisy. Carried by CLAUDE.md Reuse-before-construction doctrine (extended 2026-06-23 to work-products/data) + this skill section + the retrieval-before-generation feedback memory; the backward promote-from-pool operation is its worked example (re-point = promote the already-stored enacted URL, not re-discover). REVISIT: a per-operation retrieval-check attestation could make it dispatch-auditable, deferred — attestation-not-enforcement is the trap the 2026-05-21 slim refactor retired.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    },
  };
