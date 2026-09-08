// Structural regression test for src/components/operations/OperationsLedger.tsx (DEFECT-FIX item
// 3.3, 2026-09-07). No JSX render harness exists in this repo (see WatchButton.npmtest.mjs's own
// header for the same constraint) — this reads the component's source text to guard the contract
// point the audit named: the "Regions side by side" matrix renders all six D1-D6 dimensions, same
// order everywhere, never five with regulatory_feasibility silently dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "OperationsLedger.tsx"),
  "utf8"
);

test("DIMENSIONS carries all six D1-D6 dimensions, regulatory_feasibility first, operational_cost last", () => {
  const start = SOURCE.indexOf("const DIMENSIONS: Dimension[] = [");
  assert.notEqual(start, -1);
  const body = SOURCE.slice(start, SOURCE.indexOf("];", start));
  const order = [...body.matchAll(/db: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, [
    "regulatory_feasibility",
    "regional_resources",
    "labor_markets",
    "materials_sourcing",
    "infrastructure",
    "operational_cost",
  ]);
});

test("the matrix's dimension list is NOT filtered — MATRIX_DIMENSIONS is DIMENSIONS itself, no regulatory_feasibility exclusion survives", () => {
  assert.match(SOURCE, /const MATRIX_DIMENSIONS = DIMENSIONS;/);
  assert.doesNotMatch(
    SOURCE,
    /DIMENSIONS\.filter\(\s*\(d\)\s*=>\s*d\.key\s*!==\s*"regulatory"\s*\)/,
    "the old 5-of-6 filter must not survive under any name"
  );
});

// Lane comp-08 (2026-09-08) added artboard 08's DIMENSION facet, so the matrix's dimension list is
// now `matrixDimensions` — MATRIX_DIMENSIONS narrowed by the reader's own facet selection. The
// INVARIANT this test guards is unchanged and still the point: with no facet selected the matrix is
// fed all six, and no filter is baked into the derivation. Only the mount moved.
test("<RegionDimensionMatrix> is fed the full MATRIX_DIMENSIONS unless the reader narrows it", () => {
  assert.match(SOURCE, /dimensions=\{matrixDimensions\.map/);
  const start = SOURCE.indexOf("const matrixDimensions = useMemo(");
  assert.notEqual(start, -1, "matrixDimensions must be derived from MATRIX_DIMENSIONS in one place");
  const body = SOURCE.slice(start, start + 400);
  // The unselected default is the whole list; the only narrowing is the reader's own facet value.
  assert.match(body, /dimensionFilter\s*\?\s*MATRIX_DIMENSIONS\.filter\(\(d\) => d\.db === dimensionFilter\)\s*:\s*MATRIX_DIMENSIONS/);
});
