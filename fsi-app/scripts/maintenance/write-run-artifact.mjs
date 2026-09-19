#!/usr/bin/env node
// write-run-artifact.mjs -- writes this maintenance.yml run's own harness-run artifact
// (scripts/harness-runs/maintenance/maintenance-run-NNN.json) per CONVENTION.md, plus its full-trace
// companion under traces/ (a single file consolidating every step's own summary.json this run produced),
// so the run survives past the ephemeral GitHub Actions upload-artifact into git history. Lane M9b,
// 2026-09-18, closing stage-audit-2026-09-18 s6-gates-harness.md's finding: "the maintenance.yml family
// uploads an ephemeral artifact instead of committing one, so the closure gate's evidence for maintenance
// steps comes from a log nobody writes any more."
//
// WHAT IT READS. Every step in maintenance.yml writes its own `summary.json` under
// `$OUT_ROOT/<step>/summary.json` (scripts/maintenance/lib/cli.mjs's `writeSummary`, or the
// ./.github/actions/maintenance-step composite action, which writes to the same convention). This script
// scans every `<out-root>/*/summary.json` it finds -- one entry for a named-step dispatch, up to 62 for a
// `step=all` dry fan-out -- and folds them into one run artifact: `config` names what was dispatched
// (step, mode, arg); `per_item` carries one entry per step that actually produced a summary.json, its
// outcome read from that summary's own `exitCode` (present) or assumed clean (absent, per
// scripts/maintenance/lib/cli.mjs's own "default 0" contract); `metrics` aggregates the count that ran
// clean vs not; the consolidated summaries themselves are the full trace, committed to
// scripts/harness-runs/maintenance/traces/, never only inlined here (CONVENTION.md's own
// "population-level truth always lives in full_trace_refs" rule).
//
// $0, filesystem-only -- no DB, no network.
//
// Usage:
//   node scripts/maintenance/write-run-artifact.mjs --step <step> --mode <dry|apply> [--arg <arg>]
//     --out-root <absolute path to this run's $OUT_ROOT> [--run-dir <family dir>]
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { claimRunId, writeRunArtifact, hashHarnessVersion } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { fsiRoot } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

/**
 * Collect every `<outRoot>/<step-dir>/summary.json` this run produced. Pure aside from the reads -- no
 * writes, never throws on a missing or unparseable file (records the parse failure on the entry instead,
 * per the "flag it, never invent or silently drop" discipline CONVENTION.md names).
 * @param {string|null} outRoot
 * @returns {Record<string, object>} step name -> parsed summary.json content (or `{ parse_error }`)
 */
export function collectStepSummaries(outRoot) {
  const byStep = {};
  if (!outRoot || !existsSync(outRoot)) return byStep;
  for (const entry of readdirSync(outRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const summaryPath = join(outRoot, entry.name, "summary.json");
    if (!existsSync(summaryPath)) continue;
    try {
      byStep[entry.name] = JSON.parse(readFileSync(summaryPath, "utf8"));
    } catch (e) {
      byStep[entry.name] = { parse_error: String(e) };
    }
  }
  return byStep;
}

/**
 * Build the maintenance-run-NNN.json artifact object (CONVENTION.md schema) from the collected summaries.
 * Pure -- no I/O.
 * @param {{step: string, mode: string, arg: string, runId: string, harnessVersion: string,
 *   startedAt: string, byStep: Record<string, object>, tracePath: string}} input
 */
export function buildArtifact({ step, mode, arg, runId, harnessVersion, startedAt, byStep, tracePath }) {
  const stepNames = Object.keys(byStep).sort();
  const perItem = stepNames.map((name) => {
    const s = byStep[name];
    let outcome;
    let error = null;
    if (s && typeof s === "object" && "parse_error" in s) {
      outcome = "summary_parse_error";
      error = s.parse_error;
    } else {
      const exitCode = typeof s?.exitCode === "number" ? s.exitCode : 0;
      outcome = exitCode === 0 ? "ran" : `exit_${exitCode}`;
    }
    return { id: name, outcome, evidence_refs: [tracePath], error };
  });
  const nonZero = perItem.filter((p) => p.outcome !== "ran").length;

  return {
    harness_family: "maintenance",
    harness_version: harnessVersion,
    run_id: runId,
    started_at: startedAt,
    config: { step, mode, arg: arg ?? "" },
    inputs_ref: [],
    per_item: perItem,
    metrics: {
      steps_dispatched: step === "all" ? stepNames.length : 1,
      steps_with_summary: stepNames.length,
      steps_nonzero_exit: nonZero,
    },
    defects_found: [],
    full_trace_refs: [tracePath],
    proposer_notes:
      stepNames.length === 0
        ? "No step wrote a summary.json this run (a read-only or --arg-gated step that skipped cleanly " +
          "before reaching its own --out contract, or a step with no --out contract at all)."
        : "",
  };
}

function parseArgs(argv) {
  const get = (flag, def) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
  };
  return {
    step: get("--step", "all"),
    mode: get("--mode", "dry"),
    arg: get("--arg", ""),
    outRoot: get("--out-root", null),
    runDir: get("--run-dir", resolve(fsiRoot(), "scripts/harness-runs/maintenance")),
  };
}

async function main() {
  const { step, mode, arg, outRoot, runDir } = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const byStep = collectStepSummaries(outRoot);

  mkdirSync(runDir, { recursive: true });
  const runId = claimRunId(runDir, "maintenance");

  const tracesDir = resolve(runDir, "traces");
  mkdirSync(tracesDir, { recursive: true });
  const traceFile = resolve(tracesDir, `${runId}.summaries.json`);
  writeFileSync(traceFile, `${JSON.stringify(byStep, null, 2)}\n`, "utf8");
  // fsi-app-relative, matching the shape every other family's full_trace_refs entry uses.
  const traceRelPath = `scripts/harness-runs/maintenance/traces/${runId}.summaries.json`;

  const harnessVersion = hashHarnessVersion(GOVERNING_FILES.maintenance, fsiRoot());
  const artifact = buildArtifact({ step, mode, arg, runId, harnessVersion, startedAt, byStep, tracePath: traceRelPath });
  const outPath = writeRunArtifact(runDir, artifact);

  console.log(
    JSON.stringify(
      { run_id: runId, artifact_path: outPath, trace_path: traceFile, steps_with_summary: Object.keys(byStep).length },
      null,
      2,
    ),
  );
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error("write-run-artifact: fatal:", e);
    process.exit(1);
  });
}
