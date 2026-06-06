// extract-research-sections.ts
//
// Section extractor for the Research Summary format (item_type = research_finding), the
// non-regulatory analog of extract-regulation-sections.ts. Reuses the SAME heading-walk
// (extractSectionByHeading) — no new parser — and maps the format's 6 top-level headings
// (emitted by system-prompt.ts: "# What the Research Found", etc.) to section rows that the
// sectioning backfill upserts into intelligence_item_sections and the grounding runner reads.
//
// Research Summary sections are prose (not the regulation detail page's tables/action-lists), so
// this extractor does NOT do per-section structured parsing — it captures each section's markdown
// body verbatim. Integrity rule: a section absent from the brief produces NO row (omitted, not
// invented). section_key is the section number ("1".."6"); section_order = the number.

import { extractSectionByHeading } from "@/lib/agent/extract-sections";

export interface ResearchSectionRow {
  section_key: string;
  section_order: number;
  content_md: string;
  is_conditional: boolean;
}

// Canonical Research Summary section list — heading text matches the system-prompt format spec.
// Heading match is tolerant (extractSectionByHeading normalises + fuzzy-matches), so minor
// wording/casing drift in the generated brief still resolves.
const RESEARCH_SECTIONS: Array<{ key: string; order: number; heading: string; conditional: boolean }> = [
  { key: "1", order: 1, heading: "What the Research Found", conditional: false },
  { key: "2", order: 2, heading: "Why This Finding Matters Operationally and Commercially", conditional: false },
  { key: "3", order: 3, heading: "What the Finding Changes for Strategy, Claims, or Decisions", conditional: false },
  { key: "4", order: 4, heading: "Client Conversation Talking Points and Public Position", conditional: true },
  { key: "5", order: 5, heading: "What the Finding Does Not Resolve", conditional: false },
  { key: "6", order: 6, heading: "Sources", conditional: false },
];

/**
 * Parse a research_finding full_brief into Research Summary section rows. Returns one row per
 * section that is actually present with non-empty content; absent sections are omitted (integrity
 * rule). Empty/whitespace-only bodies are dropped so a heading-with-omission-note does not produce
 * a hollow grounded section.
 */
export function extractResearchSections(fullBrief: string): ResearchSectionRow[] {
  if (!fullBrief) return [];
  const rows: ResearchSectionRow[] = [];
  for (const sec of RESEARCH_SECTIONS) {
    const got = extractSectionByHeading(fullBrief, sec.heading);
    const body = (got?.contentMarkdown || "").trim();
    if (!body) continue; // omitted section -> no row
    // Drop a body that is only the integrity omission note ("No content for this section…").
    if (/^\*?no content for this section/i.test(body)) continue;
    rows.push({ section_key: sec.key, section_order: sec.order, content_md: body, is_conditional: sec.conditional });
  }
  return rows;
}
