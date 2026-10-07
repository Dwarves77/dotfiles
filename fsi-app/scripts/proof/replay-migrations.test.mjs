/** Tests for scripts/proof/replay-migrations.mjs (lane PROOF-1). A fixture directory with a duplicate numeric
 *  prefix (006 x2), a gap (008 absent), a file the inventory does not list, and a listed file that is absent
 *  proves the planning; a fake psql proves the stop rule, the tolerate list, discovery mode and the report. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseInventoryOrder, appliedRowMatchesFile, matchApplied, prefixReport, planReplay, parseTolerate, parsePsqlOutput,
  assertLoopbackDbUrl, replay, summarize, evaluatePostChecks, DEFAULT_INVENTORY, DEFAULT_MIGRATIONS_DIR,
} from "./replay-migrations.mjs";

const INVENTORY = [
  "# Migrations Inventory",
  "| # | File | Subject (from header comment) |",
  "|---|---|---|",
  "| 001 | 001_schema.sql | FSI Phase 2: Database Schema |",
  "| 006 | 006_multi_tenant.sql | multi tenant |",
  "| 006 | 006_rls_multi_tenant.sql | rls for multi tenant |",
  "| 007 | 007_old_thing.sql | NEVER APPLIED, retired \\| kept for history |",
  "| 009 | 009_capture.sql | capture |",
  "| 010 | 010_listed_but_gone.sql | gone |",
  "",
  "## Source files",
].join("\n");

const DISK = ["001_schema.sql", "006_multi_tenant.sql", "006_rls_multi_tenant.sql", "007_old_thing.sql", "009_capture.sql", "011_unlisted.sql"];

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), "replay-fixture-"));
  for (const f of DISK) writeFileSync(join(dir, f), `-- ${f}\nSELECT 1;\nSELECT 2;\n`);
  return dir;
}

test("parseInventoryOrder reads rows in listed order, including a subject with an escaped pipe", () => {
  const rows = parseInventoryOrder(INVENTORY);
  assert.deepEqual(rows.map((r) => r.file), ["001_schema.sql", "006_multi_tenant.sql", "006_rls_multi_tenant.sql", "007_old_thing.sql", "009_capture.sql", "010_listed_but_gone.sql"]);
  assert.equal(rows[3].subject, "NEVER APPLIED, retired \\| kept for history");
});

test("the real inventory parses to one row per migration file on disk", () => {
  const rows = parseInventoryOrder(readFileSync(DEFAULT_INVENTORY, "utf8"));
  const disk = JSON.parse(JSON.stringify(rows.map((r) => r.file)));
  assert.ok(disk.length > 300, `expected the full inventory, got ${disk.length}`);
  assert.equal(new Set(disk).size, disk.length, "inventory lists a file twice");
  assert.ok(DEFAULT_MIGRATIONS_DIR.endsWith("migrations"));
});

test("prefixReport names duplicate prefixes and absent numbers", () => {
  const r = prefixReport(["001_a.sql", "006_a.sql", "006_b.sql", "009_c.sql"]);
  assert.deepEqual(r.duplicates, [{ prefix: "006", files: ["006_a.sql", "006_b.sql"] }]);
  assert.deepEqual(r.gaps, ["002", "003", "004", "005", "007", "008"]);
});

test("planReplay: inventory order, duplicates and gaps named, unlisted reported not applied, absent reported", () => {
  const plan = planReplay(parseInventoryOrder(INVENTORY), DISK);
  assert.deepEqual(plan.ordered.map((o) => o.file), ["001_schema.sql", "006_multi_tenant.sql", "006_rls_multi_tenant.sql", "007_old_thing.sql", "009_capture.sql"]);
  assert.deepEqual(plan.notInInventory, ["011_unlisted.sql"]);
  assert.deepEqual(plan.missingOnDisk, ["010_listed_but_gone.sql"]);
  assert.deepEqual(plan.duplicates, [{ prefix: "006", files: ["006_multi_tenant.sql", "006_rls_multi_tenant.sql"] }]);
  assert.ok(plan.gaps.includes("008"));
});

test("parseTolerate requires a reason and an owner on every entry", () => {
  assert.deepEqual(parseTolerate(null).errors, []);
  assert.equal(parseTolerate("{not json").errors.length, 1);
  const bad = parseTolerate(JSON.stringify({ skip: [{ file: "a.sql", reason: "r" }], tolerate: [{ file: "b.sql", owner: "o" }] }));
  assert.equal(bad.errors.length, 2);
  const ok = parseTolerate(JSON.stringify({ skip: [{ file: "a.sql", reason: "r", owner: "o" }] }));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.tolerate.skip.length, 1);
});

test("parsePsqlOutput reads NOTICE self-checks and the first error with its statement", () => {
  const text = "-- header\nCREATE TABLE a (id int);\nSELECT * FROM missing_table;\n";
  const stderr = [
    "psql:/work/m.sql:2: NOTICE:  self-check ok: 0 rows",
    'psql:/work/m.sql:3: ERROR:  relation "missing_table" does not exist',
    "LINE 1: SELECT * FROM missing_table;",
    "                      ^",
  ].join("\n");
  const r = parsePsqlOutput(stderr, text);
  assert.deepEqual(r.notices, ["self-check ok: 0 rows"]);
  assert.equal(r.error.line, 3);
  assert.equal(r.error.message, 'relation "missing_table" does not exist');
  assert.equal(r.error.statement, "SELECT * FROM missing_table;");
  assert.equal(r.error.context.length, 2);
});

test("parsePsqlOutput copes with a path that contains a colon", () => {
  const r = parsePsqlOutput("psql:C:\\work\\m.sql:7: ERROR:  boom", "a\nb\nc\nd\ne\nf\ng\n");
  assert.equal(r.error.line, 7);
  assert.equal(r.error.message, "boom");
});

test("ATTACK: a non-loopback database URL is refused before anything runs", () => {
  for (const u of ["postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres", "postgresql://u:p@10.0.0.4:5432/db", "not a url"]) {
    assert.throws(() => assertLoopbackDbUrl(u), /loopback/);
  }
  assert.equal(assertLoopbackDbUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres"), "127.0.0.1");
});

function fakePsql({ failOn = {}, probe } = {}) {
  const calls = [];
  const spawn = (_bin, args) => {
    if (args.includes("-c")) {
      calls.push("(probe)");
      return { status: 0, stdout: JSON.stringify(probe ?? GOOD_PROBE), stderr: "" };
    }
    const file = args[args.indexOf("-f") + 1];
    const name = file.split(/[\\/]/).pop();
    calls.push(name);
    if (failOn[name]) return { status: 3, stdout: "", stderr: `psql:${file}:2: ERROR:  ${failOn[name]}\n` };
    return { status: 0, stdout: "", stderr: `psql:${file}:2: NOTICE:  ${name} self-check ok\n` };
  };
  return { spawn, calls };
}

const GOOD_PROBE = { tables: 108, system_state: true, harness_runs: true, harness_runs_rls: true, triggers: ["guard_judgement_drain_writer_trg", "guard_pause_flag_writer_trg"] };

function run(opts = {}) {
  const dir = fixtureDir();
  try {
    const { spawn, calls } = fakePsql(opts);
    const plan = planReplay(parseInventoryOrder(INVENTORY), DISK, opts.tolerate);
    const report = replay({ plan, tolerate: opts.tolerate, migrationsDir: dir, dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", spawn, continueOnError: opts.continueOnError, expectedTables: 108 });
    return { report, calls };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("replay applies every planned file in inventory order and records notices", () => {
  const { report, calls } = run();
  assert.deepEqual(calls.filter((c) => c !== "(probe)"), ["001_schema.sql", "006_multi_tenant.sql", "006_rls_multi_tenant.sql", "007_old_thing.sql", "009_capture.sql"]);
  assert.equal(report.applied, 5);
  assert.equal(report.ok, true);
  assert.deepEqual(report.files[0].notices, ["001_schema.sql self-check ok"]);
  assert.deepEqual(report.skipped_not_applied, []);
  assert.deepEqual(report.applied_without_file, []);
  assert.deepEqual(report.not_in_inventory, ["011_unlisted.sql"]);
  assert.deepEqual(report.missing_on_disk, ["010_listed_but_gone.sql"]);
  assert.equal(report.post_info.delta, 0);
});

test("replay stops at the first error with the file, the message and the statement", () => {
  const { report, calls } = run({ failOn: { "006_rls_multi_tenant.sql": 'relation "x" does not exist' } });
  assert.equal(report.stopped_at, "006_rls_multi_tenant.sql");
  assert.equal(report.failed, 1);
  assert.equal(report.ok, false);
  assert.ok(!calls.includes("009_capture.sql"), "ran past the failure");
  const failed = report.files.find((f) => f.status === "failed");
  assert.equal(failed.error.message, 'relation "x" does not exist');
  assert.equal(failed.error.line, 2);
  assert.equal(failed.error.statement, "SELECT 1;");
  assert.match(summarize(report), /FAILED 006_rls_multi_tenant\.sql line 2/);
  assert.equal(report.post_checks.length, 0, "no post checks after a stopped replay");
});

test("--continue-on-error attempts every file and records every failure", () => {
  const { report } = run({ continueOnError: true, failOn: { "001_schema.sql": "boom one", "009_capture.sql": "boom two" } });
  assert.equal(report.failed, 2);
  assert.equal(report.applied, 3);
  assert.equal(report.stopped_at, null);
  assert.equal(report.ok, false);
});

test("a tolerated error is recorded with its reason and owner and does not stop the replay", () => {
  const tolerate = { skip: [], tolerate: [{ file: "007_old_thing.sql", error_contains: "already exists", reason: "retired file re-creates an existing object", owner: "coordinator" }] };
  const { report } = run({ tolerate, failOn: { "007_old_thing.sql": 'relation "t" already exists' } });
  assert.equal(report.tolerated, 1);
  assert.equal(report.files.find((f) => f.status === "tolerated").owner, "coordinator");
  assert.equal(report.ok, true);
});

test("a tolerate entry whose error text does not match does not tolerate the failure", () => {
  const tolerate = { skip: [], tolerate: [{ file: "007_old_thing.sql", error_contains: "already exists", reason: "r", owner: "o" }] };
  const { report } = run({ tolerate, failOn: { "007_old_thing.sql": "permission denied" } });
  assert.equal(report.failed, 1);
  assert.equal(report.ok, false);
});

test("a skipped file is not run and is recorded with its reason and owner", () => {
  const tolerate = { skip: [{ file: "007_old_thing.sql", reason: "marked NEVER APPLIED", owner: "coordinator" }], tolerate: [] };
  const { report, calls } = run({ tolerate });
  assert.ok(!calls.includes("007_old_thing.sql"));
  assert.equal(report.skipped, 1);
  assert.equal(report.files.find((f) => f.status === "skipped").reason, "marked NEVER APPLIED");
});

test("a failed post check fails the report", () => {
  const { report } = run({ probe: { ...GOOD_PROBE, harness_runs_rls: false } });
  assert.equal(report.ok, false);
  assert.deepEqual(report.post_checks.filter((c) => !c.ok).map((c) => c.name), ["harness_runs has row level security on"]);
});

test("evaluatePostChecks reports the table-count delta against the catalog without failing on it", () => {
  const ev = evaluatePostChecks({ ...GOOD_PROBE, tables: 111 }, 108);
  assert.equal(ev.info.delta, 3);
  assert.ok(ev.checks.every((c) => c.ok));
});

const APPLIED = [
  { version: "001", name: "schema" },
  { version: "006", name: "multi_tenant" },
  { version: "20260712185517", name: "007_old_thing" },
  { version: "20260801004400", name: "capture" },
];

test("appliedRowMatchesFile: short version plus name, whole base name, or timestamp version plus rest", () => {
  assert.equal(appliedRowMatchesFile({ version: "001", name: "schema" }, "001_schema.sql"), true);
  assert.equal(appliedRowMatchesFile({ version: "20260712185517", name: "201_pause_flag" }, "201_pause_flag.sql"), true);
  assert.equal(appliedRowMatchesFile({ version: "20260715145217", name: "agent_runs_model_column" }, "255_agent_runs_model_column.sql"), true);
  assert.equal(appliedRowMatchesFile({ version: "006", name: "multi_tenant" }, "006_rls_multi_tenant.sql"), false);
  assert.equal(appliedRowMatchesFile({ version: "007", name: "capture" }, "009_capture.sql"), false);
});

test("applied filter: a file with no applied row is SKIPPED and listed, the rest are planned", () => {
  const plan = planReplay(parseInventoryOrder(INVENTORY), DISK, {}, APPLIED);
  assert.deepEqual(plan.skippedNotApplied, ["006_rls_multi_tenant.sql"]);
  assert.equal(plan.ordered.find((o) => o.file === "006_rls_multi_tenant.sql").skip.owner, "applied-migrations.json");
  assert.deepEqual(plan.appliedWithoutFile, []);
});

test("applied filter in a replay: the skipped file is not run and the report lists it", () => {
  const dir = fixtureDir();
  try {
    const { spawn, calls } = fakePsql();
    const plan = planReplay(parseInventoryOrder(INVENTORY), DISK, {}, APPLIED);
    const report = replay({ plan, migrationsDir: dir, dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", spawn, expectedTables: 108 });
    assert.ok(!calls.includes("006_rls_multi_tenant.sql"));
    assert.deepEqual(report.skipped_not_applied, ["006_rls_multi_tenant.sql"]);
    assert.equal(report.skipped, 1);
    assert.equal(report.ok, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("FINDING, not a gate: an applied version with no file is listed and the replay still runs every planned file", () => {
  const dir = fixtureDir();
  try {
    const { spawn, calls } = fakePsql();
    const applied = [...APPLIED, { version: "300", name: "ghost_migration" }];
    const plan = planReplay(parseInventoryOrder(INVENTORY), DISK, {}, applied);
    assert.deepEqual(plan.appliedWithoutFile, [{ version: "300", name: "ghost_migration" }]);
    const report = replay({ plan, migrationsDir: dir, dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", spawn, continueOnError: true, expectedTables: 108 });
    assert.ok(calls.filter((c) => c !== "(probe)").length >= 4, "the replay must run despite the finding");
    assert.equal(report.refused, undefined);
    assert.deepEqual(report.applied_without_file, [{ version: "300", name: "ghost_migration" }]);
    assert.equal(report.ok, true);
    assert.match(summarize(report), /FINDING applied row with no file: 300 ghost_migration/);
    assert.match(summarize(report), /FINDING file with no applied row \(skipped\): 006_rls_multi_tenant\.sql/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("matchApplied reports every applied row that matches no file", () => {
  const r = matchApplied([{ version: "001", name: "schema" }, { version: "9", name: "x" }], ["001_schema.sql"]);
  assert.deepEqual([...r.appliedFiles], ["001_schema.sql"]);
  assert.deepEqual(r.appliedWithoutFile, [{ version: "9", name: "x" }]);
});

test("the committed applied inventory loads and matches most of the real migration files", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { DEFAULT_APPLIED } = await import("./replay-migrations.mjs");
  const inv = JSON.parse(readFileSync(DEFAULT_APPLIED, "utf8"));
  assert.equal(inv.count, inv.migrations.length);
  const files = readdirSync(DEFAULT_MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const { appliedFiles } = matchApplied(inv.migrations, files);
  assert.ok(appliedFiles.size > 250, "expected most files to match an applied row, got " + appliedFiles.size);
});
