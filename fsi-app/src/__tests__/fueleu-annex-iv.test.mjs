// fueleu-annex-iv.test.mjs — see carbon-intensity.test.mjs's own header note on why this lives under
// src/__tests__/ rather than co-located under src/lib/statutory/ (no run-test-suite.sh glob covers that
// new directory, out of Lane DP-SURF's write set).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeComplianceBalance,
  computeFuelEuPenalty,
  computeFuelEuPenaltyRfnbo,
  FUELEU_UNIT_PRICE_EUR_PER_T_VLSFOE,
  FUELEU_VLSFOE_MJ_PER_TONNE,
  FUELEU_STATUTE_CITATION,
  FUELEU_FORMULA_VERSION,
  FUELEU_RFNBO_NOT_IMPLEMENTED_REASON,
} from "../lib/statutory/fueleu-annex-iv.mjs";

test("constants match Annex IV Part B(a)'s confirmed values", () => {
  assert.equal(FUELEU_UNIT_PRICE_EUR_PER_T_VLSFOE, 2400);
  assert.equal(FUELEU_VLSFOE_MJ_PER_TONNE, 41000);
});

test("citation and formula version are CONFIRMED, not [UNCONFIRMED] — 2026-09-02 coordinator EUR-Lex read", () => {
  assert.doesNotMatch(FUELEU_STATUTE_CITATION, /UNCONFIRMED/);
  assert.doesNotMatch(FUELEU_FORMULA_VERSION, /UNCONFIRMED/);
  assert.match(FUELEU_STATUTE_CITATION, /CELEX:32023R1805/);
  assert.match(FUELEU_STATUTE_CITATION, /Annex IV Part A\(a\) and Part B\(a\)/);
  assert.match(FUELEU_STATUTE_CITATION, /Article 23\(2\)/);
  assert.match(FUELEU_FORMULA_VERSION, /2026-09-02/);
});

test("Part B(b) RFNBO penalty is a named NOT-IMPLEMENTED gap, never a guessed number", () => {
  assert.throws(() => computeFuelEuPenaltyRfnbo({}), /not implemented/);
  assert.match(FUELEU_RFNBO_NOT_IMPLEMENTED_REASON, /Pd/);
  assert.doesNotMatch(FUELEU_RFNBO_NOT_IMPLEMENTED_REASON, /UNCONFIRMED/);
});

test("WORKED EXAMPLE — Annex IV Part A(a) + Part B(a) + Article 23(2), hand-computed independently of the module", () => {
  // A single ship-year: target 90 gCO2eq/MJ, actual 100 gCO2eq/MJ (a deficit — actual worse than target),
  // 50,000,000 MJ of energy used on board.
  const ghgIntensityTargetGco2ePerMJ = 90;
  const ghgIntensityActualGco2ePerMJ = 100;
  const energyUsedMJ = 50_000_000;

  // Part A(a): CB = (target - actual) * energyUsed = (90 - 100) * 50,000,000 = -500,000,000 gCO2eq.
  const expectedCbGco2eq = -500_000_000;
  const cb = computeComplianceBalance({ ghgIntensityTargetGco2ePerMJ, ghgIntensityActualGco2ePerMJ, energyUsedMJ });
  assert.equal(cb, expectedCbGco2eq);

  // Part B(a): penalty = |CB| / (actual * 41000) * 2400.
  //   |CB| / actual = 500,000,000 / 100 = 5,000,000 MJ deficit.
  //   5,000,000 / 41,000 = 121.951219512... tonnes VLSFOe.
  //   121.951219512... * 2400 = 292,682.926829... EUR (n=1, no consecutive-year surcharge).
  const expectedTonnes = (Math.abs(expectedCbGco2eq) / ghgIntensityActualGco2ePerMJ) / 41000;
  const expectedPenaltyN1 = expectedTonnes * 2400;
  const r1 = computeFuelEuPenalty({ complianceBalanceGco2eq: cb, ghgIntensityActualGco2ePerMJ, consecutiveYears: 1 });
  assert.ok(Math.abs(r1.vlsfoeDeficitTonnes - expectedTonnes) < 1e-9);
  assert.ok(Math.abs(r1.penaltyEur - expectedPenaltyN1) < 1e-6);
  assert.ok(Math.abs(r1.penaltyEur - 292_682.926829268) < 1e-3);

  // Article 23(2): a 2nd consecutive deficit year multiplies by 1 + (2-1)/10 = 1.1.
  const r2 = computeFuelEuPenalty({ complianceBalanceGco2eq: cb, ghgIntensityActualGco2ePerMJ, consecutiveYears: 2 });
  assert.equal(r2.multiplier, 1.1);
  assert.ok(Math.abs(r2.penaltyEur - expectedPenaltyN1 * 1.1) < 1e-6);
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
