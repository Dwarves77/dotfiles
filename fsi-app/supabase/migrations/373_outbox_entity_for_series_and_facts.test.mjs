// 373_outbox_entity_for_series_and_facts.test.mjs -- static proof of migration 373 (lane L4-E), by parsing the SQL file
// directly: no database, no SQL parser dependency. Same discipline as 352's test. The behavioural proof is the migration's
// own self-check (real fixture rows in a rolled-back sub-transaction), which runs at apply time; this file proves the file
// says what the lane's report says it says, and attacks the self-check (each guarded behaviour has an assertion that would
// fail if the behaviour were removed).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./373_outbox_entity_for_series_and_facts.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const M284 = readFileSync(fileURLToPath(new URL("./284_propagation_outbox.sql", import.meta.url)), "utf8");
const M352 = readFileSync(fileURLToPath(new URL("./352_outbox_entity_for_emission_factors.sql", import.meta.url)), "utf8");

test("header: subject line, states NOT APPLIED, names both tables and the rule it builds on", () => {
  assert.match(RAW, /^-- subject: Migration 373 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /market_series\s+id uuid PK, series_key/);
  assert.match(RAW, /regional_data_facts\s+id uuid PK, region_id uuid NOT NULL REFERENCES regions/);
  assert.match(RAW, /migration 352/);
});

test("market_series gains a nullable entity_id FK to entities, indexed where set, and its trigger is ('id','entity_id')", () => {
  assert.match(SQL, /ALTER TABLE public\.market_series\s+ADD COLUMN IF NOT EXISTS entity_id text REFERENCES public\.entities\(entity_id\);/);
  assert.doesNotMatch(SQL, /entity_id text NOT NULL/);
  assert.match(SQL, /CREATE INDEX IF NOT EXISTS market_series_entity_idx\s+ON public\.market_series \(entity_id\) WHERE entity_id IS NOT NULL;/);
  assert.match(SQL, /CREATE TRIGGER propagation_outbox_trg\s+AFTER INSERT OR UPDATE OR DELETE ON public\.market_series\s+FOR EACH ROW EXECUTE FUNCTION public\.emit_propagation_event\('id', 'entity_id'\);/);
});

test("regional_data_facts is re-attached to the region fan-out function with (pk, region) arguments", () => {
  assert.match(SQL, /CREATE TRIGGER propagation_outbox_trg\s+AFTER INSERT OR UPDATE OR DELETE ON public\.regional_data_facts\s+FOR EACH ROW EXECUTE FUNCTION public\.emit_propagation_events_for_region\('id', 'region_id'\);/);
  const triggers = [...SQL.matchAll(/CREATE TRIGGER propagation_outbox_trg\s+AFTER[^;]*?ON public\.([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(triggers, ["market_series", "regional_data_facts"], "no other table's outbox trigger is touched");
});

test("emit_propagation_event() is not redefined: every existing one-event attachment is byte-identical", () => {
  assert.doesNotMatch(SQL, /CREATE OR REPLACE FUNCTION public\.emit_propagation_event\(\)/);
  assert.match(M352, /CREATE OR REPLACE FUNCTION public\.emit_propagation_event\(\) RETURNS trigger/, "352 owns the live definition this migration builds on");
  assert.match(SQL, /prosrc LIKE '%TG_NARGS%'/, "the precondition refuses to apply before 352");
});

test("the fan-out function copies 284's classification and its INSERT column list exactly", () => {
  const fn = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.emit_propagation_events_for_region()"), SQL.indexOf("COMMENT ON FUNCTION public.emit_propagation_events_for_region()"));
  const insert284 = M284.match(/INSERT INTO public\.propagation_events \(([^)]*)\)\s+VALUES \(([^)]*)\);/);
  const insertNew = fn.match(/INSERT INTO public\.propagation_events \(([^)]*)\)\s+VALUES \(([^)]*)\);/);
  assert.equal(insertNew[1], insert284[1], "same column list");
  assert.equal(insertNew[2].replace("r.entity_id", "v_entity_id"), insert284[2], "same values, the entity read from the loop row");
  for (const phrase of [
    "(v_new - 'updated_at') IS NOT DISTINCT FROM (v_old - 'updated_at')",
    "v_kind := 'insert'", "v_kind := 'delete'", "v_kind := 'supersede'", "v_kind := 'update'",
    "(v_old ? 'superseded_by') AND (v_old->>'superseded_by') IS NULL AND (v_new->>'superseded_by') IS NOT NULL",
  ]) {
    assert.ok(fn.includes(phrase), phrase);
    assert.ok(M284.includes(phrase), `284 carries it too: ${phrase}`);
  }
  assert.equal((fn.match(/INSERT INTO public\.propagation_events/g) ?? []).length, 1, "one INSERT, inside the loop");
});

test("the fan-out reads entity_refs for ref_table regions and role jurisdiction, both regions on a move, distinct, in a stable order", () => {
  assert.match(SQL, /er\.ref_table = 'regions'/);
  assert.match(SQL, /er\.role = 'jurisdiction'/);
  assert.match(SQL, /er\.ref_id IN \(v_region_new, v_region_old\)/);
  assert.match(SQL, /SELECT DISTINCT er\.entity_id/);
  assert.match(SQL, /ORDER BY er\.entity_id/);
  const fn = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.emit_propagation_events_for_region()"), SQL.indexOf("COMMENT ON FUNCTION public.emit_propagation_events_for_region()"));
  assert.doesNotMatch(fn, /RAISE/, "a region with no refs emits nothing and the function never raises");
});

test("the fan-out is invoker-rights with a pinned search_path and EXECUTE revoked from PUBLIC (F70 posture, not a definer)", () => {
  const header = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.emit_propagation_events_for_region()"));
  assert.match(header.slice(0, 300), /SET search_path = public, pg_temp/);
  assert.doesNotMatch(SQL, /SECURITY DEFINER/);
  assert.match(SQL, /REVOKE EXECUTE ON FUNCTION public\.emit_propagation_events_for_region\(\) FROM PUBLIC;/);
});

test("propagation_events is append-only: no statement updates or deletes it, outside the function's own INSERT", () => {
  assert.doesNotMatch(SQL, /UPDATE\s+public\.propagation_events/i);
  assert.doesNotMatch(SQL, /DELETE\s+FROM\s+public\.propagation_events/i);
  assert.doesNotMatch(SQL, /TRUNCATE/i);
  assert.equal((SQL.match(/INSERT INTO public\.propagation_events/g) ?? []).length, 1);
});

test("the self-check uses real tables, is rolled back by a sentinel, and attacks every behaviour in the brief", () => {
  assert.match(SQL, /RAISE EXCEPTION 'l4e_373_selfcheck_rollback'/);
  assert.match(SQL, /IF SQLERRM <> 'l4e_373_selfcheck_rollback' THEN RAISE; END IF/);
  for (const table of ["public.entities", "public.regions", "public.entity_refs", "public.regional_data_facts", "public.market_series"]) {
    assert.ok(new RegExp(`INSERT INTO ${table.replace(".", "\\.")}`).test(SQL), `a real fixture row in ${table}`);
  }
  for (const phrase of [
    "must give 2 insert events for those 2 entities",
    "with no jurisdiction ref must give 0 events",
    "update must give 2 update events",
    "no-op regional_data_facts update must give 0 events",
    "moving a fact between regions must give one event per entity of both regions",
    "delete must give 1 delete event",
    "insert with an entity must give exactly 1 event carrying it",
    "update must give exactly 1 event carrying its entity",
    "NULL entity must give 1 event with a NULL entity",
    "accepted an entity id with no entities row",
    "one-argument attachment must give exactly 1 event with no entity",
    "left % propagation_events row(s) behind",
    "left a fixture row behind",
  ]) {
    assert.ok(SQL.includes(phrase), phrase);
  }
  assert.match(SQL, /'not-a-jurisdiction'/, "a ref of another role must not count");
  assert.match(SQL, /tgnargs = 2/);
});

test("the fixture trigger does not use the real trigger name, so outbox-table pin detectors see only the two real attachments", () => {
  assert.match(SQL, /CREATE TRIGGER l4e_373_selfcheck_trg/);
});

test("runs inside one transaction and uses no dash glyphs or section signs in its text", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
  assert.doesNotMatch(RAW, new RegExp("[" + String.fromCharCode(0x2013, 0x2014, 0xa7) + "]"));
});
