#!/usr/bin/env node
// scripts/lib/export-harness-ledger.mjs -- COMMITTED SNAPSHOT generator for harness_runs (lane R22,
// 2026-10-02, coordinator-directed). Closes the defect A8b found: docs/ops/dispatch-ledger.jsonl, the
// file closure-gate.mjs's NEVER-RUN check used to read for dispatch evidence, was 11 days stale -- its
// only writer (maintenance.yml's "Append this run's dispatch-ledger row" step) committed nothing after
// this lane's own PR #824 era closed the artifact-branch-push path every OTHER family already stopped
// using, so new rows had nowhere to land. harness_runs (migration 331) has carried every real dispatch
// since; the jsonl was watching a pipe nothing still fed.
//
// THE PATTERN, copied deliberately from db-catalog.json / db-catalog-refresh.sql (the ONE other
// committed-DB-snapshot precedent in this repo): "the credentialed step is the REFRESH, not the CHECK."
// closure-gate.mjs (and every other always-on, no-DB-credential gate) holds no secret and must not need
// one; the database enters the repo as a plain, committed JSON fact-file instead. THIS script is the
// credentialed refresh -- run by a human or an operator-run step with real Supabase credentials, never
// scheduled, never run by a secret-less lane. docs/runbooks/fleet-budget-control.md records the standing
// rule: the coordinator's DB executor regenerates this export each session.
//
// READ-ONLY BY CONSTRUCTION: one SELECT against harness_runs (SHARED-WRITER: harness_runs owns every
// write to that table; this script never writes to it). Self-skips exit 2 without credentials (rule 15),
// same convention scripts/lib/record-harness-run.mjs already uses.
//
// SCOPE OF THE EXPORT. Every row's family, run_id, started_at, finished_at, trigger, governing_hash, and config (the
// JSON closure-gate's maintenance-step correlation reads config.step/config.mode from, the SAME fields
// write-run-artifact.mjs already stamps on every maintenance-family row). per_item/inputs_ref/metrics/
// defects_found/full_trace_refs are deliberately EXCLUDED -- this is a dispatch-evidence ledger ("did
// this run happen"), not a full harness_runs dump; a reader needing more opens the real row.
//
// Usage:
//   node scripts/lib/export-harness-ledger.mjs --out fsi-app/.discipline/governance/harness-ledger-export.json
//
// Exit codes: 0 = wrote the export. 1 = usage or DB-read error. 2 = missing credentials, self-skip.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readAll } from "./db.mjs";
import { loadLocalEnvFile } from "./env-file.mjs";
import { isMainModule } from "./is-main.mjs";
import { HARNESS_LEDGER_EXPORT_PATH } from "./run-artifact.mjs"; // lane GATE-3: one home for the export path, shared with its readers

export const DEFAULT_OUT_PATH = HARNESS_LEDGER_EXPORT_PATH;

/**
 * Build the committed export object -- PURE, no I/O. One row per harness_runs row, sorted by family
 * then run_id for a deterministic diff. @param {object[]} rows @param {string} capturedAt ISO date
 * @returns {object}
 */
export function buildLedgerExport(rows, capturedAt) {
  const list = Array.isArray(rows) ? rows : [];
  const sorted = [...list].sort((a, b) => {
    const fa = String(a?.harness_family ?? "");
    const fb = String(b?.harness_family ?? "");
    if (fa !== fb) return fa.localeCompare(fb);
    return String(a?.run_id ?? "").localeCompare(String(b?.run_id ?? ""));
  });
  const families = new Set(sorted.map((r) => r.harness_family));
  return {
    _comment:
      "COMMITTED SNAPSHOT of harness_runs (migration 331), the dispatch-evidence half only (family, " +
      "run_id, started_at, finished_at, trigger, governing_hash, config). Regenerate with " +
      "scripts/lib/export-harness-ledger.mjs (read-only, one SELECT; no data write) and commit the diff. " +
      "Replaces docs/ops/dispatch-ledger.jsonl as closure-gate.mjs's NEVER-RUN dispatch-evidence source " +
      "(lane R22, 2026-10-02) -- see docs/runbooks/fleet-budget-control.md for the regeneration rule.",
    capturedAt,
    method: "fsi-app/scripts/lib/export-harness-ledger.mjs",
    counts: { families: families.size, runs: sorted.length },
    rows: sorted.map((r) => ({
      family: r.harness_family,
      run_id: r.run_id,
      started_at: r.started_at,
      finished_at: r.finished_at ?? null,
      trigger: r.trigger ?? null,
      // lane GATE-3 (2026-10-08): the governing-file hash this run executed against. writeRunArtifact stamps
      // it into config.governing_hash (record-harness-run lands config verbatim); a row landed before that
      // stamp falls back to the harness_version column, which every runner already set to the same
      // hashHarnessVersion(governing files) value. F28 reads this field to decide a family is current.
      governing_hash: r.config?.governing_hash ?? r.harness_version ?? null,
      config: r.config ?? {},
    })),
  };
}

/**
 * @param {string[]} args
 * @param {{log?:Function, errorLog?:Function, readAllFn?:Function, loadEnv?:Function, writeFileFn?:Function, now?:Function}} [deps]
 * @returns {Promise<number>}
 */
export async function runCli(args, deps = {}) {
  const {
    log = (m) => console.log(m),
    errorLog = (m) => console.error(m),
    readAllFn = readAll,
    loadEnv = loadLocalEnvFile,
    writeFileFn = writeFileSync,
    now = () => new Date().toISOString().slice(0, 10),
  } = deps;

  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : DEFAULT_OUT_PATH;
  if (!outPath) {
    errorLog("export-harness-ledger: --out <path.json> is required.");
    return 1;
  }

  loadEnv();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    errorLog(
      "export-harness-ledger: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set -- self-skip " +
        "(no-cred case, rule 15): diagnosable, never a false red.",
    );
    return 2;
  }

  let rows;
  try {
    rows = await readAllFn("harness_runs", "harness_family, run_id, started_at, finished_at, trigger, harness_version, config");
  } catch (e) {
    errorLog(`export-harness-ledger: DB read failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const exportObj = buildLedgerExport(rows, now());
  try {
    writeFileFn(resolve(outPath), `${JSON.stringify(exportObj, null, 1)}\n`, "utf8");
  } catch (e) {
    errorLog(`export-harness-ledger: write failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  log(`export-harness-ledger: wrote ${outPath} (${exportObj.counts.runs} run(s), ${exportObj.counts.families} family(ies)). Commit the diff.`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
