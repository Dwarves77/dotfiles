## Change

Lane CHAIN-2, 2026-10-07: .github/workflows/gate-a-rescan.yml and scripts/turns/emit-gate-a-rescan-artifact.mjs changed (a new "Read the upstream loop run id" workflow step, and the emitter now reads GAR_LOOP_RUN_ID (the workflow already exported it; the emitter never read it)). Chain-fire-2 finding: the loop run id resolves from files on disk, and a CI checkout holds no upstream artifact, so chained rows recorded a null loop_run_id (ADR-031). The record shape is unchanged; only the value of config.loop_run_id is now filled on a chained firing.

## Planned run

No run is owed beyond the next gate-a-rescan firing, which behaves as before and now records the upstream loop run id. Delete this file whenever the next gate-a-rescan run lands.
