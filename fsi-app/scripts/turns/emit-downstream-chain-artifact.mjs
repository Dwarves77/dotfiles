#!/usr/bin/env node
// emit-downstream-chain-artifact.mjs -- downstream-chain's own harness-run artifact writer (lane M3,
// 2026-09-19, build plan section 6.1 row M3). "Emission is CODE" -- the same posture
// emit-corpus-turn-artifact.mjs / run-mint-batch.mjs / run-extraction.mjs already hold for their own
// families (PROPOSER-RUNBOOK.md section 5, "forgetting is not possible"):
// .github/workflows/downstream-chain.yml calls this after its four maintenance-step derivations (its own
// `if: always() && env.RUN_SKIP != 'true'` step, matching corpus-turn.yml's own placement), dry or apply,
// so a chained firing that skipped (no real work to derive from) or hit a nonzero-exit step still leaves
// a record -- "record it every batch, even when zero," the same rule this family's siblings apply.
//
// This is NOT a canonical entry point in run-mint-batch.mjs's sense: it runs no derivation itself. Its
// only job is to read back what THIS run's own four `./.github/actions/maintenance-step` calls already
// wrote (each one's own `$OUT_ROOT/<step>/summary.json`, scripts/maintenance/lib/cli.mjs's own contract)
// and record the outcome as this family's own CONVENTION.md-shaped artifact.
//
// Reads its configuration entirely from environment variables (DC_*), set by downstream-chain.yml's own
// "Record this chain's own harness-run artifact" step -- this script has no CLI flags because it has
// exactly one caller and that caller already has every value as a workflow-step output.
//
// Exit 0 on a successful write. Throws (non-zero exit) on a schema-invalid artifact (writeRunArtifact's
// own fail-closed validation) or an id-claim collision after 50 attempts (claimRunId) -- both real
// conditions a coordinator should see, not swallow.

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, claimRunId, hashHarnessVersion } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const FAMILY = "downstream-chain";
const FAMILY_DIR = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY);

export const STEPS = Object.freeze(["tier-opinions", "derive-obligations", "tag-proposals", "apply-classifications"]);

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

function relFromRoot(absPath) {
  const rel = relative(FSI_ROOT, absPath).split(sep).join("/");
  return rel.startsWith("..") ? absPath : rel;
}

export function readStepSummary(outRoot, step) {
  const abs = join(outRoot, step, "summary.json");
  if (!existsSync(abs)) return { step, ran: false, exitCode: null, summary: null, pathRel: null };
  try {
    const summary = JSON.parse(readFileSync(abs, "utf8"));
    const exitCode = typeof summary?.exitCode === "number" ? summary.exitCode : 0;
    return { step, ran: true, exitCode, summary, pathRel: relFromRoot(abs) };
  } catch {
    return { step, ran: true, exitCode: null, summary: null, pathRel: relFromRoot(abs) };
  }
}

export function buildArtifact({
  runId,
  harnessVersion,
  startedAt,
  mode,
  skip,
  skipReason,
  upstreamName,
  upstreamRunId,
  stepResults,
}) {
  const perItem = stepResults.map((r) => ({
    id: r.step,
    outcome: !r.ran ? "skipped" : r.exitCode === 0 ? "clean" : "nonzero_exit",
    verdict: r.ran ? `exitCode=${r.exitCode}` : skip ? skipReason || "chain skipped, no upstream work" : "not run",
    evidence_refs: r.pathRel ? [r.pathRel] : [],
    error: r.ran && r.exitCode !== 0 ? JSON.stringify(r.summary ?? {}) : null,
  }));

  const stepsWithSummary = stepResults.filter((r) => r.ran).length;
  const stepsNonzeroExit = stepResults.filter((r) => r.ran && r.exitCode !== 0).length;
  const fullTraceRefs = perItem.flatMap((p) => p.evidence_refs);
  if (fullTraceRefs.length === 0) fullTraceRefs.push("docs/runbooks/MAINTENANCE-RUNBOOK.md");

  const defectsFound = [];
  if (stepsNonzeroExit > 0) {
    defectsFound.push({
      description: `${stepsNonzeroExit} of ${STEPS.length} downstream-chain step(s) exited nonzero this run`,
      root_cause: stepResults
        .filter((r) => r.ran && r.exitCode !== 0)
        .map((r) => `${r.step}: exitCode=${r.exitCode}`)
        .join(" | "),
      fix_ref: null,
    });
  }

  return {
    harness_family: FAMILY,
    harness_version: harnessVersion,
    run_id: runId,
    started_at: startedAt,
    config: {
      mode,
      skip: !!skip,
      skip_reason: skipReason || null,
      upstream_name: upstreamName || null,
      upstream_run_id: upstreamRunId || null,
      steps: [...STEPS],
    },
    inputs_ref: [...STEPS],
    per_item: perItem,
    metrics: {
      steps_run: stepsWithSummary,
      steps_with_summary: stepsWithSummary,
      steps_nonzero_exit: stepsNonzeroExit,
    },
    defects_found: defectsFound,
    full_trace_refs: fullTraceRefs,
    proposer_notes: skip
      ? `This dispatch was a no-op: ${skipReason || "no reason recorded"}. No step ran; recorded anyway so the family's own history shows every firing, not only the ones with real work (MINT-RUNBOOK.md's "record it every batch, even when zero," applied here).`
      : "Auto-emitted by emit-downstream-chain-artifact.mjs after tier-opinions/derive-obligations/tag-proposals/apply-classifications each wrote their own summary.json via the shared ./.github/actions/maintenance-step composite action.",
  };
}

if (IS_MAIN) main();

function main() {
  const mode = process.env.DC_MODE || "dry";
  const skip = process.env.DC_SKIP === "true";
  const skipReason = process.env.DC_SKIP_REASON || "";
  const upstreamName = process.env.DC_UPSTREAM_NAME || null;
  const upstreamRunId = process.env.DC_UPSTREAM_RUN_ID || null;
  const startedAt = process.env.DC_STARTED_AT || new Date().toISOString();
  const outRoot = process.env.DC_OUT_ROOT || null;

  const stepResults = skip || !outRoot
    ? STEPS.map((step) => ({ step, ran: false, exitCode: null, summary: null, pathRel: null }))
    : STEPS.map((step) => readStepSummary(outRoot, step));

  const harnessVersion = hashHarnessVersion(GOVERNING_FILES[FAMILY], FSI_ROOT);
  const runId = claimRunId(FAMILY_DIR, FAMILY);

  const artifact = buildArtifact({
    stepResults,
    mode,
    skip,
    skipReason,
    upstreamName,
    upstreamRunId,
    runId,
    harnessVersion,
    startedAt,
  });

  const outPath = writeRunArtifact(FAMILY_DIR, artifact);
  console.log(`emit-downstream-chain-artifact: wrote ${outPath}`);
}
