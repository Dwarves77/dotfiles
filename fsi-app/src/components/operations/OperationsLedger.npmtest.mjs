// Structural regression test for src/components/operations/OperationsLedger.tsx (DEFECT-FIX item
// 3.3, 2026-09-07). No JSX render harness exists in this repo (see WatchButton.npmtest.mjs's own
// header for the same constraint) — this reads the component's source text to guard the contract
// point the audit named: the "Regions side by side" matrix renders every D1-D7 dimension, same
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

const SEVEN = [
  "regulatory_feasibility",
  "regional_resources",
  "labor_markets",
  "materials_sourcing",
  "infrastructure",
  "operational_cost",
  "grid_intensity",
];

// DFIX-1 (2026-10-08, row 08-s8e5): the dimension vocabulary has ONE home, ALL_OPERATIONS_DIMENSIONS in
// src/lib/agent/formats/operations-matrix.ts (typed OperationsDimension), and the database CHECKs of
// migrations 106/109/378 spell the same list. This ledger kept a second, hand-typed copy of the db names, so the
// next dimension added to the constant would have left the page one short without a type error. DIMENSIONS now
// maps the constant; DIMENSION_DISPLAY is a Record<OperationsDimension, ...>, so tsc refuses a dimension with no
// display entry, and these tests refuse a copy that drifts.
const HERE_DIR = dirname(fileURLToPath(import.meta.url));
const MATRIX = readFileSync(resolve(HERE_DIR, "../../lib/agent/formats/operations-matrix.ts"), "utf8");
const constantOf = () => {
  const m = /export const ALL_OPERATIONS_DIMENSIONS: OperationsDimension\[\] = \[([^\]]*)\]/.exec(MATRIX);
  assert.ok(m, "ALL_OPERATIONS_DIMENSIONS is declared in operations-matrix.ts");
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
};

test("the shared dimension constant is the seven D1-D7 values, regulatory_feasibility first, grid_intensity (migration 378) last", () => {
  assert.deepEqual(constantOf(), SEVEN);
});

test("DIMENSIONS is derived from ALL_OPERATIONS_DIMENSIONS, never a second hand-typed list of db names", () => {
  assert.match(SOURCE, /import \{[^}]*ALL_OPERATIONS_DIMENSIONS[^}]*\} from "@\/lib\/agent\/formats\/operations-matrix";/);
  const start = SOURCE.indexOf("const DIMENSIONS: Dimension[] =");
  assert.notEqual(start, -1);
  const decl = SOURCE.slice(start, SOURCE.indexOf(";", start));
  assert.match(decl, /ALL_OPERATIONS_DIMENSIONS\.map\(/);
  assert.doesNotMatch(decl, /db: "/, "no literal db name inside the DIMENSIONS declaration");
});

test("every dimension of the constant has exactly one display entry, in the constant's order, and numbers run D1 to D7", () => {
  const start = SOURCE.indexOf("const DIMENSION_DISPLAY: Record<OperationsDimension,");
  assert.notEqual(start, -1, "DIMENSION_DISPLAY is a Record over the shared type");
  const body = SOURCE.slice(start, SOURCE.indexOf("};", start));
  const keys = [...body.matchAll(/^\s{2}([a-z_]+): \{/gm)].map((m) => m[1]);
  assert.deepEqual(keys, constantOf());
  assert.match(SOURCE, /ALL_OPERATIONS_DIMENSIONS\.map\(\(db, i\) => \(\{ num: i \+ 1, db,/);
});

test("the database CHECK of migration 378 spells the same seven values as the constant (one vocabulary, three homes)", () => {
  const sql = readFileSync(resolve(HERE_DIR, "../../../supabase/migrations/378_grid_intensity_dimension.sql"), "utf8");
  const m = /ADD CONSTRAINT regional_data_facts_dimension_check\s+CHECK \(dimension IN \(([^)]*)\)\);/.exec(sql);
  assert.ok(m);
  assert.deepEqual([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]), constantOf());
});

// Lane S8-E5: the masthead's dimension count is derived from the constant, so adding a dimension cannot leave
// the page claiming the old number; the matrix, the rail facet, the coverage gaps and the statements all read
// MATRIX_DIMENSIONS, so D7 reaches every one of them from the one entry.
test("the masthead dimension count is derived from MATRIX_DIMENSIONS, not typed", () => {
  const code = SOURCE.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join(" ");
  assert.equal(code.includes("six dimensions per"), false, "no typed count word in the rendered masthead");
  assert.match(SOURCE, /NUMBER_WORDS\[MATRIX_DIMENSIONS\.length\]/);
  assert.match(SOURCE, /\{DIMENSION_COUNT_WORD\} dimensions per/);
  for (const reader of ["sourcedDimensions: MATRIX_DIMENSIONS.map", "dimensions: MATRIX_DIMENSIONS.map", "return MATRIX_DIMENSIONS.map((d) => {", "filled < MATRIX_DIMENSIONS.length"]) {
    assert.ok(SOURCE.includes(reader), `reader of MATRIX_DIMENSIONS: ${reader}`);
  }
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
// fed every dimension, and no filter is baked into the derivation. Only the mount moved.
test("<RegionDimensionMatrix> is fed the full MATRIX_DIMENSIONS unless the reader narrows it", () => {
  assert.match(SOURCE, /dimensions=\{matrixDimensions\.map/);
  const start = SOURCE.indexOf("const matrixDimensions = useMemo(");
  assert.notEqual(start, -1, "matrixDimensions must be derived from MATRIX_DIMENSIONS in one place");
  const body = SOURCE.slice(start, start + 400);
  // The unselected default is the whole list; the only narrowing is the reader's own facet value.
  assert.match(body, /dimensionFilter\s*\?\s*MATRIX_DIMENSIONS\.filter\(\(d\) => d\.db === dimensionFilter\)\s*:\s*MATRIX_DIMENSIONS/);
});

// DFIX-1 (2026-10-08): the design-audit mount no longer restates the dimension list; it imports the ledger's own
// exported DIMENSIONS, so it cannot lag the shared vocabulary again (it kept six after migration 378 made seven).
test("DIMENSIONS is exported and the audit mount imports it instead of keeping a copy", () => {
  assert.match(SOURCE, /export const DIMENSIONS: Dimension\[\] = ALL_OPERATIONS_DIMENSIONS\.map/);
  const mounts = readFileSync(resolve(HERE_DIR, "../../../.discipline/rendering/audit/mounts.mjs"), "utf8");
  assert.match(mounts, /import \{ DIMENSIONS \} from '@\/components\/operations\/OperationsLedger';/);
  assert.doesNotMatch(mounts, /db: 'regulatory_feasibility'/, "no restated dimension row in the mount");
});
