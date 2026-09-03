import { test } from "node:test";
import assert from "node:assert/strict";
import { computeIndexedValue, draftClauseText } from "./indexation.mjs";

test("computeIndexedValue: index up 20%, 50% passthrough -> value up 10%", () => {
  const r = computeIndexedValue({ baseValue: 1000, indexBaseline: 100, indexCurrent: 120, passthroughPct: 50 });
  assert.equal(r.label, "estimate");
  assert.equal(r.derivation, "calculated");
  assert.equal(r.value, 1100);
  assert.equal(r.wasClamped, false);
});

test("computeIndexedValue: 100% passthrough tracks the index move exactly", () => {
  const r = computeIndexedValue({ baseValue: 1000, indexBaseline: 100, indexCurrent: 130, passthroughPct: 100 });
  assert.equal(r.value, 1300);
});

test("computeIndexedValue: 0% passthrough never moves the base value", () => {
  const r = computeIndexedValue({ baseValue: 1000, indexBaseline: 100, indexCurrent: 500, passthroughPct: 0 });
  assert.equal(r.value, 1000);
});

test("computeIndexedValue: cap clamps a large upward move", () => {
  const r = computeIndexedValue({ baseValue: 1000, indexBaseline: 100, indexCurrent: 300, passthroughPct: 100, capPct: 15 });
  assert.equal(r.value, 1150);
  assert.equal(r.wasClamped, true);
  assert.equal(r.clampedBy, "cap");
  assert.ok(r.rawValue > r.value, "raw (unclamped) value should be reported and larger than the clamped one");
});

test("computeIndexedValue: floor clamps a large downward move", () => {
  const r = computeIndexedValue({ baseValue: 1000, indexBaseline: 100, indexCurrent: 20, passthroughPct: 100, floorPct: -10 });
  assert.equal(r.value, 900);
  assert.equal(r.wasClamped, true);
  assert.equal(r.clampedBy, "floor");
});

test("computeIndexedValue: refuses (M) on a zero baseline, an out-of-range passthrough, or an inverted band", () => {
  assert.equal(computeIndexedValue({ baseValue: 1000, indexBaseline: 0, indexCurrent: 100, passthroughPct: 50 }).label, "M");
  assert.equal(computeIndexedValue({ baseValue: 1000, indexBaseline: 100, indexCurrent: 100, passthroughPct: 150 }).label, "M");
  assert.equal(computeIndexedValue({ baseValue: 1000, indexBaseline: 100, indexCurrent: 100, passthroughPct: 50, capPct: -10, floorPct: 10 }).label, "M");
});

test("computeIndexedValue: refuses (M) on non-numeric input", () => {
  assert.equal(computeIndexedValue({ baseValue: "x", indexBaseline: 100, indexCurrent: 110, passthroughPct: 50 }).label, "M");
});

test("draftClauseText: always throws, never returns text", () => {
  assert.throws(() => draftClauseText(), /refusing/i);
  assert.throws(() => draftClauseText(), /computeIndexedValue/);
});
