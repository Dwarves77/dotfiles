// fueleu-annex-iv.test.mjs — see carbon-intensity.test.mjs's own header note on why this lives under
// src/__tests__/ rather than co-located under src/lib/statutory/ (no run-test-suite.sh glob covers that
// new directory, out of Lane DP-SURF's write set).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeComplianceBalance,
  computeFuelEuPenalty,
  FUELEU_UNIT_PRICE_EUR_PER_T_VLSFOE,
  FUELEU_VLSFOE_MJ_PER_TONNE,
} from "../lib/statutory/fueleu-annex-iv.mjs";

test("constants match the four-source-corroborated values", () => {
  assert.equal(FUELEU_UNIT_PRICE_EUR_PER_T_VLSFOE, 2400);
  assert.equal(FUELEU_VLSFOE_MJ_PER_TONNE, 41000);
});

test("compliance balance: surplus (target above actual) is positive", () => {
  const cb = computeComplianceBalance({ ghgIntensityTargetGco2ePerMJ: 91.16, ghgIntensityActualGco2ePerMJ: 89.0, energyUsedMJ: 1_000_000 });
  assert.ok(cb > 0);
  assert.equal(cb, (91.16 - 89.0) * 1_000_000);
});

test("compliance balance: deficit (actual above target) is negative", () => {
  const cb = computeComplianceBalance({ ghgIntensityTargetGco2ePerMJ: 89.34, ghgIntensityActualGco2ePerMJ: 95.0, energyUsedMJ: 500_000 });
  assert.ok(cb < 0);
});

test("a surplus balance produces zero penalty", () => {
  const r = computeFuelEuPenalty({ complianceBalanceGco2eq: 1_000_000, ghgIntensityActualGco2ePerMJ: 89.0 });
  assert.equal(r.penaltyEur, 0);
  assert.equal(r.isDeficit, false);
});

test("a deficit balance produces a positive penalty, dimensionally correct against the published constants", () => {
  // complianceBalance in gCO2eq, ghgActual in gCO2eq/MJ -> CB/ghgActual = MJ deficit;
  // MJ / (MJ/t) = tonnes; tonnes * EUR/t = EUR.
  const complianceBalanceGco2eq = -1_000_000_000; // -1,000,000,000 gCO2eq deficit
  const ghgIntensityActualGco2ePerMJ = 95.0;
  const r = computeFuelEuPenalty({ complianceBalanceGco2eq, ghgIntensityActualGco2ePerMJ });
  const expectedTonnes = 1_000_000_000 / (95.0 * 41000);
  assert.ok(Math.abs(r.vlsfoeDeficitTonnes - expectedTonnes) < 1e-9);
  assert.ok(Math.abs(r.penaltyEur - expectedTonnes * 2400) < 1e-6);
  assert.equal(r.isDeficit, true);
  assert.equal(r.multiplier, 1);
});

test("consecutive-year multiplier: n=1 has no surcharge, n=3 applies 1 + (3-1)/10 = 1.2", () => {
  const base = computeFuelEuPenalty({ complianceBalanceGco2eq: -1_000_000_000, ghgIntensityActualGco2ePerMJ: 95.0, consecutiveYears: 1 });
  const year3 = computeFuelEuPenalty({ complianceBalanceGco2eq: -1_000_000_000, ghgIntensityActualGco2ePerMJ: 95.0, consecutiveYears: 3 });
  assert.equal(base.multiplier, 1);
  assert.equal(year3.multiplier, 1.2);
  assert.ok(Math.abs(year3.penaltyEur - base.penaltyEur * 1.2) < 1e-6);
});

test("throws on a non-positive ghgIntensityActual (a denominator that must not be zero/negative)", () => {
  assert.throws(() => computeFuelEuPenalty({ complianceBalanceGco2eq: -100, ghgIntensityActualGco2ePerMJ: 0 }));
  assert.throws(() => computeFuelEuPenalty({ complianceBalanceGco2eq: -100, ghgIntensityActualGco2ePerMJ: -5 }));
});

test("throws on a non-integer or sub-1 consecutiveYears", () => {
  assert.throws(() => computeFuelEuPenalty({ complianceBalanceGco2eq: -100, ghgIntensityActualGco2ePerMJ: 90, consecutiveYears: 1.5 }));
  assert.throws(() => computeFuelEuPenalty({ complianceBalanceGco2eq: -100, ghgIntensityActualGco2ePerMJ: 90, consecutiveYears: 0 }));
});

test("throws on non-finite inputs to computeComplianceBalance", () => {
  assert.throws(() => computeComplianceBalance({ ghgIntensityTargetGco2ePerMJ: NaN, ghgIntensityActualGco2ePerMJ: 1, energyUsedMJ: 1 }));
  assert.throws(() => computeComplianceBalance({ ghgIntensityTargetGco2ePerMJ: 1, ghgIntensityActualGco2ePerMJ: 1, energyUsedMJ: -1 }));
});
