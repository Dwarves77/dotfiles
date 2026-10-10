# 2026-10-10, lane DEAD-1d (dead1d-orphan-fetchers-and-stale-fixtures): orphan supabase-server fetchers and stale search fixture

## Accomplished

- `fsi-app/src/app/api/search/route.npmtest.mjs`: LIVE_INTELLIGENCE_ITEMS_COLUMNS no longer lists the three columns migration 368 dropped (linked_forum_thread_ids, linked_regulation_ids, linked_vendor_ids; 368 is applied, APPLIED-MAP class identical). A new test derives the dropped-column set from the migration tree (last ADD or DROP COLUMN event per column wins) and fails when the fixture lists one. Red first (the three columns restored: 1 fail, the three named), green after (9 pass).
- `fsi-app/src/lib/supabase-server.ts`: nine fetchers with no caller deleted: fetchMapData, fetchAwaitingReview, fetchSurfaceCounts, fetchMarketIntelItems, fetchResearchItems, fetchOperationsItems, fetchTechnologyItems, fetchPublicResearchPipelineRows, fetchWorkspaceAggregatesScoped (215 lines). Comments that named them were reworded; the two runtime log labels of runSurfaceCountsRpc now name the RPC (get_surface_counts) instead of the deleted function; no test matches either string.

## Read and reused

- Read: COMMON.md, batch2.md (DEAD-1c, DEAD-1d), the dead1b "Method" section, the dead2-schema log, supabase-server.ts around each definition, data.ts call sites by grep, migration 368 header and DROP COLUMN list, db-catalog.json keys and db-catalog-refresh.sql header, db-object-reference.mjs replaySchema, rule 021 (hash covers only the DashboardData interface, untouched).
- Method (DEAD-1b): `git grep -n -w <symbol>` across the whole tree (src, scripts, .discipline, docs, skills, migrations): for the nine deleted symbols every hit other than the definition was a comment or a point-in-time record (docs/audits, docs/ops, docs/archive, docs/plans, session logs).
- Reused: the DEAD-1b method and the 368 migration as the source of truth for dropped columns (the new test reads the migration tree, no second list).

## Decisions

1. fetchSourceCitationStatsByIds is KEPT, not deleted: it has no caller, but `supabase/migrations/382_read_policies_name_their_role.test.mjs` (line 147) asserts the function exists and reads through the service client. Deleting it needs that test edited (outside this write set).
2. Deleting the four category fetchers strands `runCategoryRpc` (private, no caller) and deleting fetchAwaitingReview strands `isPlatformAdminInline`. Both are pinned by tests (`supabase-server-category-rpc-paging.test.mjs` asserts `async function runCategoryRpc` exists; `375_admin_flag_private.test.mjs` line 295 counts two isPlatformAdminInline reads). They are left in place; ESLint reports them as warnings only (no-unused-vars is "warn").
3. `ScopeFilter` and `ReviewItem` stay exported: data.ts imports and re-exports them.
4. db-catalog.json was not touched. Its `tables`, `views` and function lists are the production catalog (db-catalog-refresh.sql, six read-only pg_catalog queries); this lane has no database access. A migration-corpus replay (`replaySchema`) was run read-only as a diagnostic: it differs from the committed catalog by 14 tables, 1 view (research_assessments_current added; acquisition_backlog_v gone) and 42 functions added by migrations since the 2026-10-01 capture, so a replay write would change far more than the stale row.

## NOT done

- db-catalog.json still lists `acquisition_backlog_v` (and lacks 14 tables, 1 view and 42 functions that migrations since 2026-10-01 created). Staged for the executor: run the six queries of `fsi-app/.discipline/governance/db-catalog-refresh.sql` against production (read-only), drop each result into its matching key, update `capturedAt`, commit. [WORK: owed]
- `fetchSourceCitationStatsByIds` (no caller) cannot be deleted without editing `fsi-app/supabase/migrations/382_read_policies_name_their_role.test.mjs`, which pins it. NEEDS WRITE-SET EXPANSION: that test file, remove "fetchSourceCitationStatsByIds" from its list, then delete the function and the SourceCitationStat interface. [WORK: owed]
- `runCategoryRpc` (stranded by this PR) and `isPlatformAdminInline` (stranded by this PR) need their pinning tests edited to delete: `fsi-app/src/lib/supabase-server-category-rpc-paging.test.mjs` (drop the runCategoryRpc test; keep the runCategoryRpcPublic and Core tests) and `fsi-app/supabase/migrations/375_admin_flag_private.test.mjs` (allowedHits 2 to 1 and the sentence naming the function). NEEDS WRITE-SET EXPANSION. [WORK: owed]
- Stale comments naming deleted symbols outside the write set: `fsi-app/src/lib/data.ts` lines 852, 867, 915 (fetchSurfaceCounts, fetchPublicResearchPipelineRows) and `fsi-app/scripts/maintenance/record-hollow-sweep.mjs` line 40 (fetchMapData). NEEDS WRITE-SET EXPANSION. [WORK: owed]
- No guard test pins "these nine exports stay gone" (a new test file is outside the write set; the existing F25/F47 liveness gates do not cover exported functions of a live module). [WORK: owed]
- `fsi-app/scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json` still shows the three dropped columns; it is a frozen test snapshot of the duplicate-table detector, not a live-catalog mirror. [NOT-WORK: a frozen fixture of a historical schema shape, no consumer treats it as current]
