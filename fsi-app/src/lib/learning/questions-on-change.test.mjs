// questions-on-change.test.mjs, lane L4-A: the change side of the learning loop. Fixtures only, no
// database: the entity-to-item read and the flag writer are injected.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  eventTypeForOutboxRow, EMITTING_TABLE_EVENT_MAP, MAX_ITEMS_PER_EVENT, describeChange,
  runQuestionsOnChange, buildEntityItemsReader,
} from "./questions-on-change.mjs";
import { TRIGGER_EVENT_TYPES } from "./constants.mjs";
import { QUESTION_NAMESPACE } from "../connections/flag-namespaces.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "..", "supabase", "migrations");

const ENTITY = "cl:jurisdiction:aaaaaaaaaaaaaaaa";
const REG = (id, extra = {}) => ({ id, title: `Reg ${id}`, domain: 1, item_type: "regulation", provenance_status: "verified", is_archived: false, ...extra });
const EVENT = (extra = {}) => ({
  eventId: 7, tableName: "derived_values", rowPk: "val-1", entityId: ENTITY, changeKind: "update", occurredAt: "2026-10-05T00:00:00Z", ...extra,
});

/** Fixture deps: a link table, an open-flag store, and an insert recorder. */
function fixtureDeps({ items = [], openFlags = [] } = {}) {
  const state = { open: [...openFlags], inserted: [] };
  return {
    state,
    deps: {
      readEntityLinks: async (entityId) => ({ entityName: entityId === ENTITY ? "Fixture jurisdiction" : null, items }),
      readExistingOpen: async () => state.open.map((f) => ({ subject_ref: f.subject_ref, created_by: f.created_by })),
      insertMany: async (rows) => { state.inserted.push(...rows); return { inserted: rows.length, snapshot: "snap" }; },
    },
  };
}

// mapping

test("eventTypeForOutboxRow: every mapped (table, change_kind) lands in TRIGGER_EVENT_TYPES", () => {
  for (const table of Object.keys(EMITTING_TABLE_EVENT_MAP)) {
    for (const kind of ["insert", "update", "delete", "supersede"]) {
      const t = eventTypeForOutboxRow({ table_name: table, change_kind: kind });
      assert.ok(TRIGGER_EVENT_TYPES.includes(t), `${table}/${kind} -> ${t}`);
    }
  }
});

test("eventTypeForOutboxRow: emission_factors supersede is factor_superseded; its other kinds are value_revised; statutory is obligation_amended", () => {
  assert.equal(eventTypeForOutboxRow({ table_name: "emission_factors", change_kind: "supersede" }), "factor_superseded");
  assert.equal(eventTypeForOutboxRow({ table_name: "emission_factors", change_kind: "update" }), "value_revised");
  assert.equal(eventTypeForOutboxRow({ table_name: "derived_values", change_kind: "update" }), "value_revised");
  assert.equal(eventTypeForOutboxRow({ table_name: "statutory_computations", change_kind: "update" }), "obligation_amended");
});

test("eventTypeForOutboxRow: a table with no mapping returns null, never a guessed type", () => {
  assert.equal(eventTypeForOutboxRow({ table_name: "not_an_emitting_table", change_kind: "update" }), null);
  assert.equal(eventTypeForOutboxRow(null), null);
});

// Lane L4-E (migration 373): a table may attach the outbox through emit_propagation_events_for_region (one row per
// jurisdiction entity of the row's region) as well as through emit_propagation_event; both are emitting attachments.
const TRIGGER_RE = /CREATE\s+TRIGGER\s+propagation_outbox_trg\s+AFTER[^;]*?\bON\s+(?:public\.)?([a-z_]+)[^;]*?emit_propagation_event(?:s_for_region)?\s*\(/gis;

/** Tables whose outbox row is written by an explicit insert in code, not by a trigger (lane L4-D: a fired
 *  signpost writes its own propagation_events row in signpost-watch.ts fireSignpost). */
function explicitOutboxInsertTables() {
  const src = readFileSync(join(HERE, "..", "propagation", "methods", "signpost-watch.ts"), "utf8");
  return [...src.matchAll(/from\("propagation_events"\)\.insert\(\{\s*table_name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
}

/** Every table that emits outbox events: the ones a migration attaches propagation_outbox_trg to, derived from
 *  the migration text, plus the ones code writes an outbox row for explicitly. */
function emittingTablesFromMigrations() {
  const tables = new Set(explicitOutboxInsertTables());
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    for (const m of sql.matchAll(TRIGGER_RE)) tables.add(m[1]);
  }
  return tables;
}

test("every table that emits outbox events has a mapping (fails when a new emitting table has none)", () => {
  const tables = emittingTablesFromMigrations();
  assert.ok(tables.size >= 6, `expected at least the six known emitting tables, found ${[...tables].join(",")}`);
  const unmapped = [...tables].filter((t) => !(t in EMITTING_TABLE_EVENT_MAP));
  assert.deepEqual(unmapped, [], `emitting table(s) with no event mapping: ${unmapped.join(", ")}`);
});

test("the mapping names no table the migrations never attach the outbox trigger to", () => {
  const tables = emittingTablesFromMigrations();
  const stale = Object.keys(EMITTING_TABLE_EVENT_MAP).filter((t) => !tables.has(t));
  assert.deepEqual(stale, []);
});

test("a fired signpost is an emitting table: its outbox row (written by fireSignpost) maps to signpost_fired", () => {
  assert.deepEqual(explicitOutboxInsertTables(), ["signposts"]);
  assert.equal(eventTypeForOutboxRow({ table_name: "signposts", change_kind: "update" }), "signpost_fired");
  assert.ok(emittingTablesFromMigrations().has("signposts"));
});

test("a fired-signpost event for a watched entity raises the questions on the items linked to that entity", async () => {
  const { deps, state } = fixtureDeps({ items: [REG("r1")] });
  const out = await runQuestionsOnChange({
    mode: "apply",
    events: [EVENT({ tableName: "signposts", rowPk: "cl:signpost:00000000000000f1", changeKind: "update" })],
    deps,
  });
  assert.equal(out.counts.events_unmapped, 0);
  assert.equal(out.counts.events_mapped, 1);
  assert.equal(state.inserted.length, 4, "the four product questions for the one linked item");
  assert.match(describeChange(EVENT({ tableName: "signposts", rowPk: "s1" }), "Fixture jurisdiction"), /signpost/);
});

test("the pin detector itself works: a synthetic new emitting table is seen as unmapped", () => {
  const sql = "CREATE TRIGGER propagation_outbox_trg\n  AFTER INSERT OR UPDATE OR DELETE ON public.brand_new_table\n  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('id');";
  const m = [...sql.matchAll(TRIGGER_RE)];
  assert.equal(m[0][1], "brand_new_table");
  assert.ok(!("brand_new_table" in EMITTING_TABLE_EVENT_MAP));
});


// identity_revised (lane ALIAS-1, coordinator ruling 2026-10-08): an alias or relation change on an entity

test("identity_revised is a trigger event type, and entity_aliases and entity_relations map to it for every change kind", () => {
  assert.ok(TRIGGER_EVENT_TYPES.includes("identity_revised"));
  for (const table of ["entity_aliases", "entity_relations"]) {
    for (const kind of ["insert", "update", "delete", "supersede"]) {
      assert.equal(eventTypeForOutboxRow({ table_name: table, change_kind: kind }), "identity_revised", `${table}/${kind}`);
    }
  }
});

test("describeChange for an identity change names the entity and says to re-resolve the mentions and roll-ups that name it", () => {
  const s = describeChange(EVENT({ tableName: "entity_aliases", rowPk: ENTITY, changeKind: "insert" }), "Fixture jurisdiction");
  assert.equal(s, `the identity of Fixture jurisdiction (${ENTITY}) changed (alias or relation): re-resolve mentions and roll-ups that name it`);
  assert.match(describeChange(EVENT({ tableName: "entity_relations", changeKind: "delete" }), null), /the identity of cl:jurisdiction:aaaaaaaaaaaaaaaa changed \(alias or relation\)/);
});

test("an alias event for an entity linked to a verified item raises the four questions with event_type=identity_revised and the stated change text", async () => {
  const { deps, state } = fixtureDeps({ items: [REG("r1")] });
  const out = await runQuestionsOnChange({
    mode: "apply",
    events: [EVENT({ tableName: "entity_aliases", rowPk: ENTITY, changeKind: "insert" })],
    deps,
  });
  assert.equal(out.counts.events_unmapped, 0);
  assert.equal(out.counts.events_mapped, 1);
  assert.equal(state.inserted.length, 4);
  for (const row of state.inserted) {
    assert.match(row.recommended_actions[0].rationale, /event_type=identity_revised/);
    assert.match(row.description, /re-resolve mentions and roll-ups that name it/);
  }
});

test("the pin detector sees a table attached through the region fan-out function too (migration 373), and that table is mapped", () => {
  const sql = "CREATE TRIGGER propagation_outbox_trg\n  AFTER INSERT OR UPDATE OR DELETE ON public.brand_new_region_table\n  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_events_for_region('id', 'region_id');";
  const m = [...sql.matchAll(TRIGGER_RE)];
  assert.equal(m.length, 1);
  assert.equal(m[0][1], "brand_new_region_table");
  assert.ok(!("brand_new_region_table" in EMITTING_TABLE_EVENT_MAP), "an unmapped region table would fail the mapping test");
  const raw373 = readFileSync(join(MIGRATIONS, "373_outbox_entity_for_series_and_facts.sql"), "utf8");
  const sql373 = raw373.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
  const attached = [...sql373.matchAll(TRIGGER_RE)].map((x) => x[1]).sort();
  assert.deepEqual(attached, ["market_series", "regional_data_facts"], "migration 373's two attachments are both seen by the detector");
  for (const t of attached) assert.ok(t in EMITTING_TABLE_EVENT_MAP, `${t} is mapped to a question kind`);
  assert.equal(eventTypeForOutboxRow({ table_name: "market_series", change_kind: "update" }), "value_revised");
  assert.equal(eventTypeForOutboxRow({ table_name: "regional_data_facts", change_kind: "update" }), "value_revised");
});

// change description

test("describeChange: says which value changed on which entity, from outbox and entity fields only", () => {
  const s = describeChange(EVENT(), "Fixture jurisdiction");
  assert.match(s, /derived value/);
  assert.match(s, /revised/);
  assert.match(s, /Fixture jurisdiction/);
  assert.match(s, /val-1/);
});

// acceptance: affected items

test("a derived_values update for an entity linked to two verified items raises their questions with the mapped event type; archived and unverified linked items raise none", async () => {
  const { deps, state } = fixtureDeps({
    items: [REG("a"), REG("b"), REG("arch", { is_archived: true }), REG("unv", { provenance_status: "quarantined" })],
  });
  const summary = await runQuestionsOnChange({ mode: "apply", events: [EVENT()], deps });
  assert.equal(summary.counts.items_affected, 2);
  assert.equal(summary.counts.new, 8);
  assert.equal(summary.applied, 8);
  const refs = state.inserted.map((r) => r.subject_ref);
  assert.ok(refs.every((r) => r.startsWith("a:") || r.startsWith("b:")));
  assert.ok(!refs.some((r) => r.startsWith("arch:") || r.startsWith("unv:")));
  for (const row of state.inserted) {
    assert.match(row.recommended_actions[0].rationale, /event_type=value_revised/);
    assert.match(row.recommended_actions[0].rationale, /event_id=7/);
    assert.match(row.description, /Fixture jurisdiction/);
    assert.ok(row.created_by.startsWith(QUESTION_NAMESPACE));
  }
});

test("a second identical event while the questions are open raises nothing; once resolved the same event raises them again", async () => {
  const items = [REG("a"), REG("b")];
  const first = fixtureDeps({ items });
  await runQuestionsOnChange({ mode: "apply", events: [EVENT()], deps: first.deps });
  assert.equal(first.state.inserted.length, 8);

  const open = first.state.inserted.map((r) => ({ subject_ref: r.subject_ref, created_by: r.created_by }));
  const second = fixtureDeps({ items, openFlags: open });
  const again = await runQuestionsOnChange({ mode: "apply", events: [EVENT({ eventId: 8 })], deps: second.deps });
  assert.equal(again.counts.new, 0);
  assert.equal(again.counts.already_open, 8);
  assert.equal(second.state.inserted.length, 0);

  // the fixture marks them resolved: nothing open any more
  const third = fixtureDeps({ items, openFlags: [] });
  const raised = await runQuestionsOnChange({ mode: "apply", events: [EVENT({ eventId: 9 })], deps: third.deps });
  assert.equal(raised.counts.new, 8);
});

test("two events touching the same item in one run raise one set of questions (in-batch dedup)", async () => {
  const { deps, state } = fixtureDeps({ items: [REG("a")] });
  const s = await runQuestionsOnChange({ mode: "apply", events: [EVENT({ eventId: 1 }), EVENT({ eventId: 2, rowPk: "val-2" })], deps });
  assert.equal(state.inserted.length, 4);
  assert.equal(s.counts.deduped_in_batch, 4);
});

test("dry mode writes nothing and reports the same counts apply mode writes", async () => {
  const items = [REG("a"), REG("b"), REG("c")];
  const dry = fixtureDeps({ items });
  const apply = fixtureDeps({ items });
  const d = await runQuestionsOnChange({ mode: "dry", events: [EVENT()], deps: dry.deps });
  const a = await runQuestionsOnChange({ mode: "apply", events: [EVENT()], deps: apply.deps });
  assert.equal(dry.state.inserted.length, 0);
  assert.equal(d.applied, 0);
  assert.equal(apply.state.inserted.length, a.applied);
  for (const k of ["events_seen", "events_mapped", "items_affected", "new", "already_open", "items_dropped_by_cap"]) {
    assert.equal(d.counts[k], a.counts[k], k);
  }
  assert.equal(d.counts.new, 12);
});

test("the per-event cap is stated and the dropped count is reported, never silent", async () => {
  const items = Array.from({ length: MAX_ITEMS_PER_EVENT + 5 }, (_, i) => REG(`i${String(i).padStart(3, "0")}`));
  const { deps } = fixtureDeps({ items });
  const s = await runQuestionsOnChange({ mode: "dry", events: [EVENT()], deps });
  assert.equal(s.counts.items_affected, MAX_ITEMS_PER_EVENT);
  assert.equal(s.counts.items_dropped_by_cap, 5);
});

test("events with no mapping, or no entity, are counted and raise nothing", async () => {
  const { deps } = fixtureDeps({ items: [REG("a")] });
  const s = await runQuestionsOnChange({
    mode: "apply",
    events: [EVENT({ tableName: "mystery_table" }), EVENT({ entityId: null }), EVENT({ eventId: 11 })],
    deps,
  });
  assert.equal(s.counts.events_seen, 3);
  assert.equal(s.counts.events_unmapped, 1);
  assert.equal(s.counts.events_no_entity, 1);
  assert.equal(s.counts.events_mapped, 1);
});

test("an entity read failure on one event is recorded and does not stop the others", async () => {
  const { deps } = fixtureDeps({ items: [REG("a")] });
  const orig = deps.readEntityLinks;
  deps.readEntityLinks = async (id) => { if (id === "cl:bad") throw new Error("boom"); return orig(id); };
  const s = await runQuestionsOnChange({ mode: "dry", events: [EVENT({ entityId: "cl:bad" }), EVENT({ eventId: 2 })], deps });
  assert.equal(s.counts.read_errors, 1);
  assert.equal(s.counts.items_affected, 1);
});

// the sb-backed reader (the EXISTING entity to item link, read in reverse)

function fakeSb(tables) {
  return {
    from(table) {
      const filters = [];
      let rangeArgs = null;
      const b = {
        select() { return b; },
        eq(c, v) { filters.push((r) => r[c] === v); return b; },
        in(c, vs) { filters.push((r) => vs.includes(r[c])); return b; },
        order() { return b; },
        range(f, t) { rangeArgs = [f, t]; return b; },
        async maybeSingle() { const r = (tables[table] || []).filter((x) => filters.every((fn) => fn(x))); return { data: r[0] ?? null, error: null }; },
        then(res, rej) {
          let rows = (tables[table] || []).filter((x) => filters.every((fn) => fn(x)));
          if (rangeArgs) rows = rows.slice(rangeArgs[0], rangeArgs[1] + 1);
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}

test("buildEntityItemsReader: links through instrument_entity_id and entity_refs, returns the entity name", async () => {
  const sb = fakeSb({
    entities: [{ entity_id: ENTITY, kind: "jurisdiction", canonical_name: "Fixture jurisdiction" }],
    intelligence_items: [
      REG("a", { instrument_entity_id: ENTITY }),
      REG("b"),
      REG("c"),
    ],
    entity_refs: [
      { ref_table: "intelligence_items", ref_id: "b", entity_id: ENTITY, role: "jurisdiction" },
      { ref_table: "intelligence_items", ref_id: "a", entity_id: ENTITY, role: "jurisdiction" },
      { ref_table: "regions", ref_id: "c", entity_id: ENTITY, role: "jurisdiction" },
    ],
  });
  const read = buildEntityItemsReader(sb);
  const out = await read(ENTITY);
  assert.equal(out.entityName, "Fixture jurisdiction");
  assert.deepEqual(out.items.map((i) => i.id).sort(), ["a", "b"]);
});

// replay support (lane L4-A, coordinator review)

import { readOutboxEvents } from "./questions-on-change.mjs";

test("runQuestionsOnChange reports the event ids whose entity read failed", async () => {
  const { deps } = fixtureDeps({ items: [REG("a")] });
  const orig = deps.readEntityLinks;
  deps.readEntityLinks = async (id) => { if (id === "cl:bad") throw new Error("boom"); return orig(id); };
  const s = await runQuestionsOnChange({ mode: "dry", events: [EVENT({ eventId: 3, entityId: "cl:bad" }), EVENT({ eventId: 4 })], deps });
  assert.deepEqual(s.failed_event_ids, [3]);
});

test("readOutboxEvents reads rows back by id list or id range, as processed events", async () => {
  const rows = [3, 4, 5].map((id) => ({ event_id: id, table_name: "derived_values", row_pk: `dv-${id}`, entity_id: ENTITY, change_kind: "update", occurred_at: "t" }));
  const sb = {
    from() {
      const f = [];
      const b = {
        select() { return b; },
        in(c, v) { f.push((r) => v.includes(r[c])); return b; },
        gte(c, v) { f.push((r) => r[c] >= v); return b; },
        lte(c, v) { f.push((r) => r[c] <= v); return b; },
        order() { return b; },
        range(a, z) { b.r = [a, z]; return b; },
        then(res, rej) { let o = rows.filter((x) => f.every((fn) => fn(x))); if (b.r) o = o.slice(b.r[0], b.r[1] + 1); return Promise.resolve({ data: o, error: null }).then(res, rej); },
      };
      return b;
    },
  };
  const byIds = await readOutboxEvents(sb, { ids: [5, 3] });
  assert.deepEqual(byIds.map((e) => e.eventId), [3, 5]);
  assert.equal(byIds[0].tableName, "derived_values");
  assert.equal(byIds[0].entityId, ENTITY);
  const byRange = await readOutboxEvents(sb, { from: 4, to: 5 });
  assert.deepEqual(byRange.map((e) => e.eventId), [4, 5]);
});
