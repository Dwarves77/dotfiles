## Change

Lane CHAIN-2, 2026-10-07: .github/workflows/source-resolution.yml and scripts/turns/emit-source-resolution-artifact.mjs changed (a new "Read the upstream loop run id" workflow step, and the emitter now takes SR_LOOP_RUN_ID as the explicit loop run id). Chain-fire-2 finding: the loop run id resolves from files on disk, and a CI checkout holds no upstream artifact, so chained rows recorded a null loop_run_id (ADR-031). The record shape is unchanged; only the value of config.loop_run_id is now filled on a chained firing.

## Planned run

No run is owed beyond the next source-resolution firing, which behaves as before and now records the upstream loop run id. Delete this file whenever the next source-resolution run lands.
