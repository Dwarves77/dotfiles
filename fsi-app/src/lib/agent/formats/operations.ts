import { makeFormatSpec } from "@/lib/agent/formats/prose-extractor";
import type { SectionDef } from "@/lib/agent/format-spec";

const SECTIONS: SectionDef[] = [
  { key: "1", order: 1, heading: "Operational Cost Baseline for the Region", conditional: false },
  { key: "2", order: 2, heading: "Feasibility of Specific Operational Choices", conditional: false },
  { key: "3", order: 3, heading: "Cost Comparison Against Alternatives", conditional: true },
  { key: "4", order: 4, heading: "Cross-Regional Strategic Implications", conditional: true },
  { key: "5", order: 5, heading: "Competitive Positioning in the Region", conditional: true },
  { key: "6", order: 6, heading: "Client Conversation Talking Points", conditional: true },
  { key: "7", order: 7, heading: "Pending Changes That Shift the Calculus", conditional: false },
  { key: "8", order: 8, heading: "Sources", conditional: false },
];

export const operationsSpec = makeFormatSpec({
  itemTypes: ["regional_data"],
  formatType: "operations_profile",
  grounding: "matrix",
  sections: SECTIONS,
});
