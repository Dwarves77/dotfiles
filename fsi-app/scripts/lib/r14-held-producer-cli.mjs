// r14-held-producer-cli.mjs, the shared CLI shell for an R14-held fixture/dry-only producer (CLAUDE.md
// standing rule/operator ruling 2026-09-25: "we are NOT updating the data on the site, we are building
// the tools that manage that data first"). Extracted (lane ETS-PROXY, 2026-09-28, F45 duplicate-code
// gate) from state-cost-facts-producer.mjs and carrier-ets-surcharge-producer.mjs, which had grown a
// near-identical `--apply` refusal message and harness-run-artifact builder shape, never a second,
// drifting copy of the same R14 enforcement text and artifact plumbing.
//
// WHAT STAYS PER-PRODUCER (deliberately NOT extracted here): the actual candidate set, grounding,
// row-building, and planning logic, that is each producer's own business logic and the whole reason F27
// requires a producer-specific composition proof. This module only owns the CLI SHELL every R14-held
// producer wraps that logic in.
//
// PLAIN ESM. Filesystem-only (writeRunArtifact/claimRunId/hashHarnessVersion, imported directly below,
// same real implementation every producer used to pass in by hand), no network, no DB.
//
// Coordinator follow-up (2026-09-28, F45): the two producers' own `runR14HeldFixtureCli` CALL SITES were
// STILL duplicating six identical plumbing-function keys (resolvePathFn/pathToFileURLFn/mkdirSyncFn/
// claimRunIdFn/hashHarnessVersionFn/writeRunArtifactFn), because every real caller always passes the SAME
// node-builtin/run-artifact.mjs implementations, never a different one. This module now imports and
// defaults them itself; a caller only overrides via `deps` when it genuinely needs to (a test).

import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "./run-artifact.mjs";

/**
 * The standard R14 `--apply` refusal: recognises the flag only to refuse it explicitly, never silently
 * ignores it. Returns true (and has already printed the refusal + exit(0) is the CALLER's job, since
 * `process.exit` inside a shared helper would make it untestable) iff the caller should stop here.
 * @param {string[]} args process.argv.slice(2)
 * @param {string} producerName
 * @param {boolean} enabled the producer's own ENABLED kill switch (always false while R14 holds)
 * @returns {string|null} the refusal message to log, or null if `--apply` was not requested
 */
export function r14ApplyRefusalMessage(args, producerName, enabled) {
  if (!args.includes("--apply")) return null;
  return (
    `${producerName}: --apply requested but this lane's CLI has no live-write path (R14 hold; ` +
    `ENABLED=${enabled}), refusing, exit 0. Nothing was read, fetched, or written.`
  );
}

// The default rated-source refusal vocabulary: BOTH existing R14-held producers refuse an unrated
// candidate for the SAME reason, because both rate through the SAME shared classTierForHost step
// (rate-source-by-class.mjs). This is not two producers coincidentally choosing the same words, it is
// one shared mechanism's one refusal outcome, so it is the DEFAULT here rather than a value each caller
// repeats. A future producer with a genuinely different refusal vocabulary overrides it explicitly.
const DEFAULT_UNRATED_OUTCOME = "refused_unrated_source";
const DEFAULT_UNRATED_ROOT_CAUSE = "host not present in the institution class table (host-authority.ts)";

/**
 * The shared defects-from-refusals reducer: every `perItem` entry whose outcome names a refusal (rated
 * or grounded) becomes one `defects_found` row, plus one more if the run itself threw.
 * @param {Array<{outcome:string, id:string, verdict:string|null}>} perItem
 * @param {Error|null} runError
 * @param {{unratedOutcome?: string, unratedRootCause?: string}} [config] override the default rated-source
 *   refusal vocabulary; every current caller uses the shared default.
 * @returns {Array<{description:string, root_cause:string, fix_ref:string|null}>}
 */
function buildDefectsFromRefusals(perItem, runError, config = {}) {
  const unratedOutcome = config.unratedOutcome ?? DEFAULT_UNRATED_OUTCOME;
  const unratedRootCause = config.unratedRootCause ?? DEFAULT_UNRATED_ROOT_CAUSE;
  const defectsFound = [];
  for (const item of perItem ?? []) {
    if (item.outcome === unratedOutcome) {
      defectsFound.push({ description: `candidate ${item.id} refused: ${item.verdict}`, root_cause: unratedRootCause, fix_ref: null });
    }
  }
  if (runError) {
    defectsFound.push({ description: `producer threw: ${runError.message}`, root_cause: runError.stack ?? "", fix_ref: null });
  }
  return defectsFound;
}

/**
 * The shared fixture/dry CLI shell: parse `--fixtures`/`--harness-runs-dir`/`--trace`, dynamic-import the
 * fixtures module, run the producer's own logic (caller-supplied), then claim a run id, hash the family's
 * governing files, and write the artifact. Extracted from state-cost-facts-producer.mjs and
 * carrier-ets-surcharge-producer.mjs's near-identical `main()` bodies (F45 duplicate-code gate), this
 * owns the CLI PLUMBING only; the caller still owns its own producer-specific console.log summary lines
 * and exit-code handling (those differ enough per producer that forcing them through one shape would
 * hide, not remove, the real per-producer logic).
 *
 * @param {object} config
 * @param {string[]} config.args process.argv.slice(2)
 * @param {string} config.here dirname(fileURLToPath(import.meta.url)) of the CALLING producer script
 * @param {string} config.defaultFixturesRelPath e.g. "fixtures/carrier-ets-surcharge-fixtures.mjs"
 * @param {string} config.defaultHarnessRunsDir DEFAULT_HARNESS_RUNS_DIR
 * @param {string} config.harnessFamily
 * @param {string} config.fsiRoot FSI_ROOT
 * @param {object} config.governingFiles GOVERNING_FILES (the whole map; this function indexes by harnessFamily)
 * @param {(fixtures: object, trace: boolean) => Promise<object|null>} config.runFn runs the producer's own
 *   logic against the imported fixtures module, returns the `result` (or throws, caught here as `runError`)
 * @param {(ctx: {runId:string, harnessVersion:string, startedAt:string, finishedAt:string, result:object|null, runError:Error|null, fixturesPath:string}) => object} config.buildArtifactFn
 * @param {object} [config.deps] test-only overrides for the plumbing fns (resolvePathFn/pathToFileURLFn/
 *   mkdirSyncFn/claimRunIdFn/hashHarnessVersionFn/writeRunArtifactFn); every real caller omits this.
 * @returns {Promise<{result: object|null, runError: Error|null, artifactPath: string, fixturesPath: string, trace: boolean}>}
 */
export async function runR14HeldFixtureCli({
  args, here, defaultFixturesRelPath, defaultHarnessRunsDir, harnessFamily, fsiRoot, governingFiles, runFn, buildArtifactFn,
  deps = {},
}) {
  const resolvePathFn = deps.resolvePathFn ?? resolvePath;
  const pathToFileURLFn = deps.pathToFileURLFn ?? pathToFileURL;
  const mkdirSyncFn = deps.mkdirSyncFn ?? mkdirSync;
  const claimRunIdFn = deps.claimRunIdFn ?? claimRunId;
  const hashHarnessVersionFn = deps.hashHarnessVersionFn ?? hashHarnessVersion;
  const writeRunArtifactFn = deps.writeRunArtifactFn ?? writeRunArtifact;
  const fixturesFlagIdx = args.indexOf("--fixtures");
  const fixturesPath = resolvePathFn(
    fixturesFlagIdx !== -1 && args[fixturesFlagIdx + 1] ? args[fixturesFlagIdx + 1] : resolvePathFn(here, defaultFixturesRelPath),
  );
  const harnessDirFlagIdx = args.indexOf("--harness-runs-dir");
  const harnessRunsDir = resolvePathFn(harnessDirFlagIdx !== -1 && args[harnessDirFlagIdx + 1] ? args[harnessDirFlagIdx + 1] : defaultHarnessRunsDir);
  const trace = args.includes("--trace");

  const fixtures = await import(pathToFileURLFn(fixturesPath).href);
  const startedAt = new Date().toISOString();

  let result = null;
  let runError = null;
  try {
    result = await runFn(fixtures, trace);
  } catch (err) {
    runError = err;
  }

  mkdirSyncFn(harnessRunsDir, { recursive: true });
  const runId = claimRunIdFn(harnessRunsDir, harnessFamily);
  const harnessVersion = hashHarnessVersionFn(governingFiles[harnessFamily], fsiRoot);
  const artifact = buildArtifactFn({ runId, harnessVersion, startedAt, finishedAt: new Date().toISOString(), result, runError, fixturesPath });
  const artifactPath = writeRunArtifactFn(harnessRunsDir, artifact);

  return { result, runError, artifactPath, fixturesPath, trace };
}

/**
 * Assemble the standard run-artifact shape every R14-held fixture producer writes, INCLUDING the
 * defects-from-refusals reduction (folded in here, coordinator directive 2026-09-28, F45 follow-up: both
 * producers were separately calling `buildDefectsFromRefusals` then passing its result in, an identical
 * two-step shape). Callers still call `writeRunArtifact` themselves (this returns the plain object, no
 * I/O here), keeps this module filesystem-free and independently testable.
 * @param {object} args
 * @param {Error|null} [args.runError] threaded through to buildDefectsFromRefusals
 * @param {{unratedOutcome?: string, unratedRootCause?: string}} [args.refusalVocab] override, see
 *   buildDefectsFromRefusals; every current caller uses the shared default.
 * @param {Array} [args.defectsFound] an explicit override, skips the automatic reduction entirely (rare;
 *   no current caller needs it, kept for a future producer with a genuinely different defects shape).
 * @returns {object} a CONVENTION.md-shaped run artifact
 */
export function buildR14HeldRunArtifact({
  harnessFamily, harnessVersion, runId, startedAt, finishedAt, config, inputsRef, perItem, metrics,
  runError = null, refusalVocab, defectsFound, fullTraceRefs, proposerNotes,
}) {
  return {
    harness_family: harnessFamily,
    harness_version: harnessVersion,
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    config,
    inputs_ref: inputsRef,
    per_item: perItem ?? [],
    metrics: metrics ?? {},
    defects_found: defectsFound ?? buildDefectsFromRefusals(perItem, runError, refusalVocab),
    full_trace_refs: fullTraceRefs,
    proposer_notes: proposerNotes,
  };
}
