// Structural regression test for src/components/market/LeadTimeChart.tsx, lane L10, spec 02 section 6
// item 5. No JSX render harness in this repo for the no-npm `*.test.mjs` glob (same posture
// MarketComparativeRibbon.npmtest.mjs documents in its own header for this directory); the DOM-level
// render assertion for both states (forecastable bars vs. the honest "not forecastable" absence line)
// lives in the UX smoke spec instead (.discipline/rendering/smoke/lead-time-chart-smoke.mjs), which
// mounts the real component in a browser. This file asserts the source wiring: no fetch inside the
// component (CORR write-set contract), the two render states are mutually exclusive on
// `position.forecastable`, and the pure decision this component renders, never a fabricated position
// under any sample size, is independently and fully covered by lead-time-position.test.mjs (zero-dep,
// same directory).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(here, "LeadTimeChart.tsx"), "utf8");

test("no fetch inside the component, matches CarbonCostOverlay's 'no fetch in the component' contract", () => {
  assert.doesNotMatch(SOURCE, /\bfetch\(/);
  assert.doesNotMatch(SOURCE, /supabase/i);
});

test("derives the render state from the pure buildLeadTimePosition(), never computing a position inline", () => {
  assert.match(SOURCE, /import \{ buildLeadTimePosition, DEFAULT_MIN_SAMPLE[^}]*\} from "@\/lib\/market\/lead-time-position\.mjs";/);
  assert.match(SOURCE, /const position = buildLeadTimePosition\(rows, \{ minSample \}\);/);
});

test("the not-forecastable branch renders Absence.tsx's own sentence-shaped text treatment, never a fabricated bar", () => {
  assert.match(SOURCE, /import \{ ABSENCE_TEXT_STYLE \} from "@\/components\/ui\/Absence";/);
  assert.match(SOURCE, /!position\.forecastable \? \(/);
  assert.match(SOURCE, /Not forecastable, \{position\.reason\}/);
});

test("the forecastable branch renders the sorted rows and the cohort median, never the absence line", () => {
  assert.match(SOURCE, /position\.rows\.map\(\(entry\) =>/);
  assert.match(SOURCE, /Cohort median:/);
});

test("mounts the shared SectionCard + SectionHeading (house convention), not hand-rolled chrome", () => {
  assert.match(SOURCE, /import \{ SectionCard \} from "@\/components\/ui\/SectionCard";/);
  assert.match(SOURCE, /import \{ SectionHeading \} from "@\/components\/ui\/SectionHeading";/);
  assert.match(SOURCE, /<SectionHeading title="Lead-time position"/);
});

test("minSample defaults to DEFAULT_MIN_SAMPLE, never a silently different hardcoded number", () => {
  assert.match(SOURCE, /minSample = DEFAULT_MIN_SAMPLE/);
});

test("names the customer-marker/adjacent-industry-band gap rather than silently omitting it", () => {
  assert.match(SOURCE, /customer marker and an adjacent-industry band are not rendered/);
});
