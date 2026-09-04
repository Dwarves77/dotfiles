# Pending run — propagation

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``). (The prior hash,
`sha256:1bf7154b2038e959`, is what `propagation-run-002` records.)

**What changed (lane GOV-SINGLE, 2026-09-04, governing-files.mjs single-source refactor):**
`PROPAGATION_GOVERNING_FILES` moved from a hand-copied literal array inside `run-propagation-drain.mjs`
to `export const PROPAGATION_GOVERNING_FILES = GOVERNING_FILES.propagation;`, importing its entry from
the new single source `scripts/harness-runs/governing-files.mjs` — see that module's own header for the
full defect this closes (a proven-live drift between F28's own copy and `run-mint-batch.mjs`'s own copy
for the `mint` family; every family's runner now imports the SAME array F28 re-hashes, instead of a
second hand-maintained copy). The FILE LIST this family's `harness_version` hashes is byte-identical
(`scripts/turns/run-propagation-drain.mjs`, `src/lib/propagation/drain.ts`,
`src/lib/propagation/admissible-for.ts` — unchanged); only `run-propagation-drain.mjs` itself — one of
its own three governing files — changed BYTES (the import line and the declaration), which is what
moved the hash. Neither `drain.ts` nor `admissible-for.ts` changed.

**Re-pinned (lane CHAIN, 2026-09-04, event-driven workflow chaining, W1.4):** `run-propagation-drain.mjs`
— one of this family's own three governing files — changed BYTES again: `parseArgs` gained a
`--trigger-context` option and `main()`'s artifact-building `finally` block now records
`config.trigger_context` (the upstream `{name, run_id, conclusion}` when this run was fired by
`propagation-drain.yml`'s own new `workflow_run` chaining off "Data producers" completing, else `null`
for a plain hand dispatch — see that file's own header note on `--trigger-context` and
`propagation-drain.yml`'s "Resolve run parameters and the chaining gate" step). Neither `drain.ts` nor
`admissible-for.ts` changed. This is the SECOND re-hash this marker has tracked without a landed run in
between; the drift is honestly re-acknowledged here per rule (c) rather than landing a synthetic run to
clear it.

**harness_version at write time:** `sha256:45d4f97e9c543737`

**The planned run that supersedes this marker:** the next `propagation-drain` dispatch (this environment
has migrations verified only against a local scratch Postgres, no live Supabase project credentials,
same limitation this family's own header already states) — its `propagation-run-003.json` will record
`harness_version: sha256:45d4f97e9c543737`, discharging this marker per F28's reverse-audit (or the
marker is re-pinned to a new hash, per rule (c), if a governing file changes again before that run
lands).

**Chained (lane DAG-AUTHOR, 2026-09-04):** `run-propagation-drain.mjs`, `drain.ts`, `admissible-for.ts`
are still byte-identical to what produced `sha256:737b461bd2fbf527` above — confirmed live this session
(`hashHarnessVersion(GOVERNING_FILES.propagation)` re-run against the checked-out tree returns the same
hash) — so this marker is NOT re-pinned; nothing this lane touched is a propagation governing file. What
this lane adds is upstream of the drain, not a change to it: DAG authorship at write time (two producer
chokepoints — `scripts/gen/emission-factors-common.mjs`'s `authorCarbonIntensityEdges`,
`scripts/producers/regional/run-envelope-producer.mjs`'s `authorAutomateVsHireForRegions`), a one-time
historical bridge (`scripts/entities/backfill-derivation-edges.mjs`) for rows written before that wiring
existed, and the first `statutory_computations` writer (`scripts/propagation/write-statutory.mjs`, FuelEU
Annex IV — rows-file-driven, no live ship-GHG source exists yet, see that file's own header). The
`propagation-drain.yml` `backfill_and_statutory` dispatch input (added this lane) runs the backfill and
the statutory writer BEFORE the drain step that discharges this marker — so the run that finally supersedes
it should be dispatched with that checkbox on at least once, to close the historical gap first. This
marker's own discharge condition (a fresh `propagation-run-003.json` recording the unchanged hash above)
is unaffected by any of this — none of the three governing files changed.
