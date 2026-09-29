## Change

Lane CHAINED-DRY-GUARD (2026-09-29) changed two of meta-harness's own governing files:
`fsi-app/scripts/harness-runs/CONVENTION.md` (documents the new fifth `trigger` value,
`"workflow_run_forced_dry"`) and `fsi-app/scripts/lib/run-artifact.mjs` (extends `TRIGGER_VALUES` and
adds the `CHAINED_FORCED_DRY` override in `writeRunArtifact`, the ONE canonical trigger-stamping site
every family's runner calls).

## Planned run

No meta-harness wave is being built by this lane; this is a side effect of a schema addition to the
shared convention every family's artifact already follows. The next meta-harness-run artifact (whenever
a meta-harness wave next lands) supersedes this file; no dedicated run is planned by this lane.
