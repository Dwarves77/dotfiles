# P1-20 market: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-20, DISPOSITION lane, read-only. Tree: origin/master `cc4088c27` (branch cut at `c831e82b5`, fast-forwarded to `cc4088c27` before committing; no in-scope file changed between the two [CONFIRMED: `git diff --stat c831e82b5 cc4088c27 -- fsi-app` is empty]). Written by a cloud session on 2026-10-12 (clock from `date -u`: 04:16 UTC). Every file in SCOPE was read whole with the Read tool; the coverage table below records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` and `{/* */}` blocks and leading-`*` lines stripped). Raw lines are `wc -l`.

## 1. Header and coverage

Module: market, the Market Intel surface (list, headline series, series board, carbon cost per FEU, lead-time chart, policy timeline, spec 09 panels, the detail page's data bundle), the market library behind it (series registry, view models, deltas, freshness, families, carbon arithmetic, corridor and factor selection, signal promotion), the producer-side market helpers that live under src (OOXML workbook parser, CSV parser, carrier ETS envelope, upsert planner, display-row derivation, the ratified series-to-item map), the figures model (format, uncertainty, the statutory / estimated / derived figure components, recalculation notices), the adopted-vocabulary loader, and the market readers inside `src/lib/supabase-server.ts` plus the market wrapper in `src/lib/data.ts` (auth-db.md sections 7-8 assign them here).

Coverage (51 files, 6,916 raw lines read for scope, 4,617 code lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/src/) | raw lines | code lines | read calls |
|---|---|---|---|
| lib/market/series-registry.mjs | 252 | 182 | 1 |
| lib/market/refresh-published-price-statistics.mjs | 139 | 71 | 1 |
| lib/market/lead-time-position.mjs | 96 | 55 | 1 |
| lib/market/series-deltas.mjs | 152 | 99 | 1 |
| lib/market/oil-bulletin-workbook.mjs | 495 | 290 | 1 |
| lib/market/parsers/eu-weekly-oil-bulletin.mjs | 110 | 79 | 1 |
| lib/market/carbon-cost-per-feu.mjs | 166 | 107 | 1 |
| lib/market/series-board-view-model.mjs | 199 | 104 | 1 |
| lib/market/market-rail-select.mjs | 90 | 40 | 1 |
| lib/market/carbon-intensity.mjs | 60 | 40 | 1 |
| lib/market/carrier-ets-surcharge-envelope.mjs | 97 | 60 | 1 |
| lib/market/select-modal-factor.mjs | 104 | 39 | 1 |
| lib/market/carbon-overlay-view.mjs | 195 | 104 | 1 |
| lib/market/series-freshness.mjs | 81 | 36 | 1 |
| lib/market/series-item-map.mjs | 58 | 58 | 1 |
| lib/market/series-family.mjs | 180 | 107 | 1 |
| lib/market/headline-series-select.mjs | 156 | 85 | 1 |
| lib/market/signal-promotion.mjs | 78 | 53 | 1 |
| lib/market/resolve-item-corridor.mjs | 135 | 70 | 1 |
| lib/market/write-market-series.mjs | 67 | 35 | 1 |
| components/market/MarketComparativeRibbon.tsx | 606 | 434 | 1 |
| components/market/MarketIntelLedger.tsx | 355 | 252 | 1 |
| components/market/CarbonCostOverlay.tsx | 265 | 228 | 1 |
| components/market/MarketSeriesBoard.tsx | 257 | 197 | 1 |
| components/market/SeriesProvenance.tsx | 170 | 142 | 1 |
| components/market/SeriesFreshness.tsx | 130 | 107 | 1 |
| components/market/LeadTimeChart.tsx | 89 | 75 | 1 |
| components/market/TrajectoryBars.tsx | 75 | 68 | 1 |
| components/market/spec09.css | 71 | 40 | 1 |
| components/market/IndexationPanelView.tsx | 66 | 60 | 1 |
| components/market/IndexationPanel.tsx | 32 | 29 | 1 |
| components/market/ReroutingPanelView.tsx | 62 | 56 | 1 |
| components/market/ReroutingPanel.tsx | 29 | 26 | 1 |
| components/market/OemRoadmapPanelView.tsx | 59 | 52 | 1 |
| components/market/OemRoadmapPanel.tsx | 29 | 26 | 1 |
| components/market/MarketPolicyTimeline.tsx | 37 | 17 | 1 |
| app/market/page.tsx | 249 | 118 | 1 |
| app/market/[slug]/page.tsx | 380 | 274 | 1 |
| app/market/series/page.tsx | 23 | 21 | 1 |
| app/market/loading.tsx | 21 | 20 | 1 |
| app/market/[slug]/loading.tsx | 20 | 19 | 1 |
| lib/figures/format-range.mjs | 25 | 15 | 1 |
| lib/figures/uncertainty.mjs | 1 | 1 | 1 |
| components/figures/EstimatedFigure.tsx | 158 | 108 | 1 |
| components/figures/StatutoryFigure.tsx | 100 | 64 | 1 |
| components/figures/RecalculationNotice.tsx | 131 | 86 | 1 |
| components/figures/NoticesRail.tsx | 133 | 72 | 1 |
| lib/vocabulary/adopted-terms.mjs | 102 | 59 | 1 |
| lib/vocabulary/adopted-entities.mjs | 60 | 40 | 1 |
| lib/supabase-server.ts, market readers (2260-2262 fetchPublicMarketIntelItems, 2272-2376 MarketPriceStat and fetchPriceStatsByItemIds, 3596-3758 series board types, fetchMarketSeriesBoard, RawMarketSeriesRow, fetchSbtiLeadTimeSeries) | 271 | 163 | 3 (offsets 2186, 2355, 3594; the shared category-RPC core 2190-2249 read for context, counted to no module here) |
| lib/data.ts, market wrapper (969-980 cachedMarketPriceStats, 998-1002 cachedPublicMarketIntel, 1016-1032 getPublicMarketIntelItems) | 34 | 34 | 1 (offset 955) |
| TOTAL | 6916 | 4617 | 54 |

Files not read whole: none in SCOPE. The brief's figure of about 8,100 lines is not reproduced: the scope directories hold 6,645 raw lines [CONFIRMED `find ... | xargs wc -l`] and the market readers add 271 (305 with the data.ts wrapper). The one market file of comparable weight outside the stated scope is `src/components/pages/MarketSignalDetailSurface.tsx` (873 raw lines, the detail page body); it was NOT read whole and has no file row here (gap for the coordinator, section 8 Interface).

Tests: none exist beside the scope on this tree [CONFIRMED `git ls-files 'fsi-app/src/**/*.test.mjs' 'fsi-app/src/**/*.npmtest.mjs'` returns 0]. CLEAN-3 (`f906b2102`) deleted 12 test files in scope, 1,671 lines (MarketComparativeRibbon render 399 and npmtest 86, carbon-cost-per-feu 225, resolve-item-corridor 180, market-rail-select 147, carrier-ets 132, headline-series-select 108, lead-time-position 107, adopted-terms 104, adopted-entities 90, LeadTimeChart 57, format-range 36) and stripped header comments from every code file in scope (MarketComparativeRibbon lost 101 lines, oil-bulletin-workbook 91, resolve-item-corridor 82, select-modal-factor 72, carbon-cost-per-feu 68) [CONFIRMED `git show --stat f906b2102`]. So every "exported for its test" export has no importer, and comments that say "see this file's header" now point at nothing.

Line-number drift: the A2-part5 and A4b registers were written before CLEAN-3, so their line numbers are stale by the header lengths above; every line number in this register is from the current tree.

Consumer evidence: for every exported symbol in scope (142), `grep -rlw <symbol>` over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github/workflows (ts, tsx, mjs, js, sql, yml) excluding the defining file, then an import-statement grep (`grep -rn "import.*<module>"`) for every symbol whose name collides with another module's (GAP, STATES, formatNumber, rowKey, parseCorridorCanonicalName), and a count of in-file uses for every zero-importer symbol [CONFIRMED, outputs in the session log].

## 2. Module verdict

**REFACTOR AND PORT.** Every capability is kept, and the comparative core is sound: the deltas refuse a cross-unit comparison and never print 0 for a missing window, the board never drops an unregistered series, the carbon arithmetic refuses an unprovenanced number and names each gap, factor and corridor selection refuse to pick among several, freshness is derived with an injected clock. What is not kept is the shape: two currency formatters and four number formatters for one display rule, four emission-factor selectors (one of them a committed JSON fixture read by the page), the corridor-name regex in three places, TypeScript re-declarations of every JavaScript return shape, a detail page that reads seven tables inline, three identical panel fetchers, producer-side parsers living under src, a code file holding six intelligence_items UUIDs, and roughly 1,700 lines of comment history. Two rule-18 gaps are real: no market_series figure carries its source's rating on screen, and published_price_statistics.source_tier is always written null.

**Current code LOC: 4,617** (awk over the 51 files and ranges, table above). **Estimated clean LOC: about 3,310**, of which about 2,560 stay in the market feature, about 415 move to the producers module (P1-15), about 245 become the shared figures model and about 90 the shared vocabulary loader. Arithmetic (section 8 table, per planned file): figures 245 (format 15, Figures.tsx 110, Notices.tsx 120) + vocabulary 90 (adopted-terms 50, adopted-entities 40) + market lib 860 (registry 70, series-board 95, deltas 75, freshness 35, headline 140, lead-time 45, rail-select 35, carbon 250, signal-promotion 45, ribbon-model 70) + market read 260 + market UI 1,212 (ledger 190, headline series 210, series board 150, freshness 90, provenance 120, carbon overlay 150, lead-time chart 60, trajectory 50, policy timeline 17, spec 09 panels 150, css 25) + routes 230 (index 80, detail 90, series 21, two loading 39) + producers 415 (workbook 230, CSV parser 65, carrier ETS envelope 45, upsert planner 30, display rows 45) = 3,312, rounded to 3,310. Against today's 4,617 that is 72 percent. Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (11), with the files that carry them today:

1. The market list surface: band-grouped signal rows, signal-kind, mode, region and workspace-tag facets, three sorts, flat or grouped view, scope line with live counts, rail cards (MarketIntelLedger.tsx, app/market/page.tsx).
2. Headline series (spec 02 row 1): up to five family cards then a scrolling remainder, each with value, delta 1w / 1m / YoY in arrow-and-magnitude form, a one-year sparkline, as-of date and freshness badge, absent windows named in the spec 00 section 4 vocabulary with SDMX codes; one methodology drawer (MarketComparativeRibbon.tsx, headline-series-select.mjs, series-family.mjs, series-deltas.mjs).
3. Series board (/market/series): one card per registry producer in state not built, registered unpopulated or live, every observed series with value, period, observation count, watch button, freshness badge and provenance drawer; unregistered series surfaced (MarketSeriesBoard.tsx, series-board-view-model.mjs, series-registry.mjs, app/market/series/page.tsx).
4. Freshness (spec 02 row 11): per-series state against the producer cadence, a board summary where the worst state governs (series-freshness.mjs, SeriesFreshness.tsx).
5. Methodology and provenance (row 10): envelope fields for a series row, an emission factor row and a price statistic (SeriesProvenance.tsx).
6. Carbon cost per FEU (row 3): per-corridor low-point-high range or named gaps, classification badge, jurisdiction chips, anchor ids, the rail's two-row summary, the detail page's intensity block and per-FEU block (carbon-cost-per-feu.mjs, carbon-intensity.mjs, select-modal-factor.mjs, resolve-item-corridor.mjs, carbon-overlay-view.mjs, CarbonCostOverlay.tsx, market-rail-select.mjs, page.tsx).
7. Lead-time position (row 5): SBTi cohort months bars and median, or not forecastable below five rows (lead-time-position.mjs, LeadTimeChart.tsx).
8. Next data drops: soonest next observation per producer from period plus cadence (market-rail-select.mjs).
9. Signal promotion (row 4): unclassified, signal unconfirmed, signal corroborated, fact (signal-promotion.mjs; rendered by MarketSignalDetailSurface, outside scope).
10. Policy timeline (row 9) scoped by the ledger's mode and region facets, spec 09 panels (OEM roadmap, rerouting multipliers, contract indexation terms), recalculation notices (MarketPolicyTimeline.tsx, OemRoadmapPanel*, ReroutingPanel*, IndexationPanel*, NoticesRail.tsx, RecalculationNotice.tsx).
11. The figures model: statutory / estimated / derived figure components behind admissibleFor, range formatting, the 10 percent sensitivity constant (components/figures/*, lib/figures/*). Plus, in scope by directory: the adopted-vocabulary loader (lib/vocabulary/*) and the producer-side parsers and planners (oil-bulletin-workbook, parsers/eu-weekly-oil-bulletin, carrier-ets-surcharge-envelope, write-market-series, refresh-published-price-statistics, series-item-map).

Key dependencies [CONFIRMED by the import and `.from(`/`.rpc(` scans]:

- Modules imported: `react`, `next/link`, `next/navigation`; in-repo `@/lib/contracts/envelope.mjs` (isContractable, isStatutory, DERIVATIONS, stalenessOf, REFRESH_PERIOD_DAYS, formatDelta), `@/lib/contracts/vocabularies.mjs` (FRESHNESS, ORIGIN_CLASS, citableAsFact), `@/lib/contracts/verbatim-grounding.mjs`, `@/lib/entities/unlocode-names.mjs`, `@/lib/entities/entity-id.mjs`, `@/lib/entities/entity-id-shape.mjs`, `@/lib/entities/corridor-scope-cache`, `@/lib/propagation/admissible-for.ts`, `@/lib/propagation/types.ts`, `@/lib/propagation/methods/superseded-notices.ts`, `@/lib/spec09/reroute.mjs`, `@/lib/spec09/oem-payload.mjs`, `@/lib/connections/term-recurrence.mjs`, `@/lib/db/paginate.mjs`, `@/lib/format`, `@/lib/render-now`, `@/lib/urgency/bands`, `@/lib/list-row-fields`, `@/lib/list-pagination`, `@/lib/item-links`, `@/lib/dashboard/row-fields`, `@/lib/tags/useWorkspaceTagsFacet`, `@/lib/watchlist/membership`, `@/lib/api/authed-fetch`, `@/lib/api/org`, `@/lib/detail/load-detail`, `@/lib/detail/load-detail-core`, `@/lib/connections/resource-lookup`, `@/lib/perf/static-params-fallback.mjs`; components from ui (SectionCard, SectionHeading, Absence, WatchButton, RailCard, Masthead, CoverageState, skeleton-page), list-surface (ListSurfaceShell, ListSurfaceRailCards, ListSurfaceSortRow, list-surface-helpers, useListSurfaceFilter), regulations (PriorityDropdown, UpcomingObligationsStrip), shell (ThemeStrip), coverage (CoverageDenominatorLine), pages (MarketSignalDetailSurface); and the static fixture `scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json` (page.tsx:37).
- Tables and views read: market_series (supabase-server.ts:3681, 3740; [slug]/page.tsx:253), published_price_statistics (supabase-server.ts:2344; [slug]/page.tsx:162), intelligence_items (id, legacy_id, supabase-server.ts:2326), emission_factors ([slug]/page.tsx:193), licence_clear_sources view ([slug]/page.tsx:237), entities kind corridor ([slug]/page.tsx:213), sources (independent_citers, confirmation_count, [slug]/page.tsx:134), oem_tech_roadmaps, reroute_events, indexation_clauses (the three panels), vocabulary_terms (adopted-terms.mjs:42); written: entities (adopted-entities.mjs:57, upsert).
- RPCs: `get_market_intel_items_public` (supabase-server.ts:2261 through runCategoryRpcCore), `get_surface_counts` and the slug enumeration through data.ts (`getPublicSurfaceCounts`, `getPublicSurfaceSlugs`), plus the shared category enrichment (citation stats, bias tags) inside supabase-server.ts.
- Env vars read: `PRODUCER_ENTITY_ID` (write-market-series.mjs:11, default parameter `env = process.env`). None on the surface side.
- External services: none. No metered model call, no Browserless, no third-party `fetch(` in scope [CONFIRMED `grep -rniE "anthropic|browserless|fetch\("` over the six directories: two hits, both same-origin, MarketIntelLedger.tsx:99 `/api/listings/rest` (dead, section 4) and NoticesRail.tsx:75 `/api/notices`]. The FREE requirement holds for this module with no replacement owed.

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | Comment history across scope | 2,299 of 6,916 raw lines are comment or blank (6,916 raw minus 4,617 code); the heaviest: page.tsx 131 of 249, [slug]/page.tsx 106 of 380, MarketComparativeRibbon 172 of 606, oil-bulletin-workbook 205 of 495, series-registry's `notes` and `licenceStatus` strings (about 70 lines of prose that are code, so counted as code) | lane narratives (PERF-3, PERF-10, PERF-13, FOLD 63, lane market63, L10, L-CORRIDOR, MKT-1), measurements dated 2026-09, and `fitness-allow: F39` / `F42` notes for enforcers deleted in CLEAN-3 (4 sites) | one header sentence per function; registry carries data fields only, prose moves to docs/ or the data_sources row |
| 2 | Producer-side code under src | oil-bulletin-workbook 290, parsers/eu-weekly-oil-bulletin 79, carrier-ets-surcharge-envelope 60, write-market-series 35, the deriveDisplayRows half of refresh-published-price-statistics 45 = about 509 code lines | every importer is under scripts/producers (fetch-oil-bulletin, eu-weekly-oil-bulletin, carrier-ets producer, ecb-fx, eia-v2, sbti, refresh producer) [CONFIRMED import grep]; nothing on the surface imports them | move to the producers module (P1-15) |
| 3 | TypeScript re-declarations of JavaScript shapes | MarketComparativeRibbon.tsx 49-66, 83-94 (SeriesDeltas, WindowDelta, DeltaPoint, HeadlineCard, HeadlineSelection, then a cast at 253); CarbonCostOverlay.tsx 31-75 (CarbonCostResult mirrors carbonCostPerFeu); supabase-server.ts 3599-3647 (three interfaces mirror buildSeriesBoard's JSDoc); SeriesFreshness.tsx 23-37 | about 120 lines, each a second statement of a shape that drifts silently (the cast `as HeadlineSelection` is how it would) | write the market lib in TypeScript; one exported type per shape |
| 4 | Detail-page data bundle inline in the route | [slug]/page.tsx 128-315 (seven reads, each a `Promise.resolve(...).then(...).catch(() => [])` block), plus `buildSeriesBoard` run over 60 rows to extract one row (250-284) | 190 lines of read code in a route file; the series figure builds a full producer-grouped board to get one display row | `features/market/read.ts` `loadMarketDetailBundle(itemUuid)`; the series figure reads the latest row and its producer directly |
| 5 | Four emission-factor selectors | select-modal-factor.mjs 46-104 (jurisdiction plus mode), carbon-overlay-view.mjs 127-134 `selectFactorForCorridorMode` (mode only), page.tsx 75-78 `findFactorForMode` (first fixture row by mode), and contracts/factor-tier.mjs `resolveActiveFactor` with zero callers (A4b:L58) | the index page and the detail page compute the same overlay from different factor sources by different rules | one `selectFactor({mode, jurisdiction?})` over the emission_factors table; the index page stops reading the fixture (INV-183) |
| 6 | Number and currency formatting written four times | refresh-published-price-statistics.mjs 30-51 (CURRENCY_SYMBOL, splitEnvelopeUnit, formatValueDisplay), series-board-view-model.mjs 6-46 (CURRENCY_SYMBOL, formatSeriesValue with the same prefix strip), figures/format-range.mjs 1-7 (formatNumber, FIXED_LOCALE, duplicating lib/format), RecalculationNotice.tsx 33-42 and StatutoryFigure.tsx 44-50 (local formatters) | five copies of one rule; the board and the published price board can disagree on the same number | one `formatFigure(value, unit, currency)` in core/figures |
| 7 | The series registry as prose-bearing code | series-registry.mjs 182 code lines for six entries; licence status, source names and URLs restated beside data_sources and licence_clear_sources | registry facts that the database already holds (rule 1); comments contradict each other (above/below reversed, 44-45 and 51-53) | registry keeps keyPrefix, familyClass, implemented, cadenceDays, sourceKey, producer path; name, URL, licence and attribution come from the data_sources row |
| 8 | Three identical panel fetchers | IndexationPanel.tsx 7-26, ReroutingPanel.tsx 6-24, OemRoadmapPanel.tsx 6-24 | the same isConfigured, service client, select, order, limit 25, warn, [] body three times | one `readPanelRows(table, columns, order, scope?)` in read.ts |
| 9 | Date arithmetic written three times | refresh-published-price-statistics.mjs 54-59 addDaysIso, series-deltas.mjs 48-52 subtractDaysIso, MarketComparativeRibbon.tsx 209-213 isoMinusDays | three copies of UTC day arithmetic | one `addDaysIso(iso, n)` in core |
| 10 | Corridor-name parsing in three places | resolve-item-corridor.mjs 12-22 (regex and parser, export unused), entities/corridor-scope.ts:22 (the live parser), scripts/entities/write-entity-scope.mjs | the comment at 3-11 admits the copy and blames the no-npm test resolver, which CLEAN-3 removed | import corridor-scope's parser |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github/workflows excluding the defining file, and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| src/components/figures/StatutoryFigure.tsx:52 | StatutoryFigure (whole file) | component | `grep -rn "import.*StatutoryFigure"`: 0; `grep -rn "<StatutoryFigure"`: 0 [CONFIRMED]; agrees with A2-part6:L68 and BACKLOG B-0659 |
| src/components/figures/EstimatedFigure.tsx:69 | EstimatedFigure | exported component | the only import from this file is `DerivedFigure` (MarketSignalDetailSurface.tsx:61); `grep -rn "<EstimatedFigure"`: 0 [CONFIRMED]; A2-part6:L65 |
| src/lib/market/series-deltas.mjs:137 | buildComparativeRibbon | exported function | 0 importers, 1 occurrence in its own file (the definition) [CONFIRMED]; A4b:L125 |
| src/lib/market/series-registry.mjs:250 | implementedProducers | exported function | 0 importers, 1 occurrence in file [CONFIRMED]; A4b:L129 |
| src/lib/vocabulary/adopted-terms.mjs:78 | unionVocabulary | exported function | 0 importers, 1 occurrence in file [CONFIRMED]; A4d:L167 |
| src/lib/market/carbon-cost-per-feu.mjs:16, 166 | CLASSIFICATIONS | exported constant | 0 importers; in-file uses are its declaration and its export [CONFIRMED]; A4b:L112 |
| src/lib/market/oil-bulletin-workbook.mjs:491 | extractLatestEuRow | exported function | 0 importers; the two other in-file mentions are comments (430, 464) [CONFIRMED]; A4b:L119 |
| src/lib/market/resolve-item-corridor.mjs:1 | STATES | exported constant | every name hit is another module's own `STATES` (vocabularies.mjs, record-facts.mjs, migration 080); the only imports from this module are `candidatesFromCorridorEntities` ([slug]/page.tsx:19) and `resolveItemCorridor` (carbon-overlay-view.mjs:2) [CONFIRMED import grep] |
| src/lib/market/resolve-item-corridor.mjs:17 | parseCorridorCanonicalName (export) | export surface | used inside the file only; portfolio/read.ts:7 imports the corridor-scope.ts copy [CONFIRMED] |
| src/lib/market/carrier-ets-surcharge-envelope.mjs:52 | rowKey (export) | exported function | the producer imports groundCandidate, buildCarrierEtsSurchargeRow, buildEtsProxyBand only (carrier-ets-surcharge-producer.mjs:4-8); ukpn-capacity-heatmap-producer.mjs:178 declares its own rowKey [CONFIRMED] |
| src/lib/market/carrier-ets-surcharge-envelope.mjs:1 | isVerbatimSpan (re-export) | re-export | no importer takes it from this path [CONFIRMED import grep]; groundCandidate (same line) is live |
| src/lib/figures/format-range.mjs:1, 4 | FIXED_LOCALE, formatNumber (exports) | export surface | every importer of this module takes `formatRange` only (EstimatedFigure.tsx:31, MarketSignalDetailSurface.tsx:56, CarbonCostOverlay.tsx:1) [CONFIRMED]; lib/format.ts has its own |
| src/components/market/MarketIntelLedger.tsx:98-105 | fetchRemainder | private function | `void fetchRemainder;` with a comment calling it documentation, "not dead code" [CONFIRMED read]; A2-part5:L90 |
| src/components/market/MarketSeriesBoard.tsx:208-222 | the non-null `watchMembership` branch | prop branch | the only mount passes `watchMembership={null}` (app/market/series/page.tsx:20) [CONFIRMED grep: one mount], so `lookupWatchMembership` here never runs |
| src/lib/market/write-market-series.mjs:62 | entity_id back-fill on update | dead branch | `existing.entity_id === null` can only be true when the caller selects entity_id; the four producers that pass `existing` select `"id, series_key, reference_period"` (eu-weekly-oil-bulletin.mjs:78, eia-v2-petroleum-spot-producer.mjs:271, sbti-target-dashboard-producer.mjs:400, ecb-fx-producer.mjs:336), so the value is `undefined` and the branch never fires [CONFIRMED read]; the separate backfill-market-series-entity.mjs:83 is the path that actually stamps it (INV-113) |
| src/lib/market/series-family.mjs:40, headline-series-select.mjs:8, 15, market-rail-select.mjs:7-8, carbon-intensity.mjs:1, series-freshness.mjs:18, refresh-published-price-statistics.mjs:38, 47, signal-promotion.mjs:4, write-market-series.mjs:21, lead-time-position.mjs:8, adopted-terms.mjs:5, 8, 18, adopted-entities.mjs:6, 17, SeriesFreshness.tsx:7, 15, 24 | SERIES_FAMILIES, HEADLINE_VISIBLE_CAP, hasComputedDelta, NEXT_DROPS_ROW_CAP, CARBON_CORRIDOR_ROW_CAP, SUPPORTED_BASES, cadenceNameForDays, splitEnvelopeUnit, formatValueDisplay, PROMOTION_STATE, REFRESHABLE_FIELDS, isSbtiSeriesKey, ADOPTED_KINDS, emptyAdopted, groupAdoptedTerms, ADOPTED_ENTITY_KINDS, planAdoptedTermEntities, FRESHNESS_TONE, FRESHNESS_PANEL_COPY, BoardFreshnessSummary (exports) | export surface | 0 importers each; each is used inside its own file [CONFIRMED per-symbol count]; exported for tests CLEAN-3 deleted |
| src/components/market/MarketComparativeRibbon.tsx:49-57, 111-124, 126-136, 149, 190-219 | DeltaPoint, WindowDelta, SeriesDeltas, DeltaAbsentState, DELTA_STATE_OBS_CODE, DELTA_STATE_LABEL, WindowKey, DeltaCellModel, absentCell, deltaCellModel, SPARKLINE_MAX_POINTS, SparklineModel, SPARKLINE_WINDOW_DAYS, sparklineModel (exports) | export surface | 0 importers each, used inside the file [CONFIRMED]; their tests (render npmtest 399 lines, npmtest 86) were deleted by CLEAN-3 |

Not dead, verified live this session: isImplementedSeriesKey (scripts/mint/validate-mint-payload.mjs), SERIES_ITEM_MAP and loadSeriesItemMap / isRatified / unmappedSeriesKeys (scripts/producers/market/refresh-published-price-statistics.mjs, build-oil-bulletin-rows, propose-series-items), computeSeriesDeltas (lib/propagation/methods/market-series-delta.ts, scripts/producers/market/author-market-series-delta.mjs), carbonIntensity (lib/propagation/methods/carbon-intensity.ts, scripts/propagation/seed-derived-values.mjs, MarketSignalDetailSurface), groundCandidate via the carrier-ets path, buildEtsProxyBand (carrier-ets producer dry run only, HALF-SLICE, see B-0566), PRODUCER_ENTITY_ID_ENV and entityIdFromEnv (scripts/producers/load-registry.mjs, run-registered.mjs), DerivedFigure (MarketSignalDetailSurface.tsx:650, 710), useRecalculationNotices (WatchlistSurface), adoptedTermsFromSupabase (canonical-pipeline.ts, link-items.ts, 2 scripts), memoAdoptedTerms (3 scripts), adoptedThemeTokens (parse-output.ts, metadata-vocab.ts).

Dead counts by token: 15 rows [CONFIRMED], 0 [HYPOTHESIS].

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| currency symbol map | refresh-published-price-statistics.mjs:30; series-board-view-model.mjs:6 | one map in core/figures/format.ts |
| value plus unit display (strip the `<CCY>/` prefix) | refresh-published-price-statistics.mjs:38-51; series-board-view-model.mjs:13-46 | `formatFigure(value, unit, currency)`; deriveDisplayRows and buildSeriesBoard both call it, so the price board and the series board cannot disagree |
| number formatter | figures/format-range.mjs:4-7; lib/format.ts; RecalculationNotice.tsx:33-36; StatutoryFigure.tsx:44-50; EstimatedFigure.tsx:145 inline | lib/format formatNumber with one fraction rule |
| headline factor value pick (ttw, then wtw, then wtt) | carbon-intensity.mjs:10-21 `pickHeadlineKg`; carbon-overlay-view.mjs:22-33 `pickHeadlineNumber`; unit maps carbon-intensity.mjs:7 and carbon-overlay-view.mjs:35 | buildCarbonOverlayView calls carbonIntensity and divides by 1000 for the kg display |
| emission factor selection | select-modal-factor.mjs:46; carbon-overlay-view.mjs:127; page.tsx:75; factor-tier.mjs resolveActiveFactor (no caller) | one selector over the table (section 3 rank 5) |
| UTC day arithmetic | refresh-published-price-statistics.mjs:54; series-deltas.mjs:48; MarketComparativeRibbon.tsx:209 | one addDaysIso |
| series key prefix split | series-board-view-model.mjs:48; series-family.mjs:129; series-registry.mjs:244 inline; lead-time-position.mjs:9 inline | `prefixOf(seriesKey)` in the registry module |
| market_series upsert row key | write-market-series.mjs:18; carrier-ets-surcharge-envelope.mjs:52 | the planner's key, exported once |
| corridor canonical-name regex and parser | resolve-item-corridor.mjs:12-22; entities/corridor-scope.ts:22; scripts/entities/write-entity-scope.mjs | corridor-scope's parser (P1 entities owner) |
| UUID regex | supabase-server.ts:2308 MARKET_ITEM_UUID_RE (and four other copies auth-db.md section 5 lists) | `isUuid()` in core/db (auth-db.md) |
| legacy-id to uuid resolution for price stats | supabase-server.ts:2318-2340; connections/resource-lookup.ts resolveItemUuid used by [slug]/page.tsx:129 | one resolver for both the list and the detail read |
| product labels | parsers/eu-weekly-oil-bulletin.mjs:9-16 PRODUCTS; series-item-map.mjs titles (7, 16, 25, 34, 43, 52); oil-bulletin-workbook.mjs:197-222 slug maps; series-family.mjs labels | PRODUCTS is the one vocabulary; the map stores item ids only |
| SourceProvenance envelope assembly in the route | [slug]/page.tsx:264-279 (casts a board row back into an envelope input) vs SeriesProvenance.tsx:31-46 | envelopeFromSeriesRow takes the raw row and the producer |
| three panel fetchers | IndexationPanel.tsx:7-26; ReroutingPanel.tsx:6-24; OemRoadmapPanel.tsx:6-24 | one read helper (section 3 rank 8) |
| panel header markup | IndexationPanelView.tsx:40-47, ReroutingPanelView.tsx:33-40, OemRoadmapPanelView.tsx:33-40, plus operations' AuxiliaryEnergyPanelView and GridQueuePanelView through spec09.css | one `SpecPanel` shell (title, subtitle, empty state) in the ui-kit (P1-17) |
| page-section header markup (Anton 26 title, 10.5 caption, 2 px rule) | MarketSeriesBoard.tsx:59-95; CarbonCostOverlay.tsx:115-150; spec09.css:22-56 | the ui-kit SectionHeading |
| card tile chrome | MarketComparativeRibbon.tsx:458-476 (and BandTile.tsx, per its own comment 452-457) | a ui-kit Tile primitive (P1-17) |
| rail "Sources tracked" list vs registry | MarketIntelLedger.tsx:337-350 restates the board's producer names and cadences | reads the same board groups (it does); keep, drop the copy of cadence wording |

Over-abstraction: `fetchSbtiLeadTimeSeries(deps)` (supabase-server.ts:3733-3735) keeps a test-only injection seam with no test left; `buildSeriesBoard(rawRows, { producers })` and `selectHeadlineSeries(board, { families })` keep test-only overrides; `RecalculationNotice` and `NoticesRail` both carry a `bare` mode for one caller each. Keep a seam only where the new tree's test uses it.

## 6. Non-essential artifacts

- `src/lib/market/series-item-map.mjs` (58 lines): six intelligence_items UUIDs and their source URLs held in a code file and rewritten by `scripts/maintenance/market/ratify-series-items.mjs` (B1b:L175), against CLAUDE.md rule 1. It is data, not fixture; the new tree holds it in a table (section 8).
- `scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json` (outside scope, imported by app/market/page.tsx:37): a committed fixture feeding a customer surface; INV-183 already names this as the defect not to repeat.
- Customer-visible development copy (product strings, not artifacts, but non-essential to the feature): CarbonCostOverlay.tsx:148 ("the differentiating component") and 152-159 (lane L10, ADR-039, "previously named here as not built"); LeadTimeChart.tsx:65-70 ("spec 02 section 6 item 5", "named here rather than silently absent"); ReroutingPanelView.tsx:16-17 and OemRoadmapPanelView.tsx:15-16 (a repo path `scripts/spec09/SOURCES.md`, "no $0 structured feed"); OemRoadmapPanelView.tsx:52 ("M (missing)", "floor not yet set"); MarketSeriesBoard.tsx:97 (`market_series` in backticks); MarketComparativeRibbon.tsx:151 ("It is in scope and not built."); carbon-overlay-view.mjs:65-66 ("no corridor identity exists in the product today", false while the same file's second function consumes four seeded corridors, A4b:L114) and 105 ("Coverage today is limited to US road and rail modal defaults", a state claim); carbon-cost-per-feu.mjs:13 GAP.NO_CARBON_PRICE names the deferred eex-eua producer though the ruled carbon-price source is the carrier ETS proxy; RecalculationNotice.tsx:82-89 prints method ids, table names and primary keys (A2-part6:L67) [all CONFIRMED read].
- Raw hex against the semantic-token rule: TrajectoryBars.tsx:9-12, CarbonCostOverlay.tsx:82, 84, StatutoryFigure.tsx:66, EstimatedFigure.tsx:79, SeriesFreshness.tsx:11 fallback [CONFIRMED read].
- Glyphs: SeriesFreshness.tsx:19-20, 87 and MarketSeriesBoard.tsx:40 carry em dashes in customer copy; format-range.mjs:22, 24 renders en dashes between range numbers (a typographic choice for ranges, flagged for the design list, not changed here).

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's grep) | note. Paths are under fsi-app/src/.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| lib/market/series-registry.mjs | 1-252 (252) | MARKET_SERIES_PRODUCERS (6 entries), producerFor, isImplementedSeriesKey, implementedProducers | REFACTOR AND PORT | 70 | producerFor 13 (MarketComparativeRibbon, MarketSeriesBoard, SeriesFreshness); MARKET_SERIES_PRODUCERS 3; 6 producer scripts and validate-mint-payload | prose fields duplicate data_sources (rule 1); above/below reversed (44-45, 51-53); `implementedProducers` dead |
| lib/market/refresh-published-price-statistics.mjs | 1-139 (139) | load ratified map, latest per series, display-row derivation for published_price_statistics, unmapped keys, formatting helpers | REFACTOR AND PORT (display rows to P1-15; latestPerSeries and addDaysIso to the market lib) | 45 + 15 | latestPerSeries 2 (series-deltas, series-board-view-model); addDaysIso 2 (market-rail-select, ListSurfaceRailCards comment); deriveDisplayRows 1 script | `source_tier: null` always (112): every published price statistic is written unrated, against rule 18 [CONFIRMED read]; docstring 77-79 says every map entry is pending, all six are ratified (B-2169) |
| lib/market/lead-time-position.mjs | 1-96 (96) | SBTi lead-time cohort: unit-gated months, median, min-sample floor | KEEP AS-IS (comment fix) | 45 | 1: LeadTimeChart.tsx | comment 5-7 says sbti is not registered; it is (series-registry.mjs:186) (B-1036); feed is licence-blocked so the chart only renders not forecastable (B-0567) |
| lib/market/series-deltas.mjs | 1-152 (152) | delta 1w / 1m / YoY with unit-mismatch and insufficient-history states, sparkline points | REFACTOR AND PORT | 75 | computeSeriesDeltas 5 (series-board-view-model, propagation market-series-delta.ts, author-market-series-delta script); DELTA_WINDOWS 1 | buildComparativeRibbon dead; windowDelta never returns a bare null for a window (its states are objects), the JSDoc at 59-60 agrees on this tree |
| lib/market/oil-bulletin-workbook.mjs | 1-495 (495) | regex OOXML reader for the EU Weekly Oil Bulletin xlsx: sheet map, shared strings, rows, two-key EU header resolution, Excel dates, EU series | REFACTOR AND PORT (to P1-15) | 230 | parseSheetNames, parseSharedStrings 3 each (fetch-oil-bulletin, sbti producer, fetch-desnz-factors); 4 more exports 1 each (fetch-oil-bulletin) | shared by three producers, so it is the producers module's xlsx reader, not a market file; extractLatestEuRow dead; slug thresholds 3.5%S / 1%S unverified against the live workbook (B-0683, HYPOTHESIS) |
| lib/market/parsers/eu-weekly-oil-bulletin.mjs | 1-110 (110) | PRODUCTS vocabulary, normalized CSV to market_series rows | REFACTOR AND PORT (to P1-15) | 65 | PRODUCTS 2, parseEuWeeklyOilBulletinCsv 1 (scripts/producers/market) | registry lookup at import with a literal fallback (3, 100) (B-2168) |
| lib/market/carbon-cost-per-feu.mjs | 1-166 (166) | per-corridor carbon cost per FEU: provenance required, named GAPs, band for non-contractable inputs, classification | REFACTOR AND PORT | into carbon.ts | carbonCostPerFeu 2 code importers (page.tsx, carbon-overlay-view) | HALF-SLICE: both callers pass distance, payload and price null, so the ok branch (125-163) never runs in production (B-0565) [CONFIRMED page.tsx:105-111, carbon-overlay-view.mjs:181-187]; CLASSIFICATIONS dead |
| lib/market/series-board-view-model.mjs | 1-199 (199) | formatSeriesValue, buildSeriesBoard (latest per series, per-producer groups, unregistered bucket, deltas per series) | REFACTOR AND PORT | 95 | buildSeriesBoard 3 code importers (supabase-server.ts, [slug]/page.tsx, rendering smoke) | the one place the full row list is still in scope, so deltas are computed here (keep); currency map duplicate |
| lib/market/market-rail-select.mjs | 1-90 (90) | summariseCarbonCorridors (two rows, pending count), selectNextDataDrops (period plus cadence) | KEEP AS-IS | 35 | 2: MarketIntelLedger (selectNextDataDrops), page.tsx (summariseCarbonCorridors) | imports addDaysIso from the producer-side refresher (utility coupling, A4b:L118) |
| lib/market/carbon-intensity.mjs | 1-60 (60) | gCO2e per tonne-km from one emission_factors row | REFACTOR AND PORT | into carbon.ts | 4: MarketSignalDetailSurface, propagation carbon-intensity.ts, carbon-cost-per-feu, seed-derived-values script | pick logic duplicated in carbon-overlay-view (B-2166) |
| lib/market/carrier-ets-surcharge-envelope.mjs | 1-97 (97) | carrier slug, market_series row for one carrier notice, cross-carrier ETS proxy band | REFACTOR AND PORT (to P1-15) | 45 | 1: carrier-ets-surcharge-producer.mjs (dry only, ENABLED false at :21) | HALF-SLICE (B-0566); rowKey copy (B-2167); 58-59 fused comment |
| lib/market/select-modal-factor.mjs | 1-104 (104) | modal-default factor by one jurisdiction and optional mode; ambiguous and no_factor reasons | REFACTOR AND PORT | into carbon.ts | 3: MarketSignalDetailSurface, carbon-overlay-view, [slug]/page.tsx (comment) | detached JSDoc at 15-21; "this file's header" (29) points at nothing; bypasses factor-tier (B-0276) |
| lib/market/carbon-overlay-view.mjs | 1-195 (195) | detail-page intensity view (three states, honest copy) and per-FEU view (corridor resolve plus cost) | REFACTOR AND PORT | into carbon.ts | 1: MarketSignalDetailSurface (both functions) | copy at 65-66 and 105 is stale state (A4b:L114); per-FEU half is HALF-SLICE (inputs null) |
| lib/market/series-freshness.mjs | 1-81 (81) | cadence-name adapter, per-series freshness, board summary | REFACTOR AND PORT (one-line fallback fix) | 35 | deriveSeriesFreshness 4 (MarketSignalDetailSurface, MarketComparativeRibbon, MarketSeriesBoard); summarizeBoardFreshness 2 | the fallback picks the shortest named period not shorter than the cadence (23), so an off-grid cadence (10 days -> biweekly 14) reads fresher than its source, the opposite of the comment at 10-13 [CONFIRMED read against REFRESH_PERIOD_DAYS, envelope.mjs:195-205]; no live producer reaches it (cadenceDays 1 and 7 match exactly); injected clock |
| lib/market/series-item-map.mjs | 1-58 (58) | six ratified series_key -> intelligence_items uuid attachments | REFACTOR AND PORT (to a table) | 0 code (seed migration) | 3 code importers: refresh-published-price-statistics.mjs, [slug]/page.tsx, record-hollow-sweep script; rewritten by ratify-series-items.mjs | facts in code (rule 1, B1b:L175); titles restate PRODUCTS (B-2172) |
| lib/market/series-family.mjs | 1-180 (180) | family class order, seven declared families (incl. the inert carbon:eua), resolveSeriesFamily, producer order | REFACTOR AND PORT (with headline select) | into headline.ts | 1: headline-series-select.mjs | carbon family targets the deferred eex-eua stub while the ruled carbon source is carrier-ets (A4b:L126); hard-coded EIA series keys are ruling-driven |
| lib/market/headline-series-select.mjs | 1-156 (156) | headline row: exclude no-delta series, fold families, order class > freight mode > registry > key, cap 5 | REFACTOR AND PORT | into headline.ts (140 with family) | 1: MarketComparativeRibbon.tsx | sound; the fold count is computed, never a literal [CONFIRMED read 120-123] |
| lib/market/signal-promotion.mjs | 1-78 (78) | four promotion states from origin_class and independent citers | KEEP AS-IS (comment fix) | 45 | 1: MarketSignalDetailSurface | "fail-open" wording (39-40) contradicts the code (unknown code -> weakest signal state); dangling header references (38, 68) (B-1038) |
| lib/market/resolve-item-corridor.mjs | 1-135 (135) | corridor candidates from entities, country-set then mode match, three states | REFACTOR AND PORT | into carbon.ts | candidatesFromCorridorEntities 1 ([slug]/page.tsx), resolveItemCorridor 1 (carbon-overlay-view) | STATES dead; parser duplicate (B-2170); JSDoc 93-94 cites a candidatesFromSeeds() that exists only in a deleted test |
| lib/market/write-market-series.mjs | 1-67 (67) | entity id from env, refreshable fields, idempotent upsert plan | REFACTOR AND PORT (to P1-15) | 30 | planMarketSeriesUpsert 6 (5 producers, carrier envelope comment); entityIdFromEnv 2 | entity_id back-fill on update is dead (section 4); `process.env` read in a default parameter (11, A4b:L131) |
| components/market/MarketComparativeRibbon.tsx | 1-606 (606) | HEADLINE SERIES card: family tiles, delta cells with absence states and SDMX codes, sparkline, as-of, freshness, methodology drawer | REFACTOR AND PORT | 210 + ribbon-model 70 | 1 mount: page.tsx:166 (into MarketIntelLedger aboveRows) | 14 test-only exports; F42 note 439-466 for a deleted enforcer; declared horizontal scroller under 768 (345-365) vs the no-horizontal-reach rule (B-1927, ruling owed); clock fallback 264 only when nowIso is omitted (page passes it) |
| components/market/MarketIntelLedger.tsx | 1-355 (355) | /market list: ListSurfaceShell, kind / mode / region / tag facets, sorts, flat toggle, rail cards | REFACTOR AND PORT | 190 | 1: page.tsx:161 | fetchRemainder dead; kind filter, sort and flat view are component state while the other facets are URL state (145-148), so a kind-filtered view cannot be linked [CONFIRMED read]; scope line 287 "signals are unverified by design" while the RPC returns only provenance_status verified rows (migration 306 and 310, B-1928) |
| components/market/CarbonCostOverlay.tsx | 1-265 (265) | carbon cost per FEU card grid with classification badge, range, input chips or named gaps, jurisdiction chips, anchor ids | REFACTOR AND PORT | 150 | 1: page.tsx:184 | development history in customer copy (148, 152-159); raw hex (82, 84); result type re-declared (45-75) |
| components/market/MarketSeriesBoard.tsx | 1-257 (257) | /market/series board: producer cards by state, series rows with watch, freshness and provenance, unregistered bucket | REFACTOR AND PORT | 150 | 1: app/market/series/page.tsx:20 | non-null watchMembership branch dead; no-op ternary (115); 9.5 px drawer summary with no padding, under the law-2 floor (B-1929) |
| components/market/SeriesProvenance.tsx | 1-170 (170) | FigureEnvelope, envelope adapters for a series row, a factor row and a price statistic, drawer and fields grid | REFACTOR AND PORT | 120 | envelopeFromSeriesRow 3 (Ribbon, SeriesBoard, [slug]/page.tsx); ProvenanceDrawer 2; envelopeFromFactorRow, envelopeFromPriceStat 1 each (MarketSignalDetailSurface) | envelopeFromSeriesRow never sets sourceTier (31-46), so no series figure on any market surface shows its source's rating (rule 18) [CONFIRMED read]; 9.5 px summary (100) |
| components/market/SeriesFreshness.tsx | 1-130 (130) | freshness tones and panel copy, boardFreshnessSummary, panel, badge | KEEP AS-IS (tokens, glyphs) | 90 | SeriesFreshnessBadge 3, boardFreshnessSummary 2, SeriesFreshnessPanel 2 | em dashes in copy (19-20, 87); hex fallback (11) |
| components/market/LeadTimeChart.tsx | 1-89 (89) | lead-time bars, cohort median, not-forecastable state | REFACTOR AND PORT | 60 | 1: page.tsx:190 | internal copy 65-70 (B-0158); 375 px leaves about 19 px for the bar (B-1926, arithmetic) |
| components/market/TrajectoryBars.tsx | 1-75 (75) | 12-point bar trajectory from Resource.trajectoryPoints | REFACTOR AND PORT | 50 | 1: MarketSignalDetailSurface | raw hex ramp (9-12); title says "12 wk" whatever the point count or cadence (43) |
| components/market/spec09.css | 1-71 (71) | spec09 panel header, title, subtitle, row text, 640 px stacking | REFACTOR AND PORT (to P1-17 as the SpecPanel shell) | 25 | 5: the three market panel views, AuxiliaryEnergyPanelView, GridQueuePanelView | a market file imported by operations by relative path |
| components/market/IndexationPanelView.tsx | 1-66 (66) | contract indexation terms, or not covered | REFACTOR AND PORT | into Spec09Panels (150 total) | 1: IndexationPanel.tsx | subtitle 45 promises a computation the view never makes (B-0538) |
| components/market/IndexationPanel.tsx | 1-32 (32) | org-scoped indexation_clauses read (service role, org filter by hand), limit 25 | REFACTOR AND PORT | into read.ts | 1: page.tsx:246 | a read error becomes the not-covered state (A2-part5:L86); resolveOrgIdFromCookies (29) is a cookie read on a page whose comments say it makes no per-viewer read [HYPOTHESIS: the route therefore renders dynamic; not built here]; the service client bypasses migration 311's org_read policy, the hand filter `eq("org_id")` is the only scope |
| components/market/ReroutingPanelView.tsx | 1-62 (62) | reroute events with fuel-burn multiplier on a nominal 100 baseline, compounding chain | REFACTOR AND PORT | into Spec09Panels | 1: ReroutingPanel.tsx | HALF-SLICE (B-0540); raw corridor ids printed (48); repo path in copy (17) |
| components/market/ReroutingPanel.tsx | 1-29 (29) | reroute_events read, limit 25 | REFACTOR AND PORT | into read.ts | 1: page.tsx:245 | error becomes empty |
| components/market/OemRoadmapPanelView.tsx | 1-59 (59) | OEM roadmap cards, TCO crossover notice | REFACTOR AND PORT | into Spec09Panels | 1: OemRoadmapPanel.tsx | HALF-SLICE (B-0539); "M (missing)", "floor not yet set" on screen (B-0160) |
| components/market/OemRoadmapPanel.tsx | 1-29 (29) | oem_tech_roadmaps read, limit 25 | REFACTOR AND PORT | into read.ts | 1: page.tsx:244 | error becomes empty |
| components/market/MarketPolicyTimeline.tsx | 1-37 (37) | URL mode and region facets -> UpcomingObligationsStrip scope | KEEP AS-IS | 17 | 1: page.tsx:239 | the strip itself is the regulations module's (A2-part4:L76) |
| app/market/page.tsx | 1-249 (249) | /market server page: five parallel reads, overlay entries, mounts | REFACTOR AND PORT | 80 | Next route | reads the DESNZ fixture (37, INV-183); comment 33 stale (sbti is registered); 131 comment lines |
| app/market/[slug]/page.tsx | 1-380 (380) | market signal detail: id redirect, cached item bundle (seven reads), static params, notices | REFACTOR AND PORT | 90 (reads to read.ts) | Next route; every itemDetailHref for a market item | convergence read drops its error (139) [CONFIRMED read], the post-mortem shape; `console.log` on every render (336); full board built for one row (264) |
| app/market/series/page.tsx | 1-23 (23) | /market/series route | KEEP AS-IS | 21 | Next route; MarketComparativeRibbon "Series board" link | |
| app/market/loading.tsx | 1-21 (21) | list skeleton | KEEP AS-IS | 20 | Next route | |
| app/market/[slug]/loading.tsx | 1-20 (20) | detail skeleton | KEEP AS-IS | 19 | Next route | |
| lib/figures/format-range.mjs | 1-25 (25) | formatRange (sorted low-point-high, currency prefix or unit suffix); formatNumber, FIXED_LOCALE copies | REFACTOR AND PORT | into core/figures/format.ts (15) | formatRange 3: EstimatedFigure, MarketSignalDetailSurface, CarbonCostOverlay | with fewer than three numbers it prints a dash glyph for each missing bound joined by en-dash glyphs (22) rather than naming the missing bound; sorting silently swaps a mis-ordered triple (23) |
| lib/figures/uncertainty.mjs | 1-1 (1) | UNCERTAINTY_PCT 0.10 | KEEP AS-IS (into format.ts) | 1 | 1: carbon-cost-per-feu.mjs | |
| components/figures/EstimatedFigure.tsx | 1-158 (158) | EstimatedFigure (range, companions, pedigree note) and DerivedFigure, both behind admissibleFor | REFACTOR AND PORT | into ui/figures/Figures.tsx (110 with Statutory) | DerivedFigure 1: MarketSignalDetailSurface (650, 710); EstimatedFigure 0 | HALF-SLICE (B-0537, F1-S4-09: no estimated_values writer); default `now = new Date()` (69, 129) reads the clock in render when omitted, and the only caller omits it (A2-part6:L65) |
| components/figures/StatutoryFigure.tsx | 1-100 (100) | statutory figure card: citation, formula version, admissibility | TRASH as a file (the kind is ported inside Figures.tsx) | 0 | 0 [CONFIRMED] | DEAD (B-0659); the statutory-vs-estimate render isolation (spec 08 section 4 layer 4) is kept as a feature |
| components/figures/RecalculationNotice.tsx | 1-131 (131) | old -> new notice rows, method versions, triggering event, empty states | REFACTOR AND PORT | into ui/figures/Notices.tsx (120 with the rail) | 3: NoticesRail, WatchlistSurface (2 imports) | prints method ids, table names and primary keys to customers (A2-part6:L67); local formatters |
| components/figures/NoticesRail.tsx | 1-133 (133) | useRecalculationNotices (authedFetch /api/notices, window start), NoticesRail | REFACTOR AND PORT | into Notices.tsx | 7 mounts: market index and the four detail pages, WatchlistSurface (rail and hook) | a failed read renders the empty message (78, 83-85) (B-0046); the feed is org-watchlist-wide, not item-scoped, on every detail page (header 15-21) |
| lib/vocabulary/adopted-terms.mjs | 1-102 (102) | adopted vocabulary_terms loader (fail closed to empty), grouping, keys, entries, theme tokens, memo loader | REFACTOR AND PORT (to core/vocabulary, owner P1-09) | 50 | 14 production importers across canonical-pipeline.ts, link-items.ts and 7 scripts | unionVocabulary dead (B-0289, B-1587) |
| lib/vocabulary/adopted-entities.mjs | 1-60 (60) | plan and mint entities for adopted standards and materials | KEEP AS-IS (to core/vocabulary) | 40 | 1: entities/link-items.ts | a write error is returned, never thrown, by design (non-gating link step) |
| lib/supabase-server.ts (market readers) | 2260-2262, 2272-2376, 3596-3758 (271) | fetchPublicMarketIntelItems, fetchPriceStatsByItemIds, the three board interfaces, fetchMarketSeriesBoard, RawMarketSeriesRow, fetchSbtiLeadTimeSeries | REFACTOR AND PORT (to features/market/read.ts) | about 110 inside read.ts | fetchMarketSeriesBoard 2 (market/page.tsx, market/series/page.tsx); fetchSbtiLeadTimeSeries 1; fetchPriceStatsByItemIds 1 (data.ts); fetchPublicMarketIntelItems 1 (data.ts) | SERIES_HISTORY_LIMIT 1000 caps the whole table, not each series, ordered by period: four daily ECB series alone write about 1,000 rows a year, so YoY and the one-year sparkline can fall outside the window as history grows [HYPOTHESIS: live row count not read]; comment 3662-3666 says the page is force-dynamic (the page now claims static, PERF-10); comment 3717-3719 says the sbti producer has not landed (it has, licence-blocked) |
| lib/data.ts (market wrapper) | 969-980, 998-1002, 1016-1032 (34) | cached public market rows (PUBLIC_ITEMS_TAG) decorated with the first published price statistic per item (cache key market-price-stats-v1, 60 s) | REFACTOR AND PORT (into read.ts) | inside read.ts | getPublicMarketIntelItems 3 code callers (market/page.tsx:126, [slug]/page.tsx:296, data.ts:578 getPublicSurfaceSlugs) | the price-stat decoration is a second read after the cached RPC on every render; the list never shows the series envelope, only the display string |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/core/figures/format.ts | figures/format-range.mjs 16-25; figures/uncertainty.mjs 1; refresh-published-price-statistics.mjs 30-51; series-board-view-model.mjs 6-46; RecalculationNotice.tsx 33-42; StatutoryFigure.tsx 44-50 | `formatFigure(value, unit, currency)`, `formatRange(low, point, high, unit, currency)` naming a missing bound, UNCERTAINTY_PCT, currency map; uses lib/format formatNumber | 15 |
| src/ui/figures/Figures.tsx | EstimatedFigure.tsx 29-158; StatutoryFigure.tsx 20-100 | StatutoryFigure, EstimatedFigure, DerivedFigure: separate exports and badges, one shared gate call and meta line, `now` required (injected render instant) | 110 |
| src/ui/figures/Notices.tsx | RecalculationNotice.tsx 20-131; NoticesRail.tsx 28-133 | useRecalculationNotices with a distinct error state, NoticesRail, RecalculationNotice; customer copy without table names or primary keys (method version stays in the drawer) | 120 |
| src/core/vocabulary/adopted-terms.ts | vocabulary/adopted-terms.mjs 1-102 minus 72-88 | adopted-terms loader and helpers (owner P1-09) | 50 |
| src/core/vocabulary/adopted-entities.ts | vocabulary/adopted-entities.mjs 1-60 | plan and mint adopted entities (owner P1-09) | 40 |
| src/features/market/lib/registry.ts | series-registry.mjs 1-252 | six producers as data: keyPrefix, familyClass, implemented, cadenceDays, sourceKey, producer and parser paths; `producerFor`, `prefixOf`, `isImplementedSeriesKey`; name, URL, licence and attribution from data_sources | 70 |
| src/features/market/lib/series-board.ts | series-board-view-model.mjs 13-199; refresh-published-price-statistics.mjs 54-73 (addDaysIso, latestPerSeries) | latestPerSeries, buildSeriesBoard (groups, states, unregistered bucket, deltas), display row type | 95 |
| src/features/market/lib/deltas.ts | series-deltas.mjs 1-126 | computeSeriesDeltas with the four states, DELTA_WINDOWS | 75 |
| src/features/market/lib/freshness.ts | series-freshness.mjs 1-81 | cadenceNameForDays (fallback corrected to the longest period not longer than the cadence), deriveSeriesFreshness, summarizeBoardFreshness | 35 |
| src/features/market/lib/headline.ts | series-family.mjs 1-180; headline-series-select.mjs 1-156 | families, resolveSeriesFamily, selectHeadlineSeries (cap 5, fold, order) | 140 |
| src/features/market/lib/ribbon-model.ts | MarketComparativeRibbon.tsx 108-244 | deltaCellModel, absentCell, sparklineModel, the absence-state labels and SDMX codes | 70 |
| src/features/market/lib/lead-time.ts | lead-time-position.mjs 1-96 | buildLeadTimePosition, DEFAULT_MIN_SAMPLE | 45 |
| src/features/market/lib/rail-select.ts | market-rail-select.mjs 1-90 | summariseCarbonCorridors, selectNextDataDrops | 35 |
| src/features/market/lib/carbon.ts | carbon-intensity.mjs 1-60; carbon-cost-per-feu.mjs 1-164; select-modal-factor.mjs 23-104; resolve-item-corridor.mjs 24-135; carbon-overlay-view.mjs 1-195; app/market/page.tsx 72-114 | carbonIntensity, carbonCostPerFeu with named gaps, one `selectFactor`, resolveItemCorridor over corridor-scope's parser, buildCarbonOverlayView, buildCarbonCostPerFeuView, buildCarbonCostOverlays; gap copy without internal producer names | 250 |
| src/features/market/lib/signal-promotion.ts | signal-promotion.mjs 1-78 | derivePromotionState | 45 |
| src/features/market/read.ts | supabase-server.ts 2260-2262, 2272-2376, 3596-3758; data.ts 969-1032; [slug]/page.tsx 128-315; IndexationPanel.tsx 7-26, ReroutingPanel.tsx 6-24, OemRoadmapPanel.tsx 6-24 | listMarketSignals (cached public RPC plus price statistic), readSeriesBoard (per-series window, not a whole-table cap), readSbtiRows, loadMarketDetailBundle (convergence with its error surfaced, price board, factors with licences, corridors, series figure with source rating), readPanelRows (failure distinct from empty) | 260 |
| src/features/market/ui/MarketLedger.tsx | MarketIntelLedger.tsx 29-355 | list surface, kind facet and sort in the URL contract, rail cards | 190 |
| src/features/market/ui/HeadlineSeries.tsx | MarketComparativeRibbon.tsx 1-107, 252-606 | headline card, tiles, cells, sparkline svg, freshness, one drawer | 210 |
| src/features/market/ui/SeriesBoard.tsx | MarketSeriesBoard.tsx 1-257 | producer cards, series rows, watch, badge, drawer, unregistered bucket; 44 px drawer summary | 150 |
| src/features/market/ui/SeriesFreshness.tsx | SeriesFreshness.tsx 1-130 | tones from tokens, panel, badge | 90 |
| src/features/market/ui/Provenance.tsx | SeriesProvenance.tsx 1-170 | FigureEnvelope with sourceTier for every adapter (series rows read the rating of their data_sources / sources row), drawer, fields | 120 |
| src/features/market/ui/CarbonCostOverlay.tsx | CarbonCostOverlay.tsx 1-265 | corridor cards, badge from tokens, range or named gaps | 150 |
| src/features/market/ui/LeadTimeChart.tsx | LeadTimeChart.tsx 1-89 | bars, median, not forecastable | 60 |
| src/features/market/ui/TrajectoryBars.tsx | TrajectoryBars.tsx 1-75 | trajectory bars from tokens, title from the actual point count | 50 |
| src/features/market/ui/PolicyTimeline.tsx | MarketPolicyTimeline.tsx 21-37 | scope from URL facets to the obligations strip | 17 |
| src/features/market/ui/Spec09Panels.tsx | OemRoadmapPanelView.tsx 1-59; ReroutingPanelView.tsx 1-62; IndexationPanelView.tsx 1-66 | three panel bodies on the ui-kit SpecPanel shell; corridor names, not ids; no repo paths or codes in copy | 150 |
| src/ui/spec-panel.css (P1-17 owns) | spec09.css 22-71 | SpecPanel header and stacking | 25 |
| src/app/market/page.tsx | app/market/page.tsx 116-249 | five reads through read.ts, mounts | 80 |
| src/app/market/[slug]/page.tsx | app/market/[slug]/page.tsx 100-122, 318-380 | static params, id redirect, loadDetail with loadMarketDetailBundle, notices | 90 |
| src/app/market/series/page.tsx, loading.tsx, [slug]/loading.tsx | the three files whole | route and skeletons | 60 |
| P1-15 producers: xlsx reader, oil bulletin CSV parser, carrier ETS envelope, upsert planner, display rows | oil-bulletin-workbook.mjs 1-488; parsers/eu-weekly-oil-bulletin.mjs 1-110; carrier-ets-surcharge-envelope.mjs 3-97; write-market-series.mjs 1-67; refresh-published-price-statistics.mjs 1-29, 75-138 | producer-side code moved out of src; the planner back-fills entity_id only when the caller selects it (or always stamps); display rows write source_tier from the source's rating | 415 |
| supabase migration (schema DDL first, rule 3) plus a data migration | series-item-map.mjs 1-58 | `market_series_items (series_key text primary key, item_id uuid references intelligence_items, status text)` seeded with the six ratified rows; ratify-series-items writes rows, not a source file [HYPOTHESIS: table shape is this register's proposal, ADR owed] | about 25 SQL |

### Data model (columns actually used by this module; "unused" means no code in this scope reads or writes it)

- `market_series` (268, 373): read `id, series_key, label, value_numeric, unit, currency, derivation, origin_class, source_key, source_ref, n_observations, method_version, as_at_date, reference_period`; written by the producers (P1-15) through planMarketSeriesUpsert with the same set plus `entity_id`. Unused by the surface: `created_at, updated_at, entity_id` [CONFIRMED: migration 268:80-116, 373:178-179 against the selects].
- `published_price_statistics` (151): read `item_id, label, value_display, unit, context_line, severity_tone, source_tier, released_at, next_release_at, next_release_label, sort_order`; written by the refresh producer with `source_tier` always null (refresh-published-price-statistics.mjs:112). Unused here: `id`.
- `emission_factors` (258): read `factor_id, mode, vehicle_class, jurisdiction, quantity_basis, ttw_co2e, wtt_co2e, wtw_co2e, source_key, tier, scope_kind, derivation, origin_class, method_version, n_observations, as_at_date`, filtered `tier = 'modal_default'` and `superseded_by IS NULL`. `scope_kind` is selected and read by nothing in scope [HYPOTHESIS: MarketSignalDetailSurface not read]. The index page reads none of these (it reads the fixture).
- `licence_clear_sources` view (258): `source_key, name, attribution, licence, url`.
- `entities` (kind corridor, status active): `entity_id, canonical_name`; written by adopted-entities.mjs: `entity_id, kind, canonical_name, status`.
- `sources`: `independent_citers, confirmation_count` by id.
- `oem_tech_roadmaps` (296, 380): `roadmap_id, tech_category, commercial_stage, target_year, density_basis, confidence_admiralty, announced_at`. `reroute_events` (296): `reroute_id, baseline_corridor_id, reroute_corridor_id, cause, fuel_burn_multiplier, effective_from, effective_to`. `indexation_clauses` (296, 311): `clause_id, contract_ref, corridor_id, index_id, base_value, base_date, passthrough_pct, cap_pct, floor_pct, review_cadence, rounding_rule`, filter `org_id`, order `created_at`. Columns beyond these were not inventoried here [HYPOTHESIS].
- `vocabulary_terms` (355): `id, kind, term_key, label, status`.
- `intelligence_items`: `id, legacy_id` (price-stat id resolution); the list rows come through `get_market_intel_items_public` (306, redefined 310: verified, non-archived, `surface_of = 'market'`, plus item_grade) [CONFIRMED read of 306:279-307 and 310].
- RPCs: `get_market_intel_items_public`, `get_surface_counts` (through data.ts), the citation-stats and bias-tag enrichments shared with research and operations.

### Interface to other modules

- Exports offered: `buildSeriesBoard`, `computeSeriesDeltas`, `deriveSeriesFreshness`, `producerFor`, `isImplementedSeriesKey`, `carbonIntensity` (P1-09 / propagation methods), `formatFigure`, `formatRange`, the figure components and `NoticesRail` / `useRecalculationNotices` (watchlist, the four detail surfaces), the adopted-vocabulary loader (P1-09 flywheel-a, canonical pipeline, scripts/connections).
- Imports needed: P1-18 shell (Masthead, ThemeStrip, CoverageDenominatorLine, page frame); P1-17 ui-kit (SectionCard, SectionHeading, Absence and ABSENCE_TEXT_STYLE, CoverageState, RailCard, WatchButton, a Tile primitive, the SpecPanel shell, skeleton-page, tokens for every hex listed in section 6); list-surface (ListSurfaceShell, rail cards, sort row, facet helpers, useListSurfaceFilter) whose owner the coordinator names; P1-15 producers (everything that writes market_series and published_price_statistics; the moved parsers and planners); P1-09 flywheel-a (derivation edges INV-045, propagation `admissibleFor`, `fetchSupersededNotices`, the `/api/notices` route); P1-05 sources-a (the source rating that every market figure must show, rule 18; `data_sources` and the institution class table for carrier hosts); P1-01 auth-db (`isUuid`, clients, `resolveOrgIdFromCookies` for the indexation panel); entities (corridor-scope parser and cache, unlocode names); the regulations module (UpcomingObligationsStrip); the detail lane (loadDetail, applyIdRedirect, fetchClaimTierMap, buildResourceLookup).
- **Gap for the coordinator:** `src/components/pages/MarketSignalDetailSurface.tsx` (873 lines) is the market detail body (price board, carbon intensity and per-FEU blocks, DerivedFigure, promotion state, trajectory, freshness of the series figure) and is in no Part 1 SCOPE this lane was given; its consumers of this module are listed above by grep only. It needs an owner (this module's port lane is the natural one) and a whole read before porting.
- **Gap for the coordinator:** `src/lib/spec09/oem-payload.mjs` and `reroute.mjs` (read by A4d:L360-361) feed the spec 09 panels and are not in this scope.

### Invariants this code enforces

Already in data-invariants.md: INV-045 (series write followed by derivation edges), INV-046 (producer gates and kill switch), INV-047 (published price statistics only from ratified series items), INV-109 and INV-144 (emission_factors append-only and licence-gated, market_series unique on key and period), INV-113 (market_series.entity_id stamped by the registry RPC), INV-173 (missing observation never carries a value; freshness derived), INV-183 (no committed fixture feeds a surface), INV-203 (admissibility per use). Appended by this lane, same commit: INV-213 (a delta compares only same-unit same-currency points and never prints 0 for a missing window), INV-214 (every observed series is on the board; the headline row excludes only no-delta series and folds by computed count), INV-215 (carbon cost per FEU prints a range only with every input provenanced; otherwise named gaps), INV-216 (factor and corridor selection never pick among several), INV-217 (promotion to Fact only on a fact-citable origin class), INV-218 (lead-time position needs five months-unit rows), INV-219 (series freshness: cadence mapping that never reads fresher than the source, worst state governs, empty is unknown; today's fallback inverts the first clause), INV-220 (next data drop equals period plus registered cadence, the same derivation as next_release_at), INV-221 (an ETS proxy band needs two carriers in one currency and one period), INV-222 (an estimate always renders low, point and high; a statutory figure always renders its citation and formula version; both pass admissibleFor first), INV-223 (every market figure on a customer surface shows its source's rating, today violated).

### Rulings the code embodies (cite)

- Market Intel reads are comparative and numerical (spec 02 contract, ruled 2026-07-12; series-deltas.mjs, headline-series-select.mjs).
- The headline row: families, order fuels, carbon, FX, other indices; five visible, the rest reachable; a series with no computed delta is not a headline (operator ruling steps 1-4, 2026-09-08; series-family.mjs:9, headline-series-select.mjs:8, 78-85).
- Sparkline window is one year, matching YoY (operator ruling 2026-10-08; MarketComparativeRibbon.tsx:205-207).
- Corridor rate board retired (spec 02 amendment 2026-09-25, decision 1); carbon cost per FEU stands alone, from carrier-published ETS surcharges, never blended without a range (decisions 1 and 2; series-registry.mjs:51-54, carrier-ets-surcharge-envelope.mjs:68-97).
- External data only: no customer rate, no client override, no "you" marker (ADR-042, 2026-10-03; spec 02 notes at 95 and 175); the surcharge audit panel removed (ADR-042, page.tsx:241-243).
- No corridor identity is invented from a signal's jurisdictions (WO-24; select-modal-factor.mjs, resolve-item-corridor.mjs:101-135).
- Lead-time chart fed by SBTi (coordinator ruling 2026-10-03, ADR-039, lane L10); SBTi redistribution prohibited, so the producer refuses apply (series-registry.mjs:206-214).
- A figure with a source is published with that source's rating (CLAUDE.md rule 18): not yet met for series figures (INV-223).
- Accordions closed by default (CLAUDE.md doctrine; the methodology drawers are closed `<details>`).
- Artboard 04 / p4 governs the list layout: headline card between band tiles and sort row, rail order Filters, Carbon cost per FEU, Next data drops, Legend, then Sources tracked (ruling R7; MarketIntelLedger.tsx:328-336). The sparkline and the 1m / YoY cells are not on the artboard: a DESIGN CHANGE OWED (rule 20, A2-part5:L89).
- Build mode holds the scrape cadence off (rule 16): freshness states may read stale and that is not a defect.

### Proof that the module works in the new tree

1. Unit tests, each red against a deliberately broken copy first, re-creating what CLEAN-3 deleted (1,671 lines): computeSeriesDeltas (unit change, zero prior, one point, window with no prior point); buildSeriesBoard (unregistered prefix kept, not_built group with rows); selectHeadlineSeries (no-delta exclusion, fold count, declared primary absent, carbon family arrival); carbonCostPerFeu (unprovenanced number throws, each gap named, statutory vs derived vs estimate classification, band only on non-contractable inputs); selectFactor and resolveItemCorridor (two jurisdictions, GLOBAL, two modes, two corridors in one country set); buildLeadTimePosition (four rows, five rows, wrong unit); deriveSeriesFreshness and summarizeBoardFreshness (null cadence, empty list, a 10-day cadence judged no fresher than 7 days); selectNextDataDrops (stub producer, null cadence, no observation); buildEtsProxyBand (one row, mixed currency, two periods); derivePromotionState (fact-citable origin, two citers, unknown code); formatRange (missing bound named).
2. A database attack for INV-223: render a series row whose source has a rating and assert the rating text is present; the same for a published price statistic.
3. Rendering smoke at 375, 768, 1024, 1280 (the UX slot): MarketLedger, HeadlineSeries, SeriesBoard, CarbonCostOverlay, LeadTimeChart, Spec09Panels; no overflow outside declared strips, no target under the law-2 floor (drawer summaries included).
4. Persona read: anon and member see the same verified market rows; the indexation panel shows only the viewer's org rows (and none for an org-less viewer).
5. `npm run typecheck` and `next build`, with /market and /market/[slug] reported static where the plan says static.

### Port order

1. core/figures/format.ts and ui/figures (every surface imports them).
2. features/market/lib: registry, series-board, deltas, freshness, headline, ribbon-model, lead-time, rail-select, carbon, signal-promotion.
3. The series-item table (schema DDL applied first, then the data migration), and P1-15 receives the producer-side files.
4. features/market/read.ts (after the source-rating read from P1-05 exists).
5. features/market/ui, then the three routes.
6. core/vocabulary to P1-09.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Market list with band groups, per-band cap 5 and expand | MarketIntelLedger.tsx | ui/MarketLedger |
| Signal-kind facet from the classified severity column | MarketIntelLedger.tsx:77-88, 179-195 | ui/MarketLedger (URL-backed) |
| Mode, region and workspace-tag facets with live counts | MarketIntelLedger.tsx:163-208 | ui/MarketLedger |
| Sorts Next date, Newest, A-Z and flat vs grouped view | MarketIntelLedger.tsx:66-70, 305-320 | ui/MarketLedger |
| Scope line with active signals and observed series counts | MarketIntelLedger.tsx:278-289 | ui/MarketLedger (copy reconciled with the verified gate) |
| Row overflow menu with Watch (signal) and a list position for prev / next | MarketIntelLedger.tsx:224-246 | ui/MarketLedger |
| Rail: carbon cost per FEU (two corridors, pending count) | market-rail-select.mjs:31-42; ListSurfaceRailCards | lib/rail-select, rail card |
| Rail: next data drops | market-rail-select.mjs:65-90 | lib/rail-select |
| Rail: legend, sources tracked | MarketIntelLedger.tsx:336-350 | ui/MarketLedger |
| Headline series card: five families, scrolling remainder, fold "+N rates" | MarketComparativeRibbon.tsx, headline-series-select.mjs, series-family.mjs | ui/HeadlineSeries, lib/headline |
| Delta 1w / 1m / YoY with arrow and unsigned magnitude | series-deltas.mjs, MarketComparativeRibbon.tsx:149-184 | lib/deltas, lib/ribbon-model |
| Absence states per window (no data yet, not covered, suppressed, not applicable) with SDMX codes | MarketComparativeRibbon.tsx:108-136, 570-606 | lib/ribbon-model |
| One-year sparkline sampled to 60 points | MarketComparativeRibbon.tsx:186-244 | lib/ribbon-model |
| Freshness badge and board freshness panel | series-freshness.mjs, SeriesFreshness.tsx | lib/freshness, ui/SeriesFreshness |
| Methodology and provenance drawer (series, factor, price statistic) | SeriesProvenance.tsx | ui/Provenance (with source rating) |
| Series board with producer states and unregistered bucket | MarketSeriesBoard.tsx, series-board-view-model.mjs | ui/SeriesBoard, lib/series-board |
| Watch a single market_series observation | MarketSeriesBoard.tsx:208-222 | ui/SeriesBoard |
| Carbon cost per FEU overlay per corridor with badge, range or gaps, jurisdiction chips, anchor ids for "Corridors this applies on" links | CarbonCostOverlay.tsx, carbon-cost-per-feu.mjs, page.tsx:89-114 | ui/CarbonCostOverlay, lib/carbon |
| Detail carbon intensity block (modal default, ambiguous, no factor) | carbon-overlay-view.mjs:46-108 | lib/carbon (rendered by the detail body) |
| Detail per-FEU block from the seeded corridor | carbon-overlay-view.mjs:163-195, resolve-item-corridor.mjs | lib/carbon |
| ETS proxy band from carrier notices | carrier-ets-surcharge-envelope.mjs:68-97 | P1-15, feeding lib/carbon's carbonPrice once a live write path exists |
| Lead-time position chart | lead-time-position.mjs, LeadTimeChart.tsx | lib/lead-time, ui/LeadTimeChart |
| Signal promotion state | signal-promotion.mjs | lib/signal-promotion |
| Trajectory bars on the detail page | TrajectoryBars.tsx | ui/TrajectoryBars |
| Published price board on the detail page and the list key figure | [slug]/page.tsx:159-186; supabase-server.ts:2310-2376; data.ts:969-1032 | read.ts |
| Series figure envelope and cadence on the detail page | [slug]/page.tsx:248-284 | read.ts |
| Convergence (independent citers, confirmations) on the detail page | [slug]/page.tsx:131-153 | read.ts (error surfaced) |
| Licence and attribution per factor source | [slug]/page.tsx:230-246 | read.ts |
| Policy timeline scoped by facets, with the widen control | MarketPolicyTimeline.tsx | ui/PolicyTimeline |
| Recalculation notices rail and feed hook | NoticesRail.tsx, RecalculationNotice.tsx | ui/figures/Notices |
| OEM equipment roadmap panel with TCO crossover notice | OemRoadmapPanel*.tsx | ui/Spec09Panels |
| Rerouting multipliers panel with compounding chain | ReroutingPanel*.tsx | ui/Spec09Panels |
| Contract indexation terms panel, org-scoped | IndexationPanel*.tsx | ui/Spec09Panels |
| Statutory, estimated and derived figure components behind one admissibility gate | components/figures | ui/figures/Figures |
| Range formatting and the 10 percent sensitivity convention | lib/figures | core/figures/format |
| Static params for every verified market slug, uuid redirect, skeletons | [slug]/page.tsx:100-116, loading files | app/market |
| Adopted vocabulary loader and adopted-entity mint | lib/vocabulary | core/vocabulary (P1-09) |
| EU Weekly Oil Bulletin xlsx and CSV parsing, upsert plan, display-row derivation, ratified series map | oil-bulletin-workbook.mjs, parsers/, write-market-series.mjs, refresh-published-price-statistics.mjs, series-item-map.mjs | P1-15 producers; the map becomes a table |

### Defects the new code must not repeat (from the backlog rows in scope; the STATUS cells are written in the backlog file)

A failed read that renders as empty (B-0046, the three panels, the convergence read); internal copy, repo paths, codes and table names on a customer surface (B-0158, B-0159, B-0160, CarbonCostOverlay, RecalculationNotice); half slices that look built (B-0537 to B-0540, B-0565 to B-0567); a figure shown without its source's rating (INV-223); facts in code (series-item-map, the DESNZ fixture); duplicated formatting and selection rules (B-2166 to B-2173, B-0276); a whole-table history cap that silently shortens per-series history; sub-floor targets (B-1929, B-1930); a horizontal strip against the no-horizontal-reach rule without a ruling (B-1927).
