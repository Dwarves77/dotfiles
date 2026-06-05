// src/lib/agent/formats/prose-extractor.ts
//
// The ONE section-extractor factory shared by every format (Rule 3 — one way to do each thing). It is
// the generalisation of the proven extract-research-sections.ts: walk each section heading with the
// tolerant extractSectionByHeading(), capture its markdown body verbatim, omit absent/empty sections
// (integrity rule). Every FormatSpec.extract is built from this — no per-format parser forks.

import { extractSectionByHeading } from "@/lib/agent/extract-sections";
import type { FormatSpec, SectionDef, SectionRow, GroundingModel } from "@/lib/agent/format-spec";

/** Build a SectionRow[] extractor from a section list. A section absent from the brief, or present
 *  with only an omission note, produces NO row (omitted, not invented). */
export function makeProseExtractor(sections: SectionDef[]) {
  return function extract(fullBrief: string): SectionRow[] {
    if (!fullBrief) return [];
    const rows: SectionRow[] = [];
    for (const sec of sections) {
      // Try the canonical heading first, then any alternates, so a legitimate heading variant the
      // agent emits (in-progress S1, suffixed S5, …) resolves instead of silently dropping the section.
      let got = extractSectionByHeading(fullBrief, sec.heading);
      for (const alt of sec.headingAlts ?? []) {
        if (got && (got.contentMarkdown || "").trim()) break;
        got = extractSectionByHeading(fullBrief, alt);
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
