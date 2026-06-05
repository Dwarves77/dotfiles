// src/lib/agent/formats/research.ts
//
// Research Summary — 6 sections, per analysis-construction-spec/SKILL.md §7. This is the PROVEN format
// (the canonical pipeline's research path); the section list here is identical to the original
// extract-research-sections.ts. Grounding: span (S2/S3/S5 are synthesis, grounded transitively).

import { makeFormatSpec } from "@/lib/agent/formats/prose-extractor";
import type { SectionDef } from "@/lib/agent/format-spec";

const SECTIONS: SectionDef[] = [
  { key: "1", order: 1, heading: "What the Research Found", conditional: false },
  { key: "2", order: 2, heading: "Why This Finding Matters Operationally and Commercially", conditional: false },
  { key: "3", order: 3, heading: "What the Finding Changes for Strategy, Claims, or Decisions", conditional: false },
  { key: "4", order: 4, heading: "Client Conversation Talking Points and Public Position", conditional: true },
  { key: "5", order: 5, heading: "What the Finding Does Not Resolve", conditional: false },
  { key: "6", order: 6, heading: "Sources", conditional: false },
];

export const researchSpec = makeFormatSpec({
  itemTypes: ["research_finding"],
  formatType: "research_summary",
  grounding: "span",
  sections: SECTIONS,
});
