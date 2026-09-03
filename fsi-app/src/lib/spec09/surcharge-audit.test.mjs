import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeVariance,
  formatDefensibleStatement,
  poolAdjustedGuard,
  formatAccusationStatement,
} from "./surcharge-audit.mjs";

test("computeVariance: billed above statutory is a positive, statutory_formula-labelled variance", () => {
  const v = computeVariance({ billedEur: 1200, statutoryEur: 950.5 });
  assert.equal(v.label, "statutory");
  assert.equal(v.derivation, "statutory_formula");
  assert.equal(v.value, 249.5);
});

test("computeVariance: billed below statutory is negative", () => {
  const v = computeVariance({ billedEur: 800, statutoryEur: 950 });
  assert.equal(v.value, -150);
});

test("computeVariance: non-numeric input returns M with a stated reason", () => {
  assert.equal(computeVariance({ billedEur: "x", statutoryEur: 100 }).label, "M");
  assert.equal(computeVariance({ billedEur: 100, statutoryEur: undefined }).label, "M");
  assert.ok(computeVariance({ billedEur: NaN, statutoryEur: 1 }).reason.length > 0);
});

test("formatDefensibleStatement: positive variance names the excess and the cited provision", () => {
  const s = formatDefensibleStatement({ varianceEur: 249.5, statutoryBasis: "FuelEU Maritime Annex IV" });
  assert.match(s, /exceeds the statutory liability by €249\.50/);
  assert.match(s, /FuelEU Maritime Annex IV/);
});

test("formatDefensibleStatement: negative variance says 'is below'", () => {
  const s = formatDefensibleStatement({ varianceEur: -50, statutoryBasis: "Art. 12" });
  assert.match(s, /is below the statutory liability by €50\.00/);
});

test("formatDefensibleStatement: zero variance states a match, no amount", () => {
  const s = formatDefensibleStatement({ varianceEur: 0, statutoryBasis: "Art. 12" });
  assert.match(s, /matches the statutory liability/);
  assert.doesNotMatch(s, /€/);
});

test("formatDefensibleStatement: refuses with no cited provision", () => {
  assert.throws(() => formatDefensibleStatement({ varianceEur: 10, statutoryBasis: "" }), TypeError);
  assert.throws(() => formatDefensibleStatement({ varianceEur: 10, statutoryBasis: undefined }), TypeError);
});

test("poolAdjustedGuard: never allows surfacing, always names the decision it defers to", () => {
  const g = poolAdjustedGuard({ poolAdjustedEur: -75, poolId: "some-pool-id" });
  assert.equal(g.allowed, false);
  assert.match(g.reason, /spec 09 §5/);
  assert.equal(g.internalValue, -75);
  assert.equal(g.poolId, "some-pool-id");
});

test("poolAdjustedGuard: defaults to no pool data and still refuses", () => {
  const g = poolAdjustedGuard();
  assert.equal(g.allowed, false);
  assert.equal(g.internalValue, null);
});

test("formatAccusationStatement: always throws, names the reason and the alternative", () => {
  assert.throws(() => formatAccusationStatement(), /refusing/i);
  assert.throws(() => formatAccusationStatement(), /formatDefensibleStatement/);
});
