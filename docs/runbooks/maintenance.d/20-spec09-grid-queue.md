## 20. `spec09-grid-queue`

**New this runbook, Lane SPEC09-A, 2026-09-05.** Written from `scripts/spec09/grid-queue-producer.mjs`'s
own header.

**Purpose**: `grid_connection_queues` (migration 297, spec 09 section ?) producer - DSO/TSO connection-queue
months by capacity band. **$0 SOURCING STATUS: GAP, none confirmed this lane** - see
`scripts/spec09/SOURCES.md`'s `grid_connection_queues` row: UK National Grid ESO's TEC register and ENA's
Distribution Future Energy Scenarios describe GENERATION connection queues, not the DEMAND-side queue
this table needs, and no $0 structured feed for the demand side was confirmed. Ships 0 rows from any live
fetch (there is no live fetch - this producer has never had one; it is rows-file-only from its first
version).

**Upstream**: `scripts/spec09/grid-queue-producer.mjs`'s own `parseGridQueueRow(row, index, jurisdictions,
deps)` (pure per-row validation + resolution, unit-tested against fixtures) + `main({mode, arg}, deps)`.
Shares `scripts/spec09/lib/rows-file.mjs` with `spec09-reroute` and `spec09-oem-roadmap`
(`loadRowsFile`, `requireCitation`, `registerCitedSource`, `resolveEntityByName` - one module, three
callers, no copies).

**Ruling**: none - the gap is a sourcing gap (no confirmed $0 feed), not a ruling-gated decision.

**Dispatch**: `arg` is a rows-file JSON path. Each row requires `jurisdiction_name` / `dso_name` /
`capacity_band_mw` / `as_of`, at least one of the p10/p50/p90 percentile fields (non-negative, and
`p90 >= p50` when both present - violated ordering is a **refusal**, not a throw, since it can arise from
a genuinely mis-transcribed source figure rather than a producer bug), and a valid `obs_status` (the
16-code SDMX set, default `'A'`). `jurisdiction_id` resolves against the live
`entities(kind='jurisdiction')` spine (63 rows live, e.g. `GB`) by exact `canonical_name` - never minted;
an unresolved name is a refusal. The row's `citation` registers through the same `registerCitedSource`
path as `spec09-reroute`. `grid_connection_queues` carries no `source_id` column, so a row's citation
gates whether it is written at all but is not itself stored as a foreign key on the row.
`mode=apply` calls `guardedInsertMany("grid_connection_queues", [...], {skill, reason})` once per row.

**Artifact / read back**: `summary.json`'s `rows_total` / `rows_written` / `refusals`. Confirm against
`SELECT count(*) FROM grid_connection_queues` and `SELECT id, canonical_name FROM entities WHERE
kind='jurisdiction'`.

**No reviewed rows-file exists yet.** `scripts/spec09/grid-queue-rows-file.example.json` is an unreviewed
DRAFT template only. `scripts/spec09/SOURCES.md`'s `grid_connection_queues` row names the candidate lead
for the browser-lane worklist ([HYPOTHESIS], not confirmed this session): Ofgem's Connections Reform DNO
Connections Register / ENA's Open Data Portal - and specifically whether either actually publishes a
DEMAND-side (not generation-side) queue-months table at this granularity, which is the open question a
browser-capable lane must resolve before any real rows-file can be written.

---

