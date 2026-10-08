// 360_workspace_tag_attribution.test.mjs -- static proof of migration 360 (lane s8b-tag-attribution) by parsing
// the SQL file: no database, no SQL parser dependency. It proves the file is the no-new-column migration the
// header says it is (migration 313 already holds the author pair), checks the pair's shape and documents it, and
// leaves RLS and data alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./360_workspace_tag_attribution.sql", import.meta.url)), "utf8");
const M313 = readFileSync(fileURLToPath(new URL("./313_workspace_tags.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

test("header: subject line and NOT APPLIED", () => {
  assert.match(RAW, /^-- subject: Migration 360 /);
  assert.match(RAW, /NOT APPLIED/);
});

test("migration 313 really defines the author pair this migration relies on", () => {
  const join = /CREATE TABLE IF NOT EXISTS public\.item_workspace_tags \(([\s\S]*?)\n\);/.exec(M313)?.[1] ?? "";
  assert.match(join, /created_by\s+uuid REFERENCES public\.profiles\(id\) ON DELETE SET NULL/);
  assert.match(join, /created_at\s+timestamptz NOT NULL DEFAULT now\(\)/);
});

test("no column is added and nothing is rewritten: no ALTER TABLE, no DML, no policy or index change", () => {
  assert.doesNotMatch(SQL, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(SQL, /\b(INSERT|UPDATE|DELETE)\b\s+(INTO|public\.|FROM)/i);
  assert.doesNotMatch(SQL, /\bCREATE\s+(POLICY|INDEX|TABLE|TRIGGER)\b/i);
  assert.doesNotMatch(SQL, /\bDROP\b/i);
  assert.doesNotMatch(SQL, /applied_by|applied_at/, "no duplicate applied_by / applied_at column");
});

test("preconditions assert the join table and the exact author column shapes", () => {
  assert.match(SQL, /to_regclass\('public\.item_workspace_tags'\) IS NULL/);
  assert.match(SQL, /column_name = 'created_by' AND data_type = 'uuid' AND is_nullable = 'YES'/);
  assert.match(SQL, /column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO'/);
});

test("both columns are documented as the attribution, and the post-check reads the comments back", () => {
  assert.match(SQL, /COMMENT ON COLUMN public\.item_workspace_tags\.created_by IS/);
  assert.match(SQL, /COMMENT ON COLUMN public\.item_workspace_tags\.created_at IS/);
  assert.match(SQL, /col_description\(/);
});

test("transactional and idempotent in form", () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^\s*COMMIT;/m);
});
