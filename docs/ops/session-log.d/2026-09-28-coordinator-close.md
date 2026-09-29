# Coordinator close, 2026-09-25 to 2026-09-28

Resume here, then [the wave plan](../../plans/wave-plan-2026-09-28.md). Earlier state:
[2026-09-25 close](./2026-09-25-coordinator-close.md), [build plan](../../plans/build-plan-2026-09-25.md),
[tool-gap register](../../plans/data-machine-tool-gaps-2026-09-25.md).

## Operator rulings this session (verbatim where quoted)

- **ADR-035**: one aggregate anonymity floor, >=10 organisations and no contributor >25%, for every aggregate.
- **M5 conflict**: RESOLVED KEEP (coordinator, #804): no market producer served the retired rate board.
- **R14 (2026-09-25)**: "we are NOT updating the data on the site, we are building the tools that manage that data first, that must be complete before we do anything else" and "we are building the sytems that manages the collection and anylsis and production of data for the site, that is the most important thing to do right now".
- **state_cost_facts**: build the producer (done, #811/#817; migrations 332/333 applied).
- **#800 artboards**: "Art board is ok" (merged).
- **Test what you build** (2026-09-26): "You HAVE to test what you're building." Every tool gets a real run (dry/fixture under R14) before it counts as done.
- **No Actions PRs** (2026-09-26): "I've been building this for six months and not once that I need a pull request from GitHub". Run records land in Supabase `harness_runs` (#813).
- **Do not reinvent** (2026-09-26): "we have set up standards for the whole app already. Yes supabase but do not reinvent processes, look at what has already been built". Coordinator decides what the standards answer; asks only operator-only rulings.
- **Stop pushing** (2026-09-28): "STOP pushing them until you fix the issues, find the issues, do not guess, read ALL of the code". Lifts when the CI-parity fix is proven (operator: "If it's fixed then you can proceed").
- **Pace** (2026-09-28): the one-to-two-lane rhythm is too slow; "At this current rate we will not have this build finished for months and that's unacceptable". Next session runs waves of 6-8 disjoint lanes.

## Accomplished (merged to master)

#802 close, #803 Supabase audit register, #804 ADR-035 + test race fix, #805 derivation_edges RLS (mig 330, live attack 8/8 denied), #806 R14, #807 tool-gap register, #808 hop-01 + ledger correction, #809 dead-column + duplicate-table checkers, #810 UI-orphan checker + harness-family walker (GitHub run history as evidence), #811/#817/#818 state_cost_facts producer + DAG authorship (dry only, zero rows), #812 Gate A rescan fixed and proven (pagination key, pipefail across workflows, false-success artifact), #800 look pass, #813 harness_runs (mig 331, run records in Supabase, 22 stranded records imported), #814 rule-022 PR/push blind spot, #815 worktree node_modules (other session), #816 clock-pinned test, #819 quarantine disposition planner (proven via dispatch, run-004), #820 RW-3 corrected [REFUTED].

## In flight at close (local commits only, push hold)

| Lane | Worktree / branch | State |
|---|---|---|
| CI-parity | `.claude/worktrees/ci-parity`, `lane/ci-parity` | Replaying the 7 failed quarantine-branch CI runs locally; fix makes pre-push reproduce CI. Gate for lifting the push hold |
| Maintenance harness | `lane/maintenance-harness` (7a330c1c) | Maintenance family onto harness_runs, readAll orderBy class fix; local suite 1801/1801; not pushed |
| Structured actions | `lane/structured-actions` | Workstream 6, running |
| ETS-proxy | `lane/ets-proxy` | Workstream 11, running |
| Statutory writer | `lane/statutory-writer` | running |
| Audit triage | `lane/audit-triage` | read-only dispositions for 26 dead columns, 7 UI-orphan fields, duplicate candidates |
| Loop B firing | `lane/loop-b-firing` | why decision propagation never fires from upstream; wire the chained trigger |

Next session: check each branch (`git -C .claude/worktrees/<lane> log origin/master..HEAD`), collect reports, and once CI-parity is proven push each ONCE.

## Failures this session and the system edits they became

- Lanes passing local pre-push then failing CI 6x on one branch: CI-parity lane (above).
- A tool built and never fired (Gate A rescan, 5 days): memory test-what-you-build; every brief requires a real run.
- Three-deep nested agents on one task: memory no-nested-agents; every brief says "do the work yourself; do not use the Agent tool".
- Coordinator asked the operator a question the standards answered: memory dont-ask-what-standards-answer.
- Hand-made node_modules junctions could wipe the shared install on worktree removal: fixed class-wide in #815.
- A lane rewrote a whole register instead of editing three lines; a lane inserted its own harness row by hand: caught at coordinator review; briefs now require diff-checks and tool-written proof.

## Blockers / open for the operator

- Main checkout vault sync skips while `.claude/settings.local.json` has local edits.
- Proof run 6.2 and 6.3 data stay held by R14 until the tools are complete; lifting R14 is the operator's call.
