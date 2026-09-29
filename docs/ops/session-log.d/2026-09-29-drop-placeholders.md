# 2026-09-29, Lane DROP-PLACEHOLDERS

## Ruling (verbatim, operator, 2026-09-29)

> There has never been anyone in community so my guess is they are fake place holders. Remove them completely and ease them

Disposition: **erase**. Scope: `case_studies`, `case_study_endorsements`, `taxonomy_nodes` (created in `fsi-app/supabase/migrations/007_community_layer.sql`), plus everything that exists only to serve them.

## Investigation (SELECT-only; live project kwrsbpiseruzbfwjpvsp)

### Row counts and content summary

- `case_studies`: **6 rows** `[CONFIRMED]` (live SQL, 2026-09-29). All 6 rows' `created_at = 2026-04-05T02:54:20.619096+00:00`, an identical bulk-seed timestamp, not an organic submission pattern, and `submitter_id IS NULL` on every row. Content matches `supabase/seed/seed-community.sql` verbatim (Hauser & Wirth, White Cube, Coldplay, Massive Attack, Christie's DNA Fine Art, MIT ClimateMachine). Two rows carry an inline authoring comment in the seed file itself: `-- d5 (2026-07-11): reset from hand-set 'peer_validated' (0 endorsements, unearned; DB-4 F7)`, i.e. a prior dispatch already flagged these as fabricated/unearned validation status. `peer_validation_count = 0` on all 6. This confirms the operator's "fake placeholder" read: seeded demo content, zero real submitters, zero organic endorsements. `[CONFIRMED]`
- `case_study_endorsements`: **0 rows** `[CONFIRMED]`.
- `taxonomy_nodes`: **38 rows** `[CONFIRMED]`, all `created_at = 2026-04-05T02:54:20.619096+00:00`, all from the same seed file (`supabase/seed/seed-community.sql` lines 13 to 62). A flat top-level taxonomy (regulation/technology/region/transport_mode/industry categories) with no leaf usage recorded anywhere.

### FKs into/out of the three tables

- `case_study_endorsements.case_study_id` references `case_studies.id` (ON DELETE CASCADE); `case_study_endorsements.endorser_id` references `profiles.id`.
- `case_studies.submitter_id` references `profiles.id` (outbound only, not a dependent).
- `taxonomy_nodes.parent_id` references `taxonomy_nodes.id` (self-referencing only).
- No other live table FKs into `case_studies` or `taxonomy_nodes`. `[CONFIRMED]` via `pg_constraint` probe, 2026-09-29. The only other historical consumer of `taxonomy_nodes` was `vendor_technologies.taxonomy_node_id`, but the entire vendor table family (`vendors`, `vendor_endorsements`, `vendor_regulations`, `vendor_technologies`) was already dropped by migration 181 (2026-07-11, Wave-alpha Track E e3, all 0 rows at the time). Confirmed live: none of the four vendor tables exist. `[CONFIRMED]`
- `case_studies.linked_thread_id` (the one other inbound-adjacent column, a FK to `forum_threads`) was already dropped by migration 192 (2026-07-11, Wave-alpha Track D d4), which also dropped `forum_threads`, `forum_sections`, `forum_replies` outright. `[CONFIRMED]` live: `case_studies` currently has no `linked_thread_id` column; `forum_threads`/`forum_sections`/`forum_replies` do not exist in `information_schema.tables`.

### Views, functions, triggers, RLS referencing the three tables

- Triggers: `case_studies_updated_at` (fn `update_updated_at()`, shared, stays), `case_study_validation_count_trigger` on `case_study_endorsements` (fn `update_case_study_validation_count()`, dedicated, orphaned once the table drops; migration 334 drops it explicitly).
- Functions: only `update_case_study_validation_count()` references `case_stud*` in its body (`pg_proc.prosrc` ILIKE probe, `prokind='f'` filtered, 2026-09-29). No views reference either table (`pg_views` ILIKE probe returned zero rows).
- RLS policies: `case_studies_read/insert/update` (3), `case_endorsements_read/insert` (2), `taxonomy_read/write/update` (3), all removed automatically by `DROP TABLE`.
- `forum_threads.thread_type` CHECK included `'case_study_link'` as an allowed value, but `forum_threads` no longer exists (dropped by migration 192, above): **zero live usage, no action needed in migration 334.** `[CONFIRMED]`. `community_thread_entities.entity_kind` (the mig-028+ conversation layer's own thread-entity-linking enum) was checked as a possible successor mechanism: its enum values are `corridor, node, jurisdiction, organisation, asset, instrument, obligation, method, technology, signpost, person`; no `case_study` value exists, and its `entity_id` FKs to a separate `entities` table, not `case_studies`. Unrelated. `[CONFIRMED]`

### `intelligence_items.linked_case_study_ids`

- **0 rows with non-empty values** `[CONFIRMED]` (`WHERE linked_case_study_ids IS NOT NULL AND linked_case_study_ids <> '{}'` returns 0).
- One live reader found: `public._workspace_active_items(p_org_id)`, the base function behind the entire customer read-gate RPC family, includes `linked_case_study_ids` in its `RETURNS TABLE` signature and its `SELECT` list (verified via `pg_get_functiondef`, `prokind='f'` filtered ILIKE probe, the only match). `[CONFIRMED]`
- Its 9 downstream wrapper RPCs (`get_workspace_intelligence_listings`, `get_workspace_intelligence_dashboard`, `get_operations_items`, `get_research_items`, `get_technology_items`, `get_workspace_due_next`, `get_workspace_intelligence_aggregates`, `get_workspace_intelligence_aggregates_scoped`, `get_workspace_recent_changes`) were each individually inspected via `pg_get_functiondef`; each names its own explicit column list when calling `_workspace_active_items(...)` (e.g. `get_workspace_intelligence_listings` selects `ii.id, ii.legacy_id, ii.title, ...` etc., never `wai.*` and never `linked_case_study_ids`). **None require a code change.** `[CONFIRMED]`
- Migration 334 therefore drops and recreates `_workspace_active_items` with `linked_case_study_ids` removed from both the return signature and the SELECT list (a shrinking column list requires DROP + CREATE, not CREATE OR REPLACE), then drops the column.

### Forum `thread_type = 'case_study_link'` usage

Already covered above: the entire `forum_threads` table (which carried `thread_type`) was dropped by migration 192 on 2026-07-11. Zero live usage; no action in migration 334.

## Code references (grep over src/, scripts/, supabase/functions, types, fixtures, tests, docs/specs)

- **No functional consumers found anywhere.** Zero API routes, zero components, zero `src/types/*.ts` generated-type references, zero `supabase/functions` references to `case_studies`, `case_study_endorsements`, or `taxonomy_nodes`. `CaseStud`/`Taxonomy` string hits in `src/` are all unrelated (EU Taxonomy Regulation content, generic "taxonomy" section headers), verified by reading each hit in context.
- **Removed** (2 files, both anticipatory of migration 334's application, since coordinator approval gates the DDL itself):
  1. `fsi-app/src/app/api/search/route.npmtest.mjs`, the `LIVE_INTELLIGENCE_ITEMS_COLUMNS` fixture set (a hardcoded mirror of the live `intelligence_items` column list used to validate the search re-fetch's `.select()` against real columns) carried `linked_case_study_ids`. Removed the entry; it does not affect any assertion (the route's actual `.select()` never named that column).
  2. `fsi-app/supabase/seed/seed-community.sql`, removed the `taxonomy_nodes` (38-row) and `case_studies` (6-row) `INSERT` blocks. Left a dated comment explaining the removal (mirrors the existing 2026-07-11 forum-layer removal comment already in the file). Re-running this seed against a dropped-table schema would otherwise fail outright.
- **Left alone, inert, out of scope:** `fsi-app/scripts/_diag/_csrd-snapshot.json`, a diagnostic data snapshot of one `intelligence_items` row that happens to include `"linked_case_study_ids": []` as one of many columns. Not code, not re-executed, no functional dependency; flagged here for completeness only.
- `fsi-app/docs/inventories/db-check-constraints.json` (a generated inventory, already stale; it still lists the mig-192-dropped `forum_threads.thread_type` CHECK, so it predates that drop too) was **not** hand-edited; it should be regenerated after migration 334 is actually applied, same as it should have been after migration 192.

## Snapshot

Full row export (JSON) at `fsi-app/scripts/tmp/drop-placeholders-2026-09-29/{case_studies,case_study_endorsements,taxonomy_nodes}.json`, gitignored, not committed, reproducible from git history of `supabase/seed/seed-community.sql`.

## Migration drafted, NOT applied

`fsi-app/supabase/migrations/334_drop_placeholder_community_layer.sql`, author-only, awaiting coordinator/operator DDL approval per lane instructions. Drops, in order: `case_study_endorsements`, then `case_studies`, then `taxonomy_nodes`, then the orphaned trigger fn `update_case_study_validation_count()`, then redefines `_workspace_active_items()` without `linked_case_study_ids`, then drops `intelligence_items.linked_case_study_ids`. Carries a post-check `DO` block asserting every dropped object is gone.

## OBS / DP loop closure (sprint-followups-discipline)

This dispatch is a scoped, single-defect-shaped DB schema removal with no design or implementation surface (no UI, no new component, no sprint-phase feature). Per the skill's own "Do NOT apply" list ("Hotfix dispatches scoped to a single defect... The hotfix carries no design surface to attach OBS coverage to"), the OBS coverage table / DP compliance section discipline does not apply here. No new OBS surfaced during this dispatch.

## Value Delivery Check (caros-ledge-platform-intent)

This dispatch's work does NOT directly advance customer-facing value delivery. It is a data-hygiene / schema-cleanup dispatch removing fabricated placeholder Community content (6 seeded case studies, 38 seeded taxonomy nodes, 0 real submitters) per explicit operator ruling. It does not touch Community's real functional surfaces (working groups, forums, promote-to-public) and does not close any item from the Customer-Facing Value Gap list. Community's real expansion work (item 5 in that list) remains Sprint 2+ scope, unaffected by this lane.

Dual-posture: not applicable; this is an erase-fabricated-data action, not a coverage decision, so there is no current-vs-expansion narrowing.

## STOP-AND-ASK check

No real (non-placeholder) data and no live customer-facing consumer turned up. The only "consumer" found (`_workspace_active_items`'s column threading) is dead plumbing (always-empty column, no UI ever renders it) mechanically resolved within migration 334 itself, not a scope-changing discovery requiring a halt.
