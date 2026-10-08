// statements.test.mjs: proofs for the Operations industry-level statements (lane S8-F2).
// Executed by the src/lib/operations glob in run-test-suite.sh. Fixture data only, no database.
//
// What is proven: eligibility (two sourced regions, four origin classes), the sentence shape, the
// named-missing tail, native units with an index only when every component shares the unit, the
// verdict-word attack (a verdict word in a fact label is never echoed), the one-region absence, and
// generality (three different dimensions plus a mixed-unit group, rule 19: examples are not scope).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStatements,
  humaniseFactLabel,
  hasVerdictWord,
  ELIGIBLE_ORIGIN_CLASSES,
  NEEDS_SECOND_REGION,
  VERDICT_PATTERN,
} from "./statements.mjs";

// U+2014 and U+2013 written as escapes: discipline rule 022 bans the literal glyphs in added source.
const EM = "\u2014";
const EN = "\u2013";

const REGIONS = [
  { code: "EU", label: "European Union", displayOrder: 1 },
  { code: "US", label: "United States", displayOrder: 2 },
  { code: "UK", label: "United Kingdom", displayOrder: 3 },
  { code: "UAE", label: "UAE, Dubai", displayOrder: 4 },
];
const DIMS = ["regulatory_feasibility", "labor_markets", "regional_resources", "infrastructure"];

// An OperationsFact (supabase-server.ts read shape), enveloped and official unless overridden.
function fact(over = {}) {
  return {
    region_code: "EU",
    dimension: "labor_markets",
    fact_label: "Warehouse worker median wage",
    value: "legacy text",
    status: null,
    trend: null,
    source_name: "Fixture Statistics Office",
    source_url: "https://example.org/stats",
    source_tier: 1,
    source_note: null,
    last_updated: "2026-09-01T00:00:00Z",
    freshness: "current",
    value_numeric: 40.4,
    unit: "EUR/hour",
    currency: "EUR",
    derivation: "observed",
    origin_class: "official",
    source_key: "fixture-src",
    source_ref: "fx_dataset_1",
    n_observations: 50,
    method_version: null,
    as_at_date: "2026-09-01",
    reference_period: "2025",
    ...over,
  };
}

const build = (facts, extra = {}) => buildStatements({ facts, regions: REGIONS, dimensions: DIMS, ...extra });

test("two sourced regions produce one sentence in the specified shape, with a components row per region", () => {
  const out = build([
    fact({ region_code: "EU", value_numeric: 40.4, source_name: "Eurostat", reference_period: "2025" }),
    fact({ region_code: "US", value_numeric: 36.1, unit: "EUR/hour", source_name: "BLS", reference_period: "2024" }),
  ]);
  assert.equal(out.length, 1);
  const s = out[0];
  assert.equal(s.dimension, "labor_markets");
  assert.equal(s.factLabel, "Warehouse worker median wage");
  assert.equal(s.absence, undefined);
  assert.ok(
    s.sentence.startsWith(
      "Warehouse worker median wage: European Union 40.4 EUR/hour (Eurostat, 2025), index 100 (base European Union = 100); United States 36.1 EUR/hour (BLS, 2024), index 89 (base European Union = 100).",
    ),
    s.sentence,
  );
  assert.equal(s.components.length, 2);
  assert.deepEqual(s.components.map((c) => c.regionCode), ["EU", "US"]);
  const c = s.components[0];
  assert.equal(c.sourceTier, 1);
  assert.equal(c.sourceName, "Eurostat");
  assert.equal(c.datasetRef, "fx_dataset_1");
  assert.equal(c.referencePeriod, "2025");
  assert.equal(c.statusFlag, "Observed");
  assert.equal(c.asAtDate, "2026-09-01");
});

test("regions follow display_order, not the order the facts arrive", () => {
  const out = build([
    fact({ region_code: "UK", unit: "EUR/hour", value_numeric: 30 }),
    fact({ region_code: "EU", value_numeric: 40 }),
  ]);
  assert.deepEqual(out[0].components.map((c) => c.regionCode), ["EU", "UK"]);
  const reordered = buildStatements({
    facts: [fact({ region_code: "UK", value_numeric: 30 }), fact({ region_code: "EU", value_numeric: 40 })],
    regions: [
      { code: "UK", label: "United Kingdom", displayOrder: 1 },
      { code: "EU", label: "European Union", displayOrder: 2 },
    ],
    dimensions: DIMS,
  });
  assert.deepEqual(reordered[0].components.map((c) => c.regionCode), ["UK", "EU"]);
});

test("roster regions with no value are named at the end, never omitted", () => {
  const out = build([fact({ region_code: "EU" }), fact({ region_code: "US", value_numeric: 36 })]);
  assert.ok(out[0].sentence.endsWith(" United Kingdom, UAE, Dubai: not available."), out[0].sentence);
});

test("a region holding only an ineligible fact (free text, modelled, community) is not stated as a value", () => {
  const out = build([
    fact({ region_code: "EU" }),
    fact({ region_code: "US", value_numeric: 36 }),
    fact({ region_code: "UK", origin_class: "modelled" }),
    fact({ region_code: "UAE", origin_class: "community" }),
  ]);
  assert.equal(out[0].components.length, 2);
  assert.ok(out[0].sentence.includes("United Kingdom, UAE, Dubai: not available."), out[0].sentence);
  assert.ok(!/modelled|community/i.test(out[0].sentence));
});

test("eligibility is exactly official, verified, partner and derived", () => {
  assert.deepEqual([...ELIGIBLE_ORIGIN_CLASSES].sort(), ["derived", "official", "partner", "verified"]);
  for (const oc of ELIGIBLE_ORIGIN_CLASSES) {
    const out = build([fact({ region_code: "EU", origin_class: oc }), fact({ region_code: "US", origin_class: oc })]);
    assert.equal(out[0].sentence !== null, true, oc);
  }
  for (const oc of ["modelled", "community", "community-corroborated", null]) {
    const out = build([fact({ region_code: "EU", origin_class: oc }), fact({ region_code: "US", origin_class: oc })]);
    assert.equal(out.length, 0, `${oc} is not eligible, so the group has nothing sourced to state`);
  }
});

test("a free-text fact (no value_numeric or no unit) is never eligible", () => {
  const out = build([
    fact({ region_code: "EU", value_numeric: null }),
    fact({ region_code: "US", unit: null }),
  ]);
  assert.equal(out.length, 0);
});

test("ATTACK: one sourced region yields the absence line and no sentence and no placeholder figure", () => {
  const out = build([fact({ region_code: "EU" }), fact({ region_code: "US", origin_class: "modelled" })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].absence, NEEDS_SECOND_REGION);
  assert.equal(NEEDS_SECOND_REGION, "needs a second sourced region");
  assert.equal(out[0].sentence, null);
  assert.equal(out[0].components.length, 1, "the one held figure is still shown as a component");
  assert.equal(out[0].index, undefined);
});

test("a group with no sourced region at all produces no statement", () => {
  assert.deepEqual(build([fact({ region_code: "EU", origin_class: "community" })]), []);
  assert.deepEqual(build([]), []);
  assert.deepEqual(build(undefined), []);
});

test("ATTACK: a verdict word in a fact label is not echoed into the sentence (the group is withheld)", () => {
  for (const word of ["Automate", "hire", "cheaper", "BETTER"]) {
    const label = `${word} warehouse labour rate`;
    const out = build([
      fact({ region_code: "EU", fact_label: label }),
      fact({ region_code: "US", fact_label: label, value_numeric: 30 }),
    ]);
    const all = JSON.stringify(out);
    assert.ok(!all.toLowerCase().includes(word.toLowerCase()), `"${word}" must not appear anywhere in the output`);
    assert.equal(out.length, 0);
  }
  assert.equal(hasVerdictWord("cheaper than"), true);
  assert.equal(hasVerdictWord("Hiring cost loading"), false, "hiring is a labour-chain term, not the verdict word hire");
  assert.equal(hasVerdictWord("Median hourly wage"), false);
  assert.ok(VERDICT_PATTERN instanceof RegExp);
});

test("no verdict word appears in any statement string over a mixed fixture", () => {
  const out = build([
    fact({ region_code: "EU" }),
    fact({ region_code: "US", value_numeric: 36 }),
    fact({ region_code: "EU", dimension: "regional_resources", fact_label: "Industrial electricity price", unit: "EUR/kWh", value_numeric: 0.12 }),
    fact({ region_code: "UK", dimension: "regional_resources", fact_label: "Industrial electricity price", unit: "GBP/kWh", value_numeric: 0.2 }),
  ]);
  assert.ok(out.length >= 2);
  const text = JSON.stringify(out);
  assert.equal(VERDICT_PATTERN.test(text), false, text);
});

test("native units, no conversion: a mixed-unit group renders without an index", () => {
  const out = build([
    fact({ region_code: "EU", dimension: "regional_resources", fact_label: "Industrial electricity price", unit: "EUR/kWh", currency: "EUR", value_numeric: 0.12 }),
    fact({ region_code: "UK", dimension: "regional_resources", fact_label: "Industrial electricity price", unit: "GBP/kWh", currency: "GBP", value_numeric: 0.2 }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].index, undefined);
  assert.ok(!/index|base /i.test(out[0].sentence), out[0].sentence);
  assert.ok(out[0].sentence.includes("European Union 0.12 EUR/kWh"));
  assert.ok(out[0].sentence.includes("United Kingdom 0.2 GBP/kWh"));
  assert.ok(out[0].components.every((c) => c.index === null));
});

test("same unit string but different currencies is treated as mixed: no index", () => {
  const out = build([
    fact({ region_code: "EU", unit: "per hour", currency: "EUR", value_numeric: 40 }),
    fact({ region_code: "UK", unit: "per hour", currency: "GBP", value_numeric: 30 }),
  ]);
  assert.equal(out[0].index, undefined);
  assert.ok(!/index/.test(out[0].sentence));
});

test("same unit: the index is appended per component against an explicit base region and names the base", () => {
  const out = build(
    [fact({ region_code: "EU", value_numeric: 40 }), fact({ region_code: "US", value_numeric: 50 }), fact({ region_code: "UK", value_numeric: 20 })],
    { baseRegionCode: "US" },
  );
  const s = out[0];
  assert.deepEqual(s.index, { baseRegionCode: "US", baseRegionLabel: "United States", unit: "EUR/hour" });
  assert.deepEqual(s.components.map((c) => c.index), [80, 100, 40]);
  assert.equal((s.sentence.match(/\(base United States = 100\)/g) ?? []).length, 3);
});

test("with no base supplied, the base is the one compare mode implies: the first region in column order", () => {
  const out = build([fact({ region_code: "US", value_numeric: 50 }), fact({ region_code: "EU", value_numeric: 40 })]);
  assert.equal(out[0].index.baseRegionCode, "EU");
  assert.deepEqual(out[0].components.map((c) => c.index), [100, 125]);
});

test("a base region with no value in the group means no index for that group, never a borrowed base", () => {
  const out = build([fact({ region_code: "EU", value_numeric: 40 }), fact({ region_code: "US", value_numeric: 50 })], { baseRegionCode: "UAE" });
  assert.equal(out[0].index, undefined);
  assert.ok(!/index/.test(out[0].sentence));
});

test("a base value of zero means no index (division is undefined)", () => {
  const out = build([fact({ region_code: "EU", value_numeric: 0 }), fact({ region_code: "US", value_numeric: 50 })]);
  assert.equal(out[0].index, undefined);
  assert.ok(out[0].components.every((c) => c.index === null));
});

test("the label is humanised and the producer's region prefix is stripped so one label groups across regions", () => {
  assert.equal(humaniseFactLabel(`EU ${EM} Electricity price, band IC`, "EU"), "Electricity price, band IC");
  assert.equal(humaniseFactLabel(`us ${EN} warehouse_worker annual wage`, "US"), "Warehouse worker annual wage");
  assert.equal(humaniseFactLabel("EU: Leave and absence loading", "EU"), "Leave and absence loading");
  assert.equal(humaniseFactLabel("Warehouse labor rates", "EU"), "Warehouse labor rates");
  const out = build([
    fact({ region_code: "EU", fact_label: `EU ${EM} Labour cost, business economy` }),
    fact({ region_code: "US", fact_label: `US ${EM} Labour cost, business economy`, value_numeric: 30 }),
  ]);
  assert.equal(out.length, 1, "two region-prefixed labels are the same fact label");
  assert.equal(out[0].factLabel, "Labour cost, business economy");
});

test("GENERALITY (rule 19): three different dimensions each yield a statement, in dimension order", () => {
  const out = build([
    fact({ region_code: "EU", dimension: "infrastructure", fact_label: "Grid connection lead time", unit: "months", currency: null, value_numeric: 24 }),
    fact({ region_code: "US", dimension: "infrastructure", fact_label: "Grid connection lead time", unit: "months", currency: null, value_numeric: 18 }),
    fact({ region_code: "EU", dimension: "regional_resources", fact_label: "Industrial electricity price", unit: "EUR/kWh", value_numeric: 0.12 }),
    fact({ region_code: "UK", dimension: "regional_resources", fact_label: "Industrial electricity price", unit: "EUR/kWh", value_numeric: 0.2 }),
    fact({ region_code: "EU", dimension: "labor_markets" }),
    fact({ region_code: "US", dimension: "labor_markets", value_numeric: 36 }),
  ]);
  assert.deepEqual(out.map((s) => s.dimension), ["labor_markets", "regional_resources", "infrastructure"]);
  assert.ok(out.every((s) => typeof s.sentence === "string" && s.components.length === 2));
  // Dimension and label are data, not code: an unseen dimension and label work with no change.
  const other = buildStatements({
    facts: [
      fact({ region_code: "EU", dimension: "some_future_dimension", fact_label: "Any measured thing", unit: "kg", currency: null, value_numeric: 5 }),
      fact({ region_code: "US", dimension: "some_future_dimension", fact_label: "Any measured thing", unit: "kg", currency: null, value_numeric: 6 }),
    ],
    regions: REGIONS,
  });
  assert.equal(other.length, 1);
  assert.equal(other[0].dimension, "some_future_dimension");
});

test("facts for a region or dimension outside the roster are dropped, not invented into the grid", () => {
  const out = build([
    fact({ region_code: "EU" }),
    fact({ region_code: "XX", value_numeric: 1 }),
    fact({ region_code: "US", dimension: "not_a_dimension" }),
  ]);
  assert.equal(out[0].absence, NEEDS_SECOND_REGION);
  assert.equal(out[0].components.length, 1);
});

test("two facts for one region in a group: the strongest origin class wins, deterministically", () => {
  const a = build([
    fact({ region_code: "EU", origin_class: "derived", value_numeric: 1 }),
    fact({ region_code: "EU", fact_label: `EU ${EM} Warehouse worker median wage`, origin_class: "official", value_numeric: 2 }),
    fact({ region_code: "US", value_numeric: 3 }),
  ]);
  const b = build([
    fact({ region_code: "US", value_numeric: 3 }),
    fact({ region_code: "EU", fact_label: `EU ${EM} Warehouse worker median wage`, origin_class: "official", value_numeric: 2 }),
    fact({ region_code: "EU", origin_class: "derived", value_numeric: 1 }),
  ]);
  assert.equal(a[0].components[0].value, 2);
  assert.deepEqual(a, b);
});

test("provenance fields the row lacks stay null: nothing is invented", () => {
  const out = build([
    fact({ region_code: "EU", source_name: null, source_key: null, source_ref: null, reference_period: null, derivation: null, as_at_date: null, source_tier: null, source_url: null }),
    fact({ region_code: "US", value_numeric: 36 }),
  ]);
  const c = out[0].components[0];
  assert.equal(c.sourceName, null);
  assert.equal(c.datasetRef, null);
  assert.equal(c.referencePeriod, null);
  assert.equal(c.statusFlag, null);
  assert.equal(c.asAtDate, null);
  assert.equal(c.sourceTier, null);
  assert.ok(out[0].sentence.includes("European Union 40.4 EUR/hour, index 100"), out[0].sentence);
});

test("no dash glyph is emitted by the generator over a mixed fixture", () => {
  const out = build([
    fact({ region_code: "EU", fact_label: `EU ${EM} Labour cost` }),
    fact({ region_code: "US", fact_label: `US ${EM} Labour cost`, value_numeric: 30 }),
  ]);
  assert.ok(!/[\u2013\u2014]/.test(JSON.stringify(out)));
});

test("values are rounded by the house rule (formatEnvelopedValue), so a statement and a matrix card never disagree", () => {
  // n_observations null supports one significant figure (envelope.mjs significantFigures); the
  // statement reuses that rounding rather than printing a raw float.
  const out = build([
    fact({ region_code: "EU", value_numeric: 40.4, n_observations: null }),
    fact({ region_code: "US", value_numeric: 36.1, n_observations: null }),
  ]);
  assert.ok(out[0].sentence.includes("European Union 40 EUR/hour"), out[0].sentence);
  assert.ok(out[0].sentence.includes("United States 40 EUR/hour"), out[0].sentence);
  // The index is computed from the held numbers, not from the rounded text.
  assert.deepEqual(out[0].components.map((c) => c.index), [100, 89]);
});

