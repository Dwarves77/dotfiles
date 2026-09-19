# Lane M3: the turns chained and proven (plan section 6.1, row M3)

Read `brief-m-common.md` first. Worktree and branch: named in your dispatch message (cut from master AFTER
lanes M1 and M2 have merged; you build on their workflow shapes). Lane id `m3`.

## Why

`docs/audits/stage-audit-2026-09-18/s2-mint-gate.md` rows 3, 4, 6 and 10: `corpus-turn.yml` has no upstream
`workflow_run` (dispatch or a push to `turn/` only); `population-turn.yml` is wired after "Ledger consume"
but gated by `POPULATION_PAUSED`; `downstream-chain.yml` (2026-09-06) fires after both turns and has never
fired for real, with no harness family; and `apply-mint-batch.mjs`, the batch mint path, skips the rule-16
enrichment (discovery, forward events) that the single-item chokepoint `mint-item.ts` runs inline. Nobody has
ever proven mint to drain with one real run. This lane closes the wiring; the coordinator runs the proof.

## What lands

1. Read in full: `corpus-turn.yml`, `population-turn.yml`, `downstream-chain.yml`, `ledger-consume.yml` as
   M2 left it (the plan-then-apply job, `--max-promote`), `scripts/turns/run-population-flywheel.mjs`,
   `scripts/mint/apply-mint-batch.mjs`, `src/lib/intake/mint-item.ts` (the enrichment block near lines
   307 to 377 per the audit), `scripts/harness-runs/CONVENTION.md` (M9a's loop manifest section, M1's and
   M9b's family sections), `.discipline/governance/loop-manifest.mjs`.
2. `corpus-turn.yml` gains `workflow_run: workflows: ["Ledger consume"], types: [completed]`, running only
   when the upstream conclusion is success AND `corpus_turn_requests` holds unconsumed tickets (a first step
   that counts them with the existing consumer script's own selection, and skips the rest of the job when
   zero, with the reason in the step summary). Dispatch and the `turn/` push trigger stay. A step exports
   `GITHUB_EVENT_WORKFLOW_RUN_ID`.
3. `population-turn.yml`: the pause becomes a cap, not a flag. Read how `POPULATION_PAUSED` gates the job
   today and replace it with a `max_items` input (default 25, ceiling 100, enforced in the runner) that the
   `workflow_run` path uses; `POPULATION_PAUSED` and every read of it are deleted. In the same two files you
   own here (`population-turn.yml` and `docs/runbooks/POPULATION-TURN-RUNBOOK.md`) also remove every mention of
   `LEDGER_CONSUME_APPLY_ENABLED`: lane M2 retired that constant on 2026-09-18 (the promote cap and the
   committed verdict batches are the guards now) and flagged these stale comments and diagnostic strings as
   out of its scope. Reword them to say what arms the apply today; `git grep LEDGER_CONSUME_APPLY_ENABLED`
   must return nothing on your tree outside `docs/ops/session-log.md` and `docs/audits/` (history stays). The mint runner records
   `config.max_items`, `config.upstream_run_id` and the `loop_run_id` it receives from the sweep artifact
   chain (read it from the upstream ledger-consume artifact's `config.loop_run_id`, which M1 and M2
   propagate; if M2's artifact does not carry it, STOP and say so).
4. The batch mint path runs the same enrichment as the single path: extract the enrichment block of
   `mint-item.ts` into one shared function (one home; `mint-item.ts` calls it unchanged in behaviour) and
   call it from `apply-mint-batch.mjs` per minted item, non-fatal per item with `recordFlywheelDefect` on
   failure exactly as the single path does. Unit test with a fake client: the batch path calls the shared
   enrichment once per minted item; the single path's existing tests unchanged and green. F13 (single mint
   chokepoint) stays green (the batch path still writes through the one write site; confirm and quote).
5. Harness family `downstream-chain`: registered (writer `ALLOWED_FAMILIES`, `governing-files.mjs`,
   CONVENTION.md section, PENDING-RUN marker); `downstream-chain.yml` writes and commits
   `downstream-chain-run-NNN.json` (config: the upstream workflow and run id, the steps run; outcome: per-step
   counts from each step's own summary) the way the other families commit theirs.
6. Loop manifest flips: in `loop-manifest.mjs` set `enforceEdge: true` for `ledger-consume-to-corpus-turn`,
   `population-turn-to-downstream-chain` and `corpus-turn-to-downstream-chain` (the edges now exist) and
   clear `familyPending` on the downstream-chain hops; leave every `enforceFired` false (the coordinator
   flips those after the proof run). F50 must be green on your tree; quote its "hops not yet enforced" line
   before and after.
7. Golden (attack form): a test reads the three ymls and fails if any of the `workflow_run` edges above is
   missing or names the wrong upstream. Runbook section "The turns, chained" in the corpus-turn runbook;
   session-log entry.

## Acceptance (section 0)

Reachable: the three `workflow_run` edges (quote). Run: the coordinator's proof run (one sweep dispatch
must produce `mint-run-030` and `downstream-chain-run-001` with `trigger: workflow_run`). Populated: new
items at record grade with obligations, tags and tier-opinion rows keyed to the run. Gated: F13, F50, your
golden and unit tests. Documented: the runbook section.

## Stop conditions (report, do not solve)

M2's artifact does not carry `loop_run_id`; `POPULATION_PAUSED` is read by something outside the two files
named (say where); the enrichment block cannot be extracted without changing behaviour (say why).

## Amendment 1 (coordinator, 2026-09-19, post 6.8; read after brief-m-common.md Amendment 1). Where it disagrees with the text above, this wins.

A. Worktree `C:/Users/jason/dotfiles/.worktrees/wt-l34-detail-admin-primitives`; first command, from its root: `git fetch origin master && git switch -c lane/m3-turns-chained-2026-09-19 origin/master`. If the tree is not clean before that, STOP. Shared ids assigned to M3: NONE. If you need one, STOP.

B. [REFUTED premise, corrected here] Item 3 says M1 and M2 propagate `loop_run_id`. They do not: on master only `.github/workflows/source-sweep.yml` and `fsi-app/scripts/turns/run-source-sweep.mjs` carry it [CONFIRMED by grep from the repo root, 2026-09-19]. That stop condition is withdrawn and replaced by this work item, done FIRST:
   1. Read how `run-source-sweep.mjs` receives `loop_run_id` and where it records it in its artifact (`config.loop_run_id`), and which artifact field records the GitHub run id of the run that wrote it.
   2. One home: `fsi-app/scripts/lib/loop-run-id.mjs`, exporting one pure function `resolveLoopRunId({ explicit, upstreamFamily, upstreamRunId, harnessRunsDir })`: `explicit` (a `--loop-run-id` argument) wins; otherwise it returns `config.loop_run_id` of the `upstreamFamily` artifact whose recorded GitHub run id equals `upstreamRunId`; otherwise null. It never invents an id. Unit tests: explicit wins; match found; no match gives null; an artifact without the field gives null.
   3. Every runner downstream of the sweep records `config.loop_run_id` through that function and nothing else: `run-fetch-drain.mjs` (upstream family source-sweep), `run-ledger-consume.mjs` (upstream fetch-drain), the corpus-turn and population-turn mint runner (upstream ledger-consume), and the downstream-chain artifact writer (upstream: the turn that fired it). Each of their workflows passes the upstream run id it already exports; add `--loop-run-id` to each `workflow_dispatch` as an optional input. If a runner's upstream artifact is not committed before the downstream workflow starts (so the file cannot be read at that moment), STOP and say which hop and why.
   4. Attack test (rule 15): a fixture chain of four artifacts with one id resolves hop to hop; break one hop's run id and the next resolves null.
   5. This changes governing files of fetch-drain and ledger-consume (and mint, if the mint runner is one): add the pending file named in the common Amendment for EACH such family, `pending/<date>-m3.md`.

C. Item 1: the family sections of CONVENTION.md now live in `fsi-app/scripts/harness-runs/<family>/FAMILY.md`; read those for fetch-drain, ledger-consume and mint instead.

D. Item 3, the `LEDGER_CONSUME_APPLY_ENABLED` check: scoped to the two files you own there (`population-turn.yml`, `docs/runbooks/POPULATION-TURN-RUNBOOK.md`); `git grep` on those two must return nothing. Retirement records elsewhere (M2's runner header, `portal-harvest.ts`, `ledger-consume/pending/`, session logs, audits) stay untouched.

E. Item 5 is replaced: register `downstream-chain` BY DESCRIPTOR ONLY: `fsi-app/scripts/harness-runs/downstream-chain/family.json`, `FAMILY.md`, and `pending/<date>-m3.md` (no artifact exists yet, so the tree-state rule needs the pending file). No edit to `ALLOWED_FAMILIES`, `governing-files.mjs`, CONVENTION.md or any marker. The yml still writes and commits `downstream-chain-run-NNN.json` as item 5 says, with `config.loop_run_id` per B.

F. Item 7: the session-log entry is your own file (common Amendment). Acceptance adds: every hop's runner records `config.loop_run_id` (quote the line in each).
