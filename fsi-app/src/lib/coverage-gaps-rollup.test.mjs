// coverage-gaps-rollup.test.mjs — proves rollupRegions()'s covered/partial/gap math against the
// source_type lookup + classifier-fallback path (migration 288 refactor). Pure module, zero npm
// dependencies — see coverage-gaps-rollup.ts's header for why this split exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rollupRegions, sourceTypesFor } from "./coverage-gaps-rollup.ts";

// A small, hand-rolled region fixture — NOT the real TIER1_PRIORITY_REGIONS — so these assertions
// never drift when the priority-jurisdiction list changes. rollupRegions accepts `regions` as its
// second (optional) argument for exactly this reason.
const REGIONS = [
  {
    id: "test-region",
    name: "Test region",
    jurisdictions: [
      { iso: "ZZ-A", name: "Alpha" },
      { iso: "ZZ-B", name: "Beta" },
      { iso: "ZZ-C", name: "Gamma" },
    ],
  },
];

test("sourceTypesFor: a non-empty source_type array is used verbatim, classifier not consulted", () => {
  assert.deepEqual(sourceTypesFor({ name: "irrelevant", url: "irrelevant", source_type: ["gazette"] }), ["gazette"]);
});

test("sourceTypesFor: null source_type falls back to classifySourceType", () => {
  assert.deepEqual(
    sourceTypesFor({ name: "US Environmental Protection Agency", url: "https://www.epa.gov", source_type: null }),
    ["environmental_body"],
  );
});

test("sourceTypesFor: empty-array source_type ([]) is treated as not-yet-classified, falls back to classifier (never asserted as 'zero types')", () => {
  assert.deepEqual(
    sourceTypesFor({ name: "US Congress", url: "https://www.congress.gov", source_type: [] }),
    ["legislature"],
  );
});

test("sourceTypesFor: unclassifiable name/url with null source_type -> []", () => {
  assert.deepEqual(sourceTypesFor({ name: "Random Trade Press", url: "https://example.com", source_type: null }), []);
});

test("rollupRegions: env + legislature on separate rows for the same iso -> covered", () => {
  const rows = [
    { name: "Ministry", url: "https://x.example", jurisdictions: ["ZZ-A"], source_type: ["environmental_body"] },
    { name: "Parliament", url: "https://y.example", jurisdictions: ["ZZ-A"], source_type: ["legislature"] },
  ];
  const [row] = rollupRegions(rows, REGIONS);
  assert.equal(row.covered, 1);
  assert.equal(row.partial, 0);
  assert.equal(row.gap, 2); // ZZ-B, ZZ-C
  assert.equal(row.total, 3);
});

test("rollupRegions: only env, no legislature -> partial, not covered", () => {
  const rows = [
    { name: "Ministry", url: "https://x.example", jurisdictions: ["ZZ-A"], source_type: ["environmental_body"] },
  ];
  const [row] = rollupRegions(rows, REGIONS);
  assert.equal(row.covered, 0);
  assert.equal(row.partial, 1);
  assert.equal(row.gap, 2);
});

test("rollupRegions: zero source rows for a jurisdiction -> gap", () => {
  const [row] = rollupRegions([], REGIONS);
  assert.equal(row.gap, 3);
  assert.equal(row.covered, 0);
  assert.equal(row.partial, 0);
});

test("rollupRegions: one row carrying BOTH types (overlap case) covers alone", () => {
  const rows = [
    { name: "Both", url: "https://z.example", jurisdictions: ["ZZ-A"], source_type: ["environmental_body", "legislature"] },
  ];
  const [row] = rollupRegions(rows, REGIONS);
  assert.equal(row.covered, 1);
});

test("rollupRegions: a row with an unrelated source_type (e.g. 'news') and no fallback match leaves the jurisdiction gapped, never falsely covered", () => {
  const rows = [
    { name: "FreightWaves", url: "https://www.freightwaves.com", jurisdictions: ["ZZ-A"], source_type: ["news"] },
  ];
  const [row] = rollupRegions(rows, REGIONS);
  assert.equal(row.covered, 0);
  assert.equal(row.partial, 1); // has a source row, just not the two types coverage needs
});

test("rollupRegions: source_type NULL falls back to the classifier and still resolves coverage correctly", () => {
  const rows = [
    { name: "US Environmental Protection Agency", url: "https://www.epa.gov", jurisdictions: ["ZZ-B"], source_type: null },
    { name: "US Congress", url: "https://www.congress.gov", jurisdictions: ["ZZ-B"], source_type: null },
  ];
  const [row] = rollupRegions(rows, REGIONS);
  assert.equal(row.covered, 1);
  assert.equal(row.gap, 2); // ZZ-A, ZZ-C
});

test("rollupRegions: rows with jurisdictions outside the given regions are ignored (no crash, no phantom coverage)", () => {
  const rows = [
    { name: "Ministry", url: "https://x.example", jurisdictions: ["NOT-A-REAL-ISO"], source_type: ["environmental_body"] },
  ];
  const out = rollupRegions(rows, REGIONS);
  assert.equal(out[0].covered, 0);
  assert.equal(out[0].gap, 3);
});

test("rollupRegions: a row with jurisdictions:null does not throw", () => {
  const rows = [{ name: "x", url: "https://x.example", jurisdictions: null, source_type: ["legislature"] }];
  assert.doesNotThrow(() => rollupRegions(rows, REGIONS));
});

test("rollupRegions: defaults to the real TIER1_PRIORITY_REGIONS when `regions` is omitted (import wiring, not a math assertion)", () => {
  const out = rollupRegions([]);
  assert.ok(Array.isArray(out));
  assert.ok(out.length > 0);
  assert.ok(out[0].region && typeof out[0].region.id === "string");
});
