## Change

Lane L4-A (l4a-questions-on-change), 2026-10-05: two `propagation` governing files changed.
`src/lib/propagation/drain.ts` now selects `change_kind` on the outbox read and returns a
`processedEvents` list on `DrainResult` (event id, table, row pk, entity id, change kind, time of each
event the call processed; no change to what is invalidated, recomputed or marked drained).
`scripts/turns/run-propagation-drain.mjs` now runs a questions-on-change step after the drain passes
(src/lib/learning/questions-on-change.mjs): dry mode computes and reports counts and writes nothing,
apply mode writes question flags through the guarded writer. The counts land in the run artifact
metrics as `qoc_*` keys.

## Planned run

The next real `propagation` run (a dry dispatch is enough to record the new `qoc_*` metrics; an apply
dispatch waits for the operator's population ruling) writes `propagation-run-NNN.json` carrying them.
Delete this file whenever that run lands.
