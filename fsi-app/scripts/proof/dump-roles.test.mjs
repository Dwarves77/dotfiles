/** Tests for scripts/proof/dump-roles.mjs (lane PROOF-7, 2026-10-09), with fake pg_dumpall, psql and connections. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIdent, dumpAllArgs, passwordProblems, filterRoles, newRoleNames, oracleRoleNames, pickPgDumpall, exportRoles, filterRolesFile } from "./dump-roles.mjs";

const ORACLE = "postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres";
const STACK = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const EXISTING = new Set(["postgres", "anon", "authenticated", "service_role", "supabase_admin"]);

const RAW = [
  "--",
  "-- PostgreSQL database cluster dump",
  "--",
  "",
  "SET default_transaction_read_only = off;",
  "SET client_encoding = 'UTF8';",
  "",
  "CREATE ROLE anon;",
  "ALTER ROLE anon WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;",
  'CREATE ROLE "reconciler";',
  'ALTER ROLE "reconciler" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;',
  "ALTER ROLE \"reconciler\" SET statement_timeout TO '30s';",
  "CREATE ROLE worker_ro;",
  "ALTER ROLE worker_ro WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;",
  "GRANT anon TO postgres GRANTED BY supabase_admin;",
  'GRANT "worker_ro" TO "reconciler" WITH INHERIT TRUE GRANTED BY "supabase_admin";',
  "GRANT worker_ro TO postgres GRANTED BY supabase_admin;",
  "",
].join("\n");

test("parseIdent strips quotes and unescapes doubled quotes", () => {
  assert.equal(parseIdent("reconciler"), "reconciler");
  assert.equal(parseIdent('"reconciler"'), "reconciler");
  assert.equal(parseIdent('"a""b"'), 'a"b');
});

test("dumpAllArgs: roles only, no role passwords, no comments, written to the given file", () => {
  const a = dumpAllArgs("postgresql://u@h/db", "/o/roles.sql");
  for (const f of ["--roles-only", "--no-role-passwords", "--no-comments"]) assert.ok(a.includes(f), f);
  assert.equal(a[a.indexOf("-f") + 1], "/o/roles.sql");
});

test("passwordProblems: a PASSWORD clause on any statement is a problem, a role named password is not", () => {
  assert.deepEqual(passwordProblems(RAW), []);
  assert.equal(passwordProblems("ALTER ROLE x WITH LOGIN PASSWORD 'SCRAM-SHA-256$4096:abc';\n").length, 1);
  assert.deepEqual(passwordProblems('CREATE ROLE "password";\n'), []);
});

test("filterRoles keeps only statements about roles the oracle lacks (CREATE, ALTER, GRANT) and names them", () => {
  const r = filterRoles(RAW, EXISTING);
  assert.deepEqual(r.created, ["reconciler", "worker_ro"]);
  const lines = r.text.split("\n");
  assert.ok(lines.includes('CREATE ROLE "reconciler";'));
  assert.ok(lines.includes("CREATE ROLE worker_ro;"));
  assert.ok(lines.some((l) => l.startsWith('ALTER ROLE "reconciler" SET statement_timeout')));
  assert.ok(lines.some((l) => l.startsWith('GRANT "worker_ro" TO "reconciler"')));
  assert.ok(lines.some((l) => l.startsWith("GRANT worker_ro TO postgres")), "a grant that names a new role is kept");
  assert.ok(!lines.includes("CREATE ROLE anon;"), "an existing role is not created again");
  assert.ok(!lines.some((l) => l.startsWith("ALTER ROLE anon")));
  assert.ok(!lines.some((l) => l.startsWith("GRANT anon TO postgres")), "a grant between two existing roles is dropped");
});

test("newRoleNames is the CREATE ROLE set minus the existing roles", () => {
  assert.deepEqual(newRoleNames(RAW, EXISTING), ["reconciler", "worker_ro"]);
});

test("ATTACK: a statement the filter does not recognise is refused, never passed through", () => {
  assert.throws(() => filterRoles(RAW + "DROP ROLE postgres;\n", EXISTING), /unrecognised statement/);
  assert.throws(() => filterRoles(RAW + "ALTER SYSTEM SET x = 1;\n", EXISTING), /unrecognised statement/);
});

test("ATTACK: the filter refuses an input that carries a PASSWORD clause", () => {
  assert.throws(() => filterRoles(RAW + "CREATE ROLE leaky;\nALTER ROLE leaky WITH LOGIN PASSWORD 'x';\n", EXISTING), /PASSWORD/);
});

test("oracleRoleNames reads pg_roles from the oracle at run time (psql -At), and fails loudly when it cannot", () => {
  const calls = [];
  const spawn = (_b, args) => { calls.push(args); return { status: 0, stdout: "postgres\nanon\n\nsupabase_admin\n", stderr: "" }; };
  const r = oracleRoleNames({ oracleUrl: ORACLE, spawn });
  assert.deepEqual([...r].sort(), ["anon", "postgres", "supabase_admin"]);
  assert.match(calls[0].join(" "), /pg_roles/);
  assert.throws(() => oracleRoleNames({ oracleUrl: ORACLE, spawn: () => ({ status: 2, stdout: "", stderr: "connection refused" }) }), /could not read the oracle's roles/);
  assert.throws(() => oracleRoleNames({ oracleUrl: ORACLE, spawn: () => ({ status: 0, stdout: "", stderr: "" }) }), /no roles/);
});

test("pickPgDumpall takes the highest installed major version, else the PATH binary", () => {
  assert.equal(pickPgDumpall({ listVersions: () => ["14", "16", "17", "9"] }), "/usr/lib/postgresql/17/bin/pg_dumpall");
  assert.equal(pickPgDumpall({ listVersions: () => [] }), "pg_dumpall");
  assert.equal(pickPgDumpall({ listVersions: () => { throw new Error("no dir"); } }), "pg_dumpall");
});

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghij.supabase.co", SUPABASE_DB_PASSWORD: "s3cret" };
const connectOk = async () => ({ end: async () => {} });

test("exportRoles runs pg_dumpall with the safe flags on the first working candidate", async () => {
  const calls = [];
  const spawn = (bin, args) => { calls.push({ bin, args }); return { status: 0, stdout: "", stderr: "" }; };
  const r = await exportRoles({ env: ENV, out: "/o/roles.sql", connect: connectOk, spawn, read: () => RAW, bin: "pg_dumpall" });
  assert.equal(r.ok, true, r.message);
  assert.ok(calls[0].args.includes("--no-role-passwords"));
  assert.ok(calls[0].args.includes("--roles-only"));
  assert.doesNotMatch(r.message, /s3cret|postgres(ql)?:\/\//);
});

test("exportRoles fails red, redacted, when pg_dumpall fails (a server version mismatch included)", async () => {
  const spawn = () => ({ status: 1, stdout: "", stderr: "pg_dumpall: error: aborting because of server version mismatch postgresql://postgres:s3cret@h:5432/postgres" });
  const r = await exportRoles({ env: ENV, out: "/o/roles.sql", connect: connectOk, spawn, read: () => RAW, bin: "pg_dumpall" });
  assert.equal(r.ok, false);
  assert.match(r.message, /pg_dumpall failed/);
  assert.doesNotMatch(r.message, /s3cret|postgres(ql)?:\/\//);
});

test("ATTACK: exportRoles refuses (red) an output that carries a password clause, and a run with no candidate", async () => {
  const spawn = () => ({ status: 0, stdout: "", stderr: "" });
  const bad = await exportRoles({ env: ENV, out: "/o/roles.sql", connect: connectOk, spawn, read: () => "CREATE ROLE x;\nALTER ROLE x WITH LOGIN PASSWORD 'abc';\n", bin: "pg_dumpall" });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /password/i);
  const none = await exportRoles({ env: {}, out: "/o/roles.sql", connect: connectOk, spawn, read: () => RAW, bin: "pg_dumpall" });
  assert.equal(none.ok, false);
});

test("filterRolesFile reads the raw file and the oracle's roles, writes the filtered file, refuses a URL that is not the oracle's", () => {
  let written = null;
  const spawn = () => ({ status: 0, stdout: [...EXISTING].join("\n"), stderr: "" });
  const r = filterRolesFile({ inPath: "/in.sql", outPath: "/out.sql", oracleUrl: ORACLE, stackUrl: STACK, spawn, read: () => RAW, write: (p, t) => { written = { p, t }; } });
  assert.deepEqual(r.created, ["reconciler", "worker_ro"]);
  assert.equal(written.p, "/out.sql");
  assert.ok(written.t.includes('CREATE ROLE "reconciler";'));
  assert.throws(() => filterRolesFile({ inPath: "/in.sql", outPath: "/out.sql", oracleUrl: STACK, stackUrl: STACK, spawn, read: () => RAW, write: () => {} }), /supabase_admin|stack's own/);
});
