# 2026-10-10, lane CI-MIN-0 (cimin0-phase0-minutes): Phase 0 of the CI minutes plan

## Accomplished

1. **Step 1, rule 024** (`fsi-app/.discipline/rules/024-wip-commit-skips-ci.mjs`, whole-commit scope, invariant `RD-98-wip-commit-skips-ci`): a subject starting with `WIP ` must carry a skip token in the subject; a commit that is not a WIP commit must carry no skip token anywhere in its message (subject or body; the GitHub variants are covered). Registered in `manifest.mjs` (9 rules; the first message-form rule, the scope the manifest reserved), `runner.test.mjs` list assertion updated. Tests in `024-wip-commit-skips-ci.test.mjs`: fixture level, plus the real runner in commit-msg mode and CI mode over a pushed commit. Red-then-green: with `manifest.mjs` reverted to master the file ran 7 pass, 3 fail (registration, commit-msg, CI mode); with the manifest restored, 10 pass.
2. **Step 2, one run per PR**: all six `pull_request` workflows were already compliant, no workflow edited for this step: `bug-class-guard.yml`, `build-proof.yml`, `design-audit.yml`, `discipline.yml` (conditional cancel), `migration-proof.yml`, `rls-persona-matrix.yml` (bare true, pull_request only). New `fsi-app/.discipline/governance/workflow-pr-concurrency.test.mjs` (auto-discovered by the no-npm suite): per-PR group with the PR number, cancel-in-progress true for pull_request events, and a bare true refused on any workflow that also runs on push or dispatch. Attacks (fixtures): no block, group without the PR number, no cancel line, false, bare true with push, inline and scalar `on:` forms, commented block; a copy of `build-proof.yml` with the block removed fails.
3. **Step 3, master push runs less**: `bug-class-guard.yml` no longer triggers on push to master. `discipline.yml` already runs only `validate-commits` and `consistency-backstop` on a push (checked in the last run: the other three jobs skipped), left as is. Measured on the last three master pushes (runs 38102389721, 38101725547, 38098910247 and their bug-class twins): Discipline engine 21 s, 23 s, 17 s wall; Bug-class guard 41 s, 38 s, 34 s wall (each job bills a whole minute, so the removed trigger saves about 1 billed minute per master push); Live smoke on deployment_status 172 s, 161 s (kept). `build-proof.yml` still runs on a master push when `fsi-app/src/**`, `package.json`, `package-lock.json` or `next.config.*` change.
4. **Step 4, landed the plan**: `docs/plans/ci-minutes-plan-2026-10-10.md` (verbatim body, two-line header), its `docs/INDEX.md` line, and `docs/decisions/ADR-047-metered-ci-free-tier.md` (next free number on master was 047, not the 048 the brief named).

## Read and reused

Read: COMMON, the brief, the plan, `CLAUDE.md`, `manifest.mjs`, rule 023 and its test (template), `lib/context.mjs` (`commitSubject`, `commitMessage`), `invariant-coverage.mjs` (every rule needs an invariant; a new invariant's enforcer must name its id), `workflow-no-hydrate-guard.test.mjs` (template for a workflow text scan), the cost-control comments in `discipline.yml` and `bug-class-guard.yml`, `run-test-suite.sh` discovery. Reused: the existing commit-msg and CI runner path (no second mechanism), the `invariants.d` one-file registry, the auto-discovered `*.test.mjs` glob. The rule inventory is `manifest.mjs` plus the invariant file (there is no generated rule inventory to regenerate).

## Decisions

- Rule id 024 and invariant id RD-98 are the next free ids (RD-97 was last); no open pull request registers either.
- A WIP commit must carry the token in its subject (not only the body): the subject is the form of lane contract rule 15.
- The non-WIP direction scans the whole message, because GitHub honours the token in the body.

## NOT done

- [HYPOTHESIS] The repository squash setting is `COMMIT_MESSAGES` with title `COMMIT_OR_PR_TITLE` (read from the repository settings); the squash body therefore lists every PR commit subject, so a squashed WIP subject carries `[skip ci]` onto the master commit, which GitHub documents as skipping push-event workflows (discipline validate-commits, consistency backstop, build-proof) and may skip the Vercel build. Not observed yet (no master commit carries the token). Rule 024 cannot judge a commit GitHub creates. Needs a merge-path decision by the coordinator (for example the squash body the executor passes at merge). [WORK: owed]
- Vercel behaviour for the token is unconfirmed in `docs/runbooks/dispatch-discipline-protocol.md` ("skip-token residual"); the first merge of a PR with WIP commits settles it. [WORK: owed]
- Phase 1 (jobs run only when their inputs changed) and Phases 2 and 3 of the plan. [NOT-WORK: scoped to lane CI-MIN-1 and later by the brief]
- Plan step 4 (executor batches: one tokens/refresh PR per three merges). [NOT-WORK: executor practice, no repository file in this lane's write set]
