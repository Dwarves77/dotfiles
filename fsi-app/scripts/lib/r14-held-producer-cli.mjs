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
// PLAIN ESM. Filesystem-only (via the injected writeRunArtifact/claimRunId/hashHarnessVersion), no
// network, no DB, this module never touches either.

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

/**
 * The shared defects-from-refusals reducer: every `perItem` entry whose outcome names a refusal (rated
 * or grounded) becomes one `defects_found` row, plus one more if the run itself threw. Both existing
 * producers had an identical loop shape differing only in which outcome string they matched and the
 * root_cause text, this takes both as parameters instead of hard-coding either producer's vocabulary.
 * @param {Array<{outcome:string, id:string, verdict:string|null}>} perItem
 * @param {{unratedOutcome: string, unratedRootCause: string}} config
 * @param {Error|null} runError
 * @returns {Array<{description:string, root_cause:string, fix_ref:string|null}>}
 */
export function buildDefectsFromRefusals(perItem, { unratedOutcome, unratedRootCause }, runError) {
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
 * @returns {Promise<{result: object|null, runError: Error|null, artifactPath: string, fixturesPath: string, trace: boolean}>}
 */
export async function runR14HeldFixtureCli({
  args, here, defaultFixturesRelPath, defaultHarnessRunsDir, harnessFamily, fsiRoot, governingFiles, runFn, buildArtifactFn,
  resolvePathFn, pathToFileURLFn, mkdirSyncFn, claimRunIdFn, hashHarnessVersionFn, writeRunArtifactFn,
}) {
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
 * Assemble the standard run-artifact shape every R14-held fixture producer writes. Callers still call
 * `writeRunArtifact` themselves (this returns the plain object, no I/O here), keeps this module
 * filesystem-free and independently testable.
 * @param {object} args
 * @returns {object} a CONVENTION.md-shaped run artifact
 */
export function buildR14HeldRunArtifact({
  harnessFamily, harnessVersion, runId, startedAt, finishedAt, config, inputsRef, perItem, metrics,
  defectsFound, fullTraceRefs, proposerNotes,
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
    defects_found: defectsFound ?? [],
    full_trace_refs: fullTraceRefs,
    proposer_notes: proposerNotes,
  };
}
