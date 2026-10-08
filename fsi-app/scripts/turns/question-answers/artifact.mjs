// artifact.mjs: the question-answers family's harness-run artifact (lane L4-B, CONVENTION.md shape).
//
// Both runtimes (the export and the apply) write one artifact per run through the shared writer
// (scripts/lib/run-artifact.mjs), never a second copy of the envelope. The workflow's final step lands it into
// harness_runs (scripts/turns/deliver-artifact-branch.sh). Emission is code: the CLIs call
// emitQuestionAnswersArtifact on every run, including a run that found nothing to do (rule 17).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, buildRunArtifactEnvelope, claimRunId, hashHarnessVersion } from "../../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../../harness-runs/governing-files.mjs";

export const FAMILY = "question-answers";
const FSI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Claim a run id, build and write the artifact; returns the path written.
 * @param {{action:"export"|"apply", startedAt:string, config:object, inputsRef:string[], perItem:object[], metrics:object,
 *   defectsFound:object[], fullTraceRefs:string[], proposerNotes:string}} o
 */
export function emitQuestionAnswersArtifact(o, { familyDir = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY), fsiRoot = FSI_ROOT, env = process.env } = {}) {
  const { action, config, ...run } = o;
  // The loop run id (ADR-031, lane CHAIN-4): a chained firing's workflow reads the upstream row's id through
  // scripts/lib/upstream-artifact.mjs loop-id and exports it as QA_LOOP_RUN_ID; the on-disk resolver finds no
  // upstream artifact in a CI checkout. Null for a root run (a dispatch or a batch push) or an unreadable id.
  const loopRunId = typeof env?.QA_LOOP_RUN_ID === "string" && env.QA_LOOP_RUN_ID.trim() ? env.QA_LOOP_RUN_ID.trim() : null;
  const envelope = buildRunArtifactEnvelope({
    ...run,
    family: FAMILY,
    harnessVersion: hashHarnessVersion(GOVERNING_FILES[FAMILY], fsiRoot),
    runId: claimRunId(familyDir, FAMILY),
    config: { action, loop_run_id: loopRunId, ...config },
  });
  return writeRunArtifact(familyDir, envelope);
}
