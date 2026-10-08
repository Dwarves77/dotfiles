// 357_vocabulary_kinds.test.mjs -- static proof of migration 357 (lane G5-READ) by parsing the SQL file: no
// database, no SQL parser dependency. The ATTACK (a theme that is neither code nor adopted, a proposed term, a
// retired term refused; an adopted term, a code value and NULL accepted) runs in the migration's own self-check at
// apply time inside a rolled-back sub-transaction; this file proves the file carries it and the shape the readers rely on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DB_THEME_VALUE_LIST } from "../../src/lib/agent/metadata-vocab.ts";

const RAW = readFileSync(fileURLToPath(new URL("./357_vocabulary_kinds.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const FN = /CREATE OR REPLACE FUNCTION public\.intelligence_items_theme_guard\(\)[\s\S]*?\$fn\$;/.exec(SQL)?.[0] ?? "";

test("header: subject line and APPLIED", () => {
  assert.match(RAW, /^-- subject: Migration 357 /);
  assert.match(RAW, /APPLIED \(production ledger version \d+/);
});

test("preconditions name migration 355 (vocabulary_terms) and 282 (entity_kind)", () => {
  assert.match(SQL, /to_regclass\('public\.vocabulary_terms'\) IS NULL/);
  assert.match(SQL, /typname = 'entity_kind'/);
});

test("entity_kind gains material, idempotently", () => {
  assert.match(SQL, /ALTER TYPE public\.entity_kind ADD VALUE IF NOT EXISTS 'material'/);
});

test("the theme CHECK is dropped and replaced by an enabled BEFORE INSERT OR UPDATE guard trigger", () => {
  assert.match(SQL, /ALTER TABLE public\.intelligence_items DROP CONSTRAINT IF EXISTS intelligence_items_theme_check/);
  assert.match(SQL, /CREATE TRIGGER intelligence_items_theme_guard_trg\s+BEFORE INSERT OR UPDATE ON public\.intelligence_items/);
  assert.match(SQL, /WHEN \(NEW\.theme IS NOT NULL\)/);
});

test("guard function: the 7 code themes equal DB_THEME_VALUE_LIST, adopted theme terms by stored token, an unchanged theme never refused", () => {
  assert.ok(FN, "guard function not found");
  const listed = [...(/NEW\.theme IN \(([\s\S]*?)\)/.exec(FN)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, [...DB_THEME_VALUE_LIST].sort());
  assert.match(FN, /t\.kind = 'theme'/);
  assert.match(FN, /t\.status = 'adopted'/);
  assert.match(FN, /regexp_replace\(btrim\(t\.term_key\), '\\s\+', '_', 'g'\) = NEW\.theme/);
  assert.match(FN, /TG_OP = 'UPDATE' AND NEW\.theme IS NOT DISTINCT FROM OLD\.theme/);
  assert.match(FN, /ERRCODE = 'check_violation', CONSTRAINT = 'intelligence_items_theme_check'/);
});

test("guard function is SECURITY DEFINER with a pinned search_path and no PUBLIC execute", () => {
  assert.match(FN, /SECURITY DEFINER/);
  assert.match(FN, /SET search_path = public, pg_temp/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.intelligence_items_theme_guard\(\) FROM PUBLIC/);
});

test("self-check ATTACKS the guard on a temp table: neither, proposed and retired refused; adopted, code and NULL accepted; rolled back", () => {
  assert.match(SQL, /CREATE TEMP TABLE g5_theme_probe/);
  for (const token of ["g5_selfcheck_neither", "g5_selfcheck_proposed", "g5_selfcheck_retired", "g5_selfcheck_adopted"]) {
    assert.match(SQL, new RegExp(`theme = '${token}'`));
  }
  assert.match(SQL, /theme = 'fuels_saf'/);
  assert.match(SQL, /theme = NULL/);
  for (const abort of ["neither code nor adopted was accepted", "PROPOSED term token was accepted", "RETIRED term token was accepted", "ADOPTED term token was refused"]) {
    assert.ok(SQL.includes(abort), abort);
  }
  assert.match(SQL, /RAISE EXCEPTION 'g5_357_selfcheck_rollback'/);
});

test("the enum value is proved by pg_enum presence (it cannot be used in the transaction that adds it)", () => {
  assert.match(SQL, /e\.enumlabel = 'material'/);
});
