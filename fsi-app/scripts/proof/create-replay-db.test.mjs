/** Tests for scripts/proof/create-replay-db.mjs (lane PROOF-1). Fake psql and a no-op sleep. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withDatabase, createReplayDb, REPLAY_DB } from "./create-replay-db.mjs";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const noSleep = async () => {};

test("withDatabase swaps only the database name", () => {
  assert.equal(withDatabase(ADMIN, REPLAY_DB), "postgresql://postgres:postgres@127.0.0.1:54322/replay_check");
});

test("it connects to template1, not the template database, and runs terminate, drop, create in one script", async () => {
  let seen;
  const r = await createReplayDb({ adminUrl: ADMIN, spawn: (bin, args) => { seen = args; return { status: 0 }; }, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.match(seen[0], /\/template1$/);
  const sql = seen[seen.indexOf("-c") + 1];
  assert.match(sql, /pg_terminate_backend/);
  assert.match(sql, /create database replay_check template postgres/);
});

test("it retries and succeeds when a service reconnects on the first attempt", async () => {
  let n = 0;
  const r = await createReplayDb({ adminUrl: ADMIN, spawn: () => (++n < 3 ? { status: 1, stderr: "ERROR: source database \"postgres\" is being accessed by other users" } : { status: 0 }), sleep: noSleep });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 3);
});

test("it fails by name after the attempts are used, redacting any connection string", async () => {
  const r = await createReplayDb({ adminUrl: ADMIN, attempts: 2, spawn: () => ({ status: 1, stderr: "failed postgresql://postgres:postgres@127.0.0.1:54322/template1" }), sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.message, /could not create replay_check after 2 attempts/);
  assert.ok(!r.message.includes("postgres:postgres"));
});

test("ATTACK: a non-loopback admin URL is refused before psql is called", async () => {
  let called = false;
  await assert.rejects(() => createReplayDb({ adminUrl: "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres", spawn: () => { called = true; return { status: 0 }; }, sleep: noSleep }), /loopback/);
  assert.equal(called, false);
});
