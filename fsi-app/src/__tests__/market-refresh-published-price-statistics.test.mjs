// Proof for src/lib/market/refresh-published-price-statistics.mjs (WO-16 step 4, ruling WO-16.2 option a:
// FEED published_price_statistics from market_series).
//
// LOCATION: same reasoning as the other new market tests in this directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SERIES_ITEM_MAP, deriveDisplayRows, latestPerSeries, splitEnvelopeUnit, formatValueDisplay, addDaysIso,
} from "../lib/market/refresh-published-price-statistics.mjs";

const dieselRow = (over = {}) => ({
  series_key: "eu-oil-bulletin:automotive-diesel",
  reference_period: "2026-08-17",
  label: "Automotive gas oil / diesel (EU average, before taxes)",
  value_numeric: 1487.10,
  unit: "EUR/1000L",
  currency: "EUR",
  as_at_date: "2026-08-17",
  ...over,
});

// ── the honest-default state ────────────────────────────────────────────────────────────────────────

test("SERIES_ITEM_MAP is empty today — no market_series producer has a ratified published_price_statistics attachment", () => {
  assert.deepEqual(Object.keys(SERIES_ITEM_MAP), []);
});

test("with the default (empty) map, deriveDisplayRows produces ZERO rows — never a fabricated attachment", () => {
  const rows = deriveDisplayRows([dieselRow()]);
  assert.deepEqual(rows, []);
});

// ── the transform, proven against a synthetic ratified mapping (never the real one — none exists) ──

const SYNTHETIC_MAP = Object.freeze({
  "eu-oil-bulletin:automotive-diesel": { itemId: "11111111-1111-1111-1111-111111111111", sortOrder: 0, contextLine: "EU-27 average" },
});

test("a mapped series with an observation produces one published_price_statistics-shaped row", () => {
  const rows = deriveDisplayRows([dieselRow()], { map: SYNTHETIC_MAP });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.item_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(r.label, dieselRow().label);
  assert.equal(r.value_display, "€1,487.10");
  assert.equal(r.unit, "/1000L");
  assert.equal(r.context_line, "EU-27 average");
  assert.equal(r.released_at, "2026-08-17");
  assert.equal(r.sort_order, 0);
});

test("next_release_at is reference_period + the producer's cadenceDays (7 for eu-oil-bulletin)", () => {
  const rows = deriveDisplayRows([dieselRow()], { map: SYNTHETIC_MAP });
  assert.equal(rows[0].next_release_at, "2026-08-24");
});

test("a mapped series with NO observation yet produces no row (never a dash-row fabrication)", () => {
  const rows = deriveDisplayRows([], { map: SYNTHETIC_MAP });
  assert.deepEqual(rows, []);
});

test("source_tier is always NULL — origin_class and the trust-tier scale are different vocabularies, never cross-mapped by guess", () => {
  const rows = deriveDisplayRows([dieselRow()], { map: SYNTHETIC_MAP });
  assert.equal(rows[0].source_tier, null);
});

test("output is ordered by sort_order", () => {
  const map = Object.freeze({
    "eu-oil-bulletin:automotive-diesel": { itemId: "a", sortOrder: 1 },
    "eu-oil-bulletin:eurosuper-95": { itemId: "b", sortOrder: 0 },
  });
  const rows = deriveDisplayRows(
    [dieselRow(), dieselRow({ series_key: "eu-oil-bulletin:eurosuper-95", label: "Euro-Super 95" })],
    { map },
  );
  assert.deepEqual(rows.map((r) => r.item_id), ["b", "a"]);
});

// ── helpers, each pure and independently proven ─────────────────────────────────────────────────────

test("latestPerSeries keeps the greatest reference_period per series_key", () => {
  const latest = latestPerSeries([
    dieselRow({ reference_period: "2026-08-17", value_numeric: 1487.10 }),
    dieselRow({ reference_period: "2026-08-24", value_numeric: 1493.60 }),
  ]);
  assert.equal(latest.get("eu-oil-bulletin:automotive-diesel").reference_period, "2026-08-24");
  assert.equal(latest.get("eu-oil-bulletin:automotive-diesel").value_numeric, 1493.60);
});

test("splitEnvelopeUnit strips the currency prefix, keeping the slash", () => {
  assert.deepEqual(splitEnvelopeUnit("EUR/1000L", "EUR"), { symbol: "€", suffix: "/1000L" });
  assert.deepEqual(splitEnvelopeUnit("EUR/tonne", "EUR"), { symbol: "€", suffix: "/tonne" });
});

test("splitEnvelopeUnit strips the prefix (currency-agnostic) even for an unrecognised currency symbol", () => {
  assert.deepEqual(splitEnvelopeUnit("XYZ/unit", "XYZ"), { symbol: null, suffix: "/unit" });
});

test("splitEnvelopeUnit leaves the unit untouched when it does not carry the currency as a prefix", () => {
  assert.deepEqual(splitEnvelopeUnit("index_points", "EUR"), { symbol: "€", suffix: "index_points" });
});

test("formatValueDisplay renders a currency symbol + 2-decimal, comma-grouped number", () => {
  assert.equal(formatValueDisplay(1493.6, "EUR"), "€1,493.60");
  assert.equal(formatValueDisplay(73.59, "USD"), "$73.59");
});

test("addDaysIso adds calendar days across a month boundary", () => {
  assert.equal(addDaysIso("2026-08-28", 7), "2026-09-04");
});

test("addDaysIso returns null for a null date or null day count (never guesses a release date)", () => {
  assert.equal(addDaysIso(null, 7), null);
  assert.equal(addDaysIso("2026-08-17", null), null);
});
