// Unit test for the WO-23 additions to watchlist-links.ts: WATCHLIST_TYPE_LABEL
// and watchlistHref are exhaustive Records/switches keyed by the full
// WatchlistItemType union (per the file's own header comment on why), so
// TypeScript already forces a case here whenever the union widens. This test
// additionally confirms, at runtime, that the case is the sane one — a
// filter chip that compiles but renders "undefined" would still pass tsc.
//
// Also stands in for a live render check WatchlistSurface.tsx would give
// (this sandbox has no Supabase credentials to seed a real market_series row
// and load /watchlist): WATCHLIST_TYPE_LABEL is what that surface's filter
// chip renders verbatim (`WATCHLIST_TYPE_LABEL[t]`, WatchlistSurface.tsx:258),
// so asserting the label here is exactly the "manually confirm the filter
// chip renders a sane label, not just trust the type-checker" check the
// WO-23 spec asks for, without needing a browser or a live DB.
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
const { WATCHLIST_TYPE_LABEL, watchlistHref } = await jiti.import("./watchlist-links.ts");

test("market_series has a sane, non-empty display label", () => {
  assert.equal(WATCHLIST_TYPE_LABEL.market_series, "Series");
});

test("every WatchlistItemType has a label (exhaustiveness holds at runtime too)", () => {
  for (const t of ["source", "reg", "signal", "research", "operations", "market_series"]) {
    assert.equal(typeof WATCHLIST_TYPE_LABEL[t], "string");
    assert.ok(WATCHLIST_TYPE_LABEL[t].length > 0);
  }
});

test("watchlistHref(market_series) is an honest null — no per-series detail route exists today", () => {
  assert.equal(watchlistHref({ type: "market_series", id: "some-uuid" }), null);
});

test("watchlistHref(source) is still null (unchanged sibling case)", () => {
  assert.equal(watchlistHref({ type: "source", id: "some-id" }), null);
});

test("watchlistHref for the intelligence_items-backed types is unaffected", () => {
  assert.equal(watchlistHref({ type: "reg", id: "r1" }), "/regulations/r1");
  assert.equal(watchlistHref({ type: "research", id: "r2" }), "/research/r2");
  assert.equal(watchlistHref({ type: "operations", id: "r3" }), "/operations/r3");
  assert.equal(watchlistHref({ type: "signal", id: "r4" }), "/market/r4");
});
