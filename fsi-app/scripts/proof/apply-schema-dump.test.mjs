/** Tests for scripts/proof/apply-schema-dump.mjs (lane PROOF-1, rewritten by PROOF-6), with a fake psql. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { psqlArgs, assertOracleUrl, collectErrors, missingRole, buildReport, applySchemaDump as applyRaw, DEFAULT_ACL_QUERY, parseDefaultAclRows, clearDefaultAclStatements, parseDumpDefaultAcl, compareDefaultAcl, summaryLine } from "./apply-schema-dump.mjs";

// The dump text is injected (no file on disk); a test that cares passes its own readText.
const applySchemaDump = (o) => applyRaw({ readText: () => "", ...o });

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
    if (args.includes(DEFAULT_ACL_QUERY)) return { status: 0, stdout: "", stderr: "" };
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
  const apply = f.calls.filter((c) => c.includes("-f"));
  assert.equal(apply.length, 1);
  assert.ok(apply[0].includes("ON_ERROR_STOP=1"));
  assert.ok(!apply[0].includes("ON_ERROR_STOP=0"));
  assert.equal(apply[0][apply[0].indexOf("-f") + 1], "/d.sql", "the dump itself, not a stripped copy");
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
    if (args.includes(DEFAULT_ACL_QUERY)) return { status: 0, stdout: "", stderr: "" };
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
  const files = f.calls.filter((c) => c.includes("-f"));
  assert.equal(f.calls[0][f.calls[0].indexOf("-f") + 1], "/r.sql", "the roles file is the first psql run");
  assert.equal(files[1][files[1].indexOf("-f") + 1], "/d.sql");
  for (const c of files) assert.ok(c.includes("ON_ERROR_STOP=1") && !c.includes("ON_ERROR_STOP=0"));
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

// ── lane DRIFT-1b (2026-10-10): the oracle image's default privileges are cleared before the dump ────────────────
// Fire 9: 342 grants differed because the image's ALTER DEFAULT PRIVILEGES granted anon, authenticated and
// service_role on every object the dump created; pg_dump emits no REVOKE for a role absent from an ACL.
const IMAGE_ROWS = [
  "postgres|public|r|anon", "postgres|public|r|authenticated", "postgres|public|r|service_role",
  "postgres|public|S|anon", "postgres|public|f|authenticated",
  "supabase_admin|public|r|anon", "supabase_admin|public|r|service_role", "supabase_admin||f|PUBLIC",
].join("\n");

test("DRIFT-1b: parseDefaultAclRows reads the catalog rows and refuses an unreadable one", () => {
  const rows = parseDefaultAclRows(IMAGE_ROWS + "\n");
  assert.equal(rows.length, 8);
  assert.deepEqual(rows[7], { owner: "supabase_admin", schema: "", objtype: "f", grantee: "PUBLIC" });
  assert.throws(() => parseDefaultAclRows("postgres|public|x|anon"), /unreadable/);
  assert.throws(() => parseDefaultAclRows("2"), /unreadable/);
});

test("DRIFT-1b: one REVOKE per catalog row, schema-scoped or global, PUBLIC unquoted, names quoted", () => {
  const st = clearDefaultAclStatements(parseDefaultAclRows(IMAGE_ROWS));
  assert.equal(st.length, 8);
  assert.equal(st[0], 'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";');
  assert.equal(st[3], 'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";');
  assert.equal(st[7], 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL ON FUNCTIONS FROM PUBLIC;');
  assert.deepEqual(clearDefaultAclStatements([]), []);
  assert.equal(clearDefaultAclStatements([{ owner: 'a"b', schema: "", objtype: "r", grantee: "x" }])[0], 'ALTER DEFAULT PRIVILEGES FOR ROLE "a""b" REVOKE ALL ON TABLES FROM "x";');
});

function aclSpawn({ imageRows = IMAGE_ROWS, afterRows = "", clearStderr = "", clearStatus = 0, readStatus = 0 } = {}) {
  const calls = [];
  let reads = 0;
  const spawn = (_bin, args) => {
    calls.push(args);
    if (args.includes(DEFAULT_ACL_QUERY)) { reads += 1; return reads === 1 ? { status: readStatus, stdout: `${imageRows}\n`, stderr: "" } : { status: 0, stdout: `${afterRows}\n`, stderr: "" }; }
    if (args.some((a) => String(a).startsWith("ALTER DEFAULT PRIVILEGES"))) return { status: clearStatus, stdout: "", stderr: clearStderr };
    if (args.includes("-c")) return { status: 0, stdout: "5\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { calls, spawn };
}

const isClear = (c) => c.some((a) => String(a).startsWith("ALTER DEFAULT PRIVILEGES"));

test("DRIFT-1b: the REVOKEs run BEFORE the dump, in one ON_ERROR_STOP call, and the report names count, owners and grantees", () => {
  const f = aclSpawn();
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", spawn: f.spawn });
  const iClear = f.calls.findIndex(isClear);
  const iDump = f.calls.findIndex((c) => c.includes("-f"));
  assert.ok(iClear > 0 && iDump > iClear, "read, then clear, then dump");
  assert.ok(f.calls[iClear].includes("ON_ERROR_STOP=1"));
  assert.equal(f.calls[iClear].find((a) => String(a).startsWith("ALTER")).split("\n").length, 8);
  assert.equal(r.ok, true);
  assert.equal(r.default_acl.cleared.statements, 8);
  assert.deepEqual(r.default_acl.cleared.owners, ["postgres", "supabase_admin"]);
  assert.deepEqual(r.default_acl.cleared.grantees, ["PUBLIC", "anon", "authenticated", "service_role"]);
});

test("DRIFT-1b: an image with no default privileges generates nothing and runs no clear statement", () => {
  const f = aclSpawn({ imageRows: "" });
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", spawn: f.spawn });
  assert.equal(r.ok, true);
  assert.equal(r.default_acl.cleared.statements, 0);
  assert.equal(f.calls.filter(isClear).length, 0);
});

test("DRIFT-1b ATTACK: a failed clear is red, is a default-privileges error, and the dump is NOT applied", () => {
  const f = aclSpawn({ clearStderr: 'psql:<stdin>:1: ERROR:  role "anon" does not exist\n', clearStatus: 3 });
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", spawn: f.spawn });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].phase, "default-privileges");
  assert.equal(f.calls.filter((c) => c.includes("-f")).length, 0);
});

test("DRIFT-1b ATTACK: an unreadable pg_default_acl is red and the dump is NOT applied", () => {
  const f = aclSpawn({ readStatus: 2 });
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", spawn: f.spawn });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /could not read pg_default_acl/);
  assert.equal(f.calls.filter((c) => c.includes("-f")).length, 0);
});

const DUMP = [
  "CREATE TABLE public.a (id int);",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;",
  "ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin GRANT ALL ON ROUTINES TO PUBLIC WITH GRANT OPTION;",
  'ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO "Odd Role";',
].join("\n");

test("DRIFT-1b: parseDumpDefaultAcl reads what the dump declares: owner, schema, type, each grantee; owner self-grants and REVOKEs are not entries", () => {
  const d = parseDumpDefaultAcl(DUMP);
  assert.deepEqual(d.map((x) => `${x.owner}|${x.schema}|${x.objtype}|${x.grantee}`), [
    "postgres|public|r|service_role", "postgres|public|f|anon", "postgres|public|f|authenticated",
    "supabase_admin||f|PUBLIC", "supabase_admin||r|Odd Role",
  ]);
  assert.deepEqual(parseDumpDefaultAcl("CREATE TABLE x ();"), []);
});

test("DRIFT-1b: the oracle's entries after the dump must equal the dump's declarations (compareDefaultAcl)", () => {
  const d = parseDumpDefaultAcl(DUMP);
  assert.deepEqual(compareDefaultAcl(d, d), { extra: [], missing: [] });
  const c = compareDefaultAcl([...d, { owner: "postgres", schema: "public", objtype: "r", grantee: "anon" }], d.slice(0, 4));
  assert.deepEqual(c.extra, ["postgres|public|r|anon", "supabase_admin||r|Odd Role"].sort());
  assert.equal(compareDefaultAcl([], d).missing.length, 5);
});

test("DRIFT-1b ATTACK: an image default the dump never declares survives the apply => red and the entry is named; an exact match is green", () => {
  const dumpText = "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;\n";
  const green = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", readText: () => dumpText, spawn: aclSpawn({ afterRows: "postgres|public|r|service_role" }).spawn });
  assert.equal(green.ok, true);
  assert.equal(green.default_acl.declared, 1);
  assert.equal(green.default_acl.after, 1);
  const red = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", readText: () => dumpText, spawn: aclSpawn({ afterRows: "postgres|public|r|service_role\npostgres|public|r|anon" }).spawn });
  assert.equal(red.ok, false);
  assert.deepEqual(red.default_acl.extra, ["postgres|public|r|anon"]);
  assert.match(red.errors.at(-1).message, /never declared: postgres\|public\|r\|anon/);
});

// ── lane DRIFT-2 (2026-10-11): the default-privilege check compares what the migrations govern ───────────────────
// Chain proof fire 10 (run 38143319917): default privileges cleared 69, declared by the dump 9, oracle after 17, extra 8,
// every one created by an extension's own install script (cron, pgsodium) while the dump ran. pg_dump never emits an
// extension's internal ALTER DEFAULT PRIVILEGES, so the dump can never declare them: red by construction, not by drift.
// The report gives counts and the 8 names; the 9 declared rows below are any 9 entries in the governed scope (reconstructed).
const key = (r) => [r.owner, r.schema, r.objtype, r.grantee].join("|");
const FIRE10_DECLARED = [
  { owner: "postgres", schema: "public", objtype: "r", grantee: "anon" },
  { owner: "postgres", schema: "public", objtype: "r", grantee: "authenticated" },
  { owner: "postgres", schema: "public", objtype: "r", grantee: "service_role" },
  { owner: "postgres", schema: "public", objtype: "S", grantee: "service_role" },
  { owner: "postgres", schema: "public", objtype: "f", grantee: "service_role" },
  { owner: "supabase_admin", schema: "public", objtype: "r", grantee: "service_role" },
  { owner: "supabase_admin", schema: "public", objtype: "S", grantee: "service_role" },
  { owner: "supabase_admin", schema: "public", objtype: "f", grantee: "service_role" },
  { owner: "supabase_admin", schema: "", objtype: "f", grantee: "PUBLIC" },
];
const FIRE10_EXTENSION_ROWS = [
  ["supabase_admin", "cron", "S", "postgres"], ["supabase_admin", "cron", "f", "postgres"], ["supabase_admin", "cron", "r", "postgres"],
  ["supabase_admin", "pgsodium_masks", "S", "pgsodium_keyiduser"], ["supabase_admin", "pgsodium_masks", "f", "pgsodium_keyiduser"], ["supabase_admin", "pgsodium_masks", "r", "pgsodium_keyiduser"],
  ["supabase_admin", "pgsodium", "S", "pgsodium_keyholder"], ["supabase_admin", "pgsodium", "r", "pgsodium_keyholder"],
].map(([owner, schema, objtype, grantee]) => ({ owner, schema, objtype, grantee }));

test("DRIFT-2 fire-10 fixture: 17 oracle rows (9 declared + 8 extension-internal) against the 9 declared => extra [] and out_of_scope 8", () => {
  const oracle = [...FIRE10_DECLARED, ...FIRE10_EXTENSION_ROWS];
  assert.equal(oracle.length, 17);
  const c = compareDefaultAcl(oracle, FIRE10_DECLARED);
  assert.deepEqual(c.extra, []);
  assert.deepEqual(c.missing, []);
  assert.equal(c.out_of_scope, 8);
});

test("DRIFT-2 end to end: the fire-10 oracle state is GREEN in applySchemaDump, the report names the scope and counts the 8 excluded rows", () => {
  const word = { r: "TABLES", S: "SEQUENCES", f: "FUNCTIONS" };
  const dumpText = FIRE10_DECLARED.map((r) => `ALTER DEFAULT PRIVILEGES FOR ROLE ${r.owner}${r.schema ? ` IN SCHEMA ${r.schema}` : ""} GRANT ALL ON ${word[r.objtype]} TO ${r.grantee};`).join("\n") + "\n";
  assert.equal(parseDumpDefaultAcl(dumpText).length, 9, "the fixture dump declares exactly the 9 rows");
  const afterRows = [...FIRE10_DECLARED, ...FIRE10_EXTENSION_ROWS].map(key).join("\n");
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", readText: () => dumpText, spawn: aclSpawn({ afterRows }).spawn });
  assert.equal(r.ok, true);
  assert.equal(r.fatal_errors, 0);
  assert.equal(r.default_acl.declared, 9);
  assert.equal(r.default_acl.after, 17);
  assert.deepEqual(r.default_acl.extra, []);
  assert.deepEqual(r.default_acl.scope, ["", "public"]);
  assert.equal(r.default_acl.out_of_scope, 8);
});

test("DRIFT-2 ATTACK: a public-schema entry the dump never declared is still extra, with extension rows present", () => {
  const stray = { owner: "postgres", schema: "public", objtype: "r", grantee: "anon_ro" };
  const c = compareDefaultAcl([...FIRE10_DECLARED, ...FIRE10_EXTENSION_ROWS, stray], FIRE10_DECLARED);
  assert.deepEqual(c.extra, ["postgres|public|r|anon_ro"]);
  assert.equal(c.out_of_scope, 8);
  const dumpText = "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;\n";
  const red = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", readText: () => dumpText, spawn: aclSpawn({ afterRows: "postgres|public|r|service_role\npostgres|public|r|anon_ro\nsupabase_admin|cron|r|postgres" }).spawn });
  assert.equal(red.ok, false);
  assert.deepEqual(red.default_acl.extra, ["postgres|public|r|anon_ro"]);
  assert.equal(red.default_acl.out_of_scope, 1);
});

test("DRIFT-2 ATTACK: a global ('' schema) entry the dump never declared is still extra", () => {
  const stray = { owner: "supabase_admin", schema: "", objtype: "r", grantee: "PUBLIC" };
  const c = compareDefaultAcl([...FIRE10_DECLARED, ...FIRE10_EXTENSION_ROWS, stray], FIRE10_DECLARED);
  assert.deepEqual(c.extra, ["supabase_admin||r|PUBLIC"]);
  assert.equal(c.out_of_scope, 8);
});

test("DRIFT-2: an entry the dump declares in the governed scope that the oracle lacks is still missing; the scope is a parameter", () => {
  const c = compareDefaultAcl(FIRE10_EXTENSION_ROWS, FIRE10_DECLARED);
  assert.equal(c.missing.length, 9);
  assert.equal(c.out_of_scope, 8);
  const all = compareDefaultAcl(FIRE10_EXTENSION_ROWS, [], { schemas: ["", "public", "cron", "pgsodium", "pgsodium_masks"] });
  assert.equal(all.extra.length, 8, "widening the scope compares the extension rows again");
  assert.equal(all.out_of_scope, 0);
});

test("DRIFT-2: the console line prints the out-of-scope count", () => {
  const f = aclSpawn({ afterRows: [...FIRE10_DECLARED, ...FIRE10_EXTENSION_ROWS].map(key).join("\n") });
  const dumpText = FIRE10_DECLARED.map((r) => `ALTER DEFAULT PRIVILEGES FOR ROLE ${r.owner}${r.schema ? ` IN SCHEMA ${r.schema}` : ""} GRANT ALL ON ${{ r: "TABLES", S: "SEQUENCES", f: "FUNCTIONS" }[r.objtype]} TO ${r.grantee};`).join("\n");
  const r = applySchemaDump({ dbUrl: ORACLE, stackUrl: STACK, dumpPath: "/d.sql", readText: () => dumpText, spawn: f.spawn });
  const line = summaryLine(r);
  assert.match(line, /^apply-schema-dump: OK;/);
  assert.match(line, /out of scope 8/);
  assert.match(line, /extra 0/);
  assert.match(line, /declared by the dump 9, oracle after 17/);
});
