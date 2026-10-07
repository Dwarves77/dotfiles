#!/usr/bin/env node
// replay-migrations.mjs -- apply every migration file to an EMPTY local database, in the order the repo's
// own migrations inventory records, and say what happened to each one (lane PROOF-1, 2026-10-07; the chain
// proof's step 4, docs/decisions/ADR-045-chain-proof-on-a-local-stack.md).
//
// WHY A RUNNER OF OUR OWN. The Supabase CLI keys supabase_migrations.schema_migrations on the numeric prefix,
// and this tree carries duplicate prefixes (006 x2, 007 x3) and 37 absent numbers. Migrations have only ever
// reached production through the MCP apply_migration tool and the Dashboard, so no from-scratch replay path
// exists. This runner applies each file itself, with psql, one file per transaction, against loopback only.
//
// ORDER. Lexical order of the filenames is a HYPOTHESIS for the duplicate-prefix files, so the order comes
// from docs/inventories/migrations.md, the generated page that lists every migration file (number, file,
// subject). That page is itself derived from the files in generator order, so for 006 and 007 it agrees with
// lexical order; it is the one list the repo keeps, and the first real run is what proves it. A file on disk
// that the inventory does not list is REPORTED and not applied. A file the inventory lists that is absent on
// disk is REPORTED.
//
// APPLIED SET (coordinator ruling 2026-10-07). The replay applies what production has applied, taken from the
// committed fsi-app/docs/inventories/applied-migrations.json (production's list_migrations, synced by hand with
// scripts/proof/sync-applied-migrations.mjs, which also owns the shape of that file), never from file headers:
// several headers still say NOT APPLIED for applied migrations and are stale. A file matches an applied row when
// (version, name) equals (file prefix, rest of the name), or the row's name is the whole file base name, or the row
// is timestamp-versioned and its name is the rest of the file name. A file with no match is SKIPPED and listed
// (skipped_not_applied). An applied row that matches no file is an ERROR (applied_without_file): the replay
// refuses to run, applies nothing, and names the rows.
//
// THE REPLAY BUILDS THE PROOF SCHEMA (coordinator reversal 2026-10-07: no workarounds). The stack's schema is the
// repo files replayed here, onto the stack's empty database. A schema-only dump of production is the ORACLE: after
// the replay, schema-diff.mjs must find the replayed schema and the dump identical, or the job fails. Production's
// names diverge from the file names today (352 applied rows, 46 with no file, 17 files with no applied row), so
// the job is expected to be RED until a migrations-history lane repairs the repo (docs/runbooks/maintenance.d/
// 64-chain-proof.md says so, and names the gate that lifts it).
//
// STOP RULE. The first error stops the replay with the file name, the psql error and the statement at the reported
// line. There is no tolerate list, no skip list and no continue-on-error mode. This lane does not patch migrations.
//
// SAFETY. The database URL must name a loopback host or the runner refuses before running anything (exit 2).
// The report holds counts, file names, NOTICE lines (the migrations' own self-checks) and error text; the
// replay runs on an empty database, so no row can appear in it.
//
// Usage: node scripts/proof/replay-migrations.mjs --report <path> [--db-url <url>]
//          [--migrations-dir <dir>] [--inventory <md>] [--applied <json>] [--psql <bin>]
//   The database URL is --db-url, else PROOF_DB_URL (the stack's own database, where the proof schema is built).
// Exit: 0 = every planned file applied and the post checks passed;
//       1 = a file failed, an applied row has no file, or a post check failed; 2 = cannot run (no URL, not
//       loopback, no psql, an unreadable inventory).

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isLoopbackHost } from "../lib/pg-conn.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { parseAppliedInventory } from "./sync-applied-migrations.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const REPO_ROOT = resolve(FSI_ROOT, "..");
export const DEFAULT_MIGRATIONS_DIR = resolve(FSI_ROOT, "supabase", "migrations");
export const DEFAULT_INVENTORY = resolve(REPO_ROOT, "docs", "inventories", "migrations.md");
export const DEFAULT_APPLIED = resolve(FSI_ROOT, "docs", "inventories", "applied-migrations.json");
export const DB_CATALOG = resolve(FSI_ROOT, ".discipline", "governance", "db-catalog.json");

const MAX_NOTICES_PER_FILE = 100;
const MAX_TEXT = 300;

/** The inventory rows in listed order. A row is `| NNN | file.sql | subject |`. PURE. */
export function parseInventoryOrder(markdown) {
  const rows = [];
  for (const line of String(markdown ?? "").split(/\r?\n/)) {
    const m = /^\|\s*(\d{3})\s*\|\s*(\S+\.sql)\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
    if (m) rows.push({ prefix: m[1], file: m[2], subject: m[3] });
  }
  return rows;
}

/** Does an applied row (production's version and name) correspond to this migration file name? PURE. */
export function appliedRowMatchesFile(row, file) {
  const m = /^(\d{3})_(.+)\.sql$/.exec(file);
  if (!m) return false;
  const [, num, rest] = m;
  const shortVersion = /^\d{3}$/.test(row.version);
  return (shortVersion && row.version === num && row.name === rest) || row.name === `${num}_${rest}` || (!shortVersion && row.name === rest);
}

/** Applied rows and files to each other. PURE. Returns { appliedFiles: Set, appliedWithoutFile: row[] }. */
export function matchApplied(appliedRows, files) {
  const appliedFiles = new Set();
  const appliedWithoutFile = [];
  for (const row of appliedRows) {
    const hits = files.filter((f) => appliedRowMatchesFile(row, f));
    for (const f of hits) appliedFiles.add(f);
    if (hits.length === 0) appliedWithoutFile.push({ version: row.version, name: row.name });
  }
  return { appliedFiles, appliedWithoutFile };
}

/** Duplicate numeric prefixes and absent numbers over the files that will be applied. PURE. */
export function prefixReport(files) {
  const byPrefix = new Map();
  for (const f of files) {
    const p = /^(\d+)_/.exec(f)?.[1];
    if (!p) continue;
    byPrefix.set(p, [...(byPrefix.get(p) ?? []), f]);
  }
  const duplicates = [...byPrefix.entries()].filter(([, list]) => list.length > 1).map(([prefix, list]) => ({ prefix, files: list }));
  const nums = [...byPrefix.keys()].map(Number).sort((a, b) => a - b);
  const gaps = [];
  if (nums.length) {
    const have = new Set(nums);
    for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (!have.has(n)) gaps.push(String(n).padStart(3, "0"));
  }
  return { duplicates, gaps };
}

/**
 * Plan the replay. PURE.
 * @param {{prefix:string,file:string,subject:string}[]} inventoryRows
 * @param {string[]} diskFiles  the *.sql names found in the migrations directory
 * @param {{version:string,name:string}[]|null} [appliedRows] production's applied list; null = no applied filter
 */
export function planReplay(inventoryRows, diskFiles, appliedRows = null) {
  const onDisk = new Set(diskFiles);
  const listed = new Set(inventoryRows.map((r) => r.file));
  const ordered = [];
  const missingOnDisk = [];
  const applied = appliedRows ? matchApplied(appliedRows, [...onDisk]) : null;
  const skippedNotApplied = [];
  for (const row of inventoryRows) {
    if (!onDisk.has(row.file)) { missingOnDisk.push(row.file); continue; }
    let skip = null;
    if (applied && !applied.appliedFiles.has(row.file)) {
      skip = { file: row.file, reason: "not in the applied-migrations inventory (production has not applied it)", owner: "applied-migrations.json" };
      skippedNotApplied.push(row.file);
    }
    ordered.push({ file: row.file, subject: row.subject, skip });
  }
  const notInInventory = diskFiles.filter((f) => !listed.has(f)).sort();
  return { ordered, missingOnDisk, notInInventory, skippedNotApplied, appliedWithoutFile: applied ? applied.appliedWithoutFile : [], ...prefixReport(ordered.map((o) => o.file)) };
}

/** Read what psql printed. PURE. `fileText` is the migration source, used to quote the failing statement. */
export function parsePsqlOutput(stderr, fileText = "") {
  const lines = String(stderr ?? "").split(/\r?\n/);
  const notices = [];
  let error = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const n = /NOTICE:\s*(.*)$/.exec(line);
    if (n && notices.length < MAX_NOTICES_PER_FILE) notices.push(n[1].slice(0, MAX_TEXT));
    if (!error) {
      const withLine = /^psql:.*?:(\d+):\s*ERROR:\s*(.*)$/.exec(line);
      const bare = withLine ? null : /^ERROR:\s*(.*)$/.exec(line);
      if (withLine || bare) {
        const lineNo = withLine ? Number(withLine[1]) : null;
        const context = [];
        for (let j = i + 1; j < lines.length && context.length < 6; j++) {
          if (/^(LINE \d+:|DETAIL:|HINT:|CONTEXT:|QUERY:|\s+\^)/.test(lines[j])) context.push(lines[j].slice(0, MAX_TEXT));
          else break;
        }
        const srcLines = String(fileText).split(/\r?\n/);
        error = {
          line: lineNo,
          message: (withLine ? withLine[2] : bare[1]).slice(0, MAX_TEXT),
          context,
          statement: lineNo && srcLines[lineNo - 1] != null ? srcLines[lineNo - 1].trim().slice(0, 240) : null,
        };
      }
    }
  }
  return { notices, error };
}

/** Refuse anything that is not a loopback URL. Throws a message that names no credential. */
export function assertLoopbackDbUrl(url) {
  let host = null;
  try { host = new URL(url).hostname; } catch { /* handled below */ }
  if (!isLoopbackHost(host)) throw new Error("the database URL does not name a loopback host; the replay refuses to run");
  return host;
}

/** Run one file through psql. `spawn` is injectable. Returns { status, stderr, seconds }. */
export function runFileWithPsql({ psql, dbUrl, file, spawn = spawnSync }) {
  const started = Date.now();
  const r = spawn(psql, [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", file], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PGCONNECT_TIMEOUT: "10" },
  });
  const errText = r.error ? `${r.stderr ?? ""}\nERROR: could not run ${psql}: ${r.error.message}` : (r.stderr ?? "");
  return { status: r.error ? 127 : r.status, stderr: errText, seconds: Math.round((Date.now() - started) / 100) / 10 };
}

const POST_QUERY = `select json_build_object(
  'tables', (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
  'system_state', to_regclass('public.system_state') is not null,
  'harness_runs', to_regclass('public.harness_runs') is not null,
  'harness_runs_rls', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.harness_runs')), false),
  'triggers', coalesce((select json_agg(tgname order by tgname) from pg_trigger
                         where tgname in ('guard_pause_flag_writer_trg', 'guard_judgement_drain_writer_trg') and not tgisinternal), '[]'::json)
)`;

/** Turn the post-replay probe into named checks. PURE. `expectedTables` comes from the committed db-catalog. */
export function evaluatePostChecks(probe, expectedTables = null) {
  const checks = [
    { name: "system_state table exists", ok: probe?.system_state === true },
    { name: "harness_runs table exists", ok: probe?.harness_runs === true },
    { name: "harness_runs has row level security on", ok: probe?.harness_runs_rls === true },
    { name: "guard_pause_flag_writer_trg exists", ok: (probe?.triggers ?? []).includes("guard_pause_flag_writer_trg") },
    { name: "guard_judgement_drain_writer_trg exists", ok: (probe?.triggers ?? []).includes("guard_judgement_drain_writer_trg") },
  ];
  const info = {
    public_tables: probe?.tables ?? null,
    catalog_tables: expectedTables,
    delta: probe?.tables != null && expectedTables != null ? probe.tables - expectedTables : null,
  };
  return { checks, info };
}

/** Run the post-replay probe through psql. `spawn` is injectable. Returns the parsed probe or null. */
export function probeDatabase({ psql, dbUrl, spawn = spawnSync }) {
  const r = spawn(psql, [dbUrl, "-X", "-At", "-c", POST_QUERY], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  if (r.error || r.status !== 0) return null;
  try { return JSON.parse(String(r.stdout).trim()); } catch { return null; }
}

/**
 * Run the replay. Everything external is injected, so tests need no database.
 * @returns the report object (also what the CLI writes).
 */
export function replay({ plan, migrationsDir, dbUrl, psql = "psql", spawn = spawnSync, readFn = readFileSync, now = () => new Date(), probe = probeDatabase, expectedTables = null }) {
  const startedAt = now().toISOString();
  const files = [];
  let stoppedAt = null;
  const refusedForApplied = (plan.appliedWithoutFile ?? []).length > 0;

  for (const item of refusedForApplied ? [] : plan.ordered) {
    if (item.skip) {
      files.push({ file: item.file, status: "skipped", seconds: 0, reason: item.skip.reason, owner: item.skip.owner });
      continue;
    }
    const path = join(migrationsDir, item.file);
    const text = readFn(path, "utf8");
    const run = runFileWithPsql({ psql, dbUrl, file: path, spawn });
    const parsed = parsePsqlOutput(run.stderr, text);
    if (run.status === 0) {
      files.push({ file: item.file, status: "applied", seconds: run.seconds, notices: parsed.notices });
      continue;
    }
    const error = parsed.error ?? { line: null, message: String(run.stderr).trim().split(/\r?\n/).pop()?.slice(0, MAX_TEXT) || `psql exited ${run.status}`, context: [], statement: null };
    files.push({ file: item.file, status: "failed", seconds: run.seconds, notices: parsed.notices, error });
    stoppedAt = item.file;
    break;
  }

  const count = (s) => files.filter((f) => f.status === s).length;
  let postChecks = [];
  let postInfo = null;
  if (!stoppedAt && !refusedForApplied) {
    const probed = probe({ psql, dbUrl, spawn });
    if (probed) {
      const ev = evaluatePostChecks(probed, expectedTables);
      postChecks = ev.checks;
      postInfo = ev.info;
    } else {
      postChecks = [{ name: "post-replay probe ran", ok: false }];
    }
  }

  const failed = count("failed");
  const report = {
    schema: "chain-proof-replay-report/1",
    started_at: startedAt,
    finished_at: now().toISOString(),
    inventory_rows: plan.ordered.length + plan.missingOnDisk.length,
    planned: plan.ordered.length,
    applied: count("applied"),
    failed,
    skipped: count("skipped"),
    attempted: files.filter((f) => f.status !== "skipped").length,
    stopped_at: stoppedAt,
    not_in_inventory: plan.notInInventory,
    missing_on_disk: plan.missingOnDisk,
    duplicate_prefixes: plan.duplicates,
    gaps: plan.gaps,
    skipped_not_applied: plan.skippedNotApplied ?? [],
    applied_without_file: plan.appliedWithoutFile ?? [],
    post_checks: postChecks,
    post_info: postInfo,
    files,
  };
  report.refused = refusedForApplied;
  report.ok = !refusedForApplied && failed === 0 && !stoppedAt && postChecks.length > 0 && postChecks.every((c) => c.ok);
  return report;
}

/** One-screen text for the job log and step summary. PURE. Names files and counts only. */
export function summarize(report) {
  const lines = [
    `Migration replay: ${report.ok ? "OK" : "FAILED"}`,
    `  planned ${report.planned}, applied ${report.applied}, failed ${report.failed}, skipped ${report.skipped}`,
    `  listed in inventory but absent on disk: ${report.missing_on_disk.length}; on disk but not in inventory (not applied): ${report.not_in_inventory.length}`,
    `  duplicate prefixes: ${report.duplicate_prefixes.map((d) => `${d.prefix} x${d.files.length}`).join(", ") || "none"}; absent numbers: ${report.gaps.length}`,
    `  skipped, not in the applied inventory: ${report.skipped_not_applied.length}; applied rows with no file (ERROR): ${report.applied_without_file.length}`,
  ];
  for (const f of report.files.filter((x) => x.status === "failed")) {
    lines.push(`  FAILED ${f.file}${f.error?.line ? ` line ${f.error.line}` : ""}: ${f.error?.message}`);
    if (f.error?.statement) lines.push(`    statement: ${f.error.statement}`);
    for (const c of f.error?.context ?? []) lines.push(`    ${c}`);
  }
  if (report.refused) lines.push("  REFUSED: applied rows with no migration file; nothing was replayed. The names:");
  for (const r of report.applied_without_file.slice(0, 80)) lines.push(`    applied row with no file: ${r.version} ${r.name}`);
  for (const f of report.skipped_not_applied) lines.push(`    file with no applied row (skipped): ${f}`);
  for (const c of report.post_checks.filter((x) => !x.ok)) lines.push(`  POST CHECK FAILED: ${c.name}`);
  if (report.post_info) lines.push(`  public tables ${report.post_info.public_tables}, committed catalog ${report.post_info.catalog_tables}, delta ${report.post_info.delta}`);
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--report", "--db-url", "--migrations-dir", "--inventory", "--psql", "--applied"].includes(a)) out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  const dbUrl = args.dbUrl || process.env.PROOF_DB_URL;
  if (!dbUrl) { console.error("replay-migrations: no database URL (--db-url or PROOF_DB_URL); cannot run"); process.exit(2); }
  try { assertLoopbackDbUrl(dbUrl); } catch (e) { console.error(`replay-migrations: ${e.message}`); process.exit(2); }
  const psql = args.psql || "psql";
  const probe = spawnSync(psql, ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) { console.error(`replay-migrations: ${psql} is not available; cannot run`); process.exit(2); }

  const migrationsDir = args.migrationsDir ? resolve(args.migrationsDir) : DEFAULT_MIGRATIONS_DIR;
  const inventoryPath = args.inventory ? resolve(args.inventory) : DEFAULT_INVENTORY;
  const inventoryRows = parseInventoryOrder(readFileSync(inventoryPath, "utf8"));
  if (inventoryRows.length === 0) { console.error("replay-migrations: the inventory lists no migration rows; cannot order the replay"); process.exit(2); }
  const diskFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  let appliedRows;
  try { appliedRows = parseAppliedInventory(readFileSync(args.applied ? resolve(args.applied) : DEFAULT_APPLIED, "utf8")); } catch (e) { console.error(`replay-migrations: applied-migrations inventory refused: ${e.message}`); process.exit(2); }
  const plan = planReplay(inventoryRows, diskFiles, appliedRows);

  let expectedTables = null;
  try { expectedTables = JSON.parse(readFileSync(DB_CATALOG, "utf8")).tables?.length ?? null; } catch { /* informational only */ }

  const report = replay({ plan, migrationsDir, dbUrl, psql, expectedTables });
  if (args.report) {
    mkdirSync(dirname(resolve(args.report)), { recursive: true });
    writeFileSync(resolve(args.report), JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  console.log(summarize(report));
  process.exit(report.ok ? 0 : 1);
}

if (isMainModule(import.meta.url)) main();
