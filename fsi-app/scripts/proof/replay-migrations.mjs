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
// ORDER (coordinator ruling 2026-10-08, lane MIG-CI). Files that stand for a ledger row apply in LEDGER ORDER, the
// map's ledger version per entry ascending (applied-map.mjs orderByLedger), never in the inventory's file number order:
// the ledger is the record of what ran and in what sequence. A file with no ledger row (outside-ledger) applies right
// after the ledgered file that precedes it in docs/inventories/migrations.md. The inventory is still read: it lists every
// migration file (number, file, subject), it anchors those outside-ledger files, and a file on disk it does not list is
// REPORTED and a file it lists that is absent on disk is REPORTED. Never-applied and unreferenced files are not replayed.
//
// WHICH FILES APPLY (coordinator ruling 2026-10-07). Production's ledger (fsi-app/docs/inventories/
// applied-migrations.json, production's list_migrations, synced by hand with scripts/proof/sync-applied-migrations.mjs)
// and the repo's files do not line up by name. The record of which file stands for which ledger row is
// fsi-app/supabase/migrations/APPLIED-MAP.json (lane MIG-HIST-1); scripts/proof/applied-map.mjs reads it. Per ledger
// version: a class with a file (identical, comments-only, code-differs, recovered) APPLIES that file, in ledger order
// (ORDER above); superseded-by, data-only and comment-only rows are SATISFIED with no file, counted
// and listed; outside-ledger files are APPLIED (they are live); duplicate-prefix files, and files the map names nowhere whose own header says NOT APPLIED (never-applied, derived, see applied-map.mjs),
// are SKIPPED and listed. ERRORS (the replay refuses, applies nothing, names them): the map file is absent (red until MIG-HIST-1
// lands, the honest state), a ledger version absent from the map, a map entry whose file is missing, an unknown class,
// a file to apply that the order inventory does not list. A header is evidence only for a file the map names nowhere (several headers still said NOT
// APPLIED for applied migrations until MIGTEST-1).
//
// THE REPLAY BUILDS THE PROOF SCHEMA (coordinator reversal 2026-10-07: no workarounds). The stack's schema is the
// repo files replayed here, onto the stack's empty database. A schema-only dump of production is the ORACLE: after
// the replay, schema-diff.mjs must find the replayed schema and the dump identical, or the job fails. Production's
// names diverge from the file names today, so the job is expected to be RED until lane MIG-HIST-1 lands the map and
// repairs the repo (docs/runbooks/maintenance.d/64-chain-proof.md says so, and names the gate that lifts it).
//
// STACK FIDELITY (lane MIG-CI, 2026-10-08). Before the first file the replay makes sure the stack has the Supabase-managed
// ledger table production has, supabase_migrations.schema_migrations (ensureLedgerTable): the local stack starts from an empty
// scratch directory, so the CLI never creates it, and the ledger repair 170 writes into it. The oracle compares schema public
// only, so this adds no compared object.
//
// STOP RULE. The first error stops the replay with the file name, the psql error and the statement at the reported
// line. There is no tolerate list, no skip list and no continue-on-error mode. This lane does not patch migrations.
//
// SAFETY. The database URL must name a loopback host or the runner refuses before running anything (exit 2).
// The report holds counts, file names, NOTICE lines (the migrations' own self-checks) and error text; the
// replay runs on an empty database, so no row can appear in it.
//
// Usage: node scripts/proof/replay-migrations.mjs --report <path> [--db-url <url>]
//          [--migrations-dir <dir>] [--inventory <md>] [--applied <json>] [--map <json>] [--psql <bin>]
//   The database URL is --db-url, else PROOF_DB_URL (the stack's own database, where the proof schema is built).
// Exit: 0 = every planned file applied and the post checks passed;
//       1 = a file failed, the map is absent or has errors, or a post check failed; 2 = cannot run (no URL, not
//       loopback, no psql, an unreadable inventory).

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isLoopbackHost } from "../lib/pg-conn.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { parseAppliedInventory } from "./sync-applied-migrations.mjs";
import { parseAppliedMap, resolveMap } from "./applied-map.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const REPO_ROOT = resolve(FSI_ROOT, "..");
export const DEFAULT_MIGRATIONS_DIR = resolve(FSI_ROOT, "supabase", "migrations");
export const DEFAULT_INVENTORY = resolve(REPO_ROOT, "docs", "inventories", "migrations.md");
export const DEFAULT_APPLIED = resolve(FSI_ROOT, "docs", "inventories", "applied-migrations.json");
export const DEFAULT_MAP = resolve(FSI_ROOT, "supabase", "migrations", "APPLIED-MAP.json");
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
 * @param {{prefix:string,file:string,subject:string}[]} inventoryRows  the order source (docs/inventories/migrations.md)
 * @param {string[]} diskFiles  the *.sql names found in the migrations directory
 * @param {{version:string,name:string}[]} ledger  production's applied ledger
 * @param {string|null} mapText  the text of APPLIED-MAP.json, or null when the file is absent
 * @param {(file:string) => string} [readFile]  text of a migration file, to derive never-applied from the header of a file the map names nowhere
 */
export function planReplay(inventoryRows, diskFiles, ledger, mapText, readFile) {
  const onDisk = new Set(diskFiles);
  const listed = new Set(inventoryRows.map((r) => r.file));
  const missingOnDisk = inventoryRows.filter((r) => !onDisk.has(r.file)).map((r) => r.file);
  const notInInventory = diskFiles.filter((f) => !listed.has(f)).sort();
  const parsed = parseAppliedMap(mapText);
  if (parsed.error) {
    return { ordered: [], missingOnDisk, notInInventory, satisfied: [], skipped: [], unreferenced: [], errors: [{ kind: "map_absent_or_invalid", message: parsed.error }], duplicates: [], gaps: [] };
  }
  const resolved = resolveMap({ ledger, map: parsed.map, diskFiles, orderFiles: inventoryRows.map((r) => r.file), readFile });
  return {
    ordered: resolved.toApply.map((t) => ({ file: t.file, class: t.class, key: t.key })),
    missingOnDisk,
    notInInventory,
    satisfied: resolved.satisfied,
    skipped: resolved.skipped,
    unreferenced: resolved.unreferenced,
    errors: resolved.errors,
    ...prefixReport(resolved.toApply.map((t) => t.file)),
  };
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

/**
 * True when the file holds a statement Postgres refuses inside a transaction block: CREATE INDEX CONCURRENTLY, DROP INDEX
 * CONCURRENTLY, REINDEX ... CONCURRENTLY (lane MIG-CI, replay run 37855793584: 260 was applied in production by direct psql for exactly
 * this reason, its header says so). Such a file is run without --single-transaction; ON_ERROR_STOP still stops it at the first error.
 * Comments are ignored. PURE.
 */
export function needsAutocommit(text) {
  const code = String(text ?? "").split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
  return /\bcreate\s+(unique\s+)?index\s+concurrently\b/i.test(code) || /\bdrop\s+index\s+concurrently\b/i.test(code) || /\breindex\b[^;]*\bconcurrently\b/i.test(code);
}

/** Run one file through psql. `spawn` is injectable. `text` (the file's source) decides single transaction or autocommit. Returns { status, stderr, seconds }. */
export function runFileWithPsql({ psql, dbUrl, file, text = null, spawn = spawnSync }) {
  const started = Date.now();
  const args = [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", ...(text != null && needsAutocommit(text) ? [] : ["--single-transaction"]), "-f", file];
  const r = spawn(psql, args, {
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
 * The Supabase-managed migration ledger table. Production has it (the CLI and the MCP apply tool write it); the local stack
 * starts from an empty scratch directory, so the CLI never creates it, and a migration that records into it (170, the ledger
 * repair) is refused with "relation does not exist" although nothing is wrong with the file (lane MIG-CI, replay run
 * 37782247331). The proof stack is made to have the object production has: schema supabase_migrations and the table with
 * the columns the migrations write. The schema oracle compares schema public only, so this changes no compared object.
 */
export const LEDGER_TABLE_SQL = "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);";

/** Make the stack's supabase_migrations.schema_migrations exist. `spawn` is injectable. Returns { ok, message }. */
export function ensureLedgerTable({ psql, dbUrl, spawn = spawnSync }) {
  const r = spawn(psql, [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-c", LEDGER_TABLE_SQL], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  if (r.error) return { ok: false, message: `could not run ${psql}: ${r.error.message}` };
  if (r.status !== 0) return { ok: false, message: String(r.stderr ?? "").trim().split(/\r?\n/).pop()?.slice(0, MAX_TEXT) || `psql exited ${r.status}` };
  return { ok: true, message: null };
}

/**
 * Run the replay. Everything external is injected, so tests need no database.
 * @returns the report object (also what the CLI writes).
 */
export function replay({ plan, migrationsDir, dbUrl, psql = "psql", spawn = spawnSync, readFn = readFileSync, now = () => new Date(), probe = probeDatabase, expectedTables = null, prelude = ensureLedgerTable }) {
  const startedAt = now().toISOString();
  const files = [];
  let stoppedAt = null;
  const refused = (plan.errors ?? []).length > 0;
  let preludeFailed = false;
  if (!refused) {
    const pre = prelude({ psql, dbUrl, spawn });
    if (!pre.ok) {
      preludeFailed = true;
      files.push({ file: "(stack prelude: supabase_migrations.schema_migrations)", status: "failed", seconds: 0, notices: [], error: { line: null, message: pre.message, context: [], statement: null } });
      stoppedAt = "(stack prelude)";
    }
  }

  for (const item of refused || preludeFailed ? [] : plan.ordered) {
    const path = join(migrationsDir, item.file);
    const text = readFn(path, "utf8");
    const run = runFileWithPsql({ psql, dbUrl, file: path, text, spawn });
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
  if (!stoppedAt && !refused) {
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
    planned: plan.ordered.length,
    applied: count("applied"),
    failed,
    satisfied_count: plan.satisfied.length,
    satisfied: plan.satisfied,
    skipped_count: plan.skipped.length,
    skipped: plan.skipped,
    unreferenced_files: plan.unreferenced,
    map_errors: plan.errors ?? [],
    stopped_at: stoppedAt,
    not_in_inventory: plan.notInInventory,
    missing_on_disk: plan.missingOnDisk,
    duplicate_prefixes: plan.duplicates,
    gaps: plan.gaps,
    post_checks: postChecks,
    post_info: postInfo,
    files,
  };
  report.refused = refused;
  report.ok = !refused && failed === 0 && !stoppedAt && postChecks.length > 0 && postChecks.every((c) => c.ok);
  return report;
}

/** One-screen text for the job log and step summary. PURE. Names files and counts only. */
export function summarize(report) {
  const lines = [
    `Migration replay: ${report.ok ? "OK" : "FAILED"}`,
    `  planned ${report.planned}, applied ${report.applied}, failed ${report.failed}; satisfied with no file of their own ${report.satisfied_count}; skipped (never applied or duplicate prefix) ${report.skipped_count}`,
    `  listed in inventory but absent on disk: ${report.missing_on_disk.length}; on disk but not in inventory: ${report.not_in_inventory.length}; on disk but referenced by no map entry: ${report.unreferenced_files.length}`,
    `  duplicate prefixes: ${report.duplicate_prefixes.map((d) => `${d.prefix} x${d.files.length}`).join(", ") || "none"}; absent numbers: ${report.gaps.length}; map errors: ${report.map_errors.length}`,
  ];
  for (const f of report.files.filter((x) => x.status === "failed")) {
    lines.push(`  FAILED ${f.file}${f.error?.line ? ` line ${f.error.line}` : ""}: ${f.error?.message}`);
    if (f.error?.statement) lines.push(`    statement: ${f.error.statement}`);
    for (const c of f.error?.context ?? []) lines.push(`    ${c}`);
  }
  if (report.refused) lines.push("  REFUSED: the applied map is absent or has errors; nothing was replayed. The errors:");
  for (const e of report.map_errors.slice(0, 80)) lines.push(`    ${e.kind}${e.key ? " " + e.key : ""}${e.file ? " " + e.file : ""}: ${e.message}`);
  if (report.map_errors.length > 80) lines.push(`    and ${report.map_errors.length - 80} more`);
  for (const s of report.satisfied.slice(0, 80)) lines.push(`    satisfied ${s.key} (${s.class})${s.superseded_by ? " by " + s.superseded_by : ""}`);
  for (const k of report.skipped) lines.push(`    skipped ${k.file} (${k.class})`);
  for (const c of report.post_checks.filter((x) => !x.ok)) lines.push(`  POST CHECK FAILED: ${c.name}`);
  if (report.post_info) lines.push(`  public tables ${report.post_info.public_tables}, committed catalog ${report.post_info.catalog_tables}, delta ${report.post_info.delta}`);
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--report", "--db-url", "--migrations-dir", "--inventory", "--psql", "--applied", "--map"].includes(a)) out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
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
  const mapPath = args.map ? resolve(args.map) : DEFAULT_MAP;
  let mapText = null;
  try { mapText = readFileSync(mapPath, "utf8"); } catch { mapText = null; }
  const plan = planReplay(inventoryRows, diskFiles, appliedRows, mapText, (f) => readFileSync(join(migrationsDir, f), "utf8"));

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
