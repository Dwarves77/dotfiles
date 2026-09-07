// Portable node --test proof for list-surface-helpers.ts's pure facet/filter/link-contract
// functions (UILISTS lane, 2026-09-06) — the shared derivations Regulations/Market/Research/
// Operations/Watchlist all build their band tiles, Mode/Region facets and detail-return hrefs
// from. No React, no DOM: every function under test takes plain data and returns plain data.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// jiti resolves this file's own `@/lib/urgency/bands` import (a tsconfig path alias `node --test`
// itself cannot follow) — same pattern src/lib/supabase-server-watchlist.npmtest.mjs already uses
// for its own `.ts` import under test.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { modeFacetOptions, regionFacetOptions, bandFacetOptions, filterRows, withListPosition, EMPTY_FILTER_STATE } =
  await jiti.import("./list-surface-helpers.ts");

function res(over = {}) {
  return { id: "r1", title: "A regulation", priority: "HIGH", jurisdiction: "EU", modes: ["ocean"], tags: [], ...over };
}

test("modeFacetOptions counts distinct modes across rows, sorted by count desc then alpha", () => {
  const rows = [res({ modes: ["ocean"] }), res({ modes: ["ocean", "air"] }), res({ modes: ["road"] })];
  const opts = modeFacetOptions(rows);
  assert.deepEqual(opts.map((o) => o.value), ["ocean", "air", "road"]);
  assert.equal(opts[0].count, 2);
});

test("modeFacetOptions returns nothing for rows with no modes", () => {
  assert.deepEqual(modeFacetOptions([res({ modes: [] }), res({ modes: undefined })]), []);
});

test("regionFacetOptions prefers the live byJurisdiction corpus count over a loaded-rows tally", () => {
  const rows = [res({ jurisdiction: "EU" })];
  const opts = regionFacetOptions(rows, { EU: 40, US: 12 });
  assert.deepEqual(
    opts.map((o) => o.value),
    ["EU", "US"],
  );
  assert.equal(opts[0].count, 40, "must report the corpus count (40), not the loaded-rows count (1)");
});

test("regionFacetOptions falls back to a loaded-rows tally when byJurisdiction is absent or empty", () => {
  const rows = [res({ jurisdiction: "EU" }), res({ jurisdiction: "EU" }), res({ jurisdiction: undefined })];
  const opts = regionFacetOptions(rows, undefined);
  const eu = opts.find((o) => o.value === "EU");
  const global = opts.find((o) => o.value === "global");
  assert.equal(eu.count, 2);
  assert.equal(global.count, 1, "a row with no jurisdiction falls back to the honest 'global' bucket, never dropped");
});

test("bandFacetOptions reports the live byPriority corpus count per band, in BAND_ORDER", () => {
  const opts = bandFacetOptions([], { CRITICAL: 3, HIGH: 9, MODERATE: 0, LOW: 1 });
  assert.equal(opts.length, 4);
  const high = opts.find((o) => o.label === opts.find((x) => x.count === 9).label);
  assert.equal(high.count, 9);
});

test("filterRows band/mode/region/query compose (AND, order-preserving)", () => {
  const rows = [
    res({ id: "a", priority: "HIGH", modes: ["ocean"], jurisdiction: "EU", title: "CBAM reporting" }),
    res({ id: "b", priority: "LOW", modes: ["ocean"], jurisdiction: "EU", title: "Unrelated" }),
    res({ id: "c", priority: "HIGH", modes: ["road"], jurisdiction: "US", title: "CBAM trucking" }),
  ];
  const byBand = filterRows(rows, { ...EMPTY_FILTER_STATE, band: "action" });
  // only rows whose bandFromPriority key is "action" (HIGH) survive
  assert.ok(byBand.every((r) => r.priority === "HIGH"));
  const byQuery = filterRows(rows, { ...EMPTY_FILTER_STATE, query: "cbam" });
  assert.deepEqual(
    byQuery.map((r) => r.id),
    ["a", "c"],
  );
  const combined = filterRows(rows, { band: "action", mode: "ocean", region: "EU", query: "cbam" });
  assert.deepEqual(
    combined.map((r) => r.id),
    ["a"],
  );
});

test("filterRows with EMPTY_FILTER_STATE returns every row, unmodified order", () => {
  const rows = [res({ id: "a" }), res({ id: "b" })];
  assert.deepEqual(filterRows(rows, EMPTY_FILTER_STATE).map((r) => r.id), ["a", "b"]);
});

test("withListPosition appends the detail-return contract (list/pos/of) to a bare href", () => {
  assert.equal(withListPosition("/regulations/r1", "regulations", 4, 15), "/regulations/r1?list=regulations&pos=4&of=15");
});

test("withListPosition appends with & when the href already carries a query string", () => {
  assert.equal(withListPosition("/regulations/r1?foo=bar", "regulations", 1, 1), "/regulations/r1?foo=bar&list=regulations&pos=1&of=1");
});

test("withListPosition encodes a list name that needs it", () => {
  const href = withListPosition("/x", "a list/name", 1, 1);
  assert.ok(href.includes("list=a%20list%2Fname"));
});
