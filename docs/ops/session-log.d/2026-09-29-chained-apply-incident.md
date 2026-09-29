# Incident 2026-09-29: a chained workflow run applied live writes in build mode (R14 violated)

Status of every finding here: [CONFIRMED] by the GitHub run logs and SELECT queries named below.

## What happened

- 12:26 UTC: lane LOOP-B-FIRING dispatched `Source sweep` (run 36568148099) in dry mode as the top of the
  chain, to prove that `downstream-chain` explicitly dispatches `propagation-drain` (PR #825). The
  coordinator's brief asked for exactly this and did not check what chained firings do with mode.
- Chained `workflow_run` firings do not inherit the upstream's mode. `ledger-consume` runs a plan pass then a
  chained APPLY pass (capped at max_promote=50); `population-turn`, `corpus-turn`, `downstream-chain` and
  `propagation-drain` all set `RUN_MODE=apply` on `workflow_run` (their own headers say so).
- 12:31: `Ledger consume` 36568656803 fired chained. 12:37:38 to 12:42:30 its apply pass wrote, before the
  coordinator cancelled it: 33 `intelligence_items` (all `provenance_status=quarantined`), 33
  `staged_updates`, 51 `integrity_flags`; 4 `agent_runs` at 12:32 from the plan pass. Customer surfaces read
  only `verified` items, so nothing reached the site.
- 12:42-12:43: `Population turn` 36569931097 fired and completed at its chaining gate (no mint step ran);
  `Corpus turn` skipped; `Downstream chain` 36569940794 and 36569976841, `Gate A rescan` 36569976988 and
  `Brief export` 36569976887 were cancelled before any write step. Chain fully stopped by 12:45.

## Operator ruling (2026-09-29, verbatim)

"If it made items it shouldn't get rid of them." Lane REVERSE-CHAINED-APPLY identifies the exact write set
and the guarded reversal statements; the coordinator approves them before execution.

## System edits (rule 13: every failure becomes an edit)

1. **Chained runs are dry in build mode.** Rule 16 says every runtime runs by explicit dispatch in build
   mode; a `workflow_run` firing is not an explicit dispatch. A shared gate forces `RUN_MODE=dry` on every
   `workflow_run`-triggered workflow while `system_state.scrape_cadence='off'`, and F52/F60 fail any chained
   workflow that can reach an apply path without it. Lane: `lane/chained-dry-guard`.
2. **No lane dispatches a workflow that sits in a chain** until that guard is merged; after it, a chain proof
   is dispatched only with the guard's forced-dry record visible in `harness_runs`.
3. Coordinator briefs that ask for a dispatch must name the mode every downstream will run in, read from the
   workflow files, before the dispatch.

Related: [wave plan](../../plans/wave-plan-2026-09-28.md), [2026-09-28 close](./2026-09-28-coordinator-close.md).
