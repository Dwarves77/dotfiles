---
id: ADR-047
title: Metered CI on a private repository stays inside the free tier
status: accepted
date: 2026-10-10
scope: .github/workflows/**, fsi-app/.discipline/rules/024-wip-commit-skips-ci.mjs, lane commit conventions
supersedes: none
related: ADR-040, ADR-046
---

# ADR-047: Metered CI on a private repository stays inside the free tier

Related: [ADR-040](./ADR-040-ci-is-the-push-gate.md) (CI is the gate),
[ADR-046](./ADR-046-gate-doctrine.md) (gate doctrine),
[ci-minutes-plan-2026-10-10](../plans/ci-minutes-plan-2026-10-10.md) (the plan this records).

## Decision

1. The repository became private on 2026-10-10, so GitHub Actions minutes are metered: 2,000 per month included,
   spending limit 0 (CI stops, it never bills). Operator ruling: "I can not afford this". A self-hosted runner is
   rejected. CI stays on GitHub and costs nothing.
2. Save-point commits are `WIP <lane>: <step> [skip ci]`; only the final push of a pull request runs CI. Rule 024
   (invariant RD-98) enforces both directions: a `WIP ` subject carries the token, and no other commit does.
3. One run per pull request: every `pull_request` workflow groups by PR number with cancel-in-progress for
   pull_request events, never for a master validation. Asserted by `workflow-pr-concurrency.test.mjs`.
4. A push to master runs only what the pull request could not (the bug-class guard no longer triggers on push).
5. Phase 1: each job runs only when its inputs changed, derived from the governing-file manifests (lane CI-MIN-1).
6. Production budget: at most 500 runner-minutes per month, measured from the harness ledger before go-live.

## Consequences

[HYPOTHESIS] (GitHub documents that a skip token anywhere in a pushed head commit message skips push-event workflows; not yet observed on this repo, no master commit carries the token as of 2026-10-10). The repository squash setting is COMMIT_MESSAGES, so the squash body lists every commit subject, so a squashed WIP subject can carry the skip token
onto master and suppress the push-event workflows and a Vercel build for that merge. Rule 024 cannot reach a commit
GitHub creates; the merge path owns that (recorded on the lane pull request).
