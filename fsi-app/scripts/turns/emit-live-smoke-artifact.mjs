#!/usr/bin/env node
// emit-live-smoke-artifact.mjs -- the live-smoke family's harness-run artifact writer (lane GATES-2, 2026-10-05).
// .github/workflows/live-smoke.yml calls this after the runner, `if: always()`, so a firing that stopped before it
// produced a report still leaves a record. "Emission is CODE", the same posture emit-source-resolution-artifact.mjs
// holds. It runs nothing itself: it reads the JSON report fsi-app/.discipline/rendering/live/live-smoke.mjs wrote
// (path in LS_REPORT) and records pages visited, failure and warning counts, a count per invariant and one defect
// per failing invariant. A missing or unreadable report is recorded as such, never as a clean run.
//
// REUSE: the envelope is buildRunArtifactEnvelope and the write is writeRunArtifact (scripts/lib/run-artifact.mjs);
// the run id and harness version come from resolveHarnessRunContext (scripts/lib/loop-run-id.mjs). The trigger and
// config.github_run_id are stamped by writeRunArtifact from the runner environment.
//
// Configuration (set by the workflow): LS_REPORT (path to the JSON report), LS_STARTED_AT, LS_URL (the target origin).
// The report holds only the target origin, page paths, invariant names and truncated offending text; no credential.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { writeRunArtifact, buildRunArtifactEnvelope } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { resolveHarnessRunContext } from "../lib/loop-run-id.mjs";
import { INVARIANTS } from "../../.discipline/rendering/live/live-assertions.mjs";
import { isMainModule } from "../lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const FAMILY = "live-smoke";
const FAMILY_DIR = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY);

/** Read the runner's JSON report. Returns {report} or {error}. */
export function readReport(path, readFn = readFileSync) {
  if (!path) return { error: "LS_REPORT is not set" };
  try {
    const parsed = JSON.parse(readFn(path, "utf8"));
    if (!Array.isArray(parsed?.findings) || !Array.isArray(parsed?.pagesVisited)) return { error: "report has no findings or pagesVisited array" };
    return { report: parsed };
  } catch (e) {
    return { error: `could not read the report: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Build the artifact. Pure. */
export function buildArtifact({ runId, harnessVersion, startedAt, url, report, error, loopRunId = null }) {
  const findings = report?.findings ?? [];
  const pages = report?.pagesVisited ?? [];
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");

  const perItem = pages.map((p) => {
    const mine = fails.filter((f) => f.url === p.url && f.viewport === p.viewport);
    return {
      id: `${p.viewport}:${p.url}`,
      outcome: mine.length === 0 ? "clean" : "failed",
      verdict: mine.length === 0 ? "no failed invariant" : [...new Set(mine.map((f) => f.invariant))].join(","),
      counts: { failures: mine.length },
      evidence_refs: [],
      error: null,
    };
  });
  if (error) {
    perItem.push({ id: "report", outcome: "report_missing", verdict: error, counts: null, evidence_refs: [], error });
  }

  const metrics = {
    pages_visited: report ? pages.length : null,
    failure_count: report ? fails.length : null,
    warning_count: report ? warns.length : null,
  };
  for (const inv of Object.values(INVARIANTS)) {
    metrics[`failures_${inv.replace(/-/g, "_")}`] = report ? fails.filter((f) => f.invariant === inv).length : null;
  }

  const byInvariant = new Map();
  for (const f of fails) byInvariant.set(f.invariant, [...(byInvariant.get(f.invariant) ?? []), f]);
  const defects = [...byInvariant.entries()].map(([inv, list]) => ({
    description: `${inv}: ${list.length} failure(s) on ${new Set(list.map((f) => f.url)).size} page(s)`,
    root_cause: `${list[0].url} @${list[0].viewport} :: ${String(list[0].text).slice(0, 120)}`,
    fix_ref: null,
  }));
  if (error) defects.push({ description: "live smoke produced no report", root_cause: error, fix_ref: null });

  return buildRunArtifactEnvelope({
    family: FAMILY,
    harnessVersion,
    runId,
    startedAt,
    config: { target: url || report?.baseUrl || null, read_only: true, viewports: [1440, 375], loop_run_id: loopRunId },
    inputsRef: ["live-smoke-report.json"],
    perItem,
    metrics,
    defectsFound: defects,
    fullTraceRefs: ["docs/runbooks/maintenance.d/62-live-smoke.md"],
    proposerNotes:
      "Auto-emitted by emit-live-smoke-artifact.mjs from the runner's JSON report. The full per-finding text is in the " +
      "live-smoke-report workflow artifact (7 days); this row keeps the counts and the first offending text per invariant.",
  });
}

/** Read the report, build the artifact and write it. `env`, `familyDir`, `fsiRoot` and `readFn` are injectable. */
export function emit({ env = process.env, familyDir = FAMILY_DIR, fsiRoot = FSI_ROOT, readFn = readFileSync } = {}) {
  const { report = null, error = null } = readReport(env.LS_REPORT, readFn);
  const { harnessVersion, runId, loopRunId } = resolveHarnessRunContext({
    family: FAMILY,
    familyDir,
    governingFiles: GOVERNING_FILES[FAMILY],
    fsiRoot,
    upstreamName: null,
    upstreamRunId: null,
  });
  const artifact = buildArtifact({
    runId,
    harnessVersion,
    startedAt: env.LS_STARTED_AT || new Date().toISOString(),
    url: env.LS_URL || null,
    report,
    error,
    loopRunId,
  });
  const outPath = writeRunArtifact(familyDir, artifact);
  return { outPath, artifact };
}

if (isMainModule(import.meta.url)) {
  const { outPath } = emit();
  console.log(`emit-live-smoke-artifact: wrote ${outPath}`);
}
