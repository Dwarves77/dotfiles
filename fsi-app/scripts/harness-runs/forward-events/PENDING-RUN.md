# Pending run — forward-events

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``).

**What changed (1):** `scripts/harness-runs/forward-events/PROTOCOL.md` gained §5c, documenting
`metrics.dedupe_dropped` — a prose-only change to a governing file. PROPOSER-5 (pass of 2026-09-04 over
runs 006–009) found that the extractor's `counts.dedupe_dropped` never reached an artifact because
`scripts/forward-events/run-extraction.mjs` destructured only `{ events, skipped }`; the runner now folds
the drops into `metrics.dedupe_dropped` and `result.dedupeDropped[]` (DEDUPE-PLUMB, same train). The
runner is not a governing file; the protocol paragraph that describes the metric is.

**harness_version at write time:** `sha256:0fc1e3c0509b52f7`

**The planned run that will supersede this marker:** the coordinator's next `population-turn` flywheel
pass (backlog or normal), whose `forward-events-run-NNN.json` artifact records this hash as its
`harness_version`, discharging this marker per F28's reverse-audit (rule (c): the marker is deleted the
moment a valid artifact's recorded hash matches the one above, or re-pinned to a new hash if a governing
file moves again before that run lands — lane FWD-TEXT-2 is moving `extract-forward-events.mjs` again and
will re-pin this file).
