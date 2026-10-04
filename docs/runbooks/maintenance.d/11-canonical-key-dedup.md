## 11. `canonical-key-dedup`

**Purpose**: enforce invariant EP-11 (ADR-021) by keeping the single live verified row per
`canonical_instrument_key`, archiving the others so they stop blocking re-mint.

**The defect** [CONFIRMED, live SQL, 2026-09-04]: Two `canonical_instrument_key` values
(`32015R0757`, `32023R1804`) each carry TWO live (is_archived=false) intelligence_items rows, violating
EP-11 ("migration 200's partial unique index `uq_intelligence_items_canonical_key_verified_live` plus
invariant EP-11 forbids two verified, non-archived items sharing a key"). Measured:
- `32015R0757`: 2 live rows (1 verified, 1 quarantined). Verified created 2026-09-01.
- `32023R1804`: 2 live rows (1 verified, 1 quarantined). Verified created 2026-05-05. 1 additional archived
  row (duplicate_of_verified).
- Inconsistent stamps (archive_reason set, is_archived=false): 1 row (ff95b385, archive_reason='duplicate_instrument').

**Keep rule**: For each canonical key group, keep the single live verified row (exactly one verified per
live group in this population) and archive the others. Failure modes:
- Zero verified in a group → REFUSE to decide (report, no archive).
- Multiple verified in a group → REFUSE to decide (report, no archive; violates the index already).

Both are reported in summary but NOT archived. This population shows exactly one verified per group, so
both failure modes are PLAUSIBLE but not exercised here.

**Archive mechanism, and why**: `archive_reason='duplicate_of_verified'` via `guardedUpdateByIds`, matching
`db.mjs`'s own `archivePatch()` shape (`is_archived=true`, `provenance_status→'unverified'`). This is a
NEW vocabulary value, not one of `db.mjs`'s five `SOURCEY_ARCHIVE_REASONS` - rule 019 and migration 135's
`_guard_source_archive` trigger are both scoped to exactly those five and never fire here, so the raw
guarded-archive path is sanctioned.

**The re-mint-blocked-by-its-own-archived-twin defect, and this step's fix**: same as record-hollow-sweep
above - `apply-mint-batch.mjs`'s `checkM4` and `export-census-rows.mjs`'s `buildHeldKeyIndex` both index
archived rows as blockers. The fix is DATA, in the same archive write: the patch additionally sets
`canonical_instrument_key=null`, `instrument_identifier=null`, `source_url=''`. The row then drops out of
`buildHeldKeyIndex` and the re-mint is admitted on the next population pass.

**Inconsistent archive_reason clearing**: One live keeper (ff95b385) carries `archive_reason='duplicate_instrument'`
while is_archived=false. A live row must not carry an archive reason (it misreports itself as the duplicate to
every reader of `archive_reason`), so the apply clears it on any keeper whose stamp is non-null, records the
prior value in `summary.keepers[].before` with a per-keeper `restore_sql`, and writes nothing for a keeper
whose `archive_reason` is already null.

**census_worklist side** [CONFIRMED, dry run 2026-09-04]: Both duplicate canonical keys have no matching
`census_worklist` rows (no `document_url` match). No census_worklist writes needed.

**Dispatch**: `mode=dry` reports `counts.canonical_keys_with_duplicates`, `duplicate_groups_with_exactly_one_verified`,
`duplicate_groups_with_zero_verified`, `duplicate_groups_with_multiple_verified`, `target_total`, and
`keeper_ids`/`target_ids`; writes nothing. `mode=apply` (no `--arg` required) archives every target and
clears any non-null `archive_reason` on a keeper (recorded in `summary.keepers[]` with `restore_sql`), then reads
back. Nothing is deleted - claims, sections, and edges stay attached.

**Reversal**: two paths, same as record-hollow-sweep above:
- **Durable, artifact-based** (preferred): `summary.json`'s `per_item[].restore_sql`.
- **Best-effort, same-disk-only**: `mode=apply, arg=restore:<id,id,...>`.

**Artifact / read back**: `summary.json`'s `counts` (`canonical_keys_with_duplicates`,
`duplicate_groups_with_exactly_one_verified`, `target_total`, `keepers_total`, `keepers_updated`),
`per_item` (before/after + `restore_sql` per archived item), `refusals` (groups with zero/multiple verified),
and `read_back` (`archived_duplicate_of_verified_total`, `not_confirmed_archived_ids`). Confirm against
`SELECT count(*) FROM intelligence_items WHERE archive_reason='duplicate_of_verified'` and verify that
every keeper's `archive_reason` is null (`summary.keepers[]` lists the ones this run cleared and their prior stamp).

**Registration**: `docs/inventories/shared-dataset-ownership.md`'s `intelligence_items` and
`census_worklist` sections (this step writes both, added to the enforced JSON allowlist and the narrative
detail tables).

