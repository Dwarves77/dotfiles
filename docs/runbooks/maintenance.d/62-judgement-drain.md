## 62. `judgement-drain`

**New this runbook, lane G6-DRAIN, 2026-10-06 (build plan Stage 6, third bullet).** Not a `maintenance.yml` step:
it is a repo command, `.claude/commands/drain.md`, that a scheduled Claude session runs, plus the planner
`fsi-app/scripts/drain/plan-drain.mjs` and the family `scripts/harness-runs/judgement-drain/`. The drain ships
**OFF** and nothing schedules it.

**Purpose**: model judgement in this system is an export, a session-authored committed batch file, and an apply
by rule. A workflow cannot start a session, so after build a scheduled session is the runtime. One drain run
reads each judgement queue through its existing exporter, has Sonnet or Haiku sub-agents author one batch file
per kind, and opens one PR per kind. No metered model call, no operator review step.

**The five kinds** (one registry, `fsi-app/scripts/drain/kinds.mjs`): ledger verdicts (apply workflow
`ledger-consume.yml`), host verdicts (`source-resolution.yml`), question answers (`question-answers.yml`), theme
briefs (`theme-briefs.yml`), record briefs (`brief-apply.yml`). Corpus-turn extraction is not a kind: forward-event
extraction is a deterministic parser with no session-authored batch.

**Logic**:
1. STEP 0, the kill switch. `plan-drain.mjs` reads `system_state.judgement_drain` (migration 354), the emergency
   stop `global_processing_paused`, and an open `fleet-budget-halt` integrity flag (the query in
   `docs/runbooks/fleet-budget-control.md`, until now a charter convention with no code reader). Any one halts
   the drain: it prints `drain: off` and exits 0 having read nothing else. A failed read counts as a halt.
2. When on, it exports each queue with the existing exporter, ranks kinds oldest pending first (kinds whose
   items carry no timestamp follow in the registry's fixed order), plans one batch file per kind (rule 11: one
   large batch, not many small), and takes a mutation lease (migration 211) on each item it hands out. An item
   another session holds is left out and named; it never blocks the rest.
3. `.claude/commands/drain.md` authors each batch against the kind's own README schema, validates it with the
   kind's own validator, and opens one PR per kind. **Merge is by the coordinator's executor after CI**, like any
   other lane. The drain merges nothing.
4. The merge is a push to master touching the kind's batch directory. Each apply workflow carries a `push:`
   trigger on exactly that directory and finds the file with `scripts/drain/resolve-push-batch.mjs` (one file per
   merge). Its mode is resolved by `scripts/lib/chained-dry-guard.mjs --ref`, which treats a push to master as
   machine-triggered: **forced dry while `scrape_cadence='off'`, apply only after build.** The guard, not the
   trigger, holds the population ruling. Fitness F61 fails a batch-path push workflow that does not pass `--ref`.
5. `plan-drain.mjs --finish` releases the leases and writes the family artifact (switch state, kinds, counts,
   leases held and released, PRs). The session lands it with `scripts/turns/deliver-artifact-branch.sh`.

**Turning it on, after build is complete (never before: CLAUDE.md rule 16 and the population ruling).** Three
independent layers must all allow it, and each is its own act:
1. The cadence: `scrape_cadence` is set by the operator when they set a scrape time. While it is `off`, merged
   batches are validated and planned, never applied.
2. The drain switch: `select public.admin_set_judgement_drain('operator', 'on');` through the coordinator's DB
   executor, or `POST /api/admin/sources/pause-global` with `{"judgement_drain":"on"}` as an admin. The only
   writer is that RPC; the guard `guard_judgement_drain_writer` bounces any other write and every change is
   audited in `system_state_flag_audit`. Read it back with `select judgement_drain from system_state`.
3. The scheduled task: register ONE task that runs `/drain` at a cadence the operator picks (rule 11: the fewest
   firings that keep the queues moving; every firing pays a fixed startup cost). Register it only after layers 1
   and 2, and pause it with the switch, not by deleting it.

**Turning it off**: `select public.admin_set_judgement_drain('operator', 'off');`, or open the halt row
(`fleet-budget-halt`, see `fleet-budget-control.md`), or set `global_processing_paused`. Any one stops the next
firing at STEP 0 with one line and no reads. Leases a stopped run still held go stale in 3 hours and are
claimable.

**Evidence of a run**: `scripts/harness-runs/judgement-drain/judgement-drain-run-NNN.json` (landed in
`harness_runs`), and the PRs it opened. A run that stops at STEP 0 leaves no artifact by design.

**Known limits**: a record-briefs PR is only as complete as the brief-export queue (`read-brief-export-queue.mjs
--list`); the ledger export fetches page text and needs network egress in the session, and a failed export is
recorded as residue for that kind, never retried or invented. A batch merged while the cadence is `off` is not
applied; once the cadence is set, the next merge applies it, and an earlier merged batch applies only through its
own apply workflow's next firing (a dispatch, or the next batch for an auto-discovering workflow).

Related: [fleet budget control](../fleet-budget-control.md), [question-answers](60-question-answers.md),
[source-resolution](61-source-resolution.md).
