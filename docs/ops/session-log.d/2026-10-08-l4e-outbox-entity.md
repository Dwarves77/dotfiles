# 2026-10-08 L4-E: market_series and regional_data_facts changes reach the items they move

Lane l4e-outbox-entity (remaining-build-register item 12, spec 08, CLAUDE.md rule 17, migration 352's one-entity-per-outbox-row rule). Fixtures only, nothing applied, no database, no network.

## The FK table, per table (read from the creating migrations 106, 267, 268, 283, 346; no later migration adds an entity column to either)

| Table | Foreign keys before this lane | Foreign key to entities before | Entity route built here |
|---|---|---|---|
| market_series | source_key to data_sources(source_key) | none | new column `entity_id text NULL REFERENCES entities(entity_id)`, outbox trigger `('id','entity_id')`: one event for the one FK |
| regional_data_facts | region_id to regions(id); source_id to sources(id); source_key to data_sources(source_key) | none, and `regions` has none | the region reaches N jurisdiction entities through `entity_refs` (ref_table regions, role jurisdiction, migration 283): new trigger function emits one event per entity |

The first report of this lane (STOP: neither table has an FK to entities) was ruled on by the coordinator; the two routes above are that ruling.

## Accomplished (each item confirmed by a test run in this worktree)

- Migration 373 (NOT applied): `market_series.entity_id` plus partial index and the `('id','entity_id')` trigger; `emit_propagation_events_for_region()` (invoker rights, `search_path = public, pg_temp`, EXECUTE revoked from PUBLIC) attached to `regional_data_facts` as `('id','region_id')`. `emit_propagation_event()` is not redefined, so every other attachment is unchanged. Self-check on the real tables in a sub-transaction rolled back by a sentinel; 11 static tests in `373_outbox_entity_for_series_and_facts.test.mjs`, and five mutations of the SQL (role filter, ordering, revoke, market_series argument, region-move union) each turned the static test red.
- Producer registry: optional `entity_id` per entry, validated for shape only (`assertEntityId`, never against a table); `buildCommands` hands it to the producer child (not the fetch stage) as `PRODUCER_ENTITY_ID`; `run-registered.mjs` strips an ambient `PRODUCER_ENTITY_ID` so an entry without one never inherits another's. Set on `eu-weekly-oil-bulletin` (EU jurisdiction entity) and `eia-v2-petroleum-spot` (US); `ecb-fx` and `sbti-target-dashboard` carry none. The ids are `entityId("jurisdiction","EU"|"US")`, the same builder `backfill-entities.mjs` mints with; a test pins the registry values to it.
- `scripts/migrations/data/backfill-market-series-entity.mjs` (dry by default, `--apply`, not run): maps registry entry to series_key prefix through the producer script both registries name; stamps only rows whose entity_id is NULL; reports counts and `outbox_events_on_apply`.
- `questions-on-change.test.mjs`: the emitting-table detector regex now also matches `emit_propagation_events_for_region`, with a test that migration 373's two attachments are seen and mapped. `questions-on-change.mjs` is unchanged: it already maps both tables to `value_revised`.
- `docs/inventories/migrations.md` regenerated with its generator.

## Red then green

- `load-registry.test.mjs`: against master's loader the file fails to load (no `PRODUCER_ENTITY_ID_ENV` export); with the change 27 of 27 pass.
- `run-registered.test.mjs`: the ambient-entity test fails against master's runner, passes with the change (10 of 10).
- `questions-on-change.test.mjs`: the new detector test fails with the old regex, passes with the widened one (20 of 20).
- `backfill-market-series-entity.test.mjs`: fails on `ERR_MODULE_NOT_FOUND` without the script, 8 of 8 pass with it.

## Read and reused

Read: CLAUDE.md, lane-common-contract, COMMON and the brief, the register row and item 12, migrations 106, 267, 268, 282, 283, 284, 285, 352 and 352's test, `questions-on-change.mjs` and its test, `drain.ts`, `load-registry.mjs`, `run-registered.mjs`, `producer-summary.mjs`, `write-market-series.mjs`, `series-registry.mjs`, `entity-id.mjs`, `entity-id-shape.mjs`, `entity-plan.mjs`, `backfill-entities.mjs`, `scripts/lib/db.mjs` (`guardedUpdateByIds`), F70.
Reused: migration 352's optional-argument trigger form and its self-check shape, 284's classification and INSERT column list (a test compares them), `assertEntityId`, `entityId`, `guardedUpdateByIds`, `loadLocalEnvFile`, `isMainModule`, `MARKET_SERIES_PRODUCERS`.

## Decisions

- The attachment is `('id','region_id')`, not the ruling's `('region_id')`: the primary-key column stays first, as in every other attachment.
- A region with no jurisdiction ref emits no event (ruling). Confirmed this loses no invalidation: regional_data_facts rows carry no derivation edges (producers record `edges_authored: null`, ADR-043) and the drain's invalidation is keyed by (table, pk) only.
- A fact moved between regions emits for the union of both regions' entities.
- The ruling said the backfill maps by registry entry name equal to the series_key prefix. That does not hold (`eu-weekly-oil-bulletin` writes `eu-oil-bulletin:`; `eia-v2-petroleum-spot` writes `eia-v2:`), so the join goes through the producer script path both registries carry.
- `eia-v2-petroleum-spot` carries the US entity per the ruling; the series set includes Brent, which is a global benchmark.

## What is NOT done

- The producers' write path does not yet stamp `market_series.entity_id` from `PRODUCER_ENTITY_ID`. The one site is `planMarketSeriesUpsert` in `src/lib/market/write-market-series.mjs` (shared by all producers), which is outside the granted write set: NEEDS WRITE-SET EXPANSION for it and `src/__tests__/market-write-market-series.test.mjs`. Until then the env var is set by the runner and read by nothing.
- Migration 373 and the backfill are not applied or run. Applying the backfill writes one outbox row per stamped row (the dry report prints the count).
- Open question: setting `entity_id` on existing rows is a material change to the row, so the trigger emits an update event for each; no way to suppress that was found inside this write set.
