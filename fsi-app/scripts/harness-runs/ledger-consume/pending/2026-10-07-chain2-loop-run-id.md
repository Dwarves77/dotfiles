## Change

Lane CHAIN-2, 2026-10-07: scripts/turns/run-ledger-consume.mjs changed (the artifact config.loop_run_id now takes LEDGER_CONSUME_LOOP_RUN_ID as the explicit id (ledger-consume.yml, not a governing file of this family, exports it)). Chain-fire-2 finding: the loop run id resolves from files on disk, and a CI checkout holds no upstream artifact, so chained rows recorded a null loop_run_id (ADR-031). The record shape is unchanged; only the value of config.loop_run_id is now filled on a chained firing.

## Planned run

No run is owed beyond the next ledger-consume firing, which behaves as before and now records the upstream loop run id. Delete this file whenever the next ledger-consume run lands.
