// effective-confidence.test.mjs — proves effectiveConfidence()/ageDaysAtFloor() against the exact fixture
// table docs/decisions/ADR-024-decision-propagation.md §3 works through, and that this JS mirror agrees
// with migration 285's SQL `effective_confidence()` on the same cases (see that migration's own self-check
// DO block, which proves the SQL side of the SAME three assertions this file proves for JS — age 0 = base,
// one half-life = base/2, NULL half-life = never decays). Pure — zero npm dependencies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveConfidence, ageDaysAtFloor } from "./effective-confidence.mjs";

const DAY = 86_400_000;

test("effectiveConfidence: age 0 returns base unchanged", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  assert.equal(effectiveConfidence(0.9, now, 100, now), 0.9);
});

test("effectiveConfidence: exactly one half-life halves the value", () => {
  const asserted = new Date("2026-01-01T00:00:00Z");
  const now = new Date(asserted.getTime() + 100 * DAY);
  assert.equal(effectiveConfidence(1.0, asserted, 100, now), 0.5);
});

test("effectiveConfidence: two half-lives quarters the value", () => {
  const asserted = new Date("2026-01-01T00:00:00Z");
  const now = new Date(asserted.getTime() + 200 * DAY);
  assert.equal(effectiveConfidence(1.0, asserted, 100, now), 0.25);
});

test("effectiveConfidence: NULL half-life never decays, regardless of age", () => {
  const asserted = new Date("2000-01-01T00:00:00Z");
  const now = new Date("2026-09-02T00:00:00Z");
  assert.equal(effectiveConfidence(0.9, asserted, null, now), 0.9);
  assert.equal(effectiveConfidence(0.9, asserted, undefined, now), 0.9);
});

test("effectiveConfidence: accepts ISO strings, not only Date objects", () => {
  assert.equal(
    effectiveConfidence(0.9, "2026-09-02T00:00:00Z", null, "2026-09-02T00:00:00Z"),
    0.9,
  );
});

test("effectiveConfidence: rounds to 3 decimal places", () => {
  const asserted = new Date("2026-01-01T00:00:00Z");
  const now = new Date(asserted.getTime() + 33 * DAY);
  const v = effectiveConfidence(0.87, asserted, 100, now);
  assert.equal(Math.round(v * 1000), v * 1000); // already at 3 decimal places, no residual precision
});

test("effectiveConfidence RED: non-finite base throws", () => {
  assert.throws(() => effectiveConfidence(NaN, new Date(), 100, new Date()), TypeError);
  assert.throws(() => effectiveConfidence("0.9", new Date(), 100, new Date()), TypeError);
});

test("effectiveConfidence RED: a zero or negative half-life throws (only null/undefined means no decay)", () => {
  assert.throws(() => effectiveConfidence(0.9, new Date(), 0, new Date()), TypeError);
  assert.throws(() => effectiveConfidence(0.9, new Date(), -5, new Date()), TypeError);
});

test("effectiveConfidence RED: an unparseable date throws", () => {
  assert.throws(() => effectiveConfidence(0.9, "not-a-date", 100, new Date()), TypeError);
  assert.throws(() => effectiveConfidence(0.9, new Date(), 100, "not-a-date"), TypeError);
});

test("ageDaysAtFloor: agrees with effectiveConfidence at the computed crossing age", () => {
  const halfLifeDays = 180;
  const floor = 0.75;
  const ageAtFloor = ageDaysAtFloor(halfLifeDays, floor);
  const asserted = new Date("2026-01-01T00:00:00Z");
  const now = new Date(asserted.getTime() + ageAtFloor * DAY);
  const eff = effectiveConfidence(1.0, asserted, halfLifeDays, now);
  assert.ok(Math.abs(eff - floor) < 0.002, `expected ~${floor}, got ${eff}`);
});

test("ageDaysAtFloor: NULL half-life never crosses any floor (Infinity)", () => {
  assert.equal(ageDaysAtFloor(null, 0.5), Infinity);
});

test("ageDaysAtFloor: a degenerate floor (<=0 or >=1) returns null", () => {
  assert.equal(ageDaysAtFloor(100, 0), null);
  assert.equal(ageDaysAtFloor(100, 1), null);
  assert.equal(ageDaysAtFloor(100, -0.1), null);
});
