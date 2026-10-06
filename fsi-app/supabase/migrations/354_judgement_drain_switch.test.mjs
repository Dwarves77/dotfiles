// 354_judgement_drain_switch.test.mjs -- static proof of migration 354 (lane G6-DRAIN) by parsing the SQL
// file: no database, no SQL parser dependency. The attack on the guard runs in the migration's own
// self-check at apply time; this file proves the file carries it, the CHECK, and that the RPC is the only
// writer (the guard bounces every change that lacks the RPC's own marker).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./354_judgement_drain_switch.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

test("header: subject line, NOT APPLIED, the switch stays off", () => {
  assert.match(RAW, /^-- subject: Migration 354 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /STAYS 'off'/);
});

test("the column is text NOT NULL DEFAULT 'off' with a CHECK on off|on", () => {
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS judgement_drain text NOT NULL DEFAULT 'off'/);
  assert.match(SQL, /CHECK \(judgement_drain IN \('off', 'on'\)\)/);
});

test("the guard bounces an unmarked change and audits a marked one in system_state_flag_audit", () => {
  assert.match(SQL, /current_setting\('app\.judgement_drain_writer', true\)/);
  assert.match(SQL, /ERRCODE = 'insufficient_privilege'/);
  assert.match(SQL, /INSERT INTO public\.system_state_flag_audit\(changed_by, column_name, old_value, new_value\)\s+VALUES \(marker, 'judgement_drain'/);
  assert.match(SQL, /CREATE TRIGGER guard_judgement_drain_writer_trg\s+BEFORE UPDATE ON public\.system_state/);
});

test("the RPC is the only writer: it alone sets the marker, validates the state, and is granted to service_role", () => {
  const setters = SQL.match(/set_config\('app\.judgement_drain_writer'/g) ?? [];
  // one in the RPC, two in the self-check fixture (the CHECK attack, and the marked green leg)
  assert.equal(setters.length, 3);
  const rpc = /CREATE OR REPLACE FUNCTION public\.admin_set_judgement_drain\(([\s\S]*?)\$fn\$;/.exec(SQL)[0];
  assert.match(rpc, /set_config\('app\.judgement_drain_writer'/);
  assert.match(rpc, /p_state NOT IN \('off', 'on'\)/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.admin_set_judgement_drain\(text, text\) TO service_role/);
  assert.doesNotMatch(SQL, /GRANT EXECUTE[^;]*TO (anon|authenticated|public)/i);
});

test("the pause RPC's marker is never reused: the two writers do not share a marker", () => {
  const body = /CREATE OR REPLACE FUNCTION public\.admin_set_judgement_drain[\s\S]*?\$fn\$;/.exec(SQL)[0];
  assert.doesNotMatch(body, /app\.pause_flag_writer/);
  const guard = /CREATE OR REPLACE FUNCTION public\.guard_judgement_drain_writer[\s\S]*?\$fn\$;/.exec(SQL)[0];
  assert.doesNotMatch(guard, /app\.pause_flag_writer/);
});

test("migration 201's guard is not redefined (its proof script keeps a valid two-column probe)", () => {
  assert.doesNotMatch(SQL, /CREATE OR REPLACE FUNCTION public\.guard_pause_flag_writer/);
  assert.doesNotMatch(SQL, /CREATE OR REPLACE FUNCTION public\.admin_set_pause_state/);
});

test("ATTACK in the self-check: unmarked, wrong-marker and out-of-range are refused, marked passes, and it rolls back", () => {
  assert.match(SQL, /the judgement drain guard let an unmarked UPDATE through/);
  assert.match(SQL, /the pause-flag marker opened the judgement drain guard/);
  assert.match(SQL, /the judgement_drain CHECK let an out-of-range value through/);
  assert.match(SQL, /the judgement drain guard refused a marked, in-range UPDATE/);
  assert.match(SQL, /RAISE EXCEPTION 'g6_354_selfcheck_rollback'/);
  assert.match(SQL, /IF SQLERRM <> 'g6_354_selfcheck_rollback' THEN RAISE; END IF/);
  assert.match(SQL, /ON COMMIT DROP/);
});

test("the self-check never writes the live row: no UPDATE of public.system_state outside the RPC", () => {
  const updates = SQL.match(/UPDATE\s+public\.system_state\b/g) ?? [];
  assert.equal(updates.length, 1); // the RPC body
});

test("runs inside one transaction", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});

test("self-check: the marker is set after the last exception sub-block and immediately before the marked UPDATE (a handler rolls a transaction-local set_config back)", () => {
  const check = SQL.slice(SQL.indexOf("DO $$"));
  const lastHandler = check.lastIndexOf("EXCEPTION WHEN check_violation");
  const greenUpdate = check.indexOf("UPDATE g6_354_fixture SET judgement_drain = 'on';", lastHandler);
  assert.ok(lastHandler > 0 && greenUpdate > lastHandler, "the green UPDATE follows the last exception sub-block");
  const markers = [...check.matchAll(/set_config\('app\.judgement_drain_writer'/g)].map((m) => m.index);
  const before = markers.filter((i) => i < greenUpdate).pop();
  assert.ok(before !== undefined && before > check.indexOf("END;", lastHandler), "a marker set_config sits between the last sub-block's END and the green UPDATE");
  // and nothing that could roll it back sits between that set_config and the green UPDATE
  const between = check.slice(before, greenUpdate);
  assert.doesNotMatch(between, /EXCEPTION WHEN/);
  assert.doesNotMatch(between, /\bBEGIN\b/);
});

test("self-check: the CHECK attack no longer relies on a marker set inside its own sub-block surviving it", () => {
  const attack3 = /-- Attack 3[\s\S]*?END;/.exec(RAW)[0];
  assert.match(attack3, /set_config\('app\.judgement_drain_writer'/); // needed so the CHECK, not the guard, is what refuses
  const after = RAW.slice(RAW.indexOf(attack3) + attack3.length);
  assert.match(after.split("UPDATE g6_354_fixture SET judgement_drain = 'on'")[0], /set_config\('app\.judgement_drain_writer'/);
});
