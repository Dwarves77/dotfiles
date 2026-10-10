/** Tests for scripts/proof/dump-roles.mjs (lane PROOF-7, 2026-10-09; PROOF-7b: export through supabase db dump, filter strips passwords), with a fake supabase CLI, psql and connections. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIdent, roleDumpArgs, stripPasswords, passwordProblems, filterRoles, newRoleNames, oracleRoleNames, exportRoles, filterRolesFile, isSessionStatement } from "./dump-roles.mjs";

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

test("roleDumpArgs: the supabase CLI db dump with --role-only, the given url, written to the given file", () => {
  const a = roleDumpArgs("postgresql://u@h/db", "/o/roles.sql");
  assert.deepEqual(a.slice(0, 2), ["db", "dump"]);
  assert.equal(a[a.indexOf("--db-url") + 1], "postgresql://u@h/db");
  assert.ok(a.includes("--role-only"));
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

test("stripPasswords removes every PASSWORD clause form and drops a statement left empty", () => {
  assert.equal(stripPasswords("ALTER ROLE x WITH LOGIN PASSWORD 'SCRAM-SHA-256$4096:abc' VALID UNTIL 'infinity';"), "ALTER ROLE x WITH LOGIN VALID UNTIL 'infinity';");
  assert.equal(stripPasswords("ALTER ROLE x WITH NOLOGIN PASSWORD 'it''s';"), "ALTER ROLE x WITH NOLOGIN;");
  assert.equal(stripPasswords("ALTER ROLE x WITH ENCRYPTED PASSWORD E'ab';"), "");
  assert.equal(stripPasswords("ALTER ROLE x WITH PASSWORD 'p';"), "");
  assert.equal(stripPasswords("CREATE ROLE x;"), "CREATE ROLE x;");
});

test("ATTACK: the filter STRIPS a PASSWORD clause (no refusal) and the output carries none", () => {
  const leaky = RAW + [
    "CREATE ROLE leaky;",
    "ALTER ROLE leaky WITH NOSUPERUSER LOGIN PASSWORD 'SCRAM-SHA-256$4096:s3cretsalt$key:key' VALID UNTIL 'infinity';",
    "ALTER ROLE worker_ro WITH PASSWORD 'hunter2';",
    "ALTER ROLE anon WITH PASSWORD 'existing-role-secret';",
    "",
  ].join("\n");
  const r = filterRoles(leaky, EXISTING);
  assert.deepEqual(r.created, ["reconciler", "worker_ro", "leaky"]);
  assert.doesNotMatch(r.text, /PASSWORD|s3cretsalt|hunter2|existing-role-secret/i);
  assert.deepEqual(passwordProblems(r.text), []);
  assert.ok(r.text.split("\n").includes("ALTER ROLE leaky WITH NOSUPERUSER LOGIN VALID UNTIL 'infinity';"), "the rest of the statement is kept");
  assert.ok(!r.text.includes("ALTER ROLE worker_ro WITH;"), "a statement emptied by the strip is dropped, not left as invalid SQL");
});

test("ATTACK: a password clause the strip cannot remove (unterminated quote) is refused, never written", () => {
  assert.throws(() => filterRoles("CREATE ROLE x;\nALTER ROLE x WITH LOGIN PASSWORD 'unterminated;\n", EXISTING), /PASSWORD clause survived/);
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

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghij.supabase.co", SUPABASE_DB_PASSWORD: "s3cret" };
const connectOk = async () => ({ end: async () => {} });

test("exportRoles runs supabase db dump --role-only on the first working candidate (not a local pg_dumpall)", async () => {
  const calls = [];
  const spawn = (bin, args) => { calls.push({ bin, args }); return { status: 0, stdout: "", stderr: "" }; };
  const r = await exportRoles({ env: ENV, out: "/o/roles.sql", connect: connectOk, spawn, read: () => RAW });
  assert.equal(r.ok, true, r.message);
  assert.equal(calls[0].bin, "supabase");
  assert.deepEqual(calls[0].args.slice(0, 2), ["db", "dump"]);
  assert.ok(calls[0].args.includes("--role-only"));
  assert.doesNotMatch(calls[0].bin, /pg_dumpall/);
  assert.doesNotMatch(r.message, /s3cret|postgres(ql)?:[/][/]/);
});

test("exportRoles fails red, redacted, when the CLI fails or is absent", async () => {
  const spawn = () => ({ status: 1, stdout: "", stderr: "failed to dump roles postgresql://postgres:s3cret@h:5432/postgres" });
  const r = await exportRoles({ env: ENV, out: "/o/roles.sql", connect: connectOk, spawn, read: () => RAW });
  assert.equal(r.ok, false);
  assert.match(r.message, /supabase db dump --role-only failed/);
  assert.doesNotMatch(r.message, /s3cret|postgres(ql)?:[/][/]/);
  const gone = await exportRoles({ env: ENV, out: "/o/roles.sql", connect: connectOk, spawn: () => ({ error: new Error("ENOENT"), status: null }), read: () => RAW });
  assert.equal(gone.ok, false);
  assert.match(gone.message, /127/);
});

test("exportRoles refuses a run with no candidate and a dump with no CREATE ROLE", async () => {
  const spawn = () => ({ status: 0, stdout: "", stderr: "" });
  const none = await exportRoles({ env: {}, out: "/o/roles.sql", connect: connectOk, spawn, read: () => RAW });
  assert.equal(none.ok, false);
  const empty = await exportRoles({ env: ENV, out: "/o/roles.sql", connect: connectOk, spawn, read: () => "-- nothing" });
  assert.equal(empty.ok, false);
  assert.match(empty.message, /no CREATE ROLE/);
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

// PROOF-8 (2026-10-10). chain-proof fire 7 (run 38020216226), step "Apply the production schema dump to the oracle cluster":
//   dump-roles filter: unrecognised statement in the roles dump (starts "RESET ALL;"): refused
// `supabase db dump --role-only` (CLI 2.95.4, read from `supabase db dump --role-only --dry-run`) pipes the server's roles-only
// dump through sed and then runs `echo "RESET ALL;"` AFTER the pipeline, so RESET ALL is the LAST line, not a preamble. The
// dump's own leading session lines are the three the Postgres roles dump writes (default_transaction_read_only, client_encoding,
// standard_conforming_strings); its \restrict / \unrestrict lines are commented out and deleted by the CLI's own sed.
const REAL_SHAPE = [
  "SET default_transaction_read_only = off;",
  "",
  "SET client_encoding = 'UTF8';",
  "SET standard_conforming_strings = on;",
  "",
  'CREATE ROLE "reconciler";',
  'ALTER ROLE "reconciler" WITH INHERIT NOCREATEROLE NOCREATEDB LOGIN NOBYPASSRLS;',
  'GRANT "authenticated" TO "reconciler" WITH INHERIT TRUE, SET TRUE GRANTED BY "postgres";',
  "RESET ALL;",
  "",
].join("\n");

test("PROOF-8: the real-shape roles dump (leading SET lines, trailing RESET ALL;) is filtered, not refused", () => {
  const r = filterRoles(REAL_SHAPE, EXISTING);
  assert.deepEqual(r.created, ["reconciler"]);
  assert.equal(r.kept, 3, "kept counts the persistent statements only");
  const lines = r.text.split("\n");
  assert.ok(lines.includes('CREATE ROLE "reconciler";'));
  assert.ok(lines.includes("RESET ALL;"), "an accepted session statement is passed through");
  assert.ok(lines.includes("SET client_encoding = 'UTF8';"));
  assert.deepEqual(passwordProblems(r.text), []);
});

test("PROOF-8: a dump with nothing to create writes an empty file even though it carries session statements", () => {
  assert.equal(filterRoles("SET client_encoding = 'UTF8';\nCREATE ROLE anon;\nRESET ALL;\n", EXISTING).text, "");
});

test("PROOF-8: isSessionStatement is an explicit grammar (RESET, SET name = / TO value, set_config) and nothing else", () => {
  const yes = [
    "RESET ALL;", "RESET statement_timeout;", "SET default_transaction_read_only = off;", "SET client_encoding = 'UTF8';",
    "SET standard_conforming_strings TO on;", "SET SESSION statement_timeout = 0;", "SET search_path = public, extensions;",
    "SET search_path TO '', pg_catalog;", "SET pgrst.db_schemas = 'public';", "SET x = 'it''s; fine';",
    "SELECT pg_catalog.set_config('search_path', '', false);", "SELECT pg_catalog.set_config('row_security', 'off', true);",
  ];
  for (const l of yes) assert.equal(isSessionStatement(l), true, l);
  const no = [
    "DROP ROLE postgres;", "ALTER SYSTEM SET x = 1;", "COPY t FROM PROGRAM 'id';", "RESET ALL; DROP ROLE postgres;", "RESET ALL",
    "SET ROLE postgres;", "SET SESSION AUTHORIZATION postgres;", "SET LOCAL x = 1;", "SET x = 1; DROP ROLE postgres;",
    "SET x = 1;DROP ROLE postgres;", "SET x = (select 1);", "SET x = 1 -- c", "SET = 1;", "SET x;",
    "SELECT pg_catalog.set_config('x', 'y', false); DROP ROLE z;", "SELECT pg_catalog.set_config(current_user, 'y', false);",
    "SELECT pg_read_file('/etc/passwd');", "SELECT pg_catalog.set_config('x', 'y', false), pg_sleep(1);", "CREATE ROLE x;", "RESET ALL;;",
  ];
  for (const l of no) assert.equal(isSessionStatement(l), false, l);
});

test("ATTACK (PROOF-8): DROP ROLE, ALTER SYSTEM, COPY and a SET with an injected second statement stay refused inside a real-shape dump", () => {
  for (const evil of ["DROP ROLE postgres;", "ALTER SYSTEM SET max_connections = 1;", "COPY pg_roles TO PROGRAM 'id';", "SET x = 1; DROP ROLE postgres;", "RESET ALL; DROP ROLE postgres;", "SELECT pg_catalog.set_config('a', 'b', false); DROP ROLE postgres;"]) {
    assert.throws(() => filterRoles(REAL_SHAPE.replace("RESET ALL;", evil), EXISTING), /unrecognised statement/, evil);
    assert.throws(() => filterRoles(evil + "\n" + REAL_SHAPE, EXISTING), /unrecognised statement/, evil);
  }
});

test("PROOF-8: the PASSWORD strip still runs on a real-shape dump that carries session statements", () => {
  const r = filterRoles(REAL_SHAPE.replace("LOGIN NOBYPASSRLS;", "LOGIN PASSWORD 'SCRAM-SHA-256$4096:zz' NOBYPASSRLS;"), EXISTING);
  assert.doesNotMatch(r.text, /PASSWORD|SCRAM/i);
  assert.ok(r.text.includes('ALTER ROLE "reconciler" WITH INHERIT NOCREATEROLE NOCREATEDB LOGIN NOBYPASSRLS;'));
});
