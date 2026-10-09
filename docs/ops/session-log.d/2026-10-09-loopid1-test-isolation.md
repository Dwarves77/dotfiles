# 2026-10-09 lane LOOPID-1 (loopid-1): loop-run-id fixture tests no longer read the repo's real harness ledger export

## Defect and cause (confirmed by running the tests on clean master 8aa9a2022 in the worktree)

- Since GATE-9 (PR 1042) every PR's "Discipline engine unit tests" job failed. Seven files import `loop-run-id.mjs` (or its resolvers); on master: `loop-run-id.test.mjs` 5 of 25 fail, and one fixture test each fails in `emit-brief-export-artifact.test.mjs`, `emit-corpus-turn-artifact.test.mjs`, `emit-downstream-chain-artifact.test.mjs`, `run-propagation-drain.test.mjs`. CI on the first push (PR 1051) found 2 more failures my importer grep missed, because the callers go through `resolveSweepLoopRunId` in `run-fetch-drain.mjs` and `run-ledger-consume.mjs` and their test files do not import loop-run-id: so 11 failures in 7 files in all. All the failures are the same shape: expected the fixture artifact's own `loop_run_id` (e.g. `explicit-loop-id-99`, `loop-x`), got null.
- Cause: `resolveLoopRunId` defaults its `ledger` argument to `readHarnessLedgerExport(DEFAULT_REPO_ROOT)`. PR 1041 (`1397fe51b`) committed `fsi-app/.discipline/governance/harness-ledger-export.json` (201 rows, 22 families). Since then the default is `present: true`, a temp-dir fixture artifact is a run the export has never heard of, and the module (correctly, per GATE-9's G-7 contract) refuses to trust its loop id. `resolveLoopRunIdFromUpstream` had no way to pass a ledger, so the six tests that go through it could not pin one at all.
- Which side is wrong: the tests. The module already matches the G-7 contract (artifact trusted only when the export holds family, run id and github run id; one clean explicit token; an explicit id loses only to a ledger-verified artifact). An explicit id that nothing in the ledger contradicts is NOT nulled (checked: `resolveLoopRunId` returns `cleanExplicit` on the unverified-artifact path). No module behaviour was changed.

## Accomplished

- `scripts/lib/loop-run-id.mjs`: `resolveLoopRunIdFromUpstream` accepts an optional `ledger` and passes it to `resolveLoopRunId` (the one dependency seam `resolveLoopRunId` already had, now reachable from the by-name resolver). Omitted, behaviour is unchanged (the real export is the default).
- `resolveSweepLoopRunId` in `scripts/turns/run-fetch-drain.mjs` and `scripts/turns/run-ledger-consume.mjs` take an optional `ledger` (passed to `resolveLoopRunId`), granted by the coordinator after the first CI run; their two test files inject `LEDGER_NONE` at 4 call sites each.
- Every fixture test that resolves a temp-dir artifact now injects `ledger: LEDGER_NONE` (the explicit "absent export" value, the file-path behaviour those fixtures exercise): 27 call sites in `loop-run-id.test.mjs`, 2 each in the three `emit-*-artifact` tests, 4 in `run-propagation-drain.test.mjs`. `LEDGER_NONE` is defined once per file near the imports. The G-7 tests that already injected `ledgerWith(...)` are untouched. The test of the DEFAULT ledger is deliberately left on the default; its title said "this checkout carries none yet", stale since #1041, and was corrected.
- Red then green: before, 5 of 25 + 1 + 1 + 1 + 1 failing across the five files; after, 318 of 318 pass across the 8 files that reference loop-run-id (loop-run-id 25, chain-handoff-wiring 56, run-artifact 106, upstream-artifact 37, emit-brief-export 10, emit-corpus-turn 18, emit-downstream-chain 16, run-propagation-drain 50), plus run-fetch-drain 27 and run-ledger-consume 151. Caller sweep (grep of the whole repo for every resolver name, callers not importers): the only other test callers are `resolveDrainLoopRunId` and `resolveHarnessRunContext` cases in run-propagation-drain.test.mjs and upstream-artifact.test.mjs, which pass under either ledger state (an explicit id, or null with nothing on disk). Every tracked scripts/**/*.test.mjs and *.npmtest.mjs file (268) run together: 5210 tests, 5208 pass, 0 fail.

## Why master push runs were green and PR runs red

The job is `if: github.event_name == 'pull_request'` (GATE-4's slim job set, `.github/workflows/discipline.yml`): master pushes never run "Discipline engine unit tests". Intended by GATE-4, not the same defect; nothing changed.

## Read and reused

`loop-run-id.mjs`, `run-artifact.mjs` `readHarnessLedgerExport`, the GATE-9 session log G-7 section, `discipline.yml` job definition. Reused the module's existing `ledger` seam and GATE-9's own `LEDGER_NONE` shape; built no fixture export.

## NOT done

- No run of the whole suite or the fitness runner (CI is the gate). The `ledger` seam on `resolveLoopRunIdFromUpstream` has its non-test importers already (every emitter calls it without a ledger).
