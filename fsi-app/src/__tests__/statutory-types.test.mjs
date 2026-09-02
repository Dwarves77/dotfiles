// statutory-types.test.mjs — runtime proof that computeStatutory() (src/lib/statutory/types.ts) produces
// the right number for a valid, fully-Contractable input set. The COMPILE-TIME half of the Layer 2 barrier
// (rejecting a NonContractable input) is proven separately by
// src/lib/statutory/types.contractable-barrier.check.ts, which `tsc --noEmit` checks — Node's type
// stripping (which this file runs under) erases types at runtime and cannot itself prove a compile error,
// so that proof deliberately lives outside node --test.
//
// Relative .ts import: portable under Node's native type-stripping (see src/lib/propagation's own test
// files for the same pattern already in this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStatutory, FUELEU_STATUTE_CITATION, FUELEU_FORMULA_VERSION } from "../lib/statutory/types.ts";

const asOf = { eventDate: "2026-01-01" };

test("computeStatutory('fueleu_annex_iv_penalty') returns a positive EUR penalty for a deficit", () => {
  const r = computeStatutory("fueleu_annex_iv_penalty", {
    ghgIntensityTarget: { derivation: "observed", value: 89.34, unit: "gCO2eq/MJ", citation: "Annex I target", asOf },
    ghgIntensityActual: { derivation: "observed", value: 95.0, unit: "gCO2eq/MJ", citation: "reader-reported", asOf },
    energyUsed: { derivation: "observed", value: 1_000_000, unit: "MJ", citation: "reader-reported", asOf },
    consecutiveYears: { derivation: "observed", value: 1, unit: "count", citation: "reader-reported", asOf },
  });
  assert.equal(r.resultUnit, "EUR");
  assert.ok(r.result > 0, "actual above target is a deficit — penalty must be positive");
  assert.equal(r.formulaVersion, FUELEU_FORMULA_VERSION);
});

test("computeStatutory('fueleu_annex_iv_penalty') returns zero for a surplus", () => {
  const r = computeStatutory("fueleu_annex_iv_penalty", {
    ghgIntensityTarget: { derivation: "observed", value: 95.0, unit: "gCO2eq/MJ", citation: "Annex I target", asOf },
    ghgIntensityActual: { derivation: "observed", value: 89.0, unit: "gCO2eq/MJ", citation: "reader-reported", asOf },
    energyUsed: { derivation: "observed", value: 1_000_000, unit: "MJ", citation: "reader-reported", asOf },
    consecutiveYears: { derivation: "observed", value: 1, unit: "count", citation: "reader-reported", asOf },
  });
  assert.equal(r.result, 0);
});

test("throws on an unregistered formula id", () => {
  assert.throws(() => computeStatutory("not_a_real_formula", {}), /unknown\/unregistered formula/);
});

test("FUELEU_STATUTE_CITATION and FUELEU_FORMULA_VERSION are re-exported, non-empty, and CONFIRMED (2026-09-02 coordinator EUR-Lex read — no longer [UNCONFIRMED])", () => {
  assert.ok(FUELEU_STATUTE_CITATION.length > 0);
  assert.ok(FUELEU_FORMULA_VERSION.length > 0);
  assert.doesNotMatch(FUELEU_STATUTE_CITATION, /UNCONFIRMED/);
  assert.doesNotMatch(FUELEU_FORMULA_VERSION, /UNCONFIRMED/);
  assert.match(FUELEU_STATUTE_CITATION, /CELEX:32023R1805/);
});
