## Change

Lane CHAIN-1, 2026-10-07: .github/workflows/maintenance.yml (a maintenance governing file) changed. The sibling-branch "hydrate" step (it fetched maintenance-artifact/* branches nothing pushes any more, since artifacts land in harness_runs and are renumbered at land time) was deleted and the cleanup step reduced to removing the run-id claim markers. No step this workflow runs changed.

## Planned run

No run is owed beyond the next maintenance dispatch, which behaves as before. Delete this file whenever the next maintenance run lands.
