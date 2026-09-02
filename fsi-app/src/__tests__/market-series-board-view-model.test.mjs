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

  // Updated 2026-08-31 (lane P2, build/wave-p2): ecb-fx-producer.mjs shipped, flipping series-registry.mjs's
  // ecb-fx entry to implemented:true (kill-switched off by default) — it now behaves the same as
  // eu-oil-bulletin here, registered but zero rows observed. Updated again 2026-09-02 (Lane PROD,
  // system-completion train): eia-v2's registry flag was corrected to implemented:true (the producer
  // script itself shipped 2026-09-01; only the registry flag was stale — see market-series-registry.test.mjs
  // for the full note). eex-eua remains the one true documented stub.
  const ecbFx = board.groups.find((g) => g.keyPrefix === "ecb-fx");
  assert.equal(ecbFx.implemented, true);
  assert.equal(ecbFx.state, "registered_unpopulated", "an implemented producer with zero rows must say so explicitly, not render blank");

  const eiaV2 = board.groups.find((g) => g.keyPrefix === "eia-v2");
  assert.equal(eiaV2.implemented, true);
  assert.equal(eiaV2.state, "registered_unpopulated", "an implemented producer with zero rows must say so explicitly, not render blank");

  for (const g of board.groups.filter((g) => !["eu-oil-bulletin", "ecb-fx", "eia-v2"].includes(g.keyPrefix))) {
    assert.equal(g.implemented, false);
    assert.equal(g.state, "not_built", "an un-implemented registry entry is a documented stub — not the same state as registered-but-unpopulated");
  }
});

test("buildSeriesBoard names every implemented producer even when nothing has been observed yet", () => {
  const board = buildSeriesBoard(undefined);
  assert.equal(board.implementedProducerCount, MARKET_SERIES_PRODUCERS.filter((p) => p.implemented).length);
  assert.equal(board.totalProducers, MARKET_SERIES_PRODUCERS.length);
  const implementedNames = board.groups.filter((g) => g.implemented).map((g) => g.name);
  // Updated 2026-09-02 (Lane PROD): eia-v2 joins eu-oil-bulletin and ecb-fx as implemented — see note above.
  assert.deepEqual(implementedNames, [
    "EU Weekly Oil Bulletin",
    "ECB euro foreign exchange reference rates",
    "US EIA v2 API (fuel/energy price series)",
  ]);
});

// ── buildSeriesBoard: id passthrough (L6, watch mount identity) ────────
//
// fetchWatchlist's resolveWatchlistTypeFields (supabase-server.ts, WO-23) resolves a watched
// market_series row by its `id` (uuid) against the market_series table, NOT by series_key. A
// WatchButton mounted on this display row must therefore watch `id`, not `seriesKey` — this test
// pins that the winning row's `id` survives the latest-per-series reduction instead of being
// dropped, which would leave the board with nothing to mount a watch against.

test("buildSeriesBoard threads the winning row's `id` through to the display row (watch-mount identity)", () => {
  const rows = [
    { id: "aaaaaaaa-0000-0000-0000-000000000001", series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1500, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-10", as_at_date: "2026-08-10" },
    { id: "aaaaaaaa-0000-0000-0000-000000000002", series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1543.21, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-24", as_at_date: "2026-08-24" },
  ];
  const board = buildSeriesBoard(rows);
  const group = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin");
  const s = group.series[0];
  // The LATER row (2026-08-24) wins the reduction, so its id — not the earlier row's — must be the one
  // threaded through.
  assert.equal(s.id, "aaaaaaaa-0000-0000-0000-000000000002");
});

test("buildSeriesBoard renders `id: null` (never throws) for a row missing `id`, rather than fabricating one", () => {
  const rows = [
    { series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1500, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-10", as_at_date: "2026-08-10" },
  ];
  const board = buildSeriesBoard(rows);
  const group = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin");
  assert.equal(group.series[0].id, null);
});

// ── buildSeriesBoard: provenance envelope passthrough (Lane SURF, methodology drawer) ──────────────────
// fetchMarketSeriesBoard's query already selects derivation/origin_class/method_version/n_observations
// (src/lib/supabase-server.ts:2595) — this only threads them through the display row so the methodology
// drawer (spec 02 §6 item 10) can render them without a query change.

test("buildSeriesBoard threads derivation/origin_class/method_version/n_observations/unit/currency through to the display row", () => {
  const rows = [
    {
      series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1543.21,
      unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-24", as_at_date: "2026-08-24",
      derivation: "observed", origin_class: "official", method_version: "v1", n_observations: 27,
      source_key: "ec_weekly_oil_bulletin", source_ref: "table-3",
    },
  ];
  const board = buildSeriesBoard(rows);
  const s = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin").series[0];
  assert.equal(s.derivation, "observed");
  assert.equal(s.originClass, "official");
  assert.equal(s.methodVersion, "v1");
  assert.equal(s.nObservations, 27);
  assert.equal(s.unit, "EUR/1000L");
  assert.equal(s.currency, "EUR");
  assert.equal(s.sourceKey, "ec_weekly_oil_bulletin");
  assert.equal(s.sourceRef, "table-3");
});

test("buildSeriesBoard renders null (never fabricates) provenance fields the row does not carry", () => {
  const rows = [
    { series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1500, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-10", as_at_date: "2026-08-10" },
  ];
  const board = buildSeriesBoard(rows);
  const s = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin").series[0];
  assert.equal(s.derivation, null);
  assert.equal(s.originClass, null);
  assert.equal(s.methodVersion, null);
  assert.equal(s.nObservations, null);
});

// ── buildSeriesBoard: comparative-ribbon deltas (Lane SURF, spec 02 §6 item 1) ──────────────────────────

test("buildSeriesBoard attaches deltas computed from the FULL row history for a series_key, not just the latest row", () => {
  const rows = [
    { series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1487.10, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-17", as_at_date: "2026-08-17" },
    { series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1493.60, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-24", as_at_date: "2026-08-24" },
  ];
  const board = buildSeriesBoard(rows);
  const s = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin").series[0];
  assert.equal(s.deltas.count, 2);
  assert.ok(s.deltas.delta1w && !s.deltas.delta1w.insufficientHistory);
  assert.ok(Math.abs(s.deltas.delta1w.value - 6.5) < 1e-9);
});

test("buildSeriesBoard on a single observation reports 'one observation, no delta yet' via deltas, never a fabricated delta", () => {
  const rows = [
    { series_key: "eu-oil-bulletin:automotive-diesel", label: "Diesel", value_numeric: 1500, unit: "EUR/1000L", currency: "EUR", reference_period: "2026-08-24", as_at_date: "2026-08-24" },
  ];
  const board = buildSeriesBoard(rows);
  const s = board.groups.find((g) => g.keyPrefix === "eu-oil-bulletin").series[0];
  assert.equal(s.deltas.count, 1);
  assert.equal(s.deltas.message, "one observation, no delta yet (history backfill pending)");
  assert.equal(s.deltas.delta1w, null);
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
