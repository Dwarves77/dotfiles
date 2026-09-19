// SC-10-floor-source-complete: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-10-floor-source-complete',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier — floor-qualifying source reaches grounding complete (the truncation moat)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A source at/above the item authority floor (tier <= floor) reaches the grounding model COMPLETE, never silently truncated; the synthesis/grounding block builder is TIER-ORDERED (floor-qualifiers full first, lowest-tier corroborators truncate first); a floor source over the hard context ceiling is a SURFACED wall (truncation-guard flag + item stays quarantined with a named reason), never a silent slice. A truncated floor source forces the fact to a sub-floor corroborator (fact_below_authority_floor) even on a healthy pool.',
    anchor: 'Floor-qualifying source reaches grounding COMPLETE (the truncation moat)',
    enforcedBy: ['selftest:fsi-app/src/lib/agent/source-blocks.test.mjs'],
    residual: 'The selftest (in the discipline node --test glob) proves the PURE builder red-then-green: a floor-qualifying source whose fact span sits beyond the old per-corroborator cap is truncated by the order-based logic (RED, fact_below_floor) and COMPLETE under the tier-ordered builder (GREEN); plus the ceiling-wall surfacing and authorityFloorFor (mirrors migration 141 / SC-8). The WIRING (both synthesis R1 and grounding R2 call buildSourceBlocks over the SAME pool/budget/tiers, tiers resolved via buildResolver = base_tier moat) lives in canonical-pipeline.ts; the coupling is by construction (one builder, one call shape), not separately unit-asserted (integration residual). Discovered as the Lane-#4 batch-1 root cause 2026-07-03.',
  };
