## Change

Lane STATUTORY-WRITER (2026-09-28) edited `scripts/plan-quarantine-disposition.mjs` (a `quarantine-disposition`
governing file) to extract its `nextRunNumberFromHarnessRuns`/`buildHarnessRunsClient` helpers into a
shared module, `scripts/lib/harness-run-number.mjs` (F45 duplicate-code fix, dedup with
`write-statutory.mjs`'s identical new need). Behavior is unchanged: same logic, same call sites, both
proven by `plan-quarantine-disposition.test.mjs`'s existing 15 tests (all still pass unmodified) plus this
lane's own `write-statutory.test.mjs` coverage of the shared module's callers.

## Planned run

No new `quarantine-disposition` run is dispatched by this lane (this is a mechanical, behavior-preserving
extraction, not a change to what the planner decides). `quarantine-disposition-run-001.json`
(landed by lane QUARANTINE-DISPOSITION, 2026-09-28) already covers this family's harness_version at its
pre-refactor hash; the next real dispatch of `plan-quarantine-disposition.mjs` lands the run that
supersedes this file.
