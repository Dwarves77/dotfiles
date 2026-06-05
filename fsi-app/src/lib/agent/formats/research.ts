// src/lib/agent/formats/research.ts
//
// Research Summary — 6 sections, per analysis-construction-spec/SKILL.md §7. This is the PROVEN format
// (the canonical pipeline's research path); the section list here is identical to the original
// extract-research-sections.ts. Grounding: span (S1/S6 are FACT-span; S2/S3/S4/S5 are synthesis,
// grounded transitively — covered by GAP or labeled ANALYSIS claims in the ledger, not verbatim spans).
//
// Heading accuracy note (reconciled against system-prompt.ts lines 213-220 and SKILL.md §7):
//   S1 "What the Research Found"         — system-prompt short form (SKILL appends "— OR What the Research
//                                          Is Investigating"); the extractor normalises "Section 1 —" prefix
//                                          so both the short form and the SKILL form resolve to this key.
//   S5 "What the Finding Does Not Resolve" — system-prompt short form (SKILL appends "+ forward timing");
//                                           resolves cleanly via the same prefix-strip.
//   All other headings match exactly between skill, system-prompt, and extractor.
//
// Conditionality:
//   S4 (Client Conversation Talking Points) is conditional — when the finding is in-progress or
//   limited in scope, the agent may legitimately omit it (integrity rule); absent rows yield no section.
//   S2 and S3 are non-conditional but may produce only ANALYSIS / GAP claims (transitive grounding).

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
