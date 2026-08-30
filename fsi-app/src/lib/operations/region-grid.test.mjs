// region-grid.test.mjs — proofs for the Operations region x dimension grid.
// Executed via the src/lib/operations glob added to run-test-suite.sh in this commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRegionGrid,
  orderRegions,
  sourceUrlFromNote,
  sourceNameFromNote,
  isEnvelopedFact,
  indexAgainstBase,
  formatEnvelopedValue,
  originClassLabel,
  originClassStrength,
  derivationLabel,
} from "./region-grid.mjs";

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

// ── Layer 2: the envelope gate (WO-12 render rule) ──────────────────────────────────────────────

test("isEnvelopedFact: a legacy free-text fact (no envelope columns) is NOT enveloped", () => {
  const legacy = {
    regionKey: "UK", dimension: "infrastructure", factLabel: "Port dwell",
    value: "AED 0.23-0.38/kWh (tiered)", sourceNote: "SP Group · https://spgroup.com.sg",
  };
  assert.equal(isEnvelopedFact(legacy), false);
  assert.equal(isEnvelopedFact(undefined), false);
  assert.equal(isEnvelopedFact(null), false);
});

test("isEnvelopedFact: value_numeric + unit both present IS enveloped", () => {
  const enveloped = { valueNumeric: 0.2153, unit: "EUR/kWh" };
  assert.equal(isEnvelopedFact(enveloped), true);
});

test("isEnvelopedFact: a MALFORMED envelope (value_numeric with NULL unit) is NOT enveloped — the render " +
  "guard migration 267's own column comment says the DB does not add", () => {
  assert.equal(isEnvelopedFact({ valueNumeric: 0.2153, unit: null }), false);
  assert.equal(isEnvelopedFact({ valueNumeric: 0.2153, unit: "" }), false);
  assert.equal(isEnvelopedFact({ valueNumeric: 0.2153 }), false);
  // The reverse malformation — a unit with no number — is equally not enveloped.
  assert.equal(isEnvelopedFact({ valueNumeric: null, unit: "EUR/kWh" }), false);
  assert.equal(isEnvelopedFact({ valueNumeric: NaN, unit: "EUR/kWh" }), false);
});

test("indexAgainstBase: same unit, base != 0 -> a real index, 100 = parity", () => {
  const base = { valueNumeric: 0.20, unit: "EUR/kWh" };
  assert.equal(indexAgainstBase(base, base), 100);
  assert.equal(indexAgainstBase({ valueNumeric: 0.25, unit: "EUR/kWh" }, base), 125);
  assert.equal(indexAgainstBase({ valueNumeric: 0.10, unit: "EUR/kWh" }, base), 50);
});

test("indexAgainstBase: never fabricates across mismatched units, a zero base, or a non-envelope input", () => {
  const eur = { valueNumeric: 0.20, unit: "EUR/kWh" };
  const usd = { valueNumeric: 0.22, unit: "USD/kWh" };
  assert.equal(indexAgainstBase(eur, usd), null, "mismatched units");
  assert.equal(indexAgainstBase(eur, { valueNumeric: 0, unit: "EUR/kWh" }), null, "division by zero base");
  assert.equal(indexAgainstBase({ valueNumeric: 0.2153, unit: null }, eur), null, "malformed fact input");
  assert.equal(indexAgainstBase(eur, null), null, "no base selected");
  assert.equal(indexAgainstBase(eur, undefined), null);
});

test("formatEnvelopedValue: rounds to what n_observations honestly supports, never a raw float", () => {
  assert.equal(formatEnvelopedValue({ valueNumeric: 0.215327, unit: "EUR/kWh", nObservations: null }), "0.2 EUR/kWh");
  assert.equal(formatEnvelopedValue({ valueNumeric: 0.215327, unit: "EUR/kWh", nObservations: 3 }), "0.22 EUR/kWh");
  assert.equal(formatEnvelopedValue({ valueNumeric: 0.215327, unit: "EUR/kWh", nObservations: 40 }), "0.2153 EUR/kWh");
  assert.equal(formatEnvelopedValue({ valueNumeric: 0.2153, unit: null }), null, "malformed envelope formats to nothing, never a bare number");
});

test("originClassLabel / originClassStrength / derivationLabel: single lookup home, unknown codes are null", () => {
  assert.equal(originClassLabel("official"), "Official source");
  assert.equal(originClassStrength("official"), 7);
  assert.equal(originClassStrength("community"), 1);
  assert.equal(derivationLabel("observed"), "Observed");
  assert.equal(originClassLabel("not-a-real-class"), null);
  assert.equal(originClassStrength(undefined), null);
  assert.equal(derivationLabel(null), null);
});

test("buildRegionGrid: a mixed cell carries both legacy and enveloped facts through unchanged, and " +
  "factCount/state are presence-based — envelope state never changes coverage math", () => {
  const facts = [
    { regionKey: "EU", dimension: "operational_cost", factLabel: "Grid rate", value: "EUR 0.2153/kWh",
      sourceNote: "Eurostat · https://ec.europa.eu", valueNumeric: 0.2153, unit: "EUR/kWh",
      derivation: "observed", originClass: "official" },
    { regionKey: "EU", dimension: "operational_cost", factLabel: "Fuel surcharge", value: "prose only, no envelope",
      sourceNote: "hand-entered" },
  ];
  const g = buildRegionGrid({ regionKeys: ["EU"], sourcedDimensions: ["operational_cost"], facts });
  const cell = g.byCell["EU|operational_cost"];
  assert.equal(cell.state, "populated");
  assert.equal(cell.factCount, 2);
  assert.equal(cell.facts.filter(isEnvelopedFact).length, 1, "exactly the one row with value_numeric+unit");
  assert.equal(cell.facts.find((f) => f.factLabel === "Grid rate").originClass, "official", "envelope fields pass through unchanged");
});

test("degenerate inputs never throw and never invent cells", () => {
  const g = buildRegionGrid({});
  assert.deepEqual(g.cells, []);
  assert.equal(g.fillRate.total, 0);
  assert.equal(g.fillRate.pct, 0);
  assert.deepEqual(g.emptyRegions, []);
  assert.doesNotThrow(() => buildRegionGrid({ regionKeys: null, sourcedDimensions: undefined, facts: "nope" }));
});
