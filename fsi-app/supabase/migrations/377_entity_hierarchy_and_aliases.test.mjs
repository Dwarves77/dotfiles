// 377_entity_hierarchy_and_aliases.test.mjs -- static proof of migration 377 (lane ALIAS-1), by parsing the SQL
// file directly: no database, no SQL parser dependency. Same discipline as 352's test. The behavioural proof is
// the migration's own self-check (rolled-back fixtures inside a DO block that attacks every guard), which runs at
// apply time; this file proves the file says what the lane's report says it says, and that the closed
// vocabularies in src/lib/entities/resolve.mjs equal the migration's CHECK lists.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ENTITY_LEVELS, RELATIONS, ALIAS_KINDS } from "../../src/lib/entities/resolve.mjs";

const RAW = readFileSync(fileURLToPath(new URL("./377_entity_hierarchy_and_aliases.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const SELF_CHECK_START = SQL.indexOf("alias1_377_selfcheck_rollback") === -1 ? -1 : SQL.lastIndexOf("DO $$", SQL.indexOf("n_before   bigint"));
const DDL = SQL.slice(0, SELF_CHECK_START);
const SELF_CHECK = SQL.slice(SELF_CHECK_START);

const listIn = (text) => [...text.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const checkList = (constraint) => {
  const m = SQL.match(new RegExp(`CONSTRAINT ${constraint}\\s+CHECK \\(([^;]*?)\\)(?:,|\\s*\\);|;)`, "s"));
  assert.ok(m, `constraint ${constraint} not found`);
  return listIn(m[1]);
};

test("header: subject line first, states APPLIED with the ledger version, names the migrations it requires and the direction of a relation", () => {
  assert.match(RAW, /^-- subject: Migration 377 /);
  assert.match(RAW, /APPLIED \(production ledger version 20261008134702, as of 2026-10-08\)/);
  assert.doesNotMatch(RAW, /NOT APPLIED/);
  for (const n of ["282", "284", "352"]) assert.match(RAW, new RegExp(`migration ${n}`));
  assert.match(RAW, /relation names the CHILD's role toward the PARENT/);
});

test("entities.entity_level: nullable text, closed values, organisation only", () => {
  assert.match(DDL, /ALTER TABLE public\.entities ADD COLUMN IF NOT EXISTS entity_level text;/);
  const vals = DDL.match(/entities_entity_level_values\s+CHECK \(entity_level IS NULL OR entity_level IN \(([^)]*)\)\)/);
  assert.ok(vals);
  assert.deepEqual(listIn(vals[1]), [...ENTITY_LEVELS]);
  assert.match(DDL, /entities_entity_level_organisation_only\s+CHECK \(entity_level IS NULL OR kind = 'organisation'\)/);
  assert.doesNotMatch(DDL, /UPDATE public\.entities/, "no existing row is given a level here: that is population");
});

test("entity_relations: the brief's columns, primary key, closed relation values, no self edge, source FK", () => {
  const t = DDL.match(/CREATE TABLE IF NOT EXISTS public\.entity_relations \(([\s\S]*?)\n\);/)[1];
  for (const col of ["parent_entity_id", "child_entity_id", "relation", "asserted_by", "asserted_at", "source_id", "provenance"]) {
    assert.match(t, new RegExp(`^\\s+${col}\\s`, "m"), col);
  }
  assert.match(t, /parent_entity_id text\s+NOT NULL REFERENCES public\.entities\(entity_id\)/);
  assert.match(t, /child_entity_id\s+text\s+NOT NULL REFERENCES public\.entities\(entity_id\)/);
  assert.match(t, /asserted_by\s+text\s+NOT NULL/);
  assert.match(t, /asserted_at\s+timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(t, /source_id\s+uuid\s+REFERENCES public\.sources\(id\)/);
  assert.match(t, /PRIMARY KEY \(parent_entity_id, child_entity_id, relation\)/);
  assert.deepEqual(checkList("entity_relations_relation_values"), ["group_of", "legal_entity_of", "operating_identity_of"]);
  assert.deepEqual(checkList("entity_relations_relation_values"), [...RELATIONS]);
  assert.match(t, /CHECK \(parent_entity_id <> child_entity_id\)/);
});

test("entity_aliases: the brief's columns, primary key, closed kinds, whitespace-collapsed text", () => {
  const t = DDL.match(/CREATE TABLE IF NOT EXISTS public\.entity_aliases \(([\s\S]*?)\n\);/)[1];
  for (const col of ["entity_id", "alias", "alias_kind", "asserted_by", "asserted_at", "source_id", "provenance"]) {
    assert.match(t, new RegExp(`^\\s+${col}\\s`, "m"), col);
  }
  assert.match(t, /PRIMARY KEY \(entity_id, alias, alias_kind, asserted_by\)/);
  assert.match(t, /asserted_by text\s+NOT NULL/);
  assert.match(t, /source_id\s+uuid\s+REFERENCES public\.sources\(id\)/);
  assert.deepEqual(listIn(t.match(/alias_kind IN \(([^)]*)\)/)[1]), [...ALIAS_KINDS]);
  assert.match(t, /alias = btrim\(regexp_replace\(alias, '\\s\+', ' ', 'g'\)\)/);
});

test("the cycle trigger refuses a self edge and any child that is an ancestor of the parent, serialises writers, and leaves out the replaced row on UPDATE", () => {
  assert.match(DDL, /pg_advisory_xact_lock\(hashtextextended\('entity_relations_cycle', 0\)\)/);
  assert.match(DDL, /WITH RECURSIVE ancestors\(entity_id\) AS \(/);
  assert.match(DDL, /SELECT 1 FROM ancestors WHERE entity_id = NEW\.child_entity_id/);
  assert.match(DDL, /TG_OP = 'UPDATE'\s+AND r\.parent_entity_id = OLD\.parent_entity_id/);
  assert.match(DDL, /BEFORE INSERT OR UPDATE OF parent_entity_id, child_entity_id ON public\.entity_relations/);
  assert.match(DDL, /USING ERRCODE = 'check_violation'/);
});

test("aliases are insert-only: UPDATE, DELETE and TRUNCATE are refused by trigger and the privileges are revoked, for authenticated and service_role", () => {
  assert.match(DDL, /BEFORE UPDATE OR DELETE ON public\.entity_aliases\s+FOR EACH ROW EXECUTE FUNCTION public\.entity_aliases_refuse_change\(\)/);
  assert.match(DDL, /BEFORE TRUNCATE ON public\.entity_aliases\s+FOR EACH STATEMENT EXECUTE FUNCTION public\.entity_aliases_refuse_change\(\)/);
  assert.match(DDL, /USING ERRCODE = 'restrict_violation'/);
  assert.match(DDL, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.entity_aliases FROM authenticated;/);
  assert.match(DDL, /REVOKE UPDATE, DELETE, TRUNCATE ON public\.entity_aliases FROM service_role;/);
  assert.match(DDL, /GRANT SELECT, INSERT ON public\.entity_aliases TO service_role;/);
  assert.doesNotMatch(DDL, /ON CONFLICT[^;]*DO UPDATE/i);
  assert.doesNotMatch(DDL, /UPDATE public\.entities SET canonical_name/i, "an alias never overwrites the display name");
});

test("RLS: read for authenticated, no write policy, anon revoked, on both tables", () => {
  for (const t of ["entity_relations", "entity_aliases"]) {
    assert.match(DDL, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`));
    assert.match(DDL, new RegExp(`CREATE POLICY ${t}_read ON public\\.${t} FOR SELECT TO authenticated USING \\(true\\);`));
    assert.match(DDL, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon;`));
    assert.match(DDL, new RegExp(`GRANT SELECT ON public\\.${t} TO authenticated;`));
  }
  assert.doesNotMatch(DDL, /CREATE POLICY [a-z_]+ ON public\.entity_(aliases|relations) FOR (INSERT|UPDATE|DELETE|ALL)/);
});

test("the outbox trigger is attached in migration 352's form: aliases key on their own entity_id, relations name the child as the entity column", () => {
  const triggers = [...DDL.matchAll(/CREATE TRIGGER propagation_outbox_trg\s+AFTER INSERT OR UPDATE OR DELETE ON public\.([a-z_]+)\s+FOR EACH ROW EXECUTE FUNCTION public\.emit_propagation_event\(([^)]*)\)/g)];
  assert.deepEqual(triggers.map((m) => m[1]), ["entity_relations", "entity_aliases"]);
  assert.equal(triggers[0][2].replace(/\s+/g, ""), "'parent_entity_id','child_entity_id'");
  assert.equal(triggers[1][2].replace(/\s+/g, ""), "'entity_id'");
});

test("F70 posture: no SECURITY DEFINER anywhere, every function pins its search_path and has EXECUTE revoked from PUBLIC", () => {
  assert.doesNotMatch(SQL, /SECURITY DEFINER/i);
  const fns = [...DDL.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(\)[^$]*?SET search_path = public, pg_temp/gs)].map((m) => m[1]);
  assert.deepEqual(fns.sort(), ["entity_aliases_refuse_change", "entity_relations_refuse_cycle"]);
  for (const f of fns) assert.match(DDL, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${f}\\(\\) FROM PUBLIC;`));
});

test("propagation_events is append-only: no statement updates or deletes it", () => {
  assert.doesNotMatch(SQL, /UPDATE\s+public\.propagation_events/i);
  assert.doesNotMatch(SQL, /DELETE\s+FROM\s+public\.propagation_events/i);
  assert.doesNotMatch(SQL, /INSERT INTO public\.propagation_events/);
});

test("no row is written outside the rolled-back self-check (population is another lane)", () => {
  assert.ok(SELF_CHECK_START > 0, "self-check block located");
  assert.doesNotMatch(DDL, /INSERT INTO public\.(entities|entity_aliases|entity_relations)/);
  assert.match(SELF_CHECK, /INSERT INTO public\.entities/);
});

test("the self-check is rolled back by a sentinel, attacks each guard, and asserts nothing survives", () => {
  assert.match(SELF_CHECK, /RAISE EXCEPTION 'alias1_377_selfcheck_rollback'/);
  assert.match(SELF_CHECK, /IF SQLERRM <> 'alias1_377_selfcheck_rollback' THEN RAISE; END IF/);
  for (const phrase of [
    "entity_level was accepted on a non-organisation kind",
    "entity_level accepted a value outside group, legal_entity, operating_identity",
    "the two declared relations did not persist",
    "a self relation was accepted",
    "a direct reversal (a two-node cycle) was accepted",
    "a loop through the chain (a three-node cycle) was accepted",
    "an UPDATE that closes a loop was accepted",
    "two aliases with different assertors did not both persist",
    "two asserters of the same alias did not both persist",
    "a repeated assertion by the same asserter was accepted",
    "an alias insert changed the display name",
    "an alias UPDATE was accepted",
    "an alias DELETE was accepted",
    "an alias TRUNCATE was accepted",
    "an alias with uncollapsed whitespace was accepted",
    "an alias with an unknown alias_kind was accepted",
    "an alias with a blank asserted_by was accepted",
    "expected 3 entity_aliases outbox rows under the legal entity",
    "expected 1 entity_relations outbox row under the child legal entity",
    "authenticated could insert an alias",
    "authenticated could insert a relation",
    "service_role could update an alias",
    "left % propagation_events row(s) behind",
    "left a fixture entity behind",
  ]) assert.ok(SELF_CHECK.includes(phrase), phrase);
  assert.match(SELF_CHECK, /SET LOCAL ROLE authenticated/);
  assert.match(SELF_CHECK, /SET LOCAL ROLE service_role/);
});

test("runs inside one transaction", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});
