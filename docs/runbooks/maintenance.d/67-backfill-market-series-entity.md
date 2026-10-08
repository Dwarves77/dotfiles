## 67. `backfill-market-series-entity`

**New this runbook, lane L4-E, 2026-10-08 (CLAUDE.md rules 13 and 17; register item 12).** The data step that goes with
migration 373, which gave `market_series` an `entity_id` and made its outbox rows carry it.

**Purpose**: stamp `market_series.entity_id` on the rows that existed before the column. The entity comes from the
producer registry (`fsi-app/scripts/producers/registry/<name>.json`, optional `entity_id`): an entry that declares one owns
the series namespace its producer script writes. The join is by producer script path (the registry entry's `script`
equals `series-registry.mjs`'s `producerScript`, whose `keyPrefix` is the `series_key` prefix), not by entry name:
`eu-weekly-oil-bulletin` writes `eu-oil-bulletin:` (EU jurisdiction entity), `eia-v2-petroleum-spot` writes `eia-v2:`
(US). `ecb-fx` and `sbti-target-dashboard` declare none and are not touched. An entry with an entity whose script no
series-registry row names stops the run (exit 1) before any read or write.

**Only NULL rows**: a row that already has an `entity_id` is never written, so the step is idempotent and an existing
value (an administrator's included) is never overwritten. Producers stamp the rows they write from now on
(`planMarketSeriesUpsert` reads `PRODUCER_ENTITY_ID`, set by the registry runner); this step covers the rest.

**The writer marker**: apply calls the definer function `backfill_market_series_entity(p_entity_id, p_ids)` (migration
373), in chunks of 500 ids. The function refuses an entity id with no `entities` row, updates only NULL rows, and
declares the transaction-local marker `app.outbox_backfill_writer = 'market_series'` around the update, so the outbox
trigger writes no `propagation_events` row for a backfill (it is not a value change). The marker is cleared before the
function returns, so a producer write afterwards still emits. Nothing else sets the marker. EXECUTE is granted to
`service_role` only.

**Dry command**: Actions, Maintenance, `mode=dry`, `step=backfill-market-series-entity` (also runs under `step=all`,
dry). Locally from `fsi-app`: `node scripts/migrations/data/backfill-market-series-entity.mjs`. It prints the mappings,
the counts (`rows_read`, `already_set`, `no_mapping`, `to_update`), the per-entry counts and `outbox_rows_on_apply=0`.
Writes nothing.

**Apply command**: Actions, Maintenance, `mode=apply`, `step=backfill-market-series-entity` (apply always names one step).
Locally: `node scripts/migrations/data/backfill-market-series-entity.mjs --apply`. Run only after migration 373 is applied
(the function must exist) and, per the build-mode ruling, only when every build layer is complete. Dispatch only: the
workflow has no schedule and no `workflow_run` trigger.

**Read back and reversal**: the apply log line per entity (`N of M row(s) stamped`). Confirm with
`SELECT entity_id, count(*) FROM market_series GROUP BY 1` and
`SELECT count(*) FROM propagation_events WHERE table_name = 'market_series' AND occurred_at >= '<run start>'` (expect 0
from the backfill). Only NULL rows are ever written, so the exact set to reverse is `entity_id = <id>` over the series
prefix; no snapshot is needed.
