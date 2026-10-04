## 4a. `source-type-backfill`

**Purpose**: populate `sources.source_type` (migration 288, applied live 2026-09-02) from the taxonomy
classifier, so `coverage-gaps.ts` reads the column instead of re-deriving types from regexes on every
cache miss.

**Upstream**: `fsi-app/scripts/sources/backfill-source-type.mjs` (`main`, `planBackfill`; Lane HYG-2),
which imports `src/lib/sources/source-type-taxonomy.mjs`'s `classifySourceType`. The wrapper
(`scripts/maintenance/source-type-backfill.mjs`, added by the coordinator after the Wave 1 train) adapts
it to the runtime's summary shape and reads back the classified count.

**Ruling**: none. The taxonomy is the fix the STOPGAP itself named
(`docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md`); the classifier only fills `NULL` rows.

**Dispatch**: `mode=dry` prints the distribution, `to_write`, and the unclassifiable remainder (only
`environmental_body` and `legislature` are classifiable today, the STOPGAP's own regexes; everything
else stays `NULL`, which means "not yet classified", never "zero types"). `mode=apply` writes through
`guardedUpdateByIds` per type-combination group, `WHERE source_type IS NULL` re-checked per chunk.

**Artifact / read back**: `summary.json`'s `read_back.source_type_not_null_total` - confirm against
`SELECT count(*) FROM sources WHERE source_type IS NOT NULL`.

---

