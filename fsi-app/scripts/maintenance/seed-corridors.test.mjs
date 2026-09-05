// Run: node --test scripts/maintenance/seed-corridors.test.mjs — no DB, deps injected. The seed itself is
// proven in scripts/entities/seed-corridors.test.mjs, the entity_scope writer in
// scripts/entities/write-entity-scope.test.mjs; this tests the wrapper's orchestration of both in one run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./seed-corridors.mjs";

function deps({ preExistingCorridors = [] } = {}) {
  const insertedByTable = { entities: [], entity_identifiers: [], entity_scope: [] };
  const entities = [...preExistingCorridors];
  return {
    insertedByTable,
    readAll: async (table, cols, opts) => {
      if (table === "market_series") return [];
      if (table === "regional_data_facts") return [];
      if (table === "intelligence_items") return [];
      if (table === "entity_identifiers") return insertedByTable.entity_identifiers;
      if (table === "entity_scope") return insertedByTable.entity_scope;
      if (table === "entities") {
        const probe = { eq: (col, val) => { probe._kind = val; return probe; } };
        if (opts?.match) opts.match(probe);
        return probe._kind === "jurisdiction" ? entities.filter((e) => e.kind === "jurisdiction") : entities.filter((e) => e.kind === "corridor");
      }
      throw new Error(`unexpected table ${table}`);
    },
    guardedInsertMany: async (table, rows, opts) => {
      assert.ok(opts.cite, "every write carries a cite");
      insertedByTable[table].push(...rows);
      if (table === "entities") entities.push(...rows);
      return { inserted: rows.length };
    },
  };
}

test("dry: with nothing in the corpus the fallback corridors are planned, nothing written (nothing exists yet for entity_scope to preview against)", async () => {
  const d = deps();
  const s = await main({ mode: "dry" }, d);
  assert.equal(s.step, "seed-corridors");
  assert.equal(d.insertedByTable.entities.length, 0);
  assert.equal(s.counts.using_fallback, true);
  assert.ok(s.counts.would_create >= 2, "at least two corridors beyond the one worked example");
  assert.equal(s.applied, 0);
  // A dry run never writes, so seed-corridors' OWN candidates are not yet live corridor rows for the
  // entity_scope writer to read — this is honest, not a gap: scope always previews against LIVE
  // corridors (see the next test, which seeds one, matching today's true live state of 1 pre-existing
  // corridor).
  assert.equal(s.counts.entity_scope.corridors_read, 0);
  assert.equal(s.counts.entity_scope.scope_rows_written, 0);
});

test("dry: a PRE-EXISTING live corridor (today's true live state) gets its entity_scope previewed even though seed-corridors itself writes nothing", async () => {
  const d = deps({ preExistingCorridors: [{ entity_id: "cl:corridor:preexisting", kind: "corridor", canonical_name: "CNSHA-NLRTM:ocean" }] });
  const s = await main({ mode: "dry" }, d);
  assert.equal(s.applied, 0);
  assert.equal(s.counts.entity_scope.corridors_read, 1);
  assert.ok(s.counts.entity_scope.scope_rows_planned > 0, "a dry run previews entity_scope rows for corridors that already exist");
  assert.equal(s.counts.entity_scope.scope_rows_written, 0);
});

test("apply: inserts the planned corridor entities, reads back kind=corridor, and writes entity_scope (plus its jurisdiction entities) in the same run", async () => {
  const d = deps();
  const s = await main({ mode: "apply" }, d);
  const corridorsInserted = d.insertedByTable.entities.filter((e) => e.kind === "corridor");
  const jurisdictionsInserted = d.insertedByTable.entities.filter((e) => e.kind === "jurisdiction");
  assert.ok(corridorsInserted.length >= 2);
  assert.equal(s.applied, corridorsInserted.length);
  assert.equal(s.read_back.corridor_entities_total, corridorsInserted.length);
  assert.ok(jurisdictionsInserted.length > 0, "the entity_scope writer mints the jurisdiction entities corridors are scoped to");
  assert.ok(d.insertedByTable.entity_scope.length > 0, "entity_scope rows are written in the same maintenance-step run");
  assert.equal(s.read_back.entity_scope_rows_written, d.insertedByTable.entity_scope.length);
});
