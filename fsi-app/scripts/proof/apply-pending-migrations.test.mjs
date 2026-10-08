/** Tests for scripts/proof/apply-pending-migrations.mjs (lane MIG-CI). A fixture plan proves which files are chosen
 *  (the map's never-applied entries and unreferenced files, minus 299 by name) and in what order; the committed tree
 *  proves the real selection and that the 299 exclusion still matches the file's own header; an injected spawn that
 *  stands in for psql proves one-file-one-run with ON_ERROR_STOP, the stop rule and the failure report, including the
 *  negative fixture: a migration whose fixture violates a CHECK constraint fails the step and names the file, the
 *  line and the full error text. No database is needed (psql is not available where this runs by hand; the stack
 *  path itself is exercised by the migration-proof workflow in CI). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseInventoryOrder, planReplay, DEFAULT_INVENTORY, DEFAULT_MIGRATIONS_DIR, DEFAULT_MAP, DEFAULT_APPLIED } from "./replay-migrations.mjs";
import { parseAppliedInventory } from "./sync-applied-migrations.mjs";
import { selectPending, applyPending, summarize, EXCLUDED } from "./apply-pending-migrations.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, "apply-pending-migrations.mjs");
const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const planOf = (skipped, unreferenced) => ({ errors: [], skipped, unreferenced, ordered: [], satisfied: [] });

test("selectPending: never-applied entries and unreferenced files, minus 299 by name, in number order", () => {
  const plan = planOf(
    [
      { key: "never:372", file: "372_profiles_read.sql", class: "never-applied" },
      { key: "dup:006", file: "006_rls_multi_tenant.sql", class: "duplicate-prefix" },
      { key: "never:299", file: "299_item_type_required_slots_wave3.sql", class: "never-applied" },
      { key: "never:370", file: "370_privilege_table_policies.sql", class: "never-applied" },
    ],
    ["1000_new_file.sql", "373_new.sql"],
  );
  const sel = selectPending(plan);
  assert.deepEqual(sel.apply.map((a) => a.file), ["370_privilege_table_policies.sql", "372_profiles_read.sql", "373_new.sql", "1000_new_file.sql"], "number order, numeric not lexical");
  assert.deepEqual(sel.apply.map((a) => a.source), ["map: never-applied", "map: never-applied", "not in the map (a new file)", "not in the map (a new file)"]);
  assert.deepEqual(sel.excluded.map((e) => e.file), ["299_item_type_required_slots_wave3.sql"]);
  assert.match(sel.excluded[0].reason, /LEFT UNAPPLIED/);
  assert.ok(!sel.apply.some((a) => a.file.startsWith("006_")), "a duplicate-prefix file is never applied");
});

test("selectPending: nothing pending selects nothing", () => {
  const sel = selectPending(planOf([], []));
  assert.deepEqual(sel, { apply: [], excluded: [] });
});

test("the 299 exclusion reason is still what the file's own header says", () => {
  const names = Object.keys(EXCLUDED);
  assert.deepEqual(names, ["299_item_type_required_slots_wave3.sql"]);
  const header = readFileSync(join(DEFAULT_MIGRATIONS_DIR, names[0]), "utf8").split(/\r?\n/).slice(0, 4).join("\n");
  assert.match(header, /LEFT UNAPPLIED/, "299's header no longer says LEFT UNAPPLIED: revisit the exclusion");
  assert.match(header, /two-track policy/);
  assert.match(EXCLUDED[names[0]], /LEFT UNAPPLIED \(two-track policy\)/);
});

test("the committed tree: the plan has no errors, 370 to 372 are selected in order, 299 is excluded, and every pick is a map never or an unreferenced file", () => {
  const plan = planReplay(
    parseInventoryOrder(readFileSync(DEFAULT_INVENTORY, "utf8")),
    readdirSync(DEFAULT_MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")),
    parseAppliedInventory(readFileSync(DEFAULT_APPLIED, "utf8")),
    readFileSync(DEFAULT_MAP, "utf8"),
  );
  assert.deepEqual(plan.errors, []);
  const sel = selectPending(plan);
  const files = sel.apply.map((a) => a.file);
  const i370 = files.indexOf("370_privilege_table_policies.sql");
  assert.ok(i370 >= 0 && files[i370 + 1] === "371_definer_hygiene.sql" && files[i370 + 2] === "372_profiles_read.sql", `370, 371, 372 must be selected in order, got ${files.join(", ")}`);
  assert.ok(!files.includes("299_item_type_required_slots_wave3.sql"));
  assert.ok(sel.excluded.some((e) => e.file === "299_item_type_required_slots_wave3.sql"));
  const map = JSON.parse(readFileSync(DEFAULT_MAP, "utf8"));
  const never = new Set(Object.values(map).filter((e) => e.class === "never-applied").map((e) => e.file));
  for (const a of sel.apply) assert.ok(never.has(a.file) || plan.unreferenced.includes(a.file), `${a.file} is neither a map never nor unreferenced`);
  assert.deepEqual(files, [...files].sort((a, b) => Number(/^(\d+)/.exec(a)[1]) - Number(/^(\d+)/.exec(b)[1])), "applied in number order");
});

/** A stand-in for psql. It records every call and answers by the file it was asked to run. */
function fakePsql(behaviour) {
  const calls = [];
  const spawn = (bin, args) => {
    calls.push({ bin, args });
    const file = args[args.indexOf("-f") + 1];
    const text = readFileSync(file, "utf8");
    return behaviour(text, file);
  };
  return { spawn, calls };
}

function dirWith(files) {
  const dir = mkdtempSync(join(tmpdir(), "apply-pending-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const sel = (...files) => ({ apply: files.map((file) => ({ file, source: "map: never-applied" })), excluded: [] });

test("dry by default: nothing is run", () => {
  const dir = dirWith({ "370_a.sql": "SELECT 1;\n" });
  const { spawn, calls } = fakePsql(() => ({ status: 0, stderr: "" }));
  const report = applyPending({ selection: sel("370_a.sql"), migrationsDir: dir, dbUrl: URL_LOCAL, spawn });
  assert.equal(calls.length, 0);
  assert.equal(report.mode, "dry");
  assert.deepEqual(report.selected, ["370_a.sql"]);
  assert.equal(report.ok, true);
});

test("apply: one psql run per file, in order, each with ON_ERROR_STOP in a single transaction, NOTICE self-checks kept", () => {
  const dir = dirWith({ "370_a.sql": "SELECT 1;\n", "371_b.sql": "SELECT 2;\n" });
  const { spawn, calls } = fakePsql(() => ({ status: 0, stderr: "psql:x.sql:3: NOTICE:  self-check ok: 0 rows" }));
  const report = applyPending({ selection: sel("370_a.sql", "371_b.sql"), migrationsDir: dir, dbUrl: URL_LOCAL, spawn, apply: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.args[c.args.indexOf("-f") + 1].split(/[\\/]/).pop()), ["370_a.sql", "371_b.sql"]);
  for (const c of calls) {
    assert.equal(c.args[0], URL_LOCAL);
    assert.ok(c.args.includes("ON_ERROR_STOP=1") && c.args.includes("--single-transaction"));
  }
  assert.equal(report.applied, 2);
  assert.equal(report.ok, true);
  assert.deepEqual(report.files[0].notices, ["self-check ok: 0 rows"]);
});

// The negative fixture: the 370 class (a fixture value outside a CHECK list). A real postgres refuses the INSERT with
// the error text below; the stand-in answers with that text for exactly this file.
const CHECK_VIOLATION = [
  "-- Migration 380 fixture: the CHECK-list class that aborted 370 at production.",
  "CREATE TEMP TABLE t (kind text CHECK (kind IN ('a', 'b')));",
  "INSERT INTO t VALUES ('c');",
  "",
].join("\n");
const CHECK_STDERR = [
  'psql:/work/380_fixture.sql:3: ERROR:  new row for relation "t" violates check constraint "t_kind_check"',
  "DETAIL:  Failing row contains (c).",
].join("\n");

test("NEGATIVE FIXTURE: a migration whose fixture violates a CHECK fails the apply step, names the file and line, keeps the full error text, and stops before the next file", () => {
  const dir = dirWith({ "379_ok.sql": "SELECT 1;\n", "380_fixture.sql": CHECK_VIOLATION, "381_after.sql": "SELECT 3;\n" });
  const { spawn, calls } = fakePsql((text) => (text.includes("INSERT INTO t VALUES ('c')") ? { status: 3, stderr: CHECK_STDERR } : { status: 0, stderr: "" }));
  const report = applyPending({ selection: sel("379_ok.sql", "380_fixture.sql", "381_after.sql"), migrationsDir: dir, dbUrl: URL_LOCAL, spawn, apply: true });
  assert.equal(report.ok, false);
  assert.equal(report.failed, 1);
  assert.equal(report.stopped_at, "380_fixture.sql");
  assert.equal(calls.length, 2, "the file after the failure must not run");
  const failed = report.files.find((f) => f.status === "failed");
  assert.equal(failed.error.line, 3);
  assert.match(failed.error.message, /violates check constraint "t_kind_check"/);
  assert.equal(failed.error.statement, "INSERT INTO t VALUES ('c');");
  assert.match(failed.raw, /DETAIL:  Failing row contains \(c\)\./, "the full psql error text is kept");
  const text = summarize(report);
  assert.match(text, /FAILED 380_fixture\.sql line 3: new row for relation "t" violates check constraint/);
  assert.match(text, /full psql error text follows/);
  assert.match(text, /Failing row contains \(c\)/);
});

test("a psql that cannot run is a failure with a message, not a silent pass", () => {
  const dir = dirWith({ "370_a.sql": "SELECT 1;\n" });
  const report = applyPending({ selection: sel("370_a.sql"), migrationsDir: dir, dbUrl: URL_LOCAL, spawn: () => ({ error: new Error("ENOENT"), status: null, stderr: "" }), apply: true });
  assert.equal(report.ok, false);
  assert.match(report.files[0].error.message, /could not run psql/);
});

function fixtureTree() {
  const dir = mkdtempSync(join(tmpdir(), "apply-pending-cli-"));
  const files = ["001_schema.sql", "370_pending.sql"];
  writeFileSync(join(dir, "inventory.md"), ["| # | File | Subject |", "|---|---|---|", "| 001 | 001_schema.sql | schema |", "| 370 | 370_pending.sql | pending |", ""].join("\n"));
  writeFileSync(join(dir, "applied.json"), JSON.stringify({ source: "t", synced_at: "t", count: 1, migrations: [{ version: "001", name: "schema" }] }));
  writeFileSync(join(dir, "map.json"), JSON.stringify({
    "001": { name: "schema", file: "001_schema.sql", class: "identical" },
    "never:370": { name: "pending", file: "370_pending.sql", class: "never-applied" },
  }));
  return { dir, files };
}

function runCli(extra, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...extra], { encoding: "utf8", env: { ...process.env, PROOF_DB_URL: "", ...env } });
}

test("CLI: a dry run lists the selection and exits 0 without psql", () => {
  const { dir, files } = fixtureTree();
  const m = mkdtempSync(join(tmpdir(), "apply-pending-m-"));
  for (const f of files) writeFileSync(join(m, f), "SELECT 1;\n");
  const r = runCli(["--db-url", URL_LOCAL, "--migrations-dir", m, "--inventory", join(dir, "inventory.md"), "--applied", join(dir, "applied.json"), "--map", join(dir, "map.json")]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Pending migrations on the local stack \(dry\): OK/);
  assert.match(r.stdout, /selected 370_pending\.sql/);
});

test("CLI ATTACK: a non-loopback database URL is refused with exit 2 before anything is read or run", () => {
  const r = runCli(["--apply", "--db-url", "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /loopback/);
  const none = runCli([]);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no database URL/);
});

test("CLI: a map with errors refuses to choose a pending set (exit 1, errors named)", () => {
  const { dir } = fixtureTree();
  const m = mkdtempSync(join(tmpdir(), "apply-pending-m-"));
  writeFileSync(join(m, "001_schema.sql"), "SELECT 1;\n");
  const r = runCli(["--db-url", URL_LOCAL, "--migrations-dir", m, "--inventory", join(dir, "inventory.md"), "--applied", join(dir, "applied.json"), "--map", join(dir, "map.json")]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /entry_file_missing/);
});
