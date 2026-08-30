// regional-facts-envelope.npmtest.mjs — proofs for the shared WO-17 envelope-row builder and the pure
// idempotent-upsert planner. Runs under the fsi-app/src/**/*.npmtest.mjs glob (execution-wired via
// execution-wiring.mjs surface 2, without editing run-test-suite.sh).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDisplayValue, buildEnvelopeRow, planUpsert, ENVELOPE_PAYLOAD_KEYS } from "./regional-facts-envelope.mjs";

const OBS = Object.freeze({
  region_code: "EU",
  dimension: "operational_cost",
  fact_label: "EU — Electricity price for non-household consumers, test band",
  value_numeric: 0.2043,
  unit: "EUR/kWh",
  currency: "EUR",
  derivation: "observed",
  origin_class: "official",
  source_key: "eurostat",
  source_ref: "nrg_pc_205:geo=EU27_2020;nrg_cons=X;time=2025-S1",
  method_version: "eurostat-nrg-pc-205-parser@1",
  as_at_date: "2025-01-01",
  reference_period: "2025-S1",
});

test("formatDisplayValue: mechanical, deterministic, no hand-authored wording", () => {
  assert.equal(formatDisplayValue(0.2043, "EUR/kWh"), "0.2043 EUR/kWh");
  assert.equal(formatDisplayValue(54320, "USD/year"), "54320 USD/year");
});

test("formatDisplayValue: rejects a non-finite value or missing unit (the NOT-NULL `value` column can never go blank)", () => {
  assert.throws(() => formatDisplayValue(NaN, "EUR/kWh"), /finite number/);
  assert.throws(() => formatDisplayValue(0.2, ""), /unit is required/);
  assert.throws(() => formatDisplayValue(0.2, null), /unit is required/);
});

test("buildEnvelopeRow: produces the full 267 envelope plus a mechanically-derived `value`", () => {
  const row = buildEnvelopeRow(OBS);
  assert.equal(row.value, "0.2043 EUR/kWh");
  assert.equal(row.value_numeric, 0.2043);
  assert.equal(row.origin_class, "official");
  assert.equal(row.derivation, "observed");
  assert.equal(row.n_observations, null); // optional field, not supplied
  // Every WO-17-required field is present (no undefined slipped through).
  for (const k of ["value_numeric", "unit", "derivation", "origin_class", "source_key", "source_ref", "method_version", "as_at_date", "reference_period"]) {
    assert.notEqual(row[k], undefined, `missing ${k}`);
  }
});

test("buildEnvelopeRow: throws on any missing required field rather than shipping a partial envelope", () => {
  for (const k of ["region_code", "dimension", "fact_label", "value_numeric", "unit", "derivation", "origin_class", "source_key", "source_ref", "method_version", "as_at_date", "reference_period"]) {
    const bad = { ...OBS, [k]: undefined };
    assert.throws(() => buildEnvelopeRow(bad), new RegExp(k), `expected throw for missing ${k}`);
  }
});

test("planUpsert: a brand-new observation is an insert", () => {
  const cand = buildEnvelopeRow(OBS);
  const plan = planUpsert([], [cand]);
  assert.equal(plan.toInsert.length, 1);
  assert.equal(plan.toUpdate.length, 0);
  assert.equal(plan.unchanged, 0);
  assert.deepEqual(plan.toInsert[0], cand);
});

test("planUpsert: re-running over IDENTICAL source data is a no-op (idempotency proof)", () => {
  const cand = buildEnvelopeRow(OBS);
  const existing = { id: "row-1", region_code: cand.region_code, dimension: cand.dimension, fact_label: cand.fact_label, ...cand };
  const plan = planUpsert([existing], [cand]);
  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.toUpdate.length, 0);
  assert.equal(plan.unchanged, 1);
});

test("planUpsert: a changed value on an existing key is an update, keyed by id, never a duplicate insert", () => {
  const cand = buildEnvelopeRow(OBS);
  const existing = { id: "row-1", ...cand, value_numeric: 0.19, value: "0.19 EUR/kWh" };
  const plan = planUpsert([existing], [cand]);
  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0].id, "row-1");
  assert.equal(plan.toUpdate[0].patch.value_numeric, 0.2043);
});

test("planUpsert: keys on (region_code, dimension, fact_label) exactly, mirroring the live UNIQUE constraint", () => {
  const cand = buildEnvelopeRow(OBS);
  // Same value_numeric etc., but a DIFFERENT fact_label -> different natural key -> a second insert, not
  // an update of the existing row (this is what the live regional_data_facts_region_id_dimension_fact_
  // label_key constraint enforces at the DB; the planner must mirror it, not invent a looser key).
  const existing = { id: "row-1", ...cand, fact_label: "EU — a different fact entirely" };
  const plan = planUpsert([existing], [cand]);
  assert.equal(plan.toInsert.length, 1);
  assert.equal(plan.toUpdate.length, 0);
});

test("planUpsert: batch of many candidates against a mixed existing set — insert/update/unchanged partition correctly", () => {
  const a = buildEnvelopeRow(OBS);
  const b = buildEnvelopeRow({ ...OBS, fact_label: "EU — band B", value_numeric: 0.15 });
  const c = buildEnvelopeRow({ ...OBS, fact_label: "EU — band C (changed)", value_numeric: 0.30 });
  const existingA = { id: "id-a", ...a };
  const existingC = { id: "id-c", ...c, value_numeric: 0.28, value: "0.28 EUR/kWh" };
  const plan = planUpsert([existingA, existingC], [a, b, c]);
  assert.equal(plan.unchanged, 1); // a
  assert.equal(plan.toInsert.length, 1); // b
  assert.equal(plan.toInsert[0].fact_label, "EU — band B");
  assert.equal(plan.toUpdate.length, 1); // c
  assert.equal(plan.toUpdate[0].id, "id-c");
  assert.equal(plan.toUpdate[0].patch.value_numeric, 0.30);
});

test("ENVELOPE_PAYLOAD_KEYS covers every migration-267 envelope column plus the legacy `value` text column", () => {
  const expected = ["value", "value_numeric", "unit", "currency", "derivation", "origin_class", "source_key", "source_ref", "n_observations", "method_version", "as_at_date", "reference_period"];
  assert.deepEqual([...ENVELOPE_PAYLOAD_KEYS].sort(), [...expected].sort());
});
