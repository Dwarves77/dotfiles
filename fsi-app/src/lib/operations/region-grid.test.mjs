// region-grid.test.mjs — proofs for the Operations region x dimension grid.
// Executed via the src/lib/operations glob added to run-test-suite.sh in this commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegionGrid, orderRegions, sourceUrlFromNote, sourceNameFromNote } from "./region-grid.mjs";

const REGIONS = ["ASIA", "EU", "UAE", "UK", "US"];
const DIMS = ["infrastructure", "labor_markets", "materials_sourcing", "operational_cost", "regional_resources"];

// Mirrors the live shape 2026-08-18: ASIA/UAE/UK carry 5 facts per dimension, EU and US carry none.
function liveShapedFacts() {
  const out = [];
  for (const regionKey of ["ASIA", "UAE", "UK"]) {
    for (const dimension of DIMS) {
      for (let i = 0; i < 5; i++) {
        out.push({
          regionKey,
          dimension,
          factLabel: `${regionKey} ${dimension} fact ${i}`,
          value: "SGD 0.2727/kWh (excl. GST)",
          sourceNote: "SP Group (Singapore Power) · https://www.spgroup.com.sg/tariffs",
          lastUpdated: `2026-05-2${i}T00:00:00Z`,
        });
      }
    }
  }
  return out;
}

test("the grid is complete: every region x dimension cell exists, populated or absent", () => {
  const g = buildRegionGrid({ regionKeys: REGIONS, sourcedDimensions: DIMS, facts: liveShapedFacts() });
  assert.equal(g.cells.length, 25, "5 regions x 5 dimensions");
  assert.equal(g.cells.filter((c) => c.state === "populated").length, 15);
  assert.equal(g.cells.filter((c) => c.state === "absent").length, 10);
});

test("EU and US surface as EMPTY REGIONS — the hole is a returned value, not a blank cell", () => {
  const g = buildRegionGrid({ regionKeys: REGIONS, sourcedDimensions: DIMS, facts: liveShapedFacts() });
  assert.deepEqual(g.emptyRegions, ["EU", "US"]);
  assert.equal(g.byCell["EU|operational_cost"].state, "absent");
  assert.equal(g.byCell["EU|operational_cost"].factCount, 0);
  assert.equal(g.byCell["EU|operational_cost"].lastUpdated, null, "never defaults a timestamp");
});

test("coverage carries its BASIS and never mixes sourced facts with cross-references", () => {
  const g = buildRegionGrid({
    regionKeys: REGIONS, sourcedDimensions: DIMS, facts: liveShapedFacts(),
    crossRefCountsByRegion: { EU: 42, US: 17 },
  });
  const eu = g.regionCoverage.find((r) => r.regionKey === "EU");
  assert.equal(eu.filled, 0, "EU has no sourced facts");
  assert.equal(eu.pct, 0);
  assert.equal(eu.basis, "sourced-facts");
  assert.equal(eu.crossReferenceCount, 42, "reported alongside");
  // The regression this locks out: 42 cross-refs must NOT make EU look covered.
  assert.notEqual(eu.filled, 42);
  assert.equal(g.fillRate.filled, 15);
  assert.equal(g.fillRate.total, 25);
  assert.equal(g.fillRate.pct, 60);
  assert.equal(g.fillRate.basis, "sourced-facts");
});

test("the ignored coverage table is RECONCILED, and disagreement is returned rather than resolved silently", () => {
  const g = buildRegionGrid({
    regionKeys: REGIONS, sourcedDimensions: DIMS, facts: liveShapedFacts(),
    coverageRows: [
      { regionKey: "ASIA", dimension: "operational_cost", factCount: 5 },   // agrees
      { regionKey: "EU", dimension: "operational_cost", factCount: 5 },     // claims data where none exists
      { regionKey: "UK", dimension: "labor_markets", factCount: 2 },        // undercounts
    ],
  });
  assert.equal(g.reconciliation.checked, 3);
  assert.equal(g.reconciliation.agreed, 1);
  assert.deepEqual(g.reconciliation.disagreed, [
    { cell: "EU|operational_cost", claimed: 5, actual: 0 },
    { cell: "UK|labor_markets", claimed: 2, actual: 5 },
  ]);
});

test("facts for an unknown region or dimension are dropped, never rendered as a new column", () => {
  const g = buildRegionGrid({
    regionKeys: ["EU"], sourcedDimensions: ["labor_markets"],
    facts: [
      { regionKey: "ATLANTIS", dimension: "labor_markets", factLabel: "x" },
      { regionKey: "EU", dimension: "not_a_dimension", factLabel: "y" },
      { regionKey: "EU", dimension: "labor_markets", factLabel: "real" },
    ],
  });
  assert.equal(g.cells.length, 1);
  assert.equal(g.byCell["EU|labor_markets"].factCount, 1);
  assert.equal(g.byCell["EU|labor_markets"].facts[0].factLabel, "real");
});

test("cell fact order is deterministic and lastUpdated is the newest present", () => {
  const facts = [
    { regionKey: "UK", dimension: "infrastructure", factLabel: "zulu", lastUpdated: "2026-01-01T00:00:00Z" },
    { regionKey: "UK", dimension: "infrastructure", factLabel: "alpha", lastUpdated: "2026-07-09T00:00:00Z" },
    { regionKey: "UK", dimension: "infrastructure", factLabel: "mike", lastUpdated: null },
  ];
  const a = buildRegionGrid({ regionKeys: ["UK"], sourcedDimensions: ["infrastructure"], facts });
  const b = buildRegionGrid({ regionKeys: ["UK"], sourcedDimensions: ["infrastructure"], facts: facts.slice().reverse() });
  const labels = (g) => g.byCell["UK|infrastructure"].facts.map((f) => f.factLabel);
  assert.deepEqual(labels(a), ["alpha", "mike", "zulu"]);
  assert.deepEqual(labels(a), labels(b), "same data, any input order, same render order");
  assert.equal(a.byCell["UK|infrastructure"].lastUpdated, "2026-07-09T00:00:00Z");
});

test("orderRegions puts the base first and is ARRANGEMENT only", () => {
  assert.deepEqual(orderRegions(REGIONS, "UK"), ["UK", "ASIA", "EU", "UAE", "US"]);
  assert.deepEqual(orderRegions(REGIONS, "NOPE"), REGIONS, "unknown base leaves roster order");
  assert.deepEqual(orderRegions(REGIONS, null), REGIONS);
});

test("source notes split into name and URL, and never guess when absent", () => {
  const note = "SP Group (Singapore Power) · https://www.spgroup.com.sg/tariffs";
  assert.equal(sourceUrlFromNote(note), "https://www.spgroup.com.sg/tariffs");
  assert.equal(sourceNameFromNote(note), "SP Group (Singapore Power)");
  assert.equal(sourceUrlFromNote("no link here"), null);
  assert.equal(sourceUrlFromNote(null), null);
  assert.equal(sourceNameFromNote("https://only-a-url.example"), null);
});

test("degenerate inputs never throw and never invent cells", () => {
  const g = buildRegionGrid({});
  assert.deepEqual(g.cells, []);
  assert.equal(g.fillRate.total, 0);
  assert.equal(g.fillRate.pct, 0);
  assert.deepEqual(g.emptyRegions, []);
  assert.doesNotThrow(() => buildRegionGrid({ regionKeys: null, sourcedDimensions: undefined, facts: "nope" }));
});
