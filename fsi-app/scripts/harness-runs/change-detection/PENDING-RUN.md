# Pending run — change-detection

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``). (The prior hash,
`sha256:fcb23ec75e03c512`, is what `change-detection-run-005` records.)

**What changed (lane GOV-SINGLE, 2026-09-04, governing-files.mjs single-source refactor):**
`CHANGE_DETECTION_GOVERNING_FILES` moved from a hand-copied literal array inside
`run-change-detection.mjs` to `export const CHANGE_DETECTION_GOVERNING_FILES =
GOVERNING_FILES['change-detection'];`, importing its entry from the new single source
`scripts/harness-runs/governing-files.mjs` — see that module's own header for the full defect this
closes (a proven-live drift between F28's own copy and `run-mint-batch.mjs`'s own copy for the `mint`
family; every family's runner now imports the SAME array F28 re-hashes, instead of a second
hand-maintained copy). The FILE LIST this family's `harness_version` hashes is byte-identical
(`scripts/turns/run-change-detection.mjs`, `src/lib/sources/reconcile.ts`,
`src/lib/intake/run-intake-cycle.ts` — unchanged); only `run-change-detection.mjs` itself — one of its
own three governing files — changed BYTES (the import line and the declaration), which is what moved
the hash. Neither `reconcile.ts` nor `run-intake-cycle.ts` changed.

**harness_version at write time:** `sha256:af1881244df2726a`

**The planned run that supersedes this marker:** the next `change-detection` dispatch (this environment
has no live DB/network access to run it for real, same limitation this family's own header already
states) — its `change-detection-run-006.json` will record `harness_version: sha256:af1881244df2726a`,
discharging this marker per F28's reverse-audit (or the marker is re-pinned to a new hash, per rule (c),
if a governing file changes again before that run lands).
