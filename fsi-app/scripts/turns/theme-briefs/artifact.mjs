// artifact.mjs: the theme-briefs family's harness-run artifact (lane S3-C, CONVENTION.md shape).
//
// Both runtimes (the export and the apply) write one artifact per run through the shared writer
// (scripts/lib/run-artifact.mjs writeRunArtifact / claimRunId / buildRunArtifactEnvelope), never a second
// copy of the envelope. The workflow's final step lands the artifact into harness_runs
// (scripts/turns/deliver-artifact-branch.sh -> scripts/lib/record-harness-run.mjs), the same as brief-export.
// "Emission is CODE": the CLIs call emitThemeBriefsArtifact themselves on every run, including a run that
// resolved zero themes, so the family's history shows every firing.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, buildRunArtifactEnvelope, claimRunId, hashHarnessVersion } from "../../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../../harness-runs/governing-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FSI_ROOT = resolve(HERE, "..", "..", "..");
export const FAMILY = "theme-briefs";
export const DEFAULT_FAMILY_DIR = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY);

/**
 * Pure: the artifact object for one run.
 * @param {{action:"export"|"apply", runId:string, harnessVersion:string, startedAt:string, config:object,
 *   inputsRef:string[], perItem:object[], metrics:object, defectsFound:object[], fullTraceRefs:string[], proposerNotes:string}} o
 */
export function buildThemeBriefsArtifact(o) {
  return buildRunArtifactEnvelope({
    family: FAMILY,
    harnessVersion: o.harnessVersion,
    runId: o.runId,
    startedAt: o.startedAt,
    config: { action: o.action, ...o.config },
    inputsRef: o.inputsRef,
    perItem: o.perItem,
    metrics: o.metrics,
    defectsFound: o.defectsFound,
    fullTraceRefs: o.fullTraceRefs,
    proposerNotes: o.proposerNotes,
  });
}

/** Claim a run id, build and write the artifact. Returns the path written. */
export function emitThemeBriefsArtifact(o, { familyDir = DEFAULT_FAMILY_DIR, fsiRoot = FSI_ROOT } = {}) {
  const harnessVersion = hashHarnessVersion(GOVERNING_FILES[FAMILY], fsiRoot);
  const runId = claimRunId(familyDir, FAMILY);
  return writeRunArtifact(familyDir, buildThemeBriefsArtifact({ ...o, runId, harnessVersion }));
}
