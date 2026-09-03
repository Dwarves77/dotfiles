import { test } from "node:test";
import assert from "node:assert/strict";
import { main, evaluateCorridorReadiness, CITE } from "./reroute-producer.mjs";

test("evaluateCorridorReadiness: 0 corridors -> not ready, count-specific gap", () => {
  const r = evaluateCorridorReadiness([]);
  assert.equal(r.ready, false);
  assert.equal(r.count, 0);
  assert.match(r.gap, /only 0 corridor entities/);
});

test("evaluateCorridorReadiness: 1 corridor (today's live spine state) -> not ready, singular phrasing", () => {
  const r = evaluateCorridorReadiness([{ entity_id: "cl:corridor:abc", canonical_name: "CNSHA-NLRTM:ocean" }]);
  assert.equal(r.ready, false);
  assert.equal(r.count, 1);
  assert.match(r.gap, /only 1 corridor entity in/);
});

test("evaluateCorridorReadiness: 2+ corridors -> still not ready (no confirmed pairing), different gap text", () => {
  const r = evaluateCorridorReadiness([
    { entity_id: "cl:corridor:a", canonical_name: "CNSHA-NLRTM:ocean" },
    { entity_id: "cl:corridor:b", canonical_name: "CNSHA-NLRTM:ocean-cape" },
  ]);
  assert.equal(r.ready, false);
  assert.equal(r.count, 2);
  assert.match(r.gap, /no producer-confirmed reroute pairing/);
});

test("evaluateCorridorReadiness: non-array input treated as empty, never throws", () => {
  const r = evaluateCorridorReadiness(null);
  assert.equal(r.count, 0);
});

test("main: dry run reads corridor entities via deps.readAll and reports the live count", async () => {
  const deps = {
    readAll: async (table, cols, opts) => {
      assert.equal(table, "entities");
      return [{ entity_id: "cl:corridor:only-one", canonical_name: "CNSHA-NLRTM:ocean" }];
    },
  };
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.counts.corridor_entities_found, 1);
  assert.equal(s.counts.to_insert, 0);
  assert.match(s.gap, /only 1 corridor entity/);
});

test("main: with no deps.readAll, treats the corridor count as 0 rather than throwing", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.counts.corridor_entities_found, 0);
});

test("main: apply exercises the guarded path with an empty batch and a valid cite", async () => {
  let called = null;
  const deps = {
    readAll: async () => [],
    guardedInsertMany: async (table, rows, opts) => { called = { table, rows, opts }; return { inserted: 0 }; },
  };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 0);
  assert.equal(called.table, "reroute_events");
  assert.equal(called.opts.cite, CITE);
});
