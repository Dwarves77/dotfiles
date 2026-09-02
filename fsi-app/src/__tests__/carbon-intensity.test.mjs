// carbon-intensity.test.mjs — lives under src/__tests__/ (covered by run-test-suite.sh's
// `fsi-app/src/__tests__/*.test.mjs` glob) rather than co-located under src/lib/market/, because no
// `src/lib/market/*.test.mjs` glob line exists in .discipline/run-test-suite.sh (out of Lane DP-SURF's
// write set) and src/lib/market's sibling pure modules (select-modal-factor.mjs, carbon-overlay-view.mjs)
// carry no dedicated test file of their own today either — this is the same convention this repo already
// uses for that directory, not a workaround invented for this file alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { carbonIntensity, SUPPORTED_BASES } from "../lib/market/carbon-intensity.mjs";

const TONNE_KM_FACTOR = {
  factor_id: "f-1",
  quantity_basis: "tonne_km",
  ttw_co2e: 0.062,
  wtw_co2e: 0.074,
  wtt_co2e: 0.012,
  source_key: "desnz_ghg_factors",
};

test("resolves a tonne_km factor to gCO2e/tonne-km, preferring ttw_co2e", () => {
  const r = carbonIntensity(TONNE_KM_FACTOR);
  assert.equal(r.ok, true);
  assert.equal(r.unit, "gCO2e/tonne-km");
  assert.equal(r.valueGPerUnit, 62); // 0.062 kg * 1000
  assert.equal(r.headlineLabel, "tank-to-wheel");
  assert.equal(r.basis, "tonne_km");
});

test("falls back to wtw_co2e when ttw_co2e is absent", () => {
  const r = carbonIntensity({ ...TONNE_KM_FACTOR, ttw_co2e: null });
  assert.equal(r.ok, true);
  assert.equal(r.valueGPerUnit, 74);
  assert.equal(r.headlineLabel, "well-to-wheel");
});

test("falls back to wtt_co2e when only that is present", () => {
  const r = carbonIntensity({ ...TONNE_KM_FACTOR, ttw_co2e: null, wtw_co2e: null });
  assert.equal(r.ok, true);
  assert.equal(r.valueGPerUnit, 12);
  assert.equal(r.headlineLabel, "well-to-tank");
});

test("refuses an unsupported quantity_basis with a named reason, never a guessed unit", () => {
  const r = carbonIntensity({ ...TONNE_KM_FACTOR, quantity_basis: "teu_km" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /teu_km/);
  assert.match(r.reason, /no confirmed CO2e-per-unit convention/);
});

test("refuses every basis outside SUPPORTED_BASES, and SUPPORTED_BASES is exactly tonne_km today", () => {
  assert.deepEqual([...SUPPORTED_BASES], ["tonne_km"]);
  for (const basis of ["vehicle_km", "tonne", "litre", "kg", "kwh", "mj"]) {
    const r = carbonIntensity({ ...TONNE_KM_FACTOR, quantity_basis: basis });
    assert.equal(r.ok, false, `basis "${basis}" should refuse`);
  }
});

test("refuses a factor row with none of ttw/wtw/wtt populated", () => {
  const r = carbonIntensity({ ...TONNE_KM_FACTOR, ttw_co2e: null, wtw_co2e: null, wtt_co2e: null });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no usable/);
});

test("refuses null/undefined input rather than throwing", () => {
  assert.equal(carbonIntensity(null).ok, false);
  assert.equal(carbonIntensity(undefined).ok, false);
});

test("carries factorId and sourceKey through on success", () => {
  const r = carbonIntensity(TONNE_KM_FACTOR);
  assert.equal(r.factorId, "f-1");
  assert.equal(r.sourceKey, "desnz_ghg_factors");
});
