import { test } from "node:test";
import assert from "node:assert/strict";
import { METHODS } from "./index.ts";
import { computeCarbonIntensity, METHOD_ID, METHOD_VERSION } from "./carbon-intensity.ts";

test("registers itself in METHODS at import time (via methods/index.ts's side-effect import)", () => {
  assert.ok(METHODS.has(METHOD_ID, METHOD_VERSION), "carbon_intensity_tkm@1.0.0 should be registered");
  assert.equal(METHODS.get(METHOD_ID, METHOD_VERSION), computeCarbonIntensity);
});

const factorRow = {
  factor_id: "f-1",
  quantity_basis: "tonne_km",
  ttw_co2e: 0.062,
  wtw_co2e: 0.074,
  wtt_co2e: 0.012,
  source_key: "desnz_ghg_factors",
  origin_class: "official",
  pedigree: 2,
};

test("computes gCO2e/tonne-km from a resolved emission_factors input", async () => {
  const ctx = {
    entityId: null,
    inputs: [{ table: "emission_factors", pk: "f-1", version: null, row: factorRow }],
    priorValue: null,
    now: new Date(),
  };
  const r = await computeCarbonIntensity(ctx);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value, 62);
    assert.equal(r.unit, "gCO2e/tonne-km");
    assert.equal(r.derivation, "calculated");
    assert.equal(r.originClass, "derived");
    assert.equal(r.lifecycle, "verified"); // origin_class official -> verified
    assert.equal(r.halfLifeDays, null);
    assert.ok(r.confidence > 0 && r.confidence <= 1);
  }
});

test("lifecycle falls back to corroborated for a non-official/verified factor origin_class", async () => {
  const ctx = {
    entityId: null,
    inputs: [{ table: "emission_factors", pk: "f-2", version: null, row: { ...factorRow, origin_class: "derived" } }],
    priorValue: null,
    now: new Date(),
  };
  const r = await computeCarbonIntensity(ctx);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.lifecycle, "corroborated");
});

test("refuses with a named reason for an unresolved input", async () => {
  const ctx = { entityId: null, inputs: [{ table: "emission_factors", pk: "missing", version: null, row: null }], priorValue: null, now: new Date() };
  const r = await computeCarbonIntensity(ctx);
  assert.equal(r.ok, false);
});

test("refuses with a named reason for an unsupported quantity_basis, propagated from carbon-intensity.mjs", async () => {
  const ctx = {
    entityId: null,
    inputs: [{ table: "emission_factors", pk: "f-3", version: null, row: { ...factorRow, quantity_basis: "teu_km" } }],
    priorValue: null,
    now: new Date(),
  };
  const r = await computeCarbonIntensity(ctx);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /teu_km/);
});
