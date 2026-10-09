/** Tests for scripts/proof/apply-schema-dump.mjs (lane PROOF-1), with a fixture dump and a fake psql. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripOwnership, collectErrors, classifyErrors, buildReport, applySchemaDump } from "./apply-schema-dump.mjs";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const FIXTURE_DUMP = [
  "SET statement_timeout = 0;",
  "CREATE TABLE public.sources (id uuid);",
  "ALTER TABLE public.sources OWNER TO postgres;",
  "CREATE TABLE public.items (id uuid);",
  "ALTER FUNCTION public.f() OWNER TO reconciler;",
  "GRANT SELECT ON public.items TO reconciler;",
].join("\n");

test("stripOwnership drops ALTER ... OWNER TO lines and nothing else", () => {
  const r = stripOwnership(FIXTURE_DUMP);
  assert.equal(r.dropped, 2);
  assert.ok(!/OWNER TO/.test(r.text));
  assert.match(r.text, /GRANT SELECT ON public\.items TO reconciler;/);
  assert.match(r.text, /CREATE TABLE public\.sources/);
});

test("collectErrors reads psql ERROR lines with their line numbers", () => {
  const e = collectErrors("psql:/x/d.sql:12: ERROR:  role \"reconciler\" does not exist\npsql:/x/d.sql:30: NOTICE:  fine\npsql:/x/d.sql:44: ERROR:  syntax error at or near \"x\"");
  assert.deepEqual(e.map((x) => x.line), [12, 44]);
});

test("a missing-role error is counted but not fatal; any other error is fatal", () => {
  const c = classifyErrors([{ line: 1, message: 'role "reconciler" does not exist' }, { line: 2, message: 'relation "x" does not exist' }]);
  assert.equal(c.role.length, 1);
  assert.equal(c.fatal.length, 1);
});

test("buildReport: ok needs zero fatal errors and at least one public table", () => {
  assert.equal(buildReport({ errors: [], dropped: 0, publicTables: 3, startedAt: "a", finishedAt: "b" }).ok, true);
  assert.equal(buildReport({ errors: [], dropped: 0, publicTables: 0, startedAt: "a", finishedAt: "b" }).ok, false);
  assert.equal(buildReport({ errors: [{ line: 1, message: "boom" }], dropped: 0, publicTables: 3, startedAt: "a", finishedAt: "b" }).ok, false);
  assert.equal(buildReport({ errors: [{ line: 1, message: 'role "r" does not exist' }], dropped: 0, publicTables: 3, startedAt: "a", finishedAt: "b" }).ok, true);
});

function fakeEnv({ stderr = "", tables = "2" } = {}) {
  const written = {};
  const calls = [];
  return {
    written, calls,
    read: () => FIXTURE_DUMP,
    write: (p, t) => { written[p] = t; },
    spawn: (_bin, args) => {
      calls.push(args);
      if (args.includes("-c")) return { status: 0, stdout: `${tables}\n`, stderr: "" };
      return { status: 0, stdout: "", stderr };
    },
  };
}

test("applySchemaDump applies the sanitized dump with ON_ERROR_STOP off and reads back the table count", () => {
  const f = fakeEnv({ stderr: 'psql:x:6: ERROR:  role "reconciler" does not exist\n' });
  const r = applySchemaDump({ dbUrl: LOCAL, dumpPath: "/d.sql", workDir: "/w", read: f.read, write: f.write, spawn: f.spawn });
  assert.equal(r.ok, true);
  assert.equal(r.role_errors, 1);
  assert.equal(r.ownership_statements_dropped, 2);
  assert.equal(r.public_tables, 2);
  assert.ok(f.calls[0].includes("ON_ERROR_STOP=0"));
  assert.ok(Object.values(f.written)[0] && !/OWNER TO/.test(Object.values(f.written)[0]));
});

test("a fatal error in the apply fails the report and is listed", () => {
  const f = fakeEnv({ stderr: 'psql:x:9: ERROR:  type "foo" does not exist\n' });
  const r = applySchemaDump({ dbUrl: LOCAL, dumpPath: "/d.sql", workDir: "/w", read: f.read, write: f.write, spawn: f.spawn });
  assert.equal(r.ok, false);
  assert.equal(r.fatal_errors, 1);
  assert.equal(r.errors[0].line, 9);
});

test("ATTACK: a non-loopback database URL is refused before the dump is even read", () => {
  let read = false;
  assert.throws(() => applySchemaDump({ dbUrl: "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres", dumpPath: "/d.sql", workDir: "/w", read: () => { read = true; return ""; }, write: () => {}, spawn: () => ({}) }), /loopback/);
  assert.equal(read, false);
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS ───────────────────────────
test("GATE-9 exit status: apply-schema-dump.mjs exits 2 when --in or --report is missing, with no database URL, and for a non-loopback URL", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { withoutCredentials } = await import("../lib/env-file.mjs");
  const script = fileURLToPath(new URL("./apply-schema-dump.mjs", import.meta.url));
  const env = { ...withoutCredentials(), PROOF_DB_URL: "", SUPABASE_DB_URL: "" };
  const run = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8", env });
  assert.equal(run().status, 2);
  assert.equal(run("--in", "dump.sql", "--report", "r.json").status, 2, "no database URL");
  assert.equal(run("--in", "dump.sql", "--report", "r.json", "--db-url", "postgresql://u:p@db.example.com:5432/postgres").status, 2, "a non-loopback URL is refused");
});
