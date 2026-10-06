## Change

Lane L4-D (l4d-predictions-reliability), 2026-10-05: both `research-assessment` governing files changed.
`src/lib/research/assess.mjs` gains `assessSignposts` (a dated R1 or R3 expectation about the item's instrument
entity, stated as one machine-watchable signpost) and `assessHorizon` now names the forward event it anchored on.
`scripts/producers/research/research-assessment-producer.mjs` plans one signposts row per such expectation
(entity of kind signpost minted from item id plus forward event id, existing rows read first, so a re-run writes
none) and writes it through the guarded path after the assessment row. Dry by default.

## Planned run

The next `research-assessment` run (a fixture or dry dispatch records the `signposts_*` metrics) supersedes this
file. Delete it in the same change that lands that run.
