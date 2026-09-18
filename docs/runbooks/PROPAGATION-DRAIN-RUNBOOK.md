# Runbook: Propagation drain

Workflow: `.github/workflows/propagation-drain.yml`. Driver: `fsi-app/scripts/turns/run-propagation-drain.mjs`
around the pure `src/lib/propagation/drain.ts`/`admissible-for.ts` modules (`invalidate_dependents` /
`register_derived_value`, migrations 284-285). Always records a `propagation` harness-run artifact
(`scripts/harness-runs/propagation/`), in both modes, from a `finally` block.

This file existed as a forward reference (`propagation-drain.yml`'s own header cited it) before it existed
as a document — created lane CHAIN, 2026-09-06, closing that dangling reference and, per this lane's own
brief, drawing the FULL loop this workflow is the last hop of: not only what fires `propagation-drain.yml`
itself, but the whole chain feeding it, since the drain is where every branch of the loop converges.

## The whole loop, one table

| Workflow | Trigger | Gate (before it does real work) | Fires next |
|---|---|---|---|
| `source-sweep.yml` | `workflow_dispatch` only | — (a sweep is always a deliberate, operator/coordinator-named dispatch; no upstream to gate on) | `ledger-consume.yml` (`workflow_run`, unconditional — every conclusion re-checks, see below) |
| `ledger-consume.yml` | `workflow_dispatch`, or `workflow_run` on `["Source sweep"]` completed | chained: `github.event.workflow_run.conclusion == 'success'` (forces `mode=plan`, never `apply`, on a chained run — see that file's own header) | `population-turn.yml` (`workflow_run`) |
| `population-turn.yml` | `workflow_dispatch`, or `workflow_run` on `["Ledger consume"]` completed | chained: upstream `conclusion == 'success'` AND `POPULATION_PAUSED != 'true'` AND the upstream's own `ledger-consume/<run_id>` artifact shows `config.mode == 'apply'` and `metrics.promoted > 0` | its OWN mandatory flywheel step (discovery + forward-events + recluster + `derive-obligations` + `tag-proposals` + `tag-ratification --arg auto`, MINT-RUNBOOK.md §8/§9 — runs IN this job, not a further `workflow_run` hop) **then**, lane CHAIN 2026-09-06, `downstream-chain.yml` (`workflow_run`) when `metrics.minted > 0` |
| `corpus-turn.yml` | `workflow_dispatch`, or `push` to `turn/**` | — (push is itself the request; a dispatch is deliberate) | lane CHAIN 2026-09-06: `downstream-chain.yml` (`workflow_run`) when `metrics.tickets_selected > 0` |
| **`downstream-chain.yml`** (lane CHAIN, 2026-09-06) | `workflow_dispatch`, or `workflow_run` on `["Population turn", "Corpus turn"]` completed | chained: upstream `conclusion == 'success'` AND the upstream's own artifact branch (`population/<run_id>` or `turn/<run_id>`/pushed branch) shows real applied work (`metrics.minted > 0` at `config.mode == "execute"`, or `metrics.tickets_selected > 0` at `config.mode == "apply"`) | `tier-opinions` → `derive-obligations` → `tag-proposals` → `apply-classifications` (all four, in order, via `./.github/actions/maintenance-step` — the SAME invocation `maintenance.yml`'s own dispatch-one-step job uses), **then** `propagation-drain.yml` (`workflow_run`) |
| `producers.yml` | `workflow_dispatch` (+ its own per-source cadence documented in that file) | — | `propagation-drain.yml` (`workflow_run`) |
| **`propagation-drain.yml`** | `workflow_dispatch`, or `workflow_run` on `["Data producers", "Downstream chain"]` completed | chained: upstream `conclusion == 'success'` — no per-run count check needed (see that file's own header: both upstream families' writes queue `propagation_events` via DB trigger B4 unconditionally, so a drain over zero new events is still the correct, informative outcome, never evidence of a disarmed upstream) | — (end of the loop; `propagation_events` drained to zero or checkpointed) |

No `schedule:` block anywhere in this table (rule 16, build mode) — every hop is either an explicit
dispatch/push or a `workflow_run` firing off another workflow's own completion, never a cron.

## Reading the loop end to end from one mint

1. A coordinator (or an upstream chain) dispatches `population-turn.yml` and it mints `N > 0` items.
2. In the SAME job, before that run is green, `run-population-flywheel.mjs` connects those `N` items
   (discovery, forward-events, `derive-obligations`, `tag-proposals`, `tag-ratification --arg auto`) and
   records the §9 outcomes on the run's own `mint-run-NNN.json`.
3. `population-turn.yml` finishes green; `downstream-chain.yml` fires automatically, reads that same
   `mint-run-NNN.json` off the `population/<run_id>` branch, confirms `metrics.minted > 0`, and re-runs
   the four WHOLE-CORPUS deterministic derivations (`tier-opinions`, `derive-obligations`,
   `tag-proposals`, `apply-classifications`) — catching anything population-turn's own item-scoped
   flywheel pass could not (a `tier-opinions` disagreement on a source untouched by this mint; a
   `tag-proposals`/`apply-classifications` candidate a DIFFERENT item's fresh state now makes
   detectable).
4. `downstream-chain.yml` finishes green (including a legitimate no-op-green when its own gate skipped);
   `propagation-drain.yml` fires automatically and drains whatever `propagation_events` rows B4's own DB
   trigger queued from any of the writes above.
5. A coordinator reading ONLY the population-turn dispatch's own artifact link can follow this chain
   forward through each workflow's own "Actions" tab (each run's summary names its `RUN_TRIGGER_CONTEXT`
   — the upstream workflow name, run id, and conclusion it chained from) without re-dispatching anything
   by hand.

## Dispatch (workflow_dispatch inputs)

- **mode** — `dry` (`invalidate_dependents(p_apply=false)`, counts only) or `apply` (invalidate for real,
  then recompute through registered METHODS).
- **batch** — max undrained `propagation_events` processed this run (default 500).
- **backfill_entities** — run `scripts/entities/backfill-entities.mjs` first (hand-dispatch only; a
  chained run never ticks this).
- **seed_derived_values** — run `scripts/propagation/seed-derived-values.mjs` first (hand-dispatch only).
- **backfill_and_statutory** — run `scripts/entities/backfill-derivation-edges.mjs` then
  `scripts/propagation/write-statutory.mjs` first (hand-dispatch only).

**Secrets**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (same pair every guarded script
requires); `APP_URL`/`WORKER_SECRET` for the cache-flush step (best-effort, `|| true`).

**Artifact**: `scripts/harness-runs/propagation/propagation-run-NNN.json`, committed via a
`propagation/<run_id>` branch + PR (`deliver-artifact-branch.sh`, same pattern every other harness-run
family in this repo uses) — read back the run's own `metrics` for exactly what it invalidated/recomputed.

## Tracing edge authorship

Lane M5 (2026-09-18, S4 propagate audit row 1): all three `market_series` producers
(`scripts/producers/market/{ecb-fx,eia-v2-petroleum-spot,eu-weekly-oil-bulletin}-producer.mjs`) call
`authorMarketSeriesDeltaEdges` (the one home: `scripts/producers/market/author-market-series-delta.mjs`)
unconditionally after their own guarded write, and a static contract test passes, but the live
`derivation_edges` table held zero `market_series` rows even after a fresh apply run. Read live: every
`market_series` row this session inspected traces to exactly one of two causes, neither an insert failure
nor a dry/plan branch. (1) Most of `market_series` was written BEFORE the DAG-authorship call existed in
these files (the `eia-v2`/`eu-oil-bulletin` backfills all landed 2026-09-04, two days before lane W4-DAG
wired the call in on 2026-09-06, so the call is unconditional in TODAY's code, but was never present at
write time for those rows). (2) The one producer run that DID execute the wired call (`ecb-fx`,
2026-09-16) legitimately hit `insufficientHistory`: its two observations for each currency are 6 days
apart (2026-08-28, 2026-09-03), one day short of `series-deltas.mjs`'s `nearestAtOrBefore(latest.date - 7
days)` window, so the earlier point falls AFTER the 7-day target and no prior point qualifies. This is
`series-deltas.mjs` behaving exactly as designed (never match a point after the window target, see that
file's own header), not a bug; it self-resolves once a producer run lands with a wider gap to its
predecessor.

**`--trace`**: every producer accepts it (`node scripts/producers/market/ecb-fx-producer.mjs --apply
--trace`, same for the other two). When set, `authorMarketSeriesDeltaEdges` logs every step to stderr
(`[trace] market_series_delta: ...`), keys received, rows read per key in the lookback window, the
delta1w outcome, the candidate pair attempted, the authorEdges result, every caught error verbatim, and
attaches the same lines as a `trace` array on its returned counts object (absent entirely when `--trace`
is not passed, so the existing counts shape is unchanged). No `scripts/harness-runs/market/` artifact
exists to write `config.trace` into today; no market/regional producer family is registered in
`scripts/lib/run-artifact.mjs`'s `ALLOWED_FAMILIES` (mint/screen/fetch-drain/meta-harness/forward-events/
source-sweep/ledger-consume/change-detection/propagation/corpus-turn/brief-apply are; market and regional
are not). Registering one is a separate, deliberate act touching `run-artifact.mjs`,
`scripts/harness-runs/governing-files.mjs`, `scripts/harness-runs/CONVENTION.md`'s family table, and
`F28-harness-run-integrity.mjs`, out of this lane's write set; the trace mechanism above is built so a
future artifact writer can pick up `counts.trace` directly once that registration lands.

**The run is the gate.** `assertEdgesAuthored({ rowsChanged, edgesAuthored })`
(`author-market-series-delta.mjs`) is a pure, exported, unit-tested function every producer calls right
after logging its own `authorCounts` line: it throws (and the producer's top-level `main().catch` turns
that into a non-zero exit) when the run wrote real rows to `market_series` (`rowsChanged > 0`) but
authored zero `derivation_edges` (`edgesAuthored === 0`), exactly the "wired, called, zero effect"
combination this audit row found live. A no-op write (`rowsChanged === 0`) never asserts. Re-run with
`--trace` to see which outcome bucket every touched `series_key` landed in.

## See also

- `docs/runbooks/MAINTENANCE-RUNBOOK.md` §33 — the four steps `downstream-chain.yml` chains, and the
  first coordinator dispatch that exercises this whole table end to end.
- `docs/runbooks/CORPUS-TURN-RUNBOOK.md` "Downstream chain" — the corpus-turn side of the same hop.
- `docs/runbooks/POPULATION-TURN-RUNBOOK.md` — population-turn's own mandatory flywheel step (MINT-RUNBOOK.md §8/§9), upstream of this table's `downstream-chain.yml` row.
