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
