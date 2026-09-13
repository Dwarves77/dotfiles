// src/lib/agent/formats/timeline-section.mjs
//
// D31 FIX (lane L20, brief-chain-build-plan-2026-09-11 / defect-fix-plan-2026-09-12). ONE per-format
// timeline-section table, imported by BOTH the record-briefs validator (schema.mjs MIRROR (c)) and the
// live write site (canonical-pipeline.ts's harvestItemTimeline, scripts/backfill-item-timelines.mjs) --
// never two copies that could drift from each other the way the pre-D31 code did (the validator's
// TIMELINE_HEADING_VARIANTS and the harvest's extract-regulation-sections.ts SECTION_HEADINGS["14"] were
// already two independent mirrors of the SAME regulatory heading; this file replaces both AND extends the
// same table to the other four formats, which had no timeline-section concept at all before this lane).
//
// WHY A PLAIN, DEPENDENCY-LIGHT .mjs (mirrors schema.mjs's own header for timeline-parse.mjs): the
// validator is a pure, no-npm-ci-portable module (glob-portability.test.mjs's rule) that already imports
// a handful of src/lib/agent/*.ts files via PLAIN RELATIVE paths (never "@/" tsconfig aliases, which that
// same portability test treats as an unresolvable bare specifier). src/lib/agent/formats/*.ts -- the real
// per-format SECTIONS arrays this table's data is read from -- import each other via "@/" aliases, so this
// module does NOT import them directly; instead it carries the SAME per-format timeline entry as literal
// data (the same "mirror, not reimplementation" posture schema.mjs's own SECTION_DEFS_BY_FORMAT_TYPE
// documents for the general section lists), proven equal to the real registry by
// timeline-section-drift.test.mjs (a plain node:test file -- schema.mjs's SECTION_DEFS_BY_FORMAT_TYPE is
// itself already proven equal to the five real format files by section-list-drift.npmtest.mjs, so
// asserting equality against THAT mirror is transitively an assertion against the real files without a
// second jiti-dependent test needing to exist).
//
// This module imports ONLY extract-sections.ts, via a plain relative path ("../extract-sections.ts") --
// that file has zero imports of its own and is already imported the same way by schema.mjs (line 76:
// "../../../src/lib/agent/extract-sections.ts"), so this import carries no "@/" alias and no npm
// dependency either.
//
// PER-FORMAT KEYS AND HEADINGS (read directly from src/lib/agent/formats/*.ts, D31's own instruction --
// "the exact keys and headings you read, never retyped"):
//   regulatory_fact_document -> key "14" "Confirmed Regulatory Timeline"      (regulation.ts)
//   market_signal_brief      -> key "3"  "Expected Trajectory and Conversion Triggers"  (market.ts)
//   research_summary         -> key "5"  "What the Finding Does Not Resolve" (+ forward-timing alts) (research.ts)
//   operations_profile       -> key "7"  "Pending Changes That Shift the Calculus"       (operations.ts)
//   technology_profile       -> key "7"  "Time-to-Market, Procurement Window, and Action" (technology.ts)
//
// The regulatory entry ALSO carries a headingAlts widening (the section-sign numbered form, written
// below as a \u00A7 escape, never the literal glyph) that has NO counterpart in regulation.ts's own SECTIONS array (that file declares no headingAlts for
// key "14"). This is not a drift -- it reproduces, verbatim, the widening the PRE-D31 code already had in
// TWO places (schema.mjs's TIMELINE_HEADING_VARIANTS and extract-regulation-sections.ts's own
// SECTION_HEADINGS["14"]): a section-sign-numbered-heading form specific to how the timeline SECTION is
// recognised, orthogonal to the general per-format section-list mirror. Preserving it here is what keeps
// the regulatory behaviour byte-for-byte unchanged (D31's own requirement); the drift test below checks
// `heading` equality against the general mirror, never `headingAlts` equality, for exactly this reason.
//
// Section-sign glyph is written below as a \u00A7 escape, never the literal character (this repo's
// dash/section-sign ban).

import { extractSectionByHeading, extractSectionByNumber } from "../extract-sections.ts";

/** format_type -> { key, heading, headingAlts } for the ONE section of that format that carries the
 *  item's timeline (D31: "no item should be without some date in the timeline" must hold for every
 *  format, not only regulatory_fact_document). Frozen, exported for both the validator's own drift test
 *  and the write-site callers. */
export const TIMELINE_SECTION_BY_FORMAT = Object.freeze({
  regulatory_fact_document: Object.freeze({
    key: "14",
    heading: "Confirmed Regulatory Timeline",
    headingAlts: Object.freeze(["\u00A714 Confirmed Regulatory Timeline"]),
  }),
  market_signal_brief: Object.freeze({
    key: "3",
    heading: "Expected Trajectory and Conversion Triggers",
  }),
  research_summary: Object.freeze({
    key: "5",
    heading: "What the Finding Does Not Resolve",
    headingAlts: Object.freeze([
      "What the Finding Does Not Resolve (+ forward timing)",
      "What the Finding Does Not Resolve + forward timing",
    ]),
  }),
  operations_profile: Object.freeze({
    key: "7",
    heading: "Pending Changes That Shift the Calculus",
  }),
  technology_profile: Object.freeze({
    key: "7",
    heading: "Time-to-Market, Procurement Window, and Action",
  }),
});

/**
 * Locate `formatType`'s own timeline section inside `body`, or null when the format is unrecognised or
 * the section is absent.
 *
 * REGULATORY BEHAVIOUR IS BYTE-FOR-BYTE UNCHANGED (D31's own requirement): for
 * `regulatory_fact_document`, this reproduces the pre-D31 lookup exactly -- heading-text match only
 * (canonical heading, then the section-sign-numbered alt), in that order, NEVER a number-first attempt. The pre-D31
 * code (schema.mjs's findTimelineSection, extract-regulation-sections.ts's own SECTION_HEADINGS["14"]
 * walk) never tried extractSectionByNumber for this section, and this function does not introduce it
 * for regulatory -- introducing it could silently pick up a DIFFERENT numbered section-14 heading a live
 * regulatory brief happens to carry, which the byte-for-byte requirement forbids risking.
 *
 * For the four other formats (new under D31, no prior behaviour to preserve), this follows the SAME
 * number-first-then-heading-then-alts order every other real section extraction in this codebase uses
 * (prose-extractor.ts's makeProseExtractor -- the real write path every format's sectionBrief runs
 * through -- and schema.mjs's own extractCanonicalSections mirror of it), so a numbered heading
 * ("## 3.", "## Section 3 --") resolves the same way a plain-text heading does.
 *
 * @param {string} body
 * @param {string|null|undefined} formatType
 * @returns {{heading:string, contentMarkdown:string, firstParagraphs:string[], hasContent:boolean}|null}
 */
export function findTimelineSectionFor(body, formatType) {
  const def = TIMELINE_SECTION_BY_FORMAT[formatType];
  if (!def) return null;
  const src = String(body ?? "");

  if (formatType === "regulatory_fact_document") {
    let got = extractSectionByHeading(src, def.heading);
    if (got) return got;
    for (const alt of def.headingAlts ?? []) {
      got = extractSectionByHeading(src, alt);
      if (got) return got;
    }
    return null;
  }

  let got = extractSectionByNumber(src, def.key);
  if (got && (got.contentMarkdown || "").trim()) return got;
  got = extractSectionByHeading(src, def.heading);
  if (got && (got.contentMarkdown || "").trim()) return got;
  for (const alt of def.headingAlts ?? []) {
    got = extractSectionByHeading(src, alt);
    if (got && (got.contentMarkdown || "").trim()) return got;
  }
  return null;
}
