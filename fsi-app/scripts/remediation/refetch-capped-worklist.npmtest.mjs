// Run: node --test scripts/remediation/refetch-capped-worklist.npmtest.mjs -- no DB, no network (fake readAll).
// Lane OPS-1 (F-RED-1): the BUILD read must never select result_content (239 MB of stored text, statement
// timeout) and must prefilter server-side on result_chars ranges widened 1 percent, with classify() making the
// final placement from the same result_chars.
// *.npmtest.mjs because scripts/lib/db.mjs (imported by the module under test) is not on the no-npm import graph.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_RANGES, SERVER_RANGES, SERVER_OR_FILTER, WORKLIST_COLUMNS, classify, buildWorklist,
} from "./refetch-capped-worklist.mjs";

const OLD = "2026-06-01";
const NEW = "2026-07-15";
const row = (id, chars, searched_at = OLD, url = `https://x.example/${id}`) => ({
  id, intelligence_item_id: `item-${id}`, result_url: url, search_query: "q", searched_at, result_index: 0, result_chars: chars,
});

// Fake readAll: records the columns, and applies the `.or("and(result_chars.gte.A,result_chars.lte.B),...")` filter
// the way PostgREST would, so the test exercises the real filter string.
function fakeReadAll(table) {
  const seen = { columns: null, table: null };
  const fn = async (t, columns, { match } = {}) => {
    seen.table = t; seen.columns = columns;
    let orStr = null;
    match({ or(s) { orStr = s; return this; } });
    const ranges = [...orStr.matchAll(/gte\.(\d+),result_chars\.lte\.(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    return table.filter((r) => Number.isInteger(r.result_chars) && ranges.some(([lo, hi]) => r.result_chars >= lo && r.result_chars <= hi));
  };
  return { fn, seen };
}

test("the read never selects result_content and selects result_chars", async () => {
  const { fn, seen } = fakeReadAll([]);
  await buildWorklist(fn);
  assert.equal(seen.table, "agent_run_searches");
  assert.ok(!/result_content/.test(seen.columns), seen.columns);
  assert.ok(/result_chars/.test(seen.columns));
  assert.equal(seen.columns, WORKLIST_COLUMNS);
});

test("widened server bounds are exactly 1 percent each side (lower floored, upper ceiled)", () => {
  assert.deepEqual(SERVER_RANGES.legacy_40k, [39501, 40400]);
  assert.deepEqual(SERVER_RANGES.corroborator_60k, [59301, 60600]);
  assert.deepEqual(SERVER_RANGES.primary_600k, [594000, 606000]);
  assert.equal(SERVER_OR_FILTER.split(",and(").length, 3);
});

test("a fixture row at EACH class boundary passes the server filter and classify() places it", async () => {
  const cases = [
    [39900, OLD, "legacy_40k"], [40000, OLD, "legacy_40k"],
    [59900, OLD, "corroborator_60k"], [59999, OLD, "corroborator_60k"], [60000, OLD, "corroborator_60k"],
    [600000, OLD, "primary_600k"],
    [60000, NEW, "corroborator_60k"], // 40k class is date gated; 60k is not
  ];
  const table = cases.map(([c, d], i) => row(`b${i}`, c, d));
  const { fn } = fakeReadAll(table);
  const { pops } = await buildWorklist(fn);
  for (const [i, [c, , want]] of cases.entries()) {
    assert.equal(classify(table[i]), want, `chars ${c}`);
    assert.ok(pops[want].some((r) => r.id === `b${i}`), `chars ${c} reached ${want}`);
  }
});

test("rows just outside the exact range but inside the widened range reach classify() and are placed by it (null)", async () => {
  const table = [row("o1", 39899), row("o2", 40001), row("o3", 59899), row("o4", 600001), row("o5", 599999)];
  const { fn } = fakeReadAll(table);
  const { pops, rawCounts } = await buildWorklist(fn);
  for (const r of table) assert.equal(classify(r), null);
  assert.deepEqual(rawCounts, { legacy_40k: 0, corroborator_60k: 0, primary_600k: 0 });
  assert.equal(pops.legacy_40k.length + pops.corroborator_60k.length + pops.primary_600k.length, 0);
});

test("rows beyond the widened bounds are excluded server side; null result_chars never matches", async () => {
  const table = [row("x1", 39500), row("x2", 40401), row("x3", 59300), row("x4", 60601), row("x5", 593999), row("x6", 606001), row("x7", null), row("x8", 0)];
  const { fn } = fakeReadAll(table);
  const got = await fn("agent_run_searches", WORKLIST_COLUMNS, { match: (q) => q.or(SERVER_OR_FILTER) });
  assert.deepEqual(got, []);
  assert.equal(classify(row("n", null)), null);
});

test("dedup on (item_id, result_url) and old_length comes from result_chars", async () => {
  const a = row("d1", 600000, OLD, "https://same.example/doc");
  const b = { ...row("d2", 600000, OLD, "https://same.example/doc"), intelligence_item_id: a.intelligence_item_id };
  const { fn } = fakeReadAll([a, b]);
  const { pops, rawCounts } = await buildWorklist(fn);
  assert.equal(rawCounts.primary_600k, 2);
  assert.equal(pops.primary_600k.length, 1);
  assert.equal(pops.primary_600k[0].old_length, 600000);
  assert.deepEqual(CLASS_RANGES.primary_600k, [600000, 600000]);
});
