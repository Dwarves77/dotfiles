## 5. `census-off-vertical`

**Purpose**: what to do with the 1,676 `census_worklist` rows the relevance screen
(`fsi-app/scripts/mint/lib/screen-verdict.mjs`, via `export-census-rows.mjs`'s `partitionByScreen` +
`loadReviewedVerdicts`, imported unmodified) calls off-vertical.

**Ruling**: R-A (finish-plan-2026-09-02 section 1, **open**) - archive (reversible) or park.

**Dispatch**:
- `mode=dry` - reads every `dryrun_disposition='would_mint', is_archived=false` row, partitions by the
  shared screen, and counts `on_vertical` / `off_vertical` / `ambiguous`, plus a titled sample of up to 20
  rows per off_vertical/ambiguous class (`summary.sample_off_vertical` / `summary.sample_ambiguous`) - the
  list the coordinator puts in front of the operator for R-A's ruling.
- `mode=apply, arg=park` - no-op. The export gate (`export-census-rows.mjs`'s own `partitionByScreen`)
  already withholds these rows from minting; "park" is the status quo.
- `mode=apply, arg=archive` - **RUNNABLE as of migration 308** (lane RULINGS-EXEC, 2026-09-05):
  `census_worklist` now carries `is_archived`/`archive_reason` (intelligence_items' own pair, verbatim).
  Archives every `off_vertical` row via `guardedUpdateByIds` + `db.mjs`'s table-generic
  `archivePatch("census_worklist", "off_vertical")` - the same helper `screen-reconcile-records.mjs`
  already uses for R-B's live-record side. Idempotent (`applyMatch` re-checks
  `dryrun_disposition='would_mint' AND is_archived=false` per chunk). Every live reader of the would_mint
  pool (`export-census-rows.mjs`'s live read and its `selectCensusRows` pure filter) excludes
  `is_archived=true` rows in the same commit, so an archived row can never re-enter export.

**Re-measured live (lane RULINGS-EXEC, read-only SQL snapshot, project kwrsbpiseruzbfwjpvsp, 2026-09-05,
fed through the ACTUAL `main()` above unmodified, not a re-derivation)**: `would_mint_total` 3461,
`on_vertical` 1550, **`off_vertical` 1655**, `ambiguous` 256 - the 1,655 matches the plan's own figure
exactly. R-A remains an open ruling (archive vs. park); this session did not decide it, only made the
archive path real and produced the lists the ruling needs. Coordinator dispatch once R-A is ruled
"archive": `maintenance`, `mode=dry, step=census-off-vertical` (re-confirm the split immediately before
applying - the would_mint pool moves between dispatches), then `mode=apply, step=census-off-vertical,
arg=archive` - expected `read_back.archived` = the dry run's `off_vertical` count at apply time.

**Artifact / read back**: `summary.json`'s `counts` (dry) or `read_back.{would_archive,archived}` (apply,
`arg=archive`) - confirm against
`SELECT count(*) FROM census_worklist WHERE is_archived AND archive_reason = 'off_vertical'`.

---

