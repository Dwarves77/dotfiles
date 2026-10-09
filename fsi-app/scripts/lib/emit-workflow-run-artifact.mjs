#!/usr/bin/env node
// emit-workflow-run-artifact.mjs -- lane DORMANT-1 (2026-10-09, coordinator grant). One shared emitter for the
// workflows that execute but ran their own work without recording a harness run: a final `record` job in each
// of them calls this with the family it registered, the workflow file and the `needs.*.result` list, and (with
// --land) lands the artifact into harness_runs through record-harness-run.mjs. The record job runs
// `if: always()`, so it fires on every path, including the early exit of a kill switch (a dispatched run that
// exits at its gate is a run, and now it leaves a row).
//
// WHY ONE SCRIPT, NOT ONE PER WORKFLOW: the envelope is buildRunArtifactEnvelope, the write is writeRunArtifact,
// run id and harness version come from resolveHarnessRunContext, the landing is record-harness-run.mjs's runCli
// (all the existing machinery; scripts/proof/emit-chain-proof-artifact.mjs is the closest sibling). What differs
// per workflow is only the family name and the workflow file, so those are arguments, not seven copies (F45).
//
// Usage: node scripts/lib/emit-workflow-run-artifact.mjs --family <family> --workflow <file.yml>
//          --results "<success,skipped,...>" [--land]
// Exit: 0 written (and landed when --land); the landing's own code otherwise (1 failed, 2 no-credential
// self-skip outside Actions, see record-harness-run.mjs).

import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, buildRunArtifactEnvelope } from "./run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { resolveHarnessRunContext } from "./loop-run-id.mjs";
import { runCli } from "./record-harness-run.mjs";
import { isMainModule } from "./is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

/**
 * The one outcome of a workflow from its jobs' results (`needs.*.result`: success, failure, cancelled, skipped).
 * A failure outranks a cancellation outranks success; a workflow whose every job was skipped did not run.
 * @param {string[]} results
 * @returns {"failure"|"cancelled"|"skipped"|"success"}
 */
export function overallOutcome(results) {
  const rs = results.map((r) => String(r).trim()).filter(Boolean);
  if (rs.includes("failure")) return "failure";
  if (rs.includes("cancelled")) return "cancelled";
  if (rs.length === 0 || rs.every((r) => r === "skipped")) return "skipped";
  return "success";
}

/** Build the artifact for one workflow firing. PURE. */
export function buildWorkflowRunArtifact({ family, harnessVersion, runId, startedAt, workflowFile, results, event = null, githubRunId = null }) {
  const outcome = overallOutcome(results);
  return buildRunArtifactEnvelope({
    family,
    harnessVersion,
    runId,
    startedAt,
    config: { workflow: workflowFile, event, outcome, github_run_id: githubRunId === null ? null : String(githubRunId) },
    inputsRef: [`.github/workflows/${workflowFile}`],
    perItem: [{
      id: workflowFile,
      outcome,
      verdict: `jobs: ${results.length ? results.join(",") : "none"}`,
      counts: null,
      evidence_refs: githubRunId === null ? [] : [`github-actions-run:${githubRunId}`],
      error: outcome === "failure" ? "a job of this workflow concluded failure" : null,
    }],
    metrics: {
      jobs_total: results.length,
      jobs_failed: results.filter((r) => r === "failure").length,
      jobs_skipped: results.filter((r) => r === "skipped").length,
    },
    defectsFound: outcome === "failure" ? [{ description: `${workflowFile} concluded failure`, root_cause: "", fix_ref: null }] : [],
    fullTraceRefs: [githubRunId === null ? `.github/workflows/${workflowFile}` : `github-actions-run:${githubRunId}`],
    proposerNotes: "Auto-emitted by emit-workflow-run-artifact.mjs from the workflow's record job. The run's own logs are the full trace; this row is the dispatch evidence the closure gate's NEVER-RUN check reads.",
  });
}

/** Parse `--key value` and bare `--flag` arguments. PURE. */
export function parseArgs(argv) {
  const out = { land: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--land") out.land = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  return out;
}

/** Emit (and optionally land) one artifact. Everything external is injectable. */
export async function emitWorkflowRun({ argv, env = process.env, fsiRoot = FSI_ROOT, familyDir = null, landFn = runCli, now = () => new Date().toISOString() }) {
  const args = parseArgs(argv);
  if (!args.family || !args.workflow) throw new Error("--family and --workflow are required");
  if (!GOVERNING_FILES[args.family]) throw new Error(`family "${args.family}" is not a registered harness family`);
  const dir = familyDir ?? join(fsiRoot, "scripts", "harness-runs", args.family);
  const { harnessVersion, runId } = resolveHarnessRunContext({
    family: args.family,
    familyDir: dir,
    governingFiles: GOVERNING_FILES[args.family],
    fsiRoot,
    upstreamName: null,
    upstreamRunId: null,
  });
  const results = String(args.results ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const artifact = buildWorkflowRunArtifact({
    family: args.family,
    harnessVersion,
    runId,
    startedAt: args["started-at"] || now(),
    workflowFile: args.workflow,
    results,
    event: env.GITHUB_EVENT_NAME || null,
    githubRunId: env.GITHUB_RUN_ID || null,
  });
  const outPath = writeRunArtifact(dir, artifact);
  const code = args.land ? await landFn(["--file", outPath]) : 0;
  return { outPath, artifact, code };
}

if (isMainModule(import.meta.url)) {
  const { outPath, artifact, code } = await emitWorkflowRun({ argv: process.argv.slice(2) });
  console.error(`emit-workflow-run-artifact: wrote ${outPath} (${artifact.config.outcome})`);
  process.exit(code);
}
