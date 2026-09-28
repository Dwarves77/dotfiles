import { test } from "node:test";
import assert from "node:assert/strict";
import { METHODS } from "./index.ts";
import { computeAutomateVsHire, METHOD_ID, METHOD_VERSION } from "./automate-vs-hire.ts";

test("registers itself in METHODS at import time (via methods/index.ts's side-effect import)", () => {
  assert.ok(METHODS.has(METHOD_ID, METHOD_VERSION), "automate_vs_hire@1.0.0 should be registered");
  assert.equal(METHODS.get(METHOD_ID, METHOD_VERSION), computeAutomateVsHire);
});

const wageRef = { table: "regional_data_facts", pk: "wage-1", version: null, row: { dimension: "labor_markets", value_numeric: 28.5, unit: "USD/hour" } };
const energyRef = { table: "regional_data_facts", pk: "energy-1", version: null, row: { dimension: "operational_cost", value_numeric: 0.24, unit: "EUR/kWh" } };

test("computes npv from resolved wage + energy inputs, identified by dimension regardless of array order", async () => {
  const ctx = { entityId: "cl:jurisdiction:0000000000000001", inputs: [energyRef, wageRef], priorValue: null, now: new Date("2026-09-02T00:00:00Z") };
  const r = await computeAutomateVsHire(ctx);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(typeof r.value, "number");
    assert.ok(r.valueLow <= r.value && r.value <= r.valueHigh);
    assert.equal(r.unit, "USD");
    assert.equal(r.derivation, "modelled");
    assert.equal(r.originClass, "modelled");
    assert.equal(r.admissibility, "analysis_ok");
    assert.equal(r.halfLifeDays, 365);
  }
});

test("refuses with a named reason when the wage input is unresolved", async () => {
  const ctx = { entityId: null, inputs: [{ table: "regional_data_facts", pk: "wage-missing", version: null, row: null }, energyRef], priorValue: null, now: new Date() };
  const r = await computeAutomateVsHire(ctx);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /wage/);
});

test("refuses with a named reason when the energy input is unresolved", async () => {
  const ctx = { entityId: null, inputs: [wageRef, { table: "regional_data_facts", pk: "energy-missing", version: null, row: null }], priorValue: null, now: new Date() };
  const r = await computeAutomateVsHire(ctx);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /energy/);
});

// 2026-09-02 coordinator follow-up: "BLS OEWS wage fact is hourly (H_MEAN), matching what automate-vs-hire
// reads... Make automate-vs-hire's wage input read the hourly fact by label and refuse (named reason) when
// only an annual one exists."
const annualWageRef = { table: "regional_data_facts", pk: "wage-annual-1", version: null, row: { dimension: "labor_markets", value_numeric: 54320, unit: "USD/year" } };

test("refuses with a named reason (never silently divides by 2080) when the only resolvable labor_markets input is annual, not hourly", async () => {
  const ctx = { entityId: null, inputs: [annualWageRef, energyRef], priorValue: null, now: new Date() };
  const r = await computeAutomateVsHire(ctx);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason, /hourly/i);
    assert.match(r.reason, /USD\/year/);
  }
});

test("accepts a hourly wage fact regardless of currency, so long as the unit ends in /hour (e.g. EUR/hour)", async () => {
  const eurHourlyWageRef = { table: "regional_data_facts", pk: "wage-eur-1", version: null, row: { dimension: "labor_markets", value_numeric: 24.0, unit: "EUR/hour" } };
  const ctx = { entityId: null, inputs: [eurHourlyWageRef, energyRef], priorValue: null, now: new Date() };
  const r = await computeAutomateVsHire(ctx);
  assert.equal(r.ok, true);
});

// Migration 331/332, lane STATE-COST-DAG 2026-09-27: state_cost_facts is now an accepted input table too
// (the allowlist widened, the computation stayed grain-agnostic).
test("state grain: resolves wage + energy inputs from state_cost_facts the same as regional_data_facts", async () => {
  const stateWageRef = { table: "state_cost_facts", pk: "state-wage-1", version: null, row: { dimension: "labor_markets", value_numeric: 16.0, unit: "USD/hour" } };
  const stateEnergyRef = { table: "state_cost_facts", pk: "state-energy-1", version: null, row: { dimension: "operational_cost", value_numeric: 0.084, unit: "USD/kWh" } };
  const ctx = { entityId: "cl:jurisdiction:0000000000000002", inputs: [stateWageRef, stateEnergyRef], priorValue: null, now: new Date("2026-09-27T00:00:00Z") };
  const r = await computeAutomateVsHire(ctx);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(typeof r.value, "number");
});

test("a table outside the accepted allowlist (neither regional_data_facts nor state_cost_facts) never resolves", async () => {
  const bogusRef = { table: "emission_factors", pk: "bogus-1", version: null, row: { dimension: "labor_markets", value_numeric: 20, unit: "USD/hour" } };
  const ctx = { entityId: null, inputs: [bogusRef, energyRef], priorValue: null, now: new Date() };
  const r = await computeAutomateVsHire(ctx);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /labor_markets/);
});
