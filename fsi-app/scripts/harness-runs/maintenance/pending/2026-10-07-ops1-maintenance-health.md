## Change

Lane OPS-1 (2026-10-07) added a `REQUIRES_ARG` declaration and `fanoutSkipSummary` to `scripts/maintenance/lib/cli.mjs`
(a governing file). Under `maintenance.yml` `step=all` (env `RUN_STEP=all`) a step that declares it needs an input
(`attach-found-sources`, `reopen-validation-holds`) now exits 0 with a logged skip reason and `skipped: true` in its
summary.json instead of refusing. A named dispatch is unchanged. `maintenance.yml` itself is untouched.

## Planned run

The next dispatch of `maintenance.yml step=all mode=dry` supersedes this file. Delete it in the same change that lands that run.
