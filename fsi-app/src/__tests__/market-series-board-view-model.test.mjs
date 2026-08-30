// Proof for src/lib/market/series-board-view-model.mjs (WO-16 layer 3: the /market series board).
//
// LOCATION: same reasoning as the other new market tests in this directory — run-test-suite.sh's
// src/lib/* directory globs do not cover src/lib/market/ (checked against the script's own list,
// 2026-08-30), but `src/__tests__/*.test.mjs` is a covered glob, so a test dropped here runs in
// pre-push AND CI by construction, exactly like market-series-registry.test.mjs and
// market-refresh-published-price-statistics.test.mjs already do for sibling src/lib/market/ modules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSeriesValue, buildSeriesBoard } from "../lib/market/series-board-view-model.mjs";
import { MARKET_SERIES_PRODUCERS } from "../lib/market/series-registry.mjs";

// ── formatSeriesValue: currency honesty ─────────────────────────────────

test("formatSeriesValue renders a known currency's real symbol and strips the redundant unit prefix", () => {
  const { text, emptyReason } = formatSeriesValue({
    value_numeric: 1493.6, unit: "EUR/1000L", currency: "EUR",
  });
  assert.equal(text, "€1,493.60/1000L");
  assert.equal(emptyReason, null);
});

test("formatSeriesValue NEVER fabricates a symbol for an unrecognised currency — shows the raw code instead", () => {
  const { text } = formatSeriesValue({ value_numeric: 42, unit: null, currency: "ZWL" });
  assert.equal(text, "42.00 ZWL");
  // Explicitly not a guessed symbol for an unrecognised code.
  assert.ok(!text.includes("Z$"));
});

test("formatSeriesValue with no currency at all shows the number with no symbol and no code", () => {
  const { text } = formatSeriesValue({ value_numeric: 7.5, unit: "tonnes", currency: null });
  assert.equal(text, "7.50 tonnes");
});

test("formatSeriesValue with a null value_numeric renders an honest em dash, never a fabricated number", () => {
  const { text, emptyReason } = formatSeriesValue({ value_numeric: null, unit: "EUR/1000L", currency: "EUR" });
  assert.equal(text, "—");
  assert.equal(emptyReason, "not yet observed");
});

test("formatSeriesValue with a non-numeric value_numeric renders an honest em dash", () => {
  const { text, emptyReason } = formatSeriesValue({ value_numeric: "not-a-number", currency: "EUR" });
  assert.equal(text, "—");
  assert.equal(emptyReason, "non-numeric value_numeric");
});

// ── buildSeriesBoard: latest-per-series reduction ───────────────────────

test("buildSeriesBoard keeps only the GREATEST reference_period per series_key (latest-per-series reduction)", () => {
  const rows = [
    { series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1500, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-10", as_at_date: "2026-08-10" },
    { series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1543.21, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-24", as_at_date: "2026-08-24" },
    { series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1520, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-17", as_at_date: "2026-08-17" },
  ];
  const board = buildSeriesBoard(rows);
  const group = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin");
  assert.equal(group.series.length, 1, "3 rows for one series_key must reduce to exactly 1 displayed row");
  const s = group.series[0];
  assert.equal(s.referencePeriod, "2026-08-24", "the greatest reference_period must win");
  assert.equal(s.displayValue, "€1,543.21/1000L");
  // The reduction discards rows for DISPLAY but the history count still reflects all 3 observations.
  assert.equal(s.observationCount, 3);
});

// ── buildSeriesBoard: grouping by registry prefix ───────────────────────

test("buildSeriesBoard groups series under their registry producer, one group per registry entry, in registry order", () => {
  const rows = [
    { series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1543.21, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-24", as_at_date: "2026-08-24" },
    { series_key: "eu-oil-bulletin:eurosuper-95", label: "Petrol", value_numeric: 1600, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-24", as_at_date: "2026-08-24" },
  ];
  const board = buildSeriesBoard(rows);
  assert.deepEqual(
    board.groups.map((g) => g.keyPrefix),
    MARKET_SERIES_PRODUCERS.map((p) => p.keyPrefix),
    "every registry entry gets a group, in registry order, regardless of which rows arrived",
  );
  const eu = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin");
  assert.equal(eu.series.length, 2);
  assert.deepEqual(eu.series.map((s) => s.seriesKey), ["eu-oil-bulletin:automotive-diesel", "eu-oil-bulletin:eurosuper-95"]);
  // No cross-contamination: the stub producers carry none of the eu-oil-bulletin rows.
  for (const g of board.groups.filter((g) => g.keyPrefix !== "eu-oil-bulletin")) {
    assert.equal(g.series.length, 0);
  }
});

test("a row whose series_key prefix matches no registry entry is surfaced in `unregistered`, never dropped", () => {
  const rows = [
    { series_key: "not-a-registered-prefix:x", label: "Mystery series", value_numeric: 1, unit: null, currency: null, reference_period: "2026-08-24", as_at_date: "2026-08-24" },
  ];
  const board = buildSeriesBoard(rows);
  assert.equal(board.unregistered.length, 1);
  assert.equal(board.unregistered[0].seriesKey, "not-a-registered-prefix:x");
  for (const g of board.groups) assert.equal(g.series.length, 0);
  assert.equal(board.totalObservedSeries, 1, "the unregistered row still counts toward the total — never silently vanishes");
});

// ── buildSeriesBoard: the empty-table state (mid-build honesty) ─────────

test("buildSeriesBoard on an EMPTY table renders a clearly-labelled registered-not-yet-populated state, never a blank hole", () => {
  const board = buildSeriesBoard([]);
  assert.equal(board.isEmpty, true);
  assert.equal(board.totalObservedSeries, 0);
  assert.equal(board.unregistered.length, 0);
  assert.equal(board.groups.length, MARKET_SERIES_PRODUCERS.length);

  const eu = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin");
  assert.equal(eu.implemented, true);
  assert.equal(eu.state, "registered_unpopulated", "an implemented producer with zero rows must say so explicitly, not render blank");

  for (const g of board.groups.filter((g) => g.keyPrefix !== "eu-oil-bulletin")) {
    assert.equal(g.implemented, false);
    assert.equal(g.state, "not_built", "an un-implemented registry entry is a documented stub — not the same state as registered-but-unpopulated");
  }
});

test("buildSeriesBoard names every implemented producer even when nothing has been observed yet", () => {
  const board = buildSeriesBoard(undefined);
  assert.equal(board.implementedProducerCount, MARKET_SERIES_PRODUCERS.filter((p) => p.implemented).length);
  assert.equal(board.totalProducers, MARKET_SERIES_PRODUCERS.length);
  const implementedNames = board.groups.filter((g) => g.implemented).map((g) => g.name);
  assert.deepEqual(implementedNames, ["EU Weekly Oil Bulletin"]);
});

test("a producer with rows for ONE of its series still shows state 'populated' for the group as a whole", () => {
  const rows = [
    { series_key: "eu-oil-bulletin:eurosuper-95", label: "Petrol", value_numeric: 1600, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-24", as_at_date: "2026-08-24" },
  ];
  const board = buildSeriesBoard(rows);
  const eu = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin");
  assert.equal(eu.state, "populated");
  assert.equal(eu.series.length, 1);
});
