import { makeFormatSpec } from "@/lib/agent/formats/prose-extractor";
import type { SectionDef } from "@/lib/agent/format-spec";

const SECTIONS: SectionDef[] = [
  { key: "1", order: 1, heading: "What's Being Tested or Deployed and By Whom", conditional: false },
  { key: "2", order: 2, heading: "What This Tells Us About Industry Trajectory", conditional: false },
  { key: "3", order: 3, heading: "Supplier Access and Procurement Reality", conditional: false },
  { key: "4", order: 4, heading: "Operational Fit by Transport Mode and Cargo Vertical", conditional: false },
  { key: "5", order: 5, heading: "Competitive Positioning Implications for the Workspace", conditional: true },
  { key: "6", order: 6, heading: "Conversational and Strategic Talking Points", conditional: true },
  { key: "7", order: 7, heading: "Time-to-Market, Procurement Window, and Action", conditional: false },
  { key: "8", order: 8, heading: "Sources", conditional: false },
];

export const technologySpec = makeFormatSpec({
  itemTypes: ["technology", "innovation", "tool"],
  formatType: "technology_profile",
  grounding: "span",
  sections: SECTIONS,
});
