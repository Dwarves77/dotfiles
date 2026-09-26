#!/usr/bin/env node
// emit-gate-a-rescan-artifact.mjs -- gate-a-rescan's own harness-run artifact writer (lane M6b,
// 2026-09-21, build plan section 6.1 row M6). Modeled on emit-brief-export-artifact.mjs: reuses
// resolveHarnessRunContext (scripts/lib/loop-run-id.mjs) and buildRunArtifactEnvelope
// (scripts/lib/run-artifact.mjs), never a second copy of either (F45). "Emission is CODE" --
// gate-a-rescan.yml calls this in its own final step, `if: always()`, so a chained firing that
// selected zero stale items still leaves a record ("record it every batch, even when zero,"
// MINT-RUNBOOK.md section 5).
//
// This is NOT a canonical entry point in run-mint-batch.mjs's sense: it runs no scan itself. Its only
// job is to read back what THIS run's own gate-a-rescan.mjs step (and, when it ran, the chained
// attach-found-sources.mjs step) already decided -- their own summary.json files, per
// scripts/maintenance/lib/cli.mjs's `--out` contract -- and record the outcome as this family's own
// CONVENTION.md-shaped artifact.
//
// Reads its configuration entirely from environment variables (GAR_*), set by gate-a-rescan.yml's own
// "Record this run's own harness-run artifact" step -- this script has no CLI flags because it has
// exactly one caller and that caller already has every value as a workflow-step output/env.
//
// loop_run_id (resolveHarnessRunContext -> resolveLoopRunIdFromUpstream): this family's own upstream
// is whichever of "Brief apply" / "Population turn" fired this run -- the ONE shared name-to-family map
// in scripts/lib/loop-run-id.mjs (FAMILY_BY_WORKFLOW_NAME), never a second copy of that map here.
//
// Exit 0 on a successful write. Throws (non-zero exit) on a schema-invalid artifact (writeRunArtifact's
// own fail-closed validation) or an id-claim collision after 50 attempts (claimRunId) -- both real
// conditions a coordinator should see, not swallow.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { writeRunArtifact, buildRunArtifactEnvelope } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { resolveHarnessRunContext } from "../lib/loop-run-id.mjs";
import { isMainModule } from "../lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const FAMILY = "gate-a-rescan";
const FAMILY_DIR = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY);

/** Reads and parses a JSON file relative to FSI_ROOT (an absolute path is used as-is); returns null on
 *  any missing/unreadable/unparseable file -- a summary that never got written (an entirely skipped
 *  step) is exactly as valid an input here as one that did, per this run's own "record it anyway" posture. */
function readJsonIfExists(path) {
  if (!path) return null;
  const abs = resolve(FSI_ROOT, path);
  if (!existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Build the gate-a-rescan artifact object. Pure: no I/O, no env reads -- every value is passed in.
 * @param {object} opts
 * @param {string} opts.runId
 * @param {string} opts.harnessVersion
 * @param {string} opts.startedAt
 * @param {string} opts.trigger -- "workflow_run" or "workflow_dispatch", exactly as the event gives it (F50 reads this).
 * @param {string} opts.mode -- "dry" | "apply"
 * @param {number} opts.limit
 * @param {string|null} opts.upstreamName
 * @param {string|null} opts.upstreamRunId
 * @param {object|null} opts.rescanSummary -- gate-a-rescan.mjs's own returned summary object.
 * @param {object|null} opts.attachSummary -- attach-found-sources.mjs's own returned summary object, or null when the chained attach step never ran.
 * @param {string|null} [opts.loopRunId]
 * @param {string|null} [opts.rescanStepOutcome] -- the gate-a-rescan.yml workflow's own "gate-a-rescan.mjs"
 *   step outcome (steps.rescan.outcome: "success" | "failure" | "cancelled" | "skipped"), passed through
 *   so this function can tell "the script ran and genuinely selected zero items" (rescanSummary present,
 *   an honest no-op) apart from "the script CRASHED before it could write summary.json at all"
 *   (rescanSummary null AND the step's own outcome was not "success"). Optional/null for backward
 *   compatibility with a caller that does not supply it (treated as unknown, never assumed successful).
 * @returns {object}
 */
export function buildArtifact({
  runId, harnessVersion, startedAt, trigger, mode, limit, upstreamName, upstreamRunId,
  rescanSummary, attachSummary, loopRunId = null, rescanStepOutcome = null,
}) {
  const rescanPerItem = Array.isArray(rescanSummary?.per_item) ? rescanSummary.per_item : [];
  const perItem = rescanPerItem.map((p) => ({
    id: p.id,
    outcome: p.touched ? "touched" : "rescanned",
    verdict: `gate_a_version ${p.gate_a_version_before ?? "(none)"} -> ${p.gate_a_version_after}; ` +
      `orphan_count ${p.orphan_count_before ?? "(none)"} -> ${p.orphan_count_after}`,
    evidence_refs: [],
    error: null,
  }));

  const defectsFound = [];
  // CRASH DETECTION (GitHub Actions run 36217491293, 2026-09-26). Before this fix, a missing
  // rescanSummary (the gate-a-rescan.mjs CLI wrapper throws BEFORE it ever calls writeSummary --
  // see scripts/maintenance/lib/cli.mjs's runCli -- so summary.json is never written on a crash) was
  // indistinguishable from "the script ran and genuinely selected zero stale items," and this
  // function recorded the latter: zero defects, "This dispatch was a no-op" in proposer_notes. That is
  // exactly backwards for a run whose gate-a-rescan.mjs step actually failed. rescanStepOutcome (the
  // workflow's own steps.rescan.outcome) is the ground truth this function did not have before:
  // rescanSummary null with a NON-"success" step outcome means the script crashed, never a real no-op.
  const rescanStepFailed = rescanStepOutcome != null && rescanStepOutcome !== "success";
  const rescanCrashedSilently = rescanSummary == null && rescanStepFailed;
  if (rescanCrashedSilently) {
    defectsFound.push({
      description:
        `gate-a-rescan.mjs's own step outcome was "${rescanStepOutcome}" and it never wrote a ` +
        "summary.json -- the script crashed (an uncaught exception) before the CLI wrapper's " +
        "success path could run. See this run's own uploaded /tmp/gate-a-rescan.log artifact for " +
        "the stack trace.",
      root_cause: "gate-a-rescan.mjs threw before completing; no summary.json was produced this run.",
      fix_ref: null,
    });
  } else if (rescanSummary && typeof rescanSummary.exitCode === "number" && rescanSummary.exitCode !== 0) {
    defectsFound.push({
      description: rescanSummary.note || "gate-a-rescan run halted non-zero",
      root_cause: rescanSummary.note || "",
      fix_ref: null,
    });
  } else if (rescanSummary == null && rescanStepOutcome == null) {
    // rescanStepOutcome was not supplied at all (an older caller, or a test) -- an ABSENT summary is
    // still worth flagging honestly rather than silently treated as a clean no-op, since this function
    // has no positive evidence either way. Named separately from the confirmed-crash case above so a
    // caller that DOES supply the outcome gets the more specific message.
    defectsFound.push({
      description:
        "gate-a-rescan.mjs produced no summary.json and no step-outcome signal was supplied to this " +
        "artifact emitter -- recorded as unresolved rather than assumed successful.",
      root_cause: "rescanSummary was null with rescanStepOutcome unknown.",
      fix_ref: null,
    });
  }

  // attach: { rows_offered: 0 } (brief item 4) is a RECORDED RESULT, never an error -- present whether
  // or not the chained attach-found-sources step ran at all this firing (workflow_run's own dry-mode
  // constraint means it may run and still offer zero grounded rows).
  const attach = attachSummary
    ? {
      rows_offered: attachSummary?.counts?.worklist_ready ?? 0,
      grounded: attachSummary?.counts?.grounded_via_worklist ?? 0,
    }
    : { rows_offered: 0 };

  const config = {
    trigger, mode, limit,
    upstream_name: upstreamName || null, upstream_run_id: upstreamRunId || null, loop_run_id: loopRunId,
    scope_source: rescanSummary?.config?.scope_source ?? null,
    attach,
  };

  const metrics = {
    candidates: rescanSummary?.counts?.candidates ?? 0,
    stale: rescanSummary?.counts?.stale ?? 0,
    selected: rescanSummary?.counts?.selected ?? 0,
    touched: rescanSummary?.counts?.touched ?? 0,
    distinct_versions_remaining: rescanSummary?.read_back?.distinct_versions_remaining ?? null,
  };

  const fullTraceRefs = ["docs/runbooks/MAINTENANCE-RUNBOOK.md"];

  const proposerNotes = defectsFound.length > 0
    ? `This run did NOT complete cleanly (${defectsFound.length} defect(s) recorded above) -- see ` +
      "defects_found for the cause. Recorded anyway so this family's own history shows every firing, " +
      "including failed ones, never only the ones with real work."
    : perItem.length === 0
      ? "This dispatch was a no-op: zero stale item_gate_a_state rows selected this run. Recorded anyway " +
        "so this family's own history shows every firing, not only the ones with real work " +
        "(MINT-RUNBOOK.md's \"record it every batch, even when zero,\" applied here)."
      : "Auto-emitted by emit-gate-a-rescan-artifact.mjs after gate-a-rescan.mjs's own run (and, when any " +
        "orphaned items remained, attach-found-sources.mjs's chained worklist pass) recorded their outcomes.";

  return buildRunArtifactEnvelope({
    family: FAMILY, harnessVersion, runId, startedAt, config,
    inputsRef: ["scripts/maintenance/gate-a-rescan.mjs"], perItem,
    metrics, defectsFound, fullTraceRefs, proposerNotes,
  });
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) main();

function main() {
  const mode = process.env.GAR_MODE === "apply" ? "apply" : "dry";
  // trigger is recorded EXACTLY as the event gives it (F50 reads this field) -- "workflow_run" or
  // "workflow_dispatch", never a re-derived/guessed value.
  const trigger = process.env.GAR_EVENT_TRIGGER === "workflow_run" ? "workflow_run" : "workflow_dispatch";
  const limit = Number(process.env.GAR_LIMIT || "0");
  const upstreamName = process.env.GAR_UPSTREAM_NAME || null;
  const upstreamRunId = process.env.GAR_UPSTREAM_RUN_ID || null;
  const startedAt = process.env.GAR_STARTED_AT || new Date().toISOString();
  const rescanSummary = readJsonIfExists(process.env.GAR_RESCAN_SUMMARY_PATH);
  const attachSummary = readJsonIfExists(process.env.GAR_ATTACH_SUMMARY_PATH);
  // GAR_RESCAN_STEP_OUTCOME (GitHub Actions run 36217491293, 2026-09-26): gate-a-rescan.yml's own
  // "gate-a-rescan.mjs" step's steps.rescan.outcome, so buildArtifact can tell a genuine no-op apart
  // from a crash that left no summary.json -- see buildArtifact's own header for the incident.
  const rescanStepOutcome = process.env.GAR_RESCAN_STEP_OUTCOME || null;

  const { harnessVersion, runId, loopRunId } = resolveHarnessRunContext({
    family: FAMILY, familyDir: FAMILY_DIR, governingFiles: GOVERNING_FILES[FAMILY], fsiRoot: FSI_ROOT,
    upstreamName, upstreamRunId,
  });

  const artifact = buildArtifact({
    runId, harnessVersion, startedAt, trigger, mode, limit, upstreamName, upstreamRunId,
    rescanSummary, attachSummary, loopRunId, rescanStepOutcome,
  });

  const outPath = writeRunArtifact(FAMILY_DIR, artifact);
  console.log(`emit-gate-a-rescan-artifact: wrote ${outPath}`);
}
