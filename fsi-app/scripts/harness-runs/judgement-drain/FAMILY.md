# judgement-drain family

Registered by lane G6-DRAIN, 2026-10-06 (build plan Stage 6, third bullet: "The scheduled drain session is
built with its kill switch, off").

Model judgement in this system runs as three steps: a workflow EXPORTS items, a Claude session WRITES a
committed batch file, the next workflow APPLIES it by rule. A workflow cannot start a session, so after build a
scheduled session is the runtime. This family records one run of that session. Everything is free: Sonnet and
Haiku sub-agents inside the session, never the metered API.

## What a run is

1. `scripts/drain/plan-drain.mjs` is STEP 0. It reads `system_state.judgement_drain` (migration 354), the
   emergency stop `global_processing_paused`, and an open `fleet-budget-halt` integrity flag. Any one halts the
   drain: it prints `drain: off` and exits 0 having read nothing else. A halted run writes no artifact.
2. When on, it reads each judgement queue through the existing exporter (kinds in `scripts/drain/kinds.mjs`),
   orders kinds oldest pending first, plans one batch file per kind, and takes a mutation lease on every item it
   hands out (migration 211).
3. `.claude/commands/drain.md` has sub-agents author each batch file against the kind's own schema and opens one
   PR per kind. The coordinator's executor merges after CI. The merge triggers the existing apply workflow
   (each carries a `push:` trigger on its own batch directory); `scripts/lib/chained-dry-guard.mjs` forces that
   run dry while `scrape_cadence` is off, so the guard, not the trigger, holds the population ruling.
4. `plan-drain.mjs --finish` releases the leases and writes this family's artifact, landed into `harness_runs`
   by `scripts/turns/deliver-artifact-branch.sh`.

## Standing metric

Per run: kinds planned, batches, items, leases held versus released, PRs opened, and the defects (an export that
failed, an item left out because another session held its lease, a lease that was not released). A proposer pass
reading the history sees whether the drain is finding work and finishing it, not only that it fired.

## State

The switch ships off and stays off until build is complete (CLAUDE.md rules 16 and the population ruling).
`pending/2026-10-06-g6-drain.md` records why this family starts at zero artifacts. The runbook step that turns
the drain on after build, and registers the scheduled task then, is
`docs/runbooks/maintenance.d/` (judgement-drain).
