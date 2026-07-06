// @ts-check
// Red-then-green for the category-2 fix (size-cap doctrine). RED: a binding fact placed BEYOND the old 12KB
// boundary is invisible to the old silent slice. GREEN: post-fix the full section (incl. the far fact) reaches
// the grounder, and a pathological over-ceiling section is SURFACED (truncated=true + fullLength), never silent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareSectionForGrounding, GROUND_SECTION_HARD_CEILING_CHARS } from "./section-grounding.mjs";

const OLD_CAP = 12000; // the dead silent slice

test("RED (old behavior): a binding fact past 12KB is INVISIBLE to the old slice(0,12000)", () => {
  const fact = "The operator MUST surrender allowances by 31 May 2029.";
  const section = "x".repeat(15000) + " " + fact; // fact sits at ~15KB, beyond the old cap
  const oldSlice = section.slice(0, OLD_CAP);
  assert.ok(!oldSlice.includes(fact), "the old 12KB slice hides the far fact (the category-2 defect)");
});

test("GREEN: post-fix the FULL section (incl. the fact past 12KB) reaches the grounder", () => {
  const fact = "The operator MUST surrender allowances by 31 May 2029.";
  const section = "x".repeat(15000) + " " + fact;
  const r = prepareSectionForGrounding(section);
  assert.equal(r.truncated, false);
  assert.equal(r.fullLength, section.length);
  assert.ok(r.text.includes(fact), "the far fact is now visible to the grounder");
});

test("the largest real section (~32KB) passes COMPLETE and unflagged (ceiling never binds in normal op)", () => {
  const real = "y".repeat(32228); // max observed in the corpus
  const r = prepareSectionForGrounding(real);
  assert.equal(r.truncated, false);
  assert.equal(r.text.length, real.length);
  assert.ok(GROUND_SECTION_HARD_CEILING_CHARS > 32228 * 5, "ceiling is far above any real section");
});

test("SURFACED, not silent: a pathological section OVER the ceiling reports truncated=true + fullLength", () => {
  const ceiling = 1000;
  const huge = "z".repeat(ceiling + 5000);
  const r = prepareSectionForGrounding(huge, ceiling);
  assert.equal(r.truncated, true);
  assert.equal(r.fullLength, huge.length);   // caller surfaces this via recordTruncation (coverage_gap flag)
  assert.equal(r.text.length, ceiling);
  assert.equal(r.cap, ceiling);
});

test("empty / null section is handled", () => {
  assert.equal(prepareSectionForGrounding(null).text, "");
  assert.equal(prepareSectionForGrounding("").truncated, false);
});
