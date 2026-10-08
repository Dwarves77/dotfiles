#!/usr/bin/env node
// emit-source-resolution-artifact.mjs -- the source-resolution family's harness-run artifact writer (lane
// S1-E, 2026-10-05). .github/workflows/source-resolution.yml calls this after its three maintenance steps
// (resolve-provisional-sources, recompute-tiers, then recompute-trust-scores, lane TRUST-RET 2026-10-07),
// `if: always()`, so a firing that stopped part way
// still leaves a record. "Emission is CODE", the same posture emit-downstream-chain-artifact.mjs holds.
//
// It runs no step itself. It reads back what the three `./.github/actions/maintenance-step` calls already
// wrote (each one's `$SR_OUT_ROOT/<step>/summary.json`) and records, per step, the counts the step already
// prints: sources resolved, promoted, rejected, worklisted and verdict-placed for resolve-provisional-
// sources; sources scanned and tier movements planned (dry) or applied (apply) for recompute-tiers;
// sources scored, held and written for recompute-trust-scores.
// A count the step did not print is recorded as null, never as a made-up zero.
//
// REUSE. The summary reader (readStepSummary) is the one in emit-downstream-chain-artifact.mjs, the run-id,
// harness-version and loop-id resolution is resolveHarnessRunContext (scripts/lib/loop-run-id.mjs), and the
// envelope is buildRunArtifactEnvelope (scripts/lib/run-artifact.mjs); nothing is copied. The trigger
// (workflow_run_forced_dry when the chained dry guard forced the run dry) and config.github_run_id are
// stamped by writeRunArtifact from the runner environment.
//
// Configuration comes from environment variables (SR_*) set by the workflow's own record step:
//   SR_MODE, SR_STARTED_AT, SR_OUT_ROOT, SR_UPSTREAM_NAME, SR_UPSTREAM_RUN_ID.
// Exit 0 on a successful write; a schema-invalid artifact throws (non-zero), a real condition to see.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, buildRunArtifactEnvelope } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { resolveHarnessRunContext } from "../lib/loop-run-id.mjs";
import { readStepSummary } from "./emit-downstream-chain-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const FAMILY = "source-resolution";
const FAMILY_DIR = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY);

export const STEPS = Object.freeze(["resolve-provisional-sources", "recompute-tiers", "recompute-trust-scores"]);

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const sum3 = (a, b, c) => (num(a) === null || num(b) === null || num(c) === null ? null : a + b + c);

/**
 * The counts one step's summary.json carries, under this family's own names. Pure.
 * @param {string} step
 * @param {object|null} summary the parsed summary.json, or null when the step never wrote one
 * @returns {object|null} null when there is no summary
 */
export function countsFor(step, summary) {
  if (!summary || typeof summary !== "object") return null;
  const c = summary.counts ?? {};
  if (step === "resolve-provisional-sources") {
    return {
      sources_resolved: sum3(c.promote, c.reject, c.worklist),
      promoted: num(c.promote),
      rejected: num(c.reject),
      worklisted: num(c.worklist),
      verdict_placed: num(summary.host_verdicts?.promoted_by_verdict),
      bias_tags_written: num(summary.bias_tags?.written),
      rows_applied: num(summary.applied),
    };
  }
  if (step === "recompute-trust-scores") {
    return {
      sources_scored: num(c.sources_scored),
      skipped_paused: num(c.skipped_paused),
      scores_applied: num(summary.applied),
    };
  }
  return {
    sources_scanned: num(c.sources_scanned),
    tier_movements: num(c.movements),
    tier_promotions: num(c.promotions),
    tier_demotions: num(c.demotions),
    override_held: num(c.override_held),
    held_cadence_off: num(c.held_cadence_off),
    movements_applied: num(summary.applied),
  };
}

/** One count off a step's counts object, null when the step has none. */
const pick = (results, step, key) => countsFor(step, results.find((r) => r.step === step)?.summary ?? null)?.[key] ?? null;

export function buildArtifact({ runId, harnessVersion, startedAt, mode, upstreamName, upstreamRunId, stepResults, loopRunId = null }) {
  const perItem = stepResults.map((r) => {
    const counts = countsFor(r.step, r.summary);
    const shown = counts ? Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ") : "";
    return {
      id: r.step,
      outcome: !r.ran ? "skipped" : r.exitCode === 0 ? "clean" : "nonzero_exit",
      verdict: r.ran ? `exitCode=${r.exitCode}${shown ? ` ${shown}` : ""}` : "not run",
      counts,
      evidence_refs: r.pathRel ? [r.pathRel] : [],
      error: r.ran && r.exitCode !== 0 ? JSON.stringify(r.summary ?? {}) : null,
    };
  });

  const stepsWithSummary = stepResults.filter((r) => r.ran).length;
  const failed = stepResults.filter((r) => r.ran && r.exitCode !== 0);
  const fullTraceRefs = perItem.flatMap((p) => p.evidence_refs);
  if (fullTraceRefs.length === 0) fullTraceRefs.push("docs/runbooks/maintenance.d/61-source-resolution.md");

  const artifact = buildRunArtifactEnvelope({
    family: FAMILY,
    harnessVersion,
    runId,
    startedAt,
    config: {
      mode,
      upstream_name: upstreamName || null,
      upstream_run_id: upstreamRunId || null,
      loop_run_id: loopRunId,
      steps: [...STEPS],
    },
    inputsRef: [...STEPS],
    perItem,
    metrics: {
      steps_run: stepsWithSummary,
      steps_with_summary: stepsWithSummary,
      steps_nonzero_exit: failed.length,
      sources_resolved: pick(stepResults, "resolve-provisional-sources", "sources_resolved"),
      sources_promoted: pick(stepResults, "resolve-provisional-sources", "promoted"),
      sources_rejected: pick(stepResults, "resolve-provisional-sources", "rejected"),
      sources_worklisted: pick(stepResults, "resolve-provisional-sources", "worklisted"),
      verdict_placed: pick(stepResults, "resolve-provisional-sources", "verdict_placed"),
      sources_scanned: pick(stepResults, "recompute-tiers", "sources_scanned"),
      tier_movements: pick(stepResults, "recompute-tiers", "tier_movements"),
      tier_promotions: pick(stepResults, "recompute-tiers", "tier_promotions"),
      tier_demotions: pick(stepResults, "recompute-tiers", "tier_demotions"),
      trust_sources_scored: pick(stepResults, "recompute-trust-scores", "sources_scored"),
      trust_scores_applied: pick(stepResults, "recompute-trust-scores", "scores_applied"),
    },
    defectsFound: failed.length
      ? [{
          description: `${failed.length} of ${STEPS.length} source-resolution step(s) exited nonzero this run`,
          root_cause: failed.map((r) => `${r.step}: exitCode=${r.exitCode}`).join(" | "),
          fix_ref: null,
        }]
      : [],
    fullTraceRefs,
    proposerNotes:
      "Auto-emitted by emit-source-resolution-artifact.mjs after resolve-provisional-sources, recompute-tiers and recompute-trust-scores each wrote " +
      "their own summary.json through the shared ./.github/actions/maintenance-step composite action. In build mode a chained " +
      "firing is forced dry, so the counts are what the steps WOULD resolve and move.",
  });
  // upstream_run_id is optional and, when present, must be a non-empty string: a hand dispatch has none.
  if (upstreamRunId) artifact.upstream_run_id = String(upstreamRunId);
  return artifact;
}

/**
 * Read both steps' summaries, build the artifact and write it. `env`, `familyDir` and `fsiRoot` are
 * injectable so the test runs against a temp directory.
 */
export function emit({ env = process.env, familyDir = FAMILY_DIR, fsiRoot = FSI_ROOT } = {}) {
  const outRoot = env.SR_OUT_ROOT || null;
  const upstreamName = env.SR_UPSTREAM_NAME || null;
  const upstreamRunId = env.SR_UPSTREAM_RUN_ID || null;
  const stepResults = STEPS.map((step) =>
    outRoot ? readStepSummary(outRoot, step) : { step, ran: false, exitCode: null, summary: null, pathRel: null },
  );
  const { harnessVersion, runId, loopRunId } = resolveHarnessRunContext({
    family: FAMILY,
    familyDir,
    governingFiles: GOVERNING_FILES[FAMILY],
    fsiRoot,
    upstreamName,
    upstreamRunId,
    // The upstream row's own loop id (lane CHAIN-2, ADR-031): an explicit id wins over the on-disk resolver,
    // which finds nothing in a CI checkout now that artifacts land only in harness_runs.
    explicit: env.SR_LOOP_RUN_ID || null,
  });
  const artifact = buildArtifact({
    runId,
    harnessVersion,
    startedAt: env.SR_STARTED_AT || new Date().toISOString(),
    mode: env.SR_MODE || "dry",
    upstreamName,
    upstreamRunId,
    stepResults,
    loopRunId,
  });
  const outPath = writeRunArtifact(familyDir, artifact);
  return { outPath, artifact };
}

if (IS_MAIN) {
  const { outPath } = emit();
  console.log(`emit-source-resolution-artifact: wrote ${outPath}`);
}
