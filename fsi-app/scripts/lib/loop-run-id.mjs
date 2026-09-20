#!/usr/bin/env node
// loop-run-id.mjs -- the ONE home for resolving a hop's loop_run_id (lane M3, 2026-09-19, build plan
// section 6.1 row M3, Amendment 1 item B). The loop-wide run id source-sweep.yml's own "Resolve
// loop_run_id" step originates (defaults to that sweep's own github.run_id when the workflow_dispatch
// input is left blank -- see .github/workflows/source-sweep.yml and run-source-sweep.mjs's own header)
// needs to be readable by every hop downstream of the sweep, so a proof run (build plan section 6.2) can
// find every hop's artifact by one shared id. This module is that ONE resolution function -- no runner
// re-derives its own version of "how do I find the id".
//
// Pure, no I/O other than the filesystem read of a harness-runs directory already on the checked-out
// tree (the SAME hydrate-then-read pattern every runner in this repo already uses -- see
// scripts/lib/run-artifact.mjs's readRunHistory, which this module calls). No network, no DB.
//
// THE FIX (Amendment 2, 2026-09-19 night, answering this lane's own STOP on Amendment 1 item B). An
// earlier version of this function matched on `config.loop_run_id`, which was unsound: Amendment 1
// assumed every artifact records the GitHub run id of the run that wrote it, and none does --
// source-sweep.yml's own default only holds when the operator leaves `loop_run_id` blank, and the proof
// run passes an EXPLICIT id, so even hop 1 would have resolved null. The corrected design:
// `writeRunArtifact` (scripts/lib/run-artifact.mjs) now stamps `config.github_run_id` on EVERY artifact
// it writes, for every family -- ONE home for a run's own id, present regardless of whether that same
// run's own `loop_run_id` is explicit, defaulted, or absent. `resolveLoopRunId` below matches on
// `config.github_run_id`, uniformly, at every hop -- there is no remaining "sound only for hop 1" scope
// limitation, and hop 2+ (the mint runner reading ledger-consume's artifact; the downstream-chain
// artifact writer reading population-turn's or corpus-turn's artifact) is wired the same way as hop 1,
// through this one function.
//
// CONTRACT: `explicit` (a --loop-run-id CLI argument, or any value a caller already resolved out-of-band)
// ALWAYS wins. Otherwise, this function looks for the ONE artifact of `upstreamFamily` whose OWN
// `config.github_run_id` equals `upstreamRunId` (the calling workflow's own knowledge of the upstream
// run's GitHub Actions run id, e.g. `github.event.workflow_run.id`) and returns THAT artifact's OWN
// `config.loop_run_id`. It NEVER invents an id: no match, a matched artifact with no `loop_run_id` field
// at all, or no `upstreamRunId` given in the first place, all return null.

import { resolve } from "node:path";
import { readRunHistory } from "./run-artifact.mjs";

// FAMILY_BY_WORKFLOW_NAME (lane M3b, 2026-09-20, build plan section 6.1 row M3b): the ONE home for
// workflow-name to harness-family mapping. Keyed by the workflow `name:` line exactly as each yml spells
// it (loop-manifest.mjs's own comment: "read every workflow file's own name line before trusting a value
// here" applies equally here). A value of null means the workflow is its own loop head with no upstream
// sweep id to inherit (Data producers today); resolveLoopRunIdFromUpstream below treats an unknown name
// the same as a null family, both falling back to `explicit`. This replaces the per-file name maps
// individual emitters would otherwise grow on their own (emit-downstream-chain-artifact.mjs and
// emit-corpus-turn-artifact.mjs both resolve through this one map instead of each keeping its own copy).
export const FAMILY_BY_WORKFLOW_NAME = Object.freeze({
  "Source sweep": "source-sweep",
  "Ledger consume": "ledger-consume",
  "Population turn": "mint",
  "Corpus turn": "corpus-turn",
  "Downstream chain": "downstream-chain",
  "Brief apply": "brief-apply",
  // Data producers are their own loop head: no sweep id exists upstream of them, so null is the honest
  // value, not a family this function should search.
  "Data producers": null,
});

/**
 * Resolve a hop's loop_run_id from its upstream workflow's NAME (rather than a caller pre-knowing the
 * upstream's harness family directory). Looks `upstreamName` up in FAMILY_BY_WORKFLOW_NAME; an unknown
 * name or a null family returns `explicit ?? null` (never invents a family to search). Otherwise calls
 * resolveLoopRunId with `harnessRunsDir = <fsiRoot>/scripts/harness-runs/<family>`, matching every
 * existing caller's own convention (see run-fetch-drain.mjs / run-ledger-consume.mjs).
 * @param {object} opts
 * @param {string|null|undefined} opts.explicit - a `--loop-run-id` CLI argument or other out-of-band value.
 * @param {string|null|undefined} opts.upstreamName - the upstream workflow's `name:` as the yml spells it.
 * @param {string|number|null|undefined} opts.upstreamRunId - the upstream run's own GitHub Actions run id.
 * @param {string} opts.fsiRoot - the fsi-app root, used to build the harness-runs directory.
 * @returns {string|null}
 */
export function resolveLoopRunIdFromUpstream({ explicit = null, upstreamName, upstreamRunId, fsiRoot }) {
  const family = upstreamName != null ? FAMILY_BY_WORKFLOW_NAME[upstreamName] : undefined;
  if (family == null) {
    return explicit != null && String(explicit).trim() !== "" ? String(explicit).trim() : null;
  }
  return resolveLoopRunId({
    explicit,
    upstreamFamily: family,
    upstreamRunId,
    harnessRunsDir: resolve(fsiRoot, "scripts", "harness-runs", family),
  });
}

/**
 * Resolve the loop_run_id a hop's own artifact should record.
 * @param {object} opts
 * @param {string|null|undefined} opts.explicit - a `--loop-run-id` CLI argument (or any value a caller
 *   already resolved out-of-band, e.g. a workflow's own bash/jq read of the upstream artifact). Wins
 *   unconditionally when non-empty.
 * @param {string} opts.upstreamFamily - the harness family directory name to search (e.g. "source-sweep").
 * @param {string|number|null|undefined} opts.upstreamRunId - the upstream run's own GitHub Actions run id,
 *   from the calling workflow's own `github.event.workflow_run.id` (or equivalent). Compared as a string.
 * @param {string} opts.harnessRunsDir - path to `<family>` under `scripts/harness-runs/` (or its root;
 *   this function only ever reads `opts.harnessRunsDir` itself, so pass the FAMILY directory, matching
 *   every existing caller's own `--harness-runs-dir scripts/harness-runs/<family>` convention).
 * @returns {string|null} the resolved loop_run_id, or null when nothing resolves (never invented).
 */
export function resolveLoopRunId({ explicit, upstreamFamily, upstreamRunId, harnessRunsDir }) {
  if (explicit != null && String(explicit).trim() !== "") {
    return String(explicit).trim();
  }
  if (upstreamRunId == null || String(upstreamRunId).trim() === "") {
    return null;
  }
  const wantRunId = String(upstreamRunId).trim();
  const { runs } = readRunHistory(harnessRunsDir);
  for (const run of runs) {
    // Match on config.github_run_id (Amendment 2) -- the field writeRunArtifact stamps on every
    // artifact with the run's OWN GitHub Actions run id, never config.loop_run_id (which may be
    // explicit, defaulted, or absent, and does not identify the artifact's own run).
    const recordedRunId = run?.config?.github_run_id;
    if (recordedRunId != null && String(recordedRunId).trim() === wantRunId) {
      const loopRunId = run?.config?.loop_run_id;
      // A matched artifact with no loop_run_id at all (or an empty one) never invents a value here --
      // null, same as no match, per this module's own contract.
      return loopRunId != null && String(loopRunId).trim() !== "" ? String(loopRunId).trim() : null;
    }
  }
  return null;
}
