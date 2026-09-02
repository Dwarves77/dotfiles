# Pending run — source-sweep

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`source-sweep` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it. (The prior marker,
`sha256:5a6a5a4649f79eec`, was discharged by `source-sweep-run-005`; run-006 carries the same hash.)

**What changed (2026-09-02, coordinator, integration of the system-completion train, after reading
`source-sweep-run-006.json`):** run-006 (dry) recorded `metrics.upserted: 7` for a run that wrote 0
rows; the per-day verdicts were honest ("planned (dry, nothing written)") but the standing metric was
not. `shapeRunOutput` in `scripts/turns/run-source-sweep.mjs` now emits `upserted: 0, planned: N`
in dry mode and `upserted: N` (no `planned` key) in apply mode, for all three walkers. One governing
file changed; `register-walk.mjs` and `feed-walk.mjs` are unchanged. Tests: 26 in
`run-source-sweep.test.mjs`.

**harness_version at write time:** `sha256:3c67d9b11afab375`

**The planned run that supersedes this marker:** `source-sweep-run-007.json`, the first
`register-federal-register` dry walk (dispatched after this train lands), expected to carry
`upserted: 0` and `planned: N` with N equal to the results the Federal Register API returns for the
window. Per F28's reverse-audit, this file is deleted the moment an artifact carrying the hash above lands.
