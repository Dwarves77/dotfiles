// Structural regression test for LabourChain.tsx. Real mount-and-measure proof (the fixture mount,
// the hand-computed check value, the exact gap text) lives in the UX smoke spec
// (.discipline/rendering/smoke/labour-chain-smoke.mjs), which runs through Playwright and is not part
// of the no-npm node:test suite; this file pins the source-level contract so a later edit cannot
// quietly drop the no-fabrication guarantees without a review noticing, same convention as
// RegionDimensionMatrix.npmtest.mjs / AuxiliaryEnergyPanelView.npmtest.mjs (source-text regression,
// no JSX harness).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "LabourChain.tsx"), "utf8");

test("renders through the pure chain-math module, never recomputing the chain in JSX", () => {
  assert.match(SOURCE, /computeLabourChain/);
  assert.match(SOURCE, /extractLabourChainTerms/);
  // No arithmetic operator applied to a `.valueNumeric` read inside this file, the sum/divide must
  // live in labour-chain.ts, not be re-derived here.
  assert.doesNotMatch(SOURCE, /valueNumeric\s*[+\-*/]/);
});

test("every missing term renders the one closed-vocabulary Absence token, never a fabricated figure", () => {
  assert.match(SOURCE, /import \{ Absence \} from "@\/components\/ui\/Absence"/);
  assert.match(SOURCE, /<Absence reason="not in primary source" \/>/);
  // The gap state is reached through `result.suppressed` / `term.present`, never a literal "0" or
  // "N/A" standing in for a missing figure.
  assert.doesNotMatch(SOURCE, />0<\/span>/);
});

test("the title carries data-guard-title via the shared SectionHeading, not a second hand-rolled h2", () => {
  assert.match(SOURCE, /import \{ SectionHeading \} from "@\/components\/ui\/SectionHeading"/);
  assert.match(SOURCE, /<SectionHeading/);
  assert.doesNotMatch(SOURCE, /<h1|<h2|<h3/);
});

test("the final figure and the suppression state are mutually exclusive branches of result.suppressed", () => {
  assert.match(SOURCE, /result\.suppressed \?/);
  assert.match(SOURCE, /result\.finalValue as number/);
  assert.match(SOURCE, /result\.gapReason/);
});

test("the chain renders every term in declared order, divisor last (no reordering in JSX)", () => {
  assert.match(SOURCE, /result\.terms\.map/);
});
