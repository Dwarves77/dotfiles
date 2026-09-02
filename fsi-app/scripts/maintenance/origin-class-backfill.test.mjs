// Run: node --test scripts/maintenance/origin-class-backfill.test.mjs — no DB, deps injected.
// originClassFor itself is pinned cell-by-cell in lib/origin-class-map.test.mjs; this file tests the
// wrapper's own orchestration only (grouping, the R-E arg gate, chunked-write summation, read_back).
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, REQUIRED_ARG, CITE } from "./origin-class-backfill.mjs";

const ITEMS = [
  { id: "i1", item_type: "regulation", source_id: "s1", origin_class: null }, // s1 tier 1 -> official
  { id: "i2", item_type: "regulation", source_id: "s2", origin_class: null }, // s2 tier 6 -> null (no rule)
  { id: "i3", item_type: "research_finding", source_id: "s1", origin_class: null }, // tier 1 -> verified
  { id: "i4", item_type: "tool", source_id: null, origin_class: null }, // no source_id -> stays null
];
const SOURCES = [
  { id: "s1", tier: 1 },
  { id: "s2", tier: 6 },
];

function deps(overrides = {}) {
  const calls = [];
  const updateCalls = [];
  let itemsReadCount = 0;
  return {
    calls,
    updateCalls,
    readAll: async (table, cols, opts) => {
      calls.push(["readAll", table]);
      if (table === "intelligence_items") {
        itemsReadCount += 1;
        // First read = the null-candidates scan (always the fixture ITEMS); a second read only
        // happens post-apply for read_back, and only then does an injected itemsAfter apply.
        if (itemsReadCount > 1 && overrides.itemsAfter) return overrides.itemsAfter;
        return ITEMS;
      }
      throw new Error(`unexpected readAll table ${table}`);
    },
    readClient: () => ({}),
    fetchRowsIn: async () => SOURCES,
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      updateCalls.push({ table, ids, patch, cite: opts.cite });
      return { updated: ids.length };
    },
    ...overrides,
  };
}

test("dry: groups the null-origin_class candidates by resolved origin_class, writes nothing", async () => {
  const d = deps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "origin-class-backfill");
  assert.equal(r.applied, 0);
  assert.equal(r.counts.null_candidates, 4);
  assert.equal(r.counts.no_source_id_stays_null, 1); // i4
  assert.equal(r.counts.no_rule_stays_null, 1); // i2 (tier 6, no regulation rule)
  assert.equal(r.counts.would_classify, 2); // i1 -> official, i3 -> verified
  assert.deepEqual(r.counts.by_origin_class, { official: 1, verified: 1 });
  assert.equal(d.updateCalls.length, 0);
  assert.equal(r.exitCode, 0);
});

test("apply without R-E-accepted: refused, no write attempted", async () => {
  const d = deps();
  const r = await main({ mode: "apply", arg: "" }, d);
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
  assert.equal(d.updateCalls.length, 0);
});

test("apply with R-E-accepted: writes through guardedUpdateByIds per origin_class group, cited, read back", async () => {
  const d = deps({ itemsAfter: [{ id: "i1", origin_class: "official" }, { id: "i3", origin_class: "verified" }] });
  const r = await main({ mode: "apply", arg: REQUIRED_ARG }, d);
  assert.equal(r.applied, 2);
  assert.equal(d.updateCalls.length, 2); // one write per distinct origin_class group
  for (const c of d.updateCalls) assert.equal(c.cite, CITE);
  const targeted = d.updateCalls.flatMap((c) => c.ids);
  assert.deepEqual(new Set(targeted), new Set(["i1", "i3"]));
  assert.equal(r.exitCode, 0);
});

test("apply: passes an applyMatch re-check (still-NULL guard) into every guardedUpdateByIds call", async () => {
  const d = deps();
  const calls = [];
  d.guardedUpdateByIds = async (table, ids, patch, opts) => {
    calls.push(opts.applyMatch);
    return { updated: ids.length };
  };
  await main({ mode: "apply", arg: REQUIRED_ARG }, d);
  assert.equal(calls.length, 2);
  for (const applyMatch of calls) assert.equal(typeof applyMatch, "function");
});
