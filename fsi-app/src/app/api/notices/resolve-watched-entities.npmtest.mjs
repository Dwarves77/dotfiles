// Test for resolve-watched-entities.ts's groupWatchedItemIds and resolveWatchedEntityIds. Plain
// node --test (jiti, same pattern route.npmtest.mjs already uses for this directory's other .ts helper)
// — no supabase-js, no next/*, a hand-rolled fake client (same posture as drain.test.mjs /
// superseded-notices.test.mjs in src/lib/propagation/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { groupWatchedItemIds, resolveWatchedEntityIds } = await jiti.import("./resolve-watched-entities.ts");

test("groupWatchedItemIds: reg/signal/research/operations resolve through intelligence_items, source through sources", () => {
  const watched = [
    { item_type: "reg", item_id: "item-1" },
    { item_type: "signal", item_id: "item-2" },
    { item_type: "research", item_id: "item-3" },
    { item_type: "operations", item_id: "item-4" },
    { item_type: "source", item_id: "source-1" },
  ];
  const { intelligenceItemIds, sourceIds } = groupWatchedItemIds(watched);
  assert.deepEqual([...intelligenceItemIds].sort(), ["item-1", "item-2", "item-3", "item-4"]);
  assert.deepEqual(sourceIds, ["source-1"]);
});

test("groupWatchedItemIds: market_series contributes to neither set (no entity FK exists on that table)", () => {
  const { intelligenceItemIds, sourceIds } = groupWatchedItemIds([{ item_type: "market_series", item_id: "ms-1" }]);
  assert.deepEqual(intelligenceItemIds, []);
  assert.deepEqual(sourceIds, []);
});

test("groupWatchedItemIds: dedupes the same id watched under two item_types", () => {
  const { intelligenceItemIds } = groupWatchedItemIds([
    { item_type: "reg", item_id: "item-1" },
    { item_type: "signal", item_id: "item-1" },
  ]);
  assert.deepEqual(intelligenceItemIds, ["item-1"]);
});

test("groupWatchedItemIds: an empty or missing item_id is skipped, never queried as ''", () => {
  const { intelligenceItemIds, sourceIds } = groupWatchedItemIds([
    { item_type: "reg", item_id: "" },
    { item_type: "source", item_id: undefined },
  ]);
  assert.deepEqual(intelligenceItemIds, []);
  assert.deepEqual(sourceIds, []);
});

test("groupWatchedItemIds: an empty array yields empty sets, no throw", () => {
  const { intelligenceItemIds, sourceIds } = groupWatchedItemIds([]);
  assert.deepEqual(intelligenceItemIds, []);
  assert.deepEqual(sourceIds, []);
});

/** A minimal fake client: table -> array of rows, matching the shape a real supabase-js response has
 *  after .select().eq()...in() resolves. Records every call so a test can assert the exact filters used. */
function fakeClient(tables, { calls = [] } = {}) {
  return {
    calls,
    from(table) {
      const filters = { table, eq: [], in: [] };
      const builder = {
        select() {
          return builder;
        },
        eq(col, value) {
          filters.eq.push([col, value]);
          return builder;
        },
        in(col, values) {
          filters.in.push([col, values]);
          return builder;
        },
        then(onfulfilled) {
          calls.push(filters);
          const rows = tables[table] ?? [];
          return Promise.resolve(onfulfilled({ data: rows, error: null }));
        },
      };
      return builder;
    },
  };
}

test("resolveWatchedEntityIds: resolves an intelligence_item's instrument_entity_id", async () => {
  const client = fakeClient({
    intelligence_items: [{ id: "item-1", instrument_entity_id: "cl:instrument:abc" }],
    entity_refs: [],
    sources: [],
  });
  const ids = await resolveWatchedEntityIds(client, [{ item_type: "signal", item_id: "item-1" }]);
  assert.deepEqual(ids, ["cl:instrument:abc"]);
});

test("resolveWatchedEntityIds: resolves entity_refs jurisdiction rows for an intelligence_item, filtered to ref_table='intelligence_items'", async () => {
  const client = fakeClient({
    intelligence_items: [{ id: "item-1", instrument_entity_id: null }],
    entity_refs: [
      { entity_id: "cl:jurisdiction:nl" },
      { entity_id: "cl:jurisdiction:be" },
    ],
    sources: [],
  });
  const ids = await resolveWatchedEntityIds(client, [{ item_type: "reg", item_id: "item-1" }]);
  assert.deepEqual([...ids].sort(), ["cl:jurisdiction:be", "cl:jurisdiction:nl"]);
  const refsCall = client.calls.find((c) => c.table === "entity_refs");
  assert.deepEqual(refsCall.eq, [["ref_table", "intelligence_items"]]);
  assert.deepEqual(refsCall.in, [["ref_id", ["item-1"]]]);
});

test("resolveWatchedEntityIds: resolves a source's organisation_entity_id", async () => {
  const client = fakeClient({
    intelligence_items: [],
    entity_refs: [],
    sources: [{ id: "source-1", organisation_entity_id: "cl:organisation:maersk" }],
  });
  const ids = await resolveWatchedEntityIds(client, [{ item_type: "source", item_id: "source-1" }]);
  assert.deepEqual(ids, ["cl:organisation:maersk"]);
});

test("resolveWatchedEntityIds: dedupes an entity reached via both instrument_entity_id and entity_refs", async () => {
  const client = fakeClient({
    intelligence_items: [{ id: "item-1", instrument_entity_id: "cl:instrument:shared" }],
    entity_refs: [{ entity_id: "cl:instrument:shared" }],
    sources: [],
  });
  const ids = await resolveWatchedEntityIds(client, [{ item_type: "signal", item_id: "item-1" }]);
  assert.deepEqual(ids, ["cl:instrument:shared"]);
});

test("resolveWatchedEntityIds: a market_series watch never queries intelligence_items or sources, resolves to nothing", async () => {
  const client = fakeClient({ intelligence_items: [], entity_refs: [], sources: [] });
  const ids = await resolveWatchedEntityIds(client, [{ item_type: "market_series", item_id: "ms-1" }]);
  assert.deepEqual(ids, []);
  assert.equal(client.calls.length, 0);
});

test("resolveWatchedEntityIds: an empty watchlist makes zero queries and resolves to []", async () => {
  const client = fakeClient({});
  const ids = await resolveWatchedEntityIds(client, []);
  assert.deepEqual(ids, []);
  assert.equal(client.calls.length, 0);
});

test("resolveWatchedEntityIds: a query error on one path degrades to fewer ids, never throws", async () => {
  const client = {
    from(table) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        then(onfulfilled) {
          if (table === "sources") return Promise.resolve(onfulfilled({ data: null, error: { message: "boom" } }));
          return Promise.resolve(onfulfilled({ data: [], error: null }));
        },
      };
      return builder;
    },
  };
  const ids = await resolveWatchedEntityIds(client, [{ item_type: "source", item_id: "source-1" }]);
  assert.deepEqual(ids, []);
});
