#!/usr/bin/env node
// scripts/proof/load-subset.mjs -- PROOF-2 (lane proof2-subset, 2026-10-07): load the export-subset.mjs
// output into the chain proof's LOCAL stack, then set the copy's switches through the sanctioned RPCs.
//
// Safety shape, in order of what could go wrong:
//   - It refuses any connection string whose host is not loopback: this script can never load into
//     production, whatever the environment carries.
//   - The manifest's sha256 per file is verified before a row is inserted (a truncated or swapped file fails).
//   - Rows go in in manifest (foreign-key) order inside ONE transaction with SET LOCAL
//     session_replication_role = replica, so the provenance stamping and one-writer triggers cannot rewrite
//     rows that were already verified in production; the COMMIT puts the role back, and the script reads
//     `SHOW session_replication_role` afterwards and fails unless it is origin again.
//   - Counts are verified against the manifest per table. Tables the migrations already seed (reference
//     tables) load with ON CONFLICT DO NOTHING and are reported as preseeded, never silently merged.
//   - The switches (scrape cadence on, judgement drain off, processing not paused) are set ONLY through
//     admin_set_pause_state and admin_set_judgement_drain (migrations 201 and 354). A direct UPDATE of
//     system_state is never issued: the guards would bounce it, and the test asserts on the call log.
//   - harness_runs must be empty afterwards (the hop-order assertion downstream is exact) and no open
//     fleet-budget-halt flag may exist.
//   - The output is counts and table names only; no row content is ever read back or printed.
//
// scrape_cadence "on": the column's CHECK (migration 144) admits off|weekly|monthly; every reader treats
// anything but off as open (chained-dry-guard, pause logic), so the proof sets CADENCE_ON = weekly.
//
// Migration 356's self-check is an anonymous DO block inside the migration file, not a callable function, so
// it is NOT re-run here; the result records that with the reason (the corrections-after-load attack is the
// PROOF-4 lane's, in a rolled-back transaction).
//
// Exit codes: 0 loaded and verified; 1 failure; 2 no connection string.

import { hash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";

export const CADENCE_ON = "weekly";
export const ACTOR = "chain-proof";
const BATCH = 500;
const q = (ident) => `"${String(ident).replace(/"/g, '""')}"`;

/** True only for a loopback database host. Pure. */
export function isLoopbackConnString(cs) {
  try {
    const host = new URL(cs).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

/** Read and verify the manifest and every file hash. Returns [{table, rows:number, parsed:object[]}]. */
export function readSubset(dir, readFileFn = readFileSync) {
  const manifest = JSON.parse(readFileFn(join(dir, "manifest.json"), "utf8"));
  const tables = [];
  for (const t of manifest.tables) {
    const body = readFileFn(join(dir, t.file), "utf8");
    const sha = hash("sha256", body);
    if (sha !== t.sha256) throw new Error(`load-subset: sha256 mismatch for table ${t.table} (file changed since export)`);
    const parsed = body.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (parsed.length !== t.rows) throw new Error(`load-subset: file for table ${t.table} holds ${parsed.length} rows, manifest says ${t.rows}`);
    tables.push({ table: t.table, rows: t.rows, parsed });
  }
  return tables;
}

/**
 * @param {{client:{query:Function}, dir:string, readFileFn?:Function, log?:Function}} args
 * @returns {Promise<{tables:{table:string,rows:number,inserted:number,preseeded:boolean}[], switches:object, corrections_selfcheck:object}>}
 */
export async function loadSubset({ client, dir, readFileFn = readFileSync, log = (m) => console.log(m) }) {
  const subset = readSubset(dir, readFileFn);

  // local catalog: insertable columns per table (a generated column cannot be inserted)
  const insertable = new Map();
  for (const t of subset) {
    const r = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER'
          AND (identity_generation IS NULL OR identity_generation <> 'ALWAYS')`,
      [t.table],
    );
    if (r.rows.length === 0) throw new Error(`load-subset: table ${t.table} does not exist in the local stack (migration replay incomplete?)`);
    insertable.set(t.table, new Set(r.rows.map((x) => x.column_name)));
  }
  const pre = new Map();
  for (const t of subset) {
    const r = await client.query(`SELECT count(*)::int AS n FROM public.${q(t.table)}`);
    pre.set(t.table, r.rows[0].n);
  }

  const result = [];
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL session_replication_role = replica");
    for (const t of subset) {
      const keys = new Set();
      for (const row of t.parsed) for (const k of Object.keys(row)) if (insertable.get(t.table).has(k)) keys.add(k);
      const cols = [...keys];
      if (cols.length === 0) throw new Error(`load-subset: no insertable columns for ${t.table}`);
      const colList = cols.map(q).join(", ");
      let inserted = 0;
      for (const part of chunk(t.parsed, BATCH)) {
        const r = await client.query(
          `INSERT INTO public.${q(t.table)} (${colList})
           SELECT ${colList} FROM json_populate_recordset(NULL::public.${q(t.table)}, $1::json)
           ON CONFLICT DO NOTHING`,
          [JSON.stringify(part)],
        );
        inserted += r.rowCount ?? 0;
      }
      result.push({ table: t.table, rows: t.rows, inserted, preseeded: pre.get(t.table) > 0 });
    }
    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* connection gone */ }
    throw e;
  }
  const role = await client.query("SHOW session_replication_role");
  if (role.rows[0]?.session_replication_role !== "origin") throw new Error("load-subset: session_replication_role is not origin after the load (triggers still off)");

  // counts verified per table
  for (const t of result) {
    const r = await client.query(`SELECT count(*)::int AS n FROM public.${q(t.table)}`);
    const n = r.rows[0].n;
    if (!t.preseeded && n !== t.rows) throw new Error(`load-subset: count mismatch for ${t.table}: loaded ${n}, manifest ${t.rows}`);
    if (t.preseeded && n < t.rows) throw new Error(`load-subset: count mismatch for preseeded table ${t.table}: ${n} present, manifest ${t.rows}`);
  }

  // the proof starts with an empty ledger and no open halt
  const hr = await client.query("SELECT count(*)::int AS n FROM public.harness_runs");
  if (hr.rows[0].n !== 0) throw new Error(`load-subset: harness_runs holds ${hr.rows[0].n} rows; the proof needs an empty ledger`);
  const halt = await client.query("SELECT count(*)::int AS n FROM public.integrity_flags WHERE subject_ref = 'fleet-budget-halt' AND status = 'open'");
  if (halt.rows[0].n !== 0) throw new Error("load-subset: an open fleet-budget-halt flag exists in the copy");

  // the switches, through the sanctioned RPCs only
  await client.query("SELECT * FROM public.admin_set_pause_state($1::text, $2::boolean, $3::text)", [ACTOR, false, CADENCE_ON]);
  await client.query("SELECT * FROM public.admin_set_judgement_drain($1::text, $2::text)", [ACTOR, "off"]);
  const st = await client.query("SELECT scrape_cadence, global_processing_paused, judgement_drain FROM public.system_state WHERE id = true");
  const s = st.rows[0];
  if (!s) throw new Error("load-subset: system_state singleton missing");
  if (s.scrape_cadence !== CADENCE_ON || s.global_processing_paused !== false || s.judgement_drain !== "off") {
    throw new Error("load-subset: switch read-back does not match what the RPCs were asked to set");
  }
  const switches = { scrape_cadence: s.scrape_cadence, global_processing_paused: s.global_processing_paused, judgement_drain: s.judgement_drain, via: ["admin_set_pause_state", "admin_set_judgement_drain"] };
  const corrections_selfcheck = {
    rerun: false,
    reason: "migration 356's self-check is an anonymous DO block inside the migration file, not a callable function; the corrections-after-load attack runs it in a rolled-back transaction (PROOF-4)",
  };

  const total = result.reduce((a, t) => a + t.rows, 0);
  log(`load-subset: tables=${result.length} rows=${total} preseeded=${result.filter((t) => t.preseeded).length} cadence=${s.scrape_cadence} drain=${s.judgement_drain} paused=${s.global_processing_paused}`);
  for (const t of result) log(`  ${t.table}: ${t.rows}${t.preseeded ? " (preseeded)" : ""}`);
  return { tables: result, switches, corrections_selfcheck };
}

export async function runCli(argv, deps = {}) {
  const { log = (m) => console.log(m), errorLog = (m) => console.error(m), connect, env = process.env } = deps;
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const dir = arg("--dir") ?? arg("--in");
  if (!dir) { errorLog("load-subset: --in <export dir> (or --dir) is required."); return 1; }
  const cs = env.PROOF_DB_URL;
  if (!cs) { errorLog("load-subset: PROOF_DB_URL is not set, self-skip."); return 2; }
  if (!isLoopbackConnString(cs)) { errorLog("load-subset: PROOF_DB_URL host is not loopback; refusing (this script never loads into a remote database)."); return 1; }
  let client;
  try {
    client = connect ? await connect(cs) : await realConnect(cs);
  } catch {
    errorLog("load-subset: could not connect to the local stack.");
    return 1;
  }
  try {
    await loadSubset({ client, dir: resolve(dir), log });
    return 0;
  } catch (e) {
    errorLog(e instanceof Error ? e.message : String(e));
    return 1;
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

async function realConnect(cs) {
  const require = createRequire(import.meta.url); // lazy: the module stays importable without node_modules
  const pg = require("pg");
  const c = new pg.Client({ connectionString: cs, ssl: false, connectionTimeoutMillis: 8000 });
  await c.connect();
  return c;
}

if (isMainModule(import.meta.url)) {
  runCli(process.argv.slice(2)).then((c) => process.exit(c));
}
