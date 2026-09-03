import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFuelBurnMultiplier, compoundingChain } from "./reroute.mjs";

test("applyFuelBurnMultiplier: scales the baseline by the multiplier (Cape ~1.30-1.40x worked example)", () => {
  const r = applyFuelBurnMultiplier({ baselineFuelBurn: 1000, fuelBurnMultiplier: 1.35 });
  assert.equal(r.label, "estimate");
  assert.equal(r.derivation, "calculated");
  assert.equal(r.value, 1350);
  assert.ok(Math.abs(r.deltaPct - 35) < 1e-9);
});

test("applyFuelBurnMultiplier: refuses (M) on a non-positive multiplier or a negative baseline", () => {
  assert.equal(applyFuelBurnMultiplier({ baselineFuelBurn: 1000, fuelBurnMultiplier: 0 }).label, "M");
  assert.equal(applyFuelBurnMultiplier({ baselineFuelBurn: 1000, fuelBurnMultiplier: -1.1 }).label, "M");
  assert.equal(applyFuelBurnMultiplier({ baselineFuelBurn: -5, fuelBurnMultiplier: 1.3 }).label, "M");
});

test("compoundingChain: names all five downstream surfaces plus the reroute step itself, in order", () => {
  const chain = compoundingChain();
  assert.equal(chain.length, 6);
  assert.equal(chain[0].step, "reroute");
  assert.equal(chain[0].computedHere, true);
  assert.equal(chain.at(-1).step, "scope3");
});

test("compoundingChain: the FuelEU bracketed-penalty step is explicitly named as NOT computed here", () => {
  const chain = compoundingChain();
  const fueleu = chain.find((s) => s.step === "fueleu");
  assert.equal(fueleu.computedHere, false);
  assert.match(fueleu.note, /bracketed, not linear/);
});

test("compoundingChain: only the reroute step itself is marked computedHere", () => {
  const chain = compoundingChain();
  const computedSteps = chain.filter((s) => s.computedHere);
  assert.equal(computedSteps.length, 1);
  assert.equal(computedSteps[0].step, "reroute");
});
