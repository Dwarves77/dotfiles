# brief-export family

Registered by lane M4, 2026-09-20 (build plan section 6.1 row M4, Amendment 1 section C, closing the
loop-manifest's `population-turn-to-brief-export` hop, previously filed under the `brief-apply` family
"for now").

`.github/workflows/brief-export.yml` (task 3.1 of `docs/plans/brief-chain-build-plan-2026-09-11.md`) is
the read-only export half of the brief chain: it selects up to `limit` record-grade stub items (explicit
`ids`, or auto-selected per its own header's "SELECTION" section) and hands their stored claims/sections
plus full captured pool text to a session lane for offline authoring, via
`export-corpus-for-extraction.mjs --with-pool-text`. Before this lane it ran `workflow_dispatch` only and
wrote no harness artifact at all: every run's outcome was a workflow-artifact upload and a PR, with nothing
under `scripts/harness-runs/` recording the run happened. This family closes that gap: the workflow gains a
`workflow_run` trigger on "Population turn" completing, and a final step
(`scripts/turns/emit-brief-export-artifact.mjs`) writes this family's own committed
`brief-export-run-NNN.json`.

Unlike `downstream-chain`, this family DOES have its own canonical runner
(`export-corpus-for-extraction.mjs`), but the emitter is a separate script
(`emit-brief-export-artifact.mjs`), the same "the workflow's own final step reads back what the run already
did and records it" posture `emit-downstream-chain-artifact.mjs` established: it never re-runs the export
itself, it only reads the run's own resolved selection (mode, ids exported, the batch skeleton path it
wrote) and the loop id resolved via `resolveLoopRunIdFromUpstream` (upstream name "Population turn",
`scripts/lib/loop-run-id.mjs`, lane M3b) and records them.

`scripts/harness-runs/brief-export/pending/2026-09-20-m4.md` records why this family starts at zero
artifacts (registered ahead of the coordinator's next live dispatch, the same posture `downstream-chain`,
`ledger-consume`, `corpus-turn`, `brief-apply` and `maintenance` each recorded at their own registration).

**brief-export's standing metric** (build plan section 2's "measurement, not assertion," per family): of
the ids this run resolved (explicit or auto-selected), how many were actually exported into a part file
(`config.selection`, `per_item` rows, one per exported id) versus how many resolved to nothing (a `limit`
of 0, or an auto-selection that matched no record-grade items) -- a proposer pass reading this family's
history sees whether the export half of the brief chain is finding real work on a chained firing, never
only that the workflow itself ran.
