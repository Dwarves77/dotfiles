// link-item-entities.test.mjs — proves linkItemEntities() (rule 16(e), lane W9 part 1, task 1.1,
// 2026-09-11): the one reusable writer mint-item.ts and apply-staged-update.ts both call at write time,
// sharing entity-plan.mjs's four pure planners with the corpus backfill (scripts/entities/
// backfill-entities.mjs). Injected fake Supabase client (src/test-support/fake-supabase.mjs) — see that
// module's header for the chain shapes it emulates and why.
import test from "node:test";
import assert from "node:assert/strict";
import { linkItemEntities } from "./link-item-entities.mjs";
import { fakeSupabase } from "../../test-support/fake-supabase.mjs";

test("mint of a DE regulation with a CELEX key writes 1 jurisdiction ref and links the instrument entity", async () => {
  const sb = fakeSupabase({ entities: [{ entity_id: "cl:jurisdiction:DE", kind: "jurisdiction" }], entity_refs: [], entity_identifiers: [] });
  const r = await linkItemEntities(sb, { id: "11111111-1111-4111-8111-111111111111", jurisdiction_iso: ["DE"], canonical_instrument_key: "32024R1610" });
  assert.equal(r.refs, 1);
  assert.equal(sb.tables.entity_refs.length, 1);
  assert.equal(sb.tables.entity_refs[0].ref_table, "intelligence_items");
  assert.match(r.instrumentEntityId, /^cl:instrument:/);
  assert.equal(sb.updates.intelligence_items[0].instrument_entity_id, r.instrumentEntityId);
});

test("re-running on the same item writes nothing (idempotent)", async () => {
  const sb = fakeSupabase({ entities: [], entity_refs: [], entity_identifiers: [] });
  const item = { id: "22222222-2222-4222-8222-222222222222", jurisdiction_iso: ["DE"], canonical_instrument_key: "32024R1610" };
  const first = await linkItemEntities(sb, item);
  assert.equal(first.refs, 1);
  assert.equal(sb.tables.entity_refs.length, 1);

  const second = await linkItemEntities(sb, item);
  assert.equal(second.refs, 0, "no NEW ref on a second pass over the same item");
  assert.equal(sb.tables.entity_refs.length, 1, "row count must not grow on a second pass");
  assert.equal(second.instrumentEntityId, first.instrumentEntityId, "the instrument link is recomputed the same way, not lost");
});

test("an item with no jurisdiction and no instrument key writes nothing", async () => {
  const sb = fakeSupabase({ entities: [], entity_refs: [], entity_identifiers: [] });
  const r = await linkItemEntities(sb, { id: "33333333-3333-4333-8333-333333333333", jurisdiction_iso: [], canonical_instrument_key: null });
  assert.equal(r.refs, 0);
  assert.equal(r.instrumentEntityId, null);
  assert.equal(sb.tables.entity_refs.length, 0);
  assert.equal(sb.tables.entities.length, 0);
  assert.equal(sb.updates.intelligence_items, undefined, "no FK update when there is no instrument key");
});

test("multiple jurisdiction codes on one item each get their own ref row", async () => {
  const sb = fakeSupabase({ entities: [], entity_refs: [], entity_identifiers: [] });
  const r = await linkItemEntities(sb, { id: "44444444-4444-4444-8444-444444444444", jurisdiction_iso: ["DE", "FR"], canonical_instrument_key: null });
  assert.equal(r.refs, 2);
  assert.equal(sb.tables.entity_refs.length, 2);
  assert.deepEqual(new Set(sb.tables.entity_refs.map((row) => row.role)), new Set(["jurisdiction"]));
});
