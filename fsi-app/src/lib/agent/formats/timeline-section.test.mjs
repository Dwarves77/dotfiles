// timeline-section.test.mjs -- D31 (lane L20, defect-fix-plan-2026-09-12). Structural drift guard for
// TIMELINE_SECTION_BY_FORMAT (timeline-section.mjs): every format_type the general per-format section-list
// mirror knows about (schema.mjs's SECTION_DEFS_BY_FORMAT_TYPE) must have a timeline-section table entry
// whose `key` is a real canonical section key for that format AND whose `heading` equals that key's own
// heading in the general mirror -- so the timeline table can never point at a section that does not exist,
// or at the wrong heading for the key it names.
//
// TRANSITIVE PROOF, NOT A SECOND JITI-DEPENDENT TEST: SECTION_DEFS_BY_FORMAT_TYPE is ALREADY proven equal
// to the five real src/lib/agent/formats/*.ts files by section-list-drift.npmtest.mjs (that file's own
// header). Asserting THIS module's table against SECTION_DEFS_BY_FORMAT_TYPE is therefore transitively an
// assertion against the real format files, without a second jiti/`@` alias dependent test needing to exist
// -- this file stays a plain node:test module, portable to the no-npm-ci discipline job
// (glob-portability.test.mjs's own rule), the same posture record-briefs.test.mjs and schema.mjs already
// have.
//
// headingAlts is DELIBERATELY NOT asserted equal here: the regulatory entry carries a widened
// section-sign-numbered heading alt with no counterpart in regulation.ts's own SECTIONS array (see timeline-section.mjs's own
// header for why -- it reproduces a pre-D31 widening specific to timeline-heading recognition, orthogonal
// to the general section-list mirror). Only `key` and `heading` are checked for equality; that is the
// contract D31 itself states ("the exact keys and headings you read, never retyped").
import test from "node:test";
import assert from "node:assert/strict";
import { SECTION_DEFS_BY_FORMAT_TYPE } from "../../../../scripts/turns/record-briefs/schema.mjs";
import { TIMELINE_SECTION_BY_FORMAT, findTimelineSectionFor } from "./timeline-section.mjs";

test("TIMELINE_SECTION_BY_FORMAT has an entry for every format_type in SECTION_DEFS_BY_FORMAT_TYPE", () => {
  const generalFormats = Object.keys(SECTION_DEFS_BY_FORMAT_TYPE).sort();
  const timelineFormats = Object.keys(TIMELINE_SECTION_BY_FORMAT).sort();
  assert.deepEqual(
    timelineFormats,
    generalFormats,
    "TIMELINE_SECTION_BY_FORMAT must cover exactly the same format_type set as the general section-list mirror",
  );
});

for (const formatType of Object.keys(SECTION_DEFS_BY_FORMAT_TYPE)) {
  test(`TIMELINE_SECTION_BY_FORMAT['${formatType}'].key is a real canonical section key for that format`, () => {
    const def = TIMELINE_SECTION_BY_FORMAT[formatType];
    assert.ok(def, `expected a TIMELINE_SECTION_BY_FORMAT entry for ${formatType}`);
    const canonical = SECTION_DEFS_BY_FORMAT_TYPE[formatType];
    const match = canonical.find((s) => s.key === def.key);
    assert.ok(
      match,
      `key ${JSON.stringify(def.key)} is not a canonical section key for ${formatType} (valid: ${JSON.stringify(canonical.map((s) => s.key))})`,
    );
    assert.equal(
      def.heading,
      match.heading,
      `TIMELINE_SECTION_BY_FORMAT['${formatType}'].heading has drifted from the canonical heading for key ${JSON.stringify(def.key)}`,
    );
  });
}

test("findTimelineSectionFor returns null for an unrecognised format_type", () => {
  assert.equal(findTimelineSectionFor("# Some Heading\n\ncontent", "not_a_real_format"), null);
  assert.equal(findTimelineSectionFor("# Some Heading\n\ncontent", null), null);
  assert.equal(findTimelineSectionFor("# Some Heading\n\ncontent", undefined), null);
});

test("findTimelineSectionFor resolves a numbered heading for a non-regulatory format (number-first, like every other section extraction)", () => {
  const body = "## 3. Expected Trajectory and Conversion Triggers\n\n- 12 August 2026: A milestone.\n";
  const got = findTimelineSectionFor(body, "market_signal_brief");
  assert.ok(got, "expected the numbered heading to resolve");
  assert.match(got.contentMarkdown, /12 August 2026/);
});

test("findTimelineSectionFor's regulatory lookup is heading-only (byte-for-byte pre-D31 behaviour): a numbered but differently-worded heading with number 14 does NOT resolve", () => {
  // Pre-D31, extract-regulation-sections.ts's own SECTION_HEADINGS["14"] walk (and schema.mjs's old
  // findTimelineSection) only ever matched by HEADING TEXT, never by number -- so a "## 14. Some Other
  // Title" heading (a plausible but non-canonical wording) was never treated as the timeline section for
  // regulatory_fact_document. This must stay true after D31.
  const body = "## 14. Some Other Title Entirely\n\n- 12 August 2026: A milestone.\n";
  const got = findTimelineSectionFor(body, "regulatory_fact_document");
  assert.equal(got, null, "the regulatory lookup must never resolve by section number, only by heading text");
});

test("findTimelineSectionFor's regulatory lookup still accepts the canonical heading text", () => {
  const body = "# Confirmed Regulatory Timeline\n\n- 12 August 2026: A milestone.\n";
  const got = findTimelineSectionFor(body, "regulatory_fact_document");
  assert.ok(got, "expected the canonical regulatory heading to resolve");
  assert.match(got.contentMarkdown, /12 August 2026/);
});
