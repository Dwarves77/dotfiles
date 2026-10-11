# 2026-10-10, lane CI-MIN-0 (cimin0-phase0-minutes): Phase 0 of the CI minutes plan

## Accomplished

1. **Step 1, rule 024** (`fsi-app/.discipline/rules/024-wip-commit-skips-ci.mjs`, whole-commit scope, invariant RD-98): a subject starting with `WIP ` must carry a skip token in the subject; a commit that is not a WIP commit must carry no skip token anywhere in its message. Registered in `manifest.mjs`; tests in `024-wip-commit-skips-ci.test.mjs` (fixture level, real runner in commit-msg mode and CI mode).

## Read and reused

Read: COMMON, the brief, the plan, `CLAUDE.md`, `manifest.mjs`, rule 023 and its test (template), `lib/context.mjs` (ctx.commitSubject, commitMessage), `invariant-coverage.mjs`. Reused: the existing commit-msg/CI runner path (no second mechanism), the invariants.d one-file-per-entry registry.

## Decisions

- Rule id 024 and invariant id RD-98 are the next free ids on master (RD-97 was the last). No open pull request registers either.

## NOT done

- Steps 2 to 4 are in progress in this log's later revision. [WORK: owed]
