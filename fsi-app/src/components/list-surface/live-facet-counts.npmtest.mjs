// The invariant: a rendered count under a filter matches the filtered set.
//
// The production defect these would have caught (click-through audit 2026-09-08, /regulations):
// with the `road` mode applied the list narrowed to "showing 5 of 8" while the band tiles stayed
// 15 / 14 / 1,119 / 169 and the header stayed "1,317 regulations" — directly under the Filters
// card's own caption, "Counts are live for the current selection." Every facet builder was called
// with the unfiltered row set, and the band tiles preferred a corpus RPC bundle no client-side
// filter can move at all.
//
// Second invariant, same lane: a filtered view is linkable. Applying `road` left the URL at a bare
// /regulations while the band facet wrote `?band=`. One panel, two contracts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": APP } });
const {
  liveFacetCounts,
  isFilterActive,
  filterRows,
  filterFromSearchParams,
  searchParamsFromFilter,
  EMPTY_FILTER_STATE,
} = jiti("./list-surface-helpers.ts");

const row = (id, priority, modes, jurisdiction, topic, sourceTier) => ({
  id,
  title: `Item ${id}`,
  priority,
  modes,
  jurisdiction,
  topic,
  sourceTier,
  tags: [],
  added: "2026-01-01",
});

// 10 rows: 8 road, 2 rail; a spread of bands, jurisdictions, topics and tiers.
const ROWS = [
  row("a", "CRITICAL", ["road"], "eu", "emissions", 1),
  row("b", "CRITICAL", ["rail"], "eu", "emissions", 1),
  row("c", "HIGH", ["road"], "us", "reporting", 2),
  row("d", "MODERATE", ["road"], "eu", "emissions", 1),
  row("e", "MODERATE", ["road"], "us", "packaging", 2),
  row("f", "MODERATE", ["road"], "eu", "reporting", 1),
  row("g", "MODERATE", ["rail"], "us", "emissions", 2),
  row("h", "LOW", ["road"], "eu", "packaging", 1),
  row("i", "LOW", ["road"], "us", "emissions", 2),
  row("j", "LOW", ["road"], "eu", "reporting", 1),
];

// A corpus bundle far larger than the loaded rows, the shape of the live one.
const CORPUS = {
  byPriority: { CRITICAL: 15, HIGH: 14, MODERATE: 1119, LOW: 169 },
  byJurisdiction: { EU: 175, US: 19 },
  totalItems: 1317,
};

test("at rest the counts are the corpus figures, which is the honest whole-corpus number", () => {
  const counts = liveFacetCounts(ROWS, EMPTY_FILTER_STATE, CORPUS);
  assert.equal(counts.liveSelection, false);
  assert.equal(counts.total, 1317);
  const monitor = counts.band.find((b) => b.key === "monitor");
  assert.equal(monitor.count, 1119);
});

test("under a filter every count is the current selection's own tally", () => {
  const filter = { ...EMPTY_FILTER_STATE, mode: "road" };
  const counts = liveFacetCounts(ROWS, filter, CORPUS);
  const selected = filterRows(ROWS, filter);

  assert.equal(counts.liveSelection, true);
  assert.equal(counts.total, selected.length, "the header states the size of what is shown");
  assert.equal(counts.total, 8);

  // The exact regression: the tiles must no longer print the corpus bundle beside a list of 8.
  const byKey = Object.fromEntries(counts.band.map((b) => [b.key, b.count]));
  assert.deepEqual(byKey, { immediate: 1, action: 1, monitor: 3, awareness: 3 });
  assert.equal(
    byKey.immediate + byKey.action + byKey.monitor + byKey.awareness,
    selected.length,
    "the four band tiles sum to the filtered list"
  );
});

test("a facet group's own counts exclude its own selection, so its other options stay switchable", () => {
  const counts = liveFacetCounts(ROWS, { ...EMPTY_FILTER_STATE, mode: "road" }, CORPUS);
  const mode = Object.fromEntries(counts.mode.map((o) => [o.value, o.count]));
  assert.equal(mode.road, 8);
  assert.equal(mode.rail, 2, "rail still shows what switching to it would give, not 0");
});

test("a facet group's counts DO respect every other facet", () => {
  const counts = liveFacetCounts(ROWS, { ...EMPTY_FILTER_STATE, mode: "road", region: "eu" }, CORPUS);
  const mode = Object.fromEntries(counts.mode.map((o) => [o.value, o.count]));
  assert.equal(mode.road, 5, "road within the EU selection");
  assert.equal(mode.rail, 1, "rail within the EU selection");
  assert.equal(counts.total, filterRows(ROWS, { ...EMPTY_FILTER_STATE, mode: "road", region: "eu" }).length);
});

test("every facet type narrows, and the total follows every one of them", () => {
  for (const filter of [
    { ...EMPTY_FILTER_STATE, band: "monitor" },
    { ...EMPTY_FILTER_STATE, region: "us" },
    { ...EMPTY_FILTER_STATE, topic: "emissions" },
    { ...EMPTY_FILTER_STATE, tier: "1" },
    { ...EMPTY_FILTER_STATE, query: "Item a" },
  ]) {
    const counts = liveFacetCounts(ROWS, filter, CORPUS);
    assert.equal(counts.liveSelection, true, JSON.stringify(filter));
    assert.equal(counts.total, filterRows(ROWS, filter).length, JSON.stringify(filter));
    assert.notEqual(counts.total, CORPUS.totalItems, JSON.stringify(filter));
  }
});

test("an empty filter is not active; a whitespace query is not either", () => {
  assert.equal(isFilterActive(EMPTY_FILTER_STATE), false);
  assert.equal(isFilterActive({ ...EMPTY_FILTER_STATE, query: "   " }), false);
  assert.equal(isFilterActive({ ...EMPTY_FILTER_STATE, tier: "1" }), true);
});

test("every facet round-trips through the URL, not only the band", () => {
  const filter = { band: "immediate", mode: "road", region: "eu", topic: "emissions", tier: "1", query: "cbam" };
  const qs = searchParamsFromFilter(filter);
  assert.equal(qs, "band=immediate&mode=road&region=eu&topic=emissions&tier=1&q=cbam");
  assert.deepEqual(filterFromSearchParams(new URLSearchParams(qs)), filter);
});

test("an unfiltered view is a bare path, never a string of empty params", () => {
  assert.equal(searchParamsFromFilter(EMPTY_FILTER_STATE), "");
});

test("the mode facet alone writes a linkable URL, which is the defect", () => {
  const qs = searchParamsFromFilter({ ...EMPTY_FILTER_STATE, mode: "road" });
  assert.equal(qs, "mode=road");
  assert.equal(filterFromSearchParams(new URLSearchParams(qs)).mode, "road");
});

test("a band value outside the vocabulary is dropped, never trusted through", () => {
  const parsed = filterFromSearchParams(new URLSearchParams("band=urgent&mode=road"));
  assert.equal(parsed.band, null);
  assert.equal(parsed.mode, "road");
});

test("no params at all parses to the empty filter", () => {
  assert.deepEqual(filterFromSearchParams(null), EMPTY_FILTER_STATE);
  assert.deepEqual(filterFromSearchParams(new URLSearchParams("")), EMPTY_FILTER_STATE);
});
