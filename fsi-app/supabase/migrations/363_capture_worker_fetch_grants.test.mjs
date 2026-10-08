// 363_capture_worker_fetch_grants.test.mjs -- static proof of migration 363 (lane TOKEN-1) by parsing the SQL file:
// no database, no SQL parser dependency. The ATTACK (SET LOCAL ROLE anon, then authenticated, then call the function
// and require SQLSTATE 42501) runs in the migration's own self-check at apply time inside a rolled-back
// sub-transaction; this file proves the file carries the REVOKE/GRANT on the exact signature migration 256 created
// and carries that self-check.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("./363_capture_worker_fetch_grants.sql", import.meta.url)), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const M256 = readFileSync(fileURLToPath(new URL("./256_migration_homes_and_vault_capture_key.sql", import.meta.url)), "utf8");

test("header: subject line and NOT APPLIED", () => {
  assert.match(RAW, /^-- subject: Migration 363 /);
  assert.match(RAW, /NOT APPLIED/);
});

test("the signature is the one migration 256 created: capture_worker_fetch(uuid[]), SECURITY DEFINER", () => {
  assert.match(M256, /CREATE OR REPLACE FUNCTION public\.capture_worker_fetch\(queue_ids uuid\[\]\)[\s\S]*?SECURITY DEFINER/);
  assert.match(SQL, /public\.capture_worker_fetch\(uuid\[\]\)/);
});

test("REVOKE EXECUTE from PUBLIC, anon and authenticated; GRANT EXECUTE to service_role only", () => {
  assert.match(SQL, /REVOKE EXECUTE ON FUNCTION public\.capture_worker_fetch\(uuid\[\]\) FROM PUBLIC, anon, authenticated;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.capture_worker_fetch\(uuid\[\]\) TO service_role;/);
  assert.doesNotMatch(SQL, /GRANT[^;]*\b(anon|authenticated|PUBLIC)\b/);
});

test("the migration does not redefine the function body (no CREATE FUNCTION, no net.http call)", () => {
  assert.doesNotMatch(SQL, /CREATE (OR REPLACE )?FUNCTION/i);
  assert.doesNotMatch(SQL, /net\.http_/);
});

test("precondition: the function must exist or the migration aborts", () => {
  assert.match(SQL, /to_regprocedure\('public\.capture_worker_fetch\(uuid\[\]\)'\) IS NULL/);
});

test("self-check ATTACKS as anon and authenticated: a real call must raise insufficient_privilege (42501); rolled back", () => {
  assert.match(SQL, /SET LOCAL ROLE anon;/);
  assert.match(SQL, /SET LOCAL ROLE authenticated;/);
  assert.match(SQL, /PERFORM public\.capture_worker_fetch\(ARRAY\['00000000-0000-0000-0000-000000000000'::uuid\]\)/);
  assert.match(SQL, /EXCEPTION WHEN insufficient_privilege THEN/);
  assert.ok(SQL.includes("anon was able to call capture_worker_fetch"));
  assert.ok(SQL.includes("authenticated was able to call capture_worker_fetch"));
  assert.match(SQL, /RAISE EXCEPTION 'token1_363_selfcheck_rollback'/);
});

test("service_role is proved by has_function_privilege (a real call would perform the http egress), anon/authenticated/PUBLIC by privilege catalog too", () => {
  assert.match(SQL, /has_function_privilege\('service_role', 'public\.capture_worker_fetch\(uuid\[\]\)', 'EXECUTE'\)/);
  assert.match(SQL, /has_function_privilege\('anon', 'public\.capture_worker_fetch\(uuid\[\]\)', 'EXECUTE'\)/);
  assert.match(SQL, /has_function_privilege\('authenticated', 'public\.capture_worker_fetch\(uuid\[\]\)', 'EXECUTE'\)/);
  assert.match(SQL, /aclexplode/);
  assert.match(SQL, /a\.grantee = 0/);
});

test("no JWT literal and no section-sign or dash glyph in the new file", () => {
  assert.doesNotMatch(RAW, /eyJ/);
  const banned = [0xa7, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
  for (const g of banned) assert.ok(!RAW.includes(g), `glyph U+${g.charCodeAt(0).toString(16)} present`);
});
