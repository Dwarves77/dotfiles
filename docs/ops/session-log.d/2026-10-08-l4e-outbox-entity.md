# 2026-10-08 L4-E: market_series and regional_data_facts changes reach the items they move

Lane l4e-outbox-entity (remaining-build-register item 12, spec 08, CLAUDE.md rule 17, migration 352's one-entity-per-outbox-row rule). Fixtures only, nothing applied, no database, no network.

## The FK table, per table (read from the creating migrations 106, 267, 268, 283, 346; no later migration adds an entity column to either)

| Table | Foreign keys before this lane | Foreign key to entities before | Entity route built here |
|---|---|---|---|
| market_series | source_key to data_sources(source_key) | none | new column `entity_id text NULL REFERENCES entities(entity_id)`, outbox trigger `('id','entity_id')`: one event for the one FK |
| regional_data_facts | region_id to regions(id); source_id to sources(id); source_key to data_sources(source_key) | none, and `regions` has none | the region reaches N jurisdiction entities through `entity_refs` (ref_table regions, role jurisdiction, migration 283): new trigger function emits one event per entity |

The first report of this lane (STOP: neither table has an FK to entities) was ruled on by the coordinator; the two routes above are that ruling.

## Accomplished (each item confirmed by a test run in this worktree)

- Migration 373 (NOT applied): `market_series.entity_id` plus partial index and the `('id','entity_id')` trigger; `emit_propagation_events_for_region()` (invoker rights, `search_path = public, pg_temp`, EXECUTE revoked from PUBLIC) attached to `regional_data_facts` as `('id','region_id')`. `emit_propagation_event()` is redefined as 352's body plus one leg at the top (a test compares the two bodies and passes only when removing the leg gives 352's body): a transaction-local marker `app.outbox_backfill_writer` equal to the table name skips emission. The sanctioned declarer is the definer function `backfill_market_series_entity(p_entity_id, p_ids)` (search_path pinned with pg_temp, EXECUTE revoked from PUBLIC, anon and authenticated, granted to service_role; F70 reports 0 violations): refuses an entity with no entities row, stamps only NULL rows, sets the marker, clears it, returns the count. Self-check on the real tables in a sub-transaction rolled back by a sentinel; 11 static tests in `373_outbox_entity_for_series_and_facts.test.mjs`, and five mutations of the SQL (role filter, ordering, revoke, market_series argument, region-move union) each turned the static test red.
- Producer registry: optional `entity_id` per entry, validated for shape only (`assertEntityId`, never against a table); `buildCommands` hands it to the producer child (not the fetch stage) as `PRODUCER_ENTITY_ID`; `run-registered.mjs` strips an ambient `PRODUCER_ENTITY_ID` so an entry without one never inherits another's. Set on `eu-weekly-oil-bulletin` (EU jurisdiction entity) and `eia-v2-petroleum-spot` (US); `ecb-fx` and `sbti-target-dashboard` carry none. The ids are `entityId("jurisdiction","EU"|"US")`, the same builder `backfill-entities.mjs` mints with; a test pins the registry values to it.
- `scripts/migrations/data/backfill-market-series-entity.mjs` (dry by default, `--apply`, not run): maps registry entry to series_key prefix through the producer script both registries name; apply calls the sanctioned RPC in chunks of 500, so it writes no outbox rows; reports counts.
- `src/lib/market/write-market-series.mjs` (`planMarketSeriesUpsert`, the one site every market_series producer passes through; write set expanded by the coordinator): `entityIdFromEnv()` reads `PRODUCER_ENTITY_ID` (malformed fails loud); a created row is stamped unless it names its own entity; an update patch carries the entity only when the existing row was read with `entity_id` NULL, so a set value is never overwritten and a producer that does not read the column never touches it. No producer script changed. `PRODUCER_ENTITY_ID_ENV` is defined there; `load-registry.mjs` imports and re-exports it.
- `questions-on-change.test.mjs`: the emitting-table detector regex now also matches `emit_propagation_events_for_region`, with a test that migration 373's two attachments are seen and mapped. `questions-on-change.mjs` is unchanged: it already maps both tables to `value_revised`.
- `docs/inventories/migrations.md` regenerated with its generator.

## Red then green

- `load-registry.test.mjs`: against master's loader the file fails to load (no `PRODUCER_ENTITY_ID_ENV` export); with the change 27 of 27 pass.
- `run-registered.test.mjs`: the ambient-entity test fails against master's runner, passes with the change (10 of 10).
- `questions-on-change.test.mjs`: the new detector test fails with the old regex, passes with the widened one (20 of 20).
- `backfill-market-series-entity.test.mjs`: fails on `ERR_MODULE_NOT_FOUND` without the script, 9 of 9 pass with it (including the RPC updater: chunking, entity passed, error thrown).
- `market-write-market-series.test.mjs`: against master's planner the file fails to load (no `PRODUCER_ENTITY_ID_ENV` export); with the change 12 of 12 pass.
- Migration 373's static test: 12 tests; four further mutations (marker leg not table-scoped, backfill overwrites, marker not cleared, grant removed) each turned it red.

## Read and reused

Read: CLAUDE.md, lane-common-contract, COMMON and the brief, the register row and item 12, migrations 106, 267, 268, 282, 283, 284, 285, 352 and 352's test, `questions-on-change.mjs` and its test, `drain.ts`, `load-registry.mjs`, `run-registered.mjs`, `producer-summary.mjs`, `write-market-series.mjs`, `series-registry.mjs`, `entity-id.mjs`, `entity-id-shape.mjs`, `entity-plan.mjs`, `backfill-entities.mjs`, `scripts/lib/db.mjs` (`guardedUpdateByIds`), F70.
Reused: migration 352's optional-argument trigger form and its self-check shape, 284's classification and INSERT column list (a test compares them), `assertEntityId`, `entityId`, `guardedUpdateByIds`, `loadLocalEnvFile`, `isMainModule`, `MARKET_SERIES_PRODUCERS`.

## Decisions

- The attachment is `('id','region_id')`, not the ruling's `('region_id')`: the primary-key column stays first, as in every other attachment.
- A region with no jurisdiction ref emits no event (ruling). Confirmed this loses no invalidation: regional_data_facts rows carry no derivation edges (producers record `edges_authored: null`, ADR-043) and the drain's invalidation is keyed by (table, pk) only.
- A fact moved between regions emits for the union of both regions' entities.
- The ruling said the backfill maps by registry entry name equal to the series_key prefix. That does not hold (`eu-weekly-oil-bulletin` writes `eu-oil-bulletin:`; `eia-v2-petroleum-spot` writes `eia-v2:`), so the join goes through the producer script path both registries carry.
- `eia-v2-petroleum-spot` carries the US entity per the ruling and is left as ruled; the series set includes Brent, which is a global benchmark, so a Brent move is attributed to the US jurisdiction entity.
- Backfill is silent by ruling (writer-marker idiom of migrations 201 and 354). `emit_propagation_event()` had no marker check, so 373 adds it; the marker names the table so it silences only that table's trigger and only inside the declaring transaction. The region fan-out function has no marker leg (no regional_data_facts backfill exists).

## What is NOT done

- Migration 373 and the backfill are not applied or run. The backfill needs 373 applied first (it calls the RPC).
- The self-check legs (backfill silent, producer write still emits, other-table marker silences nothing, unknown entity refused) are written but have never run against a Postgres: no database access in this lane.
