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
// CONTRACT: explicit (a --loop-run-id CLI argument, or the value a caller's own workflow-level bash/jq
// extraction already resolved from the upstream artifact -- see the STOP note below) ALWAYS wins.
// Otherwise, this function looks for the ONE artifact of `upstreamFamily` whose OWN `config.loop_run_id`
// equals `upstreamRunId` (the calling workflow's own knowledge of the upstream run's GitHub Actions run
// id, e.g. `github.event.workflow_run.id`) and returns that artifact's `config.loop_run_id`. It NEVER
// invents an id: no match (or no `upstreamRunId` given at all) returns null.
//
// SCOPE, HONESTLY STATED (STOP, this lane's report): this match-by-`config.loop_run_id` mechanism is
// sound for exactly the hop directly off `source-sweep` (fetch-drain, ledger-consume): source-sweep.yml's
// own "Resolve loop_run_id" step stamps `config.loop_run_id` to ITS OWN `github.run_id` whenever the
// operator leaves the workflow_dispatch `loop_run_id` input blank, so `config.loop_run_id` genuinely IS
// "the recorded GitHub run id of the run that wrote it" for that one family. It does NOT generalize past
// hop 1: once a downstream hop PROPAGATES the same shared loop_run_id forward (so a later stage's own
// artifact carries the ORIGINAL sweep's id, not that stage's own actual GitHub Actions run id), no
// artifact anywhere records a hop's own actual run id, so this same matching scheme cannot find "the
// ledger-consume artifact that hop N's own workflow_run event names" from a bare numeric run id alone.
// This lane did not wire this function into hop 2+ (the mint runner reading ledger-consume's loop_run_id;
// the downstream-chain artifact writer reading population-turn's or corpus-turn's loop_run_id) for
// exactly this reason -- see this lane's report for the full evidence and the two options a future lane
// or the coordinator can choose between (a new field recording each run's own actual GitHub Actions run
// id in every artifact, or wiring bash/jq extraction of the upstream's already-known config.loop_run_id
// into each consuming workflow's own resolve step, mirroring population-turn.yml's/downstream-chain.yml's
// existing "THE MECHANISM" artifact-fetch blocks, then passing it through as the `explicit` argument
// here).

import { readRunHistory } from "./run-artifact.mjs";

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
    const recorded = run?.config?.loop_run_id;
    if (recorded != null && String(recorded).trim() === wantRunId) {
      return String(recorded).trim();
    }
  }
  return null;
}
