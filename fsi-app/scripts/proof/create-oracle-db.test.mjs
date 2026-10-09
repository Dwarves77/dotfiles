/** Tests for scripts/proof/create-oracle-db.mjs (lane PROOF-1, rewritten by PROOF-6): the oracle is a second
 *  container of the stack's own image. Fake docker, fake psql and a no-op sleep. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stackImage, resolveInputs, startOracle, ORACLE_CONTAINER, READY_ROLES, READY_QUERY } from "./create-oracle-db.mjs";
import { ORACLE_PORT } from "./write-local-env.mjs";

const STACK = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ORACLE = `postgresql://supabase_admin:postgres@127.0.0.1:${ORACLE_PORT}/postgres`;
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.054";
const noSleep = async () => {};

test("stackImage reads the running stack's database image from docker ps and never types a tag", () => {
  let args;
  const r = stackImage({ spawn: (bin, a) => { args = [bin, ...a]; return { status: 0, stdout: `${IMAGE}\n`, stderr: "" }; } });
  assert.deepEqual(r, { image: IMAGE });
  assert.deepEqual(args, ["docker", "ps", "--filter", "name=supabase_db_", "--format", "{{.Image}}"]);
});

test("stackImage: no running supabase_db_ container, or docker failing, is an error, never a default image", () => {
  assert.match(stackImage({ spawn: () => ({ status: 0, stdout: "\n", stderr: "" }) }).error, /no running supabase_db_ container/);
  assert.match(stackImage({ spawn: () => ({ status: 1, stdout: "", stderr: "cannot connect to the docker daemon" }) }).error, /docker ps failed/);
});

test("resolveInputs: the oracle URL must be supabase_admin, database postgres, loopback, on another port than the stack", () => {
  const ok = resolveInputs({ env: { PROOF_DB_URL: STACK, PROOF_ORACLE_DB_URL: ORACLE } });
  assert.deepEqual(ok, { password: "postgres", port: String(ORACLE_PORT) });
});

test("resolveInputs: ATTACK: an absent URL, a remote host, the wrong role, another database and the stack's own port are refused by name", () => {
  assert.match(resolveInputs({ env: { PROOF_ORACLE_DB_URL: ORACLE } }).error, /PROOF_DB_URL is not set/);
  assert.match(resolveInputs({ env: { PROOF_DB_URL: STACK } }).error, /PROOF_ORACLE_DB_URL is not set/);
  assert.match(resolveInputs({ env: { PROOF_DB_URL: STACK, PROOF_ORACLE_DB_URL: "postgresql://supabase_admin:p@db.example.com:5432/postgres" } }).error, /^PROOF_ORACLE_DB_URL: .*loopback/);
  assert.match(resolveInputs({ env: { PROOF_DB_URL: STACK, PROOF_ORACLE_DB_URL: `postgresql://postgres:postgres@127.0.0.1:${ORACLE_PORT}/postgres` } }).error, /supabase_admin role/);
  assert.match(resolveInputs({ env: { PROOF_DB_URL: STACK, PROOF_ORACLE_DB_URL: `postgresql://supabase_admin:postgres@127.0.0.1:${ORACLE_PORT}/oracle_check` } }).error, /database postgres/);
  assert.match(resolveInputs({ env: { PROOF_DB_URL: STACK, PROOF_ORACLE_DB_URL: "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres" } }).error, /port other than the stack's/);
});

test("startOracle runs the stack's image on the oracle port, loopback-published, then waits for every role the dump names", async () => {
  const calls = [];
  let psqlCalls = 0;
  const spawn = (bin, args) => {
    calls.push([bin, ...args]);
    if (bin === "docker") return { status: 0, stdout: "abc123\n", stderr: "" };
    psqlCalls++;
    return psqlCalls < 3 ? { status: 2, stdout: "", stderr: "psql: error: connection refused" } : { status: 0, stdout: `${READY_ROLES.length}\n`, stderr: "" };
  };
  const r = await startOracle({ oracleUrl: ORACLE, password: "postgres", port: String(ORACLE_PORT), image: IMAGE, spawn, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 3);
  assert.deepEqual(calls[0], ["docker", "run", "-d", "--name", ORACLE_CONTAINER, "-e", "POSTGRES_PASSWORD=postgres", "-p", `127.0.0.1:${ORACLE_PORT}:5432`, IMAGE]);
  assert.deepEqual(calls[1].slice(0, 5), ["psql", ORACLE, "-X", "-At", "-c"]);
  assert.equal(calls[1][5], READY_QUERY);
  for (const role of ["postgres", "anon", "authenticated", "service_role", "supabase_admin"]) assert.ok(READY_ROLES.includes(role), role);
});

test("startOracle: a container that never creates all the roles is NOT ready (a partial init is red)", async () => {
  const spawn = (bin) => (bin === "docker" ? { status: 0, stdout: "x", stderr: "" } : { status: 0, stdout: "3\n", stderr: "" });
  const r = await startOracle({ oracleUrl: ORACLE, password: "postgres", port: String(ORACLE_PORT), image: IMAGE, attempts: 3, spawn, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.message, /not ready after 3 attempts/);
});

test("startOracle: a failed docker run is red, with the password masked", async () => {
  const r = await startOracle({ oracleUrl: ORACLE, password: "s3cret", port: String(ORACLE_PORT), image: IMAGE, spawn: () => ({ status: 125, stdout: "", stderr: "docker: Error response from daemon: s3cret conflict" }), sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.message, /could not start chain-proof-oracle/);
  assert.ok(!r.message.includes("s3cret"));
});

test("ATTACK: startOracle refuses a non-loopback oracle URL before docker is ever called", async () => {
  let called = false;
  await assert.rejects(() => startOracle({ oracleUrl: "postgresql://supabase_admin:p@db.abcdefghijklmnop.supabase.co:5432/postgres", password: "p", port: "5432", image: IMAGE, spawn: () => { called = true; return {}; }, sleep: noSleep }), /loopback/);
  assert.equal(called, false);
});

test("the CLI exits 2 naming the variable when an oracle URL is absent, before any docker call", () => {
  const script = fileURLToPath(new URL("./create-oracle-db.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", env: { PATH: process.env.PATH, PROOF_DB_URL: STACK } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /PROOF_ORACLE_DB_URL is not set/);
});
