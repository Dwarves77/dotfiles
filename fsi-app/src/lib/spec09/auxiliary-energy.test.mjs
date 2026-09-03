import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEnergyConsumedKwh, convertKwhToGco2e, compareToLegEmissions } from "./auxiliary-energy.mjs";

test("computeEnergyConsumedKwh: kw * duty cycle * hours", () => {
  const r = computeEnergyConsumedKwh({ kwDraw: 10, dutyCycle: 0.8, hoursTypical: 72 });
  assert.equal(r.label, "estimate");
  assert.equal(r.derivation, "calculated");
  assert.equal(r.value, 576);
});

test("computeEnergyConsumedKwh: refuses (M) on out-of-range duty cycle or negative inputs", () => {
  assert.equal(computeEnergyConsumedKwh({ kwDraw: 10, dutyCycle: 1.2, hoursTypical: 10 }).label, "M");
  assert.equal(computeEnergyConsumedKwh({ kwDraw: -5, dutyCycle: 0.5, hoursTypical: 10 }).label, "M");
  assert.equal(computeEnergyConsumedKwh({ kwDraw: 5, dutyCycle: 0.5, hoursTypical: "x" }).label, "M");
});

test("convertKwhToGco2e: multiplies by grid intensity", () => {
  const r = convertKwhToGco2e({ energyKwh: 576, gridIntensityGco2ePerKwh: 250 });
  assert.equal(r.value, 144000);
});

test("convertKwhToGco2e: refuses (M) with no grid intensity, never assumes one", () => {
  const r = convertKwhToGco2e({ energyKwh: 576, gridIntensityGco2ePerKwh: undefined });
  assert.equal(r.label, "M");
  assert.match(r.reason, /never assumed/);
});

test("compareToLegEmissions: a large stationary load can exceed the leg (spec's museum-hold worked example)", () => {
  const r = compareToLegEmissions({ auxiliaryGco2e: 144000, legGco2e: 90000 });
  assert.equal(r.exceedsLeg, true);
  assert.ok(r.value > 1);
  assert.match(r.note, /exceeds the transport leg/);
});

test("compareToLegEmissions: a small load does not exceed the leg", () => {
  const r = compareToLegEmissions({ auxiliaryGco2e: 500, legGco2e: 90000 });
  assert.equal(r.exceedsLeg, false);
  assert.equal(r.note, null);
});

test("compareToLegEmissions: refuses (M) rather than treating a missing leg figure as zero", () => {
  assert.equal(compareToLegEmissions({ auxiliaryGco2e: 500, legGco2e: undefined }).label, "M");
  assert.equal(compareToLegEmissions({ auxiliaryGco2e: 500, legGco2e: 0 }).label, "M");
});
