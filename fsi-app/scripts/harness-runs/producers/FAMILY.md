# producers family

Registered by lane M9d, 2026-09-20 (build plan section 6.1 row M9, follow-on from lane M5's own report:
"the market and regional producers are the loop's data producers box, they fire the outbox and now author
DAG edges, and they are the only loop box with NO harness-run family").

`.github/workflows/producers.yml` runs eleven gated producer steps with `--apply`: three regional
producers behind `scripts/producers/regional/run-envelope-producer.mjs` (`eurostat-nrg-pc-205`,
`eurostat-lc-lci-lev`, `bls-oews`), three market producers via the shared
`author-market-series-delta.mjs` DAG-authorship home (`ecb-fx`, `eia-v2-petroleum-spot`,
`eu-weekly-oil-bulletin`), `refresh-published-price-statistics`, the DESNZ fetch + seed pair
(`fetch-desnz-factors`, `emission-factors-desnz`), `emission-factors-epa`, and `ratify-series-items`.
Before this lane, none of them wrote a run artifact: every producer reported by `console.log` only, and
`assertEdgesAuthored` (lane M5's own fail-closed DAG-authorship gate) threw AFTER the guarded write had
already committed, with no artifact anywhere to record `status: "failed"` in.

**The design, one artifact per WORKFLOW RUN, not per producer script.** Eleven producer scripts calling
`writeRunArtifact` directly would mean eleven copies of the same artifact-header block and eleven claimed
run ids for what `producers.yml` treats as one firing. Instead:

1. `scripts/producers/lib/producer-summary.mjs` -- `writeProducerSummary({ producer, status, rows_changed,
   edges_authored, reason, counts })`. Every `--apply`-invoked producer script calls this once on its own
   exit path (a gate test, `scripts/producers/lib/producer-summary-wiring.test.mjs`, parses
   `producers.yml` and proves every such script imports it, attack-tested against a fixture that does
   not). Writes `<PRODUCER_SUMMARY_DIR>/<producer>.json` when that env var is set (set by `producers.yml`
   at job level); a no-op returning `null` otherwise, so a local dev run of any producer script is
   unchanged.
2. `scripts/producers/emit-producers-artifact.mjs` -- `producers.yml`'s own last step (`if: always()`).
   Reads back every summary this firing's producer steps wrote, folds them into one
   `producers-run-NNN.json` via the shared `writeRunArtifact`/`claimRunId`/`hashHarnessVersion`
   (`scripts/lib/run-artifact.mjs`), modelled on `scripts/turns/emit-downstream-chain-artifact.mjs`. Writes
   on every firing, zero summaries included (a run where nothing was armed to fire still leaves a record).
   `config.loop_run_id` is deliberately `null`: `producers.yml` runs on `workflow_dispatch` only (build
   mode, ADR-023 -- no schedule while the site is being built), never as a `workflow_run` consumer of
   anything else in this repo's loop, so producers is this hop's own loop head, not a link with an
   upstream `loop_run_id` to inherit.

**Governing files** (see `family.json`'s own rationale for the full account): the workflow itself
(escaped with `../` since it lives one level above `fsi-app/`), the two shared DAG-authorship/orchestration
modules every producer composes off (`author-market-series-delta.mjs`, `run-envelope-producer.mjs`), and
this family's own two new files (the emitter, the summary writer). The eleven individual producer scripts
are deliberately NOT governing files -- each writes only through the one shared summary writer, so a
change to one producer's own parsing logic does not move this family's `harness_version`.

`scripts/harness-runs/producers/pending/2026-09-20-m9d.md` records why this family starts at zero
artifacts (registered ahead of the coordinator's next dispatch, the same posture every prior family's own
registration recorded for itself -- see `downstream-chain/FAMILY.md` for the identical shape).

**producers' standing metric** (build plan section 2's "measurement, not assertion," per family): of the
producers that fired on a given dispatch, how many reported `status: "ok"` versus `status: "failed"`
(`metrics.producers_reporting` / `metrics.producers_failed` on each artifact), and the total
`rows_changed`/`edges_authored` across the firing -- a proposer pass reading this family's history sees
whether a producer dispatch actually wrote rows and authored DAG edges from them, never only that the
workflow itself ran green.
