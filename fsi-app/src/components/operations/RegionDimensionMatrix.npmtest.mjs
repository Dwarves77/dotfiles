// Structural regression test for src/components/operations/RegionDimensionMatrix.tsx (DEFECT-FIX
// item 3.3, 2026-09-07). No JSX render harness exists in this repo (see WatchButton.npmtest.mjs's
// own header for the same constraint) — this reads the component's source text to guard the
// contract point the audit named: an empty cell (no sourced facts) renders the shared `Absence`
// convention, never a bare "no data" text span and never a blank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "RegionDimensionMatrix.tsx"),
  "utf8"
);

test("imports the shared Absence part rather than a bare text span", () => {
  assert.match(SOURCE, /from "@\/components\/ui\/Absence"/);
});

test("both empty-cell branches (desktop table cell, mobile card summary) render <Absence>, never the old '— no data' / 'no data' literal", () => {
  const matches = SOURCE.match(/<Absence reason="not in primary source" \/>/g) ?? [];
  assert.equal(matches.length, 2, "one in the desktop <td> branch, one in the mobile card branch");
  assert.doesNotMatch(SOURCE, />\s*—\s*no data\s*</, "no bare em-dash 'no data' text node survives");
  assert.doesNotMatch(SOURCE, />\s*no data\s*</, "no bare 'no data' text node survives");
});
