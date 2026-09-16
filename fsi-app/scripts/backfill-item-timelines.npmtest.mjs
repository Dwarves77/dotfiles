// scripts/backfill-item-timelines.npmtest.mjs -- lane L20 fix round (D31, defect-fix-plan-2026-09-12),
// review finding I1: backfill-item-timelines.mjs's own D31 per-item resolution (the per-format section
// lookup through TIMELINE_SECTION_BY_FORMAT / findTimelineSectionFor, replacing the old REG_FAMILY-only
// scope) had no test anywhere in the repo. This is an *.npmtest.mjs (not *.test.mjs) because the script
// module pulls in `jiti` at import time (unconditional top-level `await jiti.import(...)` calls that
// load the real .ts format registry) -- importing it at all requires node_modules, so it cannot join the
// no-npm-ci discipline suite. Mirrors timeline-harvest-unlock.npmtest.mjs's posture (dependency-injected
// fakes, no real Supabase, no real jiti-loaded modules needed for the test itself).
//
// WHY THE SCRIPT IS SAFELY IMPORTABLE NOW: prior to this fix round, `main()` ran unconditionally at the
// bottom of the file on every import (not even the broken `file://${argv[1]}` idiom -- no guard at all),
// so importing this module for a test would have kicked off a real Supabase sweep. The fix round added
// the `isMainModule(import.meta.url)` guard (task 0.3b's convention, `scripts/lib/is-main.mjs`) around
// that call, so importing the module now only runs its jiti-loaded module-scope setup (pure, no I/O) and
// leaves `main()` un-invoked -- this test imports the module and calls ONLY the exported pure function,
// `resolveTimelineEntriesForItem`, extracted for exactly this purpose. CLI behaviour when run directly
// (`node scripts/backfill-item-timelines.mjs ...`) is unchanged: argv[1] resolves to this file, so the
// guard is true and main() still runs.
//
// DESIGN: `resolveTimelineEntriesForItem(it, deps)` is dependency-injected -- extractRegulationSections,
// TIMELINE_SECTION_BY_FORMAT, findTimelineSectionFor, parseTimeline and specForItemType are all passed
// in, never imported by this test file. The fakes below assert on WHICH extraction path gets called for
// a given item_type (the ROUTING the D31 fix actually changed), not on markdown-parsing correctness --
// the real parsers (parseTimeline, findTimelineSectionFor, extractRegulationSections) already carry their
// own dedicated tests (timeline-section.test.mjs, timeline-harvest-unlock.npmtest.mjs,
// record-briefs.test.mjs); duplicating that coverage here would be a second copy of the same proof, not a
// new one. Section-sign glyph avoided throughout (written as literal "14"/"3" keys, never the literal
// character).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTimelineEntriesForItem } from "./backfill-item-timelines.mjs";

// A tiny fake registry -- formatType per item_type, mirroring extract-registry.ts's specForItemType
// contract (returns a spec-shaped object with .formatType, or undefined for an unrecognised item_type)
// without importing the real "@/"-aliased format files.
const FORMAT_BY_ITEM_TYPE = {
  regulation: "regulatory_fact_document",
  market_signal: "market_signal_brief",
  research_finding: "research_summary",
  regional_data: "operations_profile",
  technology: "technology_profile",
  // Deliberately NOT in TIMELINE_SECTION_BY_FORMAT below -- proves case 3 (a real FormatSpec whose
  // formatType has no mapped timeline section).
  unmapped_thing: "some_format_with_no_timeline_section",
};

function fakeSpecForItemType(calls) {
  return (itemType) => {
    calls.push(itemType);
    const formatType = FORMAT_BY_ITEM_TYPE[itemType];
    return formatType ? { formatType } : undefined;
  };
}

// Mirrors the real TIMELINE_SECTION_BY_FORMAT's SHAPE (format_type -> truthy entry) for every format
// that DOES carry a mapped timeline section -- deliberately omits "some_format_with_no_timeline_section".
const FAKE_TIMELINE_SECTION_BY_FORMAT = Object.freeze({
  regulatory_fact_document: Object.freeze({ key: "14", heading: "Confirmed Regulatory Timeline" }),
  market_signal_brief: Object.freeze({ key: "3", heading: "Expected Trajectory and Conversion Triggers" }),
  research_summary: Object.freeze({ key: "5", heading: "What the Finding Does Not Resolve" }),
  operations_profile: Object.freeze({ key: "7", heading: "Pending Changes That Shift the Calculus" }),
  technology_profile: Object.freeze({ key: "7", heading: "Time-to-Market, Procurement Window, and Action" }),
});

const REG_ENTRIES = [{ date: "1 March 2027", label: "First compliance deadline", source: null }];
const NON_REG_ENTRIES = [{ date: "12 August 2026", label: "A dated milestone", source: null }];

function fakeExtractRegulationSections(calls) {
  return (fullBrief) => {
    calls.push(fullBrief);
    if (fullBrief === "REG_BODY_WITH_14") {
      return { "14": { kind: "timeline", entries: REG_ENTRIES } };
    }
    return {}; // no section 14 at all
  };
}

function fakeFindTimelineSectionFor(calls) {
  return (body, formatType) => {
    calls.push({ body, formatType });
    if (body === "NON_REG_BODY_WITH_OWN_SECTION" && formatType !== "regulatory_fact_document") {
      return { heading: "own section", contentMarkdown: "NON_REG_CONTENT", firstParagraphs: [], hasContent: true };
    }
    return null; // format's own section absent from this body
  };
}

function fakeParseTimeline(calls) {
  return (contentMarkdown) => {
    calls.push(contentMarkdown);
    return contentMarkdown === "NON_REG_CONTENT" ? NON_REG_ENTRIES : [];
  };
}

function makeDeps() {
  const calls = { specForItemType: [], extractRegulationSections: [], findTimelineSectionFor: [], parseTimeline: [] };
  return {
    calls,
    deps: {
      specForItemType: fakeSpecForItemType(calls.specForItemType),
      extractRegulationSections: fakeExtractRegulationSections(calls.extractRegulationSections),
      TIMELINE_SECTION_BY_FORMAT: FAKE_TIMELINE_SECTION_BY_FORMAT,
      findTimelineSectionFor: fakeFindTimelineSectionFor(calls.findTimelineSectionFor),
      parseTimeline: fakeParseTimeline(calls.parseTimeline),
    },
  };
}

// PRE-D31 REFERENCE (transcribed verbatim from `git show 964b0421:fsi-app/scripts/backfill-item-timelines.mjs`
// lines 107-114 -- the per-item resolution body inside that version's main() loop, reproduced here because
// that version exports no matching pure function to import and swap in directly). Before D31, every scoped
// item (already filtered to REG_FAMILY at the query level) was resolved UNCONDITIONALLY through
// extractRegulationSections(...)["14"] -- no per-format branch existed at all. Kept ONLY for the case-4
// regression proof below; never used by resolveTimelineEntriesForItem itself.
function preD31ResolveTimelineEntriesForItem(it, deps) {
  const sec = deps.extractRegulationSections(it.full_brief)["14"];
  return sec && sec.kind === "timeline" ? sec.entries : [];
}

test("case 1: a non-regulatory item_type resolves its timeline through its own mapped section", () => {
  const { deps, calls } = makeDeps();
  const it = { item_type: "market_signal", full_brief: "NON_REG_BODY_WITH_OWN_SECTION" };
  const entries = resolveTimelineEntriesForItem(it, deps);

  assert.deepEqual(entries, NON_REG_ENTRIES);
  // Routed through findTimelineSectionFor + parseTimeline with the format's OWN formatType...
  assert.deepEqual(calls.findTimelineSectionFor, [{ body: "NON_REG_BODY_WITH_OWN_SECTION", formatType: "market_signal_brief" }]);
  assert.deepEqual(calls.parseTimeline, ["NON_REG_CONTENT"]);
  // ...and NEVER through the regulatory-only extractRegulationSections path.
  assert.deepEqual(calls.extractRegulationSections, []);
});

test("case 2: a regulatory item still resolves through section 14, never findTimelineSectionFor", () => {
  const { deps, calls } = makeDeps();
  const it = { item_type: "regulation", full_brief: "REG_BODY_WITH_14" };
  const entries = resolveTimelineEntriesForItem(it, deps);

  assert.deepEqual(entries, REG_ENTRIES);
  assert.deepEqual(calls.extractRegulationSections, ["REG_BODY_WITH_14"]);
  // Byte-for-byte pre-D31 path: regulatory never calls the per-format lookup or its parser.
  assert.deepEqual(calls.findTimelineSectionFor, []);
  assert.deepEqual(calls.parseTimeline, []);
});

test("case 3a: an item whose format has no mapped timeline section yields no entries", () => {
  const { deps, calls } = makeDeps();
  const it = { item_type: "unmapped_thing", full_brief: "SOME_BODY" };
  const entries = resolveTimelineEntriesForItem(it, deps);

  assert.deepEqual(entries, []);
  assert.deepEqual(calls.extractRegulationSections, []);
  assert.deepEqual(calls.findTimelineSectionFor, []);
  assert.deepEqual(calls.parseTimeline, []);
});

test("case 3b: an item_type with no FormatSpec at all yields no entries", () => {
  const { deps, calls } = makeDeps();
  const it = { item_type: "not-a-real-item-type", full_brief: "SOME_BODY" };
  const entries = resolveTimelineEntriesForItem(it, deps);

  assert.deepEqual(entries, []);
  assert.deepEqual(calls.extractRegulationSections, []);
  assert.deepEqual(calls.findTimelineSectionFor, []);
});

test("case 3c: a mapped non-regulatory format whose section is absent from the body yields no entries", () => {
  const { deps } = makeDeps();
  const it = { item_type: "market_signal", full_brief: "SOME OTHER BODY WITH NO MAPPED SECTION" };
  const entries = resolveTimelineEntriesForItem(it, deps);
  assert.deepEqual(entries, []);
});

test("case 4: the reverted pre-D31 behaviour (unconditional section-14 lookup) makes case 1 fail", () => {
  // Method: reasoning line-by-line against `git show 964b0421:fsi-app/scripts/backfill-item-timelines.mjs`
  // (saved to a temp path and read in full during this fix round), made EXECUTABLE by transcribing that
  // version's exact per-item resolution body (lines 107-114) into preD31ResolveTimelineEntriesForItem
  // above and running it against the IDENTICAL case-1 fixture. The pre-D31 file could not be swapped in
  // directly for an in-process function-level test: it has no exported pure function matching this
  // signature (the whole per-item resolution lived inline inside its main()'s for-loop, which itself ran
  // unconditionally on import with no injectable client) -- see this file's own header.
  const { deps, calls } = makeDeps();
  const it = { item_type: "market_signal", full_brief: "NON_REG_BODY_WITH_OWN_SECTION" };

  const entries = preD31ResolveTimelineEntriesForItem(it, deps);

  // The pre-D31 code only ever asked extractRegulationSections for "14"; this body has no "14" section
  // (it has the market_signal_brief's own mapped section instead), so extractRegulationSections(...)["14"]
  // is undefined and entries is empty -- the exact defect D31 fixed.
  assert.deepEqual(entries, []);
  assert.deepEqual(calls.extractRegulationSections, ["NON_REG_BODY_WITH_OWN_SECTION"]);
  // The pre-D31 code never even looked at findTimelineSectionFor -- that function did not exist yet.
  assert.deepEqual(calls.findTimelineSectionFor, []);
  // Contrast: the CURRENT (post-D31) resolver DOES yield rows for the identical fixture (case 1, above) --
  // proving the difference is the D31 routing fix, not a difference in the fixture.
  const { deps: freshDeps } = makeDeps();
  const currentEntries = resolveTimelineEntriesForItem(it, freshDeps);
  assert.deepEqual(currentEntries, NON_REG_ENTRIES);
});
