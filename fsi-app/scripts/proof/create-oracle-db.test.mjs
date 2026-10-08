/** Tests for scripts/proof/create-oracle-db.mjs (lane PROOF-1, amended by PROOF-5). Fake psql and a no-op sleep. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withDatabase, createOracleDb, resolveInputs, ORACLE_DB } from "./create-oracle-db.mjs";

const SUPERUSER = "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres";
const ORDINARY = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const noSleep = async () => {};

test("withDatabase swaps only the database name", () => {
  assert.equal(withDatabase(ORDINARY, ORACLE_DB), "postgresql://postgres:postgres@127.0.0.1:54322/oracle_check");
});

test("it connects to template1, not the template database, and runs terminate, drop, create as three separate -c statements in order, with ON_ERROR_STOP", async () => {
  let seen;
  const r = await createOracleDb({ superuserUrl: SUPERUSER, spawn: (bin, args) => { seen = args; return { status: 0 }; }, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.match(seen[0], /\/template1$/);
  assert.ok(seen.join(" ").includes("ON_ERROR_STOP=1"));
  assert.equal(seen[seen.indexOf("-v") + 1], "ON_ERROR_STOP=1");
  // PROOF-5b: DROP DATABASE cannot run inside a transaction block, and one -c string is ONE implicit transaction.
  const statements = seen.flatMap((a, i) => (a === "-c" ? [seen[i + 1]] : []));
  assert.equal(statements.length, 3);
  assert.match(statements[0], /^select pg_terminate_backend/);
  assert.match(statements[1], /^drop database if exists oracle_check/);
  assert.match(statements[2], /^create database oracle_check template postgres/);
  for (const s of statements) assert.equal((s.match(/;/g) ?? []).length <= 1, true, "each -c carries a single statement");
  assert.ok(statements.every((s) => !s.includes("\n")), "no statement is a multi-statement script");
});

test("it retries and succeeds when a service reconnects on the first attempt", async () => {
  let n = 0;
  const r = await createOracleDb({ superuserUrl: SUPERUSER, spawn: () => (++n < 3 ? { status: 1, stderr: "ERROR: source database \"postgres\" is being accessed by other users" } : { status: 0 }), sleep: noSleep });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 3);
});

test("it fails by name after the attempts are used, redacting any connection string", async () => {
  const r = await createOracleDb({ superuserUrl: SUPERUSER, attempts: 2, spawn: () => ({ status: 1, stderr: "failed postgresql://supabase_admin:postgres@127.0.0.1:54322/template1" }), sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.message, /could not create oracle_check after 2 attempts/);
  assert.ok(!r.message.includes("supabase_admin:postgres"));
});

test("ATTACK: a non-loopback superuser URL is refused before psql is called", async () => {
  let called = false;
  await assert.rejects(() => createOracleDb({ superuserUrl: "postgresql://supabase_admin:pw@db.abcdefghijklmnop.supabase.co:5432/postgres", spawn: () => { called = true; return { status: 0 }; }, sleep: noSleep }), /loopback/);
  assert.equal(called, false);
});

test("PROOF-5: the URL passed to psql carries the superuser role, on template1", async () => {
  let seen;
  await createOracleDb({ superuserUrl: SUPERUSER, spawn: (bin, args) => { seen = args; return { status: 0 }; }, sleep: noSleep });
  const u = new URL(seen[0]);
  assert.equal(u.username, "supabase_admin");
  assert.equal(u.pathname, "/template1");
});

test("PROOF-5: resolveInputs takes the psql URL from the superuser variable and the oracle URL from the ordinary role", () => {
  const r = resolveInputs({ envFile: "unused.env", env: { PROOF_DB_URL: ORDINARY, PROOF_DB_SUPERUSER_URL: SUPERUSER } });
  assert.equal(r.superuserUrl, SUPERUSER);
  assert.equal(r.oracleUrl, "postgresql://postgres:postgres@127.0.0.1:54322/oracle_check");
  assert.equal(new URL(r.oracleUrl).username, "postgres");
});

test("PROOF-5: a missing PROOF_DB_SUPERUSER_URL or PROOF_DB_URL is refused by name", () => {
  assert.match(resolveInputs({ envFile: "unused.env", env: { PROOF_DB_URL: ORDINARY } }).error, /PROOF_DB_SUPERUSER_URL is not set/);
  assert.match(resolveInputs({ envFile: "unused.env", env: { PROOF_DB_SUPERUSER_URL: SUPERUSER } }).error, /PROOF_DB_URL is not set/);
  assert.match(resolveInputs({ envFile: null, env: {} }).error, /--env-file/);
});

test("PROOF-5: ATTACK: a non-loopback superuser URL is refused by resolveInputs, naming the variable", () => {
  const r = resolveInputs({ envFile: "unused.env", env: { PROOF_DB_URL: ORDINARY, PROOF_DB_SUPERUSER_URL: "postgresql://supabase_admin:pw@db.abcdefghijklmnop.supabase.co:5432/postgres" } });
  assert.match(r.error, /^PROOF_DB_SUPERUSER_URL: .*loopback/);
});

test("PROOF-5: the CLI exits 2 naming the variable when the superuser URL is absent, before any psql call", () => {
  // node itself reads any --env-file argument, so the file must exist (an empty one).
  const dir = mkdtempSync(join(tmpdir(), "create-oracle-db-test-"));
  try {
    const envFile = join(dir, "empty.env");
    writeFileSync(envFile, "");
    const script = fileURLToPath(new URL("./create-oracle-db.mjs", import.meta.url));
    const r = spawnSync(process.execPath, [script, "--env-file", envFile], { encoding: "utf8", env: { PATH: process.env.PATH, PROOF_DB_URL: ORDINARY } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /PROOF_DB_SUPERUSER_URL is not set/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
