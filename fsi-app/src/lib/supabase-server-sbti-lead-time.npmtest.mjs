// Injected-client test for fetchSbtiLeadTimeSeries (lane L10, rule 17: "nothing in this build runs
// alone", a chart mounted with no raw-row read behind it is a half slice, so this fetcher exists
// beside fetchMarketSeriesBoard and must itself be proven, not just imported). Mirrors the jiti-import
// pattern src/lib/supabase-server-watchlist.npmtest.mjs already uses to import the real
// supabase-server.ts (which needs next/cache's unstable_cache at module load, outside the no-npm
// suite's reach) rather than a second import mechanism.
//
// `deps.supabase` is the injection point fetchSbtiLeadTimeSeries accepts for tests only (see that
// function's own header); these tests never touch isSupabaseConfigured()/getServiceSupabase(), no DB
// credential, no network.
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
const { fetchSbtiLeadTimeSeries } = await jiti.import("./supabase-server.ts");

/** A fake Supabase query-builder chain: every method but the last returns itself; the call the
 *  production code awaits (`.limit(...)`) resolves to `{ data, error }`. Records the args each
 *  chained method was called with so a test can assert the exact query shape. */
function fakeSupabaseClient({ data = [], error = null } = {}) {
  const calls = {};
  const chain = {
    from: (...args) => { calls.from = args; return chain; },
    select: (...args) => { calls.select = args; return chain; },
    like: (...args) => { calls.like = args; return chain; },
    order: (...args) => { calls.order = args; return chain; },
    limit: async (...args) => { calls.limit = args; return { data, error }; },
  };
  return { chain, calls };
}

test("returns the injected client's rows unchanged, no reduction through buildSeriesBoard", async () => {
  const rows = [
    { series_key: "sbti:acme-freight", label: "Acme Freight", value_numeric: 14, unit: "months" },
  ];
  const { chain } = fakeSupabaseClient({ data: rows });
  const result = await fetchSbtiLeadTimeSeries({ supabase: chain });
  assert.deepEqual(result, rows);
});

test("filters to the sbti: key prefix via .like('series_key', 'sbti:%'), reusing fetchMarketSeriesBoard's own table/order/limit shape", async () => {
  const { chain, calls } = fakeSupabaseClient({ data: [] });
  await fetchSbtiLeadTimeSeries({ supabase: chain });
  assert.deepEqual(calls.from, ["market_series"]);
  assert.deepEqual(calls.like, ["series_key", "sbti:%"]);
  assert.ok(calls.order, "must order (fetchMarketSeriesBoard's own convention)");
  assert.ok(calls.limit, "must cap the row count (fetchMarketSeriesBoard's own SERIES_HISTORY_LIMIT convention)");
});

test("a query error returns [] rather than throwing or surfacing the error to the caller", async () => {
  const { chain } = fakeSupabaseClient({ data: null, error: { message: "boom" } });
  const result = await fetchSbtiLeadTimeSeries({ supabase: chain });
  assert.deepEqual(result, []);
});

test("a thrown exception from the client returns [] rather than crashing the page", async () => {
  const throwingChain = {
    from: () => throwingChain,
    select: () => throwingChain,
    like: () => throwingChain,
    order: () => throwingChain,
    limit: async () => { throw new Error("network down"); },
  };
  const result = await fetchSbtiLeadTimeSeries({ supabase: throwingChain });
  assert.deepEqual(result, []);
});

test("null data resolves to [] (never null passed to the caller)", async () => {
  const { chain } = fakeSupabaseClient({ data: null, error: null });
  const result = await fetchSbtiLeadTimeSeries({ supabase: chain });
  assert.deepEqual(result, []);
});
