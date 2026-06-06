// src/lib/agent/formats/regulation.ts
//
// Regulatory Fact Document — 15 sections (9 always-present incl. S8 + 6 conditional), per
// environmental-policy-and-innovation/SKILL.md (count reconciled 2026-06-05: 14 content sections
// 1-14 + S15 Sources = 15; the old "14" labels were stale). The canonical pipeline extracts ALL 15 section
// bodies into intelligence_item_sections (completeness + grounding). The RegulationDetailSurface
// curates which to render and re-parses content_md into structured components
// (extract-regulation-sections.ts) at render time — that mockup-locked curation is a DISPLAY concern,
// separate from this format-generic extraction. Grounding: span (S4 compliance-chain + S13 adjacent
// research are synthesis, grounded transitively via the claim-ledger discipline).

import { makeFormatSpec } from "@/lib/agent/formats/prose-extractor";
import type { SectionDef } from "@/lib/agent/format-spec";

// Always-present: 1,2,3,4,8,10,11,14,15. Conditional: 5,6,7,9,12,13 (skill "Conditional Section
// Application"). section_key = the number string; order = the number.
const SECTIONS: SectionDef[] = [
  { key: "1", order: 1, heading: "Purpose and Scope of This Document", conditional: false },
  { key: "2", order: 2, heading: "What This Regulation Is and Why It Applies to the Workspace", conditional: false },
  { key: "3", order: 3, heading: "Issues Requiring Immediate Action", conditional: false },
  { key: "4", order: 4, heading: "How the Workspace Sits in the Compliance Chain", conditional: false },
  { key: "5", order: 5, heading: "Authoritative Guidance Document Analysis", conditional: true },
  { key: "6", order: 6, heading: "Anticipated Authoritative Guidance and Pending Regulatory Events", conditional: true },
  { key: "7", order: 7, heading: "Threshold Questions", conditional: true },
  { key: "8", order: 8, heading: "Substantive Requirements", conditional: false },
  { key: "9", order: 9, heading: "Product-Specific Compliance Status", conditional: true },
  { key: "10", order: 10, heading: "Registration and Reporting Obligations", conditional: false },
  { key: "11", order: 11, heading: "Operational System Requirements", conditional: false },
  { key: "12", order: 12, heading: "Exemptions and Edge Cases", conditional: true },
  { key: "13", order: 13, heading: "Adjacent Industry Research and Alternatives", conditional: true },
  { key: "14", order: 14, heading: "Confirmed Regulatory Timeline", conditional: false },
  { key: "15", order: 15, heading: "Sources", conditional: false },
];

export const regulationSpec = makeFormatSpec({
  itemTypes: ["regulation", "directive", "standard", "guidance", "framework"],
  formatType: "regulatory_fact_document",
  grounding: "span",
  sections: SECTIONS,
});
