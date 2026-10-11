# 2026-10-10, lane DEAD-1d (dead1d-orphan-fetchers-and-stale-fixtures): orphan supabase-server fetchers and stale search fixture

## Accomplished

- `fsi-app/src/app/api/search/route.npmtest.mjs`: LIVE_INTELLIGENCE_ITEMS_COLUMNS no longer lists the three columns migration 368 dropped (linked_forum_thread_ids, linked_regulation_ids, linked_vendor_ids; 368 is applied, APPLIED-MAP class identical). A new test derives the dropped-column set from the migration tree (last ADD or DROP COLUMN event per column wins) and fails when the fixture lists one. Red first (the three columns restored: 1 fail, the three named), green after (9 pass).
- `fsi-app/src/lib/supabase-server.ts`: nine fetchers with no caller deleted: fetchMapData, fetchAwaitingReview, fetchSurfaceCounts, fetchMarketIntelItems, fetchResearchItems, fetchOperationsItems, fetchTechnologyItems, fetchPublicResearchPipelineRows, fetchWorkspaceAggregatesScoped (215 lines). Comments that named them were reworded; the two runtime log labels of runSurfaceCountsRpc now name the RPC (get_surface_counts) instead of the deleted function; no test matches either string.

## Read and reused

- Read: COMMON.md, batch2.md (DEAD-1c, DEAD-1d), the dead1b "Method" section, the dead2-schema log, supabase-server.ts around each definition, data.ts call sites by grep, migration 368 header and DROP COLUMN list, db-catalog.json keys and db-catalog-refresh.sql header, db-object-reference.mjs replaySchema, rule 021 (hash covers only the DashboardData interface, untouched).
- Method (DEAD-1b): `git grep -n -w <symbol>` across the whole tree (src, scripts, .discipline, docs, skills, migrations): for the nine deleted symbols every hit other than the definition was a comment or a point-in-time record (docs/audits, docs/ops, docs/archive, docs/plans, session logs).
- Reused: the DEAD-1b method and the 368 migration as the source of truth for dropped columns (the new test reads the migration tree, no second list).
- Follow-up under the coordinator's write-set grant (after the first CI run failed lint on two stranded helpers): deleted `runCategoryRpc`, `isPlatformAdminInline`, `fetchSourceCitationStatsByIds` and the `SourceCitationStat` interface; edited the three tests that pinned them (`supabase-server-category-rpc-paging.test.mjs` drops the runCategoryRpc test, `375_admin_flag_private.test.mjs` allowedHits 2 to 1, `382_read_policies_name_their_role.test.mjs` list drops the fetcher); fixed the stale comments in `src/lib/data.ts` and `scripts/maintenance/record-hollow-sweep.mjs`.
- New `fsi-app/src/lib/supabase-server-dead-exports.test.mjs` (14 tests) pins all twelve deleted functions and the interface absent, plus four live readers present. Red against origin/master's supabase-server.ts (13 fail), green now (14 pass).

## Read and reused

- Read: COMMON.md, batch2.md (DEAD-1c, DEAD-1d), the dead1b Method section, the dead2-schema log, supabase-server.ts around each definition, data.ts call sites, migration 368, db-catalog-refresh.sql header, replaySchema, rule 021.
- Method (DEAD-1b): `git grep -n -w <symbol>` across the tree; every non-definition hit was a comment, a point-in-time record, or a test pinning the symbol (those tests were edited under the grant).
- Reused: the 368 migration as the single source for dropped columns (the fixture guard reads the migration tree).

## Decisions

1. `ScopeFilter` and `ReviewItem` stay exported: data.ts imports and re-exports them.
2. db-catalog.json is not touched: it is the production catalog (six read-only pg_catalog queries in `fsi-app/.discipline/governance/db-catalog-refresh.sql`), and this lane has no database access. A read-only migration-corpus replay (`replaySchema`) differs from the committed catalog by 14 tables, 1 view and 42 functions added since the 2026-10-01 capture, so the refresh must be a full one. The executor runs the six queries, drops each result into its key, updates `capturedAt`, commits.

## NOT done

- db-catalog.json still lists `acquisition_backlog_v` and lacks the 14 tables, 1 view and 42 functions created since 2026-10-01. Staged commands: run the six queries of `fsi-app/.discipline/governance/db-catalog-refresh.sql` read-only against production, drop each result into its matching key of `fsi-app/.discipline/governance/db-catalog.json`, update `capturedAt`, commit. [WORK: EXEC-4]
- `fsi-app/scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json` still shows the three dropped columns; it is a frozen test snapshot of the duplicate-table detector, not a live-catalog mirror. [NOT-WORK: frozen historical fixture, no consumer treats it as current]
