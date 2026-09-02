// Run: node --test scripts/maintenance/source-type-backfill.test.mjs — no DB, deps injected.
// planBackfill / classifySourceType are proven in scripts/sources/backfill-source-type.test.mjs and
// src/lib/sources/source-type-taxonomy.test.mjs; this file tests the wrapper's orchestration only
// (dry writes nothing, apply writes through the injected guarded path and reads back).
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./source-type-backfill.mjs";

const ROWS = [
  { id: "s1", name: "US Environmental Protection Agency", url: "https://www.epa.gov", source_type: null },
  { id: "s2", name: "US Congress", url: "https://www.congress.gov", source_type: null },
  { id: "s3", name: "FreightWaves", url: "https://www.freightwaves.com", source_type: null }, // unclassifiable
  { id: "s4", name: "Already Tagged Co", url: "https://example.com/already", source_type: ["news"] },
];

function deps() {
  const updateCalls = [];
  const classified = new Map(ROWS.filter((r) => Array.isArray(r.source_type) && r.source_type.length).map((r) => [r.id, r.source_type]));
  return {
    updateCalls,
    readAll: async (table, cols, opts) => {
      assert.equal(table, "sources");
      // the read-back query filters NOT NULL; the plan query filters status=active — distinguish by a probe
      const probe = { filters: [] };
      const q = {
        eq: (c, v) => { probe.filters.push(["eq", c, v]); return q; },
        not: (c, op, v) => { probe.filters.push(["not", c, op, v]); return q; },
        is: (c, v) => { probe.filters.push(["is", c, v]); return q; },
      };
      opts?.match?.(q);
      if (probe.filters.some((f) => f[0] === "not")) {
        return [...classified.entries()].map(([id, source_type]) => ({ id, source_type }));
      }
      return ROWS;
    },
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      updateCalls.push({ table, ids, patch, cite: opts.cite, hasApplyMatch: typeof opts.applyMatch === "function" });
      for (const id of ids) classified.set(id, patch.source_type);
      return { updated: ids.length, chunks: 1, halvings: 0 };
    },
  };
}

test("dry: plans, writes nothing, reports counts", async () => {
  const d = deps();
  const s = await main({ mode: "dry" }, d);
  assert.equal(s.step, "source-type-backfill");
  assert.equal(s.mode, "dry");
  assert.equal(d.updateCalls.length, 0);
  assert.equal(s.counts.active, 4);
  assert.equal(s.counts.already_classified, 1);
  assert.equal(s.counts.to_write, 2);
  assert.equal(s.counts.unclassifiable, 1);
  assert.equal(s.applied, 0);
  assert.equal(s.exitCode, 0);
});

test("apply: writes each type-combination group through the guarded path with a cite and applyMatch, reads back", async () => {
  const d = deps();
  const s = await main({ mode: "apply" }, d);
  assert.ok(d.updateCalls.length >= 1);
  for (const c of d.updateCalls) {
    assert.equal(c.table, "sources");
    assert.ok(c.cite?.skill, "every write carries a cite");
    assert.ok(c.hasApplyMatch, "every write re-checks source_type IS NULL");
    assert.ok(Array.isArray(c.patch.source_type) && c.patch.source_type.length > 0);
  }
  assert.equal(s.applied, 2);
  assert.equal(s.read_back.source_type_not_null_total, 3); // 1 pre-classified + 2 written
  assert.equal(s.note, undefined);
});
