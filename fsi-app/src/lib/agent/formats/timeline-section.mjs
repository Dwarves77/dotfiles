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
