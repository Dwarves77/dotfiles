# Harness-run artifact landing: how artifacts reach master today (2026-09-26)

OPERATOR RULING (2026-09-26, verbatim): "I've been building this for six months and not once
that I need a pull request from GitHub". The repo setting that lets GitHub Actions create/approve
PRs stays OFF, permanently, see the companion note `2026-09-26-operator-ruling-no-actions-prs.md`.
Any option below that would depend on an Actions job opening a PR is out of scope by that ruling.

## [CONFIRMED] Facts

- Repo Actions permissions: `can_approve_pull_request_reviews=false`, `default_workflow_permissions=read`.
- 12 workflows contain a "commit this run's harness artifact and open a PR" step, all routed through
  the one shared script `fsi-app/scripts/turns/deliver-artifact-branch.sh`
  (gate-a-rescan.yml, maintenance.yml, brief-export.yml, corpus-turn.yml, downstream-chain.yml,
  population-turn.yml, ledger-consume.yml, source-sweep.yml, fetch-drain.yml, propagation-drain.yml,
  change-detection.yml, brief-apply.yml).
- That script: pushes the artifact branch, tries `gh pr create`. On the known refusal
  ("GitHub Actions is not permitted to create or approve pull requests") it does NOT fail the run.
  It posts the branch + compare URL as a comment on a single tracked issue,
  `Runtime artifact branches awaiting a hand-opened PR` (currently **#520**, open; predecessor **#516**,
  closed), and finishes green with a `::warning::`.
- Issue #520 currently carries **86 comments** (one per run) plus its opening body, i.e. on the order
  of 87 runs have been recorded there since #516 was closed.
- **39 stranded artifact branches currently exist on origin**, by family:
  brief-export 14, ledger-consume 10, source-sweep 8, change-detection 5, gate-a-rescan 2.
  (mint / forward-events / maintenance-artifact / corpus-turn / downstream-chain / brief-apply /
  propagation-drain families show 0 currently live branches, either none pushed recently or all
  already landed/deleted.)
- The 11 harness families the walker (#810) found ON MASTER got there NOT through an
  Actions-opened PR (impossible under the permission setting) but through **ordinary PRs merged by
  the operator's own GitHub account**, `git log origin/master -- '**/*-run-*.json'` shows all 44
  matching commits authored `Dwarves77` (the operator), landed as normal squash-merged PRs
  (`#812`, `#750`, `#722`, `#684`, `#625`, train/wave batches, etc.), i.e. the operator (or a
  coordinator session working through the operator's account) opens the PR by hand off the pushed
  compare URL, exactly what issue #520 asks for, and merges it. This is a real, working, but fully
  manual path: nothing automated turns a stranded branch into a merged artifact.

## Read: ADR-023, ADR-028, ADR-031, harness-runs CONVENTION.md, runbooks

- `docs/decisions/ADR-023-producer-execution-model.md`, about the producer execution model
  (scheduling/cadence), not about how harness artifacts land; not directly on point for this question.
- `docs/decisions/ADR-028-record-grade-is-transit.md` and
  `docs/decisions/ADR-031-every-artifact-records-its-github-run-id.md`, both mention "harness artifact"
  in the context of artifact *shape/identity* (record-grade transit status, github_run_id stamping),
  not the delivery mechanism.
- `docs/runbooks/POPULATION-TURN-RUNBOOK.md` and `docs/runbooks/CORPUS-TURN-RUNBOOK.md`, both
  reference the PR-refusal fallback behavior (consistent with `deliver-artifact-branch.sh`'s own
  comments); no runbook proposes an alternative landing mechanism.
- No ADR or runbook currently documents a plan to replace the "stranded branch + tracking issue +
  hand-merged PR" path. This has been working-as-designed (deliberately non-failing), not previously
  flagged as a problem to fix, until the operator's ruling above makes "hand-merged PR" the
  permanent, only intended path unless something else is built.

## Options (none requires an Actions-created PR)

**Option A, Coordinator-run collector script.** A script (run manually, or by a coordinator/agent
session with its own git credentials, never inside the Actions job) that: fetches all stranded
family-prefixed branches from origin, cherry-picks/merges each artifact-only commit onto a local
branch off current master, and pushes+merges via `gh pr merge` or a direct `git push origin
HEAD:master` (still opened as a human/coordinator-authored PR, satisfying "no Actions PR"). This is the
same shape as what's already happening by hand (Dwarves77 merges), just batched and repeatable
instead of ad hoc, and closes stranded branches instead of leaving them for issue #520 to pile up.
- Files touched: new `fsi-app/scripts/turns/land-artifact-branches.mjs` (or `.sh`) run out-of-band;
  no workflow YAML changes.
- What the walker/F50 reads: unchanged, it already reads `scripts/harness-runs/**` on master, so
  once this script lands the branches there, nothing downstream needs to change.
- Cost: still a manual/coordinator trigger, but batches 39 branches into one operation instead of
  87 individual hand-merges.

**Option B, Artifacts land in the database, not a git-tracked directory.** Have
`write-run-artifact.mjs` (and the family-specific `emit-*-artifact.mjs` writers) write the harness-run
record into a Supabase table (e.g. `harness_runs`) via service-role INSERT from inside the Actions job,
in addition to or instead of the git-committed JSON file. The walker/F50 reads that table directly.
Actions already has DB write credentials for other runtime writes (guarded path), so this needs no PR
at all, the artifact is durable the moment the job runs, matching the "data changes are durable on
script execution, not on PR merge" doctrine already in `fsi-app/.claude/CLAUDE.md`.
- Files touched: one migration (new `harness_runs` table), `scripts/lib/run-artifact.mjs`
  (`writeRunArtifact`/`claimRunId`) gets a DB-write branch, each family's `emit-*-artifact.mjs`,
  and the walker (`docs`/`.discipline` script from #810) switches its read from
  `scripts/harness-runs/**/*.json` glob to a query against `harness_runs`.
  `deliver-artifact-branch.sh`'s commit/PR step becomes optional/removable per family once its reader
  is migrated.
- What the walker/F50 reads: a DB table instead of the git tree, a bigger change to the read side,
  but the cleanest fit with existing "facts live in Supabase" doctrine (standing rule 1 in the main
  CLAUDE.md, extended here from regulatory facts to harness-run records).
- Cost: real migration + writer + reader changes across ~12 workflows' emit scripts; not a quick patch,
  but removes the branch/PR/issue machinery entirely for every future run.

**Option C, Actions artifact only (built-in upload/download), landed by a separate scheduled or
coordinator-triggered job.** Keep `actions/upload-artifact@v4` (already present in every family
workflow as a belt-and-suspenders step) as the ONLY output of the Actions job, drop the
branch-push-and-PR-attempt step entirely. A separate process (a coordinator session, or a
`workflow_run`-triggered job that only downloads-and-commits, still never using `gh pr create`) pulls
the uploaded artifact and lands it via a human-authored PR or direct push, on its own cadence.
- Files touched: removes the "commit...and open a PR" step from all 12 workflows (workflow-file
  change, explicitly OUT OF SCOPE for this lane per the dispatch's "do NOT change workflows"
  instruction, so this option is a proposal for a future lane, not something this lane can start).
- What the walker/F50 reads: whatever the landing job commits, same shape as today's git-tracked
  JSON, just delivered on a lower-frequency batch instead of per-run.
- Cost: lowest code cost, but concentrates 90-day-retention risk (an unclaimed Actions artifact expires)
  and still needs a person/coordinator to run the download step regularly.

## Recommendation

**Option A now, Option B as the real fix.** Option A (a coordinator-run collector script) is a
same-day, zero-schema, zero-workflow-file change that clears the current 39-branch backlog and gives
future backlogs a repeatable one-command landing path, it doesn't touch workflows, matching this
lane's "do NOT change workflows" boundary. Option B is the structurally correct fix (matches the
"facts live in Supabase" / "data changes are durable on script execution" doctrine already in force,
and eliminates the branch/issue machinery for good) but is a real migration + multi-file dispatch,
not something to start inside this read-only/decision-ready lane. Option C is deferred: it requires
workflow-file edits this lane is barred from making, and trades a known problem (branch pileup) for a
different one (artifact-expiry risk) without clearly being better than A+B.

Suggested sequencing for a follow-up lane: ship Option A immediately to clear the backlog and stop
issue #520 from growing further; scope Option B as its own dispatch (schema + writer + reader changes)
once a coordinator session has bandwidth for a multi-file migration.
