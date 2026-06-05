// src/lib/agent/formats/operations.ts
//
// Operations Profile — 8 sections, per analysis-construction-spec/SKILL.md §5 (a gated data-sourcing
// program). Grounding = 'matrix': S1/S2 are single-region span facts that populate incrementally;
// S3/S4 (cost comparison + cross-regional) GATE on the matrix reaching >=2 sourced regions per
// dimension and stay omit-with-note until then. The matrix is a COVERAGE QUERY over the existing
// regional_data rows (dimension x jurisdiction) — NOT a new store (Rule 3).
//
// BUILD AGENT OWNS: required-slots migration for regional_data, the coverage-gate adapter, and a
// NET-NEW section-aware OperationsDetailSurface (none exists today) with routing. Exemplar-test the
// coverage gate against the 26 non-archived regional_data items before building anything net-new.

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
