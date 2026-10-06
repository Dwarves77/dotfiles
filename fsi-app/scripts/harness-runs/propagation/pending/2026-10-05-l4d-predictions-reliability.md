## Change

Lane L4-D (l4d-predictions-reliability), 2026-10-05: two `propagation` governing files changed.
`src/lib/propagation/drain.ts` now selects `new_row` on the outbox read and carries it as `newRow` on each
`processedEvents` entry (no change to what is invalidated, recomputed or marked drained).
`scripts/turns/run-propagation-drain.mjs` runs a signpost step after the drain and the questions step
(`src/lib/learning/prediction-scoring.mjs`): events of the run are matched to unfired signposts, fired signposts
are scored by direction, a passed expectation date with no firing scores refuted, and one
`source_reliability_ledger` row is appended per grounding source. Dry mode reports and writes nothing; failed
signpost events join the existing unfinished-events replay list. Counts land in the artifact metrics as `sp_*`.

## Planned run

The next real `propagation` run (a dry dispatch is enough to record the `sp_*` metrics; an apply dispatch waits
for the operator's population ruling and for migrations 352 and 353) writes `propagation-run-NNN.json` carrying
them. Delete this file whenever that run lands.
