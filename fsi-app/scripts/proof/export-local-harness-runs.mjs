#!/usr/bin/env node
// export-local-harness-runs.mjs -- read the LOCAL stack's harness_runs ledger and write a public-safe summary
// (lane PROOF-1, 2026-10-07). One SELECT, read-only, against loopback only.
//
// The chain proof writes its own harness_runs rows into the disposable local database (every chain script
// records its run there, exactly as in production). This export turns those rows into the run artifact's
// "what fired, in what order, carrying which ids" evidence. The repo is public and workflow artifacts are
// world-readable, so the export holds NO per-item text and NO raw ids: run, loop and upstream ids are replaced
// by a short sha256 prefix (still comparable: the same id hashes the same, so the hop sequence and the
// upstream chain can be checked); metrics keep numeric values only; config keeps the step name.
//
// Refuses (exit 2) unless CHAIN_PROOF_LOCAL=1, and connects through scripts/lib/pg-conn.mjs, whose loopback
// mode never falls through to a production host. Exit 2 also when no connection is possible.
//
// When public.harness_runs does not exist (the replay never ran, so the schema was never built) it exits 2 with
// "no local ledger: the replay did not run", so a downstream consequence reads as one and not as a 42P01 crash
// (lane PROOF-5, 2026-10-08: run 37743372083 stopped before the replay and this step then crashed).
//
// Usage: node scripts/proof/export-local-harness-runs.mjs --out <path>

import { hash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";

const COLUMNS = "run_id, harness_family, trigger, github_run_id, upstream_run_id, started_at, finished_at, config, metrics";
export const SELECT_RUNS = `select ${COLUMNS} from public.harness_runs order by started_at asc, run_id asc limit 5000`;

/** Short stable hash of an id; null stays null. PURE. */
export function hashId(id) {
  if (id == null || String(id).trim() === "") return null;
  return hash("sha256", String(id), "hex").slice(0, 12);
}

function numericOnly(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj && typeof obj === "object" ? obj : {})) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

const iso = (d) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));

/** Rows to the public-safe export. PURE. Order is the ledger's own started_at order. */
export function buildHarnessRunsExport(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    schema: "chain-proof-local-harness-runs/1",
    count: list.length,
    runs: list.map((r, i) => ({
      seq: i + 1,
      family: r.harness_family ?? null,
      run: hashId(r.run_id),
      trigger: r.trigger ?? null,
      step: typeof r.config?.step === "string" ? r.config.step.slice(0, 80) : null,
      loop: hashId(r.config?.loop_run_id),
      github_run: hashId(r.github_run_id),
      upstream: hashId(r.upstream_run_id),
      started_at: iso(r.started_at),
      finished_at: iso(r.finished_at),
      metrics: numericOnly(r.metrics),
    })),
  };
}

export const NO_LEDGER_MESSAGE = "no local ledger: the replay did not run";

/** Thrown when public.harness_runs does not exist (Postgres 42P01 on the ledger read). */
export class NoLocalLedgerError extends Error {
  constructor() { super(NO_LEDGER_MESSAGE); this.name = "NoLocalLedgerError"; }
}

/** Read the ledger through an injected, already connected client. Closes it. */
export async function exportLocalHarnessRuns(client) {
  try {
    let rows;
    try {
      ({ rows } = await client.query(SELECT_RUNS));
    } catch (e) {
      if (e && e.code === "42P01") throw new NoLocalLedgerError();
      throw e;
    }
    return buildHarnessRunsExport(rows);
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

/** The CLI body with injected deps. Returns the exit code. */
export async function runCli({ argv, env, connect, writeOut, log = console.log, errorLog = console.error }) {
  const i = argv.indexOf("--out");
  const out = i >= 0 ? argv[i + 1] : null;
  if (!out) { errorLog("export-local-harness-runs: --out <path> is required"); return 2; }
  if (env.CHAIN_PROOF_LOCAL !== "1") { errorLog("export-local-harness-runs: CHAIN_PROOF_LOCAL is not 1; refusing to read any database"); return 2; }
  const client = await connect();
  if (!client) { errorLog("export-local-harness-runs: could not connect to the local database; cannot export"); return 2; }
  let result;
  try {
    result = await exportLocalHarnessRuns(client);
  } catch (e) {
    if (e instanceof NoLocalLedgerError) { errorLog(`export-local-harness-runs: ${NO_LEDGER_MESSAGE}`); return 2; }
    throw e;
  }
  writeOut(out, JSON.stringify(result, null, 2) + "\n");
  log(`export-local-harness-runs: ${result.count} local harness_runs row(s) written`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  const { connectPg } = await import("../lib/pg-conn.mjs");
  const code = await runCli({
    argv: process.argv,
    env: process.env,
    connect: connectPg,
    writeOut: (path, text) => { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), text, "utf8"); },
  });
  if (code !== 0) process.exit(code);
}
