import { makeFormatSpec } from "@/lib/agent/formats/prose-extractor";
import type { SectionDef } from "@/lib/agent/format-spec";

const SECTIONS: SectionDef[] = [
  { key: "1", order: 1, heading: "What the Research Found", headingAlts: ["What the Research Is Investigating", "What the Research Found — OR What the Research Is Investigating"], conditional: false },
  { key: "2", order: 2, heading: "Why This Finding Matters Operationally and Commercially", conditional: false },
  { key: "3", order: 3, heading: "What the Finding Changes for Strategy, Claims, or Decisions", conditional: false },
  { key: "4", order: 4, heading: "Client Conversation Talking Points and Public Position", conditional: true },
  { key: "5", order: 5, heading: "What the Finding Does Not Resolve", headingAlts: ["What the Finding Does Not Resolve (+ forward timing)", "What the Finding Does Not Resolve + forward timing"], conditional: false },
  { key: "6", order: 6, heading: "Sources", conditional: false },
];

export const researchSpec = makeFormatSpec({
  itemTypes: ["research_finding"],
  formatType: "research_summary",
  grounding: "span",
  sections: SECTIONS,
});
