# gate-a-rescan family

Registered by lane M6b, 2026-09-21 (build plan section 6.1 row M6, docs/dispatches/lane-briefs/
2026-09-20/brief-m6-amendment-1.md sections C and D, closing the loop-manifest's
`brief-apply-to-gate-a-rescan` and `population-turn-to-gate-a-rescan` hops).

`.github/workflows/gate-a-rescan.yml` is the last hop before proof run 6.2: a `workflow_run` chain off
either "Brief apply" or "Population turn" completing, plus a `workflow_dispatch` for a hand-named ticket.
It runs `scripts/maintenance/gate-a-rescan.mjs` -- a bulk sweep that refreshes any `item_gate_a_state` row
whose `gate_a_version` has fallen behind the live scanner (`GATE_A_VERSION`,
`src/lib/agent/gate-a-scan.mjs`), computing Gate B derived coverage fresh per item
(`derivedCoveredTokens`) exactly as `canonical-pipeline.ts` does at mint time, and re-firing
`set_provenance_status` (via the SAME guarded touch `scripts/mint/rederive-record-provenance.mjs`
already uses) whenever an item's scan result actually changed -- `provenance_status` is a cache the scan
alone does not refresh (remediation-discipline 5.6).

When the re-scan leaves any item with `orphan_count > 0`, the SAME job chains into
`scripts/maintenance/attach-found-sources.mjs` (filtered to those exact item ids, limit 50, over each
committed ready worklist under `scripts/_worklists/attach-found-sources-*.json`) -- one artifact, two
steps, per brief item 4.

Before this lane, nothing in this repo bulk-re-scanned `item_gate_a_state`: the only writer outside the
mint path was the inline update-or-insert in `scripts/maintenance/provenance-heal.mjs`, now factored into
`scripts/lib/gate-a-state-writer.mjs` (lane M6b item 1) and shared by this family's own runner.

Like `brief-export`, this family has its own canonical runner (`gate-a-rescan.mjs`); the emitter is a
separate script (`emit-gate-a-rescan-artifact.mjs`), the same "the workflow's own final step reads back
what the run already did and records it" posture every `emit-*-artifact.mjs` writer in this repo holds:
it never re-runs the scan itself, it only reads the run's own `gate-a-rescan.mjs` (and, when it ran,
`attach-found-sources.mjs`) `summary.json` output and the loop id resolved via `resolveHarnessRunContext`
(upstream name "Brief apply" or "Population turn", `scripts/lib/loop-run-id.mjs`) and records them.

`scripts/harness-runs/gate-a-rescan/pending/2026-09-21-m6b.md` records why this family starts at zero
artifacts (registered ahead of the coordinator's next live dispatch, the same posture `downstream-chain`,
`brief-export`, `ledger-consume`, `corpus-turn`, `brief-apply` and `maintenance` each recorded at their
own registration).

**gate-a-rescan's standing metric** (build plan section 2's "measurement, not assertion," per family): of
the item_gate_a_state rows this run found stale, how many were actually re-scanned and upserted
(`metrics.selected`) versus how many changed enough to require a provenance-status touch
(`metrics.touched`), and how many distinct `gate_a_version` values remain live across the whole table
after an apply run (`metrics.distinct_versions_remaining`, `null` on a dry run) -- a proposer pass reading
this family's history sees whether the corpus is actually converging on one live scanner version, never
only that the workflow ran.
