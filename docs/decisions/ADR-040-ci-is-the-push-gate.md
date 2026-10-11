---
id: ADR-040
title: CI is the push gate; pre-push no longer runs the heavy suite
status: accepted
date: 2026-10-03
scope: fsi-app/.discipline/hooks/pre-push
supersedes: RD-79 (local push gate runs what CI's Fitness job runs)
related: ADR-039
---

## Decision

Operator ruling, 2026-10-03, verbatim: "Remove the checks if they don't work and get this job done now."

Pre-push steps 3-4 (discipline + fitness suite, meta-gates, npm-dependent tests, goldens, tsc) are
skipped on every push. Steps 0-2c (trampoline, dependency link, untracked critical files, consistency
runner, memory gate, discipline rules in CI mode) still run. CI's required checks are the authoritative
gate. `DISCIPLINE_PREPUSH_FULL=1` opts a single push back into the full local run.

## Reasons

- Steps 3-4 cost 10-20 minutes per push on Windows; agent shells time out before they finish, so pushes
  looked failed when they had not completed.
- They did not predict CI: on 2026-10-03 they passed two commits that CI rejected (a prerender error,
  because the hook does not run `next build`; and F51 check 5, because the hook measures the fork point
  from the merge-base while CI measures it from the PR's first commit).
- Every check they run is already a required CI check, so nothing reaches master without passing it.

## Amendment 2026-10-11 (GATE-PUSH-1): a CI-triggering push runs the cheap final tier locally

Coordinator decision, amending the ruling above; the heavy steps stay off by default.

What changed since 2026-10-03: the repository is private and Actions minutes are metered (2,000 a month,
spending limit 0). On 2026-10-11 three lane PRs went red in CI on defects a local check finds in seconds: two
ESLint unused-variable warnings and an F45 duplicate-code violation (PR 1101), and rule 024 on commit subjects
(PR 1097). Each red costs a full PR run (about 25 runner-minutes) and an operator notification.

What runs on which push (pre-push step 0e decides, from the tip commit of each pushed ref):

- A push whose tip commit (subject and body) carries no skip token (`[skip ci]`, `[ci skip]`, `[no ci]`,
  `[skip actions]`, `[actions skip]`, or the `skip-checks: true` trailer) is a CI-triggering push and runs the
  FINAL TIER before leaving the machine: step 3d (ESLint, max-warnings 0, on the changed `*.js`, `*.jsx`,
  `*.mjs`, `*.cjs`, `*.ts`, `*.tsx` files under fsi-app of `origin/master...HEAD`, not the tree) and step 3e (the
  fitness runner, the command CI runs).
- A push whose tip carries a skip token (a WIP save-point) runs neither. A branch deletion or an empty push has
  no tip and runs neither. The docs-only fast path (step 0c) still skips both.
- Steps 3, 3b, 3c, 3f, 3g, 3h and 4 stay behind `DISCIPLINE_PREPUSH_FULL=1` exactly as ruled above; with that
  variable set, 3d lints the whole tree as before.

Measured 2026-10-11 on the operator machine: step 3d on a 3-file change 5 to 6 s; step 3e (fitness runner) 50 s.
Implementation: `fsi-app/.discipline/hooks/pre-push` (step 0e and the split guard) and
`fsi-app/.discipline/hooks/lib/final-push-tier.sh`; tests in `fsi-app/.discipline/hooks/pre-push-tmpdir.test.mjs`
(the real hook run in a throwaway repository, plus a real-ESLint attack with an unused variable).

## Second amendment 2026-10-11 (HOOK-1): the pre-push hook keeps three steps

Coordinator decision (wave 2 of the consolidation, ruled 2026-10-11), amending both paragraphs above. The hook
that gated pushes had grown to 29 steps; seven of them (3, 3b, 3c, 3f, 3g, 3h, 4) ran only behind an opt-in no
lane used, and the register of hook firings (register 2B) showed successes unlogged, so "when did this last
fire" had no answer. CI's static job runs every one of those checks on the PR; a copy in the hook was
duplication, not a second line of defence.

The hook now has exactly three steps, and everything else is DELETED from it (the consistency runner, the
discipline suite, the invariant-coverage and skill-gate meta-gates, the fitness runner, the npm-dependent suites,
the goldens, the closure and skill-contract gates, tsc, the docs-only classifier and the `DISCIPLINE_PREPUSH_FULL`
opt-in):

- A, on every push (a WIP save-point included): refuse the push when a tracked hook file differs from HEAD
  (formerly 0d: the hook that runs is the working-tree copy) or when an untracked file sits in a critical surface
  (formerly step 1: the migration-067 class).
- B, on a CI-triggering push (step 0e, unchanged: the tip commit carries no skip token): ESLint with
  max-warnings 0 over the files changed against origin/master, and the unit tests of the changed `*.test.mjs`
  files plus the `*.test.mjs` files at or below a changed module's directory that name it (a name match; the repo
  has no test importer map). The tests run through `run-explicit-tests.mjs` with the no-npm sandbox and the
  credential variables unset, the recipe of `run-test-suite.sh` narrowed to those files.
- C, on a CI-triggering push: the memory gate, the script CI runs.

A WIP push, a branch deletion and an empty push run only A. The fitness runner is no longer in the hook: a lane
runs it before its one final push (lane rule 17) and CI runs it again, so a live-tree violation is still found
before the PR but no longer re-found on every push. The hook now appends one line to `.hook-firings.log` for
every push it lets through (rule `pre-push:push`, verdict `pass`, evidence naming the tier and the steps that ran)
in addition to the failure lines it already wrote, so the last firing is always knowable.

Implementation: `fsi-app/.discipline/hooks/pre-push` and `fsi-app/.discipline/hooks/lib/final-push-tier.sh`
(`pre_push_changed_test_files`, `pre_push_run_changed_tests`); tests in `pre-push-step-attacks.test.mjs` (every
step attacked through the real hook, red-then-green per step, A attacked on a WIP push too),
`pre-push-tmpdir.test.mjs` (the hook source keeps no deleted step; the lib functions in a throwaway repository),
`pre-push-honest-forms.test.mjs` and `worktree-node-modules.test.mjs`.
