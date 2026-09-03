import { test } from "node:test";
import assert from "node:assert/strict";
import { computePayloadPenalty, tcoCrossoverBand } from "./oem-payload.mjs";

test("computePayloadPenalty: refuses (M) when density basis is not pack", () => {
  const r = computePayloadPenalty({
    dieselPowertrainKg: 1200, usableKwh: 400, energyDensityWhKg: 260, densityBasis: "cell",
    ePowertrainKg: 600, legalPayloadKg: 24000,
  });
  assert.equal(r.label, "M");
  assert.match(r.reason, /not 'pack'/);
});

test("computePayloadPenalty: refuses (M) with no density basis at all", () => {
  const r = computePayloadPenalty({
    dieselPowertrainKg: 1200, usableKwh: 400, energyDensityWhKg: 260, densityBasis: undefined,
    ePowertrainKg: 600, legalPayloadKg: 24000,
  });
  assert.equal(r.label, "M");
});

test("computePayloadPenalty: at 160 Wh/kg pack, roughly -18% payload (spec 09 §1.1 worked example)", () => {
  // Worked from spec's own stated outcome band: "At 160 Wh/kg pack this is roughly -18% payload".
  const r = computePayloadPenalty({
    dieselPowertrainKg: 1200, usableKwh: 700, energyDensityWhKg: 160, densityBasis: "pack",
    ePowertrainKg: 700, legalPayloadKg: 24000,
  });
  assert.equal(r.label, "estimate");
  assert.equal(r.derivation, "modelled");
  assert.ok(r.value < 0, "payload delta should be negative (a displacement)");
  assert.ok(r.deltaPayloadPct < -0.15 && r.deltaPayloadPct > -0.22, `expected roughly -18%, got ${r.deltaPayloadPct}`);
});

test("computePayloadPenalty: at 210 Wh/kg pack, a smaller penalty than at 160 Wh/kg", () => {
  const at160 = computePayloadPenalty({
    dieselPowertrainKg: 1200, usableKwh: 700, energyDensityWhKg: 160, densityBasis: "pack",
    ePowertrainKg: 700, legalPayloadKg: 24000,
  });
  const at210 = computePayloadPenalty({
    dieselPowertrainKg: 1200, usableKwh: 700, energyDensityWhKg: 210, densityBasis: "pack",
    ePowertrainKg: 700, legalPayloadKg: 24000,
  });
  assert.ok(Math.abs(at210.deltaPayloadPct) < Math.abs(at160.deltaPayloadPct), "higher density should shrink the penalty");
});

test("computePayloadPenalty: refuses (M) on non-numeric or non-positive inputs", () => {
  assert.equal(computePayloadPenalty({
    dieselPowertrainKg: 1200, usableKwh: "x", energyDensityWhKg: 210, densityBasis: "pack",
    ePowertrainKg: 700, legalPayloadKg: 24000,
  }).label, "M");
  assert.equal(computePayloadPenalty({
    dieselPowertrainKg: 1200, usableKwh: 700, energyDensityWhKg: 0, densityBasis: "pack",
    ePowertrainKg: 700, legalPayloadKg: 24000,
  }).label, "M");
  assert.equal(computePayloadPenalty({
    dieselPowertrainKg: 1200, usableKwh: 700, energyDensityWhKg: 210, densityBasis: "pack",
    ePowertrainKg: 700, legalPayloadKg: 0,
  }).label, "M");
});

test("tcoCrossoverBand: always refuses (not forecastable this build), never fabricates an interval", () => {
  const r = tcoCrossoverBand();
  assert.equal(r.label, "M");
  assert.match(r.reason, /not forecastable/);
  assert.match(r.reason, /ICCT/);
});
