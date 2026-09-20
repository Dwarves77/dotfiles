#!/usr/bin/env node
// emit-brief-export-artifact.mjs -- brief-export's own harness-run artifact writer (lane M4, 2026-09-20,
// build plan section 6.1 row M4, Amendment 1 section C). Modeled on emit-downstream-chain-artifact.mjs
// (lane M3, 2026-09-19): reuses writeRunArtifact/claimRunId/hashHarnessVersion from run-artifact.mjs,
// never a second copy of the writer. "Emission is CODE" -- brief-export.yml calls this in its own final
// step, `if: always()`, so a chained firing that resolved zero ids still leaves a record ("record it
// every batch, even when zero," MINT-RUNBOOK.md section 5).
//
// [CONFIRMED by grep of brief-export.yml on master cc038a47] the export workflow wrote NO harness
// artifact before this lane -- no writeRunArtifact call anywhere in its path -- and the loop manifest
// filed its hop under family "brief-apply" "for now". Plan 6.2 requires "an artifact at every hop
// carrying that run id and trigger: workflow_run" and names brief-export specifically.
//
// This is NOT a canonical entry point in run-mint-batch.mjs's sense: it runs no export itself. Its only
// job is to read back what THIS run's own resolve/export steps already decided (the resolved --ids,
// the selection mode, the batch skeleton path, the branch) and record the outcome as this family's own
// CONVENTION.md-shaped artifact.
//
// Reads its configuration entirely from environment variables (BE_*), set by brief-export.yml's own
// "Record this run's own harness-run artifact" step -- this script has no CLI flags because it has
// exactly one caller and that caller already has every value as a workflow-step output.
//
// loop_run_id (lane M3b's resolveLoopRunIdFromUpstream, Amendment 1 section C item 3): this family's
// own upstream is "Population turn" (family "mint") -- the ONE shared name-to-family map in
// scripts/lib/loop-run-id.mjs, never a second copy of that map here.
//
// Exit 0 on a successful write. Throws (non-zero exit) on a schema-invalid artifact (writeRunArtifact's
// own fail-closed validation) or an id-claim collision after 50 attempts (claimRunId) -- both real
// conditions a coordinator should see, not swallow.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, buildRunArtifactEnvelope } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { resolveHarnessRunContext } from "../lib/loop-run-id.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const FAMILY = "brief-export";
const FAMILY_DIR = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY);

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/**
 * Parse a comma-separated id list (the same shape brief-export.yml's own "Resolve this run's --ids" step
 * output uses) into a trimmed, non-empty array. Never invents an id; a blank or absent value yields [].
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
export function parseIdsList(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Build the brief-export artifact object. Pure: no I/O, no env reads -- every value is passed in.
 * @param {object} opts
 * @param {string} opts.runId
 * @param {string} opts.harnessVersion
 * @param {string} opts.startedAt
 * @param {string} opts.mode -- "auto" (ids blank, this run auto-selected) or "explicit" (ids given).
 * @param {string} opts.selection -- "record" | "hollow" (auto-selection only; "explicit" when ids given).
 * @param {number} opts.limit
 * @param {string|null} opts.upstreamName
 * @param {string|null} opts.upstreamRunId
 * @param {string[]} opts.ids -- the resolved ids this run exported, or attempted to export.
 * @param {string|null} opts.batchPath -- the batch skeleton path this run wrote, or null when nothing exported.
 * @param {string|null} opts.branch -- the branch the batch skeleton landed on, or null.
 * @param {string|null} [opts.loopRunId]
 * @returns {object}
 */
export function buildArtifact({
  runId,
  harnessVersion,
  startedAt,
  mode,
  selection,
  limit,
  upstreamName,
  upstreamRunId,
  ids,
  batchPath,
  branch,
  loopRunId = null,
}) {
  const perItem = ids.map((id) => ({
    id,
    outcome: batchPath ? "exported" : "not_exported",
    verdict: batchPath ? `batch skeleton ${batchPath}` : "no batch skeleton written this run",
    evidence_refs: batchPath ? [batchPath] : [],
    error: null,
  }));

  const fullTraceRefs = batchPath ? [batchPath] : ["docs/runbooks/MAINTENANCE-RUNBOOK.md"];

  const defectsFound = [];
  if (ids.length > 0 && !batchPath) {
    defectsFound.push({
      description: `${ids.length} id(s) resolved this run but no batch skeleton was written`,
      root_cause: "the export step did not produce scripts/turns/record-briefs/batches output for this run",
      fix_ref: null,
    });
  }

  // config.loop_run_id (lane M4, 2026-09-20): resolved through the one shared name-to-family map in
  // scripts/lib/loop-run-id.mjs (FAMILY_BY_WORKFLOW_NAME) rather than a second copy of that map here --
  // this family's own upstream is "Population turn" (family "mint").
  const config = {
    mode, selection, limit,
    upstream_name: upstreamName || null, upstream_run_id: upstreamRunId || null, loop_run_id: loopRunId,
    batch_path: batchPath || null, branch: branch || null,
  };

  const proposerNotes = ids.length === 0
    ? "This dispatch was a no-op: no ids (explicit or auto-selected) resolved this run. Recorded anyway so the family's own history shows every firing, not only the ones with real work (MINT-RUNBOOK.md's \"record it every batch, even when zero,\" applied here)."
    : "Auto-emitted by emit-brief-export-artifact.mjs after brief-export.yml's own resolve/export steps decided this run's ids and (when non-empty) wrote a batch skeleton.";

  // buildRunArtifactEnvelope (scripts/lib/run-artifact.mjs, lane M4): the CONVENTION.md top-level shape,
  // shared with every other emit-*-artifact.mjs writer -- not a hand-written object literal here (F45).
  return buildRunArtifactEnvelope({
    family: FAMILY, harnessVersion, runId, startedAt, config,
    inputsRef: ["export-corpus-for-extraction.mjs"], perItem,
    metrics: { ids_resolved: ids.length, ids_exported: batchPath ? ids.length : 0 },
    defectsFound, fullTraceRefs, proposerNotes,
  });
}

if (IS_MAIN) main();

function main() {
  const mode = process.env.BE_MODE === "explicit" ? "explicit" : "auto";
  const selection = process.env.BE_SELECTION || "record";
  const limit = Number(process.env.BE_LIMIT || "0");
  const upstreamName = process.env.BE_UPSTREAM_NAME || null;
  const upstreamRunId = process.env.BE_UPSTREAM_RUN_ID || null;
  const startedAt = process.env.BE_STARTED_AT || new Date().toISOString();
  const ids = parseIdsList(process.env.BE_IDS);
  const batchPath = process.env.BE_BATCH_PATH || null;
  const branch = process.env.BE_BRANCH || null;

  const { harnessVersion, runId, loopRunId } = resolveHarnessRunContext({
    family: FAMILY, familyDir: FAMILY_DIR, governingFiles: GOVERNING_FILES[FAMILY], fsiRoot: FSI_ROOT, upstreamName, upstreamRunId,
  });

  const artifact = buildArtifact({ runId, harnessVersion, startedAt, mode, selection, limit, upstreamName, upstreamRunId, ids, batchPath, branch, loopRunId });

  const outPath = writeRunArtifact(FAMILY_DIR, artifact);
  console.log(`emit-brief-export-artifact: wrote ${outPath}`);
}
