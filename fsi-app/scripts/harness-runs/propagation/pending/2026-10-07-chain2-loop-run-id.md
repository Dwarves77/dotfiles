## Change

Lane CHAIN-2, 2026-10-07: scripts/turns/run-propagation-drain.mjs changed (a new --loop-run-id flag that wins over the on-disk loop run id resolver (propagation-drain.yml, which is not a governing file of this family, passes it)). Chain-fire-2 finding: the loop run id resolves from files on disk, and a CI checkout holds no upstream artifact, so chained rows recorded a null loop_run_id (ADR-031). The record shape is unchanged; only the value of config.loop_run_id is now filled on a chained firing.

## Planned run

No run is owed beyond the next propagation firing, which behaves as before and now records the upstream loop run id. Delete this file whenever the next propagation run lands.
