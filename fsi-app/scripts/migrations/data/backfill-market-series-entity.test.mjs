// backfill-market-series-entity.test.mjs -- lane L4-E. Proves the data step against the REAL producer registry
// and the REAL series registry with injected row reads and an injected writer: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMappings, planEntityBackfill, runBackfill } from "./backfill-market-series-entity.mjs";
import { loadProducerRegistry } from "../../producers/registry/load-registry.mjs";
import { MARKET_SERIES_PRODUCERS } from "../../../src/lib/market/series-registry.mjs";
import { entityId } from "../../../src/lib/entities/entity-id.mjs";

const EU = entityId("jurisdiction", "EU");
const US = entityId("jurisdiction", "US");

const ROWS = [
  { id: "r1", series_key: "eu-oil-bulletin:automotive-diesel", entity_id: null },
  { id: "r2", series_key: "eu-oil-bulletin:heating-oil", entity_id: null },
  { id: "r3", series_key: "eu-oil-bulletin:automotive-diesel", entity_id: US }, // already set: never overwritten
  { id: "r4", series_key: "eia-v2:wti-spot", entity_id: null },
  { id: "r5", series_key: "ecb-fx:eur-usd", entity_id: null }, // no entity on the ecb-fx entry
  { id: "r6", series_key: "sbti:lead-time", entity_id: null },
  { id: "r7", series_key: "eu-oil-bulletin-lookalike:x", entity_id: null }, // prefix needs the colon
];

test("buildMappings: the real registries map the oil bulletin to eu-oil-bulletin:EU and the EIA producer to eia-v2:US, and nothing else", () => {
  const { mappings, unmapped } = buildMappings(loadProducerRegistry(), MARKET_SERIES_PRODUCERS);
  assert.deepEqual(unmapped, []);
  assert.deepEqual(mappings, [
    { entry: "eia-v2-petroleum-spot", prefix: "eia-v2", entity_id: US },
    { entry: "eu-weekly-oil-bulletin", prefix: "eu-oil-bulletin", entity_id: EU },
  ]);
});

test("buildMappings: an entry with an entity whose script no series-registry row names is reported, never guessed", () => {
  const entries = [{ name: "ghost", script: "scripts/producers/market/ghost.mjs", domain_table: "market_series", entity_id: EU }];
  const { mappings, unmapped } = buildMappings(entries, MARKET_SERIES_PRODUCERS);
  assert.deepEqual(mappings, []);
  assert.equal(unmapped.length, 1);
  assert.match(unmapped[0].reason, /0 series-registry rows name producerScript/);
});

test("buildMappings: an entry for another table is skipped", () => {
  const entries = [{ name: "other", script: "scripts/producers/regional/x.mjs", domain_table: "regional_data_facts", entity_id: EU }];
  assert.deepEqual(buildMappings(entries, MARKET_SERIES_PRODUCERS), { mappings: [], unmapped: [] });
});

test("planEntityBackfill: stamps only unset rows of a mapped namespace; counts every row; the colon is part of the prefix", () => {
  const { mappings } = buildMappings(loadProducerRegistry(), MARKET_SERIES_PRODUCERS);
  const { updates, counts, perEntry } = planEntityBackfill(ROWS, mappings);
  assert.deepEqual(updates.map((u) => [u.id, u.entity_id]), [["r1", EU], ["r2", EU], ["r4", US]]);
  assert.deepEqual(counts, { rows_read: 7, already_set: 1, no_mapping: 3, to_update: 3 });
  assert.deepEqual(perEntry, { "eia-v2-petroleum-spot": 1, "eu-weekly-oil-bulletin": 2 });
});

function harness(rows = ROWS) {
  const writes = [];
  const logs = [];
  return {
    writes, logs,
    deps: {
      readRows: async () => rows,
      updateIds: async (ids, entityId) => { writes.push({ ids, entityId }); return { updated: ids.length }; },
      log: (s) => logs.push(s),
    },
  };
}

test("runBackfill: dry by default writes nothing and reports the outbox events an apply would emit", async () => {
  const h = harness();
  const res = await runBackfill({}, h.deps);
  assert.equal(res.code, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(res.applied, 0);
  assert.equal(res.outbox_events_on_apply, 3);
  assert.ok(h.logs.some((l) => /DRY-RUN/.test(l)));
  assert.ok(h.logs.some((l) => /outbox_events_on_apply=3/.test(l)));
});

test("runBackfill --apply: one write per entity with its ids; counts read back; a second pass over the stamped rows writes nothing", async () => {
  const h = harness();
  const res = await runBackfill({ apply: true }, h.deps);
  assert.equal(res.applied, 3);
  assert.deepEqual(h.writes.map((w) => [w.entityId, w.ids]).sort(), [[EU, ["r1", "r2"]], [US, ["r4"]]].sort());
  const stamped = ROWS.map((r) => ({ ...r, entity_id: r.entity_id ?? h.writes.find((w) => w.ids.includes(r.id))?.entityId ?? null }));
  const h2 = harness(stamped);
  const again = await runBackfill({ apply: true }, h2.deps);
  assert.equal(again.applied, 0);
  assert.equal(h2.writes.length, 0, "idempotent: nothing left to stamp");
});

test("runBackfill: an unresolvable mapping stops the run before any read or write", async () => {
  const h = harness();
  let read = false;
  const res = await runBackfill({ apply: true }, {
    ...h.deps,
    readRows: async () => { read = true; return ROWS; },
    registry: [{ name: "ghost", script: "scripts/producers/market/ghost.mjs", domain_table: "market_series", entity_id: EU }],
  });
  assert.deepEqual([res.ok, res.code], [false, 1]);
  assert.equal(read, false);
  assert.equal(h.writes.length, 0);
});

test("the default writer never overwrites a set entity and writes through the guarded path (source scan)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./backfill-market-series-entity.mjs", import.meta.url), "utf8");
  assert.match(src, /guardedUpdateByIds\("market_series"/);
  assert.match(src, /applyMatch: \(qb\) => qb\.is\("entity_id", null\)/);
  assert.doesNotMatch(src, /\.from\("market_series"\)\s*\.(update|insert|upsert|delete)/);
});
