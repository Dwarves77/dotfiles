// WO-11: pure grounding/formatting for the Assistant's Operations-data context block.
// Fixtures below are shaped from LIVE rows read this session (rule 0.15, project kwrsbpiseruzbfwjpvsp,
// 2026-08-30) — the legacy fixture is a real regional_data_facts row (Singapore port-dwell, ASIA/
// infrastructure); the enveloped fixture is SYNTHETIC (0/75 live rows carry the migration-267 envelope
// today — both WO-17 producers are OFF) but uses the exact column shapes confirmed live against the
// table's schema and against src/lib/contracts/provenance-envelope.mjs's ENVELOPE_COLUMNS.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEnveloped,
  formatRegionalDataFactLine,
  formatStateCostFactLine,
  buildOperationsAskContext,
} from "./operations-ask-context.mjs";

// ---- fixtures -------------------------------------------------------------

const LEGACY_FACT = {
  region_code: "ASIA",
  dimension: "infrastructure",
  fact_label: "Singapore — Port import dwell time",
  value: "Average 4.2 days (median 3.1 days) for imports at Port of Singapore",
  status: "Available",
  trend: "flat",
  source_name: null, // source_id is NULL on this row (live: 0/75 populated)
  source_note:
    "GoComet Port Congestion Analysis — Quarterly Report · https://www.gocomet.com/blog/port-congestion-analysis-quarterly-report/ · 2025-02",
  last_updated: "2026-05-28T16:34:02.258584+00:00",
  value_numeric: null,
  unit: null,
  currency: null,
  derivation: null,
  origin_class: null,
  source_key: null,
  source_ref: null,
  n_observations: null,
  method_version: null,
  as_at_date: null,
  reference_period: null,
};

const ENVELOPED_FACT = {
  region_code: "EU",
  dimension: "operational_cost",
  fact_label: "Industrial electricity price (band IC, EU27)",
  value: "0.2043 EUR/kWh",
  status: null,
  trend: "up",
  source_name: null,
  source_note: null,
  last_updated: "2026-08-20T00:00:00.000Z",
  value_numeric: 0.2043,
  unit: "EUR/kWh",
  currency: "EUR",
  derivation: "observed",
  origin_class: "official",
  source_key: "eurostat_nrg_pc_205",
  source_ref: "nrg_pc_205, EU27, 2026-H1",
  n_observations: null,
  method_version: "v1",
  as_at_date: "2026-06-30",
  reference_period: "2026-H1",
};

const NO_SOURCE_FACT = {
  region_code: "UAE",
  dimension: "labor_markets",
  fact_label: "Hand-typed placeholder row with no citation at all",
  value: "n/a",
  status: null,
  trend: null,
  source_name: null,
  source_note: null,
  last_updated: null,
  value_numeric: null,
  unit: null,
  derivation: null,
  origin_class: null,
  source_key: null,
  source_ref: null,
  n_observations: null,
  method_version: null,
  as_at_date: null,
  reference_period: null,
};

const STATE_FACT = {
  state_code: "US-CA",
  state_label: "California",
  dimension: "labor_markets",
  fact_label: "Minimum wage",
  value: "$16.90",
  unit: "/hr",
  trend: "up",
  statute_citation: "2016 minimum-wage legislation; indexed annually (NCSL)",
  effective_date: "2026-01-01",
  source_name: "NCSL State Minimum Wage Tracker",
  origin_class: null, // live: 0/13 state_cost_facts rows have origin_class populated
};

const STATE_FACT_NO_SOURCE = {
  state_code: "US-ZZ",
  state_label: "Nowhere",
  fact_label: "Fabricated for the test",
  value: "$0.00",
  unit: "/hr",
  trend: null,
  statute_citation: null,
  effective_date: null,
  source_name: null,
  origin_class: null,
};

// ---- isEnveloped ------------------------------------------------------------

test("isEnveloped: true only when value_numeric AND unit are both usable", () => {
  assert.equal(isEnveloped(ENVELOPED_FACT), true);
  assert.equal(isEnveloped(LEGACY_FACT), false);
  assert.equal(isEnveloped({ value_numeric: 1.5, unit: null }), false, "numeric with no unit is a malformed envelope, not a valid one");
  assert.equal(isEnveloped({ value_numeric: NaN, unit: "EUR" }), false);
  assert.equal(isEnveloped({}), false);
});

// ---- legacy row grounds correctly with its source and date -----------------

test("formatRegionalDataFactLine: legacy row carries its free-text source_note and last_updated, not a fabricated as_at_date", () => {
  const line = formatRegionalDataFactLine(LEGACY_FACT);
  assert.match(line, /\[ASIA\/infrastructure\] Singapore — Port import dwell time/);
  assert.match(line, /value: Average 4\.2 days/);
  assert.match(line, /status: Available/);
  assert.match(line, /trend: flat/);
  assert.match(line, /source: GoComet Port Congestion Analysis.*gocomet\.com.*2025-02/);
  // Honesty check: the DATE shown is labelled "last updated" (ingestion time), never "as of" — as_at_date
  // is NULL on every legacy row live, so this line must not assert one it doesn't have.
  assert.match(line, /last updated: 2026-05-28/);
  assert.doesNotMatch(line, /as of:/);
  assert.doesNotMatch(line, /origin:/);
  assert.doesNotMatch(line, /derivation:/);
});

// ---- enveloped row grounds with unit, origin_class and as-of ---------------

test("formatRegionalDataFactLine: enveloped row carries unit, currency, origin_class, derivation and as_at_date — never a bare number", () => {
  const line = formatRegionalDataFactLine(ENVELOPED_FACT);
  assert.match(line, /\[EU\/operational_cost\] Industrial electricity price/);
  assert.match(line, /value: 0\.2043 EUR\/kWh EUR/);
  assert.match(line, /origin: official/);
  assert.match(line, /derivation: observed/);
  assert.match(line, /as of: 2026-06-30/);
  assert.match(line, /source: eurostat_nrg_pc_205 nrg_pc_205, EU27, 2026-H1/);
  // Honesty check the other direction: an enveloped row must not fall back to the legacy "last updated"
  // label — it has a real as_at_date and must use it.
  assert.doesNotMatch(line, /last updated:/);
});

test("formatRegionalDataFactLine: enveloped row falls back to reference_period when as_at_date is absent", () => {
  const line = formatRegionalDataFactLine({ ...ENVELOPED_FACT, as_at_date: null });
  assert.match(line, /as of: period 2026-H1/);
});

// ---- a row with no source is never silently presented as sourced -----------

test("formatRegionalDataFactLine: a row with no source_name and no source_note is explicitly marked, never silently sourced", () => {
  const line = formatRegionalDataFactLine(NO_SOURCE_FACT);
  assert.match(line, /source: no canonical source on record/);
  assert.match(line, /last updated: unknown/);
});

test("formatStateCostFactLine: sourced row renders statute + joined source + effective date", () => {
  const line = formatStateCostFactLine(STATE_FACT);
  assert.match(line, /\[US-CA California\] Minimum wage/);
  assert.match(line, /value: \$16\.90 \/hr/);
  assert.match(line, /trend: up/);
  assert.match(line, /source: NCSL State Minimum Wage Tracker/);
  assert.match(line, /effective: 2026-01-01/);
});

test("formatStateCostFactLine: a row with no source_name and no statute_citation is explicitly marked", () => {
  const line = formatStateCostFactLine(STATE_FACT_NO_SOURCE);
  assert.match(line, /source: no canonical source on record/);
  assert.match(line, /effective: unknown/);
});

// ---- assembly ---------------------------------------------------------------

test("buildOperationsAskContext: computes the sourced/unsourced region header from the actual fact set (matches live: ASIA/UAE/UK sourced, EU/US not)", () => {
  const block = buildOperationsAskContext({
    regionCodes: ["EU", "US", "ASIA", "UK", "UAE"],
    regionalFacts: [
      { ...LEGACY_FACT, region_code: "ASIA" },
      { ...LEGACY_FACT, region_code: "UK", fact_label: "UK fact" },
      { ...LEGACY_FACT, region_code: "UAE", fact_label: "UAE fact" },
    ],
    stateCostFacts: [STATE_FACT],
  });
  assert.match(block, /AVAILABLE OPERATIONS DATA/);
  assert.match(block, /Regions with sourced Operations data: ASIA, UK, UAE\./);
  assert.match(block, /EU, US: no sourced Operations data yet\./);
  assert.match(block, /Minimum wage/);
});

test("buildOperationsAskContext: a rendered fact line never fabricates an [Item: ...] citation marker (the block's own instructional preamble is allowed to mention the marker syntax)", () => {
  const block = buildOperationsAskContext({
    regionCodes: ["ASIA"],
    regionalFacts: [LEGACY_FACT],
    stateCostFacts: [],
  });
  const factLine = block.split("\n").find((l) => l.startsWith("- ["));
  assert.ok(factLine, "expected a rendered fact line");
  assert.doesNotMatch(factLine, /\[Item:/);
});

test("buildOperationsAskContext: empty input never throws, renders honest '(none fetched)' rather than a blank section", () => {
  const block = buildOperationsAskContext({ regionCodes: [], regionalFacts: [], stateCostFacts: [] });
  assert.match(block, /No Operations region roster available\./);
  assert.match(block, /\(none fetched\)/);
});

test("buildOperationsAskContext: missing arrays never throw (defensive against a partial fetch failure upstream)", () => {
  assert.doesNotThrow(() => buildOperationsAskContext({}));
});
