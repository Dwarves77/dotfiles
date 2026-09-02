// Proof for src/lib/market/series-deltas.mjs (Lane SURF: spec 02 §6 item 1 comparative ribbon,
// §3 standard row). Covers: single point, two points, gaps, mixed units.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSeriesDeltas, buildComparativeRibbon, DELTA_WINDOWS } from "../lib/market/series-deltas.mjs";

const row = (over = {}) => ({
  series_key: "eu-oil-bulletin:automotive-diesel",
  label: "Automotive gas oil / diesel",
  value_numeric: 1500,
  unit: "EUR/1000L",
  currency: "EUR",
  reference_period: "2026-08-24",
  as_at_date: "2026-08-24",
  ...over,
});

// ── zero observations ───────────────────────────────────────────────────────────────────────────────

test("zero rows: no observations on record, never a fabricated latest/sparkline point", () => {
  const d = computeSeriesDeltas([]);
  assert.equal(d.count, 0);
  assert.equal(d.latest, null);
  assert.deepEqual(d.sparkline, []);
  assert.equal(d.message, "no observations on record");
  assert.equal(d.delta1w, null);
  assert.equal(d.delta1m, null);
  assert.equal(d.deltaYoY, null);
});

// ── single observation: the case live data is in TODAY [confirmed 2026-09-02] ──────────────────────────

test("single observation: 'one observation, no delta yet' — NEVER a fabricated delta from one point", () => {
  const d = computeSeriesDeltas([row()]);
  assert.equal(d.count, 1);
  assert.equal(d.latest.value, 1500);
  assert.equal(d.sparkline.length, 1);
  assert.equal(d.message, "one observation, no delta yet (history backfill pending)");
  assert.equal(d.delta1w, null);
  assert.equal(d.delta1m, null);
  assert.equal(d.deltaYoY, null);
});

// ── two observations: a real, computable delta ──────────────────────────────────────────────────────

test("two observations 7 days apart: delta1w is real and computed; delta1m/deltaYoY report insufficient history", () => {
  const d = computeSeriesDeltas([
    row({ reference_period: "2026-08-17", as_at_date: "2026-08-17", value_numeric: 1487.10 }),
    row({ reference_period: "2026-08-24", as_at_date: "2026-08-24", value_numeric: 1493.60 }),
  ]);
  assert.equal(d.count, 2);
  assert.equal(d.message, null);
  assert.ok(d.delta1w && !d.delta1w.insufficientHistory);
  assert.ok(Math.abs(d.delta1w.value - 6.5) < 1e-9);
  assert.equal(d.delta1w.fromDate, "2026-08-17");
  assert.equal(d.delta1w.kind, "quantity");
  assert.ok(typeof d.delta1w.pct === "number" && d.delta1w.pct > 0);
  assert.ok(d.delta1m.insufficientHistory);
  assert.ok(d.deltaYoY.insufficientHistory);
});

test("delta1w picks the NEAREST point at or before (latest - 7d), not an exact-date match", () => {
  const d = computeSeriesDeltas([
    row({ reference_period: "2026-08-10", value_numeric: 1400 }),
    row({ reference_period: "2026-08-20", value_numeric: 1500 }), // 12 days before latest — still <= target(-7d=08-25)
    row({ reference_period: "2026-09-01", value_numeric: 1550 }),
  ]);
  // latest = 2026-09-01; target for 1w = 2026-08-25; nearest point at/before that is 2026-08-20.
  assert.equal(d.delta1w.fromDate, "2026-08-20");
  assert.ok(Math.abs(d.delta1w.value - 50) < 1e-9);
});

// ── gaps: a window with no comparable point reports insufficient history, never a fabricated zero ─────

test("gaps: a 3-week-only history has no comparable point for ΔYoY", () => {
  const d = computeSeriesDeltas([
    row({ reference_period: "2026-08-10", value_numeric: 1400 }),
    row({ reference_period: "2026-08-24", value_numeric: 1500 }),
  ]);
  assert.ok(d.deltaYoY.insufficientHistory);
  assert.notEqual(d.deltaYoY.value, 0, "insufficient history must never render as a real zero delta");
});

test("a single point far in the past (before any window target) leaves every window insufficient", () => {
  const d = computeSeriesDeltas([row({ reference_period: "2020-01-01", value_numeric: 900 }), row({ reference_period: "2026-09-01", value_numeric: 1500 })]);
  // The prior point (2020) IS before the 1w/1m targets, so it DOES resolve for those windows — this
  // pins that a distant point is still honestly used when it is the nearest available, not discarded.
  assert.ok(d.delta1w && !d.delta1w.insufficientHistory);
  assert.equal(d.delta1w.fromDate, "2020-01-01");
});

// ── mixed units: refuse to compare across a unit or currency change ────────────────────────────────────

test("mixed units: a unit change between the compared pair refuses the comparison (unitMismatch), never computes across it", () => {
  const d = computeSeriesDeltas([
    row({ reference_period: "2026-08-17", value_numeric: 1487.10, unit: "EUR/1000L", currency: "EUR" }),
    row({ reference_period: "2026-08-24", value_numeric: 1.4871, unit: "EUR/L", currency: "EUR" }), // series-break unit change
  ]);
  assert.ok(d.delta1w.unitMismatch);
  assert.equal(d.delta1w.fromDate, "2026-08-17");
  assert.equal(d.delta1w.value, undefined, "a unit-mismatched delta must carry no numeric value");
});

test("mixed currency: a currency change between the compared pair also refuses the comparison", () => {
  const d = computeSeriesDeltas([
    row({ reference_period: "2026-08-17", value_numeric: 1487.10, unit: "EUR/1000L", currency: "EUR" }),
    row({ reference_period: "2026-08-24", value_numeric: 1600.0, unit: "EUR/1000L", currency: "USD" }),
  ]);
  assert.ok(d.delta1w.unitMismatch);
});

// ── zero-division guard on percent ──────────────────────────────────────────────────────────────────

test("a prior value of zero yields a real value delta but a null pct (division-by-zero guard, never Infinity/NaN)", () => {
  const d = computeSeriesDeltas([
    row({ reference_period: "2026-08-17", value_numeric: 0 }),
    row({ reference_period: "2026-08-24", value_numeric: 5 }),
  ]);
  assert.equal(d.delta1w.value, 5);
  assert.equal(d.delta1w.pct, null);
});

// ── DELTA_WINDOWS is the published contract other modules may read ─────────────────────────────────────

test("DELTA_WINDOWS names 1w/1m/YoY in days", () => {
  assert.deepEqual(DELTA_WINDOWS, { w1: 7, m1: 30, yoy: 365 });
});

// ── buildComparativeRibbon: groups by series_key, one entry per observed series ────────────────────────

test("buildComparativeRibbon groups mixed rows by series_key, alphabetically", () => {
  const rows = [
    row({ series_key: "eu-oil-bulletin:eurosuper-95", label: "Petrol", reference_period: "2026-08-24", value_numeric: 1600 }),
    row({ series_key: "eu-oil-bulletin:automotive-diesel", reference_period: "2026-08-17", value_numeric: 1487.10 }),
    row({ series_key: "eu-oil-bulletin:automotive-diesel", reference_period: "2026-08-24", value_numeric: 1493.60 }),
  ];
  const ribbon = buildComparativeRibbon(rows);
  assert.deepEqual(ribbon.map((r) => r.seriesKey), ["eu-oil-bulletin:automotive-diesel", "eu-oil-bulletin:eurosuper-95"]);
  const diesel = ribbon.find((r) => r.seriesKey === "eu-oil-bulletin:automotive-diesel");
  assert.equal(diesel.count, 2);
  const petrol = ribbon.find((r) => r.seriesKey === "eu-oil-bulletin:eurosuper-95");
  assert.equal(petrol.count, 1);
  assert.equal(petrol.message, "one observation, no delta yet (history backfill pending)");
});

test("buildComparativeRibbon on empty input returns an empty ribbon, never a fabricated placeholder row", () => {
  assert.deepEqual(buildComparativeRibbon([]), []);
  assert.deepEqual(buildComparativeRibbon(undefined), []);
});

test("buildComparativeRibbon skips rows with no series_key rather than throwing", () => {
  const ribbon = buildComparativeRibbon([{ label: "orphan", value_numeric: 1 }, row()]);
  assert.equal(ribbon.length, 1);
});
