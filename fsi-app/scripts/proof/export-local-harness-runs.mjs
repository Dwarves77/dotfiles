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

/** Read the ledger through an injected, already connected client. Closes it. */
export async function exportLocalHarnessRuns(client) {
  try {
    const { rows } = await client.query(SELECT_RUNS);
    return buildHarnessRunsExport(rows);
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

if (isMainModule(import.meta.url)) {
  const i = process.argv.indexOf("--out");
  const out = i >= 0 ? process.argv[i + 1] : null;
  if (!out) { console.error("export-local-harness-runs: --out <path> is required"); process.exit(2); }
  if (process.env.CHAIN_PROOF_LOCAL !== "1") { console.error("export-local-harness-runs: CHAIN_PROOF_LOCAL is not 1; refusing to read any database"); process.exit(2); }
  const { connectPg } = await import("../lib/pg-conn.mjs");
  const client = await connectPg();
  if (!client) { console.error("export-local-harness-runs: could not connect to the local database; cannot export"); process.exit(2); }
  const result = await exportLocalHarnessRuns(client);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`export-local-harness-runs: ${result.count} local harness_runs row(s) written`);
}
