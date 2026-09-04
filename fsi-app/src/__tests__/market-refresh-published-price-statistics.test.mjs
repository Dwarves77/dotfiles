// Proof for src/lib/market/refresh-published-price-statistics.mjs (WO-16 step 4, ruling WO-16.2 option a:
// FEED published_price_statistics from market_series).
//
// UPDATED 2026-09-02 (lane PROD-FIX, ruling R-D mechanism): SERIES_ITEM_MAP moved from an inline
// `Object.freeze({})` to the committed data file series-item-map.mjs, and its shape changed from a plain
// object keyed by series_key to an ORDERED ARRAY of [series_key, entry] pairs (array position, not an
// object property, fixes sort_order — see that file's own header). Every test below that exercises
// deriveDisplayRows/unmappedSeriesKeys against a synthetic map now builds that array-of-pairs shape
// directly; this is a full rewrite of the pre-lane version of this file, which asserted the OLD
// `Object.keys(SERIES_ITEM_MAP)` / plain-object-map shape and failed outright (6/14) the moment the real
// module changed under it — never leave a stale test green-by-accident when the shape it targets moves.
//
// LOCATION: same reasoning as the other new market tests in this directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SERIES_ITEM_MAP, loadSeriesItemMap, isRatified, deriveDisplayRows, unmappedSeriesKeys,
  latestPerSeries, splitEnvelopeUnit, formatValueDisplay, addDaysIso,
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

// ── the ratified state (ruling R-D executed 2026-09-04: ratify-series-items --apply over mint-run-024
//    and mint-run-029; every entry carries the live verified market_signal item id) ───────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("SERIES_ITEM_MAP has the 6 oil-bulletin series, every entry RATIFIED with a uuid item_id — R-D executed 2026-09-04", () => {
  assert.equal(SERIES_ITEM_MAP.length, 6);
  const keys = SERIES_ITEM_MAP.map(([key]) => key).sort();
  assert.deepEqual(keys, [
    "eu-oil-bulletin:automotive-diesel",
    "eu-oil-bulletin:eurosuper-95",
    "eu-oil-bulletin:heating-gas-oil",
    "eu-oil-bulletin:heavy-fuel-oil-3-5pct",
    "eu-oil-bulletin:lpg-motor-fuel",
    "eu-oil-bulletin:residual-fuel-oil-1pct",
  ]);
  for (const [key, entry] of SERIES_ITEM_MAP) {
    assert.match(String(entry.item_id), UUID_RE, `${key}: expected a uuid item_id (ratified)`);
    assert.equal(entry.status, "ratified", `${key}: expected status ratified`);
    assert.equal(isRatified(entry), true, `${key}: isRatified must be true once item_id is set`);
  }
});

test("with a fully PENDING map (the pre-ratification shape), deriveDisplayRows produces ZERO rows — never a fabricated attachment", () => {
  const pendingMap = SERIES_ITEM_MAP.map(([key, entry]) => [key, { ...entry, item_id: null, status: "pending_R-D" }]);
  const rows = deriveDisplayRows([dieselRow()], { map: pendingMap });
  assert.deepEqual(rows, []);
});

test("with the real (ratified) map, deriveDisplayRows attaches the diesel observation to its ratified item", () => {
  const rows = deriveDisplayRows([dieselRow()]);
  assert.equal(rows.length, 1);
  assert.match(String(rows[0].item_id ?? rows[0].intelligence_item_id), UUID_RE);
});

test("loadSeriesItemMap drops the _comment documentation key, keeping only real series entries", () => {
  const entries = loadSeriesItemMap();
  assert.ok(entries.every(([key]) => !key.startsWith("_")));
});

// ── isRatified ───────────────────────────────────────────────────────────────────────────────────────

test("isRatified: true only when item_id is a non-empty string", () => {
  assert.equal(isRatified({ item_id: "11111111-1111-1111-1111-111111111111" }), true);
  assert.equal(isRatified({ item_id: null }), false);
  assert.equal(isRatified({ item_id: "" }), false);
  assert.equal(isRatified(null), false);
  assert.equal(isRatified(undefined), false);
});

// ── the transform, proven against a synthetic ratified mapping (never the real one — none exists yet) ──
// SERIES_ITEM_MAP's real shape is an ORDERED ARRAY of [series_key, entry] pairs; synthetic maps below
// match that shape exactly so deriveDisplayRows/unmappedSeriesKeys are proven against the real contract.

const SYNTHETIC_MAP = Object.freeze([
  ["eu-oil-bulletin:automotive-diesel", {
    item_id: "11111111-1111-1111-1111-111111111111",
    status: "ratified",
    context_line: "EU-27 average",
  }],
]);

test("a ratified series with an observation produces one published_price_statistics-shaped row", () => {
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

test("a ratified series with NO observation yet produces no row (never a dash-row fabrication)", () => {
  const rows = deriveDisplayRows([], { map: SYNTHETIC_MAP });
  assert.deepEqual(rows, []);
});

test("a PENDING (item_id: null) entry is skipped exactly like an absent one, even with an observation present", () => {
  const pendingMap = Object.freeze([
    ["eu-oil-bulletin:automotive-diesel", { item_id: null, status: "pending_R-D" }],
  ]);
  const rows = deriveDisplayRows([dieselRow()], { map: pendingMap });
  assert.deepEqual(rows, []);
});

test("source_tier is always NULL — origin_class and the trust-tier scale are different vocabularies, never cross-mapped by guess", () => {
  const rows = deriveDisplayRows([dieselRow()], { map: SYNTHETIC_MAP });
  assert.equal(rows[0].source_tier, null);
});

test("output is ordered by sort_order — the entry's POSITION in the map array, not a stored field", () => {
  const map = Object.freeze([
    ["eu-oil-bulletin:eurosuper-95", { item_id: "b", status: "ratified" }],
    ["eu-oil-bulletin:automotive-diesel", { item_id: "a", status: "ratified" }],
  ]);
  const rows = deriveDisplayRows(
    [dieselRow(), dieselRow({ series_key: "eu-oil-bulletin:eurosuper-95", label: "Euro-Super 95" })],
    { map },
  );
  assert.deepEqual(rows.map((r) => r.item_id), ["b", "a"]);
});

// ── unmappedSeriesKeys: Part B requirement 2 — an unmapped observation is reported by name, never dropped ──

test("unmappedSeriesKeys: every series_key present in the observations but not ratified is reported, deduplicated and sorted", () => {
  const rows = [
    dieselRow(),
    dieselRow({ series_key: "eu-oil-bulletin:eurosuper-95", label: "Euro-Super 95" }),
    dieselRow({ series_key: "eu-oil-bulletin:eurosuper-95", reference_period: "2026-08-24" }), // dup key
    dieselRow({ series_key: "some-other-producer:unrelated-series" }),
  ];
  const unmapped = unmappedSeriesKeys(rows, SYNTHETIC_MAP); // only automotive-diesel is ratified in SYNTHETIC_MAP
  assert.deepEqual(unmapped, ["eu-oil-bulletin:eurosuper-95", "some-other-producer:unrelated-series"]);
});

test("unmappedSeriesKeys: a ratified series' observations never appear in the unmapped report", () => {
  const unmapped = unmappedSeriesKeys([dieselRow()], SYNTHETIC_MAP);
  assert.deepEqual(unmapped, []);
});

test("unmappedSeriesKeys against a fully PENDING map: an observation for every one of the 6 oil-bulletin series is reported unmapped", () => {
  const pendingMap = SERIES_ITEM_MAP.map(([key, entry]) => [key, { ...entry, item_id: null, status: "pending_R-D" }]);
  const rows = [
    dieselRow(),
    dieselRow({ series_key: "eu-oil-bulletin:eurosuper-95" }),
    dieselRow({ series_key: "eu-oil-bulletin:heating-gas-oil" }),
    dieselRow({ series_key: "eu-oil-bulletin:lpg-motor-fuel" }),
    dieselRow({ series_key: "eu-oil-bulletin:residual-fuel-oil-1pct" }),
    dieselRow({ series_key: "eu-oil-bulletin:heavy-fuel-oil-3-5pct" }),
  ];
  assert.equal(unmappedSeriesKeys(rows, pendingMap).length, 6, "a pending series may never be silently skipped");
  assert.deepEqual(unmappedSeriesKeys(rows), [], "against the REAL (ratified) map none of the six is unmapped");
});

test("unmappedSeriesKeys: an empty observation set reports nothing (no fabricated gaps)", () => {
  assert.deepEqual(unmappedSeriesKeys([], SYNTHETIC_MAP), []);
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

// The buildProposedItemPayloads proofs moved with the function to
// scripts/producers/market/propose-series-items.test.mjs (2026-09-02): the builder reads
// scripts/mint/item-type-required-slots.json from the filesystem and must not live under src/lib.
