/** Tests for scripts/proof/replay-migrations.mjs (lane PROOF-1). A fixture directory with a duplicate numeric
 *  prefix (006 x2), a gap, a file the inventory does not list and a listed file that is absent proves the planning;
 *  a fixture APPLIED-MAP with one entry per class proves which files apply, which are satisfied and which skip; a
 *  fake psql proves the stop rule, the refusals and the report. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseInventoryOrder, prefixReport, planReplay, parsePsqlOutput,
  assertLoopbackDbUrl, replay, summarize, evaluatePostChecks, DEFAULT_INVENTORY, DEFAULT_MIGRATIONS_DIR, DEFAULT_MAP,
} from "./replay-migrations.mjs";

const INVENTORY = [
  "# Migrations Inventory",
  "| # | File | Subject (from header comment) |",
  "|---|---|---|",
  "| 001 | 001_schema.sql | FSI Phase 2: Database Schema |",
  "| 002 | 002_cmt.sql | comments only |",
  "| 003 | 003_code.sql | code differs |",
  "| 006 | 006_multi_tenant.sql | multi tenant |",
  "| 006 | 006_rls_multi_tenant.sql | rls for multi tenant |",
  "| 007 | 007_never.sql | NEVER APPLIED, retired \\| kept for history |",
  "| 008 | 008_late.sql | later capture |",
  "| 009 | 009_live.sql | live outside the ledger |",
  "| 010 | 010_rec.sql | recovered |",
  "| 011 | 011_listed_but_gone.sql | gone |",
  "",
  "## Source files",
].join("\n");

const DISK = ["001_schema.sql", "002_cmt.sql", "003_code.sql", "006_multi_tenant.sql", "006_rls_multi_tenant.sql", "007_never.sql", "008_late.sql", "009_live.sql", "010_rec.sql", "012_unlisted.sql"];

const LEDGER = [
  { version: "001", name: "schema" }, { version: "002", name: "cmt" }, { version: "003", name: "code" }, { version: "006", name: "multi_tenant" },
  { version: "20260701000000", name: "retro" }, { version: "20260702000000", name: "load" }, { version: "20260703000000", name: "cmt_only" }, { version: "20260704000000", name: "rec" },
];
const MAP = {
  "001": { name: "schema", file: "001_schema.sql", class: "identical" },
  "002": { name: "cmt", file: "002_cmt.sql", class: "comments-only" },
  "003": { name: "code", file: "003_code.sql", class: "code-differs" },
  "006": { name: "multi_tenant", file: "006_multi_tenant.sql", class: "identical" },
  "20260701000000": { name: "retro", file: null, class: "superseded-by", superseded_by: "008_late.sql" },
  "20260702000000": { name: "load", file: null, class: "data-only" },
  "20260703000000": { name: "cmt_only", file: null, class: "comment-only" },
  "20260704000000": { name: "rec", file: "010_rec.sql", class: "recovered" },
  "outside:009": { name: "live", file: "009_live.sql", class: "outside-ledger" },
  "dup:006rls": { name: "rls", file: "006_rls_multi_tenant.sql", class: "duplicate-prefix" },
};
const MAP_TEXT = JSON.stringify(MAP);
const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// 007 is named by no map entry; its own header says NOT APPLIED, which is what makes it never-applied (derived, MIGTEST-1).
const fixtureText = (f) => (f === "007_never.sql" ? "-- 007_never.sql\n--\n-- NOT APPLIED. Retired.\nSELECT 1;\n" : `-- ${f}\nSELECT 1;\nSELECT 2;\n`);

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), "replay-fixture-"));
  for (const f of DISK) writeFileSync(join(dir, f), fixtureText(f));
  return dir;
}

test("parseInventoryOrder reads rows in listed order, including a subject with an escaped pipe", () => {
  const rows = parseInventoryOrder(INVENTORY);
  assert.equal(rows[0].file, "001_schema.sql");
  assert.equal(rows.find((r) => r.file === "007_never.sql").subject, "NEVER APPLIED, retired \\| kept for history");
});

test("the real inventory parses to one row per migration file on disk", () => {
  const rows = parseInventoryOrder(readFileSync(DEFAULT_INVENTORY, "utf8"));
  assert.ok(rows.length > 300, `expected the full inventory, got ${rows.length}`);
  assert.equal(new Set(rows.map((r) => r.file)).size, rows.length, "inventory lists a file twice");
  assert.ok(DEFAULT_MIGRATIONS_DIR.endsWith("migrations"));
});

test("prefixReport names duplicate prefixes and absent numbers", () => {
  const r = prefixReport(["001_a.sql", "006_a.sql", "006_b.sql", "009_c.sql"]);
  assert.deepEqual(r.duplicates, [{ prefix: "006", files: ["006_a.sql", "006_b.sql"] }]);
  assert.deepEqual(r.gaps, ["002", "003", "004", "005", "007", "008"]);
});

test("planReplay with the map: apply classes and outside-ledger in inventory order; satisfied and skipped listed", () => {
  const plan = planReplay(parseInventoryOrder(INVENTORY), DISK, LEDGER, MAP_TEXT, fixtureText);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.ordered.map((o) => [o.file, o.class]), [
    ["001_schema.sql", "identical"], ["002_cmt.sql", "comments-only"], ["003_code.sql", "code-differs"], ["006_multi_tenant.sql", "identical"],
    ["009_live.sql", "outside-ledger"], ["010_rec.sql", "recovered"],
  ]);
  assert.deepEqual(plan.satisfied.map((s) => s.class).sort(), ["comment-only", "data-only", "superseded-by"]);
  assert.deepEqual(plan.skipped.map((s) => [s.file, s.class]), [["006_rls_multi_tenant.sql", "duplicate-prefix"], ["007_never.sql", "never-applied"]]);
  assert.deepEqual(plan.notInInventory, ["012_unlisted.sql"]);
  assert.deepEqual(plan.missingOnDisk, ["011_listed_but_gone.sql"]);
  assert.deepEqual(plan.unreferenced, ["012_unlisted.sql"]);
});

test("ERROR: the map file absent is an error naming it and MIG-HIST-1 (red until it lands)", () => {
  const plan = planReplay(parseInventoryOrder(INVENTORY), DISK, LEDGER, null);
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0].message, /APPLIED-MAP\.json is absent.*MIG-HIST-1/);
  assert.deepEqual(plan.ordered, []);
});

test("ERROR: a ledger version absent from the map, and a map entry whose file is missing", () => {
  const noEntry = { ...MAP };
  delete noEntry["002"];
  assert.deepEqual(planReplay(parseInventoryOrder(INVENTORY), DISK, LEDGER, JSON.stringify(noEntry), fixtureText).errors.map((e) => e.kind), ["ledger_version_not_in_map"]);
  const missing = planReplay(parseInventoryOrder(INVENTORY), DISK.filter((f) => f !== "003_code.sql"), LEDGER, MAP_TEXT, fixtureText);
  assert.ok(missing.errors.some((e) => e.kind === "entry_file_missing" && e.file === "003_code.sql"));
});

test("the committed map path is the one MIG-HIST-1 owns", () => {
  assert.ok(DEFAULT_MAP.replace(/\\/g, "/").endsWith("fsi-app/supabase/migrations/APPLIED-MAP.json"));
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
  assert.equal(assertLoopbackDbUrl(URL_LOCAL), "127.0.0.1");
});

const GOOD_PROBE = { tables: 108, system_state: true, harness_runs: true, harness_runs_rls: true, triggers: ["guard_judgement_drain_writer_trg", "guard_pause_flag_writer_trg"] };

function fakePsql({ failOn = {}, probe } = {}) {
  const calls = [];
  const spawn = (_bin, args) => {
    if (args.includes("-c")) { calls.push("(probe)"); return { status: 0, stdout: JSON.stringify(probe ?? GOOD_PROBE), stderr: "" }; }
    const file = args[args.indexOf("-f") + 1];
    const name = file.split(/[\\/]/).pop();
    calls.push(name);
    if (failOn[name]) return { status: 3, stdout: "", stderr: `psql:${file}:2: ERROR:  ${failOn[name]}\n` };
    return { status: 0, stdout: "", stderr: `psql:${file}:2: NOTICE:  ${name} self-check ok\n` };
  };
  return { spawn, calls };
}

function run({ failOn, probe, mapText = MAP_TEXT, ledger = LEDGER } = {}) {
  const dir = fixtureDir();
  try {
    const { spawn, calls } = fakePsql({ failOn, probe });
    const plan = planReplay(parseInventoryOrder(INVENTORY), DISK, ledger, mapText, fixtureText);
    const report = replay({ plan, migrationsDir: dir, dbUrl: URL_LOCAL, spawn, expectedTables: 108 });
    return { report, calls };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("replay applies exactly the planned files in order, never a satisfied or skipped one", () => {
  const { report, calls } = run();
  assert.deepEqual(calls.filter((c) => c !== "(probe)"), ["001_schema.sql", "002_cmt.sql", "003_code.sql", "006_multi_tenant.sql", "009_live.sql", "010_rec.sql"]);
  assert.equal(report.applied, 6);
  assert.equal(report.ok, true);
  assert.equal(report.satisfied_count, 3);
  assert.equal(report.skipped_count, 2);
  assert.deepEqual(report.files[0].notices, ["001_schema.sql self-check ok"]);
  assert.equal(report.post_info.delta, 0);
  const text = summarize(report);
  assert.match(text, /satisfied 20260701000000 \(superseded-by\) by 008_late\.sql/);
  assert.match(text, /skipped 007_never\.sql \(never-applied\)/);
});

test("replay stops at the first error with the file, the message and the statement", () => {
  const { report, calls } = run({ failOn: { "003_code.sql": 'relation "x" does not exist' } });
  assert.equal(report.stopped_at, "003_code.sql");
  assert.equal(report.failed, 1);
  assert.equal(report.ok, false);
  assert.ok(!calls.includes("009_live.sql"), "ran past the failure");
  const failed = report.files.find((f) => f.status === "failed");
  assert.equal(failed.error.line, 2);
  assert.equal(failed.error.statement, "SELECT 1;");
  assert.match(summarize(report), /FAILED 003_code\.sql line 2/);
  assert.equal(report.post_checks.length, 0, "no post checks after a stopped replay");
});

test("ERROR: an absent map refuses the replay, runs nothing and says why", () => {
  const { report, calls } = run({ mapText: null });
  assert.equal(calls.length, 0, "psql was called on a refused replay");
  assert.equal(report.refused, true);
  assert.equal(report.ok, false);
  assert.match(summarize(report), /REFUSED/);
  assert.match(summarize(report), /APPLIED-MAP\.json is absent/);
});

test("ERROR: a ledger version with no map entry refuses the replay and names it", () => {
  const { report, calls } = run({ ledger: [...LEDGER, { version: "300", name: "ghost_migration" }] });
  assert.equal(calls.length, 0);
  assert.equal(report.refused, true);
  assert.match(summarize(report), /ledger_version_not_in_map 300/);
});

test("there is no tolerate list, skip list or continue-on-error mode", async () => {
  const mod = await import("./replay-migrations.mjs");
  assert.equal(mod.parseTolerate, undefined);
  assert.equal(mod.appliedRowMatchesFile, undefined, "name matching is replaced by the map");
  const src = readFileSync(new URL("./replay-migrations.mjs", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/continueOnError|--continue-on-error"/.test(src));
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

test("with the real tree and no map present, the plan refuses (the honest red state until MIG-HIST-1 lands)", async () => {
  const { parseAppliedInventory } = await import("./sync-applied-migrations.mjs");
  const ledger = parseAppliedInventory(readFileSync(new URL("../../docs/inventories/applied-migrations.json", import.meta.url), "utf8"));
  const rows = parseInventoryOrder(readFileSync(DEFAULT_INVENTORY, "utf8"));
  const disk = readdirSync(DEFAULT_MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const mapText = existsSync(DEFAULT_MAP) ? readFileSync(DEFAULT_MAP, "utf8") : null;
  const plan = planReplay(rows, disk, ledger, mapText, (f) => readFileSync(join(DEFAULT_MIGRATIONS_DIR, f), "utf8"));
  if (mapText === null) assert.equal(plan.errors[0].kind, "map_absent_or_invalid");
  else assert.ok(Array.isArray(plan.errors));
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS ───────────────────────────
test("GATE-9 exit status: replay-migrations.mjs exits 2 with no database URL and 2 for a non-loopback one (it never reaches a database)", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { withoutCredentials } = await import("../lib/env-file.mjs");
  const script = fileURLToPath(new URL("./replay-migrations.mjs", import.meta.url));
  const env = { ...withoutCredentials(), PROOF_DB_URL: "", SUPABASE_DB_URL: "", CHAIN_PROOF_LOCAL: "" };
  const none = spawnSync(process.execPath, [script], { encoding: "utf8", env });
  assert.equal(none.status, 2, none.stdout + none.stderr);
  assert.match(none.stderr, /no database URL/);
  const remote = spawnSync(process.execPath, [script, "--db-url", "postgresql://u:p@db.example.com:5432/postgres"], { encoding: "utf8", env });
  assert.equal(remote.status, 2, remote.stdout + remote.stderr);
});
