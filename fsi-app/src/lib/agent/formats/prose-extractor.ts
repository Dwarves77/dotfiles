// src/lib/agent/formats/prose-extractor.ts
//
// The ONE section-extractor factory shared by every format (Rule 3 — one way to do each thing). It is
// the generalisation of the proven extract-research-sections.ts: walk each section heading with the
// tolerant extractSectionByHeading(), capture its markdown body verbatim, omit absent/empty sections
// (integrity rule). Every FormatSpec.extract is built from this — no per-format parser forks.

import { extractSectionByHeading, extractSectionByNumber } from "@/lib/agent/extract-sections";
import type { FormatSpec, SectionDef, SectionRow, GroundingModel } from "@/lib/agent/format-spec";

/** Build a SectionRow[] extractor from a section list. A section absent from the brief, or present
 *  with only an omission note, produces NO row (omitted, not invented). */
export function makeProseExtractor(sections: SectionDef[]) {
  return function extract(fullBrief: string): SectionRow[] {
    if (!fullBrief) return [];
    const rows: SectionRow[] = [];
    for (const sec of sections) {
      // Number-FIRST: a heading that carries its section number (## 2., ## Section 2:) resolves by
      // number even when the heading TEXT differs from the spec wording — the extraction-gap class
      // (~982 recoverable section rows) where heading-text matching silently dropped real sections.
      let got = extractSectionByNumber(fullBrief, sec.key);
      // Fall through to the tolerant heading match (canonical, then alternates) when number-first
      // finds nothing, so number-less or differently-numbered headings still resolve.
      if (!(got && (got.contentMarkdown || "").trim())) {
        got = extractSectionByHeading(fullBrief, sec.heading);
        for (const alt of sec.headingAlts ?? []) {
          if (got && (got.contentMarkdown || "").trim()) break;
          got = extractSectionByHeading(fullBrief, alt);
        }
      }
      const body = (got?.contentMarkdown || "").trim();
      if (!body) continue;
      if (/^\*?no content for this section/i.test(body)) continue; // honest omission note -> no row
      rows.push({ section_key: sec.key, section_order: sec.order, content_md: body, is_conditional: sec.conditional });
    }
    return rows;
  };
}

/** Assemble a FormatSpec from its declaration. */
export function makeFormatSpec(args: {
  itemTypes: string[];
  formatType: string;
  grounding: GroundingModel;
  sections: SectionDef[];
}): FormatSpec {
  return {
    itemTypes: args.itemTypes,
    formatType: args.formatType,
    grounding: args.grounding,
    sections: args.sections,
    extract: makeProseExtractor(args.sections),
  };
}
