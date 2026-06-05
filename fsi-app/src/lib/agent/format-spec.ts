// src/lib/agent/format-spec.ts
//
// Phase 0 — the SHARED dispatch seam that makes the deep dive the default generator for EVERY surface.
// One FormatSpec per brief format declares: which item_types it owns, its format_type, its section
// list (headings matching the skill / system prompt), its grounding model, and an extractor that turns
// a full_brief into uniform section rows for intelligence_item_sections.
//
// Every format's section rows are uniform { section_key, section_order, content_md, is_conditional } —
// the canonical pipeline's sectionBrief contract. Surfaces that render structured components (the
// regulation detail page's tables/action-lists) re-parse content_md at RENDER time; the rows
// themselves stay format-generic so ONE pipeline path serves all five surfaces.
//
// GROUNDING MODELS (declared here, wired per the REUSE LAW — no parallel engines):
//  - 'span'         FACT spans verbatim in fetched source content (the existing engine). Default.
//  - 'corroboration' signal strength = independent corroborators, via the EXISTING source-growth
//                    convergence (aggregateConvergence / growSourcesFromBrief). Market. Adapter, not engine.
//  - 'matrix'        a comparison sourced across >=2 regions per dimension; a COVERAGE QUERY over the
//                    existing regional_data rows. Operations. Gate, not engine.
//  Transitive integrity (synthesis sections introduce no new unsourced fact) is automatic from the
//  claim-ledger + criterion-4 labeling discipline — not a model you select.

export interface SectionRow {
  section_key: string;
  section_order: number;
  content_md: string;
  is_conditional: boolean;
}

export type GroundingModel = "span" | "corroboration" | "matrix";

export interface SectionDef {
  key: string;
  order: number;
  heading: string;
  conditional: boolean;
}

export interface FormatSpec {
  /** intelligence_items.item_type values this format owns. */
  itemTypes: string[];
  /** format_type label (regulatory_fact_document, research_summary, …). */
  formatType: string;
  /** Declared grounding model. Wired per the REUSE LAW; 'span' needs no extra wiring. */
  grounding: GroundingModel;
  /** The format's section list — headings match the skill / system-prompt emission. */
  sections: SectionDef[];
  /** full_brief -> uniform section rows (present, non-empty sections only; integrity rule). */
  extract(fullBrief: string): SectionRow[];
}
