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

Hash at that write: `sha256:af1881244df2726a` — SUPERSEDED, see the CAP-1000 re-pin below (F28's
`parsePendingRunHash` reads the FIRST `harness_version at write time:` line in this file, so only ONE
such line may appear at a time; this paragraph deliberately does not repeat that exact phrase).

**RE-PINNED (Lane CAP-1000, 2026-09-05, "two defects one cause" audit):** exactly the "if a governing
file changes again before that run lands" case above fired again. `run-change-detection.mjs`'s
`readPendingDrainRows` used to derive its "how many rows beyond `--drain-limit` are pending" overflow
count from `.limit(Math.max(limit, 1000) + 1)`'s ARRAY LENGTH — PostgREST's `db-max-rows` setting caps
that response at 1000 rows regardless of the `+1`, so once the true `staged_updates` backlog exceeded
1000 the "+1 over the cap" trick silently stopped working and `overflow` read as a false 0 no matter how
deep the real backlog ran (the same defect class this lane's audit found and fixed at PERF-13's slug
enumeration and the obligations register's `OVERFETCH_CAP`). Fixed to use `exactCount()`
(`src/lib/db/paginate.mjs`, a DB-computed `{ count: 'exact', head: true }`) for the true total plus a
separate, honestly-bounded `.limit(limit)` sample read — `overflow = total - rows.length` is now exact at
any backlog depth. This changed `run-change-detection.mjs`'s bytes again (one of this family's three
governing files, unchanged file LIST), moving the hash a second time.

**harness_version at the previous pin's write time (superseded below, see Re-pin 2):** `sha256:b155a4626335408f`

**The planned run that supersedes THIS marker:** the same next live `change-detection` dispatch as above
(still no live DB/network access from this lane) — its `change-detection-run-006.json` will record
`harness_version: sha256:b155a4626335408f`, discharging this marker per F28's reverse-audit (or the
marker is re-pinned again, per rule (c), if a governing file changes once more before that run lands).

## Re-pin 2 (coordinator, 2026-09-13, at push after rebase: lane/w9-l17-candidate-drain-2026-09-13)

**What changed.** The recorded hash `sha256:b155a4626335408f` no longer matched the live governing files of this family (`scripts/turns/run-change-detection.mjs`, `src/lib/sources/reconcile.ts`, `src/lib/intake/run-intake-cycle.ts`) on the tree this push carries. Governing files changed on this branch: `src/lib/intake/run-intake-cycle.ts`. No run of this family landed in between; the marker is re-pinned so F28 measures the tree the run will actually execute on.

**harness_version at the previous pin's write time (superseded below, see Re-pin 3):** `sha256:66c1bb58dfbbf01a` (recomputed via `hashHarnessVersion` against `GOVERNING_FILES['change-detection']`, unreordered).

**The planned run that supersedes this marker.** Unchanged in kind from the previous pin; that run's artifact records whatever the tree is when it lands, and this file is deleted or re-pinned per F28's reverse-audit.

## Re-pin 3 (coordinator, 2026-09-13, at push after rebase: lane/w9-l17-candidate-drain-2026-09-13)

**What changed.** The recorded hash `sha256:66c1bb58dfbbf01a` no longer matched the live governing files of this family (`scripts/turns/run-change-detection.mjs`, `src/lib/sources/reconcile.ts`, `src/lib/intake/run-intake-cycle.ts`) on the tree this push carries. Governing files changed on this branch: `src/lib/intake/run-intake-cycle.ts`. No run of this family landed in between; the marker is re-pinned so F28 measures the tree the run will actually execute on.

**harness_version at write time:** `sha256:c8a815718d5993d1` (recomputed via `hashHarnessVersion` against `GOVERNING_FILES['change-detection']`, unreordered).

**The planned run that supersedes this marker.** Unchanged in kind from the previous pin; that run's artifact records whatever the tree is when it lands, and this file is deleted or re-pinned per F28's reverse-audit.
