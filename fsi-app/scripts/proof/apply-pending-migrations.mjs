#!/usr/bin/env node
// apply-pending-migrations.mjs -- run every migration that production has NOT applied yet on the disposable local
// stack, so a migration is proven by running before production sees it (lane MIG-CI, 2026-10-08; the apply step of
// .github/workflows/migration-proof.yml; docs/runbooks/maintenance.d/67-migration-proof.md).
//
// WHY. Three production applies aborted on 2026-10-08 on defects a run would have caught (372: a text/text[] coalesce, then
// a NOT NULL fixture; 370: a CHECK-list fixture value). Each migration's own self-check did its job at production and
// rolled back, but production was the first database to run the file. This step runs it first, on the stack.
//
// WHAT RUNS. The workflow has already replayed the applied set (replay-migrations.mjs, per APPLIED-MAP.json). This script
// then applies, in number order, each file production has not applied:
//   - every APPLIED-MAP.json entry of class never-applied (the map says production never applied the file), and
//   - every .sql file on disk that no map entry references (a file a PR adds is, by construction, not yet applied),
//   minus the files in EXCLUDED, by name, each with its reason.
// File headers are NOT the selector: several headers still say NOT APPLIED for applied migrations (replay-migrations.mjs
// header). The selection is planReplay()'s own output, the same plan the replay uses, so the two steps cannot disagree
// about which file is which.
//
// ONE FILE, ONE PSQL RUN, ON_ERROR_STOP, ONE TRANSACTION (runFileWithPsql, reused from the replay): the file's own
// self-check runs on the stack exactly as it will at production. The first failure stops the run and names the file,
// the line, the message, the statement and the raw psql error text. The stack holds no production data (this job has no
// production credential and no export step), so the error text carries no row of production.
//
// SAFETY. Loopback database URL only (assertLoopbackDbUrl; exit 2 otherwise). DRY BY DEFAULT: without --apply the script
// prints the selection and runs nothing.
//
// Usage: node scripts/proof/apply-pending-migrations.mjs [--apply] [--report <path>] [--db-url <url>]
//          [--migrations-dir <dir>] [--inventory <md>] [--applied <json>] [--map <json>] [--psql <bin>]
//   The database URL is --db-url, else PROOF_DB_URL.
// Exit: 0 = every selected file applied (or dry run, or nothing selected); 1 = a file failed or the map has errors;
//       2 = cannot run (no URL, not loopback, no psql with --apply, an unreadable input).

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import {
  DEFAULT_MIGRATIONS_DIR, DEFAULT_INVENTORY, DEFAULT_APPLIED, DEFAULT_MAP,
  parseInventoryOrder, planReplay, parsePsqlOutput, assertLoopbackDbUrl, runFileWithPsql,
} from "./replay-migrations.mjs";
import { parseAppliedInventory } from "./sync-applied-migrations.mjs";

const MAX_RAW = 20000;

/** Files this step never applies, by name, with the reason taken from the file's own header. */
export const EXCLUDED = Object.freeze({
  "299_item_type_required_slots_wave3.sql":
    "its header says LEFT UNAPPLIED (two-track policy): the coordinator applies it after reading its self-check count, in the population-pass sequence (self-check, apply 299, re-mint the same items)",
});

/** The numeric prefix of a file name, or Infinity. PURE. */
function prefixOf(file) {
  const m = /^(\d+)_/.exec(file);
  return m ? Number(m[1]) : Infinity;
}

/**
 * Choose the files to apply. PURE.
 * @param {object} plan  planReplay() output
 * @returns {{ apply: {file:string, source:string}[], excluded: {file:string, reason:string}[] }}
 */
export function selectPending(plan) {
  const picked = new Map();
  for (const s of plan.skipped ?? []) if (s.class === "never-applied") picked.set(s.file, "map: never-applied");
  for (const f of plan.unreferenced ?? []) if (!picked.has(f)) picked.set(f, "not in the map (a new file)");
  const apply = [];
  const excluded = [];
  for (const [file, source] of picked) {
    if (Object.hasOwn(EXCLUDED, file)) excluded.push({ file, reason: EXCLUDED[file] });
    else apply.push({ file, source });
  }
  const order = (a, b) => prefixOf(a.file) - prefixOf(b.file) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  apply.sort(order);
  excluded.sort(order);
  return { apply, excluded };
}

/**
 * Apply the selection. Everything external is injected, so tests need no database. Stops at the first failure.
 * @returns the report object (also what the CLI writes)
 */
export function applyPending({ selection, migrationsDir, dbUrl, psql = "psql", spawn = spawnSync, readFn = readFileSync, now = () => new Date(), apply = false }) {
  const startedAt = now().toISOString();
  const files = [];
  let stoppedAt = null;
  if (apply) {
    for (const item of selection.apply) {
      const path = join(migrationsDir, item.file);
      const text = readFn(path, "utf8");
      const run = runFileWithPsql({ psql, dbUrl, file: path, spawn });
      const parsed = parsePsqlOutput(run.stderr, text);
      if (run.status === 0) {
        files.push({ file: item.file, source: item.source, status: "applied", seconds: run.seconds, notices: parsed.notices });
        continue;
      }
      const error = parsed.error ?? { line: null, message: String(run.stderr).trim().split(/\r?\n/).pop()?.slice(0, 300) || `psql exited ${run.status}`, context: [], statement: null };
      files.push({ file: item.file, source: item.source, status: "failed", seconds: run.seconds, notices: parsed.notices, error, raw: String(run.stderr ?? "").slice(0, MAX_RAW) });
      stoppedAt = item.file;
      break;
    }
  }
  const failed = files.filter((f) => f.status === "failed").length;
  return {
    schema: "migration-proof-apply-report/1",
    started_at: startedAt,
    finished_at: now().toISOString(),
    mode: apply ? "apply" : "dry",
    selected: selection.apply.map((a) => a.file),
    excluded: selection.excluded,
    applied: files.filter((f) => f.status === "applied").length,
    failed,
    stopped_at: stoppedAt,
    files,
    ok: failed === 0 && !stoppedAt,
  };
}

/** One-screen text for the job log and step summary. PURE. */
export function summarize(report) {
  const lines = [
    `Pending migrations on the local stack (${report.mode}): ${report.ok ? "OK" : "FAILED"}`,
    `  selected ${report.selected.length}, applied ${report.applied}, failed ${report.failed}, excluded ${report.excluded.length}`,
  ];
  for (const f of report.selected) lines.push(`    selected ${f}`);
  for (const e of report.excluded) lines.push(`    excluded ${e.file}: ${e.reason}`);
  for (const f of report.files.filter((x) => x.status === "applied")) {
    lines.push(`    applied ${f.file} (${f.seconds}s)`);
    for (const n of f.notices.slice(0, 20)) lines.push(`      NOTICE ${n}`);
  }
  for (const f of report.files.filter((x) => x.status === "failed")) {
    lines.push(`  FAILED ${f.file}${f.error?.line ? ` line ${f.error.line}` : ""}: ${f.error?.message}`);
    if (f.error?.statement) lines.push(`    statement: ${f.error.statement}`);
    for (const c of f.error?.context ?? []) lines.push(`    ${c}`);
    lines.push("    full psql error text follows");
    for (const l of String(f.raw ?? "").split(/\r?\n/)) lines.push(`      ${l}`);
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (["--report", "--db-url", "--migrations-dir", "--inventory", "--psql", "--applied", "--map"].includes(a)) out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  const dbUrl = args.dbUrl || process.env.PROOF_DB_URL;
  if (!dbUrl) { console.error("apply-pending-migrations: no database URL (--db-url or PROOF_DB_URL); cannot run"); process.exit(2); }
  try { assertLoopbackDbUrl(dbUrl); } catch (e) { console.error(`apply-pending-migrations: ${e.message}`); process.exit(2); }
  const psql = args.psql || "psql";
  if (args.apply) {
    const probe = spawnSync(psql, ["--version"], { encoding: "utf8" });
    if (probe.error || probe.status !== 0) { console.error(`apply-pending-migrations: ${psql} is not available; cannot run`); process.exit(2); }
  }
  const migrationsDir = args.migrationsDir ? resolve(args.migrationsDir) : DEFAULT_MIGRATIONS_DIR;
  let plan;
  try {
    const inventoryRows = parseInventoryOrder(readFileSync(args.inventory ? resolve(args.inventory) : DEFAULT_INVENTORY, "utf8"));
    const diskFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const ledger = parseAppliedInventory(readFileSync(args.applied ? resolve(args.applied) : DEFAULT_APPLIED, "utf8"));
    let mapText = null;
    try { mapText = readFileSync(args.map ? resolve(args.map) : DEFAULT_MAP, "utf8"); } catch { mapText = null; }
    plan = planReplay(inventoryRows, diskFiles, ledger, mapText);
  } catch (e) { console.error(`apply-pending-migrations: an input was unreadable: ${e.message}`); process.exit(2); }
  if (plan.errors.length > 0) {
    console.error(`apply-pending-migrations: the applied map has ${plan.errors.length} error(s), so the pending set cannot be chosen:`);
    for (const e of plan.errors.slice(0, 40)) console.error(`  ${e.kind}${e.key ? " " + e.key : ""}${e.file ? " " + e.file : ""}: ${e.message}`);
    process.exit(1);
  }

  const report = applyPending({ selection: selectPending(plan), migrationsDir, dbUrl, psql, apply: args.apply });
  if (args.report) {
    mkdirSync(dirname(resolve(args.report)), { recursive: true });
    writeFileSync(resolve(args.report), JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  console.log(summarize(report));
  for (const f of report.files.filter((x) => x.status === "failed")) console.log(`::error title=Migration failed on the local stack::${f.file}${f.error?.line ? ` line ${f.error.line}` : ""}: ${f.error?.message}`);
  process.exit(report.ok ? 0 : 1);
}

if (isMainModule(import.meta.url)) main();
