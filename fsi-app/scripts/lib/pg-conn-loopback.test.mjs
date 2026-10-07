/** Tests for the loopback mode of scripts/lib/pg-conn.mjs (lane PROOF-1, ruling R2, 2026-10-07).
 *
 *  The chain-proof job runs the repo's own scripts against a disposable local database. The one way that
 *  can reach production is the resolver's fall-through: when the first candidate fails, connectPg() tries
 *  candidates derived from NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD (the direct host and eight regional
 *  poolers). A local stack that refuses a connection would then silently send the audits to production.
 *  Loopback mode closes that: when CHAIN_PROOF_LOCAL=1, or the first explicit URL is loopback, the candidate
 *  list holds loopback URLs ONLY, whatever else is in the env, and the connection carries no TLS.
 *
 *  NO-NPM LANE: pg-conn.mjs loads `pg` lazily inside connectPg(), so this file imports nothing from npm. The
 *  namespace import keeps the proof semantic: against the old module the behaviour assertions fail (they do
 *  not merely fail to link). */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as conn from "./pg-conn.mjs";

const PROD = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  SUPABASE_DB_PASSWORD: "production-password",
};
const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test("CHAIN_PROOF_LOCAL=1 with a production password present: the candidates are loopback only", () => {
  const c = conn.candidateConnStrings({ CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: LOCAL_URL, ...PROD });
  assert.deepEqual(c, [LOCAL_URL]);
  for (const s of c) assert.ok(!/supabase\.co|pooler\.supabase\.com/.test(s), "a production candidate leaked in");
});

test("CHAIN_PROOF_LOCAL=1 with no local URL yields no candidates, never a derived production one", () => {
  assert.deepEqual(conn.candidateConnStrings({ CHAIN_PROOF_LOCAL: "1", ...PROD }), []);
});

test("CHAIN_PROOF_LOCAL=1 drops an explicit non-loopback URL and keeps the loopback one", () => {
  const c = conn.candidateConnStrings({
    CHAIN_PROOF_LOCAL: "1",
    SUPABASE_DB_URL: "postgresql://postgres:x@db.abcdefghijklmnop.supabase.co:5432/postgres",
    DATABASE_URL: LOCAL_URL,
    ...PROD,
  });
  assert.deepEqual(c, [LOCAL_URL]);
});

test("without the flag, a loopback first URL switches loopback mode on (localhost and 127.0.0.1)", () => {
  for (const u of [LOCAL_URL, "postgresql://postgres:postgres@localhost:54322/postgres"]) {
    assert.deepEqual(conn.candidateConnStrings({ SUPABASE_DB_URL: u, ...PROD }), [u]);
  }
});

test("without the flag and with a production first URL, resolution is unchanged (fall-through kept)", () => {
  const c = conn.candidateConnStrings({ SUPABASE_DB_URL: "postgresql://a:b@h1:5432/db", ...PROD });
  assert.equal(c[0], "postgresql://a:b@h1:5432/db");
  assert.ok(c.length >= 9, "derived production candidates must still exist outside loopback mode");
});

test("isLoopbackHost accepts the loopback names only", () => {
  for (const h of ["127.0.0.1", "localhost", "::1", "[::1]", "LOCALHOST"]) assert.equal(conn.isLoopbackHost(h), true, h);
  for (const h of ["db.abcdefghijklmnop.supabase.co", "10.0.0.5", "127.0.0.1.evil.example", "", null, undefined]) {
    assert.equal(conn.isLoopbackHost(h), false, String(h));
  }
});

test("connection options: no TLS to loopback, the existing relaxed TLS to anything else", () => {
  assert.equal(conn.connectOptionsFor(LOCAL_URL).ssl, false);
  assert.deepEqual(conn.connectOptionsFor("postgresql://a:b@h1:5432/db").ssl, { rejectUnauthorized: false });
  assert.equal(conn.connectOptionsFor(LOCAL_URL).connectionString, LOCAL_URL);
});

test("connectPg in loopback mode never attempts a production host, even when the local connection fails", async () => {
  const attempts = [];
  const createClient = (opts) => ({
    connect: async () => { attempts.push(opts); throw new Error("connection refused"); },
    end: async () => {},
  });
  const got = await conn.connectPg({
    env: { CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: LOCAL_URL, ...PROD },
    createClient,
  });
  assert.equal(got, null);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].connectionString, LOCAL_URL);
  assert.equal(attempts[0].ssl, false);
});

test("connectPg returns the first client that connects", async () => {
  const createClient = (opts) => ({ opts, connect: async () => {}, end: async () => {} });
  const got = await conn.connectPg({ env: { CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: LOCAL_URL }, createClient });
  assert.equal(got.opts.connectionString, LOCAL_URL);
});
