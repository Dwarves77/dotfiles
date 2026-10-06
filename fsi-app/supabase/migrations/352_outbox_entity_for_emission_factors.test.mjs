// 352_outbox_entity_for_emission_factors.test.mjs -- static proof of migration 352 (lane L4-D), by parsing the
// SQL file directly: no database, no SQL parser dependency. Same discipline as 346 and 348's tests. The
// behavioural proof is the migration's own self-check (a rolled-back TEMP fixture inside a DO block), which
// runs at apply time; this file proves the file says what the lane's report says it says.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./352_outbox_entity_for_emission_factors.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

test("header: subject line, states NOT APPLIED, names the two tables it leaves alone and why", () => {
  assert.match(RAW, /^-- subject: Migration 352 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /market_series\s+id, series_key, label/);
  assert.match(RAW, /regional_data_facts\s+region_id uuid REFERENCES regions/);
});

test("the function takes an optional second argument and records an entity only when an entities row exists", () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.emit_propagation_event\(\) RETURNS trigger/);
  assert.match(SQL, /TG_NARGS >= 2/);
  assert.match(SQL, /NOT EXISTS \(SELECT 1 FROM public\.entities e WHERE e\.entity_id = v_entity_id\)/);
  assert.match(SQL, /v_entity_id := coalesce\(v_new->>'entity_id', v_old->>'entity_id'\);/, "the existing rule is unchanged and runs first");
});

test("only emission_factors is re-attached, with corridor_id as the entity column; the other two tables are not touched", () => {
  const triggers = [...SQL.matchAll(/CREATE TRIGGER propagation_outbox_trg\s+AFTER INSERT OR UPDATE OR DELETE ON public\.([a-z_]+)\s+FOR EACH ROW EXECUTE FUNCTION public\.emit_propagation_event\(([^)]*)\)/g)];
  assert.deepEqual(triggers.map((m) => m[1]), ["emission_factors"]);
  assert.equal(triggers[0][2].replace(/\s+/g, ""), "'factor_id','corridor_id'");
  assert.doesNotMatch(SQL, /ON public\.(market_series|regional_data_facts)/);
});

test("propagation_events is append-only: no statement updates or deletes it, outside the function's own INSERT", () => {
  assert.doesNotMatch(SQL, /UPDATE\s+public\.propagation_events/i);
  assert.doesNotMatch(SQL, /DELETE\s+FROM\s+public\.propagation_events/i);
  assert.doesNotMatch(SQL, /TRUNCATE/i);
  assert.equal((SQL.match(/INSERT INTO public\.propagation_events/g) ?? []).length, 1);
});

test("the self-check is rolled back by a sentinel, attacks all four cases, and asserts nothing survives", () => {
  assert.match(SQL, /RAISE EXCEPTION 'l4d_352_selfcheck_rollback'/);
  assert.match(SQL, /IF SQLERRM <> 'l4d_352_selfcheck_rollback' THEN RAISE; END IF/);
  for (const phrase of ["a known corridor_id was not recorded", "an unknown corridor_id must leave entity_id NULL", "a NULL corridor_id must leave entity_id NULL", "a one-argument attachment must not resolve an entity", "left % propagation_events row(s) behind", "left a fixture entity behind"]) {
    assert.ok(SQL.includes(phrase), phrase);
  }
  assert.match(SQL, /tgnargs/);
});

test("the fixture trigger does not use the real trigger name, so outbox-table pin detectors see only emission_factors", () => {
  assert.match(SQL, /CREATE TRIGGER l4d_352_selfcheck_trg/);
});

test("runs inside one transaction", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});
