// 380_oem_roadmap_outbox_and_nullable_announced_at.test.mjs -- static proof of migration 380 (lane S8-E1), by parsing the
// SQL file directly: no database, no SQL parser dependency (same discipline as 352's test). The behavioural proof is the
// migration's own self-check (a rolled-back TEMP fixture inside a DO block), which runs at apply time; this file proves
// the file says what the lane report says it says, and that its fixture INSERT satisfies the live table definition.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, parseInserts, parseUpdates, checkFixtures, stripSql } from "./_lib/fixture-inserts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(fileURLToPath(new URL("./380_oem_roadmap_outbox_and_nullable_announced_at.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

test("header: subject line, states APPLIED with the ledger version, names the two changes and what it does not do", () => {
  assert.match(RAW, /^-- subject: Migration 380 /);
  assert.match(RAW, /^-- APPLIED \(production ledger version 20261009023604, as of 2026-10-09\)\./m);
  assert.doesNotMatch(RAW, /NOT APPLIED/);
  assert.match(RAW, /announced_at/);
  assert.match(RAW, /manufacturer_id/);
  assert.match(RAW, /No row is written, updated or deleted/);
});

test("the outbox trigger is attached to oem_tech_roadmaps and only to it, in 352's two-argument form (roadmap_id, manufacturer_id)", () => {
  const triggers = [...SQL.matchAll(/CREATE TRIGGER propagation_outbox_trg\s+AFTER INSERT OR UPDATE OR DELETE ON public\.([a-z_]+)\s+FOR EACH ROW EXECUTE FUNCTION public\.emit_propagation_event\(([^)]*)\)/g)];
  assert.deepEqual(triggers.map((m) => m[1]), ["oem_tech_roadmaps"]);
  assert.equal(triggers[0][2].replace(/\s+/g, ""), "'roadmap_id','manufacturer_id'");
  assert.match(SQL, /DROP TRIGGER IF EXISTS propagation_outbox_trg ON public\.oem_tech_roadmaps;/);
});

test("the function is not redefined here (352's body, or 373's superset, stays), and propagation_events is append-only", () => {
  assert.doesNotMatch(SQL, /CREATE (OR REPLACE )?FUNCTION/i);
  assert.doesNotMatch(SQL, /UPDATE\s+public\.propagation_events/i);
  assert.doesNotMatch(SQL, /DELETE\s+FROM\s+public\.propagation_events/i);
  assert.doesNotMatch(SQL, /TRUNCATE/i);
});

test("announced_at is made nullable and nothing else about the table's columns changes", () => {
  const alters = [...SQL.matchAll(/ALTER TABLE public\.oem_tech_roadmaps\s+([^;]+);/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  assert.deepEqual(alters, ["ALTER COLUMN announced_at DROP NOT NULL"]);
  assert.doesNotMatch(SQL, /\bUPDATE\s+public\.oem_tech_roadmaps\b/i);
  assert.doesNotMatch(SQL, /\b(INSERT INTO|DELETE FROM)\s+public\.oem_tech_roadmaps\b/i);
});

test("preconditions name the four migrations it needs, and refuse a function without 352's optional argument", () => {
  for (const m of ["296", "282", "284", "352"]) assert.match(RAW, new RegExp(`migration ${m}`));
  assert.match(SQL, /pg_get_functiondef\(p\.oid\) LIKE '%TG_NARGS%'/);
});

test("the self-check reads the real catalog, attacks both cases on a TEMP fixture, is rolled back by a sentinel, and asserts nothing survives", () => {
  assert.match(SQL, /t\.tgnargs/);
  assert.match(SQL, /a\.attnotnull/);
  assert.match(SQL, /CREATE TEMP TABLE s8e1_380_fixture .* ON COMMIT DROP/);
  assert.match(SQL, /RAISE EXCEPTION 's8e1_380_selfcheck_rollback'/);
  assert.match(SQL, /IF SQLERRM <> 's8e1_380_selfcheck_rollback' THEN RAISE; END IF/);
  for (const phrase of [
    "has % arguments, expected 2", "are not (roadmap_id, manufacturer_id)", "announced_at is still NOT NULL",
    "a known manufacturer_id was not recorded", "an unknown manufacturer_id must leave entity_id NULL",
    "left % propagation_events row(s) behind", "left a fixture entity behind",
  ]) assert.ok(SQL.includes(phrase), phrase);
});

test("the fixture trigger does not use the real trigger name, so outbox-table pin detectors see only oem_tech_roadmaps", () => {
  assert.match(SQL, /CREATE TRIGGER s8e1_380_selfcheck_trg/);
});

test("runs inside one transaction", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});

test("fixtures: the self-check's entities INSERT satisfies the table definition rebuilt from the migration tree below 380", () => {
  const text = stripSql(RAW);
  // The TEMP fixture table is created by the self-check itself, so it is not in the migration tree: it is excluded by the name the file
  // creates, and only that one.
  const temps = [...text.matchAll(/CREATE TEMP TABLE ([a-z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual(temps, ["s8e1_380_fixture"]);
  const inserts = parseInserts(text).filter((i) => !temps.includes(i.table));
  assert.deepEqual(inserts.map((i) => i.table), ["entities"], "the parser sees the entities fixture insert and nothing else");
  assert.deepEqual(checkFixtures({ inserts, updates: parseUpdates(text), schema: buildSchema(HERE, { before: 380 }) }), []);
});
