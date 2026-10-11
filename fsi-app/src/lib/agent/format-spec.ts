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
  /** Alternate headings the agent may legitimately emit for the SAME section (e.g. the in-progress
   *  Research S1 "What the Research Is Investigating", or a "(+ forward timing)" suffix variant). The
   *  extractor tries `heading` first, then each alt — so a valid heading variant is never silently
   *  dropped (the heading-trap that quarantines good briefs). */
  headingAlts?: string[];
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
