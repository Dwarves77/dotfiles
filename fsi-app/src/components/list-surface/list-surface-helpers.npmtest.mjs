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
const {
  modeFacetOptions,
  regionFacetOptions,
  topicFacetOptions,
  tierFacetOptions,
  bandFacetOptions,
  filterRows,
  withListPosition,
  sortResourceRows,
  EMPTY_FILTER_STATE,
  BAND_FACET_PARAM,
  bandFromSearchParam,
} = await jiti.import("./list-surface-helpers.ts");

function res(over = {}) {
  return { id: "r1", title: "A regulation", priority: "HIGH", jurisdiction: "EU", modes: ["ocean"], tags: [], added: "2026-01-01", ...over };
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

test("filterRows topic/tier compose with the pre-existing band/mode/region/query filters", () => {
  const rows = [
    res({ id: "a", topic: "ESG reporting", sourceTier: 1 }),
    res({ id: "b", topic: "ESG reporting", sourceTier: 2 }),
    res({ id: "c", topic: "Fuels", sourceTier: 1 }),
  ];
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTER_STATE, topic: "ESG reporting" }).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTER_STATE, tier: "1" }).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTER_STATE, topic: "ESG reporting", tier: "1" }).map((r) => r.id), ["a"]);
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

// FOLD-56 (F7): bounded prev/next neighbour slugs.
test("withListPosition appends prev/next when both neighbors are given", () => {
  const href = withListPosition("/regulations/r2", "regulations", 2, 3, { prev: "r1", next: "r3" });
  assert.equal(href, "/regulations/r2?list=regulations&pos=2&of=3&prev=r1&next=r3");
});

test("withListPosition omits prev when the row is first in the list (no prior neighbour)", () => {
  const href = withListPosition("/regulations/r1", "regulations", 1, 3, { prev: undefined, next: "r2" });
  assert.ok(!href.includes("prev="));
  assert.ok(href.includes("next=r2"));
});

test("withListPosition omits next when the row is last in the list (no following neighbour)", () => {
  const href = withListPosition("/regulations/r3", "regulations", 3, 3, { prev: "r2", next: undefined });
  assert.ok(!href.includes("next="));
  assert.ok(href.includes("prev=r2"));
});

test("withListPosition adds no query beyond list/pos/of/prev/next when neighbors is omitted entirely", () => {
  const href = withListPosition("/regulations/r1", "regulations", 1, 1);
  assert.equal(href, "/regulations/r1?list=regulations&pos=1&of=1");
});

test("withListPosition URL-encodes a neighbour slug that needs it", () => {
  const href = withListPosition("/x", "list", 1, 2, { next: "a/b" });
  assert.ok(href.includes("next=a%2Fb"));
});

// Audit item 1.1 (2026-09-07, operator ruling — CLOSED): the Dashboard's "All N immediate"
// control now navigates to /regulations with the Immediate band facet applied, via this SAME
// `?band=` contract (regulations/page.tsx reads it server-side and seeds RegulationsLedger's
// filter). BAND_FACET_PARAM/bandFromSearchParam are the one home for that contract, so a future
// list-surface caller (or another dashboard row) never invents a second query-param name.

test("BAND_FACET_PARAM is the literal 'band' query key", () => {
  assert.equal(BAND_FACET_PARAM, "band");
});

test("bandFromSearchParam accepts every real UrgencyBandKey value", () => {
  assert.equal(bandFromSearchParam("immediate"), "immediate");
  assert.equal(bandFromSearchParam("action"), "action");
  assert.equal(bandFromSearchParam("monitor"), "monitor");
  assert.equal(bandFromSearchParam("awareness"), "awareness");
});

test("bandFromSearchParam rejects anything outside the vocabulary (absent, misspelled, stale)", () => {
  assert.equal(bandFromSearchParam(null), null);
  assert.equal(bandFromSearchParam(undefined), null);
  assert.equal(bandFromSearchParam(""), null);
  assert.equal(bandFromSearchParam("IMMEDIATE"), null, "case-sensitive: only the real lower-case band keys are valid");
  assert.equal(bandFromSearchParam("critical"), null, "platform priority values are not band keys");
  assert.equal(bandFromSearchParam("not-a-band"), null);
});

// ListSurfaceSortRow's sort keys (artboards 02/04, id="p2"/"p4": "Sort Next date | Newest | A-Z").
test("sortResourceRows 'my-order' is the identity (no drag-reorder in this rebuild — never fabricated)", () => {
  const rows = [res({ id: "b", title: "B" }), res({ id: "a", title: "A" })];
  assert.deepEqual(sortResourceRows(rows, "my-order"), rows);
});

test("sortResourceRows 'az' sorts by title alphabetically", () => {
  const rows = [res({ id: "b", title: "Zebra" }), res({ id: "a", title: "Alpha" })];
  const sorted = sortResourceRows(rows, "az");
  assert.deepEqual(sorted.map((r) => r.id), ["a", "b"]);
});

test("sortResourceRows 'newest' sorts by 'added' descending", () => {
  const rows = [res({ id: "old", added: "2025-01-01" }), res({ id: "new", added: "2026-06-01" })];
  const sorted = sortResourceRows(rows, "newest");
  assert.deepEqual(sorted.map((r) => r.id), ["new", "old"]);
});

test("sortResourceRows 'next-date' sorts by soonest upcoming deadline, undated rows last", () => {
  const soon = res({ id: "soon", complianceDeadline: "2099-01-05" });
  const later = res({ id: "later", complianceDeadline: "2099-06-01" });
  const undated = res({ id: "undated" });
  const sorted = sortResourceRows([later, undated, soon], "next-date");
  assert.deepEqual(sorted.map((r) => r.id), ["soon", "later", "undated"]);
});

test("sortResourceRows does not mutate the input array", () => {
  const rows = [res({ id: "b", title: "B" }), res({ id: "a", title: "A" })];
  const original = rows.slice();
  sortResourceRows(rows, "az");
  assert.deepEqual(rows, original);
});

// Topic / Source-tier facets (artboard 02/id="p2" rail: MODE / JURISDICTION / TOPIC / SOURCE TIER).
test("topicFacetOptions counts distinct topics, sorted by count desc then alpha, blank topics excluded", () => {
  const rows = [res({ topic: "ESG reporting" }), res({ topic: "ESG reporting" }), res({ topic: "Fuels" }), res({ topic: "" }), res({})];
  const opts = topicFacetOptions(rows);
  assert.deepEqual(opts.map((o) => o.value), ["ESG reporting", "Fuels"]);
  assert.equal(opts[0].count, 2);
});

test("tierFacetOptions returns one row per distinct tier present, T1 first, rows with no tier excluded", () => {
  const rows = [res({ sourceTier: 3 }), res({ sourceTier: 1 }), res({ sourceTier: 1 }), res({ sourceTier: undefined })];
  const opts = tierFacetOptions(rows);
  assert.deepEqual(opts.map((o) => o.label), ["T1", "T3"]);
  assert.equal(opts[0].count, 2);
  assert.equal(opts[0].value, "1");
});
