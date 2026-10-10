/** Tests for scripts/proof/apply-schema-dump.mjs (lane PROOF-1, rewritten by PROOF-6), with a fake psql. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { psqlArgs, assertOracleUrl, collectErrors, missingRole, buildReport, applySchemaDump } from "./apply-schema-dump.mjs";

const ORACLE = "postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres";
const STACK = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test("psqlArgs: the dump file itself is applied with ON_ERROR_STOP=1, no sanitized copy", () => {
  const a = psqlArgs(ORACLE, "/d/dump.sql");
  assert.deepEqual(a, [ORACLE, "-X", "-v", "ON_ERROR_STOP=1", "-f", "/d/dump.sql"]);
});

test("collectErrors reads psql ERROR lines with their line numbers", () => {
  const e = collectErrors("psql:/x/d.sql:12: ERROR:  role \"reconciler\" does not exist\npsql:/x/d.sql:30: NOTICE:  fine\npsql:/x/d.sql:44: ERROR:  syntax error at or near \"x\"");
  assert.deepEqual(e.map((x) => x.line), [12, 44]);
});

test("missingRole names the role in a 'does not exist' error and nothing else", () => {
  assert.equal(missingRole('role "reconciler" does not exist'), "reconciler");
  assert.equal(missingRole('relation "x" does not exist'), null);
});

test("buildReport: any error is red, a missing role is named, no table is red", () => {
  const base = { startedAt: "a", finishedAt: "b" };
  assert.equal(buildReport({ ...base, errors: [], publicTables: 3 }).ok, true);
  assert.equal(buildReport({ ...base, errors: [], publicTables: 0 }).ok, false);
  assert.equal(buildReport({ ...base, errors: [{ line: 1, message: "boom" }], publicTables: 3 }).ok, false);
  const r = buildReport({ ...base, errors: [{ line: 6, message: 'role "reconciler" does not exist' }], publicTables: 3 });
  assert.equal(r.ok, false, "PROOF-6: a role the dump names that the image lacks is red, no longer tolerated");
  assert.deepEqual(r.missing_roles, ["reconciler"]);
  assert.equal(r.role_errors, 1);
  assert.equal(r.fatal_errors, 1);
});

function fakeSpawn({ stderr = "", status = 0, tables = "2", error = null } = {}) {
  const calls = [];
  const spawn = (_bin, args) => {
    calls.push(args);
    if (args.includes("-c")) return { status: 0, stdout: `${tables}\n`, stderr: "" };
    return { status, stdout: "", stderr, error };
  };
  return { calls, spawn };
}

test("applySchemaDump applies the dump file with ON_ERROR_STOP=1 and reads back the table count", () => {
  const f = fakeSpawn();
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", spawn: f.spawn });
  assert.equal(r.ok, true);
  assert.equal(r.public_tables, 2);
  assert.ok(f.calls[0].includes("ON_ERROR_STOP=1"));
  assert.ok(!f.calls[0].includes("ON_ERROR_STOP=0"));
  assert.equal(f.calls[0][f.calls[0].indexOf("-f") + 1], "/d.sql", "the dump itself, not a stripped copy");
});

test("ATTACK: a missing role in the dump fails the report and names the role; it is never stripped or tolerated", () => {
  const f = fakeSpawn({ stderr: 'psql:x:6: ERROR:  role "reconciler" does not exist\n', status: 3 });
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", spawn: f.spawn });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing_roles, ["reconciler"]);
});

test("a fatal error in the apply fails the report and is listed", () => {
  const f = fakeSpawn({ stderr: 'psql:x:9: ERROR:  type "foo" does not exist\n', status: 3 });
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", spawn: f.spawn });
  assert.equal(r.ok, false);
  assert.equal(r.fatal_errors, 1);
  assert.equal(r.errors[0].line, 9);
});

test("ATTACK: a psql that exits non-zero with no ERROR line (a refused connection) is red", () => {
  const f = fakeSpawn({ stderr: "psql: error: connection to server at 127.0.0.1, port 54399 failed: Connection refused\n", status: 2, tables: "" });
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", spawn: f.spawn });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /psql exited with status 2/);
});

test("assertOracleUrl accepts exactly the supabase_admin / postgres / loopback / other-port shape", () => {
  assert.doesNotThrow(() => assertOracleUrl(ORACLE, STACK));
});

test("ATTACK: the stack's own URL (the replayed database), another role, another database and a remote host are all refused", () => {
  assert.throws(() => assertOracleUrl("postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres", STACK), /stack's own database/);
  assert.throws(() => assertOracleUrl(STACK, STACK), /supabase_admin role/);
  assert.throws(() => assertOracleUrl("postgresql://authenticated:x@127.0.0.1:54399/postgres", STACK), /supabase_admin role/);
  assert.throws(() => assertOracleUrl("postgresql://anon:x@127.0.0.1:54399/postgres", STACK), /supabase_admin role/);
  assert.throws(() => assertOracleUrl("postgresql://supabase_admin:x@127.0.0.1:54399/oracle_check", STACK), /database postgres/);
  assert.throws(() => assertOracleUrl("postgresql://supabase_admin:pw@db.abcdefghijklmnop.supabase.co:5432/postgres", STACK), /loopback/);
});

test("ATTACK: a non-loopback database URL is refused before psql is ever run", () => {
  let ran = false;
  assert.throws(() => applySchemaDump({ dbUrl: "postgresql://supabase_admin:pw@db.abcdefghijklmnop.supabase.co:5432/postgres", dumpPath: "/d.sql", spawn: () => { ran = true; return {}; } }), /loopback/);
  assert.equal(ran, false);
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS ───────────────────────────
test("GATE-9 exit status: apply-schema-dump.mjs exits 2 when --in or --report is missing, with no oracle URL, for a non-loopback URL and for the stack's own URL", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { withoutCredentials } = await import("../lib/env-file.mjs");
  const script = fileURLToPath(new URL("./apply-schema-dump.mjs", import.meta.url));
  const env = { ...withoutCredentials(), PROOF_DB_URL: "", PROOF_ORACLE_DB_URL: "", SUPABASE_DB_URL: "" };
  const run = (extraEnv, ...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8", env: { ...env, ...extraEnv } });
  assert.equal(run({}).status, 2);
  assert.equal(run({}, "--in", "dump.sql", "--report", "r.json").status, 2, "no oracle URL (and the stack's PROOF_DB_URL is never a fallback)");
  assert.equal(run({ PROOF_DB_URL: STACK }, "--in", "dump.sql", "--report", "r.json").status, 2, "PROOF_DB_URL alone is not an oracle URL");
  assert.equal(run({}, "--in", "dump.sql", "--report", "r.json", "--db-url", "postgresql://supabase_admin:p@db.example.com:5432/postgres").status, 2, "a non-loopback URL is refused");
  assert.equal(run({ PROOF_DB_URL: STACK }, "--in", "dump.sql", "--report", "r.json", "--db-url", "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres").status, 2, "the stack's own port is refused");
});

// ── lane PROOF-7 (2026-10-09): the roles file is applied first, as supabase_admin, ON_ERROR_STOP=1 ─────────────
// chain-proof fire 6: the dump apply failed with exactly one error, role "reconciler" does not exist.
function rolesSpawn({ rolesStderr = "", rolesStatus = 0, dumpStderr = "", dumpStatus = 0, tables = "2" } = {}) {
  const calls = [];
  const spawn = (_bin, args) => {
    calls.push(args);
    if (args.includes("-c")) return { status: 0, stdout: `${tables}\n`, stderr: "" };
    if (args.includes("/r.sql")) return { status: rolesStatus, stdout: "", stderr: rolesStderr };
    return { status: dumpStatus, stdout: "", stderr: dumpStderr };
  };
  return { calls, spawn };
}

test("PROOF-7: with a roles file, psql applies it FIRST (ON_ERROR_STOP=1), then the dump; both are the files themselves", () => {
  const f = rolesSpawn();
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", rolesPath: "/r.sql", spawn: f.spawn });
  assert.equal(r.ok, true);
  assert.equal(r.roles_applied, true);
  assert.equal(r.roles_errors, 0);
  assert.equal(f.calls[0][f.calls[0].indexOf("-f") + 1], "/r.sql", "the roles file is the first psql run");
  assert.equal(f.calls[1][f.calls[1].indexOf("-f") + 1], "/d.sql");
  for (const c of [f.calls[0], f.calls[1]]) assert.ok(c.includes("ON_ERROR_STOP=1") && !c.includes("ON_ERROR_STOP=0"));
});

test("PROOF-7 ATTACK: an error applying the roles file is red, is reported as a roles error, and the dump is NOT applied", () => {
  const f = rolesSpawn({ rolesStderr: 'psql:/r.sql:3: ERROR:  role "worker_ro" already exists\n', rolesStatus: 3 });
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", rolesPath: "/r.sql", spawn: f.spawn });
  assert.equal(r.ok, false);
  assert.equal(r.roles_applied, false);
  assert.equal(r.roles_errors, 1);
  assert.equal(f.calls.filter((c) => c.includes("/d.sql")).length, 0, "the dump apply must not run after a failed roles apply");
});

test("PROOF-7 ATTACK (the missing_roles check stays): a dump naming a role absent from the roles file is red and names the role", () => {
  const f = rolesSpawn({ dumpStderr: 'psql:/d.sql:14063: ERROR:  role "reconciler" does not exist\n', dumpStatus: 3 });
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", rolesPath: "/r.sql", spawn: f.spawn });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing_roles, ["reconciler"]);
  assert.equal(r.roles_applied, true);
});

test("PROOF-7 ATTACK: a psql that exits non-zero with no ERROR line on the roles file (refused connection) is red", () => {
  const f = rolesSpawn({ rolesStderr: "psql: error: connection to server failed: Connection refused\n", rolesStatus: 2 });
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", rolesPath: "/r.sql", spawn: f.spawn });
  assert.equal(r.ok, false);
  assert.equal(r.roles_errors, 1);
});

test("PROOF-7: without a roles file the report says no roles were applied (the earlier contract is unchanged)", () => {
  const f = rolesSpawn();
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", spawn: f.spawn });
  assert.equal(r.ok, true);
  assert.equal(r.roles_applied, false);
  assert.equal(f.calls.filter((c) => c.includes("-f")).length, 1);
});

test("PROOF-7 ATTACK: the roles apply is held to the same URL assertions (a lesser role or the stack's port is refused before any psql)", () => {
  let ran = false;
  const spawn = () => { ran = true; return {}; };
  assert.throws(() => applySchemaDump({ dbUrl: "postgresql://authenticated:x@127.0.0.1:54399/postgres", stackUrl: STACK, dumpPath: "/d.sql", rolesPath: "/r.sql", spawn }), /supabase_admin role/);
  assert.throws(() => applySchemaDump({ dbUrl: "postgresql://supabase_admin:x@127.0.0.1:54322/postgres", stackUrl: STACK, dumpPath: "/d.sql", rolesPath: "/r.sql", spawn }), /stack's own database/);
  assert.equal(ran, false);
});
