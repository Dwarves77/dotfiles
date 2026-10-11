import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, buildRunArtifactEnvelope, claimRunId, hashHarnessVersion } from "../../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../../harness-runs/governing-files.mjs";

export const FAMILY = "needs-search";
const FSI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Claim a run id, build and write the artifact; returns the path written.
 * @param {{action:"export"|"apply", startedAt:string, config:object, inputsRef:string[], perItem:object[], metrics:object,
 *   defectsFound:object[], fullTraceRefs:string[], proposerNotes:string}} o
 */
export function emitNeedsSearchArtifact(o, opts = {}) {
  const familyDir = opts.familyDir ?? resolve(FSI_ROOT, "scripts/harness-runs", FAMILY);
  const fsiRoot = opts.fsiRoot ?? FSI_ROOT;
  const { action, config, ...run } = o;
  const runId = claimRunId(familyDir, FAMILY);
  const harnessVersion = hashHarnessVersion(GOVERNING_FILES[FAMILY], fsiRoot);
  const envelope = buildRunArtifactEnvelope({ ...run, family: FAMILY, harnessVersion, runId, config: { action, ...config } });
  return writeRunArtifact(familyDir, envelope);
}
