// Unit test for fetchWatchlist's per-row title/source resolution (WO-23,
// extracted as resolveWatchlistTypeFields so it's testable without a live
// Supabase client). The regression under test: a market_series row must
// resolve in its OWN branch (against the market_series table, by id) and
// NEVER fall through to the bare `type: "signal"` literal — the exact
// "silently labelled every watched research finding a 'Signal'" defect this
// module's own WatchlistItemType doc comment already records happening once,
// before both watchlist tables had any live rows to expose it.
//
// This file is RED against the pre-WO-23 shape of supabase-server.ts:
// resolveWatchlistTypeFields did not exist before this lane's fix (the inline
// render step went straight from ITEM_BACKED_TYPES -> "source" -> a bare
// `type: "signal"` literal, with no case for market_series at all).
// Confirmed by hand this session: `git stash push --keep-index -- src/lib/
// supabase-server.ts`, re-run of this file failed all 5 tests with
// "resolveWatchlistTypeFields is not a function"; `git stash pop` restored
// the fix and every test below went green. That failure mode (the function
// not existing) is the direct consequence of the defect this comment
// describes: nothing resolved market_series before this branch was added, so
// any row of that type reaching the old inline logic would have fallen
// through every existing case straight to the "signal" fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { resolveWatchlistTypeFields } = await jiti.import("./supabase-server.ts");

const EMPTY_MAPS = {
  itemMeta: new Map(),
  sourceLabels: new Map(),
  marketSeriesLabels: new Map(),
};

test("market_series resolves to its own type and label, NOT 'signal' (the mislabel regression)", () => {
  const maps = {
    ...EMPTY_MAPS,
    marketSeriesLabels: new Map([
      ["a1b2c3d4-0000-0000-0000-000000000001", { label: "Automotive diesel (EU-27 average, before taxes)" }],
    ]),
  };
  const result = resolveWatchlistTypeFields(
    "market_series",
    "a1b2c3d4-0000-0000-0000-000000000001",
    maps
  );
  assert.equal(result.type, "market_series", "must resolve as market_series, not fall through to signal");
  assert.notEqual(result.type, "signal");
  assert.equal(result.title, "Automotive diesel (EU-27 average, before taxes)");
  assert.equal(result.source, "Automotive diesel (EU-27 average, before taxes)");
});

test("market_series with no matching row falls back to the id (never 'signal')", () => {
  const result = resolveWatchlistTypeFields("market_series", "unknown-id", EMPTY_MAPS);
  assert.equal(result.type, "market_series");
  assert.equal(result.title, "unknown-id");
  assert.equal(result.source, "SERIES");
});

test("a genuine signal item_type still resolves as signal (fallback is not deleted, only guarded)", () => {
  const result = resolveWatchlistTypeFields("signal", "some-signal-id", EMPTY_MAPS);
  assert.equal(result.type, "signal");
  assert.equal(result.title, "some-signal-id");
  assert.equal(result.source, "SIGNAL");
});

test("reg/research/operations still resolve via the intelligence_items lookup, unaffected by the new branch", () => {
  const maps = {
    ...EMPTY_MAPS,
    itemMeta: new Map([["reg-1", { title: "Some Regulation", jurisdiction: "EU" }]]),
  };
  const result = resolveWatchlistTypeFields("reg", "reg-1", maps);
  assert.equal(result.type, "reg");
  assert.equal(result.title, "Some Regulation");
  assert.equal(result.jurisdiction, "EU");
});

test("source still resolves via the sources lookup, unaffected by the new branch", () => {
  const maps = {
    ...EMPTY_MAPS,
    sourceLabels: new Map([["src-1", { name: "Some Source", jurisdiction: null }]]),
  };
  const result = resolveWatchlistTypeFields("source", "src-1", maps);
  assert.equal(result.type, "source");
  assert.equal(result.title, "Some Source");
});
