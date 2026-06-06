// src/lib/agent/formats/market.ts
//
// Market Signal Brief — 8 sections, per analysis-construction-spec/SKILL.md §6. Grounding =
// 'corroboration': S1 signal STRENGTH is proven by the count of INDEPENDENT corroborators, read from
// the EXISTING source-growth convergence (aggregateConvergence / growSourcesFromBrief: independent_citers,
// confirmation_count, syndication-collapsed). A thin adapter over that, NOT a new counting engine
// (Rule 3). No-Vacuum: S3 conversion trigger is frequently a specific regulation — emit + render the link.
//
// BUILD AGENT OWNS: required-slots migration for market_signal+initiative, the corroboration adapter,
// and the section-aware MarketSignalDetailSurface. Verify the section headings below against the skill +
// the live system-prompt emission before scaling.

import { makeFormatSpec } from "@/lib/agent/formats/prose-extractor";
import type { SectionDef } from "@/lib/agent/format-spec";

const SECTIONS: SectionDef[] = [
  { key: "1", order: 1, heading: "What's Moving and What Triggered It", conditional: false },
  { key: "2", order: 2, heading: "Who's Driving It and What They Want", conditional: false },
  { key: "3", order: 3, heading: "Expected Trajectory and Conversion Triggers", conditional: false },
  { key: "4", order: 4, heading: "Operational and Cost Implications If It Materializes", conditional: false },
  { key: "5", order: 5, heading: "Competitive Implications", conditional: true },
  { key: "6", order: 6, heading: "Client Conversation Talking Points", conditional: true },
  { key: "7", order: 7, heading: "What the Workspace Should Do Now", conditional: false },
  { key: "8", order: 8, heading: "Sources", conditional: false },
];

export const marketSpec = makeFormatSpec({
  itemTypes: ["market_signal", "initiative"],
  formatType: "market_signal_brief",
  grounding: "corroboration",
  sections: SECTIONS,
});
