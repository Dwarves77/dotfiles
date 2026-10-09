# Lane CHAIN-2 (chain2-loop-run-id), 2026-10-07

Brief: CHAIN-1 (PR 968) gave Population turn and Downstream chain the upstream row's loop run id. Seven more emitters still resolved it from files on disk, which a CI checkout does not hold (artifacts land only in `harness_runs`), so chained rows recorded a null `loop_run_id` (ADR-031). This lane gives each the same explicit id.

## Accomplished (each confirmed by a test run in this worktree)

- Seven workflows gain one step, "Read the upstream loop run id (ADR-031, chained firings only)": it calls `scripts/lib/upstream-artifact.mjs read`, takes `CHAIN_UPSTREAM_LOOP_RUN_ID` and exports it to `GITHUB_ENV` under the variable its emitter reads. A failed read is a `::warning::` and a null id, never a red run.
  - corpus-turn.yml -> `CT_LOOP_RUN_ID` -> `emit-corpus-turn-artifact.mjs`
  - ledger-consume.yml -> `LEDGER_CONSUME_LOOP_RUN_ID` -> `run-ledger-consume.mjs` (new exported `resolveSweepLoopRunId`)
  - fetch-drain.yml -> `FETCH_DRAIN_LOOP_RUN_ID` -> `run-fetch-drain.mjs` (new exported `resolveSweepLoopRunId`)
  - brief-export.yml -> `BE_LOOP_RUN_ID` -> `emit-brief-export-artifact.mjs`
  - gate-a-rescan.yml -> `GAR_LOOP_RUN_ID` -> `emit-gate-a-rescan-artifact.mjs`
  - source-resolution.yml -> `SR_LOOP_RUN_ID` -> `emit-source-resolution-artifact.mjs`
  - propagation-drain.yml -> `RUN_UPSTREAM_LOOP_RUN_ID` -> new `--loop-run-id` flag on `run-propagation-drain.mjs` (new exported `resolveDrainLoopRunId`), and the NO-OP row (`upstream-artifact.mjs noop --loop-run-id`) carries it too.
- Found while reading: gate-a-rescan.yml already exported `GAR_LOOP_RUN_ID` (the dispatch input `loop_run_id`, documented as winning over any upstream resolution) but `emit-gate-a-rescan-artifact.mjs` never read it. That dispatch input is now honoured.
- Four emitters (corpus-turn, brief-export, gate-a-rescan; source-resolution already had it) now export `emit({ env, familyDir, fsiRoot })` in the shape `emit-source-resolution-artifact.mjs` already had, so the emission path is testable without writing into the repo; the CLI behaviour is unchanged.
- A root run (no upstream: a dispatch, or an upstream with no family such as Data producers) takes no explicit id and resolves exactly as before.

## Tests

- Per emitter: explicit id beats a null disk resolve; no explicit id and nothing on disk is null. Files: the four `emit-*-artifact.test.mjs`, `run-ledger-consume.test.mjs`, `run-fetch-drain.test.mjs`, `run-propagation-drain.test.mjs` (also `--loop-run-id` parsing).
- `scripts/lib/chain-handoff-wiring.test.mjs` extended (not copied): per workflow the step exists, is gated on a chained firing, calls the one reader, exports the right variable, runs before the emitter, and the consumer source takes it as its explicit id; the step's own script is EXECUTED under bash with a stub `node` (id exported, empty id exported, failed read exports nothing and warns without failing).
- Red against the old code: source-resolution's `emit` test failed with `actual: null, expected: 'explicit-loop-id-7'` before the one-line change; the other emitters had no `emit` export, so their new tests could not load against the old code.

## Read and reused

COMMON.md, the brief, lane-common-contract.md, the CHAIN-1 log (owed section), `upstream-artifact.mjs` (reused: the reader prints `CHAIN_UPSTREAM_LOOP_RUN_ID`), `loop-run-id.mjs` (reused: `resolveHarnessRunContext`, `resolveLoopRunId`, `resolveLoopRunIdFromUpstream`, the explicit-wins contract), the seven workflows around the touched steps, the emitters in full, `emit-downstream-chain-artifact.mjs` (the CHAIN-1 pattern), `chain-handoff-wiring.test.mjs`. `run-ledger-consume.mjs` (about 1800 lines) and `run-propagation-drain.mjs` were read around the touched regions (header, parseArgs, the artifact config), not line by line.

## Decisions

- Coordinator ruling on PR 971: the stand-in `--consumer downstream-chain` was not acceptable. Write-set expansion granted for `upstream-artifact.mjs` and its test: new `loop-id` subcommand (`--upstream-name`, `--upstream-run-id`) prints `CHAIN_UPSTREAM_LOOP_RUN_ID=` and nothing else, no consumer, no run mode, no gate; same read, retries and exit codes as `read`. The seven read steps call it; the population-turn and downstream-chain `read` calls are unchanged. Tests: loop-id ignores the gate (a no-op or plan upstream still yields its id), empty id on no row or no id, same exit codes on read error and missing credentials, `read` still requires a consumer; the wiring test asserts every step uses `loop-id` and names no consumer.
- Ledger consume and Fetch drain read the Source sweep row (family `source-sweep`, in `FAMILY_BY_WORKFLOW_NAME`).

## NOT done / open

- Not proven live: nothing here ran in GitHub Actions or against the database (common terms rule 5). [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
- Corpus turn has no F28 marker: `corpus-turn.yml` is not in `GOVERNING_FILES` and the emitter is not either (confirmed by intersecting `governing-files.mjs` with the diff). Markers added: brief-export, gate-a-rescan, source-resolution, propagation, ledger-consume, fetch-drain. [NOT-WORK: fact, no action]

## Post-merge dry proof (the coordinator's executor)

Re-fire the sweep cascade dry (`gh workflow run source-sweep.yml -f walker=register-federal-register -f from=2026-10-01 -f to=2026-10-06 -f mode=dry`), wait for it to settle, then read:

```sql
select harness_family, run_id, trigger, github_run_id, upstream_run_id, config->>'loop_run_id' as loop_run_id
from harness_runs
where started_at > now() - interval '1 hour'
order by started_at;
```

Expect every chained row (ledger-consume, fetch-drain, mint, corpus-turn, brief-export, gate-a-rescan, source-resolution, downstream-chain, propagation) to carry the same `loop_run_id` as the source-sweep root row. A row with an empty id means its read step logged the `::warning::` line; read that step's log.
