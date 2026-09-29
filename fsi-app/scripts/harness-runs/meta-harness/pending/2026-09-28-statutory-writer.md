## Change

Lane STATUTORY-WRITER (2026-09-28) added a new harness family descriptor,
`fsi-app/scripts/harness-runs/statutory/family.json`, one of meta-harness's own governing files (every
family descriptor is watched by meta-harness, `governing-files.mjs`'s `deriveGoverningFiles`).

## Planned run

No meta-harness wave is being built by this lane; this is a side effect of registering the new
`statutory` family. The next meta-harness-run artifact (whenever a meta-harness wave next lands) supersedes
this file; no dedicated run is planned by this lane.
