# P1-19 regulations: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-19, DISPOSITION lane, read-only. Tree: origin/master `c831e82b5`. Written by the cloud session on 2026-10-12. Every file in SCOPE was read whole with the Read tool; the coverage table below records each read. The two shared read-layer files were read in the slices the coordinator's ruling assigns to this surface (auth-db.md sections 7 and 8 name them: "detail (3786-4234), cross-page themes (4236-4423)" plus the /map payload). Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. Prior registers: A2-part4 read whole; the detail and map rows of A2-part5 read whole (A2-part5:L63-L74, L82-L84, plus its summary L9-L42); A3, A4, A4a, A4d, A1-part1 and A1-part2 read as scope-filtered extractions (every line naming an in-scope path, 140 lines). A finding a prior register carries is cited `<register>:L<n>`.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` and `{/* */}` blocks, leading-`*` lines stripped). Raw lines are `wc -l`.

## 1. Header and coverage

Module: regulations. The Regulations surface (the /regulations ledger, the /regulations/[slug] detail page, the /regulations/register obligation register page), the ONE detail architecture all four detail surfaces share (components/detail, lib/detail, the detail loader and the item read), the jurisdiction model (lib/jurisdictions, the JURISDICTIONS table in lib/constants.ts), the statutory computation layer (lib/statutory), the applicability gate (lib/applicability), the Map (a view of Regulations content: app/map, components/map, lib/map), and the detail-side parsers under src/lib/agent that the coordinator assigned here.

Coverage (70 files, 11,894 raw lines, 8,196 code lines; plus read-layer slices of 1,077 raw and 683 code lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/) | raw lines | code lines | read calls |
|---|---|---|---|
| src/app/regulations/page.tsx | 72 | 45 | 1 |
| src/app/regulations/loading.tsx | 22 | 21 | 1 |
| src/app/regulations/[slug]/page.tsx | 226 | 115 | 1 |
| src/app/regulations/[slug]/loading.tsx | 21 | 20 | 1 |
| src/app/regulations/register/page.tsx | 25 | 21 | 1 |
| src/components/regulations/RegulationsLedger.tsx | 355 | 233 | 1 |
| src/components/regulations/RegulationDetailSurface.tsx | 675 | 498 | 1 |
| src/components/regulations/PriorityDropdown.tsx | 471 | 318 | 1 |
| src/components/regulations/ObligationRegisterFilterBar.tsx | 486 | 314 | 1 |
| src/components/regulations/ObligationRegisterPageView.tsx | 210 | 152 | 1 |
| src/components/regulations/ObligationRegister.tsx | 183 | 78 | 1 |
| src/components/regulations/UpcomingObligationsStripView.tsx | 313 | 253 | 1 |
| src/components/regulations/UpcomingObligationsStrip.tsx | 143 | 88 | 1 |
| src/components/regulations/BindingBanner.tsx | 228 | 190 | 1 |
| src/components/regulations/OwnerTeamCard.tsx | 174 | 120 | 1 |
| src/components/regulations/AffectedLanesCard.tsx | 159 | 126 | 1 |
| src/components/regulations/DismissedStash.tsx | 120 | 95 | 1 |
| src/components/regulations/CorridorsAppliedStripView.tsx | 95 | 91 | 1 |
| src/components/regulations/CorridorsAppliedStrip.tsx | 29 | 22 | 1 |
| src/components/regulations/format-fixed-date.ts | 27 | 14 | 1 |
| src/components/detail/DetailShell.tsx | 628 | 369 | 1 |
| src/components/detail/CrossPageSection.tsx | 306 | 274 | 1 |
| src/components/detail/ItemAssignBlock.tsx | 315 | 274 | 1 |
| src/components/detail/ItemNotesBlock.tsx | 297 | 260 | 1 |
| src/components/detail/SourcesGrid.tsx | 161 | 119 | 1 |
| src/components/detail/primitives.tsx | 126 | 72 | 1 |
| src/components/detail/InferenceSection.tsx | 69 | 62 | 1 |
| src/components/detail/item-collab-client.ts | 63 | 48 | 1 |
| src/components/detail/FactBlocks.tsx | 56 | 43 | 1 |
| src/components/detail/RequirementTrajectory.tsx | 37 | 29 | 1 |
| src/components/detail/ThemeBriefCard.tsx | 35 | 33 | 1 |
| src/components/detail/shared-props.ts | 17 | 13 | 1 |
| src/lib/detail/fact-card-model.ts | 595 | 355 | 1 |
| src/lib/detail/load-detail-core.ts | 332 | 181 | 1 |
| src/lib/detail/fact-card-fixtures.ts | 283 | 231 | 1 |
| src/lib/detail/inference-view.mjs | 169 | 89 | 1 |
| src/lib/detail/timeline-math.ts | 168 | 93 | 1 |
| src/lib/detail/fact-paragraphs.ts | 161 | 84 | 1 |
| src/lib/detail/state-note-fixtures.tsx | 156 | 144 | 1 |
| src/lib/detail/load-detail.ts | 151 | 109 | 1 |
| src/lib/detail/id-redirect.ts | 142 | 107 | 1 |
| src/lib/detail/action-card-fixtures.ts | 131 | 126 | 1 |
| src/lib/detail/section-index-data.ts | 86 | 48 | 1 |
| src/lib/detail/requirement-trajectory-classify.ts | 66 | 39 | 1 |
| src/lib/detail/action-card-common-props.tsx | 57 | 44 | 1 |
| src/lib/detail/meta-line.ts | 48 | 26 | 1 |
| src/lib/detail/use-section-scroll-spy.ts | 40 | 25 | 1 |
| src/lib/detail/fact-card-panel21c-fixture.ts | 34 | 32 | 1 |
| src/lib/detail/section-index-fixtures.ts | 18 | 17 | 1 |
| src/lib/detail/cited-item-links.ts | 17 | 15 | 1 |
| src/lib/detail/item-id-filter.ts | 7 | 5 | 1 |
| src/app/api/detail/relevance/route.ts | 79 | 44 | 1 |
| src/lib/statutory/fueleu-annex-iv.mjs | 96 | 44 | 1 |
| src/lib/statutory/types.ts | 63 | 35 | 1 |
| src/lib/statutory/types.contractable-barrier.check.ts | 25 | 15 | 1 |
| src/lib/jurisdictions/iso.ts | 222 | 130 | 1 |
| src/lib/jurisdictions/tiers.ts | 213 | 130 | 1 |
| src/lib/regulation-item-types.ts | 19 | 12 | 1 |
| src/lib/applicability/compute-applicability.mjs | 90 | 67 | 1 |
| src/lib/constants.ts | 327 | 230 | 1 |
| src/components/map/MapPageView.tsx | 517 | 384 | 1 |
| src/components/map/MapView.tsx | 280 | 189 | 1 |
| src/components/map/jurisdictionCentroids.ts | 37 | 32 | 1 |
| src/app/map/page.tsx | 94 | 67 | 1 |
| src/lib/map/jurisdiction-rollup.ts | 46 | 26 | 1 |
| src/lib/agent/extract-regulation-sections.ts | 492 | 325 | 1 |
| src/lib/agent/parse-record-sections.ts | 189 | 110 | 1 |
| src/lib/agent/extract-recommended-actions.mjs | 148 | 80 | 1 |
| src/lib/agent/timeline-parse.mjs | 114 | 75 | 1 |
| src/lib/agent/source-entry-filter.mjs | 38 | 21 | 1 |
| TOTAL (70 files) | 11894 | 8196 | 70 |
| src/lib/supabase-server.ts lines 3140-3274 (map payload, listings fetchers) | 135 | 69 | 1 |
| src/lib/supabase-server.ts lines 3776-4445 (detail item, sections, cross-page, inferences, theme chips) | 670 | 446 | 2 (offsets 3776, 4246) |
| src/lib/data.ts lines 440-640 (getPublicListingsOnly, getPublicSurfaceSlugs, getListingsMapData) | 201 | 106 | 1 |
| src/lib/data.ts lines 860-929 (getPublicSurfaceCounts) | 70 | 21 | 1 |
| src/lib/data.ts lines 1050-1148 (getPublicObligationRegisterFirstPage) | 99 | 41 | 1 |

Files not read whole: none in the 70-file scope. supabase-server.ts and data.ts were read in the slices above only, by the ruling that their surface read layer belongs to the surface that calls it; the rest of those two files is P1-01's register and other surfaces'. Test files: none exist beside the scope on this tree (`git ls-files` under fsi-app matching `test.mjs`, `npmtest.mjs`, `.test.` returns 0) [CONFIRMED]; the tests the 2026-10-11 registers cite for this scope (load-detail-core.test.mjs 29, id-redirect.test.mjs 15, timeline-math.test.mjs 24, fact-card-model.test.mjs 38, BindingBanner.test.mjs 9, and others, A4:L309-L341) were removed by CLEAN-3 f906b2102 [CONFIRMED: `git log --diff-filter=D` names f906b2102 for id-redirect.test.mjs]. The one proof that still executes is `src/lib/statutory/types.contractable-barrier.check.ts`, a compile-time attack included by tsconfig `**/*.ts` and run by `npm run typecheck` in .github/workflows/ci.yml:48 [CONFIRMED read].

Consumer evidence: for each file, a scan of import lines (`from "@/<module>"` or a relative path ending in the module's basename) across fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github/workflows, then for each exported symbol the count of those importers that name it, plus a `grep -rlw` of the symbol outside the defining file (an upper bound, comments included). Every symbol called dead in section 4 was then checked by hand. Route handlers and client fetches are matched by their `/api/...` literal.

## 2. Module verdict

**REFACTOR AND PORT.** Every customer feature is kept. The code is not: the detail page resolves the same item id up to six times per render, renders eight of the fifteen stored fact-document sections only as raw markdown, renders the brief's raw Sources markdown and five structured sections a second time at Full-brief depth, never reads three columns its own components display (`recommended_actions`, a legal instrument, a last-verified date), carries a dead viewer-scoped loader branch and dependency-injection seam for deleted tests, two copies of the relevance fetch per page, a map keyed to a legacy jurisdiction vocabulary and a title-regex heuristic instead of `jurisdiction_iso`, a map tile layer with its licence attribution switched off, about 190 lines of brief parsers whose output nobody reads, 550 code lines of design-gallery fixtures under lib/, and comment essays that run to 70 lines a file.

**Current code LOC: 8,879** (8,196 awk over the 70 files plus 683 in the read-layer slices). **Estimated clean LOC: about 5,430 for P1-19, plus about 800 that moves to other modules.** Arithmetic (section 8 table, per planned file): src/core/detail 1,385 (load 140, item read 230, cross-page read 140, claim tiers 45, id redirect 45, inference view 80, fact model 330, timeline 110, section index 45, sources parse 85, record sections 100, relevance route 35) + src/ui/detail 1,415 (shell 300, list-position hook 25, cross-page section 230, inference section 55, fact blocks 40, sources grid 100, record facts 75, trajectory 25, action-card props 40, shared props 10, notes 230, assignments 240, collab client 45) + src/features/regulations 2,193 (pages 148, ledger 190, detail 380, binding banner 170, relevance hook 25, register 300, register page 120, owner card 90, corridors 80, dismissed stash 70, map page 300, map view 150, centroids 70, rollup 20, map read 40, map route 40) + src/core/jurisdictions 280 (iso 70, tiers 110, legacy map 100) + src/core/statutory 95 + src/core/applicability 65 = 5,433. Moved out (estimated for the receiving lanes): row overflow menu 200 (P1-17), upcoming-obligations strip list variant 200 (Market surface), section-index depth switch and scroll spy 60 (P1-17), ThemeBriefCard 30 (Research surface), two date presets 8 (P1-17), sectors, adjacency and weights about 125 (P1-02 workspace and the scoring owner), extract-recommended-actions 80 and timeline-parse 75 (P1-03 intake-a, writer side) = about 780. Against today's 8,879 the module shrinks to 61 percent. Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (12), with the files that carry them today:

1. Regulations list: first page server-rendered, remainder after paint, URL-backed facets (band, mode, jurisdiction, topic, source tier, workspace tags), sort deep link, workspace priority retag and dismiss with a restore stash, watch toggle (app/regulations/page.tsx, RegulationsLedger.tsx, DismissedStash.tsx, PriorityDropdown.tsx).
2. Regulation detail page: masthead with ActionCard, merged obligation timeline, section index with Summary or Full-brief depth, Summary (brief or record grade), fact sections 3, 4, 8, 10, 11, Penalties, Sources, Connected intelligence, Inferences, rail (At a glance, Impact, Relevance, Owner and team, In this list, Legend, Affected lanes), binding banner, obligation register for the item, corridors this applies on, notices rail (app/regulations/[slug]/page.tsx, RegulationDetailSurface.tsx, BindingBanner.tsx, OwnerTeamCard.tsx, AffectedLanesCard.tsx, CorridorsAppliedStrip*.tsx).
3. Obligation register page: facet rail with corpus-wide counts, first page seeded server-side, paged refetch, not-filtered-in, no-data and error states (app/regulations/register/page.tsx, ObligationRegisterPageView.tsx, ObligationRegister.tsx, ObligationRegisterFilterBar.tsx).
4. The detail loader shared by four surfaces: admission guard, uuid-to-slug redirect, cached item-scoped bundle, per-request inferences and corrections redaction, claim-tier map (lib/detail/load-detail.ts, load-detail-core.ts, id-redirect.ts, item-id-filter.ts; supabase-server.ts 3776-4423).
5. The detail shell shared by four surfaces: masthead with breadcrumb and list position, section frame, rail slot order, At a glance, Impact, Legend, In this list with prev and next, page wrapper with workspace notes and assignments (components/detail/DetailShell.tsx, ItemNotesBlock.tsx, ItemAssignBlock.tsx, item-collab-client.ts, shared-props.ts, lib/detail/action-card-common-props.tsx, section-index-data.ts, meta-line.ts).
6. Fact rendering: paragraph classification (FACT, inference, legal confirmation), fact-card models with kind, figure lead, provenance, merge of same-kind runs, brief-grade claim tiers by normalised containment, record-grade facts with exact-line tiers (lib/detail/fact-paragraphs.ts, fact-card-model.ts, components/detail/FactBlocks.tsx, primitives.tsx, lib/agent/parse-record-sections.ts).
7. Sources grid with registry tier and bias tags (components/detail/SourcesGrid.tsx, the section 15 table parser in lib/agent/extract-regulation-sections.ts, source-entry-filter.mjs).
8. Connected intelligence and inferences (components/detail/CrossPageSection.tsx, InferenceSection.tsx, lib/detail/inference-view.mjs, cited-item-links.ts).
9. Timeline math and requirement trajectory (lib/detail/timeline-math.ts, requirement-trajectory-classify.ts, components/detail/RequirementTrajectory.tsx).
10. Jurisdiction model: ISO validation and labels, tiers, the legacy slug table and region groups (lib/jurisdictions/iso.ts, tiers.ts, lib/constants.ts JURISDICTIONS and regionGroupForLabel).
11. Map: Leaflet map of regulation counts by jurisdiction with band colour, mode, band and region filters, jurisdiction register, immediate rail, coverage gaps rail (app/map/page.tsx, components/map/*, lib/map/jurisdiction-rollup.ts; supabase-server.ts 3146-3262; data.ts 592-631).
12. Not regulations but in scope: the statutory FuelEU penalty computation and its compile-time type barrier (lib/statutory), the applicability gate (lib/applicability), the per-viewer relevance and binding route (app/api/detail/relevance), constants owned by other modules (sectors, weights, app name), and three writer-side helpers (extract-recommended-actions.mjs, timeline-parse.mjs, the section 14 kind of extract-regulation-sections.ts).

Key dependencies [CONFIRMED by the import, `.from(`/`.rpc(` and `fetch(` scans]:

- Modules imported: `next/navigation`, `next/cache`, `next/link`, `next/dynamic`, `react`, `react-leaflet`, `leaflet`, `lucide-react`, `@supabase/supabase-js`; in-repo from P1-01: supabase-service, supabase-server-client, api/org (resolveOrgIdFromCookies), api/rate-limit, api/authed-fetch; from P1-17 ui-kit: ui/{Absence, StateNote, ActionCard, ActionRow, SectionIndex, SectionCard, SectionHeader, SectionHeading, RailCard, Masthead, ImpactMeter, FactCard, ItemGroup, Chips, ListRow, CoverageState, WatchButton, DetailSubSection, band-context, skeleton-page}, shared/{GfmSection, InferenceClaim, MoreBelowDisclosure}, list-surface/{ListSurfaceShell, ListSurfaceRailCards, ListSurfaceSortRow, list-surface-helpers, useListSurfaceFilter}; from P1-18 shell: shell/{ItemConnectionsCard, RelevanceBadgeClient, ThemeStrip}, figures/NoticesRail; from P1-02 workspace: stores/{resourceStore, workspaceStore}, hooks/{useWorkspaceBootstrap, usePersonalState}, tags/useWorkspaceTagsFacet, workspace/{viewer-relevance, relevance.mjs, item-collab-shared.mjs}, workspace/ArchiveDialog; from P1-09 flywheel-a: connections/{connection-view-model.mjs, resource-lookup, forward-event-format.mjs}, research/{theme-brief.mjs, theme-brief-text.mjs}; from P1-16 obligations: obligations/read-register.mjs, forward-events/kind-labels.mjs; others: corrections/{item-corrections.mjs, suppressed-render.mjs}, cache/revalidate-item, item-links, scoring, urgency/bands, dashboard/row-fields, list-row-fields, list-pagination, contracts/vocabularies.mjs, profile/profile-contract.mjs, learning/constants.mjs, entities/{corridor-scope-cache, host-from-url.mjs}, credibility/bias-display.mjs, sources/url-canonicalize, customer-source-tier, coverage-gaps, tier1-priority-jurisdictions, url-params/regulations-region-link, perf/static-params-fallback.mjs, render-now, format, domains, propagation/types.ts.
- Tables read: intelligence_items (5 sites in the slices plus lib/detail/load-detail.ts:133), intelligence_item_sections, item_timelines, item_changelog, item_disputes, item_cross_references, item_supersessions, source_bias_tags, section_claim_provenance (with the sources embed), inference_records (2 reads), connection_themes, theme_briefs, connection_theme_runs; through readers in other modules: obligations, obligation_objects, item_forward_events, item_corrections, sources (cited), regions and entity_scope (corridor reader), workspace roster. RPCs: none called directly in scope; the list and map payloads go through `get_workspace_intelligence_listings_public` and the workspace listings family inside supabase-server.ts (P1-01 register). Views: none. Writes: none in scope; the workspace override, owner, notes and assignment writes go through store and route modules owned by P1-02.
- Client routes called: /api/listings/rest (RegulationsLedger.tsx:100), /api/obligations/upcoming (RegulationDetailSurface.tsx:196, UpcomingObligationsStrip.tsx:101), /api/obligations/register (ObligationRegister.tsx:142, ObligationRegisterFilterBar.tsx:179), /api/detail/relevance (BindingBanner.tsx:111 and, outside scope, RelevanceBadgeClient.tsx:33), /api/workspace/items/[id]/{notes,assignments} (item-collab-client.ts:39).
- Env vars read: none directly in scope [CONFIRMED grep `process.env`]; the service client reads SUPABASE_SERVICE_ROLE_KEY inside P1-01's factory.
- External services: OpenStreetMap tile servers (`https://{s}.tile.openstreetmap.org`, MapView.tsx:193), free. No metered model call and no Browserless call in scope [CONFIRMED: `grep -il "anthropic|browserless|messages.create|spend-client|haiku|sonnet"` over the 70 files returns none]. The detail masthead's scoped CommandBar ("Ask about this regulation", RegulationDetailSurface.tsx:334) hands questions to the assistant route, a metered call owned outside this module [HYPOTHESIS: CommandBar's route not read; intake-a.md section 8 names /api/ask as metered].

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | design-gallery fixtures under lib/detail | fact-card-fixtures.ts 231 + state-note-fixtures.tsx 144 + action-card-fixtures.ts 126 + fact-card-panel21c-fixture.ts 32 + section-index-fixtures.ts 17 = 550 code lines | sample data for the /admin/parts sign-off pages, shipped as product library code; state-note fixtures cite source line numbers that have already drifted (e.g. "RegulationDetailSurface.tsx:498-500" for text now at 553-555, state-note-fixtures.tsx:112) [CONFIRMED read]; one fixture title contradicts the live 4/4 collapse rule (action-card-fixtures.ts:91 vs timeline-math.ts:78-79) [CONFIRMED read] | not ported as lib code; the parts gallery (P1-17) rebuilds its own fixtures beside its tests |
| 2 | comment essays | ObligationRegister.tsx 3-70 (68 of 183 raw), ObligationRegisterFilterBar.tsx 3-69, data.ts 472-544 (73 lines over one 25-line function), RegulationsLedger.tsx 3-50, PriorityDropdown.tsx 3-49 and 232-251, [slug]/page.tsx 25-67, MapPageView.tsx 274-289, load-detail-core.ts 14-29 and 134-156 | lane narratives (PERF-10, PERF-11, PERF-MERGE, CAP-1000-FIX-2) repeated per file; several now false: ObligationRegister.tsx says the list page mounts it (it moved to /regulations/register), FilterBar 38-42 describes props that no longer exist (A2-part4:L70), load-detail-core.ts:72 and 85-86 say 300 s while the constant is 3600 [CONFIRMED read] | one sentence per function; history stays in docs/ |
| 3 | extract-regulation-sections.ts parsers nobody reads | parseActionList 186-268, parseProseWithSource 270-305, parseObligationsTable 307-350, the section 10 and 11 prose case, their types (Severity, ActionListItem, ObligationRow, RegulationSection, ExtractedRegulationSections), about 190 code lines | the only consumed kinds are `sources_list` (SourcesGrid.tsx:27) and `timeline` (canonical-pipeline.ts:1517, scripts/backfill-item-timelines.mjs:72) [CONFIRMED grep `kind === "..."`]; the detail page renders sections from intelligence_item_sections, never from these parsers; SourcesGrid parses all seven sections of the full brief to read one | a sources-table parser in core/detail (with the F-1 multi-header fix and the placeholder filter); the section 14 extraction stays with intake (P1-03) |
| 4 | six reads of one item id per detail render | fetchIntelligenceItem (supabase-server.ts:3895-3900), the legacy-id resolve in fetchIntelligenceItemSectionsUncached (:3801-3815, its own uuid regex), resolveItemUuid in the page's loadItemScoped ([slug]/page.tsx:120), the self read in fetchCrossPageForItem (:4325-4330), resolveItemUuid again in redactDetail (load-detail.ts:70, every request), the self read in fetchFreshInferencesForItem (:4377-4382, every request) [CONFIRMED read] | the same `intelligence_items` row resolved six ways under two cache windows; the two per-request lookups run on cached renders too | the item read returns `{uuid, legacyId}` once; every later read takes the uuid |
| 5 | DetailShell.tsx rail and list-position plumbing | 369 code lines; three `useSearchParams` readers for one URL contract (DetailMastheadBreadcrumb 69-92, InThisListBridge 499-512, InThisListNeighborsBridge 518-531); AtAGlanceCard silently discards any row labelled band, type, kind, jurisdiction, region, source or published (:407-412), so RegulationDetailSurface passes five rows that never render (:355-361); RailLegend kept while its own comment says it is deleted (:438-442) [CONFIRMED read] | callers build rows the card throws away; one URL contract read three times | one `useListPosition()` hook; callers pass only the rows the card draws; one Legend card (P1-17's LegendRailCard) |
| 6 | load-detail-core.ts dead branches and injection seam | `includeRelevance`, `loadViewerScoped`, `getRelevance`, `resolveOrgId`, `ViewerScopedCtx`, `viewerScoped` (about 50 code lines); `DetailDeps` exists so deleted tests could inject stubs | no production caller passes `includeRelevance` or `loadViewerScoped` [CONFIRMED grep: only comments in market/[slug]/page.tsx:53,293 and api/detail/relevance/route.ts:15] | one `loadDetail(surface, id, loadItemScoped)` with the real bindings |
| 7 | ObligationRegister.tsx plus ObligationRegisterFilterBar.tsx | 78 + 314 code lines for one register | the loader exists only to seed or fetch the first page and hand it to the bar; both carry the paging contract in prose; PAGE_SIZE 60 retyped (FilterBar:127) beside LIST_FIRST_PAGE_SIZE; EVENT_KIND_LABELS (FilterBar:116-123) duplicates forward-events/kind-labels.mjs; MODE_META cast twice (FilterBar:114, PageView:45) [CONFIRMED read] | one ObligationRegister component with a `variant` and the shared constants |
| 8 | PriorityDropdown.tsx in the regulations folder | 318 code lines, 8 importers across Dashboard, Market, Operations, Portfolio, Research, Watchlist | it is the shared row overflow menu (FOLD-56 made it so) living under one surface; raw hex #7A6E6C and #F5F2EE (:146, :281), legacy `--color-*` tokens, a vestigial `variant` prop, 36 px menu items (A2-part4:L73) | P1-17 ui-kit's one overflow menu (`src/ui/Menu.tsx`, ui-kit.md section 8 already names PriorityDropdown as its second caller) with 44 px items, arrow-key roving and focus return |
| 9 | the /map payload | loadMapDataPayload (supabase-server.ts:3161-3208) reads the workspace corpus plus all changelog, disputes and supersessions; MapPageView reads only `resources` [CONFIRMED read: MapPageView props 75-79; map/page.tsx:87-91] | three corpus-wide reads for nothing, org-scoped so an anonymous viewer gets an empty map and the error banner (:3178-3180) while /regulations is public | one cached public read of the regulation rows with `jurisdiction_iso`, `priority`, `transport_modes`, `category` |
| 10 | UpcomingObligationsStrip and its View in the regulations folder | 88 + 253 code lines; the detail variant (Strip 49-52, 80-86; View DetailCard 87-142) has no caller since the PARITY-PARTS ruling merged obligations into the timeline; the only consumer is MarketPolicyTimeline.tsx:36 with `variant="list"` [CONFIRMED grep] | a Market component under Regulations, half of it unreachable | list variant moves to the Market surface; detail variant TRASH |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts and fsi-app/supabase (ts, tsx, mjs, js, sql) excluding the defining file, and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| src/lib/agent/extract-regulation-sections.ts:156 | parseRegulationSection | exported function | 0 importers; 1 mention outside, a comment [CONFIRMED] |
| src/lib/agent/extract-regulation-sections.ts:186-350 | parseActionList, parseProseWithSource, parseObligationsTable, SEVERITY_TOKEN_TO_KEY and the `action_list`, `prose_with_source`, `obligations_table`, `prose` payloads | functions and payload kinds | no reader of those kinds anywhere: `grep -rn 'kind === "action_list"\|obligations_table\|prose_with_source'` outside the file returns 0 [CONFIRMED] |
| src/lib/agent/extract-regulation-sections.ts:9,52,60,72,103,111 | RegulationSectionKey, Severity, ActionListItem, ObligationRow, RegulationSection, ExtractedRegulationSections | exported types | 0 importers using them [CONFIRMED]; `ObligationRow` here is a different type from the register's ObligationRow |
| src/lib/agent/source-entry-filter.mjs:26,38 | renderableSourceEntries, isPlaceholderText | exported functions | 0 importers [CONFIRMED]; agrees with A3:L123 |
| src/lib/agent/source-entry-filter.mjs:1 | HEADER_LITERALS (export) | export surface | used only inside the file [CONFIRMED] |
| src/lib/agent/parse-record-sections.ts:64,71,85,127 | humanizeSlotLabel, lastQuotedSpan, parseRecordClaimLine, parseSourceUrl (exports) | export surface | used only inside the file [CONFIRMED]; agrees with A3:L122 |
| src/lib/agent/extract-recommended-actions.mjs:5,18,102 | CONCRETE_ACTION_VERBS, DO_NOW_SECTIONS_BY_ITEM_TYPE, extractActionFromParagraph (exports) | export surface | used only inside the file [CONFIRMED]; agrees with A3:L119 |
| src/lib/detail/id-redirect.ts:65-142 | findIdRedirectViolations, landing, parseDetailHref, IdRedirectViolation | functions and type | its script scripts/verify/id-redirect-target-audit.mjs does not exist (`ls`: No such file) and id-redirect.test.mjs was deleted by CLEAN-3 f906b2102 [CONFIRMED]; the property it checks is ported as a test (section 8) |
| src/lib/detail/id-redirect.ts:30,36 | admittedSurfaceFor, decideIdRedirect (exports) | export surface | used only inside the file [CONFIRMED] |
| src/lib/detail/fact-card-model.ts:397,579 | parseFactCardModels, countNoLeadCards | exported functions | 0 importers, 0 mentions outside [CONFIRMED]; agrees with B-0675 |
| src/lib/detail/fact-card-model.ts:502,523 | normalizeClaimText, resolveClaimTier (exports) | export surface | used only inside the file [CONFIRMED] |
| src/lib/detail/fact-card-model.ts:354 | `figureSubLabel: null` | always-null field from the parser | every parsed card sets it null; only fixtures set it [CONFIRMED read] |
| src/lib/detail/fact-paragraphs.ts:71,119 | stripFactLabel, classifyParagraph (exports) | export surface | used only inside the file [CONFIRMED] |
| src/lib/detail/timeline-math.ts:26,40 | daysBetween, daysPhrase (exports) | export surface | used only inside the file [CONFIRMED] |
| src/lib/detail/load-detail-core.ts:57,121-131,279-294 | ViewerScopedCtx, includeRelevance, the getRelevance and loadViewerScoped branch of runViewerScoped | type, option, branch | no caller passes `includeRelevance` or `loadViewerScoped` [CONFIRMED grep]; `relevance` and `viewerScoped` are always null and undefined |
| src/lib/detail/load-detail-core.ts:184 | buildClaimTierMap (export) | export surface | 0 importers; called only at :221 [CONFIRMED] |
| src/components/regulations/format-fixed-date.ts:4,10 | formatMilestoneChip, formatYearOnly | exported functions | 0 mentions outside the file [CONFIRMED] |
| src/components/regulations/UpcomingObligationsStripView.tsx:12 | KIND_LABELS (re-export) | re-export shim | 0 importers use it [CONFIRMED]; the two real readers import forward-events/kind-labels.mjs directly |
| src/components/regulations/UpcomingObligationsStripView.tsx:87-142 and UpcomingObligationsStrip.tsx:49-52, 80-86, 115 | DetailCard and the `detail` variant | component and branches | the only mount passes `variant="list"` (MarketPolicyTimeline.tsx:36) [CONFIRMED]; agrees with A2-part4:L76-L77 and B-0660 |
| src/components/regulations/BindingBanner.tsx:43,53; UpcomingObligationsStripView.tsx:36 | BindingLine, BindingData, ScopeInfo (exports) | export surface | 0 importers [CONFIRMED] |
| src/components/regulations/RegulationsLedger.tsx:113 | `initialArchived` prop | prop never destructured | passed by app/regulations/page.tsx:57, never read (:129) [CONFIRMED read]; agrees with A2-part4:L75 |
| src/components/regulations/RegulationDetailSurface.tsx:119,160-162 | `initialOwner`, `initialWatched`, `initialTeamWatched`, `initialTeamAvailable` | props never supplied | app/regulations/[slug]/page.tsx:190-204 passes none of them [CONFIRMED read]; the same three watch props flow through action-card-common-props.tsx:30-32 always undefined |
| src/components/detail/DetailShell.tsx:94 | DetailMastheadProps (export) | export surface | 0 importers [CONFIRMED] |
| src/components/detail/DetailShell.tsx:461 | RailLegend | component | 4 importers, but its own comment (:438-442) says the four surfaces mount LegendRailCard and RailLegend is deleted; the two cards say different things [CONFIRMED read]; not dead, a duplicate (section 5) |
| src/components/detail/ItemAssignBlock.tsx:29; ItemNotesBlock.tsx:28; item-collab-client.ts:11 | ItemAssignment, ItemNote, CollabResult (exports) | export surface | 0 importers outside [CONFIRMED] |
| src/lib/constants.ts:259,280,321,326,327 | PRIORITIES, PRIORITY_COLORS, CATEGORIES, Priority, Category | constants and types | 0 import sites (`grep -rn 'from "@/lib/constants"'` lists none of them; the name hits are local re-declarations in PlatformIntegrityFlagsView.tsx:44, IntersectionDetectionView.tsx:49 and api/admin/integrity-flags/route.ts:105) [CONFIRMED] |
| src/lib/constants.ts:149 | SectorDefinition (export) | export surface | 0 importers [CONFIRMED] |
| src/lib/map/jurisdiction-rollup.ts:16 | jurisdictionKeys (export) | export surface | used only inside the file [CONFIRMED] |
| src/components/map/MapView.tsx:69-71 | MARKER_MIN, MARKER_MAX, markerSize (exports) | export surface | used only inside the file [CONFIRMED] |
| src/lib/statutory/fueleu-annex-iv.mjs:4,15,94 | FUELEU_VLSFOE_MJ_PER_TONNE, FUELEU_RFNBO_NOT_IMPLEMENTED_REASON, computeFuelEuPenaltyRfnbo | exports | no production importer [CONFIRMED]; the RFNBO stub throws by design, a named gap, kept (section 8) |
| src/lib/statutory/types.ts:9 | FormulaId (export) | export surface | 0 importers [CONFIRMED] |
| src/app/map/page.tsx:36; src/components/map/MapPageView.tsx:488 | `?region-filter=` | URL parameter with a writer and no reader | the Coverage-gaps rail links to `/map?region-filter=<id>`; `grep -rn "region-filter"` finds that writer and one comment claiming MapPageView resolves it client-side; MapPageView has no `useSearchParams` and the page reads only `region` [CONFIRMED]: every Coverage-gap link reloads the same unfiltered map |

Not dead, verified live this session: `sourceEntriesOf`, `SourcesGrid`, `clampTier` (four detail surfaces), `crossPagePresence` (four), `DetailMasthead`, `DetailSection`, `DetailLayout`, `DetailRail`, `AtAGlanceCard`, `ImpactRailCard`, `InThisListStat`, `topRecommendedAction` (four each), `SummaryDepthSwitch` and `SummaryDepth` (ui/SectionIndex.tsx), `useSectionScrollSpy` (ui/SectionIndex.tsx), `jurisLabelOf` (three surfaces), `RecordFactCard` (RegulationDetailSurface, admin item-group page), `RecordFactsBody` (Market, Research), `ThemeBriefCard` (Research only), `fetchClaimTierMap` (four pages), `DETAIL_CACHE_REVALIDATE_SECONDS` (load-detail.ts, a page), `isItemUuid` (item-id-filter.ts, workspace/item-collab-route.ts), `itemIdColumn` (operations and research pages, supabase-server.ts), `currentInferenceRows` (admin/inferences page), `readCustomerInferences` (supabase-server.ts), `citedItemsWithHrefs` (supabase-server.ts), `isRegulationItem` (operations page and ledger), `computeApplicability` (workspace/relevance.mjs:49), `computeStatutory` (propagation/statutory-rows.ts), `jurisdictionTier` and the tier lists (api/admin/coverage/route.ts), `normalizeJurisdictionIsoColumn` (supabase-server.ts), `isoToDisplayLabel` (8 importers), `regionGroupForLabel` (OperationsDetailSurface), `PriorityDropdown` (8), `AffectedLanesCard` (Regulation and Market detail), `formatShortDate` and `formatMonthDay` (MarketSignalDetailSurface), `UpcomingObligationsStrip` list variant (Market), `extractRecommendedActions` (scripts/turns), `parseTimeline` (canonical-pipeline, backfill script, record-briefs schema).

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| jurisdiction label derivation | [slug]/page.tsx:154-159; AffectedLanesCard.tsx:38-46; primitives.tsx:54-62 (`jurisLabelOf`) | `jurisLabelOf` alone, from core/jurisdictions |
| two jurisdiction vocabularies on one page set | legacy slugs (constants.ts JURISDICTIONS 84 rows, `Resource.jurisdiction = row.jurisdictions?.[0]`, supabase-server.ts:4027) vs ISO codes (`jurisdiction_iso`, lib/jurisdictions/iso.ts); the map groups by the legacy slug plus a title regex (jurisdiction-rollup.ts:12 calls scoring.getJurisdiction), its `?region=` filter uses ISO (MapPageView.tsx:118-123), and its register rows link to `/regulations?region=<legacy slug>` uppercased as if ISO (MapPageView.tsx:407, regulations-region-link.ts) [CONFIRMED read] | ISO is the one model; the legacy table becomes a legacy-to-ISO map used only where an old row has no `jurisdiction_iso` |
| two Tier-1 jurisdiction lists | lib/jurisdictions/tiers.ts TIER_1_JURISDICTIONS vs lib/tier1-priority-jurisdictions.ts TIER1_PRIORITY_ISOS, differing by 16 + 6 codes (A4d:L190, A4d:L339; B-0269) | one list; this register takes ownership of the merge with sources-b (sources-b.md:144 named P1-19) |
| item type to surface classification | regulation-item-types.ts:8-19 (third copy, literal `1`), surface-of.mjs SURFACE_RULES, domains.ts domainForItemType (A4d:L248, A4d:L352) | `surfaceOf(item) === "regulations"` from the routing module P1-09 plans (core/routing/surface.ts) |
| uuid regex | id-redirect.ts:4; supabase-server.ts:3801; plus P1-01's and P1-02's copies | `isUuid` from core/db (P1-01) |
| event kind labels | ObligationRegisterFilterBar.tsx:116-123; forward-events/kind-labels.mjs; UpcomingObligationsStripView.tsx:12 re-export | kind-labels.mjs only (P1-16) |
| register page size | ObligationRegisterFilterBar.tsx:127 `PAGE_SIZE = 60`; RegulationsLedger.tsx:100 `offset=60`; list-pagination.ts LIST_FIRST_PAGE_SIZE | LIST_FIRST_PAGE_SIZE everywhere |
| TRANSPORT_MODES cast | ObligationRegisterFilterBar.tsx:114; ObligationRegisterPageView.tsx:45 | one typed accessor in contracts/vocabularies (P1-04 owns it) |
| relevance fetch | BindingBanner.tsx:111 and RelevanceBadgeClient.tsx:33 both GET `/api/detail/relevance` for the same item on every regulation detail render [CONFIRMED grep] | one `useItemRelevance(itemId)` shared by the banner and the badge |
| brief-paragraph regexes | fact-paragraphs.ts:82 SOURCE_RE and :84 URL_RE vs fact-card-model.ts:157 TRAILING_SOURCE_RE and :158 URL_ANYWHERE_RE (B-2154) | one set in core/detail/fact-model |
| record-grade body | primitives.tsx:85-126 `RecordFactsBody` (Market, Research) vs RegulationDetailSurface.tsx:537-604 `RecordGradeSections` (gaps line and raw tag spans) | one RecordFacts with an optional gaps line and TagChip |
| intersection view computed twice | crossPagePresence (CrossPageSection.tsx:251-271) and CrossPageSection (:288-293) both run buildIntersectionView and pickVisibleInferences per render [CONFIRMED read] | compute once in the surface, pass the view and the presence down |
| Legend cards | DetailShell.tsx:461 RailLegend vs list-surface LegendRailCard | LegendRailCard (P1-17) |
| list position from the URL | DetailShell.tsx 69-92, 499-512, 518-531 | `useListPosition()` |
| two cache windows for one item | fetchIntelligenceItem and sections 300 s (supabase-server.ts:3850, :4232) vs the item-scoped bundle 3600 s (load-detail-core.ts:30) | one window and one tag set |
| detail meta built then re-split | [slug]/page.tsx:167-186 builds `groupLabel` and `deck` from the same two fields; RegulationDetailSurface.tsx:179 de-duplicates them again with joinMetaSegments | the page builds one segment array once |
| two assignment models on one page | OwnerTeamCard (one owner, migration 234, rail) and ItemAssignBlock (many assignees with due date and notification, migration 359, page foot) [CONFIRMED read] | both kept (different features, ItemAssignBlock.tsx:8-11 says so); the port labels them "Owner" and "Assignments" so a reader is not offered two "assign" controls with one meaning |

Over-abstraction: `DetailDeps` and the `deps` override (load-detail-core.ts:63-90, load-detail.ts:44-91) exist so the deleted load-detail-core.test.mjs could inject stubs; `ViewerScopedCtx` serves a branch nobody calls. `PriorityDropdown`'s `variant` prop accepts one value. `UpcomingObligationsStrip` and `ObligationRegister` each wrap a view component only to fetch. Keep one injection seam only where the new tree's test uses it (section 8 names those tests).

## 6. Non-essential artifacts

- Design-gallery fixtures under src/lib/detail: fact-card-fixtures.ts (imports components/ui/__fixtures__/panel-21c-frozen-records.json), fact-card-panel21c-fixture.ts, action-card-fixtures.ts, state-note-fixtures.tsx, section-index-fixtures.ts; consumers are only the /admin/parts sign-off pages and FactCardGallery and SectionIndexGallery [CONFIRMED import scan]. TRASH as library code; P1-17 decides whether the gallery keeps fixtures beside its tests.
- `console.log` perf lines on two pages ([slug]/page.tsx:148, map/page.tsx:27) and one in data.ts:457, :615.
- Inline `<style>` blocks repeated: ObligationRegisterPageView.tsx:139 and :173 mount LIST_SURFACE_MOBILE_CSS twice in one page [CONFIRMED read]; DetailLayout, DismissedStash, PriorityDropdown, MapView, MapPageView each carry their own media-query `<style>`.
- Comments that cite headers which no longer exist (the CLEAN-3 header strip): fueleu-annex-iv.mjs says "CONFIRMED, see file header" four times (:3, :6, :11, :14) and the file has no header; parse-record-sections.ts cites "this file's TIER-CHIP header" (:3-4, :17); tiers.ts:58 "see header note"; iso.ts:11-16 introduces a "Legacy to ISO mapping" with no mapping under it (A4d:L165) [CONFIRMED read]. The FuelEU provenance (Regulation (EU) 2023/1805 Annex IV, verified against EUR-Lex on 2026-09-02) survives only in FUELEU_STATUTE_CITATION.

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (this session's import scan) | note.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| src/app/regulations/page.tsx | 1-72 (72) | /regulations: first page (60) and surface counts, sort param, ledger, theme strip, coverage line | REFACTOR AND PORT | 30 | Next route | comment 19-39 is history |
| src/app/regulations/loading.tsx | 1-22 (22) | list skeleton | KEEP AS-IS | 15 | Next file convention | B-0655 calls it DEAD; a loading.tsx is mounted by the App Router, not imported [CONFIRMED: framework convention, page reads searchParams so it streams] |
| src/app/regulations/[slug]/page.tsx | 1-226 (226) | static params, id redirect, loadDetail with item-scoped bundle, deck and breadcrumb, binding banner, item register, corridors, notices | REFACTOR AND PORT | 70 | Next route | 43-line comment 25-67; console.log :148; `r.legalInstrument` (:179) and `r.lastVerifiedDate` (:173) are never mapped by the item read, so "Reviewed" and the instrument never appear [CONFIRMED read supabase-server.ts:3996-4083] |
| src/app/regulations/[slug]/loading.tsx | 1-21 (21) | detail skeleton | KEEP AS-IS | 15 | Next file convention | fixed 4-column grid (:10) at 375 px [HYPOTHESIS: not measured] |
| src/app/regulations/register/page.tsx | 1-25 (25) | /regulations/register: seeded first page, date label | KEEP AS-IS | 18 | Next route | |
| src/components/regulations/RegulationsLedger.tsx | 1-355 (355) | list surface assembly: facets, bands, sort, overrides, tags facet, remainder fetch, dismissed stash, rail | REFACTOR AND PORT | 190 | 1: app/regulations/page.tsx | remainder failure silently empty (:101, B-0180); `initialArchived` unused; "My order" is the identity sort (:88-91); "corpus" in customer text (:338) (A2-part4:L75) |
| src/components/regulations/RegulationDetailSurface.tsx | 1-675 (675) | detail body (section 2 responsibility 2) | REFACTOR AND PORT | 380 | 1: [slug]/page.tsx | obligation fetch turns failure into [] (:194-207, B-0047); renders only sections 3, 4, 8, 10, 11 (:126-132); Full depth renders the whole full_brief again including its raw Sources (:403-407 with GfmSection.tsx:181-183 stripping only the ledger block) against its own header rule (:31-33) [CONFIRMED read]; `hasPenaltyContent` computed twice (:244, :426); "pending generation" copy (:490, B-1943) |
| src/components/regulations/PriorityDropdown.tsx | 1-471 (471) | shared row overflow menu: priority retag, dismiss, archive, top slot | REFACTOR AND PORT (to P1-17) | 0 here (200 in P1-17) | 8: DashboardBrief, MarketIntelLedger, OperationsLedger, PortfolioDetailView, RegulationDetailSurface, RegulationsLedger, ResearchLedger, WatchlistSurface | 36 px items and no arrow keys (B-1942); viewer hides priority actions (SEC-3b, :159-163) kept |
| src/components/regulations/ObligationRegisterFilterBar.tsx | 1-486 (486) | register table, paging, facet refetch, three coverage states, detail variant | REFACTOR AND PORT | into register (300) | 3: ObligationRegister, ObligationRegisterPageView, lib/data.ts (type) | "(migration 274)" in customer copy (:297); raw hex in bindingChipStyle (:428-437); stale header (B-0177) |
| src/components/regulations/ObligationRegisterPageView.tsx | 1-210 (210) | register page body: masthead, facet groups with vocabulary order, rail | REFACTOR AND PORT | 120 | 1: register/page.tsx | style tag mounted twice (:139, :173); no artboard (header) |
| src/components/regulations/ObligationRegister.tsx | 1-183 (183) | register loader: SSR seed or one fetch | REFACTOR AND PORT | into register | 2: [slug]/page.tsx, ObligationRegisterPageView | non-OK becomes EMPTY_RESULT so an outage reads as an empty register (:143, :147; A2-part4:L69) |
| src/components/regulations/UpcomingObligationsStripView.tsx | 1-313 (313) | horizontal upcoming-event strip, scope line, dead DetailCard | REFACTOR AND PORT (to the Market surface) | 0 here | 1: UpcomingObligationsStrip | DetailCard dead (section 4); HALF-SLICE (A2-part4:L77) |
| src/components/regulations/UpcomingObligationsStrip.tsx | 1-143 (143) | upcoming-events loader with scope and widen | REFACTOR AND PORT (to the Market surface) | 0 here | 1: market/MarketPolicyTimeline.tsx | outage reads as "No upcoming obligations" (:102, :106-107) |
| src/components/regulations/BindingBanner.tsx | 1-228 (228) | binding positions, duty holders, triggers, applicability, cost slots, three states | KEEP AS-IS (logic) | 170 | 1: [slug]/page.tsx | second fetch of the relevance route (section 5); title-only position note (:198) unseen on touch |
| src/components/regulations/OwnerTeamCard.tsx | 1-174 (174) | single owner select from the roster, last update | REFACTOR AND PORT | 90 | 1: RegulationDetailSurface | select about 33 px (:138-142, B-1941); `rosterFailed` true for an org-less user (:70) so "Roster unavailable" shows to users who have no org [CONFIRMED read, A2-part4:L72]; "Last update" is always "Not recorded" because lastVerifiedDate is never mapped |
| src/components/regulations/AffectedLanesCard.tsx | 1-159 (159) | modes and jurisdiction chips plus "Affected lanes will appear here once your workspace shipment data is connected" | TRASH | 0 | 2: RegulationDetailSurface, MarketSignalDetailSurface | the footer (:155) promises a customer-data connection that ADR-042 rules out ("the system stores no customer-entered data", quoted in docs/specs/01-regulations.md:191) [CONFIRMED read]; modes and jurisdiction already sit in the masthead dek; the external "lanes this applies on" answer is CorridorsAppliedStrip; HALF-SLICE (A2-part4:L64) |
| src/components/regulations/DismissedStash.tsx | 1-120 (120) | dismissed regulations disclosure with Restore | KEEP AS-IS | 70 | 1: RegulationsLedger | title nowrap with ellipsis (:76-78) truncates [CONFIRMED read] |
| src/components/regulations/CorridorsAppliedStripView.tsx | 1-95 (95) | corridor links to /market#corridor-id with jurisdiction pills | KEEP AS-IS | into corridors (80) | 1: CorridorsAppliedStrip | hex fallbacks in tokens |
| src/components/regulations/CorridorsAppliedStrip.tsx | 1-29 (29) | server read of corridors touching the item's ISO codes | KEEP AS-IS | into corridors | 1: [slug]/page.tsx | read error renders nothing (documented fail-soft) |
| src/components/regulations/format-fixed-date.ts | 1-27 (27) | four UTC date presets | REFACTOR AND PORT (2 to P1-17 format; 2 TRASH) | 0 here | 1: MarketSignalDetailSurface | formatMilestoneChip and formatYearOnly dead |
| src/components/detail/DetailShell.tsx | 1-628 (628) | the shared detail architecture (section 2 responsibility 5) | REFACTOR AND PORT | 300 | 7: four detail surfaces, CrossPageSection, InferenceSection, ui/SectionIndex | keyless fragment in AtAGlanceCard (:419-428, A2-part5:L64); InThisListStat shows "not in primary source" when opened directly (:590, B-0148); hard-coded #fff (:172) |
| src/components/detail/CrossPageSection.tsx | 1-306 (306) | Connected intelligence (intersections, theme analysis) and Inferences | REFACTOR AND PORT | 230 | 5: four detail surfaces, shared-props | bare `<a>` for in-app links (:85, :211, :218; A2-part5:L63); computes its view twice per render |
| src/components/detail/ItemAssignBlock.tsx | 1-315 (315) | workspace multi-assignment with due date and notification | KEEP AS-IS | 240 | 1: DetailShell | the module's positive reference for laws 6, 10, 14, 15 (A2-part5:L67) |
| src/components/detail/ItemNotesBlock.tsx | 1-297 (297) | workspace notes: add, edit own, two-step delete | KEEP AS-IS | 230 | 1: DetailShell | formatRelativeCompact without a now (:208), mounted after the client bootstrap so no hydration exposure (A2-part5:L68) |
| src/components/detail/item-collab-client.ts | 1-63 (63) | never-throwing collab call, plain-language errors, shared 44 px field style | KEEP AS-IS | 45 | 2: ItemAssignBlock, ItemNotesBlock | |
| src/components/detail/SourcesGrid.tsx | 1-161 (161) | source rows with registry tier, bias tags, absence dash; `sourceEntriesOf` | REFACTOR AND PORT | 100 | 4: four detail surfaces | parses the whole brief for one section; rule 18 matching kept; B-0150 now false (section 9) |
| src/components/detail/primitives.tsx | 1-126 (126) | jurisLabelOf, RecordFactCard, RecordFactsBody | REFACTOR AND PORT | into RecordFacts (75) | 4: Market, Research, Regulation detail, admin item-group page | |
| src/components/detail/InferenceSection.tsx | 1-69 (69) | Inferences section through the one display gate | KEEP AS-IS | 55 | 1: CrossPageSection | |
| src/components/detail/FactBlocks.tsx | 1-56 (56) | ItemGroups of FactCards, prose, maxGroups | KEEP AS-IS | 40 | 4: four detail surfaces | |
| src/components/detail/RequirementTrajectory.tsx | 1-37 (37) | trajectory string with the current step bold | REFACTOR AND PORT | 25 | 4: four detail surfaces | `new Date()` in render (:17) in client surfaces (A2-part5:L69, B-1919); take nowIso |
| src/components/detail/ThemeBriefCard.tsx | 1-35 (35) | Cluster synthesis rail card | REFACTOR AND PORT (to the Research surface) | 0 here | 1: ResearchFindingDetailSurface | |
| src/components/detail/shared-props.ts | 1-17 (17) | shared detail props type | KEEP AS-IS | 10 | 4: four detail surfaces | drop the three never-supplied watch props |
| src/lib/detail/fact-card-model.ts | 1-595 (595) | fact-card kinds, lead-ins, embedded sentences, provenance, claim nodes, figure lead, merge, record model, brief-grade tier match | REFACTOR AND PORT | into fact-model (330) | 4: FactBlocks, primitives, ui/FactCard, fact-card-fixtures | two dead exports; regexes duplicated with fact-paragraphs |
| src/lib/detail/fact-paragraphs.ts | 1-161 (161) | paragraph classification, FACT label and quote unwrap, citation parse | REFACTOR AND PORT | into fact-model | 2: FactBlocks, fact-card-model | |
| src/lib/detail/load-detail-core.ts | 1-332 (332) | detail control flow, claim-tier map | REFACTOR AND PORT | into load (140) and claim-tiers (45) | 5: four pages, load-detail.ts | dead branches and seam (section 4); stale "300 s" comments (B-1023) |
| src/lib/detail/load-detail.ts | 1-151 (151) | real bindings, cache, redaction, applyIdRedirect | REFACTOR AND PORT | into load | 4: four pages | resolves the uuid again per request (:70) |
| src/lib/detail/id-redirect.ts | 1-142 (142) | uuid URL decision: render, redirect to the owning slug, or not found | REFACTOR AND PORT | 45 | 3: item-id-filter, load-detail, workspace/item-collab-route | lines 65-142 dead in the product (section 4), ported as a test |
| src/lib/detail/item-id-filter.ts | 1-7 (7) | id or legacy_id column by shape | REFACTOR AND PORT | into the identity helper | 3: operations and research pages, supabase-server.ts | |
| src/lib/detail/inference-view.mjs | 1-169 (169) | customer inference read and rules (ADR-039(a) allowlist, current-row rule, citation gate, caps) | KEEP AS-IS | 80 | 4: admin/inferences page, CrossPageSection, InferenceSection, supabase-server.ts | B-0055 is now false (section 9) |
| src/lib/detail/timeline-math.ts | 1-168 (168) | milestone classification, collapse 4/4, next-milestone clause, obligation-event merge | REFACTOR AND PORT | into timeline (110) | 3: RegulationDetailSurface, ui/ActionCard, ui/Timeline | wall-clock default when no fromIso (:31-34, B-1024); imports a ui module from lib (:7) |
| src/lib/detail/requirement-trajectory-classify.ts | 1-66 (66) | current-step pick, step format without Date construction | KEEP AS-IS | into timeline | 1: RequirementTrajectory | pickCurrentStepIndex builds `new Date(step.date)` (:10) while its sibling formatter avoids Date for display [CONFIRMED read] |
| src/lib/detail/section-index-data.ts | 1-86 (86) | regulation section index with fixed ordinals; cross-page ordinals | KEEP AS-IS | 45 | 7: four detail surfaces, CrossPageSection, ui/SectionIndex, admin page | |
| src/lib/detail/action-card-common-props.tsx | 1-57 (57) | shared ActionCard props (tag popover, share, tag, export, watch, who pays, your lanes, timeline) | REFACTOR AND PORT | 40 (to ui/detail) | 4: four detail surfaces | JSX in lib; `yourLanes: "connect data"` (:54) repeats the AffectedLanes promise (P1-17 ActionCard decides the cell) |
| src/lib/detail/meta-line.ts | 1-48 (48) | de-duplicated sub-line join and split | REFACTOR AND PORT | 20 | 3: three detail surfaces | the need disappears when pages build one segment array |
| src/lib/detail/use-section-scroll-spy.ts | 1-40 (40) | IntersectionObserver scroll spy | REFACTOR AND PORT (to P1-17) | 0 here | 1: ui/SectionIndex | |
| src/lib/detail/cited-item-links.ts | 1-17 (17) | cited items to detail hrefs | REFACTOR AND PORT | into cross-page read | 1: supabase-server.ts | |
| src/lib/detail/fact-card-fixtures.ts | 1-283 (283) | gallery fixtures | TRASH | 0 | 4: admin parts pages, FactCardGallery, panel-21c fixture | section 6 |
| src/lib/detail/state-note-fixtures.tsx | 1-156 (156) | gallery fixtures | TRASH | 0 | 1: admin parts page | citations rot (B-2156) |
| src/lib/detail/action-card-fixtures.ts | 1-131 (131) | gallery fixtures | TRASH | 0 | 1: admin parts page | title contradicts the 4/4 rule (B-1020) |
| src/lib/detail/fact-card-panel21c-fixture.ts | 1-34 (34) | gallery fixture | TRASH | 0 | 3: admin parts pages, FactCardGallery | positional indexing (B-1022) |
| src/lib/detail/section-index-fixtures.ts | 1-18 (18) | gallery fixture | TRASH | 0 | 1: SectionIndexGallery | |
| src/app/api/detail/relevance/route.ts | 1-79 (79) | per-viewer relevance and the binding banner data | REFACTOR AND PORT | 35 | 2 fetch sites: BindingBanner, RelevanceBadgeClient | IP-limited, no requireAuth: anonymous readers get the binding banner, outside the one documented public exception (/api/version) in fsi-app/.claude/CLAUDE.md [CONFIRMED read :43-44]; the header (:12-18) describes a loadDetailCore behaviour removed by PERF-10 |
| src/lib/statutory/fueleu-annex-iv.mjs | 1-96 (96) | FuelEU Annex IV balance and penalty; RFNBO named gap | KEEP AS-IS | 44 | 2: propagation/statutory-rows.ts, statutory/types.ts | dangling "see file header" (section 6) |
| src/lib/statutory/types.ts | 1-63 (63) | Contractable-only computeStatutory type barrier | KEEP AS-IS | 35 | 1: propagation/statutory-rows.ts | |
| src/lib/statutory/types.contractable-barrier.check.ts | 1-25 (25) | tsc attack: a modelled input must not type-check | KEEP AS-IS | 15 | tsc via ci.yml:48 | the one executing proof in scope (rule 15) |
| src/lib/jurisdictions/iso.ts | 1-222 (222) | ISO shape checks, label tables, isoToDisplayLabel | REFACTOR AND PORT | 70 | 10 | 14 EU members have no label and print as raw codes (BG HR CY CZ EE GR HU LV LT LU MT RO SK SI) [CONFIRMED loop over COUNTRY_LABELS]; dangling mapping comment (B-1570) |
| src/lib/jurisdictions/tiers.ts | 1-213 (213) | Tier 1 and 2 ISO lists, tier, subnational, country group | REFACTOR AND PORT | 110 | 1: api/admin/coverage/route.ts | merge with tier1-priority-jurisdictions (B-0269, B-0871) |
| src/lib/regulation-item-types.ts | 1-19 (19) | isRegulationItem | TRASH | 0 | 2: operations page, OperationsLedger | third classification copy; replaced by the routing module (section 5) |
| src/lib/applicability/compute-applicability.mjs | 1-90 (90) | role-scope and size-band gate with named missing dimensions | KEEP AS-IS | 65 | 1: workspace/relevance.mjs | unknown dimension fails open on the gate by design (:16-18) |
| src/lib/constants.ts | 1-327 (327) | app identity, MODES, JURISDICTIONS (84), regionGroupForLabel, ALL_SECTORS (40), SECTOR_ADJACENCY, VERTICALS, priority labels and colours, JURISDICTION_WEIGHTS, CATEGORIES | REFACTOR AND PORT (split by owner) | 100 here (legacy jurisdiction map and region groups) | 27 import sites | five dead exports (section 4); MODES duplicates contracts TRANSPORT_MODES; sectors and adjacency to P1-02; weights to the scoring owner; APP_NAME to P1-18; regionGroupForLabel comment cites a deleted test (:131-134) |
| src/components/map/MapPageView.tsx | 1-517 (517) | map page body: filters, map card, jurisdiction register, immediate and coverage rails | REFACTOR AND PORT | 300 | 1: app/map/page.tsx | REGION_CHIP_TO_JURS hand-typed legacy slugs, EU chip is `["eu"]` only so items coded germany or france never match it (:83-90) [CONFIRMED read]; three-letter codes fabricated from legacy ids (`slice(0,3)`, :230) [CONFIRMED read]; Coverage gaps shows the error state whenever the list is empty, including no gaps (:476-479, A2-part5:L82); region-filter links have no reader (section 4) |
| src/components/map/MapView.tsx | 1-280 (280) | Leaflet map, count-sized band markers, fly-to, key | REFACTOR AND PORT | 150 | 1: MapPageView (dynamic) | `attributionControl={false}` (:190) so the OpenStreetMap attribution the TileLayer carries (:194) is never shown (A2-part5:L83) [CONFIRMED read]; OSM's tile policy requiring visible attribution [HYPOTHESIS: policy not fetched this session] |
| src/components/map/jurisdictionCentroids.ts | 1-37 (37) | 30 centroids keyed by legacy slug | REFACTOR AND PORT | 70 | 2: MapView, MapPageView | 30 of the 84 legacy ids have a centroid; items in the other 54 are uncharted [CONFIRMED count] |
| src/app/map/page.tsx | 1-94 (94) | map data read, masthead counts, map body | REFACTOR AND PORT | 40 | Next route | console.log :27; comment :36-38 is false (no region-filter reader); not in the live smoke plan (A1-part2:L169) |
| src/lib/map/jurisdiction-rollup.ts | 1-46 (46) | jurisdiction key per item, distinct counts | REFACTOR AND PORT | 20 | 2: map page, MapPageView | key = legacy column or a title regex (scoring.getJurisdiction), which misclassifies ("Carbon levy in Japan" = us, A4d:L212, A4d:L342) |
| src/lib/agent/extract-regulation-sections.ts | 1-492 (492) | full-brief section parser for keys 3, 4, 8, 10, 11, 14, 15 | REFACTOR AND PORT (section 15 table parser to core/detail; section 14 to P1-03; the rest TRASH) | 70 here | 4: SourcesGrid, RegulationDetailSurface (type), canonical-pipeline, backfill-item-timelines | about 190 dead lines (section 3 rank 3); the bullet fallback (448-491) is kept until the corpus is re-sectioned [HYPOTHESIS: live bodies still carry it, intake-a.md section 3 rank 8] |
| src/lib/agent/parse-record-sections.ts | 1-189 (189) | record-grade claim lines with exact-line tiers, key-date split | KEEP AS-IS | 100 | 13 import sites | four internal exports |
| src/lib/agent/source-entry-filter.mjs | 1-38 (38) | placeholder source-name filter (F-1) | REFACTOR AND PORT | 15 | 1: extract-regulation-sections | two dead exports |
| src/lib/agent/timeline-parse.mjs | 1-114 (114) | section 14 entries, bullets and tables | KEEP AS-IS (owner P1-03 intake-a) | 0 here | 4: canonical-pipeline, backfill script, record-briefs schema, extract-regulation-sections | writer side; no detail reader parses section 14 (the page reads item_timelines) |
| src/lib/agent/extract-recommended-actions.mjs | 1-148 (148) | structured do-now actions from the brief | KEEP AS-IS (owner P1-03/04 intake) | 0 here | 2: scripts/turns/apply-record-briefs.mjs, dry-run-structured-actions.mjs | its output (migration 334 `recommended_actions`) is never read by the detail page, and its shape `{action_text, verb, timeframe_days, owner, due_date, source_section}` (:117-124) is not the shape the page reads `{action, owner, timeframe, priority}` (types/resource.ts:85-90; DetailShell.tsx:296-298) [CONFIRMED read]; toIsoDateOrNull parses a local date then serialises UTC (:73-76) [HYPOTHESIS: a day shift east of UTC] |
| src/lib/supabase-server.ts | 3146-3262 (117 of 5048) | /map payload and the listings fetchers | REFACTOR AND PORT | 40 (map read) | data.ts | section 3 rank 9 |
| src/lib/supabase-server.ts | 3776-4423 (648 of 5048) | detail item read, sections, cross-page, fresh inferences, theme chips | REFACTOR AND PORT | 370 (item read 230, cross-page read 140) | load-detail, four pages, api/detail/relevance, ThemeStrip | `select("*")` (:3897) caches every column; changelog, cross references and supersessions unbounded (:3931-3957) while the page shows three changelog lines; the mapper omits recommended_actions, legal instrument and last-verified date (:3996-4083); readThemeBriefs reads every theme brief and keeps a pre-migration-351 fallback (:4248-4257); fetchCrossPageForItem reads every connection theme (:4340) [CONFIRMED read] |
| src/lib/data.ts | 444-631, 872-893, 1064-1148 | public list read, slug enumeration, map read, surface counts, register first page | REFACTOR AND PORT | 60 | four index and detail pages | timers raced and never cleared (:452-456, :609-614; A4d B-DUP-4); a failed register seed returns empty so the page says "No obligations on file yet" instead of the error state (:1144-1146) [CONFIRMED read]; imports ObligationRow from a "use client" component (lib importing components) |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/core/detail/load.ts | lib/detail/load-detail.ts 31-151; load-detail-core.ts 30-132, 227-332 | `loadDetail(surface, id, loadItemScoped)`: item read, canonical-surface admission, one cached item-scoped bundle, per-request inferences and correction redaction, `applyIdRedirect`; no viewer branch, no injection seam | 140 |
| src/core/detail/item-read.ts | supabase-server.ts 3776-4234 | `readDetailItem(id)`: explicit column list, verified gate, one uuid resolution returned with the row, bounded relationship reads (changelog limit, cross references, supersessions, timelines, bias tags, cited sources), sections by uuid, the mapper for the fields the four surfaces render, including recommended_actions in the shape the extractor writes | 230 |
| src/core/detail/cross-page-read.ts | supabase-server.ts 4236-4423; lib/detail/cited-item-links.ts 1-17 | intersection summary, theme analysis (members by page, lineage, brief), fresh inferences, theme chips for list strips | 140 |
| src/core/detail/claim-tiers.ts | load-detail-core.ts 134-225 | one query: FACT claims with source `COALESCE(tier_override, base_tier)`, suppressed claims removed, fail closed to {} | 45 |
| src/core/detail/id-redirect.ts | id-redirect.ts 1-63; item-id-filter.ts 1-7 | render, redirect to the owning slug, or not found at the uuid URL; `itemIdColumn` | 45 |
| src/core/detail/inference-view.ts | inference-view.mjs 1-169 | allowlist, current-row rule, citation gate, caps, customer read | 80 |
| src/core/detail/fact-model.ts | fact-paragraphs.ts 1-161; fact-card-model.ts 1-572 | paragraph classes, fact-card models, merge, record model, brief-grade tier match; one regex set | 330 |
| src/core/detail/timeline.ts | timeline-math.ts 1-168; requirement-trajectory-classify.ts 1-66 | classify, collapse 4/4, next clause, obligation merge, trajectory step; `now` is a required argument | 110 |
| src/core/detail/section-index.ts | section-index-data.ts 1-86 | fixed-ordinal index tables | 45 |
| src/core/detail/sources-parse.ts | extract-regulation-sections.ts 18-48 (15 only), 358-492; source-entry-filter.mjs 1-23 | section 15 table parser with the multi-header fix and the placeholder filter, reading only section 15 | 85 |
| src/core/detail/record-sections.ts | parse-record-sections.ts 1-189 | record-grade claim lines, exact-line tiers, key-date split | 100 |
| src/core/detail/relevance-route.ts | app/api/detail/relevance/route.ts 42-79 | per-viewer relevance and binding data; auth decision recorded (section 8, gaps) | 35 |
| src/ui/detail/DetailShell.tsx | components/detail/DetailShell.tsx 69-628 | masthead, section, layout, rail slots, At a glance (callers pass only drawable rows), Impact, In this list, page wrapper with collab slot | 300 |
| src/ui/detail/useListPosition.ts | DetailShell.tsx 69-92, 499-531 | one reader of `list`, `pos`, `of`, `prev`, `next` | 25 |
| src/ui/detail/CrossPageSection.tsx | components/detail/CrossPageSection.tsx 1-306 | Connected intelligence with links through next/link; view computed once by the caller | 230 |
| src/ui/detail/InferenceSection.tsx | InferenceSection.tsx 1-69 | Inferences section | 55 |
| src/ui/detail/FactBlocks.tsx | FactBlocks.tsx 1-56 | fact groups | 40 |
| src/ui/detail/SourcesGrid.tsx | SourcesGrid.tsx 1-161 | rows with registry tier and bias tags | 100 |
| src/ui/detail/RecordFacts.tsx | primitives.tsx 30-126; RegulationDetailSurface.tsx 537-604 | record-grade body with optional gaps line, TagChip | 75 |
| src/ui/detail/RequirementTrajectory.tsx | RequirementTrajectory.tsx 1-37 | trajectory with nowIso | 25 |
| src/ui/detail/action-card-props.tsx | lib/detail/action-card-common-props.tsx 17-57 | shared ActionCard props | 40 |
| src/ui/detail/shared-props.ts | components/detail/shared-props.ts 1-17 | props type | 10 |
| src/ui/detail/collab/ItemNotesBlock.tsx, ItemAssignBlock.tsx, collab-client.ts | ItemNotesBlock.tsx 1-297; ItemAssignBlock.tsx 1-315; item-collab-client.ts 1-63 | workspace notes and assignments (routes stay P1-02) | 515 |
| src/features/regulations/pages (index, [slug], register, two loading files) | app/regulations/** | routes; one segment array for the detail meta | 148 |
| src/features/regulations/RegulationsLedger.tsx | RegulationsLedger.tsx 52-355 | list surface with an error state for the remainder (P1-17's remainder hook surfaces failure) | 190 |
| src/features/regulations/RegulationDetail.tsx | RegulationDetailSurface.tsx 103-674 | detail body; obligation events fetched with an error state; Full depth renders the fact document's sections by key, never the raw full_brief | 380 |
| src/features/regulations/BindingBanner.tsx | BindingBanner.tsx 30-228 | binding banner | 170 |
| src/features/regulations/useItemRelevance.ts | BindingBanner.tsx 109-124; shell/RelevanceBadgeClient.tsx (P1-18) fetch | one relevance fetch per item shared by the banner and the badge | 25 |
| src/features/regulations/ObligationRegister.tsx | ObligationRegister.tsx 72-183; ObligationRegisterFilterBar.tsx 71-487 | register with list and item variants, three coverage states, an error state for a failed seed | 300 |
| src/features/regulations/ObligationRegisterPage.tsx | ObligationRegisterPageView.tsx 28-210 | register page with the shared facet rail | 120 |
| src/features/regulations/OwnerCard.tsx | OwnerTeamCard.tsx 29-174 | owner select at 44 px; org-less is not a failure | 90 |
| src/features/regulations/CorridorsApplied.tsx | CorridorsAppliedStrip.tsx 1-29; CorridorsAppliedStripView.tsx 1-95 | corridors this applies on | 80 |
| src/features/regulations/DismissedStash.tsx | DismissedStash.tsx 21-120 | dismissed regulations, wrapped titles | 70 |
| src/features/regulations/map/MapPage.tsx (with P1-17's planned RegisterRow, ui-kit.md section 8) | MapPageView.tsx 40-517 | ISO-keyed register, region chips from ISO groups, coverage layer, working region filter | 300 |
| src/features/regulations/map/MapView.tsx | MapView.tsx 19-280 | Leaflet with visible attribution | 150 |
| src/features/regulations/map/centroids.ts | jurisdictionCentroids.ts 1-37 | centroids keyed by ISO code | 70 |
| src/features/regulations/map/rollup.ts | jurisdiction-rollup.ts 1-46 | counts by ISO code | 20 |
| src/features/regulations/map/read.ts | supabase-server.ts 3146-3262; data.ts 592-631 | one cached public read of regulation rows for the map | 40 |
| src/features/regulations/map/route.tsx | app/map/page.tsx 1-94 | map route | 40 |
| src/core/jurisdictions/iso.ts | lib/jurisdictions/iso.ts 1-222 | ISO validation; country labels from `Intl.DisplayNames` with the subdivision and free-text tables kept [HYPOTHESIS: identical server and browser output under full ICU] | 70 |
| src/core/jurisdictions/tiers.ts | lib/jurisdictions/tiers.ts 1-213; lib/tier1-priority-jurisdictions.ts (sources-b scope) | one Tier-1 list, Tier 2, subnational, country group | 110 |
| src/core/jurisdictions/legacy.ts | constants.ts 19-141 | legacy slug to ISO and region map, used only for rows without `jurisdiction_iso` | 100 |
| src/core/statutory/{types.ts, fueleu-annex-iv.ts, contractable-barrier.check.ts} | lib/statutory/* | FuelEU computation and its compile-time barrier; offered to P1-10 if the coordinator places it there | 95 |
| src/core/applicability/compute.ts | compute-applicability.mjs 1-90 | applicability gate | 65 |
| moved: row overflow menu (P1-17 src/ui/Menu.tsx) | PriorityDropdown.tsx 51-471 | priority retag, dismiss and archive items on the one Menu, 44 px items, arrow keys, focus return | 200 (P1-17) |
| moved: upcoming-obligations strip (Market surface) | UpcomingObligationsStrip.tsx 35-143; UpcomingObligationsStripView.tsx 1-82, 144-313 | list variant only | 200 (Market) |
| moved: date presets, depth switch, scroll spy (P1-17) | format-fixed-date.ts 15-27; DetailShell.tsx 152-197; use-section-scroll-spy.ts | | 68 (P1-17) |
| moved: ThemeBriefCard (Research surface) | ThemeBriefCard.tsx | | 30 |
| moved: sectors, adjacency, verticals (P1-02); jurisdiction weights (scoring owner); APP_NAME (P1-18) | constants.ts 1-2, 143-256, 287-318 | | about 125 |
| stays: extract-recommended-actions, timeline-parse, section 14 extraction (P1-03) | lib/agent | writer side | 165 (P1-03) |

### Every section of the Regulatory Fact Document, where each is read from

The fact document has 15 sections (formats/regulation.ts:6-22; always 1, 2, 3, 4, 8, 10, 11, 14, 15; conditional 5, 6, 7, 9, 12, 13). On today's page [CONFIRMED read of RegulationDetailSurface.tsx and the item read]:

| key | heading | stored in | rendered as today | new tree |
|---|---|---|---|---|
| 1 | Purpose and Scope of This Document | intelligence_item_sections | only inside the raw full_brief at Full depth | structured section (FactBlocks) at Full depth |
| 2 | What This Regulation Is and Why It Applies | sections | raw full_brief only; Summary reads `what_is_it` or `summary` columns instead | Summary keeps the columns; section 2 at Full depth |
| 3 | Issues Requiring Immediate Action | sections | "Obligations" (FactBlocks), first group at Summary depth | same |
| 4 | How the Workspace Sits in the Compliance Chain | sections | "Compliance chain" (FactBlocks), Full depth | same |
| 5 | Authoritative Guidance Document Analysis (conditional) | sections | raw full_brief only | structured section when present |
| 6 | Anticipated Authoritative Guidance and Pending Events (conditional) | sections | raw full_brief only | structured section when present |
| 7 | Threshold Questions (conditional) | sections | raw full_brief only | structured section when present |
| 8 | Substantive Requirements | sections | "Requirements" (FactBlocks) | same |
| 9 | Product-Specific Compliance Status (conditional) | sections | raw full_brief only | structured section when present |
| 10 | Registration and Reporting Obligations | sections | "Registration" (FactBlocks) | same |
| 11 | Operational System Requirements | sections | "Operations" (FactBlocks) | same |
| 12 | Exemptions and Edge Cases (conditional) | sections | raw full_brief only | structured section when present |
| 13 | Adjacent Industry Research and Alternatives (conditional) | sections | raw full_brief only | structured section when present |
| 14 | Confirmed Regulatory Timeline | item_timelines (harvested by intake from section 14) plus item_forward_events | ActionCard timeline merged with obligation events | same, with an error state for the event fetch |
| 15 | Sources | full_brief (parsed), item source, intelligence_item_citations | SourcesGrid, plus the raw markdown again at Full depth | SourcesGrid only |

The index table (section-index-data.ts) names ten entries; the five unrendered always-or-conditional sections need entries and fixed ordinals, a design change owed to Claude Design (artboard 03 draws the current ten) under CLAUDE.md rule 20. Penalties is not a fact-document section: it renders the item's `penalty_range`, `cost_mechanism`, `enforcement_body`, `compliance_deadline` columns (migration 316).

### Data model actually used

- `intelligence_items`: the detail read selects `*` (supabase-server.ts:3897) and maps id, legacy_id, title, source_url, summary, item_type, priority, added_date, reasoning, tags, what_is_it, why_matters, key_data, full_brief, domain, transport_modes, category, jurisdictions, jurisdiction_iso, item_grade, last_regenerated_at, origin_class, source_id, is_archived, severity, signal_band, theme, trajectory_points, conversion_trigger, what_it_changes, does_not_resolve, compliance_deadline, cost_mechanism, penalty_range, enforcement_body, requirement_trajectory, agent_integrity_flag, agent_integrity_resolved_at, agent_integrity_phrase, agent_integrity_flagged_at, topic_tags, operational_scenario_tags, compliance_object_tags, provenance_status; cross-page reads intersection_summary; the redirect reads id, legacy_id, item_type, domain, provenance_status. Read by `*` and never mapped (so displayed fields stay empty): `recommended_actions` (migration 334) [CONFIRMED]; a legal-instrument column and a last-verified column, which the Resource type and the page expect [HYPOTHESIS: whether intelligence_items carries them; `legal_instrument` appears in migrations 001 and 066 only]. Mapped for other surfaces and not read by Regulations: severity, signal_band, theme, trajectory_points, what_it_changes, does_not_resolve, origin_class.
- `intelligence_item_sections`: id, section_key, section_order, content_md, is_conditional, source_ids (source_ids unused by any renderer).
- `item_timelines`: milestone_date, label, is_completed, sort_order. `item_changelog`: change_date, change_type, field, previous_value, new_value, impact (only impact renders; new_value carries a batch id, RegulationDetailSurface.tsx:494-500). `item_disputes`: note, disputing_sources, is_active. `item_cross_references`: source_item_id, target_item_id, relationship, origin, basis, score, embeds. `item_supersessions`: supersession_date, severity, note, embeds. `source_bias_tags`: source_id, dimension, tag, confidence. `sources` (embed): name, base_tier, effective_tier, tier_override, url.
- `section_claim_provenance`: id, claim_text, claim_kind, intelligence_item_id, sources embed. `inference_records`: inference_id, claim_text, status_token, confidence, cited_item_ids, origin_class, trigger_question_ref, method_id, admissibility, computed_at, supersedes. `connection_themes`: id, member_ids, dominant_signals, density, convergence, surfaces, pivots. `theme_briefs`: theme_id, title, brief_md, member_hash, generated_at, sections, member_ids. `connection_theme_runs`: theme_delta, status, started_at.
- Through other modules: obligations and item_forward_events (P1-16 readers), obligation_objects (workspace/relevance.mjs), item_corrections (corrections), workspace roster and overrides (P1-02), entity_scope (corridor reader).
- RPCs: none called in scope. Views: none.

### Interface to other modules

- Exports offered: `loadDetail`, `applyIdRedirect`, `readDetailItem`, `readCrossPage`, `readFreshInferences`, `readThemeChips`, `fetchClaimTierMap`, `isItemUuid`, `itemIdColumn`, the fact model (`deriveFactCardModels`, `mergeAdjacentSameKind`, `deriveRecordFactCardModel`, `withClaimTiers`, `parseFactParagraphs`), `parseRecordSections`, `splitKeyDateFacts`, `parseSourcesSection`, timeline (`classifyMilestones`, `collapseTimeline`, `nextMilestoneClause`, `mergeObligationEvents`, `formatTrajectoryStep`), section index tables, inference view (`readCustomerInferences`, `currentInferenceRows`, `pickVisibleInferences`), the detail shell parts, SourcesGrid, RecordFacts, CrossPageSection, FactBlocks, the collab blocks, `isoToDisplayLabel`, `jurisLabelOf`, jurisdiction tiers, `computeApplicability`, `computeStatutory`.
- Imports needed: P1-17 ui-kit (ActionCard, Timeline, SectionIndex with the depth switch and scroll spy, Masthead with actionSlot and connectionsSlot, FactCard, ItemGroup, StateNote, Absence, CoverageState, ListRow, FilterChip, RailCard, LegendRailCard, list-surface shell, sort row, facet hook, remainder fetch with an error state, RowOverflowMenu, WatchButton, BiasChips, GfmSection); P1-18 shell (ItemConnectionsCard, RelevanceBadgeClient using `useItemRelevance`, ThemeStrip, NoticesRail); P1-16 obligations (register read, upcoming read, kind labels, event date format, the obligations routes); P1-09 flywheel-a (connection view model, theme-brief view, resolveItemUuid as the one identity helper); P1-02 workspace (overrides store, owner, personal state, roster bootstrap, tags facet, viewer relevance, notes and assignment routes); P1-01 (service and cookie clients, cookie org resolution, rate limit, authed fetch); P1-05 sources-a (customer tier, bias display, url canonicaliser); corrections (suppressed claims); P1-15 producers (none read directly; the cost-slot entries in the binding banner come from producer-filled obligation objects [HYPOTHESIS on the producer id]).
- Consumers by module: Market, Research and Operations detail surfaces (the whole detail architecture, four pages each importing loadDetail, the shell, SourcesGrid, FactBlocks, CrossPageSection, RequirementTrajectory, action-card props, section index); P1-21 Operations (itemIdColumn, isRegulationItem replacement, regionGroupForLabel); P1-25/26 admin (inference view on /admin/inferences, the parts gallery); P1-09/10 flywheel (computeStatutory in propagation/statutory-rows.ts); P1-02 workspace (computeApplicability in relevance.mjs); P1-24 dashboard (theme chips read).
- **Gaps for the coordinator:** (1) intake-a.md section 8 places the same parsers (extract-regulation-sections 1-350 and 373-446, timeline-parse, source-entry-filter, extract-recommended-actions, parse-record-sections) in `src/core/brief/regulation-sections.ts`; under the ruling that the detail parsers belong to P1-19 and P1-21, this register takes the reader half (sources table, record sections) into core/detail and leaves the writer half (section 14, recommended actions) with intake; one of the two rows needs striking. (2) The detail architecture serves four surfaces; this register owns it under the scope ruling, and the Market, Research and Operations lanes consume it. (3) /api/detail/relevance answers anonymous callers with IP limiting only; whether a public detail page's binding banner is a documented public exception is an operator ruling (CLAUDE.md API security policy). (4) The surface ids for Market and Research are not named in this brief; this register says "Market surface" and "Research surface" [HYPOTHESIS that they are P1-20 and P1-22].

### Invariants this code enforces

Already in data-invariants.md: INV-125 (customers read only verified, non-archived items), INV-146 (corrections append-only, evidence verbatim), INV-080 and INV-175 (claim tier is COALESCE(tier_override, base_tier); effective tier never confers grounding), INV-151 (child tables readable only with the parent). Appended by this lane, same commit: INV-227 (one canonical detail surface per item, uuid URLs redirect only to a URL that renders it), INV-228 (a suppressed claim never reaches a customer render, per request, failing closed), INV-229 (the rating drawn on a detail fact or source row is the registry's, never the brief's wording, never an ambiguous match, never on a GAP claim), INV-230 (the inference admission rules on a customer page).

Properties the new tree must carry as tests (not data invariants): the detail page never renders the brief's raw Sources markdown; every stored fact-document section renders once and only once at Full depth; no wall-clock read in a render path (trajectory, timeline); the map's region filter, chips and register use one jurisdiction model; the OSM attribution is visible.

### Rulings the code embodies (cite)

- Surface admission: an item renders only on the surface its raw item_type and domain map to (Phase 0.1, 2026-08-11; [slug]/page.tsx:130-141, supabase-server.ts:4195-4206).
- uuid URLs redirect only to a URL that renders (lane REG-REDIRECT, 2026-09-24; id-redirect.ts, [slug]/page.tsx:93-101).
- The upcoming-obligations strip is removed; each obligation shows in the timeline (operator ruling, lane PARITY-PARTS, 2026-09-25; RegulationDetailSurface.tsx:185-211, timeline-math.ts:131-168).
- Timeline collapse: more than 4, show the next 4 then "+N more" (PARITY-PARTS 2026-09-25; timeline-math.ts:73-79).
- Fixed section ordinals; a missing section is omitted, never renumbered (operator ruling 2026-10-07, lane IDX-1; section-index-data.ts:30-46).
- Connections live in the masthead card, not the rail or a Related section (design handoff 2026-09-25, board 03; RegulationDetailSurface.tsx:245-249).
- The right rail does not repeat masthead fields (operator check 8, 2026-09-24; DetailShell.tsx:400-407).
- Impact is one stepped meter out of 12 (operator check 3, 2026-09-24; artboard 22 ruling B; DetailShell.tsx:434-450).
- A figure's source is rated, never refused; the surface shows the registry rating (CLAUDE.md rule 18; SourcesGrid.tsx:46-62, fact-card-model.ts:472-489).
- Claim tier is COALESCE(tier_override, base_tier), never effective_tier (migration 145; load-detail-core.ts:152-156, parse-record-sections.ts:3-9).
- Customer inferences: allowlisted method only (ADR-039(a), ADR-044 decision 3; inference-view.mjs:3-4) and read per request (lane DFIX-2).
- Suppressed claims are hidden at read time (lane G7-CORR, migration 356; load-detail.ts:66-80, load-detail-core.ts:217-221).
- Viewer role does not write shared workspace tables (SEC-3b, migration 370; PriorityDropdown.tsx:159-163).
- An app feature not drawn in the artboards is restored exactly (UILISTS2 operator ruling 2026-09-07; RegulationsLedger.tsx:25-38, DismissedStash.tsx:3-9).
- Accordions closed by default (fsi-app/.claude/CLAUDE.md; DismissedStash via MoreBelowDisclosure).
- No customer data input (ADR-042, 2026-10-03; docs/specs/01-regulations.md:189-191): the AffectedLanesCard footer and the ActionCard "your lanes: connect data" cell contradict it.
- Statutory figures only from a contractable input (spec 08 section 4 Layer 2; statutory/types.ts, the barrier check).
- Build mode holds scrape cadence off (CLAUDE.md rule 16): nothing in scope reads or writes it.

### Proof that the module works in the new tree

1. Unit tests, each red against a deliberately broken copy first: the id-redirect property ported from `findIdRedirectViolations` (every uuid URL lands on a page that renders that item, or on not-found when no surface admits it); `loadDetail` admission (a market item at /regulations is not found); claim tiers (override beats base, effective never read, a suppressed claim is absent, a correction read error yields {}); `withClaimTiers` ambiguity (two matches with different tiers draw none; under 24 characters draws none); `parseRecordSections` (GAP never rated); the sources parser (two tables in one section never yield a "Source Name" row); timeline collapse at 4 and 5 entries with a fixed `now`; `mergeObligationEvents` same-date dedupe; inference admission (superseded row hidden, non-allowlisted method hidden, uncited claim hidden, cap 5); `computeApplicability` matrix; jurisdiction labels for all EU-27 codes.
2. The statutory compile-time attack stays in the typecheck (a modelled input must fail `tsc`).
3. Rendering smoke at 375, 768, 1024 and 1280 px for the ledger, the detail page (brief grade and record grade), the register page and the map, with the law-2 target floor, and two assertions this register adds: no raw "Sources" heading inside the detail body at Full depth, and each stored section heading appears exactly once.
4. Route matrix for /api/detail/relevance (anonymous, viewer, member, other-org) once the auth ruling is made.
5. Playwright: list to detail keeps the list position (prev and next); a uuid URL redirects; the map region filter and a Coverage-gap link both change what the map shows.
6. `npm run typecheck` and `next build`.

### Port order

1. core/jurisdictions (iso, tiers, legacy map) and core/detail/id-redirect (everything below needs them).
2. core/detail: item-read, claim-tiers, cross-page-read, inference-view, load.
3. core/detail: fact-model, record-sections, sources-parse, timeline, section-index.
4. ui/detail: shell, list-position hook, FactBlocks, SourcesGrid, RecordFacts, CrossPageSection, InferenceSection, RequirementTrajectory, action-card props, collab blocks.
5. features/regulations: detail page and body, binding banner with the shared relevance hook, owner card, corridors, register, register page.
6. features/regulations: list page, ledger, dismissed stash.
7. features/regulations/map with the public map read.
8. Hand PriorityDropdown, the strip, the depth switch, scroll spy and date presets to P1-17 and the Market surface; ThemeBriefCard to Research; sectors and weights to P1-02 and the scoring owner; statutory and applicability to their consumers' placement.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Regulations list, first 60 rows server-rendered, the rest after paint | regulations/page.tsx, RegulationsLedger.tsx | features/regulations/RegulationsLedger |
| Band tiles that filter, grouped or flat list, per-band cap with expand | RegulationsLedger.tsx 184-353 | RegulationsLedger (P1-17 shell parts) |
| URL-backed facets: band, mode, jurisdiction, topic, source tier, workspace tags, search | RegulationsLedger.tsx 138, 184-215 | RegulationsLedger |
| Sort: next date, newest, A-Z, my order, with the `?sort=` deep link | regulations/page.tsx 27-31, RegulationsLedger.tsx 92-97 | RegulationsLedger |
| Scope line: active count, jurisdictions, last sync, next obligation | RegulationsLedger.tsx 270-293 | RegulationsLedger |
| "Updated <date>" chip within 30 days of a regenerated brief | RegulationsLedger.tsx 226-243 | RegulationsLedger |
| Workspace priority retag and dismiss, restore stash | RegulationsLedger.tsx 143-153, 247-255; DismissedStash.tsx; PriorityDropdown.tsx | RegulationsLedger, DismissedStash, P1-17 RowOverflowMenu |
| Watch toggle inside the row menu | RegulationsLedger.tsx 253 | RegulationsLedger |
| List position carried into the detail page (N of M, prev, next) | list-surface-helpers withListPosition; DetailShell.tsx 499-628 | useListPosition, DetailShell |
| Theme strip and coverage denominator under the list | regulations/page.tsx 62-67 | pages (P1-18 ThemeStrip, coverage owner) |
| Detail masthead with breadcrumb, scoped ask box, ActionCard (band, grade, tier, bias, meta, export, share, tag, watch, where, who pays, timeline) | RegulationDetailSurface.tsx 285-339; action-card-common-props.tsx | RegulationDetail, action-card-props |
| Markdown export of the brief | RegulationDetailSurface.tsx 294-304 | RegulationDetail |
| Obligation events merged into the timeline with "+N more" to the register | RegulationDetailSurface.tsx 193-211, 307-308; timeline-math.ts | RegulationDetail, core/detail/timeline |
| Section index with Summary or Full-brief depth and scroll spy | RegulationDetailSurface.tsx 182, 251-262, 343; section-index-data.ts | RegulationDetail, P1-17 SectionIndex |
| Summary: short text, trajectory, what changed (impact lines only), dispute note | RegulationDetailSurface.tsx 474-533 | RegulationDetail |
| Record-grade summary: verbatim facts with tier chips, key dates, gaps count, tags | RegulationDetailSurface.tsx 537-604; parse-record-sections.ts; load-detail-core fetchClaimTierMap | RecordFacts, record-sections, claim-tiers |
| Fact sections 3, 4, 8, 10, 11 as fact cards | RegulationDetailSurface.tsx 126-145, 414-424; FactBlocks; fact-card-model; fact-paragraphs | RegulationDetail, FactBlocks, fact-model |
| Sections 1, 2, 5, 6, 7, 9, 12, 13 (today only inside the raw full brief) | RegulationDetailSurface.tsx 403-407 | RegulationDetail as structured sections (design change owed) |
| Penalties block from the cost columns | RegulationDetailSurface.tsx 451-472 | RegulationDetail |
| Sources grid with registry tier, cited-source match, bias tags | SourcesGrid.tsx; extract-regulation-sections.ts 358-492 | SourcesGrid, sources-parse |
| Connected intelligence: intersections by surface, possible connections, theme analysis, stale note, members by page | CrossPageSection.tsx; supabase-server.ts 4236-4363 | CrossPageSection, cross-page-read |
| Inferences section, per request | InferenceSection.tsx; inference-view.mjs; supabase-server.ts 4372-4393 | InferenceSection, inference-view, cross-page-read |
| Connections and supersessions in the masthead card | RegulationDetailSurface.tsx 336-338 | RegulationDetail (P1-18 ItemConnectionsCard) |
| Rail: At a glance, Impact meter, Relevance badge, Owner and team, In this list, Legend | RegulationDetailSurface.tsx 345-382; DetailShell; OwnerTeamCard | DetailShell, OwnerCard |
| Admin-only agent integrity banner | RegulationDetailSurface.tsx 165-167, 608-638 | RegulationDetail |
| Detail priority menu with archive dialog | RegulationDetailSurface.tsx 653-674 | RegulationDetail with P1-17 RowOverflowMenu and P1-02 ArchiveDialog |
| Binding banner: positions, duty holders, triggers, applicability, cost slots, not-decomposed, retry, profile link | BindingBanner.tsx; api/detail/relevance | BindingBanner, useItemRelevance, relevance-route |
| Item obligation register on the detail page | [slug]/page.tsx 215; ObligationRegister | ObligationRegister (item variant) |
| Corridors this applies on | CorridorsAppliedStrip*.tsx | CorridorsApplied |
| Recalculation notices rail | [slug]/page.tsx 221-223 | page (NoticesRail owner) |
| Workspace notes and multi-assignment with notification at the foot of every detail page | DetailShell ItemCollabSlot; ItemNotesBlock; ItemAssignBlock | ui/detail/collab |
| Static generation of every slug with on-demand fallback and a 10 s build guard | [slug]/page.tsx 68-71; data.ts 545-590 | pages, P1-01 list read |
| Cached item read with tag revalidation; suppressed claims redacted per request | load-detail.ts; supabase-server.ts 3844-3852, 4226-4234 | core/detail/load, item-read |
| Obligation register page with corpus-wide facet counts, paging, three coverage states | register/page.tsx; ObligationRegisterPageView; ObligationRegister; FilterBar | ObligationRegisterPage, ObligationRegister |
| Map: band-coloured count markers, fly-to, key, mode, band and region filters, jurisdiction register linking to the ledger, immediate rail, coverage-gap rail, `?region=` prefilter | app/map/page.tsx; MapPageView; MapView; centroids; rollup | features/regulations/map |
| Jurisdiction labels, tiers, subnational check, region groups | lib/jurisdictions; constants.ts | core/jurisdictions |
| Profile applicability gate | compute-applicability.mjs | core/applicability |
| FuelEU Annex IV penalty with a compile-time contractable barrier and a named RFNBO gap | lib/statutory | core/statutory |
| Upcoming-obligations strip with scope and widen (Market policy timeline) | UpcomingObligationsStrip*.tsx | Market surface |
| Cluster synthesis rail card (Research) | ThemeBriefCard.tsx | Research surface |
| "Affected lanes" rail card (modes and jurisdictions, shipment-data promise) | AffectedLanesCard.tsx | NOT PORTED: modes and jurisdiction are in the masthead dek; the lanes question is answered by CorridorsApplied from external data; the shipment-data promise contradicts ADR-042 |
| Design-gallery fixtures | lib/detail/*fixtures* | NOT PORTED as lib code; P1-17 gallery |

### Defects the new code must not repeat

A detail field read from a column the item read never maps (`recommended_actions`, instrument, last verified); a writer shape and a reader shape for one column that differ; one id resolved six times; a raw Sources dump and duplicated sections at Full depth; eight stored sections with no structured render; a client fetch whose failure reads as "nothing to show" (obligation events B-0047, remainder B-0180, register seed and loader A2-part4:L69, strip A2-part4:L76); two fetches of one route per page; a wall-clock read in render (B-1919, B-1024); a map keyed to a legacy vocabulary and a title regex; a URL parameter with a writer and no reader; a hidden tile attribution; fabricated three-letter codes; a coverage card whose empty state is an error state; a rail card that silently drops what callers pass; 36 px menu items and a 33 px select (B-1942, B-1941); customer copy naming migrations or promising features (B-1943, FilterBar:297, AffectedLanesCard:155); comments citing headers, tests or scripts that no longer exist.

## 9. Backlog rows in scope

Of the 46 in-scope ids in docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md, 44 had no STATUS cell; those cells are written in the same commit (29 CONFIRMED-P1, 10 REFUTED, 5 TRASH; B-0047 and B-0055 occur twice and both occurrences carry the cell). B-1001 and B-1531 already carried a cell (P1-03) and are left as they are. Rows refuted on this tree: B-0055 (inference-view.mjs:151-160 now destructures `successorsError` and warns before returning null), B-0150 (SourcesGrid.tsx:12-14 now says RegulationDetailSurface imports this copy, which it does), B-0176 (format-fixed-date.ts no longer names DashboardTopPriority; `grep -c` = 0), B-0178 (globals.css:583 sets `min-width: 0` on `.cl-table-cards` under the mobile query, so the 720 px minimum applies only on desktop inside its scroller), B-0655 (a loading.tsx is mounted by file convention), B-1557 (the npmtest it cites was deleted by CLEAN-3), and the no-defect observation rows B-0147, B-0149, B-1938, B-1945.
