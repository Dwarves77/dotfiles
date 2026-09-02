import { test } from "node:test";
import assert from "node:assert/strict";
import { automateVsHire, computeScenario, UNCERTAINTY_PCT, REFUSAL, DEFAULT_SCENARIO } from "./automate-vs-hire.mjs";

const GOOD_INPUT = {
  capexUsd: 250_000,
  annualThroughputUnits: 50_000,
  labourCostPerHour: 28.5,
  hoursPerUnitManual: 0.12,
  hoursPerUnitAutomated: 0.02,
  energyPricePerKwh: 0.24,
  kwhPerUnitAutomated: 0.35,
  maintenancePctOfCapex: 0.08,
  discountRate: 0.08,
  horizonYears: 7,
};

test("automateVsHire returns a range for npv, payback, and break-even wage — never a bare point", () => {
  const r = automateVsHire(GOOD_INPUT);
  for (const key of ["npv", "paybackYears", "breakEvenWagePerHour"]) {
    assert.ok("low" in r[key] && "point" in r[key] && "high" in r[key], `${key} must carry low/point/high`);
  }
});

test("npv low <= point <= high (worst case for automation is never better than the point estimate)", () => {
  const r = automateVsHire(GOOD_INPUT);
  assert.ok(r.npv.low <= r.npv.point, `low (${r.npv.low}) should be <= point (${r.npv.point})`);
  assert.ok(r.npv.point <= r.npv.high, `point (${r.npv.point}) should be <= high (${r.npv.high})`);
});

test("break-even wage: automating saves labor hours here, so a finite wage* exists", () => {
  const r = automateVsHire(GOOD_INPUT);
  assert.equal(r.refusal, null);
  assert.ok(typeof r.breakEvenWagePerHour.point === "number");
});

test("break-even wage is null with REFUSAL.NO_HOUR_SAVINGS when automation saves no hours", () => {
  const r = automateVsHire({ ...GOOD_INPUT, hoursPerUnitAutomated: GOOD_INPUT.hoursPerUnitManual });
  assert.equal(r.refusal, REFUSAL.NO_HOUR_SAVINGS);
  assert.equal(r.breakEvenWagePerHour.point, null);
});

test("paybackYears is null (never Infinity/NaN) when the annual net cash flow is non-positive", () => {
  // Zero throughput -> zero labor savings and zero energy cost -> net cash flow is exactly
  // -maintenance <= 0 -> payback never arrives.
  const r = automateVsHire({ ...GOOD_INPUT, annualThroughputUnits: 0 });
  assert.equal(r.paybackYears.point, null);
  assert.ok(Number.isFinite(r.npv.point));
  assert.ok(r.npv.point < 0, "with zero throughput, npv is just -capex minus discounted maintenance — always negative");
});

test("UNCERTAINTY_PCT is exactly ±10%, applied symmetrically to wage and energy", () => {
  assert.equal(UNCERTAINTY_PCT, 0.10);
  const point = computeScenario({ ...GOOD_INPUT });
  const worst = computeScenario({ ...GOOD_INPUT, labourCostPerHour: GOOD_INPUT.labourCostPerHour * 0.9, energyPricePerKwh: GOOD_INPUT.energyPricePerKwh * 1.1 });
  const r = automateVsHire(GOOD_INPUT);
  assert.ok(Math.abs(r.npv.low - worst.npv) < 1e-6);
  assert.ok(point.npv >= worst.npv);
});

test("inputsUsed carries InputRef entries only for facts actually supplied, empty for a pure manual preview", () => {
  const withRefs = automateVsHire({
    ...GOOD_INPUT,
    wageInputRef: { table: "regional_data_facts", pk: "wage-row-1" },
    energyInputRef: { table: "regional_data_facts", pk: "energy-row-1", version: "v2" },
  });
  assert.deepEqual(withRefs.inputsUsed, [
    { table: "regional_data_facts", pk: "wage-row-1", version: null },
    { table: "regional_data_facts", pk: "energy-row-1", version: "v2" },
  ]);

  const preview = automateVsHire(GOOD_INPUT);
  assert.deepEqual(preview.inputsUsed, []);
});

test("throws on a missing/invalid numeric input rather than silently coercing", () => {
  assert.throws(() => automateVsHire({ ...GOOD_INPUT, capexUsd: "not a number" }), /capexUsd/);
  assert.throws(() => automateVsHire({ ...GOOD_INPUT, horizonYears: 2.5 }), /horizonYears/);
  assert.throws(() => automateVsHire({ ...GOOD_INPUT, labourCostPerHour: -1 }), /labourCostPerHour/);
});

test("DEFAULT_SCENARIO is a frozen, documented object (never silently mutated by a caller)", () => {
  assert.ok(Object.isFrozen(DEFAULT_SCENARIO));
  assert.equal(typeof DEFAULT_SCENARIO.capexUsd, "number");
  assert.equal(typeof DEFAULT_SCENARIO.horizonYears, "number");
});

test("computeScenario is the single-point primitive automateVsHire composes from", () => {
  const s = computeScenario(GOOD_INPUT);
  assert.ok(Number.isFinite(s.npv));
  assert.ok(s.paybackYears === null || Number.isFinite(s.paybackYears));
});
