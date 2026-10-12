# P1-21 research-ops: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-21, DISPOSITION lane, read-only. Tree: origin/master `0ad87a940` (P1-13 merged). Written by a cloud session on 2026-10-12. Every file in SCOPE was read whole with the Read tool, line one to the end; the reader sections of `src/lib/supabase-server.ts` and `src/lib/data.ts` were read whole as line ranges (named below), the rest of those two files belongs to other lanes (auth-db.md sections 7-8 assigned the surface read layer to the surface that calls it). Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. No live database, no browser render, no sub-agents.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks and leading-`*` lines stripped; JSX `{/* */}` comment lines are NOT stripped by this method, so .tsx code counts are an upper bound). Raw lines are `wc -l`.

## 1. Header and coverage

Module: research-ops. The Research surface (horizon assessments over research findings: list, detail, assessment rail, credibility chips) and the Operations surface (structured jurisdictional data: region by dimension matrix, statements, labour chain, regional profile detail, spec-09 panels), their pure models, their server readers, the regional producers' pure parsers, the Operations S3/S4 eligibility gate and the assistant's Operations data block (both assigned here by intake-a.md section 8).

Coverage (53 read units, 9,033 raw lines, 6,069 code lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/) | raw lines | code lines | read calls |
|---|---|---|---|
| src/lib/research/assess.mjs | 404 | 195 | 1 |
| src/lib/research/read-assessments.mjs | 107 | 58 | 1 |
| src/lib/research/read-signposts.mjs | 153 | 96 | 1 |
| src/lib/research/surface-candidate.mjs | 14 | 5 | 1 |
| src/lib/research/taxonomy.mjs | 177 | 88 | 1 |
| src/lib/research/theme-brief-text.mjs | 47 | 33 | 1 |
| src/lib/research/theme-brief.mjs | 303 | 183 | 1 |
| src/lib/operations/labour-chain.ts | 236 | 176 | 1 |
| src/lib/operations/region-crosswalk.mjs | 27 | 15 | 1 |
| src/lib/operations/region-grid.mjs | 263 | 146 | 1 |
| src/lib/operations/state-roster.mjs | 19 | 16 | 1 |
| src/lib/operations/statements.mjs | 205 | 132 | 1 |
| src/lib/regional/bls-oews-parser.mjs | 115 | 70 | 1 |
| src/lib/regional/eurostat-lc-lci-lev-parser.mjs | 108 | 58 | 1 |
| src/lib/regional/eurostat-nrg-pc-205-parser.mjs | 104 | 72 | 1 |
| src/lib/regional/regional-facts-envelope.mjs | 125 | 86 | 1 |
| src/lib/regional/state-cost-facts-envelope.mjs | 109 | 60 | 1 |
| src/lib/agent/formats/operations-matrix.ts | 284 | 197 | 1 |
| src/lib/agent/operations-ask-context.mjs | 142 | 81 | 1 |
| src/components/research/AssessmentHistoryLedger.tsx | 106 | 75 | 1 |
| src/components/research/CredibilityChipAuthority.tsx | 147 | 98 | 1 |
| src/components/research/CredibilityChipEvidence.tsx | 84 | 53 | 1 |
| src/components/research/CredibilityChipShared.tsx | 138 | 91 | 1 |
| src/components/research/DissentPanel.tsx | 124 | 79 | 1 |
| src/components/research/RailAbsenceNote.tsx | 32 | 12 | 1 |
| src/components/research/ResearchFindingDetailSurface.tsx | 542 | 426 | 1 |
| src/components/research/ResearchLedger.tsx | 480 | 354 | 1 |
| src/components/research/ResearchThemeCards.tsx | 151 | 101 | 1 |
| src/components/research/SignpostList.tsx | 76 | 43 | 1 |
| src/components/research/credibility-grade-modifiers.mjs | 43 | 27 | 1 |
| src/components/operations/AuxiliaryEnergyPanel.tsx | 32 | 29 | 1 |
| src/components/operations/AuxiliaryEnergyPanelView.tsx | 60 | 55 | 1 |
| src/components/operations/GridQueuePanel.tsx | 32 | 27 | 1 |
| src/components/operations/GridQueuePanelView.tsx | 87 | 73 | 1 |
| src/components/operations/LabourChain.tsx | 175 | 117 | 1 |
| src/components/operations/OperationsDetailSurface.tsx | 461 | 347 | 1 |
| src/components/operations/OperationsLedger.tsx | 566 | 386 | 1 |
| src/components/operations/RegionDimensionMatrix.tsx | 1075 | 695 | 1 |
| src/components/operations/StatementsBlock.tsx | 195 | 156 | 1 |
| src/app/research/page.tsx | 138 | 101 | 1 |
| src/app/research/loading.tsx | 21 | 20 | 1 |
| src/app/research/[slug]/page.tsx | 314 | 218 | 1 |
| src/app/research/[slug]/loading.tsx | 15 | 14 | 1 |
| src/app/operations/page.tsx | 63 | 51 | 1 |
| src/app/operations/loading.tsx | 23 | 22 | 1 |
| src/app/operations/[slug]/page.tsx | 275 | 205 | 1 |
| src/app/operations/[slug]/loading.tsx | 14 | 13 | 1 |
| src/lib/supabase-server.ts 1535-1793 (research pipeline rows, research source coverage) | 259 | 178 | 1 |
| src/lib/supabase-server.ts 2264-2270 (fetchPublicResearchItems, fetchPublicOperationsItems) | 7 | 6 | 1 (offset 2180, 100 lines) |
| src/lib/supabase-server.ts 3315-3594 (operations coverage, facts, state cost facts) | 280 | 186 | 1 |
| src/lib/data.ts 895-942 (research coverage cache, orphan pipeline comment) | 48 | 18 | 1 (offset 890, 170 lines) |
| src/lib/data.ts 1004-1014 and 1034-1050 (public research and operations cache wrappers) | 28 | 26 | same call |
| TOTAL | 9033 | 6069 | 52 |

Files not read whole: none in scope. `src/lib/agent/operations-matrix*` named in the dispatch does not exist under that path; the file is `src/lib/agent/formats/operations-matrix.ts` (intake-a.md:78, 242) and was read whole [CONFIRMED: `ls src/lib/agent`]. Read beside the scope for interface evidence only (not registered): `docs/specs/03-research.md` and `04-operations.md` whole; `docs/design/ux-laws.md` and `design-principles.md` whole; the auth-db.md exemplar whole; the A2-part4 research rows and A2-part5 operations rows whole; every other register's rows for these paths by grep (section 9 of the session log lists them).

Test files: none exist beside the scope on this tree (`git ls-files 'fsi-app/src/**/*.test.mjs' 'fsi-app/src/**/*.npmtest.mjs'` returns 0; CLEAN-3, PR 1131, removed them, along with `src/lib/regional/fixtures/*` [CONFIRMED: `git log --diff-filter=D` names f906b2102]). Every "exported for its test" export below therefore has no importer, and the drift guard `surface-candidate.mjs` cited (a byte-for-byte test) no longer exists.

Consumer evidence: `grep -rlw "<symbol>"` per exported symbol over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github/workflows (ts, tsx, mjs, js, sql, yml) excluding the defining file (an upper bound: comment mentions count), then `grep -rnE "import[^;]*\b<symbol>\b|\b<symbol>\("` by hand for every symbol claimed dead (section 4). 137 symbol rows, kept in the session scratchpad, not committed (rule 5).

## 2. Module verdict

**REFACTOR AND PORT.** Every feature is kept. The pure models (assessment ladder, region grid, statements, labour chain, envelope builders, JSON-stat and BLS parsers) are sound in shape and port almost as they stand, with four confirmed logic defects fixed in the port (R1 anchoring, the TRL ladder order, the last-mile theme pattern, the labour chain's unit mixing). The code around them is not: one 213-line research reader with no caller, three jurisdiction-to-region resolvers and two hand copies of the region roster, two upsert planners with different equality rules, two detail pages that each re-implement the same related-items query, dead computations inside the Operations ledger, a per-fact freshness state that is computed and never rendered, an omit note that is computed and never rendered, a per-page source fetch-status read whose result is dropped, and component files whose comment history outweighs their code (RegionDimensionMatrix is 1,075 raw lines for one table and one panel).

**Current code LOC: 6,069** (awk over the 53 read units, table above). **Estimated clean LOC: about 4,300.** Arithmetic (section 8 table, per planned file): features/research 1,645 (assess 180, assessment-view 110, taxonomy 80, reads 200, ResearchList 260, ThemeFacetRow 70, ResearchDetail 300, AssessmentCard 70, DissentPanel 50, SignpostList 35, AssessmentHistory 50, CredibilityChips 150, routes 90) + features/operations 2,455 (region-grid 120, statements 110, labour-chain 120, dimensions 40, region-resolve 25, matrix-eligibility 90, reads 170, ingest parsers and envelopes 300, OperationsList 260, RegionMatrix 450, StatementsBlock 120, LabourChain 90, OperationsDetail 260, spec-09 panels 140, ask-context 70, routes 90) + core/themes 190 (theme view and brief-text clean) = 4,290, rounded to 4,300. Against today's 6,069 the module shrinks to 71 percent; the 1,770 lines removed are the dead reader (148 code lines), the duplicated resolvers and related-items queries (about 180), the dead ledger computations and props (about 60), the loader/view split of the spec-09 panels (about 60), comment-in-code inflation of the .tsx counts, and the four chip files collapsing to one (about 120). Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (12), with the files that carry them today:

1. Research list: verified research-surface items in urgency bands, mode and region facets, a theme facet row with an Unclassified pill, a window sort, a horizon band in each row's meta, the awareness unscored note, a source-coverage rail card (ResearchLedger.tsx, ResearchThemeCards.tsx, app/research/page.tsx, taxonomy.mjs).
2. Research detail: masthead with grade, theme and mode chips, Summary, Substantive findings (six research_summary sections), record-grade verbatim facts, Sources, Related (by theme, then by source), the cross-page section, and a rail with the Horizon assessment card, Dissent, Signposts, Assessment history and Cluster synthesis (ResearchFindingDetailSurface.tsx, DissentPanel.tsx, SignpostList.tsx, AssessmentHistoryLedger.tsx, RailAbsenceNote.tsx, app/research/[slug]/page.tsx).
3. The research assessment model: TRL 1-11 and CRI 1-6 corridors from the item's own text, the R1/R3/R4 horizon cascade with a first-class refusal, evidence score from citation count, the authority distribution, signposts from an anchored horizon, the status token (assess.mjs; consumed only by scripts/producers/research/research-assessment-producer.mjs [CONFIRMED import grep]).
4. Assessment reads: the current-row view model, the batch-by-item map, signposts for an assessment, the supersedes chain walk (read-assessments.mjs, read-signposts.mjs).
5. Split credibility display: the evidence-by-agreement chip with the GRADE modifier ledger, the source-authority chip with its six components (CredibilityChip*.tsx, credibility-grade-modifiers.mjs).
6. Cross-page theme views: theme for an item, the theme analysis view per page, theme chips for list strips and the dashboard, the derived chip label, the pre-contract brief text cleaner (theme-brief.mjs, theme-brief-text.mjs; consumed by CrossPageSection, ThemeStripView, DashboardBrief, supabase-server.ts fetchCrossPageForItem). Not research-specific; it lives under lib/research by history.
7. Operations list: region-by-dimension matrix with a sticky dimension column, keyboard grid, constant-height panel with single and compare modes, the labour chain drill-down, industry statements, coverage-gap rail, Region, Dimension and Mode facets, linked-regulation counts per region (OperationsLedger.tsx, RegionDimensionMatrix.tsx, StatementsBlock.tsx, LabourChain.tsx, app/operations/page.tsx).
8. Operations models: the region grid with dual-layer render gate, index against base, implied base, headline-figure split; statements; the fully-loaded labour chain; the region crosswalk; the state roster (region-grid.mjs, statements.mjs, labour-chain.ts, region-crosswalk.mjs, state-roster.mjs).
9. Operations detail: masthead with region-group chip, Summary, Substantive findings (eight operations_profile sections with the S3/S4 matrix gate and omit notes), the spec-09 auxiliary-energy and grid-queue sub-sections, Sources, the cross-page section, Related in region (OperationsDetailSurface.tsx, operations-matrix.ts, AuxiliaryEnergyPanel*.tsx, GridQueuePanel*.tsx, app/operations/[slug]/page.tsx).
10. Server reads: category-routed public research and operations items, research source coverage, operations regions, coverage rows and facts with freshness, state cost facts (supabase-server.ts ranges above, data.ts ranges above).
11. Regional producers' pure halves: JSON-stat decoder, Eurostat nrg_pc_205 and lc_lci_lev parsers, BLS OEWS parser, the regional_data_facts envelope builder and upsert planner, the state_cost_facts row builder and planner (lib/regional/*; consumed only by scripts/producers/regional/* [CONFIRMED import grep]).
12. The assistant's Operations data block (operations-ask-context.mjs; consumed by src/app/api/ask/route.ts:8, :432 [CONFIRMED grep]).

Key dependencies [CONFIRMED by the import and `.from(`/`.rpc(` scans over the scope]:

- Modules imported: `next/navigation`, `next/link`, `next/cache` (via data.ts), `react`, `@supabase/supabase-js` (types); in-repo `@/lib/data`, `@/lib/supabase-server`, `@/lib/supabase-service`, `@/lib/api/org` (resolveOrgIdFromCookies), `@/lib/detail/*` (load-detail, item-id-filter, load-detail-core, action-card-common-props, section-index-data, meta-line), `@/lib/connections/*` (resource-lookup, brief-staleness, connection-view-model, tag-labels), `@/lib/surface-of.mjs`, `@/lib/contracts/*` (vocabularies, envelope, verbatim-grounding), `@/lib/spec09/*` (auxiliary-energy, grid-queue), `@/lib/urgency/bands`, `@/lib/scoring`, `@/lib/list-row-fields`, `@/lib/list-pagination`, `@/lib/regulation-item-types`, `@/lib/render-now`, `@/lib/format`, `@/lib/item-links`, `@/lib/dashboard/row-fields`, `@/lib/tags/useWorkspaceTagsFacet`, `@/lib/jurisdictions/iso`, `@/lib/constants`, `@/lib/perf/static-params-fallback.mjs`, `@/lib/agent/parse-record-sections`; about 40 `@/components/ui/*`, `detail/*`, `list-surface/*`, `shell/*` parts; plus two src-imports-scripts edges: assess.mjs:6 imports `scripts/research/authority-score.mjs`, theme-brief.mjs:7 imports `scripts/turns/theme-briefs/schema.mjs`.
- Tables read: intelligence_items (detail related queries, the dead pipeline reader), sources (fetch_status; embeds), source_bias_tags, research_assessments (chain walk), research_assessments_current (view), signposts, regions, region_dimension_coverage, regional_data_facts, state_cost_facts, auxiliary_energy_profiles, grid_connection_queues. RPCs: get_research_items_public, get_operations_items_public, get_research_source_coverage, get_source_citation_stats (dead reader only). No writes anywhere in scope; the envelope builders produce rows the producers write.
- Env vars: none read directly in scope (Supabase config through the shared clients) [CONFIRMED grep `process.env`: 0].
- External services: none called from scope. The one raw `fetch(` is internal (`/api/listings/rest`, OperationsLedger.tsx:227). **No metered model call and no Browserless call in scope** [CONFIRMED grep for anthropic, browserless, fetch]. Two customer controls hand off to the metered assistant `/api/ask` (claude-sonnet-4-6, CLAUDE.md permitted-calls table): the "Why unscored" button (ResearchLedger.tsx:371-376 dispatches `open-ask-assistant`) and the ask prompt in the list masthead (`searchPlaceholder`, ResearchLedger.tsx:80, OperationsLedger.tsx:506, consumed by ListSurfaceShell). Replacement under the free rule: the "Why unscored" button links to the scoring explanation in the legend rail card (P1-17 LegendRailCard), and the masthead ask stays a search; whether the assistant itself survives is the assistant route owner's ruling, not this module's.

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | RegionDimensionMatrix.tsx comment history | 1,075 raw, 695 awk code of which roughly 300 are JSX comment lines the awk does not strip; header 1-120, the dated FOLD/lane blocks at 156-171, 392-402, 480-504, 665-671, 723-732, 747-753, 949-1062 | the file tells the story of five redesigns to every reader; two blocks now contradict the code (665-671 says the panel renders only after a commit; 730-732 says arrows select nothing; the code at 282-305 and 348-366 does the opposite) [CONFIRMED read; A2-part5 row and B-0169] | one header paragraph naming the two operator rulings of 2026-09-09 (default selection, arrows select, Esc closes, constant height); history stays in docs/ |
| 2 | fetchResearchPipelineRows and its three types | supabase-server.ts 1535-1747, 213 raw, 148 code | no caller anywhere [CONFIRMED: `grep -rn fetchResearchPipelineRows` finds only the definition]; it duplicates the citation-stats and bias-tag enrichment that enrichCategoryRows already runs for the live path (supabase-server.ts:2112, 2154 comments name the pairing) | TRASH; `pipelineStage`, `whatItChanges`, `doesNotResolve` are recorded in section 8 so the fields are not lost |
| 3 | three jurisdiction-to-region resolvers and two roster copies | operations-matrix.ts 96-126 (resolveItemRegionCodes), region-crosswalk.mjs 1-27 (resolveRegionCode), OperationsLedger.tsx 132-138 (DEFAULT_REGIONS with isoCodes), eurostat-lc-lci-lev-parser.mjs:11 (EU_MEMBER_GEO_CODES) | the same "item code is in a region's code or iso_codes" rule written twice with different return shapes (first match vs all matches), and the regions table's iso_codes hand-copied twice (B-2177) | one `regionsForItem(roster, item)` returning all matches in roster order; the ledger takes the live roster only and states the absence when it is empty; the parser takes the EU geo list from the roster read by its producer |
| 4 | detail-page related-items queries | research/[slug]/page.tsx 18-44, 128-196; operations/[slug]/page.tsx 27-53, 127-206 | `RelatedRow`, `pickRelated` and the "match first, same source second, cap 5" two-query cascade are written twice with only the match column changed (theme vs jurisdictions plus item_type) | one `relatedItems(client, self, {match, itemType})` in the surface read module, shared with the market and regulations detail lanes (P1-19, P1-20) |
| 5 | four credibility-chip files for two chips with no data | CredibilityChipAuthority 147 + CredibilityChipEvidence 84 + CredibilityChipShared 138 + credibility-grade-modifiers 43 = 412 raw | both chips are mounted once, as a legend with no props (app/research/page.tsx:123-124), so their scored branches, their raw-signal panel and three of five props never run (B-0547, B-0548) [CONFIRMED read]; the stored `credibility_evidence_score` the producer writes is never rendered anywhere [CONFIRMED grep: read-assessments.mjs:65 only] | one CredibilityChips.tsx (two chips, one ledger, about 150) mounted per assessment with the stored evidence score and authority distribution; the legend is a sentence in the rail legend |
| 6 | the assessment select list and maturity labels | research/page.tsx 47-51; research/[slug]/page.tsx 216-220; read-assessments.mjs 96-107 (labels, unused); read-signposts.mjs 86-91 (labels again); ResearchFindingDetailSurface.tsx 516-527 (labels a third time, always "low-high" even when equal) | one column list in two pages and one label rule in three places | one `ASSESSMENT_COLUMNS` and one `corridorLabel(prefix, low, high)` in features/research/model/assessment-view.ts |
| 7 | two upsert planners | regional-facts-envelope.mjs 101-125; state-cost-facts-envelope.mjs 88-109 | the same insert/update/unchanged plan with different equality (`String()` loose vs strict `!==`, A4c row) and different update field lists | one `planUpsert(existing, candidates, {key, fields})` with the loose numeric compare |
| 8 | OperationsLedger dead computations | 254-270 (factsByCell, factsFor, `void factsFor`), 274-284 (a buildRegionGrid useMemo whose result is discarded), 125-138 and 197 (Region.severity assigned, never read) | work every render for nothing; the comment at 270 says "retained" for a use that does not exist [CONFIRMED read; A2-part5 row] | delete; the matrix computes its own grid |
| 9 | spec-09 panels as four files | AuxiliaryEnergyPanel 32 + View 60 + GridQueuePanel 32 + View 87 = 211 raw | a loader and a view per 25-row read, legacy `--color-*` tokens, raw hex `#b3261e` (GridQueuePanelView.tsx:63) | one server component per panel (about 70 each), ui-kit tokens |
| 10 | a per-page read whose result is dropped | operations/[slug]/page.tsx 148-156 (sources.fetch_status), OperationsDetailSurface.tsx:110 (prop declared, never destructured) | one extra query on every Operations profile render [CONFIRMED read] | delete the read and the prop |
| 11 | header essays on the research rail parts | DissentPanel 3-29, SignpostList 3-28, AssessmentHistoryLedger 3-23, RailAbsenceNote 3-11, ResearchThemeCards 3-40, LabourChain 3-40, OperationsDetailSurface 3-47, ResearchFindingDetailSurface 3-32 and the orphan block 439-464 that describes a deleted Cluster synthesis card | lane narratives, one of them describing code that no longer exists [CONFIRMED read] | one sentence each |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts, fsi-app/supabase (and .github/workflows) excluding the defining file, and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| src/lib/supabase-server.ts:1594 (with 1544, 1567, 1575) | fetchResearchPipelineRows, ResearchPipelineRow, SurfaceAdmissionCountRow, ResearchItemQueryRow | exported function and types | `grep -rnE "import[^;]*\bfetchResearchPipelineRows\b\|\bfetchResearchPipelineRows\("` outside the file: 0 [CONFIRMED]; `ResearchPipelineRow` is re-exported by data.ts:906-907 and imported by nothing else (types/resource.ts:295 names it in a comment) [CONFIRMED] |
| src/lib/data.ts:895-918 | comment block for the deleted getResearchPipeline | orphan comment | describes a function this file no longer defines (`grep -n getResearchPipeline src/lib/data.ts`: comment lines only) [CONFIRMED] |
| src/lib/operations/region-grid.mjs:192 | orderRegions | exported function | outside the file only comment mentions (RegionDimensionMatrix.tsx:42, OperationsLedger.tsx:211) [CONFIRMED import grep] |
| src/lib/research/read-signposts.mjs:148 | daysSince | exported function | the two outside hits are an unrelated local variable (trust.ts:441) and a seed script's own variable [CONFIRMED read] (B-0686) |
| src/lib/research/read-assessments.mjs:96,103 | technicalMaturityLabel, commercialMaturityLabel | exported functions | name hits are the history entry's own field names (read-signposts.mjs, AssessmentHistoryLedger.tsx), not imports [CONFIRMED import grep] |
| src/lib/research/taxonomy.mjs:99 | SEVERITY_KEYS | exported constant | 0 references anywhere, including inside the file [CONFIRMED grep] |
| src/lib/agent/formats/operations-matrix.ts:204-217, 254-284 | DimensionEligibility.omitNote, buildOmitNote | computed field and its builder | the only consumer (OperationsDetailSurface.tsx:146-170) writes its own notes from `eligible`, `sourcedRegionCount`, `itemJurisdictionPresent`, `resolvedRegionCodes` and never reads `omitNote` [CONFIRMED grep `omitNote`: operations-matrix.ts only] |
| src/components/operations/OperationsLedger.tsx:81,106 | Dimension, DIMENSIONS (exports) | export surface | 0 importers; the outside name hits are other files' own identifiers [CONFIRMED import grep] |
| src/components/operations/OperationsLedger.tsx:254-284 | factsByCell, factsFor, discarded buildRegionGrid useMemo | dead computation | `void factsFor` and an unassigned useMemo [CONFIRMED read] |
| src/components/operations/OperationsLedger.tsx:128,133-137,197 | Region.severity | dead field | assigned, never read [CONFIRMED grep `severity` in the file]; `regions.severity` is still selected at supabase-server.ts:3423 for it |
| src/components/operations/OperationsDetailSurface.tsx:110 | sourceFetchStatus prop | unused prop | declared, passed by the page (:258), never destructured [CONFIRMED read]; the page's query at operations/[slug]/page.tsx:148-156 exists only to fill it |
| src/components/research/AssessmentHistoryLedger.tsx:37-43, 54-69 | `current` fallback prop | unused branch | the one caller passes `history` only (ResearchFindingDetailSurface.tsx:322) [CONFIRMED read] |
| src/components/research/DissentPanel.tsx:39-44, 60, 86-97 | dissentingSources | unreachable branch | never passed by the one caller (ResearchFindingDetailSurface.tsx:320) (B-0661) [CONFIRMED read]; HALF-SLICE, not dead: the data it waits for does not exist (section 8) |
| src/components/research/CredibilityChipAuthority.tsx:62-66, 87-90, 136-142 | authorityDistribution, sourceTier, citationCount and their branches | unreachable branches | the one mount passes no props (app/research/page.tsx:124) [CONFIRMED read]; HALF-SLICE |
| src/components/research/CredibilityChipEvidence.tsx:29-35 | evidenceLevel, agreementLevel, biasTags | unreachable branches | the one mount passes no props (app/research/page.tsx:123) [CONFIRMED read]; HALF-SLICE |
| src/lib/supabase-server.ts:3378, 3488-3493 | OperationsFact.freshness | computed, never rendered | FactCard.tsx and every operations component read no `freshness` (`grep -rln freshness src/components`: RegionDimensionMatrix passes it through at :241, nothing renders it) [CONFIRMED]; a lost feature, not dead (section 8) |
| src/lib/supabase-server.ts:3351, 3427, 3467 | OperationsCoverageRow.notes | selected, never rendered | `grep -rn "\.notes\b" src/components/operations`: 0 [CONFIRMED] |
| src/lib/regional/eurostat-lc-lci-lev-parser.mjs:3 | re-export decodeJsonStat | export surface | importers of decodeJsonStat: the two parsers only, neither through this re-export [CONFIRMED import grep] |
| src/lib/regional/state-cost-facts-envelope.mjs:1 | re-export isVerbatimSpan | export surface | the producer imports groundCandidate through this file (state-cost-facts-producer.mjs:4) and never isVerbatimSpan [CONFIRMED] |
| src/components/research/ResearchFindingDetailSurface.tsx:439-464 | Cluster synthesis comment | orphan comment | describes a card this file no longer defines; ThemeBriefCard is imported instead (:77, :323) [CONFIRMED read; A2-part4 row] |

Export-surface only (used inside the defining file, no outside importer, exported for tests that CLEAN-3 deleted) [CONFIRMED import grep]: assess.mjs assessTechnicalMaturity, assessCommercialMaturity, assessHorizon, assessEvidenceScore, resolveAuthoritySources, assessSignposts; theme-brief.mjs selectThemeBriefForItem, deriveThemeLabel, MAX_MEMBERS_PER_PAGE, MAX_THEME_LABEL_CHARS, THEME_SIGNAL_PHRASES; taxonomy.mjs THEME_KEYWORDS; labour-chain.ts NUMERATOR_TERM_ORDER, CHAIN_TERM_ORDER; statements.mjs ELIGIBLE_ORIGIN_CLASSES, NEEDS_SECOND_REGION, VERDICT_PATTERN, hasVerdictWord, humaniseFactLabel; regional-facts-envelope.mjs ENVELOPE_PAYLOAD_KEYS, formatDisplayValue; state-cost-facts-envelope.mjs originClassForTier, parseNumericValue; eurostat-lc-lci-lev-parser.mjs latestLcLciLevValueForGeo; operations-ask-context.mjs isEnveloped, formatRegionalDataFactLine, formatStateCostFactLine; CredibilityChipAuthority.tsx AuthorityDistributionShape, authorityDistributionLabel; AuxiliaryEnergyPanelView.tsx AUXILIARY_ENERGY_GAP_LINE; GridQueuePanelView.tsx substationEvidenceLine, GRID_QUEUE_GAP_LINE.

Not dead, verified live this session: getResearchSourceCoverage (research/page.tsx:77), fetchPublicResearchItems and fetchPublicOperationsItems (via data.ts:1004-1014), findThemeForItem, buildThemeAnalysisView, buildThemeChips (supabase-server.ts:32, CrossPageSection, ThemeStripView, DashboardBrief), cleanPreContractBriefText (CrossPageSection.tsx), SEVERITY_COLUMN_TO_KEY (MarketSignalDetailSurface.tsx), RESEARCH_CANDIDATE_OR (supabase-server.ts, research-assessment-producer.mjs), assessItem and assessAuthorityScore and extractDoiCandidate (research-assessment-producer.mjs), every lib/regional builder and parser named in section 7 (scripts/producers/regional/*), buildOperationsAskContext (api/ask/route.ts:432).

Four live logic defects (not dead code; fixed in the port, each with a test in section 8's proof):

- assess.mjs:165-166 R1 gate: the outer `STATUTORY_RE.test(input.text)` makes the inner `STATUTORY_RE.test(`${e.obligation_text} ${input.text}`)` always true, so R1 anchors on the FIRST dated forward event whether or not it is the statutory one (B-1581, A4c:248 executed) [CONFIRMED read]. Fix: test the event's own text.
- assess.mjs:20-21 TRL ladder: the 8-9 row's `demonstrat(ed|ion)` precedes the 6-7 row's `demonstration plant`, which is therefore unreachable (B-1581) [CONFIRMED read]. Fix: specific phrases before general ones.
- taxonomy.mjs:65, 74 with THEME_KEYS order: `/emission/i` in `emissions` wins before last-mile's `/zero[- ]?emission/i` can be tried (B-0283, B-1582, A4c executed) [CONFIRMED read]; `deriveSeverity` reads `Date.now()` (:173) inside a "pure" module [CONFIRMED read]. Fix: order last-mile's specific patterns first or require a freight qualifier; take `now` as an argument.
- labour-chain.ts:93-96, 194-201 with region-grid.mjs:112: the `baseWage` matcher `/\b(wage|salary|earnings)\b/` accepts both BLS labels (annual and hourly), the grid sorts by label so the annual USD/year fact is found first, and `currencyFromHourlyUnit` only strips `/hour`, giving "USD/year per productive hour" (B-1580, A4c:215 executed) [CONFIRMED read]. Fix: accept a base wage only in a per-hour unit and require every term in one currency.

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| jurisdiction to region | operations-matrix.ts:96-126; region-crosswalk.mjs:13-27 | `regionsForItem(roster, {jurisdictionIso, jurisdiction})` returning every matching region code in roster order; the ledger takes the first |
| region roster | regions table (live); OperationsLedger.tsx:132-138 DEFAULT_REGIONS; eurostat-lc-lci-lev-parser.mjs:11 | the live roster only; an empty roster renders the absence state, never an invented five-region list |
| dimension vocabulary and labels | operations-matrix.ts:5-33 (type, list, labels); OperationsLedger.tsx:91-106 (display names, D numbers); neso-carbon-intensity-producer.mjs:16 (`"grid_intensity"`); migration 378 CHECK | one `features/operations/model/dimensions.ts` (db key, display name, D number); the producers import the key |
| related items on a detail page | research/[slug]/page.tsx:18-44, 133-196; operations/[slug]/page.tsx:27-53, 131-206 | `relatedItems(client, self, {match, itemType})` |
| assessment column list | research/page.tsx:47-51; research/[slug]/page.tsx:216-220 | `ASSESSMENT_COLUMNS` |
| corridor label | read-assessments.mjs:96-107; read-signposts.mjs:86-91; ResearchFindingDetailSurface.tsx:516-527 | `corridorLabel("TRL", low, high)` |
| upsert planner | regional-facts-envelope.mjs:101-125; state-cost-facts-envelope.mjs:88-109 | one planner with a key function and a field list |
| envelope gate | region-grid.mjs:17-25 `isEnvelopedFact` (camelCase); operations-ask-context.mjs:18-25 `isEnveloped` (snake_case); statements.mjs:50-52 `envelopeOf` adapter | one gate over one fact shape; the reader maps snake_case once |
| absence paragraph and badge | RailAbsenceNote.tsx (the three rail panels); ResearchFindingDetailSurface.tsx:505-509 and 483-501 (the assessment card's own copy of both) | the ui-kit Absence and Badge parts (P1-17) |
| chip and panel styles | CredibilityChipShared.tsx:103-138 | ui-kit Chip with an expanding panel (P1-17) |
| omit note text | operations-matrix.ts:254-284 (unused); OperationsDetailSurface.tsx:146-170 (rendered) | one note builder in matrix-eligibility.ts, rendered |
| meta theme segment | ResearchFindingDetailSurface.tsx:173-177 states the theme twice ("Research · Theme" and "theme: Theme") (B-0182) | one segment |
| ISO-week/date masthead labels, list shell, row fields | ResearchLedger and OperationsLedger compose ListSurfaceShell identically (facets, band rows, PriorityDropdown overflow, WatchButton) | the P1-17/P1-18 list shell takes a row mapper; each ledger becomes its facets plus its above-rows slot |

Over-abstraction: the CredibilityChipShared.tsx typed pass-through to credibility-grade-modifiers.mjs exists only because the .tsx could not be imported by a node test (header 26-30); with the tests gone the split has no reason. The AuxiliaryEnergyPanel / GridQueuePanel loader-view split exists for the same reason. `RailBadge` and `RailAbsenceNote` were extracted to satisfy a duplicate-code ratchet (F45) that CLEAN-3 deleted; they belong in the ui-kit.

## 6. Non-essential artifacts

- Comment history in every component (section 3 rank 1 and 11). Three hard-coded state counts in comments: "75 live rows" (RegionDimensionMatrix.tsx:243-245), "0 of 38 live rows populate theme" (research/[slug]/page.tsx:129-130, B-0098), "today's 47 null rows" (ResearchThemeCards.tsx:36-37) [CONFIRMED read]; none is checked against live data here (no live database in this lane).
- `fitness-allow: F39` and `fitness-allow: F43` markers (research/page.tsx:53, supabase-server.ts:1722, RegionDimensionMatrix.tsx:85-95) for enforcers CLEAN-3 deleted.
- `data-open-on-mount` declaration strings carrying operator quotes (RegionDimensionMatrix.tsx:397-402): the behaviour is kept, the attribute text becomes a short ruling id the new rendering guard reads.
- Internal words on customer surfaces, all to be removed in the port (B-0169, B-0181, B-0183, A2-part4 and A2-part5 rows) [CONFIRMED read]: "No producer has written this cell." (RegionDimensionMatrix.tsx:644), "There is no live producer writing them." (:775), "Coverage-table mismatch ... stored coverage row" (:781-782), "the research-assessment producer has not run ... (research-assessment-producer.mjs)" (ResearchFindingDetailSurface.tsx:506-509), "the research-assessment producer has not run over this item" (AssessmentHistoryLedger.tsx:78), "no lane has built a content-level dissent read" (DissentPanel.tsx:101-102), "needs a signpost registered against this assessment" (SignpostList.tsx:70-71), "needs regeneration for severity" (ResearchLedger.tsx:247), "spec-03 section-sign 4 Score 2", "OpenAlex/ROR", "acceptance criterion 8" (CredibilityChipAuthority.tsx:78-79, 104), "n_works, n_independent_groups" (CredibilityChipEvidence.tsx:38-39), "(scripts/spec09/SOURCES.md)" and "no $0 feed" (AuxiliaryEnergyPanelView.tsx:17, GridQueuePanelView.tsx:37), "brief generation in progress" (ResearchFindingDetailSurface.tsx:361, 374; OperationsDetailSurface.tsx:355, 393), double hyphens as dashes in five rail strings, and the GridQueue months line that prints "p50 needs p50 queue monthsmo" when absent (GridQueuePanelView.tsx:75) [CONFIRMED read].
- No fixtures, mock data or handoff JSON remain in scope (the lib/regional fixtures were deleted by CLEAN-3).

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's grep) | note.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| src/lib/research/assess.mjs | 1-404 (404) | TRL and CRI corridors, R1/R3/R4 horizon with refusal, evidence score, authority distribution via scripts/research/authority-score.mjs, signposts, status token, assessItem | REFACTOR AND PORT | 180 | 1: scripts/producers/research/research-assessment-producer.mjs (assessItem, assessAuthorityScore, extractDoiCandidate) | R1 anchoring and TRL ladder defects (section 4); imports from scripts/ (:6); R2 never modelled (stated at :142-146) |
| src/lib/research/read-assessments.mjs | 1-107 (107) | current-row view model, by-item map, horizon meta label, refusal text | REFACTOR AND PORT | into assessment-view (110 with signposts) | 4: ResearchLedger, ResearchFindingDetailSurface, research/page, research/[slug]/page | two dead label exports (section 4) |
| src/lib/research/read-signposts.mjs | 1-153 (153) | signpost view and fetch, history entry view, supersedes chain walk (depth 25) | REFACTOR AND PORT | into assessment-view and reads | 3: research/[slug]/page, SignpostList (type), AssessmentHistoryLedger (type) | summarizePredicate ignores the `basis: movement_by_date` field assess.mjs:342 writes (A4c:250) [CONFIRMED read]; both fetchers soft-fail to empty, so an RLS or outage reads as "none yet" |
| src/lib/research/surface-candidate.mjs | 1-14 (14) | PostgREST candidate filter and its JS mirror for research admission | REFACTOR AND PORT | 5 | 3: supabase-server.ts (dead reader only), research-assessment-producer, its fixtures | the drift test it relied on is gone (B-1040); the new tree derives both forms from surface_of's one rule table |
| src/lib/research/taxonomy.mjs | 1-177 (177) | seven themes, labels, descriptions, column map, keyword fallback; four severities, 13-value column map, text and recency fallback | REFACTOR AND PORT | 80 | 5: ResearchLedger, ResearchThemeCards, ResearchFindingDetailSurface, MarketSignalDetailSurface (SEVERITY_COLUMN_TO_KEY), types/resource.ts (comment) | last-mile pattern unreachable; Date.now() in a pure module; SEVERITY_KEYS dead |
| src/lib/research/theme-brief-text.mjs | 1-47 (47) | pre-contract theme brief text cleaner | REFACTOR AND PORT (to core/themes) | 30 | 1: detail/CrossPageSection.tsx | `BARE_SCORE_RE` (:19) strips every bare three-decimal number in [0,1], real figures included (B-1583) [CONFIRMED read]; restrict to the stats-header context |
| src/lib/research/theme-brief.mjs | 1-303 (303) | theme for item, brief view with staleness, cross-page theme analysis view, derived chip label, theme chips | REFACTOR AND PORT (to core/themes) | 160 | 4: supabase-server.ts (fetchCrossPageForItem :4343), CrossPageSection, ThemeStripView, DashboardBrief | not research code; imports scripts/turns/theme-briefs/schema.mjs (:7); `ThemeBriefView` typedef omits the `sections` it returns (A4c:254) |
| src/lib/operations/labour-chain.ts | 1-236 (236) | five numerator terms plus productive-hours divisor, running subtotals, suppression with named gaps, label matchers | REFACTOR AND PORT | 120 | 2: LabourChain.tsx, RegionDimensionMatrix.tsx (type) | unit and currency mixing defect (section 4) |
| src/lib/operations/region-crosswalk.mjs | 1-27 (27) | item jurisdiction to one region code | REFACTOR AND PORT | into region-resolve (25) | 1: OperationsLedger.tsx | duplicate of operations-matrix's resolver |
| src/lib/operations/region-grid.mjs | 1-263 (263) | envelope gate, index against base, implied base, envelope value format, origin and derivation labels, buildRegionGrid with coverage and reconciliation, source-note split, headline figure | REFACTOR AND PORT | 120 | 4: RegionDimensionMatrix, OperationsLedger, statements.mjs, ui/FactCard.tsx | orderRegions dead; comment block 213-240 is a design note for factHeadline, keep as one paragraph |
| src/lib/operations/state-roster.mjs | 1-19 (19) | 14 US state labels | REFACTOR AND PORT | into reads (labels come from state_cost_facts.state_label) | 1: OperationsLedger.tsx (roster size for the coverage-gap rail) | a hand list beside a table that carries the label |
| src/lib/operations/statements.mjs | 1-205 (205) | cross-region statements: eligible origin classes, two-region minimum, verdict-word screen, strongest fact per region, all-or-nothing index, missing-region tail | KEEP AS-IS (logic) | 110 | 2: OperationsLedger, StatementsBlock (type) | a verdict-word label is dropped with no count (B-0278) [CONFIRMED read :182]; port adds the dropped count to the block foot |
| src/lib/regional/bls-oews-parser.mjs | 1-115 (115) | three SOC occupations, annual and hourly median wage series ids, response parser to envelope observations | REFACTOR AND PORT (ingest, imported by P1-15's producer) | 60 | 1: scripts/producers/regional/bls-oews-producer.mjs | labels carry a literal em dash (:100) that statements.humaniseFactLabel strips [CONFIRMED read]; spec 04 section 5 names nine SOC codes, the parser has three |
| src/lib/regional/eurostat-lc-lci-lev-parser.mjs | 1-108 (108) | per-geo latest labour cost level, mean across member states, derived envelope | REFACTOR AND PORT (ingest) | 50 | 1: scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs | EU geo list hand copy (B-2177); a mean, stamped derived/calculated with n_observations |
| src/lib/regional/eurostat-nrg-pc-205-parser.mjs | 1-104 (104) | JSON-stat 2.0 decoder; non-household electricity price per band and semester | REFACTOR AND PORT (ingest) | 70 (decoder 40 + parser 30) | 2: eurostat-nrg-pc-205-producer.mjs, lc-lci-lev parser (decoder) | label hard-codes "(all taxes and levies)" and status flags unread (B-0281) [CONFIRMED read :88] |
| src/lib/regional/regional-facts-envelope.mjs | 1-125 (125) | required-field envelope row, mechanical display value, idempotent upsert plan | REFACTOR AND PORT (ingest) | 45 | 3: run-envelope-producer.mjs, neso-carbon-intensity-producer.mjs, the three parsers (shape) | natural key includes fact_label, a relabel inserts a new row and leaves the old (A4c:238) |
| src/lib/regional/state-cost-facts-envelope.mjs | 1-109 (109) | origin class from tier (T1-3 official, T4 verified, else null), state cost row, numeric mirror, upsert plan | REFACTOR AND PORT (ingest) | 35 | 1: scripts/producers/regional/state-cost-facts-producer.mjs | strict-equality planner (section 5) |
| src/lib/agent/formats/operations-matrix.ts | 1-284 (284) | dimension vocabulary, S3/S4 eligibility per dimension (two sourced regions including the item's own), soft-fail to ineligible | REFACTOR AND PORT | 90 | 3: operations/[slug]/page.tsx, OperationsDetailSurface (type), OperationsLedger (vocabulary) | omitNote dead; the page passes `[resource.jurisdiction]` only (operations/[slug]/page.tsx:122-125), never the item's jurisdiction array [CONFIRMED read] |
| src/lib/agent/operations-ask-context.mjs | 1-142 (142) | the AVAILABLE OPERATIONS DATA block: sourced-region header, one line per regional fact and per state cost fact | REFACTOR AND PORT (held here until the assistant route has an owner id) | 70 | 1: src/app/api/ask/route.ts | pure formatter; the route it feeds is a metered call (CLAUDE.md permitted table); the spec-10 gap "assistant cannot see regional facts" is CLOSED by this file [CONFIRMED grep route.ts:250-255, :432] |
| src/components/research/AssessmentHistoryLedger.tsx | 1-106 (106) | supersedes chain list, current vs superseded, lifecycle state, cause slot | REFACTOR AND PORT | 50 | 1: ResearchFindingDetailSurface | `current` fallback dead; internal word and double hyphen (B-0181) |
| src/components/research/CredibilityChipAuthority.tsx | 1-147 (147) | source-authority chip, six components panel, raw tier and citation note | REFACTOR AND PORT (merged) | into CredibilityChips (150) | 1: research/page.tsx (legend, no props) | HALF-SLICE (B-0547); tooltip carries spec and acceptance-criterion text |
| src/components/research/CredibilityChipEvidence.tsx | 1-84 (84) | evidence by agreement chip and GRADE ledger | REFACTOR AND PORT (merged) | into CredibilityChips | 1: research/page.tsx (legend, no props) | HALF-SLICE (B-0548) |
| src/components/research/CredibilityChipShared.tsx | 1-138 (138) | GRADE ledger render, chip button and panel styles, bias tag type | REFACTOR AND PORT (merged) | into CredibilityChips | 2: the two chips | chip minHeight 44 (:106) meets law 2 [CONFIRMED read]; 9-9.5 px text |
| src/components/research/credibility-grade-modifiers.mjs | 1-43 (43) | six-row GRADE ledger from bias tags (risk of bias flagged when tags exist) | REFACTOR AND PORT (merged) | into CredibilityChips | 1: CredibilityChipShared | pure, correct |
| src/components/research/DissentPanel.tsx | 1-124 (124) | always-open dissent panel: explicit dissent list, else authority mix, else absence | REFACTOR AND PORT | 50 | 1: ResearchFindingDetailSurface | HALF-SLICE (B-0549, B-0661); uncollapsed by construction is the ruled behaviour (spec 03 acceptance 5) |
| src/components/research/RailAbsenceNote.tsx | 1-32 (32) | absence paragraph and status badge for the rail | TRASH (to P1-17 Absence and Badge) | 0 | 3: DissentPanel, SignpostList, AssessmentHistoryLedger | legacy `--color-*` tokens |
| src/components/research/ResearchFindingDetailSurface.tsx | 1-542 (542) | research detail body and the Horizon assessment rail card | REFACTOR AND PORT | 300 + AssessmentCard 70 | 1: research/[slug]/page.tsx | meta repeats theme (B-0182); orphan comment 439-464; assessment card uses legacy tokens and 9 px labels; TRL label shows "8-8" for a point corridor (:516) |
| src/components/research/ResearchLedger.tsx | 1-480 (480) | research list | REFACTOR AND PORT | 260 | 1: research/page.tsx | severity chip "needs regeneration for severity" (:247); theme and window state are local, not in the URL (A2-part4 row); empty-state buttons have no padding (B-1948) [HYPOTHESIS: not rendered] |
| src/components/research/ResearchThemeCards.tsx | 1-151 (151) | theme facet pills with +N new and the Unclassified pill | REFACTOR AND PORT | 70 | 1: ResearchLedger (and a comment in scripts/research/backfill-themes.mjs) | pills 36 px with 8 px gap meets law 2's 24+8 branch [CONFIRMED read :88, :72]; description only in a title attribute, unseen on touch |
| src/components/research/SignpostList.tsx | 1-76 (76) | signpost rows: watched entity, predicate, direction, fired or watching | REFACTOR AND PORT | 35 | 1: ResearchFindingDetailSurface | prints the raw entity id as "watches <id>" [CONFIRMED read :60]; the port resolves it to the entity's label |
| src/components/operations/AuxiliaryEnergyPanel.tsx | 1-32 (32) | org-scoped auxiliary_energy_profiles read, 25 rows | REFACTOR AND PORT (merged with its view) | into spec-09 panels (140) | 1: operations/[slug]/page.tsx | read error reads as not covered (A2-part5 row) |
| src/components/operations/AuxiliaryEnergyPanelView.tsx | 1-60 (60) | load cards with kWh over typical hours; gCO2e never computed | REFACTOR AND PORT (merged) | into spec-09 panels | 2: the loader, OperationsDetailSurface (aside constant) | HALF-SLICE (B-0542): the grid-intensity conversion the card names is now possible from the D7 grid_intensity facts (migration 378) [HYPOTHESIS: join not built]; `requestRef="/operations#auxiliary-energy"` names an anchor no page carries [CONFIRMED grep] |
| src/components/operations/GridQueuePanel.tsx | 1-32 (32) | grid_connection_queues read, band rows first | REFACTOR AND PORT (merged) | into spec-09 panels | 1: operations/[slug]/page.tsx | not org-scoped by design (public DSO data) |
| src/components/operations/GridQueuePanelView.tsx | 1-87 (87) | gate BLOCKED/CLEAR/UNKNOWN at a 24-month horizon, queue months, substation headroom | REFACTOR AND PORT (merged) | into spec-09 panels | 2: the loader, OperationsDetailSurface | raw hex; "monthsmo" concatenation (:75) |
| src/components/operations/LabourChain.tsx | 1-175 (175) | chain render: term rows with operator, value, source and period, final rate or named gap | REFACTOR AND PORT | 90 | 1: RegionDimensionMatrix | every gap says "not in primary source" whatever the cause (B-0167) [CONFIRMED read :110, :156] |
| src/components/operations/OperationsDetailSurface.tsx | 1-461 (461) | operations profile body | REFACTOR AND PORT | 260 | 1: operations/[slug]/page.tsx | sourceFetchStatus unused; header says the spec-09 sections carry index entries, indexEntries (:229-234) omits them (A2-part5 row) [CONFIRMED read] |
| src/components/operations/OperationsLedger.tsx | 1-566 (566) | operations list | REFACTOR AND PORT | 260 | 1: operations/page.tsx | dead computations; DEFAULT_REGIONS hand roster; the remainder failure becomes a first-page count (B-0168) [CONFIRMED read :233-239]; Dimension facet state local, not in the URL |
| src/components/operations/RegionDimensionMatrix.tsx | 1-1075 (1075) | the matrix card | REFACTOR AND PORT | 450 | 1: OperationsLedger | stale contradicting comments (B-0169); cells 40 px tall with zero spacing (:1012, :509) sit under law 2's 44 px and have no 8 px clearance [HYPOTHESIS: computed from the styles, not rendered]; the 40 px row height is an operator spec (:1010), so this is a DESIGN CHANGES OWED item (rule 20), not a silent change; profile links are bare `<a>` (:881, :935) |
| src/components/operations/StatementsBlock.tsx | 1-195 (195) | statements card: kicker, sentence or absence, component rows with tier and provenance | KEEP AS-IS (behaviour) | 120 | 1: OperationsLedger | inline `<style>` media query (:137-146) moves to the ui-kit stylesheet |
| src/app/research/page.tsx | 1-138 (138) | research list route: three cached reads, batched assessments, the legend strip | REFACTOR AND PORT | 30 | Next route /research | `readAssessmentsByItemId` drops the per-chunk error (:45) and soft-fails to an empty map [CONFIRMED read] |
| src/app/research/loading.tsx | 1-21 (21) | list skeleton | REFACTOR AND PORT (to P1-17 shared skeleton) | 10 | Next | draws four tiles the list no longer has |
| src/app/research/[slug]/page.tsx | 1-314 (314) | research detail route: id redirect, item-scoped bundle (related, claim tiers, assessment, signposts, history, cross page), static params | REFACTOR AND PORT | 40 + reads | Next route /research/[slug] | four dropped-error reads (:148, :163, :181, :214) inside try/catch [CONFIRMED read]; comment history 75-95 |
| src/app/research/[slug]/loading.tsx | 1-15 (15) | detail skeleton | REFACTOR AND PORT (to P1-17) | 10 | Next | |
| src/app/operations/page.tsx | 1-63 (63) | operations list route: five reads in parallel | REFACTOR AND PORT | 30 | Next route /operations | reads the first regulations page only for the cross-reference counts; the ledger fetches the rest client-side |
| src/app/operations/loading.tsx | 1-23 (23) | list skeleton | REFACTOR AND PORT (to P1-17) | 10 | Next | draws tiles and six chips the list no longer has |
| src/app/operations/[slug]/page.tsx | 1-275 (275) | operations detail route: matrix gate, related by jurisdiction then source, claim tiers, cross page, spec-09 panels | REFACTOR AND PORT | 40 + reads | Next route /operations/[slug] | dropped-error reads (:140, :149, :165, :184); the fetch_status read is wasted |
| src/app/operations/[slug]/loading.tsx | 1-14 (14) | detail skeleton | REFACTOR AND PORT (to P1-17) | 10 | Next | |
| src/lib/supabase-server.ts | 1535-1793 (259) | dead research pipeline reader; research source coverage RPC | TRASH (1535-1747); REFACTOR AND PORT (1749-1793) | 0 + 25 | coverage: data.ts:929 | the coverage card shows transport modes under a "Source coverage" title (A2-part4 row) |
| src/lib/supabase-server.ts | 2264-2270 (7) | public research and operations category RPCs | KEEP AS-IS (into reads) | 6 | data.ts:1005, 1011 | the shared runCategoryRpcCore and enrichCategoryRows belong to the shared list read (auth-db section 8 "lists and aggregates") |
| src/lib/supabase-server.ts | 3315-3594 (280) | operations regions, coverage, facts with freshness and envelope, state cost facts | REFACTOR AND PORT | 120 | operations/page.tsx; types in OperationsLedger, RegionDimensionMatrix | freshness and notes unrendered; severity selected for a dead field; no row cap on facts (75 rows today per comments) [HYPOTHESIS on current count] |
| src/lib/data.ts | 895-942, 1004-1014, 1034-1050 (76) | coverage cache (APP_DATA_TAG, 300 s), public research and operations caches (PUBLIC_ITEMS_TAG) with fail-soft wrappers | REFACTOR AND PORT | 25 | research/page.tsx, operations/page.tsx, data.ts:582-586 (slugs) | orphan comment 895-918 |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/features/research/model/assess.ts | assess.mjs 1-404; scripts/research/authority-score.mjs (imported, ported by its own owner) | corridors, horizon cascade with the R1 fix, refusal, evidence score, authority distribution, signposts, status token | 180 |
| src/features/research/model/assessment-view.ts | read-assessments.mjs 1-107; read-signposts.mjs 1-57, 79-107 | ASSESSMENT_COLUMNS, view model, by-item map, corridorLabel, horizon label, refusal text, predicate summary including `basis` | 110 |
| src/features/research/model/taxonomy.ts | taxonomy.mjs 1-177 | themes, severities, fixed pattern order, `now` passed in | 80 |
| src/features/research/read/research-reads.ts | data.ts 927-942, 1004-1008, 1034-1041; supabase-server.ts 1749-1793, 2264-2266; research/page.tsx 34-61; research/[slug]/page.tsx 114-263; read-signposts.mjs 68-77, 120-144 | public items (cached), source coverage, assessments batch, detail bundle (related via the shared helper, claim tiers, assessment, signposts, history), errors surfaced to a fallback state, never dropped | 200 |
| src/features/research/ui/ResearchList.tsx | ResearchLedger.tsx 30-480 | list on the shared list shell; theme and window in the URL | 260 |
| src/features/research/ui/ThemeFacetRow.tsx | ResearchThemeCards.tsx 42-151 | theme pills, +N new, Unclassified | 70 |
| src/features/research/ui/ResearchDetail.tsx | ResearchFindingDetailSurface.tsx 34-437 | detail body on the shared detail shell | 300 |
| src/features/research/ui/AssessmentCard.tsx | ResearchFindingDetailSurface.tsx 465-542 | horizon assessment rail card, customer wording | 70 |
| src/features/research/ui/DissentPanel.tsx | DissentPanel.tsx 31-124 | always-open dissent | 50 |
| src/features/research/ui/SignpostList.tsx | SignpostList.tsx 30-76 | signposts with the watched entity's label | 35 |
| src/features/research/ui/AssessmentHistory.tsx | AssessmentHistoryLedger.tsx 25-106 | append-only chain | 50 |
| src/features/research/ui/CredibilityChips.tsx | CredibilityChipAuthority.tsx, CredibilityChipEvidence.tsx, CredibilityChipShared.tsx, credibility-grade-modifiers.mjs | two chips per assessment (stored evidence score, stored authority distribution), one GRADE ledger | 150 |
| src/features/research/routes (page, [slug]/page) | app/research/page.tsx, [slug]/page.tsx | thin route files | 70 |
| src/features/operations/model/dimensions.ts | operations-matrix.ts 5-33; OperationsLedger.tsx 77-123 | the seven dimensions: db key, name, D number, count word | 40 |
| src/features/operations/model/region-resolve.ts | region-crosswalk.mjs 13-27; operations-matrix.ts 96-126 | regionsForItem | 25 |
| src/features/operations/model/region-grid.ts | region-grid.mjs 1-184, 198-263 | grid, gate, index, implied base, headline split, labels | 120 |
| src/features/operations/model/statements.ts | statements.mjs 1-205 | statements with a dropped-verdict count | 110 |
| src/features/operations/model/labour-chain.ts | labour-chain.ts 1-236 | chain with per-hour and one-currency checks | 120 |
| src/features/operations/model/matrix-eligibility.ts | operations-matrix.ts 128-284; OperationsDetailSurface.tsx 146-170 | S3/S4 gate over the item's full jurisdiction list, one rendered omit note | 90 |
| src/features/operations/read/operations-reads.ts | supabase-server.ts 3315-3594, 2268-2270; data.ts 1010-1014, 1043-1050; operations/page.tsx 19-32; operations/[slug]/page.tsx 108-226 | public items, roster, coverage with notes, facts with freshness, state cost facts with labels, detail bundle (related via the shared helper, matrix gate, claim tiers) | 170 |
| src/features/operations/ingest/json-stat.ts | eurostat-nrg-pc-205-parser.mjs 1-47 | JSON-stat 2.0 decoder | 40 |
| src/features/operations/ingest/eurostat-nrg-pc-205.ts | eurostat-nrg-pc-205-parser.mjs 49-104 | electricity price parser reading the payload's tax dimension and status flags | 50 |
| src/features/operations/ingest/eurostat-lc-lci-lev.ts | eurostat-lc-lci-lev-parser.mjs 1-108 | labour cost levels, member geos passed in | 50 |
| src/features/operations/ingest/bls-oews.ts | bls-oews-parser.mjs 1-115 | OEWS series ids and parser, occupation list extensible to spec 04's nine SOC codes | 60 |
| src/features/operations/ingest/envelope.ts | regional-facts-envelope.mjs 1-125; state-cost-facts-envelope.mjs 1-109 | envelope row, state cost row, origin class from tier, one planUpsert | 60 |
| src/features/operations/ui/OperationsList.tsx | OperationsLedger.tsx 42-566 minus dead code | list on the shared shell, dimension in the URL, remainder failure stated | 260 |
| src/features/operations/ui/RegionMatrix.tsx | RegionDimensionMatrix.tsx 122-1075 | matrix card, default selection, roving grid, constant panel, compare mode, labour drill-down, freshness shown on each fact | 450 |
| src/features/operations/ui/StatementsBlock.tsx | StatementsBlock.tsx 29-195 | statements card | 120 |
| src/features/operations/ui/LabourChain.tsx | LabourChain.tsx 42-175 | chain render with a cause per gap | 90 |
| src/features/operations/ui/OperationsDetail.tsx | OperationsDetailSurface.tsx 49-461 | profile body, spec-09 sections in the index | 260 |
| src/features/operations/ui/Spec09Panels.tsx | AuxiliaryEnergyPanel*.tsx, GridQueuePanel*.tsx | two server panels, ui-kit tokens, carbon figure joined from grid intensity when present | 140 |
| src/features/operations/ask-context.ts (to the assistant route owner when its id exists) | operations-ask-context.mjs 1-142 | Operations data block | 70 |
| src/features/operations/routes (page, [slug]/page) | app/operations/page.tsx, [slug]/page.tsx | thin route files | 70 |
| skeletons (P1-17 shared skeleton) | the four loading.tsx files | list and detail skeletons matching the real layouts | 40 |
| src/core/themes/theme-view.ts | theme-brief.mjs 1-303; theme-brief-text.mjs 1-47 | theme for item, analysis view, chips, derived label, brief text cleaner with a bounded score pattern | 190 |

Total about 4,300 (section 2 arithmetic). TRASH: supabase-server.ts 1535-1747, RailAbsenceNote.tsx (to the ui-kit), the dead exports and computations of section 4.

### Data model actually used

- `research_assessments` (344, 346): read through the view `research_assessments_current`: `id, supersedes, is_current, lifecycle_state, item_id, technical_maturity_low/high/method, commercial_maturity_low/high/method, horizon_kind, horizon_band, horizon_rule, horizon_confidence, horizon_trigger_note, refusal_reason, credibility_evidence_score, credibility_authority_score, status_token, computed_at`; the raw table read for the chain: `id, supersedes, is_current, computed_at, status_token, lifecycle_state, technical/commercial maturity low/high, horizon_band`. Read but never rendered: `credibility_evidence_score` (section 4). Not read by this module: `entity_id`, the evidence-id arrays and the remaining columns of the 26 [HYPOTHESIS: full column list from C3a:147, 149, not re-derived].
- `signposts` (346, 353, 374): read `entity_id, assessment_id, watches, predicate, direction, fired_at`. Not read: the score columns 353 added.
- `intelligence_items`: read `id, legacy_id, title, summary, added_date, theme, source_id, jurisdictions, item_type, provenance_status, is_archived` and the `sources(id, name)` embed (detail related queries); the list rows come from the public RPCs.
- `sources`: `fetch_status` (wasted read), the embeds `name, url, base_tier, effective_tier, tier_override`.
- `regions` (106): `id, code, label, severity, display_order, iso_codes`; `severity` feeds a dead field.
- `region_dimension_coverage` (109, 378): `region_id, dimension, state, fact_count, notes`; `notes` never rendered.
- `regional_data_facts` (106, 267, 378): `region_id, dimension, fact_label, value, status, trend, source_note, last_updated` and the eleven envelope columns, embed `sources(name, url, base_tier, effective_tier, tier_override)`. `trend` and `status` are mapped and rendered nowhere in the matrix or FactCard [CONFIRMED grep FactCard.tsx]; `trend` reaches only the assistant block.
- `state_cost_facts` (152, 332): read `state_code, fact_label, value, unit, trend, statute_citation, effective_date, sources(name)`; unused here: `state_label` (the hand roster duplicates it), `dimension`, `value_numeric`, `origin_class`, `region_id`.
- `auxiliary_energy_profiles` (spec 09, 311): `profile_id, load_type, kw_draw, duty_cycle, hours_typical, setpoint_c, setpoint_rh_pct, grid_intensity_source` by `org_id`.
- `grid_connection_queues` (379): `queue_id, dso_name, capacity_band_mw, queue_months_p50, queue_months_p90, as_of, substation_name, demand_firm_mw, demand_available_mw, demand_constraint, demand_constraint_limiting_factor`.
- `source_bias_tags`: `source_id, dimension, tag, confidence` (the dead reader; the live path is enrichCategoryRows, outside scope).
- RPCs: `get_research_items_public`, `get_operations_items_public` (306), `get_research_source_coverage` (100); `get_source_citation_stats` only in the dead reader.

### Interface to other modules

- Exports offered: `assessItem` and the authority helpers (to P1-15 producers' research-assessment runtime); the ingest parsers, `buildEnvelopeRow`, `buildStateCostFactRow`, `planUpsert`, `originClassForTier`, the dimension keys (to P1-15 producers' regional runtimes and the NESO producer); `buildRegionGrid`, `isEnvelopedFact`, `indexAgainstBase`, `factHeadline`, `originClassLabel`, `derivationLabel`, `sourceUrlFromNote`, `sourceNameFromNote` (to P1-17 ui-kit FactCard's matrix density); `SEVERITY_COLUMN_TO_KEY` (to the market detail surface, P1-19/20); `theme-view` (to P1-18 shell ThemeStrip, the dashboard lane P1-24, the shared detail CrossPageSection); `buildOperationsAskContext` (to the assistant route owner); `relatedItems` is proposed for the shared detail read and offered to the regulation and market detail lanes.
- Imports needed: P1-17 ui-kit (ListSurfaceShell parts, ListRow, RailCard, LegendRailCard, SectionCard, SectionHeading, FactCard matrix density, Absence and CoverageState vocabulary, TierChip, TagChip, GradeChip, SourceLink, StateNote, skeleton); P1-18 shell (ThemeStrip mount, the detail shell DetailMasthead, DetailRail, SectionIndex, ActionCard, ItemConnectionsCard, CrossPageSection, NoticesRail); P1-09 flywheel-a (connection-view-model `SURFACE_LABELS`/`SURFACE_ORDER`, brief-staleness `resolveBriefForTheme`, tag-labels, the theme-briefs schema's `parseRamifications` and `SURFACE_HEADING`, which must move out of scripts/); P1-10 flywheel-b (the propagation outbox and entity spine signposts watch, `lifecycle_state` written by the signpost watcher, prediction scoring; and every regulation-to-operations comparison spec 04 section 8 assigns to the flywheel); P1-15 producers (research-assessment producer writes `research_assessments` and `signposts`; the regional producers write `regional_data_facts` and `state_cost_facts`; spec-09 producers write `auxiliary_energy_profiles` and `grid_connection_queues`); P1-05 sources-a (customer source tier, the source registry rows the facts embed); P1-01 auth-db (service client, `resolveOrgIdFromCookies` for the auxiliary panel); P1-02 workspace (workspace tags facet, watch, priority actions); the surface-of rule table (`surfaceOf`, migration 269) for admission.
- Derived values from the flywheel (P1-10): the Operations surface renders cross-region comparisons from facts it reads; the regulation-to-operations joins (spec 04 sections 6 rows 8-9 and 8, PPWR as the illustration) are produced by P1-10 for every regulation and land as derived values this module only reads. The page itself computes nothing beyond the index and the chain (no page-local engine).
- **Gaps for the coordinator:** (1) the cross-page theme view (theme-brief.mjs, theme-brief-text.mjs) is consumed by the shell, the dashboard and every detail page and has no Part 1 id; this register ports it to `src/core/themes` and owns it until one is named. (2) The assistant route `/api/ask` still has no owner id; operations-ask-context waits on it (intake-a gap 3 restated). (3) `scripts/research/authority-score.mjs` (imported by assess.mjs) and `scripts/turns/theme-briefs/schema.mjs` (imported by theme-brief.mjs) are src-imports-scripts edges; the authority scorer's owner is the research-assessment producer's lane (P1-15) [HYPOTHESIS on the id]. (4) The shared `relatedItems` detail read and `enrichCategoryRows` (the list read's citation and bias enrichment) sit in no lane this register can see beyond the auth-db "surface read modules" note.

### Invariants this code enforces

Already in data-invariants.md: INV-126 (research claim authority floor 4, regional exempt), INV-148 (signpost score columns together; at most one current research assessment per item), INV-173 (a missing observation carries no value; aggregates take the weakest origin class), INV-046 (a producer writes a figure only after grounding, a source rating and a kill switch). Appended by this lane, same commit, after master's last line (renumbered after INV-212 at merge): INV-213 (the horizon cascade: first rule that fires wins, never blended, R4 forced low, no band means a stored refusal reason, CONFIRMED only for R1 or R3), INV-214 (a maturity read is a corridor with method and evidence or null, never a guessed midpoint), INV-215 (an Operations figure is an indexed envelope number only with value_numeric and unit; an index only within one unit against a non-zero base; otherwise no index), INV-216 (a statement uses only sourced-grade origin classes, needs two regions, carries no verdict word, and lists every component's provenance; one fact per region chosen by a total order), INV-217 (the fully-loaded labour figure exists only when every term and a positive divisor exist, in one currency per hour; missing terms are named, never defaulted), INV-218 (a regional or state cost fact row is written only with every required envelope field; its display value is formatted mechanically; a re-run over identical data plans zero writes; origin class from tier is T1-3 official, T4 verified, else null), INV-219 (Operations S3/S4 comparisons render only when a dimension has two sourced regions including the item's own; otherwise the omit note says why).

Properties the new tree carries as tests or rendering checks (not data invariants): the matrix card height is constant across selection states (operator 2026-09-09); the matrix is the one allowed default-open element and declares itself; the dissent panel never collapses; no editorial queue, approval affordance or "featured" framing on Research (spec 03 acceptance 12, ADR-012); nothing on Operations says automate or hire (ADR-043, enforced by statements' verdict screen); no customer-entered data is stored or read for analysis (ADR-042).

### Rulings the code embodies (cite)

- Research is a horizon scan: structured assessments, autonomous intake, editorial queues forbidden (ruled 2026-07-12, research-is-horizon-scan; spec 03 contract; SignpostList.tsx:6-9).
- Research is built, not design-only (operator 2026-10-01, ADR-038; spec 03 header).
- External data only: no per-tenant assumption register, no customer-entered plan (operator 2026-10-03, ADR-042; spec 03 section 5 note; spec 04 component 12 note).
- Operations is a content build, never a decision engine; no automate-versus-hire answer (ruled 2026-07-12; operator 2026-10-03, ADR-043; StatementsBlock.tsx:8-10, statements.mjs:18-21).
- EU and US data in scope, sourced over free HTTP; producers built wired (operator 2026-08-11; spec 04 header; lib/regional/*).
- Matrix arrives with the first sourced cell of the first sourced row selected; arrows select; Esc closes; constant card height (operator 2026-09-09 items 3-5, coordinator note C1; RegionDimensionMatrix.tsx:62-83, 110-115). Every other accordion is closed by default (fsi-app CLAUDE.md, 2026-05-07).
- Rail filters scope the matrix's columns; the dimension facet scopes its rows (operator matrix redesign 2026-09-08; OperationsLedger.tsx:434-447).
- An app feature the artboard does not draw sits at the card or column foot (ruling R7; ResearchLedger.tsx:107-113, OperationsLedger.tsx:369-372).
- Grid carbon intensity is the seventh dimension, a system need on the DESIGN CHANGES OWED list (rule 20; migration 378; OperationsLedger.tsx:100-103).
- The spec-09 panels live on the profile, not the list (operator page-scope ruling 2026-09-08 item D3; OperationsDetailSurface.tsx:28-40).
- Fixed detail S-order 01 Summary, 02 Findings, 05 Sources, 06 Related; connections in the masthead (operator ruling 2, 2026-09-24; design handoff 2026-09-25).
- A value that cannot exist yet names the data it needs; "pending", "unscored", "not scored" never render (absence rule, 2026-09-25 close; CredibilityChipEvidence.tsx:8-10).
- Examples are not scope: PPWR on Operations is an illustration; regulation-to-operations comparisons come from the flywheel (rule 19; operator 2026-10-03, spec 04 section 8).

### Proof that the module works in the new tree

1. Unit tests, each red against a deliberately broken copy first: assess (R1 anchors only on the statutory event; "demonstration plant" reads TRL 6-7; refusal when no rule fires; R4 confidence low; status token); taxonomy ("zero-emission cargo bays for urban delivery" is last-mile; severity column map; `now` injected); region-grid (envelope gate with a NULL unit, index refuses mismatched units and a zero base, implied base, headline split at 24 characters); statements (one region gives the absence line, a verdict-word label is counted not shown, ineligible origin classes excluded, index all-or-nothing); labour chain (annual wage refused as base wage, mixed currency suppresses, zero hours suppresses, gap names every missing term); envelope builders (missing field throws, identical re-run plans nothing, numeric strings compare equal); matrix eligibility (one region, two regions without the item's own, two with it); the ingest parsers against captured payloads committed as fixtures with their capture date.
2. Rendering checks at 375, 768, 1024, 1280: the research list, the research detail rail, the operations list with six regions (the matrix scrolls, the dimension column stays pinned) and five (no scroll), the operations profile; target floors per ux-laws law 2; the matrix card height equal across untouched, selected, compare and Esc states.
3. A persona read check: anon and authenticated readers see only verified, non-archived items on both surfaces (the provenance gate), and the raw `research_assessments` table stays closed to them (C3a:147, migration 369).
4. `npm run typecheck` and `next build`.

### Port order

1. features/operations/model/dimensions.ts and region-resolve.ts (everything else names a dimension or a region).
2. The pure models: research assess, assessment-view, taxonomy; operations region-grid, statements, labour-chain, matrix-eligibility; core/themes/theme-view (with its two scripts imports resolved by P1-09).
3. features/operations/ingest (so P1-15's regional producers can import them).
4. The read modules: research-reads, operations-reads, after P1-01's clients and the shared list and detail reads exist.
5. UI: StatementsBlock, LabourChain, RegionMatrix, OperationsList, Spec09Panels, OperationsDetail; ThemeFacetRow, CredibilityChips, AssessmentCard, DissentPanel, SignpostList, AssessmentHistory, ResearchList, ResearchDetail; after P1-17 and P1-18.
6. Routes and skeletons; ask-context to the assistant route owner.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Research list in urgency bands with mode and region facets and a live count | ResearchLedger.tsx | ui/ResearchList |
| Theme facet row with counts, +N new in seven days, Unclassified pill | ResearchLedger.tsx 178-203, ResearchThemeCards.tsx | ui/ThemeFacetRow |
| Theme classification from the theme column, else keywords | taxonomy.mjs | model/taxonomy |
| Severity chip from the 13-value column, else text and recency, absence when null | taxonomy.mjs, ResearchLedger.tsx 246-250 | model/taxonomy, ResearchList |
| Horizon band in the list row meta | ResearchLedger.tsx 254, read-assessments.mjs 90-93 | ResearchList, assessment-view |
| Window sort with widen-to and clear-theme recovery | ResearchLedger.tsx 339-447 | ResearchList |
| Awareness band unscored note | ResearchLedger.tsx 306-382 | ResearchList (link to the legend, no assistant call) |
| Research source coverage rail card | ResearchLedger.tsx 451-474, supabase-server.ts 1768-1793 | ResearchList, research-reads |
| Credibility legend and split credibility chips with the GRADE ledger | research/page.tsx 108-128, CredibilityChip* | ui/CredibilityChips (per assessment) |
| Bias legend | research/page.tsx 132 (BiasLegend, P1-17) | P1-17 |
| Theme strip and coverage denominator on both lists | research/page.tsx 106-107, operations/page.tsx 55-56 | P1-18 ThemeStrip, coverage line owner |
| Research detail: grade, type, theme, modes chips; Summary; six findings sections; record-grade verbatim facts; Sources; Related by theme then source; cross-page section; export | ResearchFindingDetailSurface.tsx, research/[slug]/page.tsx | ui/ResearchDetail, research-reads |
| Horizon assessment card: TRL and CRI corridors with method, band, kind, rule, confidence, basis, refusal state, status token | ResearchFindingDetailSurface.tsx 465-542 | ui/AssessmentCard |
| Dissent panel, never collapsed: explicit dissent, else authority mix, else absence | DissentPanel.tsx | ui/DissentPanel |
| Signposts: watched entity, predicate, direction, fired or watching | SignpostList.tsx, read-signposts.mjs | ui/SignpostList, assessment-view |
| Assessment history: append-only supersedes chain | AssessmentHistoryLedger.tsx, read-signposts.mjs 120-144 | ui/AssessmentHistory, research-reads |
| Research assessment model (corridors, horizon cascade, refusal, evidence, authority distribution, signposts) for the producer | assess.mjs | model/assess (imported by P1-15) |
| Research admission candidate filter | surface-candidate.mjs | surface-of rule table |
| Cluster synthesis card from the item's theme brief | research/[slug]/page.tsx 276, ThemeBriefCard (P1-18) | theme-view, detail shell |
| Cross-page theme analysis, theme chips, derived chip label, brief text clean-up | theme-brief.mjs, theme-brief-text.mjs | core/themes/theme-view |
| Operations list in urgency bands with Region, Dimension, Mode facets | OperationsLedger.tsx | ui/OperationsList |
| Region by dimension matrix: seven dimensions, sticky column, horizontal scroll past five regions, fill-rate head, per-column coverage and linked-regulation counts, counting state while loading | RegionDimensionMatrix.tsx, OperationsLedger.tsx 204-252 | ui/RegionMatrix, OperationsList |
| Default selection, arrow selection, Esc close, Home and End, constant-height panel | RegionDimensionMatrix.tsx 213-402 | ui/RegionMatrix |
| Single-cell panel (three fact cards, more on the profile) and compare mode across regions with implied-base index | RegionDimensionMatrix.tsx 818-947 | ui/RegionMatrix |
| Empty-region and coverage-table reconciliation disclosures | RegionDimensionMatrix.tsx 768-786, region-grid.mjs 155-183 | ui/RegionMatrix, region-grid |
| Fully-loaded labour chain drill-down | LabourChain.tsx, labour-chain.ts | ui/LabourChain, model/labour-chain |
| Industry statements with components and provenance | StatementsBlock.tsx, statements.mjs | ui/StatementsBlock, model/statements |
| Coverage gaps rail: US sub-national tally and regions short of full coverage | OperationsLedger.tsx 465-560 | ui/OperationsList |
| Open profile link per region from the matrix panel | OperationsLedger.tsx 449-463 | ui/OperationsList |
| Per-fact freshness (current, ageing, stale, frozen) | supabase-server.ts 3485-3493 (computed, never shown) | operations-reads + RegionMatrix (shown; spec 04 section 3 item 2 "stale") |
| Coverage row notes | supabase-server.ts 3427 (read, never shown) | operations-reads + RegionMatrix disclosure |
| Operations profile: region-group chip, Summary, eight sections with the S3/S4 gate and omit notes, Sources, cross-page section, Related in region or by source | OperationsDetailSurface.tsx, operations-matrix.ts, operations/[slug]/page.tsx | ui/OperationsDetail, matrix-eligibility, operations-reads |
| Auxiliary energy load section (kWh over typical hours, setpoints, carbon needs grid intensity) | AuxiliaryEnergyPanel*.tsx | ui/Spec09Panels |
| Grid connection queue section (gate at 24 months, queue months, substation headroom) | GridQueuePanel*.tsx | ui/Spec09Panels |
| Regional producers' parsing: Eurostat electricity prices, Eurostat labour cost levels, BLS OEWS wages, JSON-stat decoding | lib/regional/*-parser.mjs | features/operations/ingest (P1-15 imports) |
| Envelope rows and idempotent upsert plans for regional and state cost facts | regional-facts-envelope.mjs, state-cost-facts-envelope.mjs | ingest/envelope |
| Assistant Operations data block | operations-ask-context.mjs | ask-context (assistant route owner) |
| Recalculation notices under both detail pages | research/[slug]/page.tsx 307-311, operations/[slug]/page.tsx 268-272 (NoticesRail) | detail shell owner |
| Research pipeline fields `pipelineStage`, `whatItChanges`, `doesNotResolve`, per-row citation stats | supabase-server.ts 1544-1747 (dead reader) | NOT PORTED as code (no caller). The callout fields `what_it_changes` and `does_not_resolve` (migration 110) remain columns; if the research detail should show them, P1-19..21's detail lane reads them there. `pipeline_stage` stays unrendered by ruling (spec 03: no editorial queue). Recorded so nothing is lost |
| Source fetch-status on the operations profile | operations/[slug]/page.tsx 148-156 | NOT PORTED (never rendered) |

### Defects the new code must not repeat (from the backlog rows in scope; STATUS cells written in BACKLOG-2026-10-11.md)

R1 anchoring on an unrelated event and the unreachable TRL 6-7 row (B-0685, B-1581); an unreachable theme pattern and a clock read in a pure module (B-0283, B-1582); a score-stripping regex that removes real figures (B-1583); a labour chain that mixes annual and hourly units (B-1580); a verdict-word statement dropped without a count (B-0278); a parser that hard-codes "all taxes" and ignores status flags (B-0281); hand copies of the regions roster (B-2177); one absence reason for every gap (B-0167); a failed remainder fetch shown as a complete count (B-0168); internal words and stale comments on customer surfaces (B-0169, B-0181, B-0183, B-0182); half-slice chips and panels mounted without data (B-0542, B-0547, B-0548, B-0549, B-0661); an unused helper (B-0686).
