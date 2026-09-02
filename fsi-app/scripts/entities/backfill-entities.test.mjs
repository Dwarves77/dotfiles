// Unit tests for backfill-entities.mjs — the pure planners directly, plus a stateful fake-db harness
// (modeled on scripts/lib/db.test.mjs's makeClient(), extended with persistent per-table storage and
// eq/in/not-is filtering) exercising the orchestration functions end-to-end through the SAME guarded
// write path (guardedInsertMany/guardedUpdate) production code uses. Run:
//   node --test fsi-app/scripts/entities/backfill-entities.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.DISCIPLINE_SNAP_DIR = join(tmpdir(), "backfill-entities-test-snapshots"); // redirect prior-value snapshots
const { __setWriteClientForTest } = await import("../lib/db.mjs");
const {
  distinctNormalized,
  planJurisdictionEntities,
  planJurisdictionRefs,
  planInstrumentEntities,
  planInstrumentFkUpdates,
  planOrganisationEntities,
  planOrganisationFkUpdates,
  existingEntityIdSet,
  existingIdentifierKeySet,
  existingRefKeySet,
  runJurisdiction,
  runInstrument,
  runOrganisation,
} = await import("./backfill-entities.mjs");
const { entityId } = await import("../../src/lib/entities/entity-id.mjs");

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Pure planners — no DB.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test("distinctNormalized: dedupes, trims, uppercases, sorts, drops blanks", () => {
  assert.deepEqual(distinctNormalized(["us", " US ", "de", "", null, undefined, "de"]), ["DE", "US"]);
});

test("planJurisdictionEntities: one entity per distinct code; ISO3166_1/_2-shaped codes get a crosswalk row; a free-text supranational code gets no crosswalk row", () => {
  const { entities, identifiers, byCode } = planJurisdictionEntities(["US", "DE-BY", "GLOBAL"]);
  assert.equal(entities.length, 3);
  assert.equal(identifiers.length, 2); // GLOBAL has no scheme match
  const usId = byCode.get("US");
  assert.equal(usId, entityId("jurisdiction", "US"));
  const usIdentifier = identifiers.find((i) => i.value === "US");
  assert.equal(usIdentifier.scheme, "ISO3166_1");
  const subdiv = identifiers.find((i) => i.value === "DE-BY");
  assert.equal(subdiv.scheme, "ISO3166_2");
  assert.ok(!identifiers.some((i) => i.value === "GLOBAL"));
});

test("planJurisdictionEntities: idempotent — a code whose entity/identifier already exists produces neither on a second pass", () => {
  const first = planJurisdictionEntities(["US", "FR"]);
  const existingEntityIds = new Set(first.entities.map((e) => e.entity_id));
  const existingIdentifierKeys = new Set(first.identifiers.map((i) => `${i.entity_id}|${i.scheme}|${i.value}`));
  const second = planJurisdictionEntities(["US", "FR"], existingEntityIds, existingIdentifierKeys);
  assert.equal(second.entities.length, 0);
  assert.equal(second.identifiers.length, 0);
  // byCode is still populated for downstream ref planning even when nothing new is created
  assert.equal(second.byCode.get("US"), entityId("jurisdiction", "US"));
});

test("planJurisdictionRefs: one ref row per (row, code) occurrence; the same code twice in one row's array does not duplicate", () => {
  const { byCode } = planJurisdictionEntities(["US", "DE"]);
  const rows = [
    { id: "i1", jurisdiction_iso: ["US", "DE", "US"] }, // dup within one row
    { id: "i2", jurisdiction_iso: ["US"] },
  ];
  const refs = planJurisdictionRefs("intelligence_items", rows, byCode);
  assert.equal(refs.length, 3); // i1:US, i1:DE, i2:US — not 4
  assert.ok(refs.every((r) => r.role === "jurisdiction" && r.ref_table === "intelligence_items"));
});

test("planJurisdictionRefs: skips a (table,row,entity,role) key already present in existingRefKeys", () => {
  const { byCode } = planJurisdictionEntities(["US"]);
  const rows = [{ id: "i1", jurisdiction_iso: ["US"] }];
  const key = `intelligence_items|i1|${byCode.get("US")}|jurisdiction`;
  const refs = planJurisdictionRefs("intelligence_items", rows, byCode, new Set([key]));
  assert.equal(refs.length, 0);
});

test("planJurisdictionRefs: reads iso_codes when jurisdiction_iso is absent (the regions row shape)", () => {
  const { byCode } = planJurisdictionEntities(["FR"]);
  const refs = planJurisdictionRefs("regions", [{ id: "r1", iso_codes: ["FR"] }], byCode);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].ref_table, "regions");
});

test("planInstrumentEntities: one entity per distinct canonical_instrument_key; CELEX-shaped keys get a crosswalk row", () => {
  const { entities, identifiers, byKey } = planInstrumentEntities(["32019R1242", "22008A0221(01)"]);
  assert.equal(entities.length, 2);
  assert.equal(identifiers.length, 2);
  assert.ok(identifiers.every((i) => i.scheme === "CELEX"));
  assert.equal(byKey.get("32019R1242"), entityId("instrument", "32019R1242"));
});

test("planInstrumentFkUpdates: only items with a matched key AND missing instrument_entity_id get an update", () => {
  const { byKey } = planInstrumentEntities(["32019R1242"]);
  const updates = planInstrumentFkUpdates(
    [{ id: "a", canonical_instrument_key: "32019R1242" }, { id: "b", canonical_instrument_key: "NOT-IN-BYKEY" }],
    byKey,
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "a");
  assert.equal(updates[0].instrument_entity_id, byKey.get("32019R1242"));
});

test("planOrganisationEntities: full URL and bare host mint the SAME entity (one organisation per registrable host), one HOST identifier each", () => {
  const { entities, identifiers, byHost } = planOrganisationEntities([
    "https://eur-lex.europa.eu/eli/reg/2024/1257/oj",
    "https://www.eur-lex.europa.eu/other-page",
    "https://sec.gov/rules",
  ]);
  assert.equal(entities.length, 2); // eur-lex.europa.eu + sec.gov, www. reduced away
  assert.equal(identifiers.length, 2);
  assert.equal(byHost.get("eur-lex.europa.eu"), entityId("organisation", "eur-lex.europa.eu"));
});

test("planOrganisationFkUpdates: only sources whose host resolves AND are missing organisation_entity_id get an update", () => {
  const { byHost } = planOrganisationEntities(["https://sec.gov/a"]);
  const updates = planOrganisationFkUpdates(
    [{ id: "s1", url: "https://sec.gov/b" }, { id: "s2", url: "not a url" }],
    byHost,
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "s1");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Stateful fake-db harness — persistent per-table rows, eq/in/not-is filtering, range pagination.
// Extends scripts/lib/db.test.mjs's makeClient() chain shape so guardedInsertMany/guardedUpdate/readAll
// (unmodified production code from db.mjs) run against it unchanged.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function matchOps(row, ops) {
  for (const op of ops) {
    if (op[0] === "eq" && row[op[1]] !== op[2]) return false;
    if (op[0] === "in" && !op[2].includes(row[op[1]])) return false;
    if (op[0] === "not" && op[2] === "is" && op[3] === null) {
      if (row[op[1]] === null || row[op[1]] === undefined) return false; // NOT(col IS NULL)
    }
  }
  return true;
}

function makeStatefulClient(tables, calls) {
  function from(table) {
    tables[table] = tables[table] || [];
    const state = { table, verb: "select", ops: [] };
    const settle = () => {
      calls.push({ table: state.table, verb: state.verb, ops: state.ops.slice() });
      const filterOps = state.ops.filter((o) => ["eq", "in", "not"].includes(o[0]));
      if (state.verb === "insert") {
        const raw = state.ops.find((o) => o[0] === "insert")[1];
        const arr = Array.isArray(raw) ? raw : [raw];
        tables[table].push(...arr);
        return Promise.resolve({ data: arr, error: null });
      }
      if (state.verb === "update") {
        const patch = state.ops.find((o) => o[0] === "update")[1];
        const matched = tables[table].filter((r) => matchOps(r, filterOps));
        matched.forEach((r) => Object.assign(r, patch));
        return Promise.resolve({ data: matched, error: null });
      }
      let rows = tables[table].filter((r) => matchOps(r, filterOps));
      const rangeOp = state.ops.find((o) => o[0] === "range");
      if (rangeOp) rows = rows.slice(rangeOp[1], rangeOp[2] + 1);
      return Promise.resolve({ data: rows, error: null });
    };
    const b = {
      select(c) { if (!["insert", "update", "delete"].includes(state.verb)) state.verb = "select"; state.ops.push(["select", c]); return b; },
      insert(r) { state.verb = "insert"; state.ops.push(["insert", r]); return b; },
      update(p) { state.verb = "update"; state.ops.push(["update", p]); return b; },
      eq(c, v) { state.ops.push(["eq", c, v]); return b; },
      in(c, v) { state.ops.push(["in", c, v]); return b; },
      not(c, op, v) { state.ops.push(["not", c, op, v]); return b; },
      order(c) { state.ops.push(["order", c]); return b; },
      // NOTE: range()/limit() are QUERY MODIFIERS, not terminal calls — real supabase-js keeps the
      // builder chainable after them (db.mjs's readAll calls `.range(...)` THEN conditionally
      // `match(q)` which chains `.not(...)` before the eventual await). Settling here (as a naive
      // mock might) would break that order, so only `.then()`/`.single()` (an actual await) settle.
      range(a, z) { state.ops.push(["range", a, z]); return b; },
      limit(n) { state.ops.push(["limit", n]); return b; },
      single() { return settle().then((r) => ({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error })); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return b;
  }
  return { from };
}

function seedTables() {
  return {
    intelligence_items: [
      { id: "i1", jurisdiction_iso: ["US", "DE"], canonical_instrument_key: "32019R1242", instrument_entity_id: null },
      { id: "i2", jurisdiction_iso: ["US"], canonical_instrument_key: null, instrument_entity_id: null },
    ],
    regions: [{ id: "r1", iso_codes: ["FR"] }],
    sources: [{ id: "s1", url: "https://sec.gov/rules", organisation_entity_id: null }],
    entities: [],
    entity_identifiers: [],
    entity_refs: [],
  };
}

const cite = { skill: "remediation-discipline", reason: "test" };

test("runJurisdiction: dry mode reports counts and writes NOTHING", async () => {
  const tables = seedTables();
  const calls = [];
  __setWriteClientForTest(() => makeStatefulClient(tables, calls));
  const result = await runJurisdiction({ apply: false, limit: null }, new Set(), new Set());
  assert.equal(result.created, 3); // US, DE, FR
  assert.equal(result.refs, 4); // i1:US, i1:DE, i2:US (items) + r1:FR (regions)
  assert.equal(tables.entities.length, 0, "dry mode must not write");
  assert.equal(tables.entity_refs.length, 0, "dry mode must not write");
});

test("runJurisdiction: apply mode writes entities/identifiers/refs through the guarded path (cite present), then a second apply is a no-op", async () => {
  const tables = seedTables();
  const calls = [];
  __setWriteClientForTest(() => makeStatefulClient(tables, calls));

  const existingEntityIds = await existingEntityIdSet();
  const existingIdentifierKeys = await existingIdentifierKeySet();
  const r1 = await runJurisdiction({ apply: true, limit: null }, existingEntityIds, existingIdentifierKeys);
  assert.equal(r1.created, 3);
  assert.equal(tables.entities.length, 3, "US, DE, FR entities must be written");
  assert.ok(tables.entities.every((e) => e.kind === "jurisdiction"));
  assert.equal(tables.entity_identifiers.length, 3, "all three are ISO3166_1-shaped");
  assert.equal(tables.entity_refs.length, 4);
  const insertCalls = calls.filter((c) => c.verb === "insert");
  assert.ok(insertCalls.length >= 3, "entities + identifiers + refs each insert");

  // second pass, fresh existing-state reads (as main() does) — must create/add nothing new
  const existingEntityIds2 = await existingEntityIdSet();
  const existingIdentifierKeys2 = await existingIdentifierKeySet();
  const r2 = await runJurisdiction({ apply: true, limit: null }, existingEntityIds2, existingIdentifierKeys2);
  assert.equal(r2.created, 0, "idempotent: no new entities on a second apply");
  assert.equal(r2.identifiers, 0, "idempotent: no new identifiers on a second apply");
  assert.equal(r2.refs, 0, "idempotent: no new refs on a second apply");
  assert.equal(tables.entities.length, 3, "row count must not grow on a second apply");
  assert.equal(tables.entity_refs.length, 4, "row count must not grow on a second apply");
});

test("runInstrument: apply mode creates one instrument entity + CELEX identifier and sets instrument_entity_id only on the keyed row", async () => {
  const tables = seedTables();
  const calls = [];
  __setWriteClientForTest(() => makeStatefulClient(tables, calls));

  const existingEntityIds = await existingEntityIdSet();
  const existingIdentifierKeys = await existingIdentifierKeySet();
  const r = await runInstrument({ apply: true, limit: null }, existingEntityIds, existingIdentifierKeys);
  assert.equal(r.created, 1);
  assert.equal(r.identifiers, 1);
  assert.equal(r.refs, 1, "one FK update (i1 only — i2 has no canonical_instrument_key)");
  assert.equal(tables.entities.length, 1);
  assert.equal(tables.entities[0].kind, "instrument");
  const i1 = tables.intelligence_items.find((r) => r.id === "i1");
  assert.equal(i1.instrument_entity_id, entityId("instrument", "32019R1242"));
  const i2 = tables.intelligence_items.find((r) => r.id === "i2");
  assert.equal(i2.instrument_entity_id, null, "i2 has no canonical_instrument_key — must stay unset");
});

test("runOrganisation: apply mode creates one organisation entity + HOST identifier and sets organisation_entity_id", async () => {
  const tables = seedTables();
  const calls = [];
  __setWriteClientForTest(() => makeStatefulClient(tables, calls));

  const existingEntityIds = await existingEntityIdSet();
  const existingIdentifierKeys = await existingIdentifierKeySet();
  const r = await runOrganisation({ apply: true, limit: null }, existingEntityIds, existingIdentifierKeys);
  assert.equal(r.created, 1);
  assert.equal(r.identifiers, 1);
  assert.equal(r.refs, 1);
  const s1 = tables.sources.find((r) => r.id === "s1");
  assert.equal(s1.organisation_entity_id, entityId("organisation", "sec.gov"));
  const idRow = tables.entity_identifiers.find((i) => i.scheme === "HOST");
  assert.equal(idRow.value, "sec.gov");
});

test("existingEntityIdSet / existingIdentifierKeySet / existingRefKeySet: read the seeded rows back into the expected Set shape", async () => {
  const tables = seedTables();
  tables.entities.push({ entity_id: "cl:jurisdiction:abc", kind: "jurisdiction", canonical_name: "US" });
  tables.entity_identifiers.push({ entity_id: "cl:jurisdiction:abc", scheme: "ISO3166_1", value: "US" });
  tables.entity_refs.push({ ref_table: "intelligence_items", ref_id: "i1", entity_id: "cl:jurisdiction:abc", role: "jurisdiction" });
  __setWriteClientForTest(() => makeStatefulClient(tables, []));

  const ids = await existingEntityIdSet();
  assert.ok(ids.has("cl:jurisdiction:abc"));
  const idKeys = await existingIdentifierKeySet();
  assert.ok(idKeys.has("cl:jurisdiction:abc|ISO3166_1|US"));
  const refKeys = await existingRefKeySet();
  assert.ok(refKeys.has("intelligence_items|i1|cl:jurisdiction:abc|jurisdiction"));
});

test.after(() => __setWriteClientForTest(null)); // restore real client factory

// Regression lock (propagation-drain run 33627113501, 2026-09-02): db.mjs's readAll orders by `id` by
// default, and none of the three spine tables has an `id` column (PK entity_id / composite). The first
// live dry run died on "column entities.id does not exist" before reading a single row. Every readAll on
// a spine table must name its order column.
test("readAll on entities/entity_identifiers/entity_refs always passes an explicit orderBy", () => {
  const src = readFileSync(new URL("./backfill-entities.mjs", import.meta.url), "utf8");
  const calls = [...src.matchAll(/readAll\(\s*"(entities|entity_identifiers|entity_refs)"[^)]*\)/g)];
  assert.ok(calls.length >= 3, `expected the three spine-table reads, found ${calls.length}`);
  for (const m of calls) {
    assert.match(m[0], /orderBy:\s*"entity_id"/, `readAll("${m[1]}") must pass orderBy: "entity_id": ${m[0]}`);
  }
});
