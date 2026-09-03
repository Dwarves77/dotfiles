import { test } from "node:test";
import assert from "node:assert/strict";
import { rollupDqi, isPrimaryLeg } from "./dqi.mjs";

const elements = [
  { tceId: "leg-1", tonneKm: 8000, primaryDataShare: 0.9, reliability: 1, completeness: 1, temporal_correlation: 1, geographical_correlation: 1, technological_correlation: 1 },
  { tceId: "leg-2", tonneKm: 1000, primaryDataShare: 0.1, reliability: 2, completeness: 2, temporal_correlation: 2, geographical_correlation: 4, technological_correlation: 2 },
  { tceId: "leg-3", tonneKm: 1000, primaryDataShare: 0.6, reliability: 1, completeness: 1, temporal_correlation: 1, geographical_correlation: 1, technological_correlation: 1 },
];

test("rollupDqi: weights primary share by tonne-km, not by row count", () => {
  const r = rollupDqi(elements);
  assert.equal(r.label, "estimate");
  assert.equal(r.derivation, "calculated");
  // (8000*0.9 + 1000*0.1 + 1000*0.6) / 10000 = (7200+100+600)/10000 = 0.79
  assert.ok(Math.abs(r.value - 0.79) < 1e-9, `expected 0.79, got ${r.value}`);
});

test("rollupDqi: never a plain mean — differs from the naive row-count average", () => {
  const r = rollupDqi(elements);
  const naiveMean = (0.9 + 0.1 + 0.6) / 3; // 0.5333
  assert.notEqual(Math.round(r.value * 1000), Math.round(naiveMean * 1000));
});

test("rollupDqi: counts legs at >= 0.5 share as primary", () => {
  const r = rollupDqi(elements);
  assert.equal(r.legsPrimary, 2); // leg-1 (0.9) and leg-3 (0.6)
  assert.equal(r.legsTotal, 3);
});

test("rollupDqi: names the single weakest leg/axis (1 best .. 5 worst, max wins)", () => {
  const r = rollupDqi(elements);
  assert.equal(r.weakestLeg.tceId, "leg-2");
  assert.equal(r.weakestLeg.axis, "geographical_correlation");
  assert.equal(r.weakestLeg.value, 4);
});

test("rollupDqi: summary matches spec's own worked-example phrasing shape", () => {
  const r = rollupDqi(elements);
  assert.match(r.summary, /79% primary by tonne-km/);
  assert.match(r.summary, /2 of 3 legs primary/);
  assert.match(r.summary, /weakest leg geographical correlation 4/);
});

test("rollupDqi: refuses (M) on an empty shipment", () => {
  assert.equal(rollupDqi([]).label, "M");
  assert.equal(rollupDqi(null).label, "M");
});

test("rollupDqi: refuses (M) rather than silently skipping an incomplete element", () => {
  const r = rollupDqi([{ tceId: "leg-1", tonneKm: 100 }]);
  assert.equal(r.label, "M");
  assert.match(r.reason, /leg-1/);
});

test("isPrimaryLeg matches rollupDqi's own 0.5 threshold", () => {
  assert.equal(isPrimaryLeg(0.5), true);
  assert.equal(isPrimaryLeg(0.49), false);
  assert.equal(isPrimaryLeg(undefined), false);
});
