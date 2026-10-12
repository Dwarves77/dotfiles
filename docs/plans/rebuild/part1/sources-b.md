# P1-06 sources-b: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-06, DISPOSITION lane, read-only. Tree: origin/master `904680db0`. Written by a cloud session on 2026-10-12 (clock from `date -u`: 01:20 UTC). Every file in SCOPE was read whole with the Read tool, one call per file; the coverage table records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. Prior registers: A2-part4 (surfaces-sources) and B2-part4 (other scripts) were read whole; the rows naming an in-scope path in the other 26 registers were extracted with one `grep -nE` over the register directory (157 lines) and read whole as that extraction. No live database was read.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks, leading-`*` lines and whole-line `{/* */}` JSX comments stripped); README.md counts 0 code lines. Raw lines are `wc -l`.

## 1. Header and coverage

Module: sources-b. The admin source surfaces (registry card, provisional and canonical review queues, tier legend, tier override, scrape-schedule strip, connection pairs and themes views), the generated Coverage matrix and its per-surface denominator line, the map's coverage-gaps rollup, the two health endpoints and their pure verdict modules, and three source-registry scripts.

Coverage (34 files, 7,455 raw lines, 5,948 code lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/) | raw lines | code lines | read calls |
|---|---|---|---|
| src/components/sources/CanonicalSourceReview.tsx | 975 | 866 | 1 |
| src/components/sources/SourceAdminControls.tsx | 861 | 773 | 1 |
| src/components/sources/SourceHealthDashboard.tsx | 553 | 440 | 1 |
| src/components/sources/ProvisionalReviewCard.tsx | 447 | 399 | 1 |
| src/components/sources/ProvisionalReviewTable.tsx | 385 | 295 | 1 |
| src/components/sources/IntersectionDetectionView.tsx | 317 | 274 | 1 |
| src/components/sources/ThemesView.tsx | 296 | 255 | 1 |
| src/components/sources/SourceTierLegend.tsx | 262 | 211 | 1 |
| src/components/sources/SourceTierAuditPanel.tsx | 167 | 142 | 1 |
| src/components/sources/B2RegenerationNote.tsx | 81 | 53 | 1 |
| src/components/coverage/CoveragePageView.tsx | 294 | 274 | 1 |
| src/components/coverage/CoverageDenominatorLineView.tsx | 66 | 58 | 1 |
| src/components/coverage/CoverageExportButton.tsx | 53 | 37 | 1 |
| src/components/coverage/CoverageDenominatorLine.tsx | 8 | 7 | 1 |
| src/lib/coverage/coverage-matrix.mjs | 326 | 250 | 1 |
| src/lib/coverage/index-data.ts | 255 | 200 | 1 |
| src/lib/coverage/coverage-state.mjs | 127 | 84 | 1 |
| src/lib/coverage/client.ts | 85 | 68 | 1 |
| src/lib/coverage/identity.mjs | 72 | 45 | 1 |
| src/lib/coverage/request-coverage.mjs | 71 | 51 | 1 |
| src/lib/coverage/matrix-data.ts | 54 | 46 | 1 |
| src/lib/coverage/load-matrix.mjs | 47 | 29 | 1 |
| src/lib/coverage-gaps-rollup.ts | 88 | 68 | 1 |
| src/lib/coverage-gaps.ts | 81 | 52 | 1 |
| src/app/api/coverage/entries/route.ts | 28 | 25 | 1 |
| src/lib/health/spend-health.mjs | 159 | 116 | 1 |
| src/lib/health/gate-a-gauges.mjs | 121 | 94 | 1 |
| src/app/api/health/surfaces/route.ts | 212 | 139 | 1 |
| src/app/api/health/spend/route.ts | 137 | 69 | 1 |
| src/app/api/health/spend/logic.ts | 39 | 28 | 1 |
| scripts/sources/inaccessible-triage.mjs | 472 | 352 | 1 |
| scripts/sources/backfill-source-type.mjs | 112 | 85 | 1 |
| scripts/sources/README.md | 115 | 0 | 1 |
| scripts/source-role-cleanup.mjs | 89 | 63 | 1 |
| TOTAL | 7455 | 5948 | 34 |

Files not read whole: none. Test files: none exist beside the scope on this tree (`git ls-files | grep -E '\.(test|npmtest|selftest)\.mjs$'` returns 0 [CONFIRMED]); CLEAN-3 (`f906b2102`) deleted the 15 test files that sat beside this scope (`git show --stat f906b2102`), so every export kept "for its test" now has no importer.

Line-number drift [CONFIRMED by `git show --stat f906b2102`]: CLEAN-3 also stripped header comments from 21 of the 34 files in this scope (2,679 lines removed with the tests; for example api/health/spend/route.ts lost 32 lines, coverage-gaps.ts 58, inaccessible-triage.mjs 64). Line numbers that the 2026-10-11 registers cite for lib/coverage, lib/health, api/health, api/coverage, coverage-gaps, components/coverage and the three scripts are therefore stale; the 10 sources/*.tsx files were not edited by CLEAN-3, so A2-part4's line numbers for them still hold (checked: CanonicalSourceReview.tsx:418 is still the bulk modal overlay).

Consumer evidence: `node exports.mjs` (scratch) ran `git grep -l -w <symbol>` over fsi-app/src, fsi-app/scripts and fsi-app/supabase for every exported symbol (98 symbols), excluding the defining file; counts are name occurrences, so an upper bound. Every symbol claimed dead or comment-only in section 4 was then checked by hand with `git grep -n`. Module importers were counted by import path (relative imports added by reading). Route handlers are reached by URL; their callers are the `authedFetch("/api/...")` literals and workflows named in section 7.

## 2. Module verdict

**REFACTOR AND PORT.** Every customer-facing responsibility is kept (the Coverage matrix, its denominator line on four surfaces, the request-coverage action, the map's per-region gaps). The admin source surfaces are kept as features but not as code: two review queues carry two copies of one classification editor, three copies of one stat tile, a Haiku-recommendation layer that depends on metered routes the plan removes (complete-build-plan section 4, W2 METERED-0), a second base_tier write path beside the audited tier override, a "Flag ambiguous" button that writes nothing, and four tabs whose counts are hard-coded 0. The health endpoints and the three scripts lost their only invokers when CLEAN-3 deleted uptime-probes.yml, source-monitoring.yml and maintenance.yml [CONFIRMED: `ls .github/workflows` = ci.yml, live-smoke.yml]; their logic is kept, their wiring is owed.

**Current code LOC: 5,948** (awk over the 34 files, table above). **Estimated clean LOC: about 3,830.** Arithmetic (section 8 table, per planned file): admin source UI 1,970 (registry card 180, source row 110, row actions 110, tier override 170, scrape-schedule strip 110, tier legend 150, provisional table 200, classification editor 180, provisional card 90, canonical queue 260, pairs view 170, themes view 170, shared admin stat grid 30, regeneration note 40) + coverage 1,095 (matrix 230, state 75, identity 35, request 50, index data 160, matrix data and loader 60, client 60, page 220, denominator line 55, export button 35, map gaps rollup 95, entries route 20) + health 360 (gate-a 80, spend verdict 100, surfaces route 110, spend route and body 70) + scripts 405 (inaccessible triage 300, source-type backfill 60, source-role fix 45) = 3,830. Against today's 5,948 that is 64 percent. The largest single cut is the Haiku layer (precache, AI recommendation, recommend-tier: about 330 code lines across CanonicalSourceReview, ProvisionalReviewCard and SourceTierAuditPanel). Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (9), with the files that carry them today:

1. Source registry card for operators: list with tier facet and name filter, expandable row with trust metrics and monitoring info, health (overdue) view, view tabs, the regeneration strip and the scrape-schedule strip (SourceHealthDashboard.tsx, SourceTierLegend.tsx, B2RegenerationNote.tsx, SourceAdminControls.tsx GlobalPauseToggle).
2. Per-source operator actions on one pane (DP-1): pause, fetch now, regenerate brief, workspace visibility, tier override with reason and audit trail (SourceAdminControls.tsx SourceRowControls and SourceTierOverrideControl), base_tier audit with a Haiku recommendation (SourceTierAuditPanel.tsx).
3. Provisional-source review queue (artboard 13): approve, reject, re-tier on the row, classification editor in a disclosure (ProvisionalReviewTable.tsx, ProvisionalReviewCard.tsx).
4. Canonical-source candidate queue (operator override of canonical-autoverify): filters, pre-cache classification, bulk approve, per-candidate edit, approve, reject, defer (CanonicalSourceReview.tsx).
5. Connection-graph visibility for operators: persisted pairs with score bands and basis chips, convergence-ranked themes with briefs (IntersectionDetectionView.tsx, ThemesView.tsx).
6. Generated Coverage matrix (COV-1): mode x data class x geography, numerator = dual-verified census entries, denominator = catalogued entries, linkable cells, CSV export with provenance columns, six coverage states, request coverage (coverage-matrix.mjs, coverage-state.mjs, index-data.ts, load-matrix.mjs, matrix-data.ts, client.ts, request-coverage.mjs, CoveragePageView.tsx, CoverageExportButton.tsx, api/coverage/entries).
7. Per-surface coverage denominator line on Regulations, Operations, Market and Research (CoverageDenominatorLine.tsx, CoverageDenominatorLineView.tsx).
8. Map coverage gaps: per Tier-1 priority region, covered / partial / gap counts from the active registry's source types (coverage-gaps.ts, coverage-gaps-rollup.ts).
9. Health endpoints: per-surface backing counts, two RPC probes, Gate A honesty gauges, forward-events visibility count (api/health/surfaces, gate-a-gauges.mjs); spend traceability verdict (api/health/spend, spend-health.mjs). Plus the registry scripts: suspended-source acquisition ladder (inaccessible-triage.mjs), sources.source_type backfill (backfill-source-type.mjs), sources.source_role re-classification (source-role-cleanup.mjs).

Key dependencies [CONFIRMED by the import, `.from(`/`.rpc(` and `process.env` scans]:

- Modules imported: `react`, `next/link`, `next/server`, `next/cache` (unstable_cache), `lucide-react`; in-repo: `@/lib/api/authed-fetch` (authedFetch, authHeaders), `@/lib/api/worker-auth`, `@/lib/api/rate-limit`, `@/lib/api/route-guard`, `@/lib/auth/admin`, `@/lib/supabase-service`, `@/lib/supabase-server` (re-export of getServiceSupabase), `@/lib/db/paginate.mjs`, `@/lib/data` (APP_DATA_TAG), `@/lib/format`, `@/lib/relative-time`, `@/lib/tint`, `@/lib/cn`, `@/lib/urgency/bands`, `@/lib/domains`, `@/lib/tier-labels`, `@/lib/llm/model-ids.mjs` (HAIKU_MODEL, display text only), `@/lib/llm/spend-gauge.mjs`, `@/lib/sources/acquire-lock.mjs`, `@/lib/sources/source-type-taxonomy.mjs`, `@/lib/sources/{primary-fallback,seek-more,officialness}.mjs`, `@/lib/sources/host-authority.ts`, `@/lib/sources/classify-source-role.ts`, `@/lib/entities/host-from-url.mjs`, `@/lib/jurisdictions/iso`, `@/lib/tier1-priority-jurisdictions`, `@/lib/contracts/vocabularies.mjs`, `@/lib/telemetry/surface-health.mjs`, `@/stores/sourceStore`, `@/types/source`; UI: `@/components/ui/{StateNote,Absence,ActionRow,SectionCard,TabRow,RowTable,Chips,RelativeTime,Masthead,SectionHeading,RailCard,CoverageState,Button}`, `@/components/admin/{AdminTableView,UpcomingObligationsPanel}`, `@/components/shared/GfmSection`, `@/components/list-surface/ListSurfaceShell` (LIST_SURFACE_MOBILE_CSS); scripts: `scripts/lib/{db,env-file,is-main,institution-key,run-artifact,pg-conn}.mjs`, `scripts/harness-runs/governing-files.mjs`.
- Tables read directly in scope: census_worklist, intelligence_items, integrity_flags (read and insert), sources (read; write source_type, fetch_status, fetch_status_at, source_role), agent_runs, organizations, community_posts, workspace_settings, item_forward_events (inner join intelligence_items). RPCs: gate_a_health, get_market_intel_items(p_org_id), get_all_surface_counts(p_org_id). Raw SQL: `SELECT ... FROM sources` and `UPDATE sources SET source_role` through a direct pg client (source-role-cleanup.mjs:28,50). Views: none.
- Admin routes the UI calls (owned by P1-05 sources-a; all 18 exist on this tree [CONFIRMED `test -f`]): /api/admin/canonical-sources/{pending,bulk-classify,bulk-approve,recommend-classification,decide}, /api/admin/sources/{pause-global,promote,recommend-classification,recommend-tier,commit-tier-change}, /api/admin/sources/[id]/{pause,fetch-now,regenerate-brief,visibility,tier-override}, /api/admin/{intersections,themes,b2-progress}; plus /api/dashboard/coverage/{matrix,request} (route files outside this scope, logic in scope).
- Env vars read: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (two scripts' credential checks), SPEND_FREEZE_SINCE_ISO (spend route), WORKER_SECRET (through workerAuthGuard), the acquire-lock flag (through acquireEnabled), SUPABASE_DB_URL / DATABASE_URL / SUPABASE_DB_PASSWORD (through connectPg, source-role-cleanup).
- External services: Supabase PostgREST and Postgres; arbitrary source hosts by raw HEAD and GET (inaccessible-triage.mjs:141,150, with the capture-worker's header pair copied in); Anthropic Haiku indirectly, through the admin routes recommend-classification, bulk-classify and recommend-tier that the UI triggers.

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | CanonicalSourceReview.tsx | 866 code | a second classification editor (CandidateRow 609-944) beside ProvisionalReviewCard's; a Haiku pre-cache loop (209-242, banner 313-349) and a per-card recommendation fetch (634-670) over metered routes; local StatBox, FilterPills, PillPicker and an ItemGroup that collides with ui/ItemGroup (545); the vocabulary arrays (81-92) copied in ProvisionalReviewCard | one shared SourceClassificationEditor seeded by `classTierForHost` (deterministic, the rule-18 tier source); ui-kit stat tile and filter chips; the queue shrinks to stats, filters, bulk approve and groups |
| 2 | SourceAdminControls.tsx | 773 code, three components in one file | SourceTierOverrideControl (445-861) is 380 lines of utility-class markup for a select, an input and an audit list; `flash()` written three times (53, 236, 469); the label-span style and the select/input style typed twice in GlobalPauseToggle (125-185); four per-source buttons (348-395) repeat one shape | one `useFlash()`; one OperatorButton (44 px); split into ScrapeScheduleStrip, SourceRowActions, TierOverrideControl |
| 3 | ProvisionalReviewCard.tsx | 399 code | four near-identical pill-button blocks (324-397), each about 18 lines; the Haiku recommendation fetch (90-127); vocabulary arrays duplicated (49-60) with the retired 7-domain long labels | the shared editor and PillPicker; vocabularies from `@/lib/contracts/vocabularies.mjs` and `@/lib/domains` |
| 4 | SourceHealthDashboard.tsx | 440 code | four tabs carry `count: 0` as a literal (312-315); a 44-line design-history comment (320-364); the Health view computes "overdue" against the wall clock in render (296-299) while the cadence is off by rule 16, so every scheduled source reads overdue [HYPOTHESIS on live counts, B-1958] | tabs show no count unless a real one exists; Health reads the schedule state and says "scraping is off" instead of "overdue" when cadence is off |
| 5 | IntersectionDetectionView.tsx + ThemesView.tsx | 529 code | the same fetch-on-mount, loading, error, empty, StatBox and Section scaffolding written twice (ThemesView's own header, 9-10, says it was mirrored); ThemesView hand-copies CONVERGENCE_BANDS (69) from theme-stats.mjs; IntersectionDetectionView hard-codes the 0.9 / 0.5 band labels (147-149) and the engine weights in copy (171) | one AdminFetchView scaffold; bands come from the route payload (the route already bands rows server-side) |
| 6 | inaccessible-triage.mjs | 352 code | about 80 lines of harness-artifact plumbing and comment narrative (15-41, 410-441); twelve exports kept for a deleted test | keep the ladder; the run record goes through whatever run ledger the new tree keeps (one call) |
| 7 | CoveragePageView.tsx | 274 code | the matrix and view are typed `any` (12-15, 48-53, every map); LIST_SURFACE_MOBILE_CSS injected twice (61, 84) plus a third inline `<style>` (79-83); SELECT_STYLE reused for a button | types exported from the matrix module; one style injection through the list shell |
| 8 | index-data.ts + load-matrix.mjs | 229 code | one matrix build reads the whole census twice: load-matrix.mjs:17 runs getEntries() and getIndex() in parallel and both call loadCoverage (index-data.ts:139-229), which pages census_worklist and counts verified briefs (B-0245, B-1552); identity_http_status and title_source are selected (149-150) and never read | one `loadCoverage()` call per build returning entries and counts; select only the columns the mapper reads |
| 9 | api/health/spend/route.ts | 137 raw, 69 code | 47 lines of dated comment history (16-60) in a 137-line route | one paragraph; the history stays in the session log and fleet-budget runbook |
| 10 | SourceTierAuditPanel.tsx | 142 code | the whole panel is a Haiku "Recommend tier" (44-62) plus a commit to commit-tier-change, which writes base_tier, a second operator tier-change path beside the audited tier_override that SourceTierOverrideControl calls "Immutable, set at classification" (645); its Flag button writes nothing (147, 154-158) | TRASH; operator tier changes go through the tier override (reason plus audit); ambiguity becomes an integrity flag from the override control |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts and fsi-app/supabase excluding the defining file, and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| src/lib/coverage/identity.mjs:58 | deterministicIdentity | exported function | `git grep -w deterministicIdentity` outside identity.mjs: 0 [CONFIRMED]; A4c:L157 already said test-only, and the test is deleted |
| src/lib/coverage/identity.mjs:1 | parseInstrumentUrl (export) | export surface | 0 importers [CONFIRMED]; its one caller is deterministicIdentity :59, so it dies with it |
| src/lib/coverage/coverage-state.mjs:124 | `default: return null` | unreachable branch | every case of COVERAGE_STATE is handled above and :50 returns null first for a non-state [CONFIRMED read]; B-0674 |
| scripts/source-role-cleanup.mjs:22 | planAndApply and the whole CLI | script with no invoker | `git grep -w planAndApply`: 0 [CONFIRMED]; `git grep -F source-role-cleanup` outside the file: 0 [CONFIRMED]; the maintenance wrapper and maintenance.yml:810 were deleted by CLEAN-3 |
| scripts/sources/backfill-source-type.mjs:23,57 | planBackfill, main | script with no invoker | `git grep -w planBackfill`: 0; `git grep -F backfill-source-type` hits only comments in coverage-gaps-rollup.ts:24 and migration 288 [CONFIRMED]; the maintenance step source-type-backfill is gone |
| scripts/sources/inaccessible-triage.mjs:32-283 | INACCESSIBLE_TRIAGE_GOVERNING_FILES, DEFAULT_TIME_BUDGET_MIN, DEFAULT_CONCURRENCY, MAX_CONCURRENCY, DEFAULT_HOST_INTERVAL_MS, createHostThrottle, runBounded, probeGet, qualifiesAtFloor, triageOneSource, applyFetchStatus (exports) | export surface | 0 importers each [CONFIRMED]; probeHead and fetchStatusForDossier are named only in scripts/sources/README.md; the script's own invoker (source-monitoring.yml:124) is deleted, so the whole driver has no caller on this tree [CONFIRMED `ls .github/workflows`] |
| src/components/sources/ProvisionalReviewTable.tsx:109,115 | hostOf, rowTier (exports) | export surface | used only inside the file (:233, :232) [CONFIRMED]; the 27 `hostOf` hits are other functions of that name |
| src/components/sources/SourceTierLegend.tsx:35,53 | SOURCE_TIERS, facetTierOf (exports) | export surface | used only inside the file; the SourceHealthDashboard hit for facetTierOf is the comment at :302 [CONFIRMED] |
| src/lib/health/gate-a-gauges.mjs:3,10,35 | ALARM_GAUGES, GAUGE_NAMES, shapeGateAHealth (exports) | export surface | used only inside the file [CONFIRMED] |
| src/lib/coverage/coverage-matrix.mjs:3,8,11,36 | MATRIX_SCHEMA_VERSION, UNKNOWN_GEOGRAPHY, DATA_CLASSES, isNumerator (exports) | export surface | used only inside the file [CONFIRMED]; `cellKey`'s hit in OperationsLedger.tsx:261 is a local variable of the same name |
| src/lib/coverage/request-coverage.mjs:1-3,33 | COVERAGE_REQUEST_CREATED_BY, COVERAGE_REQUEST_CATEGORY, COVERAGE_REQUEST_SUBJECT_TYPE, buildCoverageGapFlag (exports) | export surface | used only inside the file [CONFIRMED]; OPEN_STATUSES' three hits are other modules' own constants |
| src/lib/coverage-gaps-rollup.ts:29 | sourceTypesFor (export) | export surface | used only at :45 [CONFIRMED] |
| src/lib/coverage/client.ts:13; CoverageDenominatorLineView.tsx:5; CoveragePageView.tsx:13 | CoverageCallResult, DenominatorModel, CoveragePageViewProps | exported types | 0 importers each [CONFIRMED] |
| src/lib/coverage/index-data.ts:122,116 | identity_http_status, title_source | selected, never read | in the select (:149-150) and the Row interface only [CONFIRMED read] |
| src/components/sources/SourceHealthDashboard.tsx:312-315 | `count: 0` on four tabs | constant | literal zeros; the label renderer at :419 hides a 0 count, so the field does nothing [CONFIRMED read] |
| src/components/sources/SourceTierAuditPanel.tsx:41,147 | `flagged` | local state with no write | toggled locally, disables Commit, prints "Flagged for operator decision"; no fetch [CONFIRMED read]; A2-part4:L100 |
| src/components/sources/ProvisionalReviewTable.tsx:375 | "last full extraction run" | permanent placeholder | always `<Absence reason="pending" />`, no data behind it [CONFIRMED read]; A2-part4:L97 |
| src/app/api/health/surfaces/route.ts, api/health/spend/route.ts | GET | routes with no in-repo caller | `git grep -F "api/health/"` outside the routes: migration comments only [CONFIRMED]; the caller, uptime-probes.yml, was deleted by CLEAN-3; live-smoke.yml and .discipline/rendering/live/* call pages, /api/admin/coverage and /api/admin/integrity-flags, never /api/health [CONFIRMED grep]. UNWIRED, not dead: the logic is kept (section 8) |
| src/app/api/health/surfaces/route.ts:113 | counts["assistant-config"] | duplicate query | the same `verified` count as counts["dashboard"] (:94), run twice [CONFIRMED read] |

Not dead, verified live this session: CoverageDenominatorLine (src/app/{market,operations,regulations,research}/page.tsx), CoveragePageView (app/dashboard/coverage/page.tsx), getCoverageGaps (app/map/page.tsx, components/map/MapPageView.tsx), getCoverageEntries (api/coverage/entries/route.ts, matrix-data.ts), classifyIdentifier and UK_TYPES (scripts/mint/export-census-rows.mjs, lib/sources/target-match.mjs), decideGateAProbe (scripts/health/gate-a-probe.mjs, itself now without an invoker), SourceHealthDashboard (components/admin/AdminDashboard.tsx:40, the only importer of anything under components/sources from outside the folder [CONFIRMED grep]).

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| classification editor (tier select, domains, jurisdictions, modes, topics, notes, approve/reject/defer) | CanonicalSourceReview.tsx:609-944 (CandidateRow); ProvisionalReviewCard.tsx:180-446 | one SourceClassificationEditor in features/sources-admin, used by both queues |
| ALL_JURISDICTIONS / ALL_MODES / ALL_TOPICS / ALL_DOMAINS | CanonicalSourceReview.tsx:81-92; ProvisionalReviewCard.tsx:49-60 (two label sets for the same seven domains, both the retired 7-domain vocabulary) | the contract vocabularies module and DOMAIN_LABELS; A2-part4:L50 |
| pill toggle buttons | CanonicalSourceReview.tsx:946-975 (PillPicker); ProvisionalReviewCard.tsx:324-397 (four inline copies) | ui-kit FilterChip (P1-17) |
| StatBox | CanonicalSourceReview.tsx:500-514; IntersectionDetectionView.tsx:202-214; ThemesView.tsx:183-191 | ui-kit StatBlock (P1-17) |
| Section header block | IntersectionDetectionView.tsx:216-226; ThemesView.tsx:193-203 | ui-kit SectionHeading |
| local ItemGroup | CanonicalSourceReview.tsx:545 vs components/ui/ItemGroup.tsx | rename or use the ui part; B-2143 |
| HAIKU_MODEL display fallback | CanonicalSourceReview.tsx:861; ProvisionalReviewCard.tsx:237 | goes with the Haiku layer (TRASH) |
| `flash()` timed status | SourceAdminControls.tsx:53, 236, 469 | one `useFlash(ms)` |
| tier select 1-7 | CanonicalSourceReview.tsx:876; ProvisionalReviewCard.tsx:319; SourceAdminControls.tsx:729; SourceTierAuditPanel.tsx:133; ProvisionalReviewTable.tsx:303; SourceTierLegend.tsx:35 (SOURCE_TIERS) | one TierSelect over SOURCE_TIERS |
| bulk-approve copy says "verified" while the eligible set includes unverified | CanonicalSourceReview.tsx:255, 426 vs 161-178 | copy names the real set; B-0198 |
| CONVERGENCE_BANDS | ThemesView.tsx:69 vs lib/connections/theme-stats.mjs | band from the route payload; A4a:L224 |
| score-band labels and engine weights in copy | IntersectionDetectionView.tsx:147-149, 171 vs lib/connections/pair-view.mjs:32 | band thresholds from the route; A4a:L213 |
| fetch-on-mount loader with loading, error, empty states | IntersectionDetectionView.tsx:74-140; ThemesView.tsx:83-139; CanonicalSourceReview.tsx:122-139 | one `useAdminFetch(url)` |
| two `getCoverageGaps` | lib/coverage-gaps.ts:68 (per-region rollup over sources) vs lib/data.ts:802 (table coverage_gaps) | rename the map one `getRegionCoverage`; A4d:L247 B-DUP-5 |
| two Tier-1 jurisdiction lists that disagree on 22 codes | lib/tier1-priority-jurisdictions.ts (used by coverage-gaps) vs lib/jurisdictions/tiers.ts | one list (owner P1-19 regulations or the jurisdictions module); A4d:L230 A-16 |
| item_type family lists | api/health/surfaces/route.ts:86-89 vs surface_of() (migration 148) and lib/telemetry/surface-health.mjs | the surfaces route counts through surface_of (the `get_all_surface_counts` rpc already does) |
| capture-worker header pair | inaccessible-triage.mjs:54-67 vs supabase/functions/capture-worker/index.ts | one shared constant module if both survive (the Deno edge function cannot import Node code, so this copy may be the honest minimum) [HYPOTHESIS] |
| ad hoc IS_MAIN | source-role-cleanup.mjs:62 vs scripts/lib/is-main.mjs | isMainModule; B-2214 |
| coverage census read | load-matrix.mjs:17 runs getEntries and getIndex, both loadCoverage | one call; B-0245 |

Over-abstraction: the dependency-injected cores (`main(opts, deps)` in both scripts, `planAndApply({..},{query})`, `loadCoverageMatrixWith(deps)`, `readGateAHealth(supabase)`) exist so tests could pass fakes, and the tests are gone. Keep the seam only where the new tree's test (section 8 proof) uses it: the coverage loader and the two health verdicts keep theirs; the scripts take their clients directly.

## 6. Non-essential artifacts

- scripts/sources/README.md (115 lines): a lane write-up of the triage ladder. Its operational parts are stale on this tree [CONFIRMED read]: it points at the `triage-inaccessible` job of source-monitoring.yml (deleted), at scripts/lib/exclusion-audit.mjs (deleted by DEAD-1), at lane R1's digest for "the 927 provisional-source population" (the canonical and provisional queues were retired from the R1 digest, B2-part4:L135), and at `node --test scripts/sources/inaccessible-triage.test.mjs` (deleted). TRASH; the ladder's contract is carried by section 8 and INV-120.
- The harness-run artifact plumbing in inaccessible-triage.mjs (scripts/harness-runs/inaccessible-triage/family.json) recorded 0 runs [CONFIRMED by B1-scripts-runtimes:L191: readRunHistory 0 valid]. Keep the run record as one call into whatever ledger the new tree keeps; the family directory is not ported.
- No fixtures, mock data or generated inventories in scope.

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's grep) | note.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| src/components/sources/SourceHealthDashboard.tsx | 1-553 (553) | admin Sources card: view tabs, registry list with tier facet and name filter, expandable SourceRow (trust metrics, monitoring info, three control mounts), Health view, regeneration and scrape strips, tier definitions overlay | REFACTOR AND PORT | 180 card + 110 row | 1: components/admin/AdminDashboard.tsx:40 (mounted on /admin) | four `count: 0` tabs (:312-315); `new Date()` in useMemo at render (:297, B-1957); Health "overdue" ignores cadence off (B-1958); expanded URL link has no word-break (:133-142, B-1959); `as unknown as` cast for tier_override (:215) because types/source.ts lacks it |
| src/components/sources/SourceAdminControls.tsx | 1-217 (GlobalPauseToggle), 219-400 (SourceRowControls), 402-861 (SourceTierOverrideControl) (861) | the rule-16 cadence control and emergency stop; per-source pause, fetch now, regenerate, visibility; tier override with reason and audit list | REFACTOR AND PORT (split in three) | 110 + 110 + 170 | 1: SourceHealthDashboard.tsx:28 | GlobalPauseToggle's first GET has no catch and ignores !ok, so the strip vanishes on a failed read (:41-51); the override loader swallows its error by comment (:474-486) (B-0199); row buttons and override inputs are about 24-28 px tall from `px-2 py-1 text-[11px]` classes (B-1956) [HYPOTHESIS: not rendered]; "COALESCE(override, dynamic, base)" shown to the operator (:665) |
| src/components/sources/SourceTierLegend.tsx | 1-262 (262) | T1-T7 legend with TIER_LABELS tooltips, tier facet with live counts (counted the way filterSources matches), Tier definitions overlay | REFACTOR AND PORT | 150 | 1: SourceHealthDashboard.tsx:27 | trigger and Close are minHeight 28 (:110, :238; B-1961); overlay has Esc and initial focus but no focus trap and no focus return (A2-part4:L101); TIER_LEGEND_EXAMPLES (:38-46) is surface gloss beside the TIER_LABELS SoT, correctly separated |
| src/components/sources/ProvisionalReviewTable.tsx | 1-385 (385) | artboard-13 provisional queue: row approve, reject, re-tier (defer with tier in notes), classify disclosure, foot legend, pipeline note | REFACTOR AND PORT | 200 | 1: SourceHealthDashboard.tsx:15 | re-tier buttons 30 x 30 (:313-314); "last full extraction run" is a permanent placeholder (:375); the pipeline note says "N items awaiting review" for staged updates, which are transit-only (RD-20) (A2-part4:L97) |
| src/components/sources/ProvisionalReviewCard.tsx | 1-447 (447) | full classification editor for one provisional source, Haiku recommendation with bias-tag preview, approve/reject/defer through /promote | REFACTOR AND PORT (into the shared editor) | 90 + share of editor 180 | 1: ProvisionalReviewTable.tsx:47 | the bias-tag preview mirrors bias-tag-pipeline.mjs thresholds 0.80 / 0.65 (:41-42) by hand; pill buttons about 20 px (A2-part4:L96) |
| src/components/sources/CanonicalSourceReview.tsx | 1-975 (975) | canonical-candidate queue: stats, filters, Haiku pre-cache, bulk approve modal, per-candidate edit, classification, approve/reject/defer | REFACTOR AND PORT | 260 | 1: SourceHealthDashboard.tsx:16 | modal has no role, aria-modal or focus handling (:418, B-0196); bulk copy says "verified" while the set includes unverified (:255, :426, B-0198); size 975 (B-0197); local ItemGroup (B-2143) |
| src/components/sources/IntersectionDetectionView.tsx | 1-317 (317) | persisted connection pairs from /api/admin/intersections, min-score control, banded cards with basis chips and both items' intersection summaries | REFACTOR AND PORT | 170 | 1: SourceHealthDashboard.tsx:17 | threshold buttons about 22 px (A2-part4:L95); weights in copy (:171) |
| src/components/sources/ThemesView.tsx | 1-296 (296) | connection themes from /api/admin/themes, last-run line, convergence bands, theme cards with pivots, dominant signals and an expandable brief (STALE marker) | REFACTOR AND PORT | 170 | 1: SourceHealthDashboard.tsx:18 | header (:12-14) says no item detail route exists; the four detail pages resolve item uuids through lib/detail/id-redirect.ts [CONFIRMED: imported by app/{market,operations,regulations,research}/[slug]/page.tsx], so members can link (B-0201); members print as 8-char ids; Brief toggle has no padding (:249-253, B-1962) |
| src/components/sources/SourceTierAuditPanel.tsx | 1-167 (167) | Haiku tier recommendation and base_tier commit for a seeded or provisional source, Flag ambiguous toggle | TRASH | 0 | 2: SourceHealthDashboard.tsx:29, ProvisionalReviewCard.tsx:7 | header still says "UNVERIFIED-PENDING-RUNTIME" and "Do NOT run a tier pass in Block 1" (:8, :16; B-0200); raw fetch plus authHeaders where siblings use authedFetch; Flag writes nothing; the feature is recorded in section 8 |
| src/components/sources/B2RegenerationNote.tsx | 1-81 (81) | one StateNote: "Regeneration · N / M at current contract · K never regenerated", polled every 30 s | REFACTOR AND PORT | 40 | 1: SourceHealthDashboard.tsx:19 | a failed read renders Absence "pending" (:52, :76), so an outage reads as pending (A2-part4:L93); fsi-app/.claude/CLAUDE.md still lists the deleted B2ProgressBanner.tsx (B-0195) |
| src/components/coverage/CoveragePageView.tsx | 1-294 (294) | /dashboard/coverage body: masthead, methodology drawer (closed), axis form, mode-tagging note, scoped totals, export, geography rows with linked cells, selected-cell card, definitions rail | REFACTOR AND PORT | 220 | 1: app/dashboard/coverage/page.tsx | matrix and view typed `any`; methodology comment (:106-109) says SeriesProvenance had not merged, but components/market/SeriesProvenance.tsx exists [CONFIRMED ls] (B-0146); cells and selects are 44 px [CONFIRMED read] |
| src/components/coverage/CoverageDenominatorLineView.tsx | 1-66 (66) | the per-surface line: error state with retry, not-covered state with request, else the sentence and "See coverage" | KEEP AS-IS | 55 | 1: CoverageDenominatorLine.tsx | "See coverage" link minHeight 28 with 8 px padding (:59) meets the 24-plus-clearance alternative [HYPOTHESIS: not rendered] |
| src/components/coverage/CoverageDenominatorLine.tsx | 1-8 (8) | server wrapper: getSurfaceDenominator then the view | KEEP AS-IS | 7 | 4: app/{market,operations,regulations,research}/page.tsx | |
| src/components/coverage/CoverageExportButton.tsx | 1-53 (53) | CSV download with sending, saved and error feedback | KEEP AS-IS | 35 | 1: CoveragePageView.tsx:8 | ux-laws 6, 10, 15 met in code [CONFIRMED read] |
| src/lib/coverage/coverage-matrix.mjs | 1-326 (326) | pure matrix: classes, modes, geographies, cells, content-hash version, query parse, hrefs, view, CSV with formula-injection guard, filename, denominator lines | KEEP AS-IS | 230 | 8: load-matrix, matrix-data, client.ts, matrix logic.ts, dashboard/coverage/page.tsx, CoveragePageView, CoverageDenominatorLineView, PortfolioAddSearch | clock injected; a geography containing `|` would corrupt cellKey (A4c:L155) [HYPOTHESIS: no such code in the census]; `n()` uses en-US while the rest uses formatNumber |
| src/lib/coverage/index-data.ts | 1-255 (255) | census_worklist would_mint loader: identity state, relevance band, display title, jurisdiction, modes, counts, sort; getCoverageIndex (fail-soft) and getCoverageEntries (throws) | REFACTOR AND PORT | 160 | 4: api/coverage/entries/route.ts, admin/CoverageCatalogueView.tsx, CoverageDenominatorLine.tsx, matrix-data.ts | verified-brief count error now throws (:163-170) [CONFIRMED read], closed by PR 1123 (B-0054); the census is read twice per matrix build (B-1019); header (:56-58) still calls the entries route "authenticated + read-only" while the route is admin-only (B-1551) |
| src/lib/coverage/load-matrix.mjs | 1-47 (47) | injected-deps loader: matrix or empty plus COVERAGE_UNAVAILABLE; surface denominator | REFACTOR AND PORT | into matrix-data (60 total) | 1: matrix-data.ts | the Promise.all double read (:17, B-0245) |
| src/lib/coverage/matrix-data.ts | 1-54 (54) | unstable_cache 600 s around the loaders; throws inside so an outage is never cached | REFACTOR AND PORT | into the 60 above | 3: api/dashboard/coverage/matrix/route.ts, dashboard/coverage/page.tsx, CoverageDenominatorLine.tsx | outer `catch {}` drops the cause (:42, :51; B-1553); UNPROVEN, no test (B-0867) |
| src/lib/coverage/coverage-state.mjs | 1-127 (127) | copy and action table for the six coverage states | KEEP AS-IS | 75 | 1: components/ui/CoverageState.tsx | unreachable default (B-0674) |
| src/lib/coverage/client.ts | 1-85 (85) | browser calls: request coverage, summary, CSV download (Blob) | KEEP AS-IS | 60 | 3: CoverageExportButton.tsx, portfolio/PortfolioAddSearch.tsx, ui/CoverageState.tsx | bare `catch {}` turns a 2xx JSON parse error into "network failed" (:43, A4c:L154); no test (B-0866) |
| src/lib/coverage/identity.mjs | 1-72 (72) | CELEX, ELI and UK-legislation identifier classifier, UK series codes | REFACTOR AND PORT | 35 | 2: scripts/mint/export-census-rows.mjs, lib/sources/target-match.mjs | drop deterministicIdentity and the exported parseInstrumentUrl (section 4); belongs with the census or capture module (P1-07) more than coverage |
| src/lib/coverage/request-coverage.mjs | 1-71 (71) | validate a request (site path, label at most 120 chars, control characters stripped), dedupe against open flags, insert one coverage_gap integrity_flags row | KEEP AS-IS | 50 | 1: api/dashboard/coverage/request/logic.ts | select-then-insert, no atomic guard (A4c:L161, race [HYPOTHESIS]); nothing closes these flags (B-0246) |
| src/lib/coverage-gaps.ts | 1-81 (81) | cached (60 s) per-region rollup over the active, non-admin registry, all-gap fallback | REFACTOR AND PORT | 30 | 2: app/map/page.tsx, components/map/MapPageView.tsx | a failed read returns [] and the all-gap rollup is cached for 60 s (:20, :34-37; A4d:L204 A-03); `console.log` in the request path (:50); same name as data.ts getCoverageGaps |
| src/lib/coverage-gaps-rollup.ts | 1-88 (88) | pure rollup: environmental_body plus legislature = covered, one = partial, none = gap, per priority ISO | REFACTOR AND PORT | 65 | 1: coverage-gaps.ts | looks up sources.jurisdictions by ISO code (:48-68) while the classifier module calls that column region buckets (classify-source.mjs:7-18) and both review editors write region buckets into it (CanonicalSourceReview.tsx:81, ProvisionalReviewCard.tsx:49) [HYPOTHESIS on live values; B-1984 A-17]; the port reads jurisdiction_iso |
| src/app/api/coverage/entries/route.ts | 1-28 (28) | admin-only full entry list for the Coverage catalogue tab | REFACTOR AND PORT | 20 | 1: admin/CoverageCatalogueView.tsx:55 | builds a service client to answer "is this an admin" (:10), the same pattern P1-01 section 3 rank 10 retires; use requireAdmin |
| src/lib/health/gate-a-gauges.mjs | 1-121 (121) | shape gate_a_health() into five gauges {value, state, computed_at, reason}; probe verdict | KEEP AS-IS | 80 | 2: api/health/surfaces/route.ts, scripts/health/gate-a-probe.mjs | gate_a_health_refresh is deliberately unscheduled, so state is not_computed in build mode (C4:L755, L897) |
| src/lib/health/spend-health.mjs | 1-159 (159) | pure spend verdict: every post-freeze paid agent_runs row traces to a priced-line or batch marker; unreadable baseline fails closed | KEEP AS-IS | 100 | 2: api/health/spend/logic.ts, route.ts | monthlyCeilingUsd, pct and frozen are informational vestiges (A4d:L336) |
| src/app/api/health/surfaces/route.ts | 1-212 (212) | worker-secret GET: per-surface verified counts, community and onboarding counts, two org-scoped rpc probes, Gate A gauges, forward-events visibility count; 200 or 503 | REFACTOR AND PORT | 110 | 0 in-repo callers (uptime-probes.yml deleted) | duplicate dashboard and assistant counts; hand-typed item_type families |
| src/app/api/health/spend/route.ts | 1-137 (137) | worker-secret GET: month-to-date agent_runs (paginated), verdict, additive spend gauge | REFACTOR AND PORT | 50 | 0 in-repo callers | 47 comment lines; MONTHLY_CEILING_USD = 130 is display only |
| src/app/api/health/spend/logic.ts | 1-39 (39) | response-body builder preserving the probe's field contract | KEEP AS-IS | 20 | 1: spend/route.ts | |
| scripts/sources/inaccessible-triage.mjs | 1-472 (472) | suspended-source ladder: HEAD re-probe, declared-primary fetch, bounded deterministic alternatives, same-floor qualification, dossiers, guarded fetch_status write, run artifact | REFACTOR AND PORT | 300 | 0 invokers (source-monitoring.yml deleted) | $0 by construction: no webSearch dep (:232) [CONFIRMED read]; last run 2026-06-28 (F1:L170) |
| scripts/sources/backfill-source-type.mjs | 1-112 (112) | one-shot sources.source_type backfill, guarded, never overwrites (applyMatch IS NULL) | REFACTOR AND PORT (as a data migration) | 60 | 0 invokers | whether the backfill ever ran is not recorded in the repo [HYPOTHESIS]; migration 288's header says 0 rows until it runs |
| scripts/sources/README.md | 1-115 (115) | ladder write-up | TRASH | 0 | 0 code referrers | stale (section 6; B-1117, B-2029) |
| scripts/source-role-cleanup.mjs | 1-89 (89) | re-run classifySourceRole over sources and apply role fixes over raw SQL with read-back | REFACTOR AND PORT | 45 | 0 invokers | raw SQL outside the guarded write path (B1b:L124, INV-039 says it must be guarded); ad hoc IS_MAIN (B-2214) |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/features/sources-admin/ui/SourceRegistryCard.tsx | SourceHealthDashboard.tsx 256-529 | card shell, view tabs (no fake counts), facet row, filter, view switch, strips | 180 |
| src/features/sources-admin/ui/SourceRow.tsx | SourceHealthDashboard.tsx 40-254 | expandable row: tier, name, trust score, domains, metrics, monitoring info, the action pane | 110 |
| src/features/sources-admin/ui/SourceRowActions.tsx | SourceAdminControls.tsx 219-400 | pause, fetch now, regenerate, visibility; 44 px; one useFlash | 110 |
| src/features/sources-admin/ui/TierOverrideControl.tsx | SourceAdminControls.tsx 402-861 | base, effective and override tiers, set or revert with reason, audit list; an "ambiguous" action that raises an integrity flag | 170 |
| src/features/sources-admin/ui/ScrapeScheduleStrip.tsx | SourceAdminControls.tsx 14-217 | cadence off, weekly, monthly with start date; emergency stop; an error state when the GET fails | 110 |
| src/features/sources-admin/ui/TierLegend.tsx | SourceTierLegend.tsx 28-262 | legend, facet, definitions overlay with focus trap and return, 44 px targets | 150 |
| src/features/sources-admin/ui/ProvisionalQueue.tsx | ProvisionalReviewTable.tsx 38-385 | artboard-13 queue; pipeline note without the empty placeholder | 200 |
| src/features/sources-admin/ui/SourceClassificationEditor.tsx | ProvisionalReviewCard.tsx 180-446; CanonicalSourceReview.tsx 609-944 | one editor: tier (seeded by classTierForHost), domains, jurisdictions, modes, topics, notes, approve/reject/defer, bias-tag preview from stored tags | 180 |
| src/features/sources-admin/ui/ProvisionalCard.tsx | ProvisionalReviewCard.tsx 62-178 | the editor bound to /api/admin/sources/promote | 90 |
| src/features/sources-admin/ui/CanonicalQueue.tsx | CanonicalSourceReview.tsx 94-607 | stats, filters, bulk approve with an accessible modal and honest copy, groups through ui ItemGroup, the editor per candidate | 260 |
| src/features/sources-admin/ui/ConnectionPairsView.tsx | IntersectionDetectionView.tsx 15-317 | pairs by band from the route, basis chips, summaries | 170 |
| src/features/sources-admin/ui/ConnectionThemesView.tsx | ThemesView.tsx 16-296 | themes by band from the route, member links to item detail, brief | 170 |
| src/features/sources-admin/ui/useAdminFetch.ts (+ stat grid from P1-17) | IntersectionDetectionView.tsx 74-140; ThemesView.tsx 83-139; CanonicalSourceReview.tsx 122-139 | one loader with loading, error, empty | 30 |
| src/features/sources-admin/ui/RegenerationNote.tsx | B2RegenerationNote.tsx 22-81 | the strip; a failed read says it failed | 40 |
| src/core/coverage/matrix.ts | coverage-matrix.mjs 1-326 | pure matrix, query, view, CSV, denominator lines, with exported types | 230 |
| src/core/coverage/state.ts | coverage-state.mjs 1-127 | six-state copy table | 75 |
| src/core/coverage/request.ts | request-coverage.mjs 1-71 | validate and record a request; one open flag per subject_ref | 50 |
| src/features/coverage/server/census.ts | index-data.ts 1-255 | one census read per build, entries and counts, only the columns mapped | 160 |
| src/features/coverage/server/matrix-data.ts | matrix-data.ts 1-54; load-matrix.mjs 1-47 | cached matrix and denominators; outage never cached; the cause logged | 60 |
| src/features/coverage/client.ts | client.ts 1-85 | the three browser calls | 60 |
| src/features/coverage/ui/CoveragePage.tsx | CoveragePageView.tsx 1-294 | typed page | 220 |
| src/features/coverage/ui/DenominatorLine.tsx | CoverageDenominatorLine.tsx 1-8; CoverageDenominatorLineView.tsx 1-66 | the per-surface line | 55 |
| src/features/coverage/ui/ExportButton.tsx | CoverageExportButton.tsx 1-53 | CSV download | 35 |
| src/features/coverage/api/entries.ts | api/coverage/entries/route.ts 1-28 | admin entry list through requireAdmin | 20 |
| src/features/map/region-coverage.ts | coverage-gaps.ts 1-81; coverage-gaps-rollup.ts 1-88 | renamed getRegionCoverage over jurisdiction_iso; a failed read is an error state, not a cached all-gap | 95 |
| src/core/census/identity.ts (P1-07 capture owns the census) | identity.mjs 15-52 | classifyIdentifier, UK_TYPES | 35 |
| src/core/health/gate-a.ts | gate-a-gauges.mjs 1-121 | gauge shaping and probe verdict | 80 |
| src/core/health/spend.ts | spend-health.mjs 1-159 | spend traceability verdict | 100 |
| src/features/health/api/surfaces.ts | api/health/surfaces/route.ts 1-212 | worker-secret probe counting through surface_of | 110 |
| src/features/health/api/spend.ts | api/health/spend/route.ts 1-137; logic.ts 1-39 | worker-secret spend probe and its body | 70 |
| scripts/sources/inaccessible-triage.mjs (new tree scripts dir) | inaccessible-triage.mjs 1-472 | the ladder over suspended sources | 300 |
| a data migration for sources.source_type | backfill-source-type.mjs 16-100 | classify NULL rows once, never overwrite (two-track policy: data migration with consumer code) | 60 |
| a guarded source_role fix (P1-05 owns role-at-birth) | source-role-cleanup.mjs 22-59 | re-classify role through the guarded write path | 45 |

### Data model (columns actually used by this module; "unused" means no code in this scope reads or writes it)

- `census_worklist` (221, 228, 229): read `id, document_url, instrument_identifier, title, source_id, shape_class, surface_tags, notes, identity_checked_at, identity_resolves, identity_scheme, identity_shape_valid, identity_host_registered`, embed `sources(jurisdiction_iso, transport_modes)`, filter `dryrun_disposition = 'would_mint'`. Selected and never read: `identity_http_status, title_source` [CONFIRMED read]. The relevance band is parsed out of the `notes` text (`[low-relevance]` tags, `type=` token): a free-text column carrying structured state [CONFIRMED read index-data.ts:71-99]; the port should read a column if one exists or name the debt.
- `intelligence_items`: counted by `provenance_status, full_brief` (index-data) and by `provenance_status, is_archived, item_type` (health); embedded through `item_forward_events.intelligence_items!inner(is_archived)`.
- `integrity_flags` (048, 050): read `id` by `category, subject_type, subject_ref, status`; insert `category, subject_type, subject_ref, description, recommended_actions, status, created_by`.
- `sources`: read `name, url, jurisdictions, source_type, status, admin_only` (rollup), `id, url, name, base_tier, jurisdictions, status` (triage), `id, name, url, source_role, category, status` (role fix); written `source_type` (288), `fetch_status, fetch_status_at` (147), `source_role` (category re-derived by the migration 123 trigger). Displayed from the store: `name, url, description, base_tier, effective_tier, tier_override, domains, status, trust_score.overall, trust_metrics.*, update_frequency, access_method, last_checked, next_scheduled_check, paywalled, processing_paused, admin_only`.
- `agent_runs`: read `cost_usd_estimated, started_at, fetch_method, intelligence_item_id, source_id, model, errors` for the month (`created_at`), ordered by `id`.
- `organizations` (oldest `id`), `community_posts` and `workspace_settings` (counts only), `item_forward_events` (count).
- RPCs: `gate_a_health()` (cached by gate_a_health_cache, refresh unscheduled), `get_market_intel_items(p_org_id)`, `get_all_surface_counts(p_org_id)`.
- Not touched directly, reached through P1-05's admin routes: `provisional_sources, canonical_source_candidates, source_trust_events, source_bias_tags, system_state(scrape_cadence, scrape_start_date, global_processing_paused), item_cross_references, connection_themes, connection_theme_runs, theme_briefs`.

### Interface to other modules

- Exports offered: `buildCoverageMatrix, buildCoverageView, parseCoverageQuery, coverageHref, matrixToCsv, csvFilename, surfaceDenominator, formatDenominatorLine, formatPortfolioCoverageLine, ALL, UNTAGGED` (core/coverage/matrix); `describeCoverageState, COVERAGE_ACTION` (to P1-17's CoverageState); `validateCoverageRequest, recordCoverageRequest` (to the dashboard coverage request route); `getCoverageMatrix, getSurfaceDenominator, getCoverageEntries, getCoverageIndex, COVERAGE_SURFACES, CoverageSurface, CoverageEntry` (to P1-24 dashboard, P1-19 regulations and the market, operations and research pages, admin CoverageCatalogueView); `requestCoverageRequest, fetchCoverageSummary, downloadCoverageCsv` (to P1-17 CoverageState and portfolio add); `getRegionCoverage` (map); `classifyIdentifier, UK_TYPES` (P1-07 capture and mint); `readGateAHealth, decideGateAProbe, computeSpendHealth`; the admin source surfaces mount into P1-25/26 admin through `SourceRegistryCard` and its `headTabs`, `onOpenQueue`, `stagedUpdatesCount`, `pendingTotal` props.
- Imports needed: P1-05 sources-a (the 18 admin routes listed in section 2, `useSourceStore` and `filterSources`, `Source` and `ProvisionalSource` types, `classTierForHost`, `classifySourceType`, `classifySourceRole`, the acquisition-ladder modules `fetchPrimaryWithFallback`, `generateCandidates`, `officialnessOf`, the acquire-lock flag); P1-17 ui-kit (StateNote, Absence, ActionButton, SectionCard, SectionHeading, TabRow, RowTable, TierChip, FilterChip, RelativeTime, Masthead, RailCard, CoverageState, Button, StatBlock, ItemGroup, `tint`, tokens); P1-18 shell (list-surface mobile CSS); P1-01 auth-db (`authedFetch`, `requireUser`, `requireAdmin`, `workerAuthGuard`, `checkRateLimit`, `getServiceSupabase`, `fetchAllRows`); P1-07 capture (census_worklist, identity probe that fills identity_*); `@/lib/tier-labels` (TIER_LABELS), `@/lib/domains`, `@/lib/contracts/vocabularies.mjs`, `@/lib/jurisdictions/iso`, `@/lib/telemetry/surface-health.mjs`, `@/lib/llm/spend-gauge.mjs`.
- The customer-facing source rating and bias display (every item shows its source's rating and bias; PR 944, `lib/credibility/bias-display.mjs`, `lib/credibility/chip-selection.mjs`, `lib/customer-source-tier.ts`, the BiasChips and tier chips on rows and detail mastheads) is NOT in this scope [CONFIRMED: no in-scope file imports `credibility/` or `customer-source-tier`]. The brief names it as a source surface; its register belongs to P1-05 sources-a or P1-17 ui-kit. Recorded here so the feature has an owner on record: **Gap for the coordinator** if neither P1-05 nor P1-17 lists it.
- **Gap for the coordinator (health wiring):** the brief says the live-smoke workflow reads the health endpoints. [REFUTED]: live-smoke.yml and .discipline/rendering/live/* call pages, `/api/admin/coverage` and `/api/admin/integrity-flags` (live-assertions.mjs:192) and never `/api/health/*` [CONFIRMED grep]. The health endpoints' only caller was uptime-probes.yml, deleted by CLEAN-3, as were source-monitoring.yml (inaccessible-triage) and maintenance.yml (the two registry scripts). The port must name a new invoker for each, or the operator rules them off.

### Invariants this code enforces

Already in data-invariants.md: INV-023 (effective_tier derivation, tier_override never moved), INV-036 (coverage-gap queues decided by rule), INV-039 and INV-118 (source_role current, guarded write owed), INV-040 and INV-119 (source_type backfilled once, never overwritten), INV-051 and INV-134 (cadence off means dry; pause flags have one writer), INV-073 (no automatic tier writer over a tier_override), INV-110 (Gate A gauge readable and zero), INV-120 (suspended-source ladder, fetch_status). Appended by this lane, same commit: INV-162 (a coverage figure is dual-verified over catalogued, an empty cell is "not covered" and never a zero, a failed read is an error state and never cached), INV-163 (a reader's coverage request creates at most one open coverage_gap flag per subject path, from a validated path and a bounded label), INV-164 (every paid agent_runs row after the freeze baseline traces to a priced-line or batch marker; an unreadable baseline fails closed).

Properties (not data invariants) the new tree must carry as tests or lint rules: every interactive target in the admin source surfaces meets the 44 px floor or the 24-plus-8 alternative (today about a dozen fall short, B-1956, B-1960, B-1961, B-1962); a modal traps and returns focus; a fetch failure is never rendered as "pending" or as an empty list; a facet count is computed by the same function its filter matches on (SourceTierLegend.tsx:53-66, kept).

### Rulings the code embodies (cite)

- Rule 16, build mode: the scrape cadence is off and the strip says "Nothing scrapes, not the automated worker, not manual fetch-now" (SourceAdminControls.tsx:110-114); the emergency stop preserves the saved cadence (:80, :105-108).
- DP-1 single pane: every per-source action sits in the expanded row (SourceHealthDashboard.tsx:198-230; SourceAdminControls.tsx:412-415).
- Operator item 3 and 4 (2026-09-08): tier becomes a legend, a facet and an overlay, never a card row; nothing may require a horizontal reach (SourceTierLegend.tsx:3-26; SourceHealthDashboard.tsx:406-411).
- Ruling R7: the classification editor moves to the row overflow menu as a disclosure (ProvisionalReviewTable.tsx:133-136).
- FOLD-61 / COUNTS-61: the queue head and the tab badge count the same queue (ProvisionalReviewTable.tsx:68-83, 210-211).
- Operator check 5 (PARITY-PARTS 2026-09-24): no exact-case "PENDING" rendered (ProvisionalReviewTable.tsx:208-209).
- Coordinator ruling 2026-10-08: the methodology drawer is closed by default (CoveragePageView.tsx:106-109; accordions closed platform-wide, fsi-app/.claude/CLAUDE.md).
- Spec 00 section 3.6: provenance survives export as columns (coverage-matrix.mjs:258-262); section 4: six coverage states, a gap is "not covered", never a zero (coverage-state.mjs, coverage-matrix.mjs:196-200).
- PI-1: coverage mounts inside the four machine surfaces, never as a sixth surface (index-data.ts:130-134).
- Operator-priced spend model (2026-07-15) and "no spend during build" (2026-08-28): the spend verdict is traceability, not a ceiling (spend-health.mjs:134-140; spend route :33-60).
- OPS-1 (2026-10-07): Gate A gauges are {value, state} and not_computed is the expected build-mode state (gate-a-gauges.mjs, surfaces route :155-161).
- SC-13 moat: an alternative source never confers authority its host class would not (inaccessible-triage.mjs:166-174, 252-254); $0 deterministic alternatives only (:232).
- ADR-002 / source-credibility-model section 7: base_tier provenance, tier_override with mandatory reason, effective_tier = COALESCE (SourceAdminControls.tsx:404-411).
- Rule 18: tier labels come from TIER_LABELS, the one vocabulary (SourceTierLegend.tsx:23-25).

Rulings owed by this register (the port cannot pick a side alone): (1) the Haiku recommendation layer (pre-cache, per-candidate recommendation, recommend-tier) depends on metered routes the plan's W2 METERED-0 removes; this register ports the editor seeded by `classTierForHost` and drops the Haiku layer. (2) SourceTierAuditPanel's base_tier commit is a second operator tier path beside tier_override; this register keeps only tier_override. (3) The canonical queue's empty state says canonical-autoverify rules every row and the queue is an override (CanonicalSourceReview.tsx:291); RD-20 says intake has no human resting state; whether the canonical and provisional queues stay as operator overrides is the operator's call, and the register ports them as overrides with that copy.

### Proof that the module works in the new tree

1. Unit tests, each red against a deliberately broken copy first: `buildCoverageMatrix` (numerator only for firm plus verified, untagged mode, unknown geography, version stable under row order, a `|` in a geography refused or escaped); `buildCoverageView` (absent cell is `present:false`, never 0); `matrixToCsv` (formula-injection guard, provenance columns); `describeCoverageState` (all six); `validateCoverageRequest` (protocol-relative, `..`, control characters, 121-char label); `recordCoverageRequest` with an existing open flag; the census loader called once per build; `computeSpendHealth` (unreadable baseline, untraced row, batch window, priced line logged after the paid row); `shapeGateAHealth` and `decideGateAProbe` (empty, stale, unreadable, alarm); `rollupRegions` over jurisdiction_iso; `qualifiesAtFloor` and `fetchStatusForDossier`.
2. Route persona matrix (INV-076) for api/coverage/entries (admin only) and the two health routes (worker secret only, 401 otherwise).
3. Playwright at 375 px and 1280 px: /dashboard/coverage (form, a cell link round trip, CSV download), each surface's denominator line, the admin Sources card (every target at least 44 px or 24 with 8 px clearance; tier definitions overlay focus trap and Esc), the provisional queue approve and re-tier.
4. A failed-read drill per async view (B2 note, scrape strip, pairs, themes, coverage): the view shows its error state, never "pending" or an empty list.
5. `npm run typecheck` and `next build` (the four-step CI).

### Port order

1. core/coverage (matrix, state, request) and core/health (gate-a, spend): pure, no dependencies.
2. features/coverage/server (census, matrix-data) after P1-01's core/db; then client, ui, entries route.
3. features/map/region-coverage after the jurisdictions owner settles the one Tier-1 list.
4. features/health/api after P1-01's workerAuthGuard; name the new invoker (or record the operator's ruling that there is none).
5. features/sources-admin after P1-05's admin routes and store and P1-17's ui-kit: TierLegend, SourceRow and SourceRowActions, TierOverrideControl, ScrapeScheduleStrip, RegistryCard, the shared editor, ProvisionalQueue, CanonicalQueue, pairs and themes views, RegenerationNote.
6. The three scripts last, each with its invoker named.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Source registry list with tier facet counts that match the filter, name filter | SourceHealthDashboard.tsx, SourceTierLegend.tsx | sources-admin SourceRegistryCard, TierLegend |
| Expandable source row: description, URL, accuracy, accessibility, citations, conflicts, frequency, method, last checked, paywalled, paused | SourceHealthDashboard.tsx:40-235 | SourceRow |
| Health view: sources overdue for checking | SourceHealthDashboard.tsx:296-299, 479-500 | SourceRegistryCard (reads the cadence; "scraping is off" while off) |
| Tier legend with authority labels, tier definitions overlay | SourceTierLegend.tsx | TierLegend |
| Scrape cadence off / weekly / monthly with start date; next run shown; emergency stop that preserves the schedule | SourceAdminControls.tsx GlobalPauseToggle | ScrapeScheduleStrip |
| Per-source pause, fetch now (with the fetched size, method, time and hash), regenerate brief (queued run id), workspace visibility | SourceAdminControls.tsx SourceRowControls | SourceRowActions |
| Tier override with mandatory reason, revert to base, audit list of past overrides | SourceAdminControls.tsx SourceTierOverrideControl | TierOverrideControl |
| Flag a source's tier as ambiguous for an operator decision | SourceTierAuditPanel.tsx:145-158 (local only, never written) | TierOverrideControl, raising an integrity_flags row (category source_issue) |
| Haiku tier recommendation and base_tier commit | SourceTierAuditPanel.tsx | NOT PORTED as code (metered route; second tier path); ruling owed (1), (2) |
| Provisional queue: approve at the row's tier, reject, re-tier (held as a defer note), classify disclosure, queue total vs rows shown | ProvisionalReviewTable.tsx | ProvisionalQueue |
| Provisional classification editor with bias-tag preview | ProvisionalReviewCard.tsx | SourceClassificationEditor + ProvisionalCard (preview from stored tags, no Haiku call) |
| Canonical candidate queue: stats, confidence / verified / issue filters, per-item groups, candidate edit (URL, title, publisher), approve with classification, reject, defer, reviewer notes | CanonicalSourceReview.tsx | CanonicalQueue + SourceClassificationEditor |
| Bulk approve of high-confidence candidates with a result summary | CanonicalSourceReview.tsx:244-482 | CanonicalQueue (copy names the real eligible set) |
| Pre-cache AI classifications in server batches | CanonicalSourceReview.tsx:204-242 | NOT PORTED (metered); ruling owed (1) |
| Regeneration progress strip with "Open queue" | B2RegenerationNote.tsx | RegenerationNote |
| Upcoming obligations tab in the Sources card | SourceHealthDashboard.tsx:519 (mounts components/admin/UpcomingObligationsPanel) | stays a tab of SourceRegistryCard; the panel itself is admin's (P1-25/26) |
| Connection pairs by band with basis chips and min-score control | IntersectionDetectionView.tsx | ConnectionPairsView |
| Connection themes by convergence with pivots, signals, last run, stale brief | ThemesView.tsx | ConnectionThemesView (members link to item detail) |
| Coverage matrix page: axes, scoped totals, linked cells, selected cell, definitions | CoveragePageView.tsx, coverage-matrix.mjs, index-data.ts, matrix-data.ts | features/coverage + core/coverage |
| CSV export carrying version, generation time and data as-of | CoverageExportButton.tsx, client.ts, coverage-matrix.mjs | ExportButton, client, matrix |
| Request coverage from a gap (one open flag per path) | request-coverage.mjs, client.ts | core/coverage/request + client |
| Coverage denominator line on Regulations, Operations, Market, Research | CoverageDenominatorLine*.tsx | DenominatorLine |
| Portfolio-add coverage line | coverage-matrix.mjs formatPortfolioCoverageLine, client.ts fetchCoverageSummary | core/coverage/matrix + client (consumer is portfolio) |
| Admin Coverage catalogue entries | api/coverage/entries, index-data.ts getCoverageEntries | features/coverage/api/entries |
| Map coverage gaps per Tier-1 region | coverage-gaps.ts, coverage-gaps-rollup.ts | features/map/region-coverage |
| Surface health probe with Gate A gauges and forward-events visibility | api/health/surfaces, gate-a-gauges.mjs | features/health/api/surfaces + core/health/gate-a |
| Spend traceability probe with spend gauge | api/health/spend, spend-health.mjs | features/health/api/spend + core/health/spend |
| Suspended-source acquisition ladder with dossiers and fetch_status | scripts/sources/inaccessible-triage.mjs | scripts/sources/inaccessible-triage (invoker owed) |
| sources.source_type backfill | scripts/sources/backfill-source-type.mjs | data migration |
| sources.source_role re-classification | scripts/source-role-cleanup.mjs | guarded fix with P1-05's role-at-birth |

### Defects the new code must not repeat (from the backlog rows in scope; the STATUS cells are written in BACKLOG-2026-10-11.md)

A fetch failure rendered as pending or as nothing (B-0199, A2-part4:L93), a modal without focus handling (B-0196), copy that names a narrower set than the action takes (B-0198), a button that promises a write it never makes (A2-part4:L100), stale header claims (B-0146, B-0200, B-0201), the census read twice per build (B-0245, B-1019), a dropped error cause (B-1553), a coverage flag nothing closes (B-0246), sub-floor targets (B-1956, B-1960, B-1961, B-1962), the wall clock read during render (B-1957), "overdue" while scraping is off (B-1958), a long URL without a break (B-1959), region buckets matched as ISO codes (B-1984), raw SQL outside the guarded write (INV-039, B-2214).
