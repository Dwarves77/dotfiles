## 10. `record-hollow-sweep`

**Purpose**: take live verified record-grade intelligence_items off every customer surface when their
FACT claims are title-only, and route the document back through the mint so it returns with real facts.

**The defect** [CONFIRMED, live SQL, 2026-09-04]: 551 of 1,230 live verified (`is_archived=false`,
`provenance_status='verified'`) `item_grade='record'` items carry only the `[title]` FACT claim
(`record-facts.mjs`'s `extractIdentityFact`) - every required slot a GAP, or (201 of the 551) no FACT
claim at all. They render on every customer surface with an empty Summary. By `item_type`: `initiative`
390, `regulation` 158, `framework` 2, `guidance` 1. By source host: `eur-lex.europa.eu` 379,
`legislation.gov.uk` 149, `federalregister.gov` 21, `climate.ec.europa.eu` 1, `sdir.no` 1. Exact selection
SQL: the step's own `SELECTION_SQL` export (identical to what `planSelection` computes from two `readAll`
reads - no live SQL round trip at apply time).

**Series exemption (2026-10-04, lane S0)**: `planSelection` excludes any item whose `instrument_identifier`
is a key of the ratified series item map (`src/lib/market/series-item-map.mjs`, the `eu-oil-bulletin:*`
series; helper `isSeriesItem`). Those `market_signal` items are `item_grade='record'`, verified and live with
0 FACT claims by design: their substance is in `market_series`, not FACT claims, so an empty FACT array is
correct for them, not hollow. They are never selected and never archived. The exemption reads the map, so a
newly ratified series is exempt with no change to this step; a `market_signal` whose identifier is not in
the map is still selected under the rule above. The earlier warning against dispatching `--apply` because of
this exposure is retired. This replaces the 2026-09-05 flag from lane KIT-BACKFILL.

**Which flag hides an item from every customer surface** [CONFIRMED, read this session - not
`hidden_reason`, not `pipeline_stage`]: `is_archived` (+ `archive_reason`), the SAME gate
`db.mjs`'s own `archivePatch()` comment already names ("the customer read gate - `is_archived=false AND
provenance_status='verified'`"). Every direct route filter (`research/[slug]`, `operations/[slug]`,
`api/ask`, `api/admin/intersections`, `api/admin/forward-events`, `api/admin/b2-progress`,
`api/health/surfaces`) gates on `is_archived`; every RPC-routed list/dashboard/regulations/operations/
market/map surface reads `effective_archived = COALESCE(workspace_item_overrides.is_archived,
intelligence_items.is_archived)` (migrations 007/047/064/066/070/071/073/077/108/110/117/120/125/133/134/
164/269/272) and `src/lib/supabase-server.ts`'s `fetchWorkspaceResources` exposes only the non-archived
bucket as `resources`. `hidden_reason` (migration 062) has **zero readers anywhere in `src/`** - dead.
`pipeline_stage` is read only by an admin queue view and passed through for display, never a hide gate.

**Archive mechanism, and why**: `archive_reason='record_hollow'` via `guardedUpdateByIds`, matching
`db.mjs`'s own `archivePatch()` shape (`is_archived=true`, `provenance_status→'unverified'`). This is a
NEW vocabulary value, not one of `db.mjs`'s five `SOURCEY_ARCHIVE_REASONS` - rule 019 and migration 135's
`_guard_source_archive` trigger are both scoped to exactly those five (read in full) and never fire here,
so the raw guarded-archive path is sanctioned (no `reclassifyToSource` detour - this is not a
source-not-item reclassification).

**The re-mint-blocked-by-its-own-archived-twin defect, and this step's fix** [CONFIRMED, read in full]:
`apply-mint-batch.mjs`'s `checkM4`/`buildItemsIndex` and `export-census-rows.mjs`'s
`buildHeldKeyIndex`/`partitionExcludeHeldByKey` both index ARCHIVED rows as blockers too (their own
comments: "any row, archived or not, holding this exact key blocks the mint"; an archived holder is
recorded only as an informational `holder_archived`/`archived` flag - the block itself is identical).
Archiving the hollow item alone therefore does **nothing** to unblock its own re-mint: the row still
carries the same `canonical_instrument_key`/`source_url` a fresh payload for the SAME document will
derive. Neither governing file is in this lane's write set, so the fix is DATA, in the SAME archive write:
the patch additionally sets `canonical_instrument_key=null`, `instrument_identifier=null`,
`source_url=''`. Migration 200's `trg_set_canonical_instrument_key` (BEFORE INSERT OR UPDATE) only
overwrites `canonical_instrument_key` when it can re-derive a non-null value from those two inputs - with
both blanked in the same UPDATE, every derivation branch misses and the trigger leaves the explicit NULL
untouched. Post-write the row drops out of `buildHeldKeyIndex` (key-only) and can never match a real
`document_url` via `checkM4`'s URL fallback (`''` is the schema's own NOT-NULL-DEFAULT sentinel, migration
004) - the re-mint is admitted on the next population pass with zero code changes to either governing
file.

**census_worklist side** [CONFIRMED, live SQL]: every one of the 551 targets' matching row (by
`document_url = source_url`) is already `dryrun_disposition='would_mint'` (550 at
`enumeration_status='reconciled'`, 1 at `'dry_run_complete'` - `selectCensusRows` filters only on
`dryrun_disposition`, never `enumeration_status`, so a `'reconciled'` row is still a live export
candidate). So the disposition write is idempotent for the live population; the substantive write is
`notes`, **appended, never overwritten** (same convention `reopen-validation-holds.mjs`'s own header
documents for this table), naming this sweep so a re-selected `'reconciled'` row is traceable.

**Dispatch**: `mode=dry` reports `counts.target_total`/`by_item_type`/`by_source_host` and `target_ids`;
writes nothing. `mode=apply` (no `--arg` required) archives every target, returns its matching
`census_worklist` row(s) to `would_mint` with the sweep note, and reads back both. Nothing is deleted -
claims, sections, and edges stay attached to the archived row untouched.

**Reversal**: two paths, both because `scripts/_snapshots/` (db.mjs's own automatic prior-state snapshot)
is `.gitignore`'d and does not survive a separate GitHub Actions dispatch (fresh checkout each run) - see
the step's own file header for the full reasoning:
- **Durable, artifact-based** (preferred): `summary.json`'s `per_item[].restore_sql` - one self-contained
  `UPDATE intelligence_items SET is_archived=false, archive_reason=..., canonical_instrument_key=...,
  instrument_identifier=..., source_url=... WHERE id='...'` statement per archived item, from THIS run's
  own "before" values. Deliberately never sets `provenance_status` - the `set_provenance_status` trigger
  re-derives it from the row's own (unchanged) claims on the same UPDATE. **[HYPOTHESIS, untested this
  session]**: whether that re-derivation can flip back to `'verified'` from a plain service-role UPDATE,
  or needs the same bound-`reconciler` credential ADR-118 requires for a reconciliation flip of a
  pre-existing row, is not exercised here.
- **Best-effort, same-disk-only**: `mode=apply, arg=restore:<id,id,...>` (this same script) - scans
  `scripts/_snapshots/*.jsonl` for this sweep's own prior-state entries and replays them via
  `guardedUpdate`; refuses (never guesses) any id with no matching snapshot entry, listed in
  `missing_ids`.

**Artifact / read back**: `summary.json`'s `counts` (`target_total`, `by_item_type`, `by_source_host`,
`census_rows_matched`, `census_rows_returned`), `per_item` (before/after + `restore_sql` per archived
item), and `read_back` (`archived_record_hollow_total`, `not_confirmed_archived_ids`). Confirm against
`SELECT count(*) FROM intelligence_items WHERE archive_reason='record_hollow'` and
`SELECT id, dryrun_disposition, notes FROM census_worklist WHERE id = ANY(<matched row ids>)`.

**Registration**: `docs/inventories/shared-dataset-ownership.md`'s `intelligence_items` and
`census_worklist` sections (this step writes both, added to the enforced JSON allowlist and the narrative
detail tables).

