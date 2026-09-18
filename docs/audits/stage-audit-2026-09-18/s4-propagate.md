# S4 propagate: stage audit 2026-09-18

Method: read `docs/plans/complete-system-build-plan-2026-09-04.md` (section 0, section 1, W4, section 5),
`docs/audits/plan-completion-audit-2026-09-05/README.md` and `W3-W4-sourcing-propagation.md`; read
`src/lib/propagation/*.{ts,mjs}`, `scripts/producers/**`, `scripts/gen/emission-factors-common.mjs`,
`scripts/spec09/*`, `src/app/api/workspace/spec09-upload/logic.ts`, `src/app/api/notices/*`,
`.github/workflows/propagation-drain.yml`, `.github/workflows/maintenance.yml`, `.discipline/run-test-suite.sh`;
ran the static node test `src/lib/propagation/producer-edge-authorship.test.mjs`; ran read-only SELECT
counts against the live Supabase project. Commit read: `806c0c48` (worktree `wt-session-c`, clean, no local
changes) at master `3da30b22` plus one docs commit, per the common brief.

## The table

| Component | Where (file / workflow / table) | 1 Reachable | 2 Run | 3 Populated | 4 Visible | 5 Gated | 6 Documented | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| DAG authorship, `market_series` (3 producers) | `scripts/producers/market/{ecb-fx,eia-v2-petroleum-spot,eu-weekly-oil-bulletin}-producer.mjs` calling `authorMarketSeriesDeltaEdges` (`scripts/producers/market/author-market-series-delta.mjs`) into `src/lib/propagation/author-edges.mjs` | YES [CONFIRMED] all three call `authorMarketSeriesDeltaEdges(touchedSeriesKeys, "apply")` unconditionally after their guarded write, grep this session | YES for the producer scripts themselves [CONFIRMED] `market_series` row for `source_key='ecb'` has `created_at='2026-09-16T16:59:29Z'`, i.e. the ecb-fx producer ran two days ago; but NO evidence the edge-authorship call inside that run ever succeeded | **NO** [CONFIRMED live SQL] `select from_table, count(*) from derivation_edges group by from_table` returns only `emission_factors=20`, `regional_data_facts=4`; `market_series` is absent (0) despite `market_series` = 2,747 rows live and a producer run 2 days ago | N/A internal DAG | YES the static contract test (`producer-edge-authorship.test.mjs`) passes today [CONFIRMED, ran it: 2/2 pass] and is execution-wired into `run-test-suite.sh:165` (`fsi-app/src/lib/propagation/*.test.mjs`) and `:117` (`fsi-app/scripts/producers/*/*.test.mjs`) | YES `author-edges.mjs` and `author-market-series-delta.mjs` headers document the mechanism in full | **PARTIAL** (code-complete, gated, unconditionally called, but demonstrably not landing rows for the highest-volume producer table even after a fresh run) | Static test pass this session; live SQL counts this session; `market_series` source_key/created_at query this session |
| DAG authorship, `emission_factors` (DESNZ, EPA) | `scripts/gen/emission-factors-common.mjs`'s `authorCarbonIntensityEdges`, called from `seedFactors` | YES [CONFIRMED grep, `seedFactors` calls it unconditionally after `guardedInsertMany`] | YES [CONFIRMED live SQL] 20 of 24 `derivation_edges` rows are `from_table='emission_factors'` | YES [CONFIRMED] 20 rows | N/A internal DAG | YES same globs as above, `scripts/gen/*.test.mjs` (`run-test-suite.sh:104`) | YES file header | **COMPLETE** | Live SQL this session |
| DAG authorship, `regional_data_facts` (BLS-OEWS, Eurostat LC-LCI-LEV, Eurostat NRG-PC-205) | All three producers delegate their guarded write to the shared `runEnvelopeProducer` (`scripts/producers/regional/run-envelope-producer.mjs`), which calls `authorAutomateVsHireForRegions` -> `authorEdges` in the same function | YES [CONFIRMED grep, unconditional call at `run-envelope-producer.mjs:286`] | YES [CONFIRMED live SQL] 4 of 24 `derivation_edges` rows are `from_table='regional_data_facts'`, against 90 live `regional_data_facts` rows | YES [CONFIRMED] 4 rows (small, real) | N/A internal DAG | YES `scripts/producers/*/*.test.mjs` glob | YES file header | **PARTIAL** (wired, run, producing edges, but only 4 edges against 90 source rows -- most historical rows predate the 2026-09-06 wiring and the one-time backfill has not re-run since 2026-09-05, see next row) | Live SQL this session |
| One-time historical DAG bridge | `scripts/entities/backfill-derivation-edges.mjs`, dispatched via `propagation-drain.yml`'s `backfill_and_statutory` input (manual `workflow_dispatch` only; explicitly forced `false` on every chained `workflow_run`) | YES wired as an opt-in step in `propagation-drain.yml:305` | PARTIAL [CONFIRMED] one real apply landed 2026-09-04/05 (`derivation_edges` 6 -> 24, matching the 2026-09-05 audit's own number); [CONFIRMED this session] `derivation_edges` is STILL exactly 24 today, 13 days later, across 4 further real drain runs (006, 007, 008 on 09-07/09-11/09-11) -- the backfill has not been re-dispatched since | Same 24 rows | N/A | test-gated only, no execution-wiring check that it has run recently | YES script's own header states its retirement condition (two consecutive zero-candidate runs) precisely | **PARTIAL, stalled** | Live SQL count unchanged at 24 vs the 2026-09-05 audit's own number; harness file diff below |
| Outbox (`propagation_events`, `emit_propagation_event()`) | Migration 284, fired on every producer write | YES | YES continuously | YES [CONFIRMED live SQL] `propagation_events` = 2,782 total, 776 pending (drained_at IS NULL) | Internal (queue-depth view, not customer-facing by design) | Covered by drain's own tests | YES migration header | **COMPLETE** | Live SQL this session |
| Governed drain (`invalidate_dependents`, `runPropagationDrain`, `propagation-drain.yml`) | `src/lib/propagation/drain.ts`, `scripts/turns/run-propagation-drain.mjs` | YES, chained via `workflow_run: workflows: ["Data producers", "Downstream chain"]` [CONFIRMED grep, `propagation-drain.yml:127-128`] | YES, 8 real harness-recorded runs, `scripts/harness-runs/propagation/propagation-run-001..008.json` [CONFIRMED, read all 8] | PARTIAL -- see next cell | N/A internal | YES F-numbers cover drain internals per prior audit | YES | **PARTIAL, chronic zero-effect** | **[CONFIRMED, most consequential row]** Read all 8 harness artifacts this session: run-004 (2026-09-04, one manual apply w/ backfill) is the ONLY run that ever invalidated/recomputed anything (8/8). Every other real run -- 001, 002, 003, 005, 006, 007, 008, spanning 2026-09-02 through 2026-09-11 -- drained real events (500 at a time on the populated runs) and reported `0 invalidated, 0 recomputed` every single time. The chain fires correctly; it has produced a real recompute exactly once in 8 tries because the DAG it drains against is starved (see the three rows above). The most recent run (008) started 2026-09-11T18:57, 7 days before this audit; `propagation_events` pending has been 776 with no further drain recorded since. |
| Notices (`GET /api/notices`, `RecalculationNotice`/`NoticesRail`) | `src/app/api/notices/route.ts`, `resolve-watched-entities.ts`, `src/components/figures/RecalculationNotice.tsx`, `NoticesRail.tsx` | YES, a route, not a batch job | Runs on request; depends on `org_watchlist` + superseded `derived_values` pairs existing | Pool to notify from is tiny: 22 `derived_values` rows total, only 8 ever superseded (all from the one 2026-09-04 recompute) | **IMPROVED since 2026-09-05**: [CONFIRMED grep] mount sites now include `src/components/operations/AutomateVsHireCalculator.tsx`, `src/components/figures/EstimatedFigure.tsx`, and `src/components/watchlist/WatchlistSurface.tsx` -- three call sites vs the 2026-09-05 audit's "one surface, Operations only" claim; not independently re-verified in-browser this session | Not independently located a dedicated fitness function this session | YES route/component headers | **PARTIAL** (surface reach widened per code read, but the underlying data pool to notify from has not grown since 2026-09-04) | grep this session; live `derived_values`=22 count |
| `statutory_computations` / FuelEU Annex IV writer | `scripts/propagation/write-statutory.mjs`, `src/lib/statutory/fueleu-annex-iv.mjs`, gated by `scripts/propagation/validate-statutory-rows-file.mjs` (added by lane FUELEU-ROWS, 2026-09-06) | YES wired in `propagation-drain.yml:316-336`, explicit no-op when the rows-file is absent (not a silent failure) | **NOT** -- [CONFIRMED] `scripts/propagation/fixtures/fueleu-annex-iv-rows.json` still does not exist; only a same-directory *constants* file (`fueleu-annex-i-iv-statutory-constants-2026-09-06.json`) and the explicitly self-labeled FIXTURE worklist at `scripts/_worklists/statutory-fueleu-annex-iv-2026-09-05.json` exist, at the wrong path, unchanged from the 2026-09-05 audit | **NO** [CONFIRMED live SQL] `statutory_computations` = 0 rows, unchanged from 2026-09-05 | Nothing to show | YES: `validate-statutory-rows-file.mjs` would now refuse a placeholder rows-file rather than silently apply it (an improvement landed since 2026-09-05, per the workflow's own comment) | YES `docs/runbooks/FUELEU-STATUTORY-RUNBOOK.md` cited in the workflow | **NOT BUILT (data layer), unchanged** | Live SQL + file listing this session |
| `estimated_values` writer, `admissibleFor()` gate | `src/lib/propagation/admissible-for.ts`, `effective-confidence.mjs`, F31 | YES | N/A -- no writer for this table found reachable this session beyond the same shared `registerDerivedValue` path `derived_values` uses; no producer or method targets `estimated_values` specifically | **NO** [CONFIRMED live SQL] `estimated_values` = 0 rows, unchanged from 2026-09-05 | Layer-4 components exist (`StatutoryFigure`/`EstimatedFigure`) but no consuming page | F31 exists and is presumably run (`.discipline/fitness/functions/F31-derived-values-gate.mjs`, not independently re-run this session) | YES | **NOT BUILT (data layer), unchanged** | Live SQL this session |
| Corridors (`entities WHERE kind='corridor'`), `entity_scope` | `scripts/maintenance/seed-corridors.mjs`, wired in `maintenance.yml:221-226` | YES | YES [CONFIRMED live SQL] 4 corridor entities exist: 1 from 2026-09-03, 3 more all stamped `2026-09-05T20:34:31Z` (one batch) -- this is the T42/W4.2 "second corridor entity" work landing, confirmed live, not just claimed | YES [CONFIRMED] `entity_scope` = 8 rows (grew from 0 at the 2026-09-05 audit) | Not independently checked in-browser | Not independently located a dedicated fitness function this session | YES | **PARTIAL, improved** | Live SQL this session; refutes the 2026-09-05 snapshot (`entity_scope`=0) for today |
| `reroute_events` / `spec09-reroute` | `scripts/spec09/reroute-producer.mjs`, `maintenance.yml:343-354` | YES wired, explicit "ships 0 rows with no `arg`" design (a reviewed rows-file), not a bug | Dry-runnable; no apply with a real rows-file found this session | **NO** [CONFIRMED live SQL] `reroute_events` = 0, unchanged despite corridors now existing (corridors were the stated blocker; they are no longer the blocker -- the rows-file is) | Nothing to show | N/A (deterministic parser, self-gating) | YES maintenance.yml inline comment | **NOT BUILT (data layer)** | Live SQL this session |
| `grid_connection_queues` / `spec09-grid-queue` | `scripts/spec09/grid-queue-producer.mjs` | YES wired, same "0 rows with no arg" design | Dry-runnable only, no confirmed real rows-file apply this session | **NO** [CONFIRMED live SQL] 0 rows | Nothing to show | N/A | YES | **NOT BUILT (data layer)** | Live SQL this session |
| `oem_tech_roadmaps` / `spec09-oem-roadmap` | `scripts/spec09/oem-roadmap-producer.mjs` | YES wired, same design | Dry-runnable only | **NO** [CONFIRMED live SQL] 0 rows | Nothing to show | N/A | YES | **NOT BUILT (data layer)** | Live SQL this session |
| `carrier_compliance_pools` | plan W5.1 named it a "no reader today, add the reader or drop" decision | **N/A** [CONFIRMED live SQL] `select count(*) from carrier_compliance_pools` errors `relation ... does not exist` -- the table has been DROPPED since 2026-09-05 | N/A | N/A | N/A | N/A | N/A | **RETIRED (confirmed disposition executed)** | Live SQL error this session, added row beyond the plan's start list |
| Spec-09 CSV upload flow, six customer-data tables (`surcharge_audits`, `tce_data_quality`, `auxiliary_energy_profiles`, `eudr_plot_claims`, `custody_chains`, `indexation_clauses`) | `src/app/api/workspace/spec09-upload/{route.ts,logic.ts}`, `src/lib/spec09/csv-upload-contract.mjs` | YES route exists, is authenticated (per CLAUDE.md API policy, not re-verified line-by-line this session) | Not independently confirmed exercised by a real upload this session (no read-only way to prove a POST happened without querying application logs, out of scope) | **NO** [CONFIRMED live SQL] all six tables = 0 rows live | Would render an honest empty state today; not checked in-browser | Not independently located | YES `logic.ts` and `csv-upload-contract.mjs` headers | **BUILT-DORMANT (data layer)**, schema half fixed | Live SQL this session; see next row for the finding-11 re-check |
| Finding 11 re-check: does `logic.ts` still stamp an insert that would error live? | `src/app/api/workspace/spec09-upload/logic.ts:61` (`buildRowsForInsert` stamps `org_id` on every row for all six tables) | -- | -- | -- | -- | -- | -- | **[REFUTED]** as of today | [CONFIRMED live SQL] `surcharge_audits` now HAS a live `org_id` column (migration 311 applied, matching the 2026-09-05 README's own forward note). The insert `logic.ts` builds would no longer error on a missing column. The route's actual end-to-end behavior (RLS policy correctness under a real authenticated org) was still not exercised this session -- no real upload exists to read back. |

## Prior claims re-checked

1. **Finding 6, "DAG authorship reaches only 2 of the 9 producer families, zero edges from `market_series`."**
   `[REFUTED]` on the code-wiring half, `[CONFIRMED]` on the live-data half. All three `market_series`
   producers (ecb-fx, eia-v2, eu-weekly-oil-bulletin) now call `authorMarketSeriesDeltaEdges` unconditionally
   after their guarded write (lane W4-DAG landed 2026-09-06, confirmed by reading the code and by the passing
   `producer-edge-authorship.test.mjs`), so the code-level gap the finding named is closed. But the live
   count still matches the finding's spirit exactly: `derivation_edges` has 0 `market_series` rows even
   though `market_series` has 2,747 rows and the ecb-fx producer ran as recently as 2026-09-16. This is now a
   BUILT-DORMANT-shaped gap on one specific producer family rather than an unwired one, which is worse in one
   sense (a real run produced zero edges with no visible error) and better in another (the fix, once found,
   is one producer family, not three).

2. **Finding 7, `statutory_computations` and `estimated_values` at 0 rows.** `[CONFIRMED]`, unchanged. Both
   tables are still 0 rows live. The rows-file gap named in the 2026-09-05 audit (fixture at the wrong path,
   self-labeled non-production) is unchanged; the only forward motion is a new validator
   (`validate-statutory-rows-file.mjs`) that would refuse a placeholder file rather than silently apply it --
   a safety improvement, not progress toward the 0-row count.

3. **Finding 11, spec-09 CSV upload route would error live (missing `org_id` on `surcharge_audits`).**
   `[REFUTED]`, confirmed via live SQL this session that `surcharge_audits.org_id` exists (migration 311
   applied), matching what the 2026-09-05 README already flagged as fixed. This audit adds independent
   confirmation the schema fix is live, not merely claimed.

4. **W3-W4 file, corridor seeding row ("PARTIAL... `reroute_events`=0... corridor-seeding mechanism exists
   and produced its one designed example but has not been extended").** `[REFUTED]` on the "not extended"
   half: 3 more corridor entities landed 2026-09-05 (same batch), `entity_scope` grew from 0 to 8. `reroute_events`
   remains 0, `[CONFIRMED]` unchanged, but the blocker per the maintenance.yml comment is a rows-file, not the
   corridor count anymore.

5. **W3-W4 file, `backfill-derivation-edges.mjs` row ("PARTIAL, in progress as designed... no evidence a
   second confirming run has happened").** `[CONFIRMED]`, still true and now measured across a longer window:
   `derivation_edges` is unchanged at 24 across 13 days and 4 further real drain runs. The script's own
   documented retirement condition (two consecutive zero-candidate runs) cannot fire because it has not been
   re-dispatched at all since the one run that produced the 6->24 jump.

6. **loop-harness file, "producers -> propagation-drain chain... PARTIAL... DAG-authorship for `market_series`
   ... zero edges from it today."** `[CONFIRMED]`, and this audit adds the harness-run-by-run detail: of 8
   real runs, only 1 ever invalidated or recomputed anything, and that one predates the market_series wiring
   fix. Every run since the market_series fix landed (006, 007, 008) still shows 0 invalidated / 0 recomputed.

## What the operator must rule on

- **`market_series` DAG authorship: debug why a wired, unconditionally-called path produces 0 live edges.**
  The code is gated, tested, and calls `authorEdges` after every producer's guarded write, yet
  `derivation_edges` shows zero `market_series` rows after a fresh producer run (ecb-fx, 2026-09-16). This
  needs a traced/logged apply run to see which outcome bucket (`insufficientHistory`, `unitMismatch`,
  `unknownMethod`, `refused`, `errored`) every call is landing in -- a write this audit cannot perform.
  Recommendation: authorize one bounded, logged apply of one market producer with the existing
  `authorMarketSeriesDeltaEdges` counts object printed, before spending more on population.
- **Re-dispatch `backfill-derivation-edges.mjs` with `backfill_and_statutory=true`.** It has not run since
  2026-09-05 despite being wired as a manual-only opt-in on every `propagation-drain.yml` dispatch; the drain
  has had nothing new to recompute in 8 real runs partly because of this. Recommendation: finish (one
  dispatch, bounded, matches its own documented retirement rule).
- **`statutory_computations` / FuelEU Annex IV: finish or drop.** The writer, the isolation-layer schema, and
  now a validator all exist; only a reviewed ship-year rows-file is missing, 15 days after the plan's own
  claimed T38/T42 landing date. Recommendation: the plan's own W4.2 already calls this out; needs the
  reviewed rows-file as a decision-ready deliverable, not further code.
- **`estimated_values`: no writer found this session.** Recommendation: decide finish (build the first writer
  behind `admissibleFor()`) or drop the table + isolation layer; currently indistinguishable from dead code
  by a read-only pass.
- **`reroute_events` / `grid_connection_queues` / `oem_tech_roadmaps`: same "no writer has ever supplied
  input" shape as statutory.** Corridors are no longer the blocker for reroute; recommendation: same as W4.2,
  needs a reviewed rows-file per table, or an explicit drop-with-reason if none is coming.
- **`carrier_compliance_pools` dropped.** Recommendation: keep-with-reason -- this looks like the correct
  disposition already executed; no further action, note it closed in the register.

## Counts

Verdict totals across this table's 15 scored rows (the "Finding 11 re-check" row is a re-check note, not a
separate scored component, so it is excluded from these totals):

- COMPLETE: 2 (emission_factors DAG authorship; propagation outbox)
- PARTIAL: 6 (market_series DAG authorship; regional_data_facts DAG authorship; one-time historical bridge;
  governed drain; notices; corridors/entity_scope)
- BUILT-DORMANT: 1 (spec-09 CSV upload flow, data layer)
- NOT BUILT: 5 (statutory_computations writer; estimated_values writer; reroute_events; grid_connection_queues;
  oem_tech_roadmaps)
- RETIRED / N/A (added beyond the plan's start list): 1 (carrier_compliance_pools, confirmed dropped)
- COULD NOT VERIFY: 0

Rows added beyond the plan's start list: 2 (`carrier_compliance_pools` disposition check; the finding-11
re-check row, kept separate from the scored table per rule 14's corollary that a refuted finding is corrected
in place, not silently dropped).
