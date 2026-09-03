// Run: node --test scripts/maintenance/seed-corridors.test.mjs — no DB, deps injected. The seed itself is
// proven in scripts/entities/seed-corridors.test.mjs; this tests the wrapper's orchestration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./seed-corridors.mjs";

function deps() {
  const inserted = [];
  const entities = [];
  return {
    inserted,
    readAll: async (table, cols, opts) => {
      if (table === "market_series") return [];
      if (table === "regional_data_facts") return [];
      if (table === "intelligence_items") return [];
      if (table === "entities") return entities;
      throw new Error(`unexpected table ${table}`);
    },
    guardedInsertMany: async (table, rows, opts) => {
      assert.equal(table, "entities");
      assert.ok(opts.cite, "every write carries a cite");
      inserted.push(...rows);
      entities.push(...rows);
      return { inserted: rows.length };
    },
  };
}

test("dry: with nothing in the corpus the ADR-024 fallback corridor is planned, nothing written", async () => {
  const d = deps();
  const s = await main({ mode: "dry" }, d);
  assert.equal(s.step, "seed-corridors");
  assert.equal(d.inserted.length, 0);
  assert.equal(s.counts.using_fallback, true);
  assert.ok(s.counts.would_create >= 1);
  assert.equal(s.applied, 0);
});

test("apply: inserts the planned corridor entities and reads back kind=corridor", async () => {
  const d = deps();
  const s = await main({ mode: "apply" }, d);
  assert.ok(d.inserted.length >= 1);
  assert.equal(s.applied, d.inserted.length);
  assert.equal(s.read_back.corridor_entities_total, d.inserted.length);
  assert.ok(d.inserted.every((e) => e.kind === "corridor"));
});
