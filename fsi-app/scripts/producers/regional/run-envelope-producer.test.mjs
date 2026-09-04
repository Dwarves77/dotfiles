// run-envelope-producer.test.mjs — the proof this orchestrator never had.
//
// THE INCIDENT THIS PINS. On 2026-08-30 the first live `--apply` of a WO-17 producer (Data producers
// run #2) died on its very first row:
//
//   Error: guardedInsert failed: null value in column "value" of relation "regional_data_facts"
//   violates not-null constraint
//
// Cause: both parsers return OBSERVATIONS, documented in their own headers as "shaped for
// buildEnvelopeRow". buildEnvelopeRow is the one home that derives `regional_data_facts.value`
// (TEXT NOT NULL, migration 106 — migration 267's envelope columns are ADDITIVE and did not relax it)
// mechanically from value_numeric + unit. The orchestrator never called it. Every layer had a green
// proof in isolation — parser against a fixture, buildEnvelopeRow against a hand-built observation,
// planUpsert against buildEnvelopeRow output — and the SEAM between them had none, so the whole chain
// was correct and unable to write a single row.
//
// The assertion below is deliberately about the LIVE TABLE'S NOT-NULL SET, not about "there is a value
// field". A candidate row that satisfies the planner but not the table is exactly the failure that
// occurred, and only a table-shaped assertion fails red on it.
//
// $0: pure, in-process, no database, no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { toCandidateRows, authorAutomateVsHireForRegions } from "./run-envelope-producer.mjs";

/**
 * Every column of public.regional_data_facts that is NOT NULL and has NO default, minus `region_id`,
 * which the orchestrator resolves from region_code immediately before the insert. Read live from
 * information_schema against project kwrsbpiseruzbfwjpvsp on 2026-08-30 (rule 0.15), not assumed:
 *   id            uuid  NOT NULL  default gen_random_uuid()   -> defaulted
 *   region_id     uuid  NOT NULL  no default                  -> supplied by the orchestrator
 *   dimension     text  NOT NULL  no default                  -> must come from the candidate row
 *   fact_label    text  NOT NULL  no default                  -> must come from the candidate row
 *   value         text  NOT NULL  no default                  -> must come from the candidate row  <-- the miss
 *   last_updated  timestamptz NOT NULL default now()          -> defaulted
 *   created_at    timestamptz NOT NULL default now()          -> defaulted
 */
const REQUIRED_FROM_CANDIDATE = Object.freeze(["dimension", "fact_label", "value"]);

/** A parser observation, in the exact shape parseNrgPc205 emits (field-for-field, from run #1's log). */
const OBSERVATION = Object.freeze({
  region_code: "EU",
  dimension: "operational_cost",
  fact_label: "EU — Electricity price for non-household consumers, Consumption of kWh - all bands (all taxes and levies)",
  value_numeric: 0.0874,
  unit: "EUR/kWh",
  currency: "EUR",
  derivation: "observed",
  origin_class: "official",
  source_key: "eurostat",
  source_ref: "nrg_pc_205:geo=EU27_2020;nrg_cons=TOT_KWH;time=2017-S2",
  method_version: "eurostat-nrg-pc-205-parser@1",
  as_at_date: "2017-07-01",
  reference_period: "2017-S2",
  n_observations: null,
});

test("a raw parser observation does NOT satisfy the table — this is what shipped, and why nothing wrote", () => {
  // Documents the incident: the observation is a complete, valid parser output and still cannot be
  // inserted. If this ever stops being true, the parsers changed shape and this seam needs re-reading.
  assert.equal(OBSERVATION.value, undefined);
});

test("toCandidateRows produces every NOT-NULL column the live table demands", () => {
  const [row] = toCandidateRows([OBSERVATION]);
  for (const col of REQUIRED_FROM_CANDIDATE) {
    assert.ok(
      row[col] !== undefined && row[col] !== null && row[col] !== "",
      `candidate row is missing NOT-NULL column "${col}" — this insert would fail closed against the live table`,
    );
  }
});

test("the derived `value` is mechanical, not authored — same numbers in, byte-identical text out", () => {
  const [a] = toCandidateRows([OBSERVATION]);
  const [b] = toCandidateRows([{ ...OBSERVATION }]);
  assert.equal(a.value, b.value);
  assert.equal(a.value, "0.0874 EUR/kWh");
});

test("the full envelope survives the conversion — nothing the parser measured is dropped", () => {
  const [row] = toCandidateRows([OBSERVATION]);
  for (const k of [
    "region_code", "dimension", "fact_label", "value_numeric", "unit", "currency", "derivation",
    "origin_class", "source_key", "source_ref", "method_version", "as_at_date", "reference_period",
  ]) {
    assert.deepEqual(row[k], OBSERVATION[k], `envelope field "${k}" changed crossing the seam`);
  }
  assert.equal(row.n_observations, null);
});

test("an observation missing a required envelope field throws rather than writing a partial row", () => {
  const { unit, ...noUnit } = OBSERVATION;
  assert.throws(() => toCandidateRows([noUnit]), /unit/);
});

test("no observations means no candidates, and never a crash", () => {
  assert.deepEqual(toCandidateRows([]), []);
  assert.deepEqual(toCandidateRows(undefined), []);
});

// ── latestPerNaturalKey: the 23505 class run #2 would have hit next ───────────────────────────────
// The live UNIQUE constraint is (region_id, dimension, fact_label). The Eurostat fact_label carries
// the consumption band, not the semester, so one live payload holds ~40 candidates per key. These
// tests pin the reduction with that exact shape.

import { latestPerNaturalKey } from "./run-envelope-producer.mjs";

function obsForPeriod(period, asAt, value) {
  return { ...OBSERVATION, reference_period: period, as_at_date: asAt, value_numeric: value };
}

test("many periods of one band reduce to exactly one row, the latest by as_at_date", () => {
  const candidates = toCandidateRows([
    obsForPeriod("2017-S2", "2017-07-01", 0.0874),
    obsForPeriod("2025-S1", "2025-01-01", 0.2011),
    obsForPeriod("2021-S1", "2021-01-01", 0.1502),
  ]);
  const reduced = latestPerNaturalKey(candidates);
  assert.equal(reduced.length, 1, "same fact_label must never yield two inserts (live UNIQUE key)");
  assert.equal(reduced[0].reference_period, "2025-S1");
  assert.equal(reduced[0].value_numeric, 0.2011);
});

test("same as_at_date ties break on reference_period, deterministically", () => {
  const candidates = toCandidateRows([
    obsForPeriod("2025-S1", "2025-01-01", 1),
    obsForPeriod("2025-S1b", "2025-01-01", 2),
  ]);
  const reduced = latestPerNaturalKey(candidates);
  assert.equal(reduced.length, 1);
  assert.equal(reduced[0].reference_period, "2025-S1b");
});

test("distinct fact_labels are never collapsed — one current row per band survives", () => {
  const bandB = { ...obsForPeriod("2025-S1", "2025-01-01", 0.2), fact_label: "EU — band B (all taxes and levies)" };
  const reduced = latestPerNaturalKey(toCandidateRows([obsForPeriod("2025-S1", "2025-01-01", 0.1), bandB]));
  assert.equal(reduced.length, 2);
});

test("order of arrival does not matter — newest wins from either direction", () => {
  const a = toCandidateRows([obsForPeriod("2017-S2", "2017-07-01", 1), obsForPeriod("2025-S1", "2025-01-01", 2)]);
  const b = toCandidateRows([obsForPeriod("2025-S1", "2025-01-01", 2), obsForPeriod("2017-S2", "2017-07-01", 1)]);
  assert.deepEqual(latestPerNaturalKey(a), latestPerNaturalKey(b));
});

// ── DAG authorship at write time (lane DAG-AUTHOR, 2026-09-04) ─────────────────────────────────────
//
// C1-loop-map.md §3: "new producer/mint data -> derivation_edges | NOBODY does this today." These prove
// authorAutomateVsHireForRegions() against fully-injected fakes — no live DB, no real entity mint.

test("authorAutomateVsHireForRegions: dry mode is a true no-op — no read, no entity resolve, no author call", async () => {
  let readCalled = false;
  const counts = await authorAutomateVsHireForRegions(["r1"], "dry", {
    readAllFn: async () => { readCalled = true; return []; },
    resolveRegionEntityIdFn: async () => { throw new Error("must not be called in dry mode"); },
    authorEdgesFn: async () => { throw new Error("must not be called in dry mode"); },
  });
  assert.equal(readCalled, false);
  assert.deepEqual(counts, { authored: 0, skippedAlready: 0, skippedIncomplete: 0, skippedNoHourlyWage: 0, skippedNoEntity: 0, refused: 0, unknownMethod: 0, errored: 0 });
});

test("authorAutomateVsHireForRegions: no region ids -> no-op, no client constructed", async () => {
  const counts = await authorAutomateVsHireForRegions([], "apply", {
    readClientFn: () => { throw new Error("must not construct a client with zero region ids"); },
  });
  assert.equal(counts.authored, 0);
});

test("authorAutomateVsHireForRegions: an annual-only wage fact (not hourly) is refused, never treated as hourly", async () => {
  const counts = await authorAutomateVsHireForRegions(["r1"], "apply", {
    sb: {},
    readAllFn: async () => [
      { id: "wage-annual", dimension: "labor_markets", value_numeric: 80000, unit: "USD/year", last_updated: "2026-01-01" },
      { id: "energy-1", dimension: "operational_cost", value_numeric: 0.12, unit: "USD/kwh", last_updated: "2026-01-01" },
    ],
    resolveRegionEntityIdFn: async () => { throw new Error("must not resolve an entity with no hourly wage fact"); },
    authorEdgesFn: async () => { throw new Error("must not be called"); },
  });
  assert.equal(counts.skippedNoHourlyWage, 1);
  assert.equal(counts.authored, 0);
});

test("authorAutomateVsHireForRegions: an hourly wage with no operational_cost fact yet is 'incomplete', not an error", async () => {
  const counts = await authorAutomateVsHireForRegions(["r1"], "apply", {
    sb: {},
    readAllFn: async () => [
      { id: "wage-1", dimension: "labor_markets", value_numeric: 38.5, unit: "USD/hour", last_updated: "2026-01-01" },
    ],
    resolveRegionEntityIdFn: async () => { throw new Error("must not resolve — pair incomplete"); },
    authorEdgesFn: async () => { throw new Error("must not be called — pair incomplete"); },
  });
  assert.equal(counts.skippedIncomplete, 1);
  assert.equal(counts.authored, 0);
});

test("authorAutomateVsHireForRegions: a region with no mintable jurisdiction entity is counted, not silently dropped", async () => {
  const counts = await authorAutomateVsHireForRegions(["r1"], "apply", {
    sb: {},
    readAllFn: async () => [
      { id: "wage-1", dimension: "labor_markets", value_numeric: 38.5, unit: "USD/hour", last_updated: "2026-01-01" },
      { id: "energy-1", dimension: "operational_cost", value_numeric: 0.12, unit: "USD/kwh", last_updated: "2026-01-01" },
    ],
    resolveRegionEntityIdFn: async () => null,
    authorEdgesFn: async () => { throw new Error("must not be called with no entity"); },
  });
  assert.equal(counts.skippedNoEntity, 1);
});

test("authorAutomateVsHireForRegions: a complete pair authors through author-edges with BOTH inputs, most-recent per dimension", async () => {
  let seenFigure = null;
  const counts = await authorAutomateVsHireForRegions(["r1"], "apply", {
    sb: { marker: "fake-sb" },
    readAllFn: async () => [
      { id: "wage-old", dimension: "labor_markets", value_numeric: 30, unit: "USD/hour", last_updated: "2025-01-01" },
      { id: "wage-new", dimension: "labor_markets", value_numeric: 38.5, unit: "USD/hour", last_updated: "2026-01-01" },
      { id: "energy-1", dimension: "operational_cost", value_numeric: 0.12, unit: "USD/kwh", last_updated: "2026-01-01" },
    ],
    resolveRegionEntityIdFn: async (sb, regionId) => `cl:jurisdiction:${regionId}`,
    authorEdgesFn: async (sb, figure) => { seenFigure = { sb, figure }; return { ok: true, action: "authored", valueId: "v1" }; },
  });
  assert.equal(counts.authored, 1);
  assert.equal(seenFigure.sb.marker, "fake-sb");
  assert.equal(seenFigure.figure.table, "regional_data_facts");
  assert.equal(seenFigure.figure.id, "wage-new", "must pick the MOST RECENT wage row, not the stale one");
  assert.equal(seenFigure.figure.entity, "cl:jurisdiction:r1");
  assert.deepEqual(seenFigure.figure.method, { id: "automate_vs_hire", version: "1.0.0" });
  assert.deepEqual(seenFigure.figure.inputs, [
    { table: "regional_data_facts", pk: "wage-new" },
    { table: "regional_data_facts", pk: "energy-1" },
  ]);
});

test("authorAutomateVsHireForRegions: 'skipped-already-authored' is counted separately from 'authored'", async () => {
  const counts = await authorAutomateVsHireForRegions(["r1"], "apply", {
    sb: {},
    readAllFn: async () => [
      { id: "wage-1", dimension: "labor_markets", value_numeric: 38.5, unit: "USD/hour", last_updated: "2026-01-01" },
      { id: "energy-1", dimension: "operational_cost", value_numeric: 0.12, unit: "USD/kwh", last_updated: "2026-01-01" },
    ],
    resolveRegionEntityIdFn: async () => "cl:jurisdiction:r1",
    authorEdgesFn: async () => ({ ok: true, action: "skipped-already-authored" }),
  });
  assert.equal(counts.skippedAlready, 1);
  assert.equal(counts.authored, 0);
});

test("authorAutomateVsHireForRegions: duplicate region ids are deduped before any read", async () => {
  let readCount = 0;
  await authorAutomateVsHireForRegions(["r1", "r1", "r1"], "apply", {
    sb: {},
    readAllFn: async () => { readCount += 1; return []; },
    resolveRegionEntityIdFn: async () => null,
    authorEdgesFn: async () => { throw new Error("unreachable"); },
  });
  assert.equal(readCount, 1);
});

test("authorAutomateVsHireForRegions: a thrown error for one region is caught, counted, and does not abort the others", async () => {
  const counts = await authorAutomateVsHireForRegions(["bad", "good"], "apply", {
    sb: {},
    readAllFn: async (table, cols, opts) => { throw new Error("simulated read failure"); },
    resolveRegionEntityIdFn: async () => "cl:jurisdiction:x",
    authorEdgesFn: async () => ({ ok: true, action: "authored", valueId: "v1" }),
  });
  assert.equal(counts.errored, 2, "both regions hit the same injected read failure");
});
