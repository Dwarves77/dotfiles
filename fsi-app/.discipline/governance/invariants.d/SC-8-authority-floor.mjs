// SC-8-authority-floor: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-8-authority-floor',
    skill: 'source-credibility-model',
    section: 'Section 3 — Per-item-type authority floor',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A CRITICAL/HIGH item\'s FACT claims are held to a per-item-type authority floor (reg-family ≤T2, research_finding ≤T4, technology/innovation/tool ≤T5); market_signal/initiative and regional_data are EXEMPT pending their own gates.',
    anchor: 'Per-item-type authority floor (provenance gate)',
    enforcedBy: ['migration:141'],
    residual: 'NAMED EXEMPTIONS (REVISIT, registered here so neither silently becomes permanent): market_signal/initiative floor is corroboration-count not a tier (Section 4) — the gate is UNBUILT (codifying it now would put unbuilt mechanism in the gate, the migration-113 pattern); regional_data wants a per-SECTION floor (feasibility ≤T3, cost-data any-tier-with-source) — UNBUILT. technology ≤T5 is a FORWARD DEFAULT (0 live items) — REVISIT when the first technology items land. validate_item_provenance (migration 141) enforces the reg/research/tech floors over stored data; whether each ratified tier value is itself correct is operator judgment, not mechanized here.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
