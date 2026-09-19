# Lane M6: evaluate invokers (plan section 6.1, row M6)

Read `brief-m-common.md` first. Worktree and branch: named in your dispatch message (cut from master AFTER
lane M4 has merged). Lane id `m6`.

## Why

`docs/audits/stage-audit-2026-09-18/s3-evaluate.md` rows 5, 6 and 7: the Gate A scanner runs per write but
the bulk re-scan has no invoker except a maintenance dispatch (the corpus carries two scanner versions:
2,088 items at `2026-07-30.1`, 602 at `2026-09-04.1`); the quarantine-disposition verifier exists and is
registered but no CI lane measures it (53 of 78 quarantined items sit past the 14-day bound); and
`attach-found-sources` ran once in apply and has no chained invoker for new orphans (94 worklist rows
open, 746 orphan tokens across 120 items). An invoker that is a person is not an invoker.

## What lands

1. Read in full: `src/lib/agent/gate-a-scan.mjs` (`GATE_A_VERSION`), the maintenance.yml step that
   re-scans (find it; the audit names the step family), `scripts/verify/quarantine-disposition-audit.mjs`,
   `scripts/verify/run-data-audit-lane.mjs` and the CI job that runs it, `scripts/lib/deferral.mjs`,
   `scripts/maintenance/attach-found-sources.mjs`, `loop-manifest.mjs` (M9a named the consumer
   `.github/workflows/gate-a-rescan.yml` with `consumerPending`; you create that file).
2. `.github/workflows/gate-a-rescan.yml`, `name: Gate A rescan`: `workflow_run: workflows: ["Brief apply",
   "Population turn"], types: [completed]` on success, plus dispatch; it runs the existing re-scan step's
   script with scope "items whose `gate_a_version` differs from the constant", bounded (`--limit`, default
   500, ceiling 2,000 per run; the coordinator dispatches slices until the count is 0), writes a harness
   artifact in the `brief-apply` family or its own (read CONVENTION.md's rule on distinct shapes and say
   which you chose and why), and commits it. Exports the upstream run id. The maintenance.yml step stays
   as the manual form.
3. The quarantine-disposition verifier runs in the CI data-audit lane and FAILS the lane on any
   undispositioned past-bound item (RD-6 measured). Because 53 items are past bound today, the lane would be
   red on landing: the brief's answer is not an allowlist. The coordinator dispositions the 53 before this
   merges, using the write-time deferral guard (`assertValidDeferral`) with a real reason, owner and
   `deferred_until` per item class (the reasons are in the stage-audit s3 file and the W9 ledger: source
   silence, stubs, truncated captures, mistyped items, retype decisions pending the operator). You build the
   script that applies those deferrals from a reviewed JSON file (`scripts/maintenance/apply-deferrals.mjs`,
   dry then apply, one row per item with the reason, unit-tested on the pure validation), you do not run it.
4. `attach-found-sources` chained: the step runs in the `gate-a-rescan.yml` job after the re-scan, scope
   "orphan tokens on items touched by the upstream run", bounded, with its artifact; the standing 94 rows
   are the coordinator's dispatch.
5. Loop manifest: set `enforceEdge: true` and clear `consumerPending` on both gate-a hops; F50 green;
   quote the hops line before and after. Golden on the yml triggers. Runbook section "Gate A stays on one
   version"; session-log entry.

## Acceptance (section 0)

Reachable: the `workflow_run` edges and the CI lane line (quote). Run: the proof run yields a gate-a
artifact from `workflow_run`; the CI lane runs the verifier (red before the deferrals, green after).
Populated: `distinct(gate_a_version) = 1` after the coordinator's slices; undispositioned past-bound = 0.
Gated: F50, the CI lane, your tests. Documented: the runbook section.

## Stop conditions

The re-scan script cannot take a version-mismatch scope without a schema change; the data-audit lane has
no place to fail (say how it reports today); `assertValidDeferral` does not exist under that name (say what
does).
