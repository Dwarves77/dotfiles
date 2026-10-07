// adopted-entities.test.mjs (lane G5-READ): an adopted standard mints kind instrument, an adopted material
// mints kind material, through entity-id.mjs; a proposed term mints nothing. Fixtures only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { entityId } from "../entities/entity-id.mjs";
import { groupAdoptedTerms } from "./adopted-terms.mjs";
import { ADOPTED_ENTITY_KINDS, planAdoptedTermEntities, mintAdoptedTermEntities } from "./adopted-entities.mjs";

const ROWS = [
  { kind: "standard", term_key: "iso 14084", label: "ISO 14084", status: "adopted" },
  { kind: "standard", term_key: "iso 99999", label: "ISO 99999", status: "proposed" },
  { kind: "material", term_key: "sodium-ion", label: "Sodium-ion", status: "adopted" },
  { kind: "scenario", term_key: "ocean-slow-steaming", label: "x", status: "adopted" },
];

test("kind rule: standard -> instrument, material -> material", () => {
  assert.deepEqual({ ...ADOPTED_ENTITY_KINDS }, { standard: "instrument", material: "material" });
});

test("plan: an adopted standard is an instrument entity with the SAME id a canonical_instrument_key mints", () => {
  const { entities, byTerm } = planAdoptedTermEntities(groupAdoptedTerms(ROWS));
  const std = entities.find((e) => e.kind === "instrument");
  assert.equal(std.entity_id, entityId("instrument", "ISO 14084"));
  assert.equal(std.canonical_name, "ISO 14084");
  assert.equal(byTerm.get("standard|iso 14084"), std.entity_id);
  const mat = entities.find((e) => e.kind === "material");
  assert.equal(mat.entity_id, entityId("material", "sodium-ion"));
  assert.match(mat.entity_id, /^cl:material:[0-9a-f]{16}$/);
});

test("plan: the same terms while PROPOSED mint nothing, and scenario terms never mint an entity", () => {
  const proposed = groupAdoptedTerms(ROWS.map((r) => ({ ...r, status: "proposed" })));
  assert.deepEqual(planAdoptedTermEntities(proposed).entities, []);
  assert.equal(planAdoptedTermEntities(groupAdoptedTerms(ROWS)).entities.length, 2);
});

test("plan: an entity already on the spine is not planned again", () => {
  const existing = new Set([entityId("instrument", "ISO 14084")]);
  const { entities } = planAdoptedTermEntities(groupAdoptedTerms(ROWS), existing);
  assert.deepEqual(entities.map((e) => e.kind), ["material"]);
});

function fakeSb({ existing = [] } = {}) {
  const log = { reads: [], upserts: [] };
  return {
    log,
    from(table) {
      assert.equal(table, "entities");
      return {
        select() { return this; },
        in(_c, ids) {
          log.reads.push(ids);
          return Promise.resolve({ data: existing.filter((id) => ids.includes(id)).map((entity_id) => ({ entity_id })), error: null });
        },
        upsert(rows, opts) { log.upserts.push({ rows, opts }); return Promise.resolve({ error: null }); },
      };
    },
  };
}

test("mint: writes only the missing rows, ignore-duplicates, and a second run writes nothing", async () => {
  const a = groupAdoptedTerms(ROWS);
  const sb = fakeSb();
  assert.deepEqual(await mintAdoptedTermEntities(sb, a), { planned: 2, minted: 2 });
  assert.equal(sb.log.upserts[0].opts.ignoreDuplicates, true);
  assert.equal(sb.log.upserts[0].opts.onConflict, "entity_id");
  const again = fakeSb({ existing: sb.log.upserts[0].rows.map((x) => x.entity_id) });
  assert.deepEqual(await mintAdoptedTermEntities(again, a), { planned: 0, minted: 0 });
  assert.equal(again.log.upserts.length, 0);
});

test("mint: dry plans and writes nothing; an empty adopted set makes no query; a write error is reported, not thrown", async () => {
  const a = groupAdoptedTerms(ROWS);
  const dry = fakeSb();
  assert.deepEqual(await mintAdoptedTermEntities(dry, a, { dry: true }), { planned: 2, minted: 0 });
  assert.equal(dry.log.upserts.length, 0);
  const none = fakeSb();
  assert.deepEqual(await mintAdoptedTermEntities(none, groupAdoptedTerms([])), { planned: 0, minted: 0 });
  assert.equal(none.log.reads.length, 0);
  const bad = {
    from: () => ({
      select() { return this; },
      in: () => Promise.resolve({ data: [], error: null }),
      upsert: () => Promise.resolve({ error: { message: "denied" } }),
    }),
  };
  const r = await mintAdoptedTermEntities(bad, a);
  assert.equal(r.minted, 0);
  assert.match(r.error, /denied/);
});
