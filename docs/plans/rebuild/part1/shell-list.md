# P1-18 shell-list: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-18, DISPOSITION lane, read-only. Tree: origin/master `c831e82b5`. Written by the cloud session on 2026-10-12. Every file in SCOPE was read whole with the Read tool; the coverage table below records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. The four registers the brief names were read whole (A2-part3 in three Read calls, A2-part5 in four, A2-part7 in one, A1-part2 in three); every other register was read as a scope-filtered extraction (165 lines naming an in-scope path across 19 registers, `grep -rn` with the scope pattern, method in the session log). Before writing about any `.tsx`, docs/design/ux-laws.md and docs/design/design-principles.md were read whole.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). "MOVES TO <lane>" marks a REFACTOR AND PORT whose new home is another module. Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` and `{/* */}` blocks and leading-`*` lines stripped). Raw lines are `wc -l`.

## 1. Header and coverage

Module: shell-list. Two things: the app shell (frame, navigation card and drawer, mobile top bar, no-workspace banner, identity error note, providers, root layout, loading, error and not-found states, the client data hooks the shell runs) and the ONE list surface every intelligence page renders through (masthead, band tiles, facets, rows grouped by band, pagination, row fields, links, rail cards, URL state, and the list readers in `src/lib/supabase-server.ts`). The scope also carries files that are not shell or list by function (detail-page components under `components/shell` and `components/shared`, the market detail page and the settings page under `components/pages`, an unmounted `components/resource` trio, formatting and cache helpers); section 2 says where each goes.

Coverage (53 files plus seven slices of supabase-server.ts; 10,284 raw lines, 6,947 code lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/) | raw lines | code lines | read calls |
|---|---|---|---|
| src/components/AppShell.tsx | 266 | 130 | 1 |
| src/components/Sidebar.tsx | 529 | 361 | 1 |
| src/components/app-shell-banner.ts | 46 | 28 | 1 |
| src/components/BackToTop.tsx | 33 | 29 | 1 |
| src/components/layout/TopBar.tsx | 202 | 153 | 1 |
| src/components/layout/PageFrame.tsx | 49 | 34 | 1 |
| src/components/shell/PageMasthead.tsx | 152 | 100 | 1 |
| src/components/shell/bootstrap-seed.ts | 129 | 57 | 1 |
| src/components/shell/ItemConnectionsCard.tsx | 284 | 227 | 1 |
| src/components/shell/ThemeStrip.tsx | 9 | 8 | 1 |
| src/components/shell/ThemeStripView.tsx | 135 | 129 | 1 |
| src/components/shell/RelevanceBadge.tsx | 46 | 44 | 1 |
| src/components/shell/RelevanceBadgeClient.tsx | 47 | 22 | 1 |
| src/components/shared/InferenceClaim.tsx | 143 | 89 | 1 |
| src/components/shared/MoreBelowDisclosure.tsx | 38 | 34 | 1 |
| src/components/shared/GfmSection.tsx | 198 | 151 | 1 |
| src/components/providers/QueryProvider.tsx | 43 | 18 | 1 |
| src/app/layout.tsx | 76 | 39 | 1 |
| src/app/loading.tsx | 57 | 54 | 1 |
| src/app/error.tsx | 52 | 45 | 1 |
| src/app/not-found.tsx | 75 | 66 | 1 |
| src/app/privacy/page.tsx | 380 | 353 | 1 |
| src/components/list-surface/ListSurfaceShell.tsx | 677 | 437 | 1 |
| src/components/list-surface/list-surface-helpers.ts | 464 | 254 | 1 |
| src/components/list-surface/useListSurfaceFilter.ts | 86 | 52 | 1 |
| src/components/list-surface/ListSurfaceRailCards.tsx | 578 | 346 | 1 |
| src/components/list-surface/ListSurfaceSortRow.tsx | 169 | 114 | 1 |
| src/components/pages/MarketSignalDetailSurface.tsx | 873 | 660 | 1 |
| src/components/pages/SettingsPage.tsx | 639 | 488 | 1 |
| src/components/resource/SectorSynopsis.tsx | 413 | 351 | 1 |
| src/components/resource/IntelligenceBrief.tsx | 536 | 432 | 1 |
| src/components/resource/IntelligenceMetadataStrip.tsx | 214 | 168 | 1 |
| src/lib/list-pagination.ts | 157 | 65 | 1 |
| src/lib/list-row-fields.ts | 93 | 51 | 1 |
| src/lib/item-links.ts | 56 | 25 | 1 |
| src/lib/url-params/regulations-region-link.ts | 32 | 22 | 1 |
| src/lib/nav/nav-counts.ts | 44 | 37 | 1 |
| src/app/api/intelligence-items/[id]/metadata/route.ts | 70 | 57 | 1 |
| src/lib/hooks/useAdminAttention.ts | 278 | 187 | 1 |
| src/lib/hooks/usePersonalState.ts | 62 | 21 | 1 |
| src/lib/hooks/useNearestScrollParent.ts | 94 | 31 | 1 |
| src/lib/hooks/useUnreadNotificationsCount.ts | 79 | 50 | 1 |
| src/lib/hooks/useWorkspaceBootstrap.ts | 233 | 150 | 1 |
| src/lib/hooks/useWorkspaceOverridesHydration.ts | 74 | 29 | 1 |
| src/lib/format.ts | 85 | 29 | 1 |
| src/lib/relative-time.ts | 78 | 62 | 1 |
| src/lib/text/html-to-text.mjs | 25 | 11 | 1 |
| src/lib/csv/split.mjs | 43 | 39 | 1 |
| src/lib/cache/revalidate-item.ts | 33 | 13 | 1 |
| src/lib/cache/fallback-guard.ts | 59 | 37 | 1 |
| src/app/api/cache/revalidate-item/route.ts | 50 | 26 | 1 |
| src/app/api/revalidate/route.ts | 65 | 30 | 1 |
| src/lib/render-now.ts | 11 | 5 | 1 |
| src/lib/supabase-server.ts 690-1268 (list query builder, org and public listing reads, row type, row mapper) | 474 (706-1180 counted) | 230 | 3 (offsets 690, 740, 1004) |
| src/lib/supabase-server.ts 1380-1545 (aggregates, surface counts) | 151 (1383-1533 counted) | 98 | 1 |
| src/lib/supabase-server.ts 2170-2290 (category routed reads) | 93 (2178-2270 counted) | 48 | 1 |
| src/lib/supabase-server.ts 3005-3275 (list payload wrappers; 3145-3208 map and 3273 settings read, not counted) | 178 (3008-3143, 3210-3251 counted) | 97 | 1 |
| src/lib/supabase-server.ts 4395-4423 (fetchThemeChips) | 29 | 24 | 1 |
| TOTAL | 10284 | 6947 | 60 |

Files not read whole: none in the named scope. The list readers were taken to be the ranges lane P1-01 assigned to "lists" (auth-db.md section 3 rank 2: 784-983, 1441-1533, 2178-2270, 3030-3262) widened to whole functions (706-1180, 1383-1533) plus `fetchThemeChips` (the reader behind ThemeStrip). `enrichCategoryRows` (about 2080-2176), `fetchWorkspaceOverrideRowsRaw` and `baseResourceFields` (1855) are called by these readers and were NOT read whole here; they stay with the surface read layer P1-01 named. Test files: none exist beside the scope on this tree (`ls` of every scope directory lists no `*.test.mjs` or `*.npmtest.mjs`; the CLEAN cuts removed them), so the test results the prior registers cite (A2-part3:L57, A2-part7:L78 and others) are history, not proof on this tree.

Consumer evidence: two censuses over fsi-app/src, fsi-app/scripts, fsi-app/supabase, fsi-app/.discipline and .github. (1) Import-path census per file (`from "@/<module>"`, relative `from "./<basename>"`, dynamic `import("@/<module>")`), counts in section 7. (2) Symbol census per exported symbol (`grep -rlw <symbol>` excluding the defining file), zero-hit list in section 4. Route handlers are reached by URL; their callers are the `fetch(` literals named in section 7.

## 2. Module verdict

**REFACTOR AND PORT.** Every shell and list responsibility is kept. The code is not: one nav card is written twice (desktop and drawer wordmark blocks, two overlay mechanisms with no Esc or focus handling), the shell runs three independent client pollers where one bootstrap already carries two of the answers, the list frame duplicates PageFrame's grid and is copied again by three surfaces that cannot mount it, four list readers collapse a failed read into an honest empty or a zero, the URL contract covers six facets but not sort, window or the surface-specific facets, and a third of the raw lines (3,337 of 10,284) are not code, most of it dated lane narrative. Four files (a never-mounted synopsis view, its brief renderer and metadata strip, and that strip's one route) are dead and go.

**Current code LOC: 6,947** (awk, table above). **Estimated clean LOC: about 2,730 for shell-list, plus about 1,290 that moves to other modules, and 1,108 code lines trashed.** Arithmetic (section 8 table, per planned file): shell 1,264 (AppShell 90, nav-model 40, NavCard 190, TopBar 95, Sheet 30, BackToTop 30, scroll-container 20, PageFrame 30, identity-seed 55, use-bootstrap 120, use-admin-attention 55, use-unread-count 40, nav-counts 30, QueryProvider 18, layout 28, loading 15, error 28, not-found 30, privacy 320) + list surface 1,280 (ListSurface 250, rail 130, SortRow 80, facets 110, filter-sort 70, url-state 95, use-list-rows 35, pagination 55, row-fields 45, item-links 25, read 95, map-rows 95, counts 55, category 30, ThemeStrip 110) + core 190 (format 75, render-now 5, html-to-text 11, csv 39, fallback-guard 30, revalidate route 30) = 2,734, rounded 2,730. Moved: detail components 270 (connections 130 with both variants on one row renderer, relevance 45, inference 75, 20 for the shared masthead-strip wrapper), GfmSection and MoreBelowDisclosure 150 to P1-17, MarketSignalDetail 430 to the market surface, SettingsPage 300 to P1-02, three surface rail cards 140 (obligations 60, carbon and next drops 80) = 1,290. Against today's 6,947 the module shrinks to 39 percent; with the moved files the whole scope lands at 58 percent. Estimates are read-derived [HYPOTHESIS until the port lane counts them]. Reconciliation: shell today 1,872 + list today 2,000 + core today 252 + moving today 1,715 + trash 1,108 = 6,947 [CONFIRMED arithmetic over the awk table].

Core responsibilities (12), with the files that carry them today:

1. App frame: 1440 max, 252 px nav track plus content track, collapsing to one track under 768, `<main>` as the one scroll container (AppShell.tsx 31-266).
2. Navigation: sections Brief / Intelligence / Network, live counts, active row, Account row opening the account menu, Admin row with attention count and role badge, band-gradient cap from real counts, desktop card and 288 px mobile drawer (Sidebar.tsx), mobile top bar with title, search glyph and avatar unread dot (layout/TopBar.tsx).
3. Workspace states: no-workspace banner and onboarding redirect on a resolved null, identity error note with Retry on a failed lookup (AppShell.tsx 77-113, 198-247; app-shell-banner.ts); the identity seed contract (shell/bootstrap-seed.ts).
4. Shell data: one per-session bootstrap bundle (lib/hooks/useWorkspaceBootstrap.ts) hydrating overrides and personal state into the resource store (useWorkspaceOverridesHydration.ts, usePersonalState.ts), admin attention poll (useAdminAttention.ts), unread notifications poll (useUnreadNotificationsCount.ts), nav counts server read (lib/nav/nav-counts.ts).
5. Root layout, fonts, providers (app/layout.tsx, providers/QueryProvider.tsx), loading, error and not-found states (app/loading.tsx, app/error.tsx, app/not-found.tsx), privacy page (app/privacy/page.tsx), back-to-top (BackToTop.tsx), the content frame (layout/PageFrame.tsx).
6. The list surface: masthead with command bar, band tiles, mobile facet strip and Filters sheet, rows grouped by band or flat, virtualized past 30, band foot with expand link and transition label, rail with Filters card (list-surface/ListSurfaceShell.tsx, ListSurfaceRailCards.tsx FiltersRailCard and LegendRailCard, ListSurfaceSortRow.tsx).
7. List state: facet options with live counts, filter, sort, window, URL round trip, detail-return position (list-surface-helpers.ts, useListSurfaceFilter.ts, lib/url-params/regulations-region-link.ts).
8. List paging and rows: first page 60, page 30, keyset cursor, remainder trim, row fields, canonical detail link (lib/list-pagination.ts, lib/list-row-fields.ts, lib/item-links.ts, useRemainderFetch in ListSurfaceShell.tsx 642-677).
9. List reads: org and public listing RPCs with range paging, the row mapper with chunked timelines, workspace aggregates, per-surface counts, category-routed reads, theme chips (supabase-server.ts slices above; ThemeStrip.tsx, ThemeStripView.tsx).
10. Formatting and clock: pinned locale, plural agreement, relative time, one render instant (lib/format.ts, lib/relative-time.ts, lib/render-now.ts); text and CSV helpers (lib/text/html-to-text.mjs, lib/csv/split.mjs).
11. Cache: detail tags and flush, fallback-not-cached guard, two worker revalidate routes (lib/cache/*, app/api/cache/revalidate-item, app/api/revalidate).
12. In scope by directory, not shell or list: detail components (ItemConnectionsCard, RelevanceBadge and Client, InferenceClaim, GfmSection, MoreBelowDisclosure), the market detail body (pages/MarketSignalDetailSurface.tsx), the settings body (pages/SettingsPage.tsx), the legacy masthead (shell/PageMasthead.tsx), the unmounted resource trio and its metadata route.

Key dependencies [CONFIRMED by the import scan and the `.from(`/`.rpc(` reads]:

- Modules imported: `next/navigation`, `next/link`, `next/dynamic`, `next/cache` (revalidateTag), `next/server`, `react` (cache, useSyncExternalStore), `@tanstack/react-query`, `react-markdown`, `remark-gfm`, `lucide-react`, `@fontsource/*`; in-repo from P1-17 ui-kit: Masthead, SectionCard, BandTile, BandTileRow, BandGroupHeader, ListRow, StateNote, Chips (FilterChip, FilterChipGroup, GradeChip, TagChip), Skeleton parts, RailCard, ImpactMeter, BandGradientRule, Absence, ErrorState, TabRow, SectionIndex, DetailSubSection, ActionCard; from components/ledger: VirtualizedRowList; from P1-01: useAuth, UserMenuDropdown, authedFetch/authHeaders, getServiceSupabase, route-guard, rate-limit, worker-auth; from P1-02: workspaceStore, resourceStore, settingsStore, settings sections; from lib: urgency/bands, contracts/vocabularies, dashboard/row-fields, scoring, surface-of, customer-source-tier, connections/*, forward-events/obligation-rail-select, research/theme-brief, entities/decisions, agent/claim-ledger-block, agent/brief-section-strip, agent/metadata-vocab, market/*, propagation/*, telemetry GlobalErrorReporter.
- RPCs read by the list readers: get_workspace_intelligence, get_workspace_intelligence_slim, get_workspace_intelligence_dashboard, get_workspace_intelligence_listings and the `_public` slim and listings siblings, get_workspace_intelligence_aggregates, get_surface_counts, get_market_intel_items_public, get_operations_items_public, get_research_items_public (plus get_workspace_due_next at 879, a dashboard read that sits inside the range).
- Tables read in scope: item_timelines (mapper, anon client), connection_themes, theme_briefs and connection_theme_runs and intelligence_items (theme chips), intelligence_items (metadata route, TRASH).
- Client routes the shell and list call: /api/workspace/bootstrap (P1-02), /api/admin/attention (P1-25/26), /api/community/notifications (P1-22/23), /api/detail/relevance, /api/obligations/upcoming, /api/listings/rest and /api/listings/cursor (through the ledgers), /api/intelligence-items/[id]/metadata (TRASH).
- Env vars: WORKER_SECRET (the two revalidate routes, through workerAuthGuard); none read directly elsewhere in scope.
- External services: none. No metered model call and no Browserless call site in scope [CONFIRMED: `grep -rln "anthropic\|browserless\|api.anthropic"` over every scope path returns nothing; the only `fetch(` literals are the five same-origin routes listed above].

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | dated lane narrative in comments | 3,337 of 10,284 raw lines are not code (raw minus code); the heaviest: AppShell.tsx 55-65, 77-87, 119-156, 162-184 (about 120 of 266), Sidebar.tsx 3-28, 385-431, 473-483, ListSurfaceShell.tsx 3-38, 159-227 (inside the CSS string), 609-626, ListSurfaceRailCards.tsx 32-83, 254-293, 354-376, 403-460, 482-535, supabase-server.ts 708-757, useNearestScrollParent.ts 3-53 (63 of 94), list-pagination.ts 3-24, 33-55 | the files tell their own archaeology (lane ids, train numbers, measurements, rulings) to every reader; several are now wrong (useNearestScrollParent.ts:35-53 says AppShell is `min-h-screen`, AppShell.tsx:160 is `height: 100vh`; ListSurfaceShell.tsx:19-26 says the surface rail cards are deferred, they exist; ListSurfaceSortRow.tsx:137-145 describes a 44 px fix, the code sets 28) [CONFIRMED read] | one header sentence per file; rulings cited by id in section 8; history stays in docs/ |
| 2 | three client pollers for answers one bootstrap already carries | useAdminAttention.ts 278 raw, useWorkspaceBootstrap.ts 233, useUnreadNotificationsCount.ts 79 | the bootstrap route ships `adminAttention` and nothing reads it (`grep -rn "\.adminAttention"`: no reader outside the route and the type) [CONFIRMED], while Sidebar polls /api/admin/attention separately every 60 s; `AdminAttentionCounts` duplicates `BootstrapAdminAttention` field for field (B-1029, B-2159); the unread poll is per instance, so the bell and the avatar dot each run their own 60 s interval, and it polls with no signed-in gate, which is the anonymous /privacy 401 (B-0153, A2-part7:L23) | one bootstrap store with reset on sign-out; admin attention read from it with one visible-tab refresh for platform admins; one gated unread singleton |
| 3 | the market detail body inside this scope | MarketSignalDetailSurface.tsx 873 raw, 660 code | a surface file under `components/pages`; carries keyword-regex classification of severity and band when the columns are null (205-222, 231-297), so list and detail can disagree (A2-part6:L33); renders the carbon-intensity block twice (629-652 and 697-713); its "Do now" list reads `r.recommendedActions`, which no mapper fills (`grep -rn recommendedActions src/lib/supabase-server.ts src/lib/data.ts` returns nothing; C3a:L81) [CONFIRMED] | moves to the market surface lane; one carbon block; severity and band from the columns only, absence when null |
| 4 | a never-mounted synopsis stack | SectorSynopsis.tsx 413 + IntelligenceBrief.tsx 536 + IntelligenceMetadataStrip.tsx 214 + metadata route 70 = 1,233 raw | SectorSynopsisView has 0 importers; the other two are imported only by it; the route's only caller is the strip [CONFIRMED census]; IntelligenceBrief also rewrites brief text with sentence-rejoin regexes (427-452) and colours table cells by substring ("exempt" green, "100%" red, 370-377) | TRASH; the shelved per-sector feature is recorded in section 8 |
| 5 | the list frame written four times | ListSurfaceShell.tsx 393-411 restates PageFrame's grid (PageFrame.tsx 21-40); LIST_SURFACE_MOBILE_CSS is injected twice by the shell (:384, :411) and copied into WatchlistSurface.tsx:249, CoveragePageView.tsx:61,84 and ObligationRegisterPageView.tsx:139,173 [CONFIRMED grep] | three list variants cannot mount the shell, so each copies its frame and its mobile CSS | ListSurface renders inside PageFrame; the variants mount ListSurface with slots (section 8 list variants) |
| 6 | one nav card written twice | Sidebar.tsx 441-455 vs 501-518 (wordmark), 156-206 (two row styles inside one renderer), 471-525 (drawer) vs ListSurfaceShell.tsx 240-317 (filter sheet) | two hand-rolled overlays, both `role="dialog" aria-modal` with a scrim click and no Esc, no focus move, no focus return (B-1955; A2-part5:L78) [CONFIRMED read] | P1-17's Dialog (ui-kit.md section 8, src/ui/Dialog.tsx) under a side or bottom Sheet placement here; one Wordmark |
| 7 | the settings body inside this scope | SettingsPage.tsx 639 raw, 488 code | the Dashboard defaults card writes six region toggles, default sort, default export and alert bands that nothing reads (`grep -rn "defaultSort\|showBandTiles\|alertPriorities\|exportFormat"` outside settingsStore.ts and SettingsPage.tsx: 0) [CONFIRMED]; the Freight sectors card calls `useWorkspaceStore.setSectorProfile`, an in-memory zustand set (stores/workspaceStore.ts:45), so the choice never persists [CONFIRMED read] | moves to P1-02; a control ships only with its reader and its write |
| 8 | supabase-server list readers | 925 raw, 497 code | four payload wrappers (loadResourcesWithOverridesPayload, loadPublicResourcesPayload, loadMapDataPayload, fetchSettingsData) plus two listing readers that differ only in org scope; a 50-line header for a 25-line query builder | one `readListing({ orgId?, rpc, page })` returning `{ rows, archived, overrides?, failed }`; one mapper; one counts module |
| 9 | per-instance style tags and legacy tokens | `<style>` blocks in AppShell, Sidebar, PageFrame, PageMasthead, ItemConnectionsCard, ListSurfaceShell (three), SortRow, SettingsPage (three); legacy `--color-*`, `--surface`, `--muted` tokens in AppShell banner, ThemeStripView, PageMasthead, GfmSection, InferenceClaim, loading, error, not-found, privacy, SettingsPage; raw hex and rgba in TopBar, Sidebar, ListSurfaceShell, InferenceClaim, loading | the design system carries canonical tokens (theme.css); the forks are A2bc E-class debt (A2-part3:L30, :L41) | tokens only; responsive rules in one stylesheet per part |
| 10 | two worker routes for one flush | api/cache/revalidate-item 50 + api/revalidate 65 | revalidate is a superset (tags[]); revalidate-item flushes exactly `[item:<id>, intel-items]` | one worker route accepting `tags` or `itemId` |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts, fsi-app/supabase, fsi-app/.discipline and .github (ts, tsx, mjs, js) excluding the defining file, and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| src/components/resource/SectorSynopsis.tsx:219 | SectorSynopsisView | exported component | import-path census: 0 importers [CONFIRMED]; agrees with A2-part7:L27, A2-part4:L91, B-0664. fsi-app/.claude/CLAUDE.md still says "DO NOT remove SectorSynopsisView"; MEM-1:L753 records that rule as PARTLY STALE |
| src/components/resource/IntelligenceBrief.tsx:454, :24 | IntelligenceBrief, re-export stripSourcesSection | exported component, re-export | 1 importer: SectorSynopsis.tsx:9 (itself dead) [CONFIRMED]; the re-export has no reader (stripSourcesSection is imported from lib/agent/brief-section-strip.mjs directly elsewhere) |
| src/components/resource/IntelligenceMetadataStrip.tsx:70 | IntelligenceMetadataStrip | exported component | 1 importer: SectorSynopsis.tsx:10 [CONFIRMED] |
| src/app/api/intelligence-items/[id]/metadata/route.ts:7 | GET | route handler | `grep -rn "intelligence-items/"` outside the route: IntelligenceMetadataStrip.tsx:78 only [CONFIRMED]; reachable by URL |
| src/app/api/workspace/bootstrap/route.ts:63,84 (P1-02 file) and src/lib/hooks/useWorkspaceBootstrap.ts:80 | `adminAttention` field | shipped field with no reader | `grep -rn "\.adminAttention"` in src: none; only the route builds it and parts demos stub it [CONFIRMED]; B-0562, B-0563 |
| src/lib/url-params/regulations-region-link.ts:29, :4, :1 | parseRegulationsRegionParam, normalizeRegionIsoCodes, REGULATIONS_REGION_PARAM | exported functions and constant | 0 references outside the file [CONFIRMED]; so nothing parses `?region=` as an ISO list: MapPageView.tsx:407 emits `/regulations?region=<UPPERCASED id>` and the regulations list reads `region` as an exact jurisdiction token (list-surface-helpers.ts:206, 438). Whether that link narrows to zero rows depends on the stored jurisdiction token case (constants.ts:22 ids are lowercase, e.g. "us") [HYPOTHESIS: not rendered] |
| src/lib/hooks/useWorkspaceBootstrap.ts:66 | BootstrapOverrideRow (export) | type export | 0 references outside the file [CONFIRMED]; the hand-copied shape of WorkspaceOverrideRow (its own header 58-65) |
| src/components/list-surface/list-surface-helpers.ts:33, 56, 73, 90, 112, 350, 356, 371, 419-423 | modeFacetOptions, topicFacetOptions, tierFacetOptions, regionFacetOptions, bandFacetOptions, FacetCorpusCounts, LiveFacetCounts, isFilterActive, MODE/REGION/TOPIC/TIER/QUERY_FACET_PARAM (exports) | export surface | used only inside the file (liveFacetCounts and the URL helpers call them) [CONFIRMED: 0 hits outside]; `useListSurfaceFilter.ts:82-84` re-implements isFilterActive instead of importing it |
| src/components/shell/bootstrap-seed.ts:122-123 | IDENTITY_RETRY_DELAYS_MS, IDENTITY_ATTEMPTS_PER_ROUND (exports) | export surface | used only inside the file by nextIdentityRetryDelay, which identity-loader.ts:3,80 imports [CONFIRMED] |
| src/lib/nav/nav-counts.ts:17; src/lib/cache/fallback-guard.ts:1, 5, 11, 22; src/components/app-shell-banner.ts:36; src/lib/list-pagination.ts:103 | EMPTY_NAV_COUNTS, MaybeFallbackPayload, FALLBACK_NOT_CACHEABLE, FallbackNotCacheableError, isFallbackPayload, NO_WORKSPACE_ONBOARDING_ROUTE, FIRST_LISTING_CURSOR (exports) | export surface | used only inside their files [CONFIRMED] |
| src/components/pages/MarketSignalDetailSurface.tsx:433, 666-680 | `actions` from `r.recommendedActions` | always-empty branch | no mapper writes `recommendedActions` onto a Resource (grep over supabase-server.ts, data.ts, lib/detail: 0); migration 334 adds the column and nothing copies it (C3a:L81, :L215) [CONFIRMED]; the "Do now" step list can never render, the section falls to sectionMap["7"] or the pending note |
| src/components/Sidebar.tsx:235; src/components/shell/PageMasthead.tsx:46 | `gap: drawer ? 2 : 2`; `belowSlot ? "26px 36px 22px" : "26px 36px 22px"` | identical-arm ternaries | read [CONFIRMED] |
| src/components/list-surface/ListSurfaceShell.tsx:384, :411 | `<style>{LIST_SURFACE_MOBILE_CSS}</style>` | duplicate injection | the same block is rendered twice per mount [CONFIRMED read] |
| src/components/pages/SettingsPage.tsx:359-459 | DashboardDefaultsCard writes | write-only controls | 0 readers of the written keys (rank 7) [CONFIRMED]; A2-part7:L22 |

Not dead, verified live this session: PageMasthead (9 importers, all app/admin/parts pages; STALE as a part, section 7), RelevanceBadgeClient and ItemConnectionsCard (4 detail surfaces each), ThemeStrip (4 list pages), InferenceClaim (3), GfmSection (7), MoreBelowDisclosure (2), useRemainderFetch (RegulationsLedger.tsx:70,130 only), LIST_SURFACE_MOBILE_CSS (5 importers), BandSectionHeader (smoke-mount export per its comment; no in-tree importer outside the file, kept as the group header wrapper), useNearestScrollParent (components/ledger/VirtualizedRowList.tsx:42), html-to-text (4 importers incl. scripts/turns/run-ledger-consume.mjs), csv/split (2 incl. scripts/spec09/lib/operator-rows-contract.mjs).

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| admin attention counts type | useAdminAttention.ts:8-19; useWorkspaceBootstrap.ts:46-56 | one type in the bootstrap contract (P1-02) |
| module-singleton poller pattern | useAdminAttention.ts:63-191; useWorkspaceBootstrap.ts:96-198 | one bootstrap store; admin attention is a field of it with an optional refresh |
| hydration hooks | usePersonalState.ts:34-62; useWorkspaceOverridesHydration.ts:41-74 (its own line 5 says it mirrors the other) | one `hydrateFromBootstrap()` effect in use-bootstrap |
| band-gradient counts mapping | Sidebar.tsx:146-151; TopBar.tsx:70-75 | `gradientCountsFrom(navCounts)` in nav-model |
| nav wordmark block | Sidebar.tsx:442-455; 502-518 | one Wordmark with a size prop |
| dialog overlay | Sidebar.tsx:471-525 (drawer); ListSurfaceShell.tsx:240-317 (FilterSheet) | one Sheet (side, bottom) |
| content frame grid | PageFrame.tsx:21-40; ListSurfaceShell.tsx:393-411; SettingsPage.tsx:216-227; WatchlistSurface, CoveragePageView, ObligationRegisterPageView (out of scope) | PageFrame |
| prefix route matching | AppShell.tsx:40 (`/auth` also matches `/author...`), app-shell-banner.ts:16, :32; Sidebar.tsx:102, :137 (`/market` also matches `/marketplace...`) | segment match: `path === r \|\| path.startsWith(r + "/")`, the same fix P1-01 owes route-policy (B-1980) |
| filter-active predicate | list-surface-helpers.ts:371-375; useListSurfaceFilter.ts:82-84 | import isFilterActive |
| item-tag vocabulary | lib/cache/revalidate-item.ts:8-24; scripts/lib/revalidate.mjs (mirrors itemTag and surfaceDetailTag, B2-part1:L71) | one module both import |
| revalidate routes | api/cache/revalidate-item/route.ts; api/revalidate/route.ts | one route |
| locale constant and month table | format.ts:3, :38; lib/figures/format-range.mjs FIXED_LOCALE (A4:L373, B-0259) | format.ts only |
| plural ternaries | relative-time.ts:36, 40, 44, 47 beside format.ts pluralize | pluralize |
| markdown renderers | shared/GfmSection.tsx; resource/IntelligenceBrief.tsx; resource/SectorSynopsis.tsx mdComponents | GfmSection (the other two are TRASH) |
| carbon-intensity block | MarketSignalDetailSurface.tsx:629-652; 697-713 | one block |
| legend copy | ListSurfaceRailCards.tsx:551-578; DashboardBrief legend (A2-part5:L60) | LegendRailCard everywhere |
| listing readers | supabase-server.ts 784-847 (org) and 929-983 (public); payload wrappers 3030-3114 | readListing with an optional orgId |

Over-abstraction: `useNearestScrollParent` walks the DOM at mount to find a scroll container the shell itself creates (AppShell.tsx:254); a context from the shell replaces the walk and its never-re-resolved window fallback (B-0261). `BandSectionHeader` wraps BandGroupHeader only so a deleted smoke spec could mount it. `FacetOption.countLabel` exists for one operations facet; keep it, it is small.

## 6. Non-essential artifacts

None of fixtures, mock data or handoff JSON live in this scope. The app/admin/parts NavCardPartsDemo monkey-patches window.fetch to overlay frozen nav counts onto the real Sidebar (A1-part2:L137); that page is P1-25/26's, and its existence is why `navTitleForPath` and the bootstrap shape must stay importable from a parts page. The privacy page is legal copy, not an artifact (section 8).

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (import-path census count and top 3, this session) | note.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| src/components/AppShell.tsx | 1-266 (266) | frame grid, drawer state, overrides hydration mount, banner, redirect, identity error note, AskAssistant and BackToTop mounts | REFACTOR AND PORT | 90 (with banner) | 1: app/layout.tsx | NO_SIDEBAR_ROUTES omits /privacy, so an anonymous visitor gets the signed-in shell and its polls (B-0121, A2-part3:L25) [CONFIRMED read :19]; prefix match (section 5); banner link a bare `<a>` (:216) and legacy tokens (:203-222) |
| src/components/app-shell-banner.ts | 1-46 (46) | banner, error-note and redirect predicates | REFACTOR AND PORT | into AppShell / identity-seed | 1: AppShell.tsx | pure; the four-state table is the test to port |
| src/components/Sidebar.tsx | 1-529 (529) | nav card and drawer, sections, counts, Account and Admin rows, navTitleForPath | REFACTOR AND PORT | 230 (NavCard 190 + nav-model 40) | 3: AppShell.tsx, layout/TopBar.tsx, admin/parts/nav-card/NavCardPartsDemo.tsx | drawer no Esc or focus trap (B-1955) [CONFIRMED read :471-525]; desktop rows padding 10px 12px at fs-13, about 40 px (A2-part3:L60) [HYPOTHESIS: not measured]; mounts P1-01's UserMenuDropdown (which comes here, auth-db.md section 8) |
| src/components/layout/TopBar.tsx | 1-202 (202) | mobile bar: band rule, hamburger, title, search glyph, avatar with unread dot | REFACTOR AND PORT | 95 | 1: AppShell.tsx | ungated unread poll (B-0153) [CONFIRMED read :66 and useUnreadNotificationsCount.ts:44-71]; raw `#FFFFFF` (:192); mounted (hidden by CSS) on desktop too |
| src/components/BackToTop.tsx | 1-33 (33) | jump-to-top button after 400 px | REFACTOR AND PORT | 30 | 1: AppShell.tsx | listens to `window` while `<main>` scrolls (AppShell.tsx:160, :254), so it never shows (B-0658, B-1518) [CONFIRMED by read; not rendered]; 40x40 (B-0127) |
| src/components/layout/PageFrame.tsx | 1-49 (49) | content plus 300 px rail grid, collapse at 1280, mobile padding | KEEP AS-IS | 30 | 5: DashboardBrief, PortfolioIndexView, PortfolioDetailView (+ SearchResultsView, WatchlistSurface) | the one frame; ListSurface adopts it |
| src/components/shell/bootstrap-seed.ts | 1-129 (129) | identity seed, error seed, apply guard, workspace label, admin-nav gate, retry schedule | KEEP AS-IS (moves to src/ui/shell/identity-seed.ts) | 55 | 5: Sidebar, auth/AuthProvider, auth/identity-loader (+ profile/UserProfilePage) | pure, correct error discipline [CONFIRMED read :77-88] |
| src/lib/hooks/useWorkspaceBootstrap.ts | 1-233 (233) | per-session bootstrap singleton | REFACTOR AND PORT | 120 (with the two hydration hooks) | 8: Sidebar, DashboardMasthead, DetailShell, TopBar (+4) | never reset on sign-out; a signed-out attempt keeps prior data (:139-147) (B-1566, A4c:L171) [CONFIRMED read]; whether a second user in the same tab sees the first user's overrides depends on AuthProvider's sign-out path [HYPOTHESIS]; ships an unread `adminAttention` |
| src/lib/hooks/useWorkspaceOverridesHydration.ts | 1-74 (74) | overrides into resourceStore once | REFACTOR AND PORT | into use-bootstrap | 1: AppShell.tsx | B-1030 |
| src/lib/hooks/usePersonalState.ts | 1-62 (62) | personal state into resourceStore once | REFACTOR AND PORT | into use-bootstrap | 2: SettingsPage, RegulationsLedger | no guard for an absent `personalState` (B-0262) [CONFIRMED read :49]; mounted per surface while the overrides hook is mounted once in the shell: two mounting rules for one bundle |
| src/lib/hooks/useAdminAttention.ts | 1-278 (278) | admin attention 60 s poll, singleton | REFACTOR AND PORT | 55 | 4: Sidebar, admin/AdminDashboard, admin/redesign/AdminIssuesRail, admin/redesign/FlagsRejectionsQueue | duplicate of the bootstrap field (rank 2); 401/403 mapped to zeros by design (:117-129) |
| src/lib/hooks/useUnreadNotificationsCount.ts | 1-79 (79) | unread count 60 s poll | REFACTOR AND PORT | 40 | 2: community/NotificationsBell, layout/TopBar | per instance, no user gate (rank 2) |
| src/lib/hooks/useNearestScrollParent.ts | 1-94 (94) | find the scroll container for the virtualizer | REFACTOR AND PORT | 20 (as scroll-container context) | 1: components/ledger/VirtualizedRowList.tsx | resolved once, never re-resolved (B-0261) [CONFIRMED read :72-91]; header stale (rank 1) |
| src/lib/nav/nav-counts.ts | 1-44 (44) | nav counts: surface snapshot, watchlist, aggregates | REFACTOR AND PORT | 30 | 3: app/api/workspace/bootstrap/logic.ts, useWorkspaceBootstrap (type), ui/__fixtures__/nav-counts-fixture | any failure returns zeros (:41-43), and Sidebar then prints "0" beside every surface: a failed read rendered as a fact [CONFIRMED read; Sidebar.tsx:158, :192 render whenever counts exist] |
| src/components/providers/QueryProvider.tsx | 1-43 (43) | one QueryClient, 30 s stale, no focus refetch, retry 1 | KEEP AS-IS | 18 | 1: auth/AuthProvider.tsx | header 17 lines |
| src/app/layout.tsx | 1-76 (76) | fonts, metadata, AuthProvider, GlobalErrorReporter, AppShell | REFACTOR AND PORT | 28 | Next root layout | no dynamic API in the tree (PERF-10) [CONFIRMED read; A1-part2:L166]; hand-written viewport meta instead of the `viewport` export; the metadata title carries an em dash glyph (copy, section 8) |
| src/app/loading.tsx | 1-57 (57) | root loading boundary | REFACTOR AND PORT | 15 | Next convention (routes without their own loading.tsx) | dashboard-shaped skeleton (4 stat cards, 3 accordions) for every route; raw `#fafaf8` (:3) (A1-part2:L167) |
| src/app/error.tsx | 1-52 (52) | root error boundary with report | REFACTOR AND PORT | 28 | Next convention | "Failed to load dashboard data" on every route, names Supabase, echoes `error.message` (B-0093, B-1511) [CONFIRMED read :41-49] |
| src/app/not-found.tsx | 1-75 (75) | 404 page | REFACTOR AND PORT | 30 | Next convention and every notFound() | link padding 10px 18px at 13 px text, about 37 px [HYPOTHESIS: not measured]; "Back to Dashboard" to "/" (A1-part2:L175) |
| src/app/privacy/page.tsx | 1-380 (380) | privacy policy | REFACTOR AND PORT (markup); copy KEEP AS-IS pending counsel | 320 | public route, AuthFrame link | renders `<main>` inside AppShell's `<main>` (two main landmarks) [CONFIRMED read :12]; names LinkedIn OAuth (:56, :80, :154), Stripe (:156) and Browserless (:155) as processors: the LinkedIn chain is TRASH as code in P1-01 while P1-02 records the import as in flight (workspace.md), the rebuild retires Browserless, package.json has no Stripe (B-0094, B-0095, A1-part2:L182) - legal text, not edited by any lane |
| src/components/list-surface/ListSurfaceShell.tsx | 1-677 (677) | the list layout, FilterSheet, band foot, useRemainderFetch, LIST_SURFACE_MOBILE_CSS | REFACTOR AND PORT | 285 (ListSurface 250 + use-list-rows 35) | 8: CoveragePageView, ListSurfaceRailCards (type), MarketIntelLedger, OperationsLedger (+ RegulationsLedger, ResearchLedger, ObligationRegisterPageView, WatchlistSurface) | useRemainderFetch turns a failed remainder into an empty rest, so the list silently stays at the first page (B-0155) [CONFIRMED read :659-661]; FilterSheet no Esc or focus [CONFIRMED read]; band foot button minHeight 24 inside a 10 px padded strip (law 2 alternative floor) |
| src/components/list-surface/list-surface-helpers.ts | 1-464 (464) | facets, live counts, filter, sort, window, URL params, list position | REFACTOR AND PORT | 180 (facets 110 + filter-sort 70; URL part in url-state) | 13: app/regulations/page, DashboardBrief, DetailShell (+10) | region facet label is the raw key (:96, :105) (B-1922) [CONFIRMED read; whether keys are codes is HYPOTHESIS]; `newest` sort has no NaN guard on `added` (:262) [HYPOTHESIS: an unparseable date sorts arbitrarily]; sort, window and the surface facets (kind, dimension, theme) are not in the URL contract (A2-part5:L80, :L90, :L107) |
| src/components/list-surface/useListSurfaceFilter.ts | 1-86 (86) | URL-held filter state, replace not push | REFACTOR AND PORT | into url-state (95 with params and region link) | 4: MarketIntelLedger, OperationsLedger, RegulationsLedger, ResearchLedger | re-implements isFilterActive |
| src/components/list-surface/ListSurfaceRailCards.tsx | 1-578 (578) | FiltersRailCard, ObligationsRailCard, CarbonCostRailCard, NextDataDropsRailCard, LegendRailCard | REFACTOR AND PORT (Filters, Legend); MOVES (Obligations to P1-19 regulations; Carbon and Next drops to the market surface) | 130 here, 140 moved | 10: ListSurfaceShell, MapPageView, MarketIntelLedger (+ the other ledgers, WatchlistSurface, SearchResultsView, ObligationRegisterPageView, admin parts) | Obligations card turns a failed route into the Absence "not in primary source", an absence claim for an outage [CONFIRMED read :303-310, :331-332; A2-part5:L77]; Carbon foot is an auditor note on a customer card (:472-473); "Calendar" headLink is a bare `<a>` through RailCard (A2-part3:L44); Clear button minHeight 24, padding 0 (B-1923) |
| src/components/list-surface/ListSurfaceSortRow.tsx | 1-169 (169) | count text, link, segmented Sort or Window control | KEEP AS-IS (comment fixed) | 80 | 3: MarketIntelLedger, RegulationsLedger, ResearchLedger | options minHeight 28 with a 10 px gap (law 2 alternative); stale rationale (B-0156) [CONFIRMED read :137-145 vs :152]; raw `#fff` |
| src/lib/list-pagination.ts | 1-157 (157) | page sizes, remainder trim, keyset cursor, encode and decode | KEEP AS-IS | 55 | 8: api/listings/cursor, api/listings/rest, app/market/page (+5) | decode never throws, tampered input restarts at page one [CONFIRMED read :135-156] |
| src/lib/list-row-fields.ts | 1-93 (93) | ListRow field set from a Resource, watch type | KEEP AS-IS | 45 | 7: MarketIntelLedger, OperationsLedger, RegulationsLedger (+4) | no test on this tree (B-0872); impact falls back to scoreResource, whose keyword heuristics are unanchored (A4d:L212) |
| src/lib/item-links.ts | 1-56 (56) | canonical surface and detail href | KEEP AS-IS | 25 | 19: .discipline/rendering/live/live-candidates, MarketIntelLedger, OperationsLedger (+16) | uncategorized routes to regulations by ruling (:11-18) |
| src/lib/url-params/regulations-region-link.ts | 1-32 (32) | map to regulations region link | REFACTOR AND PORT | into url-state | 1: map/MapPageView.tsx | parse half has no caller and the param name collides with the list's `region` facet (section 4) |
| src/components/shell/ThemeStrip.tsx | 1-9 (9) | server loader of theme chips for list pages | REFACTOR AND PORT | into ThemeStrip (110 with view and reader) | 4: app/market, operations, regulations, research pages | soft-fails to no strip |
| src/components/shell/ThemeStripView.tsx | 1-135 (135) | horizontal strip of theme cards | REFACTOR AND PORT | into ThemeStrip | 1: ThemeStrip.tsx | "Themes across the corpus" (internal word), "Brief - stale" (B-0193); legacy tokens |
| src/components/shell/ItemConnectionsCard.tsx | 1-284 (284) | connections strip (masthead) and rail card | MOVES TO detail (P1-19..24 shared detail) | 130 | 4: OperationsDetailSurface, MarketSignalDetailSurface, RegulationDetailSurface (+ ResearchFindingDetailSurface) | prints basis scores to customers (:260) (A2-part7:L72); link cards no min height (B-1954); bare `<a>` (:139, :268) |
| src/components/shell/RelevanceBadge.tsx | 1-46 (46) | relevance pill and summary | MOVES TO detail | 45 (with Client) | 1: RelevanceBadgeClient | legacy tokens; 9 px pill |
| src/components/shell/RelevanceBadgeClient.tsx | 1-47 (47) | client fetch of /api/detail/relevance | MOVES TO detail | into RelevanceBadge | 4: the four detail surfaces | fail-open by design (B-0192) |
| src/components/shell/PageMasthead.tsx | 1-152 (152) | legacy editorial header | TRASH | 0 | 9: app/admin/parts/* pages only | STALE (B-1000, B-0191); P1-25/26 parts pages switch to ui/Masthead; its mobile 64 px left padding clears a hamburger that no longer exists (:69-77) |
| src/components/shared/InferenceClaim.tsx | 1-143 (143) | inference card and admissibility gate | MOVES TO detail | 75 | 3: admin/InferenceReview, detail/CrossPageSection, detail/InferenceSection | prints the raw CONFIRMED / HYPOTHESIS / REFUTED token and origin class to customers (B-0189); raw `#FFFFFF` (:72-74) |
| src/components/shared/GfmSection.tsx | 1-198 (198) | the markdown section renderer, table-to-cards reflow | MOVES TO P1-17 ui-kit | 120 | 7: detail/CrossPageSection, detail/FactBlocks, OperationsDetailSurface (+4) | strips claim-ledger blocks (:183); legacy tokens; raw rgba borders |
| src/components/shared/MoreBelowDisclosure.tsx | 1-38 (38) | "N more below" disclosure | MOVES TO P1-17 ui-kit | 30 | 2: regulations/DismissedStash, ui/ItemGroup | hex fallback `#1a5fb4` |
| src/components/pages/MarketSignalDetailSurface.tsx | 1-873 (873) | market signal detail body | MOVES TO the market surface lane | 430 | 1: app/market/[slug]/page.tsx | rank 3 |
| src/components/pages/SettingsPage.tsx | 1-639 (639) | settings body | MOVES TO P1-02 workspace | 300 | 1: app/settings/page.tsx | rank 7; fixed 40 px padding with collapse only at 1100 (B-1934); hash links bare `<a>` (:619-633); answers P1-02's gap 1 (workspace.md:299), whose "second writer of sector_profile" is REFUTED: the card writes memory only |
| src/components/resource/SectorSynopsis.tsx | 1-413 (413) | per-sector synopsis view | TRASH | 0 | 0 | B-0664; 25 raw hex sites |
| src/components/resource/IntelligenceBrief.tsx | 1-536 (536) | legacy brief renderer | TRASH | 0 | 1: SectorSynopsis (dead) | B-0662; rewrites brief text before render (:427-452) [CONFIRMED read], an integrity hazard the new tree must not inherit |
| src/components/resource/IntelligenceMetadataStrip.tsx | 1-214 (214) | per-item metadata strip | TRASH | 0 | 1: SectorSynopsis (dead) | B-0663; any fetch error renders nothing (:87-95) |
| src/app/api/intelligence-items/[id]/metadata/route.ts | 1-70 (70) | GET verified item metadata | TRASH | 0 | fetch: IntelligenceMetadataStrip.tsx:78 only | any error answers 404 with the database message (:29-31); `.eq("id", id)` accepts a uuid only [HYPOTHESIS: a legacy id fails as 22P02 and reads as 404] |
| src/lib/format.ts | 1-85 (85) | pinned-locale formatters, pluralize | REFACTOR AND PORT | 75 (with relative-time) | 94: admin/factors, admin/inferences, admin/page (+91) | B-0259 |
| src/lib/relative-time.ts | 1-78 (78) | verbose and compact relative time | REFACTOR AND PORT | into format | 11: admin/CorpusTurnPanel, admin/ErrorGroupsView, admin/IngestRejectionsView (+8) | fallback to Date.now when `now` is not passed (clock-ok callers) |
| src/lib/render-now.ts | 1-11 (11) | one render instant | KEEP AS-IS | 5 | 33: admin/factors, admin/inferences, admin/parts/masthead (+30) | B-0882 (no test) |
| src/lib/text/html-to-text.mjs | 1-25 (25) | strip markup to text | KEEP AS-IS (to core/text) | 11 | 4: scripts/turns/run-ledger-consume, agent/canonical-pipeline, llm/haiku-classify (+ sources/api-transport) | capture-side helper, not shell; placed by directory |
| src/lib/csv/split.mjs | 1-43 (43) | CSV split | KEEP AS-IS (to core/csv) | 39 | 2: scripts/spec09/lib/operator-rows-contract, api/admin/sources/bulk-import | admin-side helper |
| src/lib/cache/revalidate-item.ts | 1-33 (33) | detail cache tags and flush | KEEP AS-IS (P1-07 ports it as core/cache/tags.ts) | counted by P1-07 | 4: api/cache/revalidate-item, corrections/admin-api/handlers, detail/load-detail (+ supabase-server) | B-0861 already CONFIRMED-P1 by P1-07 |
| src/lib/cache/fallback-guard.ts | 1-59 (59) | do not cache a fallback payload | KEEP AS-IS | 30 | 1: lib/data.ts | data.ts is in no Part 1 scope (P1-01 gap) |
| src/app/api/cache/revalidate-item/route.ts | 1-50 (50) | worker flush of one item | REFACTOR AND PORT (merge) | into one route (30) | fetch: workflows/generate-brief.ts:515 (A1-part1:L298) | comment says "sliding window"; the limiter is a fixed window (P1-01 B-1547) |
| src/app/api/revalidate/route.ts | 1-65 (65) | worker flush of 1-50 tags | REFACTOR AND PORT (the surviving route) | 30 | fetch: scripts/lib/revalidate.mjs (corpus-turn, maintenance, population, producers) | not wrapped in withErrorCapture (A1-part1:L417) |
| src/lib/supabase-server.ts 706-983 | (278) | listing query builder, org and public listing reads | REFACTOR AND PORT (to features/lists/read.ts) | 95 (with the payload wrappers) | via lib/data.ts getResourcesOnly, getListingsOnly, getPublicResourcesOnly, getPublicListingsOnly | public read has no `failed` flag: an RPC error returns the same empty as an empty corpus [CONFIRMED read :975-980]; the slim RPC's missing `id` tiebreak is "flagged, not fixed" in its own comment (:750-756), a rule-13 debt the port closes by giving every listing RPC a total order |
| src/lib/supabase-server.ts 985-1180 | (196) | row type, row mapper with chunked timelines | REFACTOR AND PORT (to features/lists/map-rows.ts) | 95 | the readers above | a failed timeline chunk renders those items with no timeline, logged only [CONFIRMED read :1112-1125] |
| src/lib/supabase-server.ts 1383-1533 | (151) | aggregates, surface counts | REFACTOR AND PORT (to features/lists/counts.ts) | 55 | via data.ts getWorkspaceAggregates (app/page, onboarding, nav-counts), getPublicSurfaceCounts | aggregates return zeros on error ("counts render as zero", :1454) [CONFIRMED read]; surface counts return null, the right contract |
| src/lib/supabase-server.ts 2178-2270 | (93) | category routed reads, paged 1000 | REFACTOR AND PORT (to features/lists/category.ts) | 30 | via data.ts getPublic{MarketIntel,Research,Operations}Items | catch returns empty (:2226-2229) |
| src/lib/supabase-server.ts 3008-3143, 3210-3251 | (178) | list payload wrappers with the seed-fallback sentinel | REFACTOR AND PORT (into read.ts) | in read.ts | via data.ts | both wrappers ignore `failed` and report every empty result as `rpc_error` (:3062-3064, :3100-3101) [CONFIRMED read]: the defect the duenext lane fixed one level down (:791-803) re-created one level up |
| src/lib/supabase-server.ts 4395-4423 | (29) | theme chips reader | REFACTOR AND PORT (into ThemeStrip) | in ThemeStrip | ThemeStrip, app/page, DashboardBrief | reads every connection_themes row, then slices 12; a read error returns [] with no log (:4407) |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/ui/shell/AppShell.tsx | AppShell.tsx 31-266; app-shell-banner.ts 1-46 | frame grid inside PageFrame's tokens, drawer state, bootstrap hydration mount, banner on resolved null, onboarding redirect, identity error note with Retry, assistant and back-to-top mounts; setup routes matched by segment; /privacy and the auth routes without the signed-in chrome | 90 |
| src/ui/shell/nav-model.ts | Sidebar.tsx 48-104, 135-151; TopBar.tsx 70-75 | SECTIONS, flat route-to-label table, navTitleForPath, isActivePath (segment), gradientCountsFrom | 40 |
| src/ui/shell/NavCard.tsx | Sidebar.tsx 114-529 | one Wordmark, one NavRows renderer with card and drawer sizes, Account row (opens P1-01's UserMenu), Admin row with attention count and role badge; drawer through Sheet | 190 |
| src/ui/shell/TopBar.tsx | layout/TopBar.tsx 42-202 | mobile bar: band rule, 44 px hamburger, title, search glyph to the command bar, avatar with unread dot | 95 |
| src/ui/shell/Sheet.tsx | Sidebar.tsx 471-525; ListSurfaceShell.tsx 240-317 | side (nav drawer, dvh height, safe area) and bottom (filters) placement over P1-17's Dialog, which supplies scrim, Esc, focus move and return | 30 |
| src/features/shell/ui/CommandBar.tsx (from P1-17) | ui/CommandBar.tsx 118-776; commandBarKeyboard.ts 1-87 | the one search and ask bar composed into the Masthead slot; a failed search says so | counted by P1-17 (280, ui-kit.md section 8) |
| src/ui/shell/scroll-container.tsx | useNearestScrollParent.ts 54-94; AppShell.tsx 254 | context exposing `<main>` to VirtualizedRowList and BackToTop | 20 |
| src/ui/shell/BackToTop.tsx | BackToTop.tsx 1-33 | appears after 400 px of `<main>` scroll, 44 px target | 30 |
| src/ui/shell/PageFrame.tsx | layout/PageFrame.tsx 1-49 | content plus rail grid, padding variants, collapse at 1280, phone padding | 30 |
| src/ui/shell/identity-seed.ts | shell/bootstrap-seed.ts 1-129 | AuthSeed, IdentityStatus, error seed, apply guard, workspace label, admin-nav gate, retry schedule (consumed by P1-01 AuthProvider) | 55 |
| src/ui/shell/use-bootstrap.ts | useWorkspaceBootstrap.ts 26-233; useWorkspaceOverridesHydration.ts 41-74; usePersonalState.ts 34-62 | one per-session bootstrap store, reset on auth change, one hydration of overrides and personal state, types from the P1-02 bootstrap contract | 120 |
| src/ui/shell/use-admin-attention.ts | useAdminAttention.ts 1-278 | attention from the bootstrap; one visible-tab 60 s refresh for platform admins; one type | 55 |
| src/ui/shell/use-unread-count.ts | useUnreadNotificationsCount.ts 19-79 | one gated singleton (signed-in only), shared by NotificationsBell and TopBar | 40 |
| src/ui/shell/nav-counts.server.ts | lib/nav/nav-counts.ts 1-44 | nav counts for the bootstrap route; null on failure, never zeros | 30 |
| src/ui/shell/QueryProvider.tsx | providers/QueryProvider.tsx 18-43 | one QueryClient | 18 |
| src/app/layout.tsx | app/layout.tsx 1-76 | fonts, metadata, `viewport` export, AuthProvider, error reporter, AppShell | 28 |
| src/app/loading.tsx | app/loading.tsx 1-57 | route-neutral skeleton from P1-17's SkeletonPage | 15 |
| src/app/error.tsx | app/error.tsx 1-52 | route-neutral copy, digest reference, retry, report; no raw message, no vendor name | 28 |
| src/app/not-found.tsx | app/not-found.tsx 11-75 | honest 404 with a 44 px link | 30 |
| src/app/privacy/page.tsx | app/privacy/page.tsx 1-380 | copy verbatim until counsel rules; tokens; no nested `<main>` | 320 |
| src/ui/list-surface/ListSurface.tsx | ListSurfaceShell.tsx 64-633 | masthead, band tiles, mobile facet strip, Filters sheet, rows grouped or flat with virtualization, band foot, slots (aboveRows, sortRow, sectionFoot, belowRows, rail), inside PageFrame, CSS once | 250 |
| src/ui/list-surface/rail.tsx | ListSurfaceRailCards.tsx 45-252, 551-578 | FiltersRailCard (checkbox facets, live counts, +N more, Clear N), LegendRailCard | 130 |
| src/ui/list-surface/SortRow.tsx | ListSurfaceSortRow.tsx 22-169 | count, link, segmented Sort or Window | 80 |
| src/ui/list-surface/facets.ts | list-surface-helpers.ts 6-127, 347-411 | facet options and liveFacetCounts (corpus at rest, selection tallies excluding the group's own selection) | 110 |
| src/ui/list-surface/filter-sort.ts | list-surface-helpers.ts 129-144, 186-312 | filter state, filterRows, sortResourceRows (NaN-safe), window filter, withListPosition | 70 |
| src/ui/list-surface/url-state.ts | list-surface-helpers.ts 146-184, 413-464; useListSurfaceFilter.ts 23-86; regulations-region-link.ts 1-32 | one param vocabulary for every list facet, sort, window and surface extras; replace not push; the map's region link resolves to the list's own jurisdiction tokens | 95 |
| src/ui/list-surface/use-list-rows.ts | ListSurfaceShell.tsx 642-677 | first page plus remainder with an explicit failed state and Retry | 35 |
| src/ui/list-surface/ThemeStrip.tsx | shell/ThemeStrip.tsx 1-9; shell/ThemeStripView.tsx 1-135; supabase-server.ts 4395-4423 | theme chips strip and its bounded reader | 110 |
| src/core/lists/pagination.ts | list-pagination.ts 25-157 | page sizes, remainder trim, keyset cursor | 55 |
| src/core/lists/row-fields.ts | list-row-fields.ts 1-93 | ListRow fields, watch type | 45 |
| src/core/lists/item-links.ts | item-links.ts 1-56 | canonical surface, detail href | 25 |
| src/features/lists/read.ts | supabase-server.ts 706-983, 3008-3143, 3210-3251 | `readListing({ orgId?, rpc, page })` returning rows, archived, overrides when org-scoped, and `failed` | 95 |
| src/features/lists/map-rows.ts | supabase-server.ts 985-1180 | row type, mapper, chunked timelines with a per-chunk failure count | 95 |
| src/features/lists/counts.ts | supabase-server.ts 1383-1533 | aggregates and surface counts, null on failure | 55 |
| src/features/lists/category.ts | supabase-server.ts 2178-2270 | category routed reads, paged, failure surfaced | 30 |
| src/core/format.ts | format.ts 1-85; relative-time.ts 1-78 | pinned locale, dates, numbers, pluralize, relative time | 75 |
| src/core/render-now.ts | render-now.ts 1-11 | one render instant | 5 |
| src/core/text/html-to-text.ts | text/html-to-text.mjs 15-25 | strip markup | 11 |
| src/core/csv/split.ts | csv/split.mjs 1-43 | CSV split | 39 |
| src/core/cache/fallback-guard.ts | cache/fallback-guard.ts 1-59 | fallback payloads never cached | 30 |
| src/app/api/revalidate/route.ts | api/revalidate/route.ts 36-65; api/cache/revalidate-item/route.ts 21-50 | one worker flush: `tags` or `itemId` | 30 |
| core/cache/tags.ts (P1-07) | cache/revalidate-item.ts 1-33 | tag vocabulary and item flush | counted by P1-07 |
| src/ui/shell/UserMenu.tsx (from P1-01) | auth/UserMenuDropdown.tsx 43-134 | account dropdown with Esc and focus return | counted by P1-01 (70) |
| detail components (P1-19..24 shared detail) | shell/ItemConnectionsCard.tsx 1-284; shell/RelevanceBadge.tsx and Client; shared/InferenceClaim.tsx | connections strip and rail card, relevance badge, inference card with the status vocabulary rendered in words | 270 |
| P1-17 ui-kit | shared/GfmSection.tsx 1-198; shared/MoreBelowDisclosure.tsx 1-38 | the one markdown renderer, the disclosure (ui-kit.md section 8 already takes MoreBelowDisclosure as src/ui/MoreBelowDisclosure.tsx; GfmSection is this lane's proposal, gap 9) | 150 |
| market surface | pages/MarketSignalDetailSurface.tsx 1-873; ListSurfaceRailCards.tsx 377-549 | market detail body; carbon cost and next data drops rail cards | 430 + 80 |
| P1-19 regulations | ListSurfaceRailCards.tsx 280-352 | obligations rail card with an error state | 60 |
| P1-02 workspace | pages/SettingsPage.tsx 1-639 | settings body | 300 |

### Data model (columns actually used; "unused" means no code in this scope reads it)

- Listing RPC rows (WorkspaceItemRpcRow, supabase-server.ts 991-1040) mapped by baseResourceFields (1855, not read here) and the mapper: id, legacy_id, title, item_type, domain, effective_priority (or priority), effective_archived, added_date, tags, jurisdictions, jurisdiction_iso, transport_modes, category, source_id, source_url, compliance_deadline, item_grade, origin_class, last_regenerated_at; category-RPC superset severity, signal_band, theme, trajectory_points, what_it_changes, does_not_resolve, conversion_trigger, cross_references, cost_mechanism, penalty_range, enforcement_body, requirement_trajectory. Projected but trimmed from list rows by toLedgerRowPayload (list-pagination.ts:56-78): key_data, reasoning, full_brief, regulatory conflict, trajectory points, operational impact, risk register, recommended actions, open questions, source urls, cost mechanism, penalty range, enforcement body, requirement trajectory. Never filled on any Resource: `recommended_actions` (migration 334; section 4).
- item_timelines: item_id, milestone_date, label, is_completed, sort_order (anon client, chunks of 150).
- connection_themes: id, member_ids, dominant_signals, density, convergence, surfaces, pivots; theme_briefs: theme_id, title, brief_md, member_hash, generated_at; connection_theme_runs (lineage); intelligence_items verified rows by id for chip members.
- Aggregates jsonb: total_items, by_priority, by_status, by_jurisdiction, total_jurisdictions, last_updated_at, plus by_severity and by_band from get_surface_counts. Unused by this scope: by_status.
- Bootstrap bundle (P1-02 route): personalState, members, adminAttention (unused, section 4), overrides, navCounts, assistantEnabled.
- Metadata route (TRASH): intelligence_items id, legacy_id, title, item_type, severity, priority, urgency_tier, format_type, topic_tags, operational_scenario_tags, compliance_object_tags, related_items, intersection_summary, sources_used, last_regenerated_at, regeneration_skill_version.
- Views: none. Writes: none in scope (the revalidate routes flush caches only).

### List variants and how they collapse into the one component

| variant | today | collapses to |
|---|---|---|
| Regulations ledger | RegulationsLedger mounts ListSurfaceShell with SortRow (four sorts incl. My order), useRemainderFetch, Obligations card, DismissedStash in belowRows | ListSurface + use-list-rows; Obligations card from P1-19 in the rail slot |
| Market Intel ledger | MarketIntelLedger mounts ListSurfaceShell with SortRow (three sorts), headline ribbon in aboveRows, Carbon and Next drops cards; kind filter and sort in local state; voided fetchRemainder (A2-part5:L90) | ListSurface; kind and sort in url-state; dead remainder removed |
| Research ledger | ResearchLedger mounts ListSurfaceShell with the Window row and a theme facet as secondary group | ListSurface; window and theme in url-state |
| Operations ledger | OperationsLedger mounts ListSurfaceShell with the region-dimension matrix and statements in aboveRows; remainder failure falls back to first-page counts (A2-part5:L107) | ListSurface + use-list-rows failure state; dimension in url-state |
| Watchlist | WatchlistSurface copies the frame (PageFrame + LIST_SURFACE_MOBILE_CSS), ListRows, FiltersRailCard, Legend | ListSurface without band tiles (a `bands={false}` slot) |
| Obligation register | ObligationRegisterPageView copies the frame and mobile CSS, own rows, rail cards | ListSurface with register rows in the rows slot |
| Coverage | CoveragePageView copies the mobile CSS twice | ListSurface frame only, or PageFrame (owner: sources lane P1-05/06) |
| Search results | SearchResultsView: PageFrame + ListRow + Legend | row consumer: PageFrame + ListRow (not a list surface) |
| Map register | MapPageView: ListRow register variant + Legend | row consumer; its region link goes through url-state |
| Dashboard Due next / What changed | DashboardBrief: PageFrame + ListRow | row consumer (P1-24) |
| Portfolio detail, command bar dropdown | ListRow | row consumers (ListRow is P1-17's) |

Rows on every variant are ListRow (P1-17), measured at 375 px by the UX smoke (PROP-025, PROP-124); the list surface owns the band card, the band foot and the facet rows around them, which this register measures by reading only: facet rows minHeight 44 (ListSurfaceRailCards.tsx:121), +N more 44 (:176), sort options 28 with 10 px gaps (SortRow :152, gap :121), band foot link 24 inside a 10 px padded strip (Shell :573, :556), Filters button 44 (Shell :214), sheet close 44 (:283-284) [CONFIRMED read; not rendered].

### Interface to other modules

- Exports offered: AppShell, PageFrame, Sheet, ScrollContainer context, BackToTop, identity-seed (to P1-01 AuthProvider and identity-loader), useBootstrap, useAdminAttention (to P1-25/26 AdminDashboard and rails), useUnreadCount (to P1-22/23 NotificationsBell), getNavCounts (to the P1-02 bootstrap route), navTitleForPath (to parts pages); ListSurface and its slots, FiltersRailCard, LegendRailCard, SortRow, facets, filter-sort, url-state (incl. BAND and SORT params used by P1-24's "All N" links and DetailShell's list position), useListRows, ThemeStrip; readListing, mapRows, counts, category reads (to every surface, P1-24 dashboard, P1-22/23 community through getListingsOnly); pagination and cursor (to /api/listings/rest and /cursor), toListRowFields, itemDetailHref (19 importers), format, render-now, htmlToText (to capture and intake), splitCsv (to sources admin), fallback guard (to data.ts), the revalidate route (to scripts/lib/revalidate.mjs and workflows/generate-brief.ts).
- Imports needed: P1-17 ui-kit (Masthead with its command-bar slot, Dialog, BandTile, BandTileRow, BandGroupHeader, ListRow, SectionCard, StateNote, FilterChip and FilterChipGroup, Skeletons, RailCard, ImpactMeter, BandGradientRule, Absence, ErrorState, a dialog primitive if any, tokens); P1-01 auth-db (useAuth: user, identityStatus, isPlatformAdmin, retryIdentity, signOut; UserMenu; authedFetch; core/db clients); P1-02 workspace (workspaceStore orgName and userRole, resourceStore setOverrides, setPersonalState and mergeWithOverrides, the bootstrap route and its types); P1-07 capture (GlobalErrorReporter, reportClientError, core/cache/tags.ts); P1-22/23 (notifications route); P1-25/26 (attention route).
- Consumers by module: P1-19..24 surfaces (the four ledgers mount ListSurface; detail pages take ItemConnections, Relevance, Inference, GfmSection; DashboardBrief takes PageFrame, ListRow, url-state, theme chips); P1-01 (identity-seed); P1-02 (nav counts into bootstrap; SettingsPage lands there); P1-25/26 (parts pages render NavCard and stop using PageMasthead).
- **Gaps for the coordinator:** (1) the surface ids are only partly named in the registers this lane read: P1-19 regulations (sources-b.md:144), P1-21 operations matrix (the brief's intake-a ruling), P1-24 dashboard (workspace.md:298); the market and research ids are not stated, so this register says "market surface" and "research surface". (2) components/ledger/VirtualizedRowList.tsx (206 lines, read by A2-part7:L66, not in this scope) has one importer, ListSurfaceShell [CONFIRMED census]: it belongs with the list surface. (3) components/AskAssistant.tsx (528 lines, A2-part3:L58) is mounted only by AppShell and sits in no Part 1 scope this lane can see. (4) lib/data.ts, the cache wrapper over every list reader here, is still in no scope (P1-01's gap). (5) the per-route loading.tsx files under market, operations, regulations and research (A1-part2:L170-191) are in no scope this lane can see (globals.css and theme.css are P1-17's, ui-kit.md section 1). (6) the privacy copy needs a counsel or operator ruling on the processor list before the port (LinkedIn OAuth: TRASH as code in P1-01, in flight per P1-02; Browserless retired by the free rule; Stripe absent from package.json). (8) P1-02's gap on the owner of src/lib/hooks (workspace.md section 8) is answered here: the six hooks are shell data and port as ui/shell/use-bootstrap, use-admin-attention, use-unread-count and the scroll-container context. (9) GfmSection (seven importers, all detail layers) is proposed for P1-17's kit; ui-kit.md does not name it, so the coordinator confirms the owner. (10) P1-17 hands the CommandBar to this module (ui-kit.md section 8): it is the shell's search and ask surface and lands as src/features/shell/ui/CommandBar.tsx; its failed-search defect (A2-part3:L26) is fixed on the port under INV-263. (11) Lanes merged after this register was drafted hand this module more: P1-22 community-a sends NotificationsBell and NotificationsList to the shell (community-a.md section 7), which fits use-unread-count above; P1-21 research-ops names ThemeBriefCard (components/detail, not read here) as P1-18's beside ThemeStrip (research-ops.md section 8). Neither file was read by this lane; their LOC is counted by those lanes. (7) WatchlistSurface, ObligationRegisterPageView, CoveragePageView, SearchResultsView and MapPageView are list variants outside this scope; the table above states what each collapses to.

### Invariants this code enforces

Already in data-invariants.md and binding here: INV-139 (RLS everywhere; the shell's anon timeline read relies on it), INV-149 (workspace org scope; the org-scoped listing reads). Appended by this lane, same commit: INV-263 (a failed read is never rendered as an honest empty or a zero: listing reads, remainder fetch, nav counts, aggregates, obligations rail), INV-264 (one URL vocabulary for list state, and a shared param name means one thing), INV-265 (an item's detail href comes only from canonicalSurfaceForItem over the raw item_type and domain, uncategorized to regulations), INV-266 (keyset pagination is lossless: the cursor is the last row's effective priority, added date and id from an RPC whose own order ends in id; no outer order over an RPC with its own total order; a malformed cursor restarts at page one), INV-267 (live facet counts: corpus figures only at rest, otherwise tallies over the current selection excluding the group's own selection), INV-268 (one render instant per server render, threaded to the client as nowIso; the client reads its own clock only after mount).

Properties (not data invariants) the new tree must carry: PROP-025 and PROP-124 (every row component measured at 375, 768, 1024 and 1280 by the UX smoke), PROP-073 (real fonts, no title narrower than its longest word); plus four this register adds to the port's acceptance: route and nav matching by segment, not string prefix; every overlay closes on Esc and returns focus; no signed-out page runs an authenticated poll; a list surface states which count regime it is in.

### Rulings the code embodies (cite)

- Nav 252 px, one width; sections Brief, Intelligence, Network; counts right-aligned (UI handoff 2026-09-06 README 0.3; Sidebar.tsx:3-11, :60-87).
- Footer is two rows, Account then Admin; sign-out lives in Account; no third row (operator rulings 2026-09-07 and 2026-09-08; Sidebar.tsx:242-262).
- The Admin row shows exactly when /admin would admit, on `is_platform_admin`, never the workspace role (lane AUTH-IDENTITY 2026-09-24; Sidebar.tsx:119-125; bootstrap-seed.ts:112-115).
- The nav cap is the band gradient from live counts, never a fabricated split; one of three places carrying the band rule (README 0.2, ruling 5.2; Sidebar.tsx:140-151, :425-430).
- Nav card top margin 20 px (operator audit item 4.2, 2026-09-07; Sidebar.tsx:432-434).
- Mobile: 288 px drawer, 56 px top bar including the band rule, search glyph focuses the page's command bar, unread dot is notifications only (mobile-390 spec, lane mobframe 2026-09-07; Sidebar.tsx:467-470; TopBar.tsx:12-39).
- No page-wide disclaimer bar; the legal wording stays only on the auth frame (operator ruling 2026-09-08; AppShell.tsx:248-253).
- "No workspace" is said only on a resolved null; a failed lookup is an error note with Retry; a resolved no-membership user goes to onboarding (lanes PERF-MERGE 2026-09-04, AUTH-IDENTITY 2026-09-24, AUTH-2 2026-10-06; AppShell.tsx:55-113; app-shell-banner.ts:1-46).
- Public rows render first; per-org overrides hydrate once in the shell from the bootstrap (ADR-026 follow-up, PERF-10; useWorkspaceOverridesHydration.ts:3-35).
- The root layout calls no dynamic API (ADR-026, PERF-10; layout.tsx:30-52); fonts are self-hosted (2026-08-10 build reliability; layout.tsx:2-17).
- Filters live in the rail on desktop, a chip strip and a sheet on mobile (operator audit 2026-09-07; ListSurfaceShell.tsx:19-37); the Filters card carries no footnote anywhere (operator ruling 2026-09-08; ListSurfaceShell.tsx:614-626).
- A band's "All N" link renders only when it reveals more rows (operator audit P0 1.1; ListSurfaceShell.tsx:541-548).
- Facet counts are live: corpus at rest, selection tallies when filtered, each group excluding its own selection (COUNTS-61; list-surface-helpers.ts:314-345); facet state lives in the URL, replace not push (COUNTS-61; useListSurfaceFilter.ts:6-20).
- Mode labels are display forms over the canonical value; the canonical ocean mode is `ocean` (operator ruling 2026-08-12, migration 263; list-surface-helpers.ts:17-32).
- "My order" is the identity sort, no fabricated drag order (list-surface-helpers.ts:253-255); a window filter never drops an undated item (:293-296); the detail-return contract is list, pos, of, prev, next (:214-232).
- One render instant per server render (HYDRATION-59; render-now.ts:1-11); one pinned locale (C6, RECONCILE 2026-09-04; format.ts:18-38).
- An unmatched item routes to regulations, kept navigable and visible to the surface-visibility audit (item-links.ts:11-25).
- Settings: one theme, light only (SettingsPage.tsx:250-253); no PDF export segment with nothing behind it (:332-334); the audit-log link removed until the surface exists (ruling 1.1 class; :198-204); second-level items are sections under one section index, not a second tab row (ruling R9; :65-79).
- Accordions and disclosures closed on first render (fsi-app CLAUDE.md accordion rule; operator ruling 2026-09-08 cited at IntelligenceBrief.tsx:455-458, a file this register trashes, the ruling stands for its replacement).

### Proof that the module works in the new tree

1. Unit tests, each red against a deliberately broken copy first: nav-model isActivePath and navTitleForPath (`/market` vs `/marketplace`, `/auth` vs `/author`); the banner and redirect table across pending, resolved, error, signed-out and setup routes; identity-seed; liveFacetCounts with one and two active facets; url-state round trip of every facet, sort, window and the map region link; filterByWindow keeps undated rows; sortResourceRows with an unparseable date; cursor encode, decode and tamper; toLedgerRowPayload trims; canonicalSurfaceForItem table; readListing and counts return `failed` (not empty, not zeros) on a stubbed RPC error; getNavCounts returns null on failure; use-list-rows exposes the failed state.
2. Playwright UX smoke at 375, 768, 1024 and 1280 (PROP-025, PROP-124): shell with the drawer open (Esc closes, focus returns to the hamburger), top bar, each list variant, the filter sheet, band foot and facet targets at or above the law-2 floor, BackToTop appearing after scrolling `<main>`.
3. Attack-style checks wired into the lane: an anonymous /privacy issues no notifications or admin request; a failing remainder route renders a failure note with Retry, not a short list; a failing obligations route renders an error state, not "not in primary source"; a failing aggregates read leaves the nav counts blank, not zero.
4. `npm run typecheck` and `next build` (the four-step CI).

### Port order

1. core: format, render-now, text, csv, fallback guard; core/lists pagination, row-fields, item-links.
2. features/lists: map-rows, read, counts, category (after P1-01's core/db).
3. ui/shell: identity-seed, nav-model, Sheet, scroll-container, PageFrame, QueryProvider, use-bootstrap, use-admin-attention, use-unread-count, nav-counts, NavCard, TopBar, BackToTop, AppShell; app layout, loading, error, not-found; privacy after the ruling.
4. ui/list-surface: facets, filter-sort, url-state, use-list-rows, SortRow, rail, ListSurface, ThemeStrip.
5. Hand-offs: detail components to the surface lanes, GfmSection and MoreBelowDisclosure to P1-17, MarketSignalDetail and the market rail cards to the market surface, the obligations card to P1-19, SettingsPage to P1-02; delete the TRASH rows.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| 1440 frame, 252 px nav track, one-track collapse under 768, `<main>` scroller | AppShell.tsx | ui/shell/AppShell |
| Nav sections with live counts and active row | Sidebar.tsx | ui/shell/NavCard, nav-model |
| Band-gradient nav cap from live counts | Sidebar.tsx, BandGradientRule (P1-17) | NavCard, TopBar |
| Account row opening the account menu; signed-out Account link | Sidebar.tsx | NavCard + P1-01 UserMenu |
| Admin row with attention count and workspace role badge | Sidebar.tsx, useAdminAttention.ts | NavCard, use-admin-attention |
| Mobile drawer (288 px, dvh, safe-area) closing on navigation | Sidebar.tsx, AppShell.tsx | NavCard via Sheet |
| Mobile top bar: hamburger, page title, search glyph to the command bar, avatar with unread dot | TopBar.tsx, useUnreadNotificationsCount.ts | ui/shell/TopBar, use-unread-count |
| No-workspace banner and onboarding redirect on a resolved null | AppShell.tsx, app-shell-banner.ts | AppShell |
| Identity error note with Retry | AppShell.tsx | AppShell |
| Overrides and personal-state hydration from one bootstrap | useWorkspaceOverridesHydration.ts, usePersonalState.ts, useWorkspaceBootstrap.ts | use-bootstrap |
| Assistant flag and nav counts through the bootstrap | useWorkspaceBootstrap.ts, nav-counts.ts | use-bootstrap, nav-counts.server |
| Back to top | BackToTop.tsx | ui/shell/BackToTop (working) |
| Content frame with rail | PageFrame.tsx | ui/shell/PageFrame |
| Self-hosted fonts, metadata, one QueryClient | layout.tsx, QueryProvider.tsx | app/layout, QueryProvider |
| Loading, error (with report) and not-found states | loading.tsx, error.tsx, not-found.tsx | app/* |
| Privacy policy | privacy/page.tsx | app/privacy (copy pending ruling) |
| Masthead with page-scoped command bar on every list | ListSurfaceShell.tsx | ListSurface (Masthead from P1-17) |
| Band tiles as a facet, skeleton tiles while loading | ListSurfaceShell.tsx | ListSurface |
| Rows grouped by band, per-band cap, "All N" expand, "then <band> · N" transition, end of list | ListSurfaceShell.tsx | ListSurface |
| Show as one list (flat) | ListSurfaceShell.tsx, SortRow | ListSurface, SortRow |
| Virtualized rows past 30 | ListSurfaceShell.tsx, VirtualizedRowList | ListSurface (VirtualizedRowList via the coordinator's gap 2) |
| Per-band transition strip (sectionFoot), aboveRows, belowRows, stateNote, emptyState slots | ListSurfaceShell.tsx | ListSurface |
| Mobile facet chip strip and Filters sheet | ListSurfaceShell.tsx | ListSurface + Sheet |
| Filters rail card with checkbox facets, live counts, +N more, Clear N | ListSurfaceRailCards.tsx | ui/list-surface/rail |
| Legend rail card with the impact meter and tier scale | ListSurfaceRailCards.tsx | rail |
| Obligations next 30 days rail card | ListSurfaceRailCards.tsx | P1-19 regulations (with an error state) |
| Carbon cost per FEU and Next data drops rail cards | ListSurfaceRailCards.tsx | market surface |
| Sort row (Next date, Newest, A-Z, My order) and Window row (7d, 30d, 90d, All) | ListSurfaceSortRow.tsx, list-surface-helpers.ts | SortRow, filter-sort |
| Facet options (mode display labels, topic, tier, region, band) with live counts | list-surface-helpers.ts | facets |
| Free-text search over title, jurisdiction, topic, tags, what and why | list-surface-helpers.ts | filter-sort |
| URL-held filter state; band and sort deep links from the dashboard | list-surface-helpers.ts, useListSurfaceFilter.ts | url-state |
| Detail-return position (In this list N of M, prev, next) | list-surface-helpers.ts withListPosition | filter-sort |
| Map to regulations region link | regulations-region-link.ts | url-state |
| First page 60 server-side, remainder after paint, cursor pages of 30 | list-pagination.ts, useRemainderFetch | core/lists/pagination, use-list-rows |
| Row fields, watch type, canonical detail link | list-row-fields.ts, item-links.ts | core/lists |
| Org and public listing reads, chunked timelines, aggregates, surface counts, category reads | supabase-server.ts slices | features/lists |
| Themes across pages strip on the four lists | ThemeStrip.tsx, ThemeStripView.tsx, fetchThemeChips | ui/list-surface/ThemeStrip |
| Connections strip and rail card on detail pages | ItemConnectionsCard.tsx | detail (P1-19..24) |
| Viewer relevance badge on detail pages | RelevanceBadge.tsx, RelevanceBadgeClient.tsx | detail |
| Inference card with admissibility gate | InferenceClaim.tsx | detail |
| Markdown sections with GFM tables reflowed to cards on phones | GfmSection.tsx | P1-17 ui-kit |
| "N more below" disclosure | MoreBelowDisclosure.tsx | P1-17 ui-kit |
| Market signal detail page | MarketSignalDetailSurface.tsx | market surface |
| Settings page sections and section index | SettingsPage.tsx | P1-02 workspace |
| Pinned-locale numbers and dates, plural agreement, relative time, one render instant | format.ts, relative-time.ts, render-now.ts | core |
| HTML to text, CSV split | text/html-to-text.mjs, csv/split.mjs | core |
| Detail cache tags and flush; fallback never cached; worker flush routes | cache/*, api/cache/revalidate-item, api/revalidate | P1-07 core/cache/tags, core/cache/fallback-guard, one route |
| Per-sector synopsis view with ten-section parser, cross-sector headline and other-sector accordions | SectorSynopsis.tsx, IntelligenceBrief.tsx, IntelligenceMetadataStrip.tsx, metadata route | NOT PORTED as code (never mounted; SHELVED feature per fsi-app CLAUDE.md "Sector Activation"). The requirement, per-sector reporting with an opt-in notice, stays recorded there; when activated it is built fresh on GfmSection |
| Legacy editorial masthead | PageMasthead.tsx | NOT PORTED (superseded by P1-17 Masthead on every customer route; parts pages switch) |

### Defects the new code must not repeat (from the backlog rows in scope; the STATUS cells are written in the backlog file in this commit)

A signed-in shell and authenticated polls on a public page (B-0121, B-0153); a back-to-top bound to a scroller that never scrolls and a 40 px target (B-0658, B-0127); an error page that blames the dashboard and the database for every failure (B-0093); a failed remainder read rendered as a short list (B-0155); stale rationale comments (B-0156, B-0190 refuted on this tree); raw status tokens on a customer card (B-0189); duplicated pollers and types (B-0562, B-1029, B-2159); a bootstrap never reset on sign-out (B-1566); a scroll container resolved once (B-0261); write-only settings (B-0543); overlays without Esc or focus handling (B-1955); fixed 40 px padding at phone width (B-1934).
