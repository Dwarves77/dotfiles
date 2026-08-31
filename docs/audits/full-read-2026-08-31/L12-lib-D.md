# Lane L12-lib-D — Full-read audit report

Repo: /root/work/dotfiles, app in fsi-app/. All paths below relative to /root/work/dotfiles/fsi-app.

## Per-file verdicts (path order)

src/lib/email/send-invitation-email.ts — INCOMPLETE — sends org-invitation email
  INCOMPLETE: header comment (lines ~1-10) states no email provider is configured anywhere in the codebase (no resend/sendgrid/nodemailer/postmark/mailgun/SES dep in package.json, no mail env var, no send call in src/). The function unconditionally returns `{ delivered: false, configured: false, reason: "No email provider is configured on this deployment." }`.
  WIRING: called from src/app/api/orgs/[org_id]/invitations/route.ts (grep-confirmed). Genuinely wired, honestly-declared no-op.

src/lib/entities/canonical-entities.mjs — WORKING-WIRED — pure canonical entity name/alias table used by entity-resolve.mjs.

src/lib/entities/entity-resolve.mjs — WORKING-WIRED — deterministic DETECT→RESOLVE→BUCKET entity mention pipeline for WO-28 cross-referencing.
  NOTE: enforces a "moat boundary" (`LINK_ALLOWED_TABLES = ["item_cross_references","integrity_flags"]`) inside the pure planner (`assertMoatBoundary`), re-asserted again at runtime in link-items.ts.

src/lib/entities/entity-resolve.test.mjs — TEST — node:test coverage of detectMentions/resolve/classifyBucket/classifyRelationship/planLinkWrites/assertMoatBoundary. Not vacuous: exercises multiple bucket/relationship branches and the moat-boundary throw path.

src/lib/entities/lineage-backfill.mjs — WORKING-WIRED — pure partition/upgrade-decision logic for a one-shot lineage backfill (`partitionLineageWrites`, `pairKey`).
  WIRING: called by scripts/entities/backfill-lineage-edges.mjs (OPERATOR-TOOL, dry-run by default) and covered by src/__tests__/lineage-backfill.test.mjs.

src/lib/entities/link-items.ts — WORKING-WIRED — turns entity-resolve's plan into idempotent DB writes (upsert cross-refs, one-open-flag-per-namespace dedup).
  WIRING: imported by src/workflows/generate-brief.ts (`import { linkItems } from "../lib/entities/link-items"`, grep-confirmed).

src/lib/entities/source-role.mjs — WORKING-WIRED — pure source-role classification helper.

src/lib/entities/source-role.test.mjs — TEST — node:test for source-role.mjs; not vacuous.

src/lib/export/download.ts — WORKING-UNWIRED — CSV/blob download helper for a bulk-select action.
  WIRING: only caller is src/components/regulations/BulkSelectBar.tsx (grep-confirmed), and that component itself is never imported/rendered anywhere in the app except by itself and a mention inside .discipline/fitness/functions/F25-module-liveness.mjs's liveness registry (not a real caller). This CONFIRMS the GRAPH:UNREACHABLE flag — the whole BulkSelectBar.tsx tree is dead, download.ts included.

src/lib/format.ts — WORKING-WIRED — small formatting helpers (numbers/dates/currency), refs=6.

src/lib/health/spend-health.mjs — WORKING-WIRED — pure spend/health scoring for org spend data.

src/lib/health/spend-health.test.mjs — TEST — node:test for spend-health.mjs; exercises multiple thresholds, not vacuous.

src/lib/hooks/useAdminAttention.ts — WORKING-WIRED — React hook surfacing admin-attention counts.

src/lib/hooks/useListOrder.ts — WORKING-WIRED — React hook wrapping list-order.ts comparator/drag state.

src/lib/hooks/usePersonalState.ts — WORKING-WIRED — React hook for personal watchlist/list state.

src/lib/item-links.ts — WORKING-WIRED — item cross-link helpers, refs=5.

src/lib/jurisdictions/iso.ts — WORKING-WIRED — ISO jurisdiction code tables/lookups, refs=9.

src/lib/jurisdictions/tiers.ts — WORKING-WIRED — jurisdiction tier classification, refs=1 (single consumer, still wired).

src/lib/list-order.ts — WORKING-WIRED — shared client/server rank-comparator SoT for list ordering.

src/lib/list-pagination.ts — WORKING-WIRED — tiny pagination math helper, refs=5.

src/lib/market/carbon-overlay-view.mjs — WORKING-WIRED — pure view-model builder for carbon overlay chart data.

src/lib/market/oil-bulletin-workbook.mjs — WORKING-WIRED — OOXML/XLSX parser for the EU weekly oil bulletin workbook, extensively documented revision history in header comments.

src/lib/market/parsers/eu-weekly-oil-bulletin.mjs — WORKING-WIRED — parses oil-bulletin-workbook output into series rows.

src/lib/market/refresh-published-price-statistics.mjs — INCOMPLETE — recomputes published_price_statistics rows from market_series data via a series→item mapping.
  INCOMPLETE: `SERIES_ITEM_MAP = Object.freeze({})` is deliberately empty (header comment: "THE MAPPING IS DELIBERATELY EMPTY TODAY... starts EMPTY, ratified entries added the same way WO-19's origin_class backfill mapping was ratified before it ran"). Consequently `deriveDisplayRows` always returns `[]` until an operator adds a ratified entry. Documented, deliberate, not a bug.

src/lib/market/select-modal-factor.mjs — WORKING-WIRED — pure selection/derivation logic for a market "select modal" emission factor.

src/lib/market/series-board-view-model.mjs — WORKING-WIRED — view-model builder for the market series board UI.

src/lib/market/series-registry.mjs — WORKING-WIRED — registry of 4 market-series producers.
  INCOMPLETE: only `eu-oil-bulletin` has `implemented: true`; the other three (`eex-eua`, `ecb-fx`, `eia-v2`) are `implemented: false` with `producerScript: null, parserModule: null` — documented stubs, 3 of 4 registry entries unimplemented by design.

src/lib/market/write-market-series.mjs — WORKING-WIRED — `planMarketSeriesUpsert` pure planner for market_series upsert writes.
  WIRING: imported and called by scripts/producers/market/eu-weekly-oil-bulletin.mjs (line ~51/117, grep-confirmed); covered by src/__tests__/market-write-market-series.test.mjs and src/__tests__/market-producer-composition.test.mjs, and referenced by .discipline/fitness/functions/F27-producer-seam-proof.mjs/.test.mjs.

src/lib/notifications/dispatch.ts — WORKING-WIRED — notification dispatch fan-out, fail-soft by design (never breaks the calling request).

src/lib/notifications/seed-fallback-flag.ts — WORKING-WIRED — records integrity_flags rows when a seed-data fallback is used.
  NOTE: `null_orgId` trigger is deliberately routed to `console.info` only, never an integrity_flags row, per a documented 2026-07-13 operator ruling (119 of 127 open seed-fallback flags were `null_orgId` on `/`, i.e. expected anonymous traffic mis-filed as integrity violations).
  NOTE: the `service_role_missing`/env-missing case is structurally unrecordable (the flag write itself needs the missing service-role key) — logged via `console.error("[UNRECORDABLE]"...)` but never counted anywhere. An owner reading integrity_flags counts alone would undercount this failure mode.

src/lib/operations/region-crosswalk.mjs — WORKING-WIRED — pure jurisdiction/region crosswalk table + lookup.

src/lib/operations/region-crosswalk.test.mjs — TEST — node:test; contains a real fixed regression case for FR jurisdiction mapping, not vacuous.

src/lib/operations/region-grid.mjs — WORKING-WIRED — pure region-grid coverage matrix builder.

src/lib/operations/region-grid.test.mjs — TEST — node:test for region-grid.mjs; exercises multiple grid shapes, not vacuous.

src/lib/operations/state-roster.mjs — WORKING-WIRED — pure US state roster/lookup table.

src/lib/operations/state-roster.test.mjs — TEST — node:test for state-roster.mjs; not vacuous.

src/lib/orgs/ban-check.mjs — WORKING-WIRED — pure org-member-ban check predicate.

src/lib/regional/bls-oews-parser.mjs — WORKING-WIRED — parses BLS OEWS regional wage data; builds series IDs via `buildOewsSeriesId`.
  NOTE: header states the series-ID construction convention is "INFERENCE, not verified against a live call this session (network egress to api.bls.gov was unavailable in this sandbox...)" — built programmatically per BLS's published convention but unverified against a live API response.

src/lib/regional/bls-oews-parser.npmtest.mjs — TEST — npm-test-runner coverage of the OEWS parser; not vacuous.

src/lib/regional/eurostat-nrg-pc-205-parser.mjs — WORKING-WIRED — parses Eurostat energy-price dataset (nrg_pc_205).

src/lib/regional/eurostat-nrg-pc-205-parser.npmtest.mjs — TEST — coverage of the Eurostat parser; not vacuous.

src/lib/regional/regional-facts-envelope.mjs — WORKING-WIRED — builds WO-17 number-envelope objects (value_numeric/unit/currency/derivation/origin_class/source_key/source_ref/n_observations/method_version/as_at_date/reference_period) for regional facts producers.

src/lib/regional/regional-facts-envelope.npmtest.mjs — TEST — envelope-shape/field coverage; not vacuous.

src/lib/regulation-item-types.ts — WORKING-WIRED — small item-type constant table for regulation items, refs=2.

src/lib/relative-time.ts — WORKING-WIRED — relative-time formatting helper, refs=13 (widely used).

src/lib/research/surface-candidate.mjs — WORKING-WIRED — pure candidate-surfacing logic for research items.

src/lib/research/taxonomy.mjs — WORKING-WIRED — research taxonomy keyword table.
  NOTE: header documents a detailed 3-way keyword-drift reconciliation between two former component copies of this taxonomy — now a single SoT.

src/lib/research/taxonomy.npmtest.mjs — TEST — taxonomy coverage; not vacuous.

src/lib/research/theme-brief.mjs — WORKING-WIRED — read-only theme-brief builder ($0 cost, no generation, orphan-brief contract per header comment).

src/lib/research/theme-brief.npmtest.mjs — TEST — theme-brief coverage; not vacuous.

src/lib/scoring.ts — WORKING-WIRED — item/source scoring helpers, refs=4.

src/lib/supabase-browser.ts — WORKING-WIRED — browser Supabase client factory (anon key), refs=38, widely used.

src/lib/supabase-server-client.ts — WORKING-WIRED — server Supabase client factory (cookie-bound), refs=17.

src/lib/supabase-server-watchlist.npmtest.mjs — TEST — uses jiti to import `resolveWatchlistTypeFields` directly out of supabase-server.ts; header documents a RED-then-GREEN regression proof. Not vacuous.

src/lib/supabase-server.ts — WORKING-WIRED — central data-fetching module for the app (3670 lines; read in full across 9 sequential offset Read calls, confirmed contiguous 1→3670/3671 EOF).
  Contains fetchDashboardData, fetchResourcesOnly, fetchMapData, fetchListingsOnly, fetchListingsMapData, fetchSettingsData, fetchWorkspaceResources (RPC dispatcher, 4 workspace-intelligence RPC variants), fetchWorkspaceAggregates(Scoped), fetchSurfaceCounts, fetchResearchPipelineRows, fetchResearchSourceCoverage, category-routed fetchers (fetchMarketIntelItems/fetchResearchItems/fetchOperationsItems/fetchTechnologyItems via runCategoryRpc), fetchSourceCitationStatsByIds, fetchPriceStatsByItemIds, fetchOperationsCoverage, fetchStateCostFacts, fetchMarketSeriesBoard, fetchIntelligenceItemSections(+Uncached), fetchIntelligenceItem(+Uncached), fetchWatchlist(+resolveWatchlistTypeFields, exported and directly unit-tested), fetchCoverageGaps, fetchAwaitingReview, isPlatformAdminInline.
  DEAD: inside fetchDashboardData (~lines 1800-1836), `const allSynopses: Array<{...}> = [];` is declared and never populated (no push/assignment anywhere in the function) — comment above it explains intelligence_summaries is "shelved per CLAUDE.md sector-activation note (the 2,325 rows are pre-Phase-B.2.5 contract output, kept but unrendered)". Consequence: `synopses: SectorSynopsis[]` in the returned DashboardData is always `[]` on every call. Documented intentional shelving, not a runtime bug, but a vestigial declared-then-discarded array plus an always-empty computed field that a future reader could mistake for a live path.
  NOTE: `DASHBOARD_DATA_CACHE_KEY = "app-data-6c3e4c27"` is tied to a commit-hook rule (021) hashing the DashboardData interface text; documented limitation that nested-type shape changes must use optional fields or the key must be rotated by hand — a silent staleness risk if a nested shape changes without the hook catching it.
  NOTE: multiple `.eq("provenance_status", "verified")` gates confirmed throughout as the "Sprint 4 task 1.10" customer read gate — fail-closed pattern for unverified content, consistent across fetchers.

src/lib/supabase-service.ts — WORKING-WIRED — canonical service-role Supabase client factory, refs=55 (very widely used).
  NOTE: `getServiceSupabase` fails closed — throws rather than silently downgrading to the anon key when the service-role key env var is missing.

src/lib/surface-of.mjs — WORKING-WIRED — SoT for `surfaceOf()` (item_type, domain) → customer-surface classification, also used for SQL codegen, refs=11.

src/lib/telemetry/capture-error.ts — WORKING-WIRED — client/server error-capture telemetry helper, refs=9.

src/lib/telemetry/stack-hash.mjs — WORKING-WIRED — pure stack-trace hashing for error dedup.

src/lib/telemetry/stack-hash.test.mjs — TEST — stack-hash coverage; not vacuous.

src/lib/telemetry/surface-health.mjs — WORKING-WIRED — pure surface-health scoring from telemetry signals.

src/lib/telemetry/surface-health.test.mjs — TEST — surface-health coverage; not vacuous.

src/lib/tier-labels.test.mjs — TEST — scans components/ for a vocab-drift guard against tier-labels.ts's TIER_LABELS; not vacuous (a real drift would fail it).

src/lib/tier-labels.ts — WORKING-WIRED — SoT for T1-T7 display vocabulary (`TIER_LABELS`), refs=5.

src/lib/tier1-priority-jurisdictions.ts — WORKING-WIRED — priority-jurisdiction constant table, refs=3.

src/lib/trust-evaluators.npmtest.mjs — TEST — golden-contract tests for the 4 trust evaluators in trust.ts; not vacuous.

src/lib/trust.selftest.mjs — WORKING-WIRED — self-test sentinel for trust.ts's tier-weight invariants.
  WIRING: OVERTURNS the GRAPH:UNREACHABLE flag. Confirmed via grep that this file is spawned/invoked by .discipline/fitness/functions/F11-trust-tier-weights.mjs (`const SENTINEL = 'fsi-app/src/lib/trust.selftest.mjs';`), referenced in .discipline/governance/invariants.mjs (`enforcedBy: ['fitness:F11', 'selftest:fsi-app/src/lib/trust.selftest.mjs']`), and in .discipline/governance/execution-wiring.test.mjs ("surface 5: fitness sentinel (F11 spawn)"). Genuinely invoked via child-process spawn, not a static import, which is why the mechanical import graph missed it.

src/lib/trust.ts — INCOMPLETE — Bayesian prior-blend trust scoring for sources (917/918 lines; read in full across 2 sequential Read calls, confirmed contiguous, file ends at line 918 with a closing brace).
  Contains computeTrustScore, computeEarnedScore, tierPrior/TIER_PRIORS, computeOverallScore, computeAccuracyComponent/computeTimelinessComponent/computeReliabilityComponent/computeCitationComponent, TIER_WEIGHTS/HALF_LIFE_MONTHS/applyRecencyDecay (Q6/Q7 citation-network decay), computeCitationComponentFromRows, evaluatePromotion/evaluateDemotion, evaluateProvisionalSource, createDefaultTrustMetrics, computeBaselineTrustScore, frequencyToDays, Q7_CONFIG, evaluateCandidatePromotion (async, queries source_citations+sources), recomputeEffectiveTier (async, COALESCE formula).
  INCOMPLETE: inside evaluateDemotion's switch statement, `case "critical_conflict":` (~lines 438-442) has an empty body — comment says "This requires checking conflict records... (Would need conflict detail data passed in for full check)" but no code follows; `fired` is never set true for this trigger through this function.
  INCOMPLETE: `case "paywall_introduced":` (~lines 463-465) is also an empty body — comment says "This is event-driven, not metric-driven — checked when paywall_change event occurs", plausibly handled elsewhere, but this trigger silently never fires through evaluateDemotion itself; a caller relying on evaluateDemotion alone to catch either trigger would miss both.

src/lib/watchlist-links.npmtest.mjs — TEST — jiti-based runtime exhaustiveness test for WATCHLIST_TYPE_LABEL and watchlistHref against the full WatchlistItemType union; not vacuous (confirms label sanity beyond what tsc alone would catch).

src/lib/watchlist-links.ts — WORKING-WIRED — WATCHLIST_TYPE_LABEL + watchlistHref for watchlist filter chips/detail routing.
  WIRING: confirmed `WatchlistItemType` import resolves via `@/lib/data` re-export (grep-verified).
  NOTE: `watchlistHref({type:"market_series",...})` and `watchlistHref({type:"source",...})` both intentionally return `null` — no per-series/per-source detail route exists today (honest null, not a bug).

src/lib/watchlist-order.ts — WORKING-WIRED — shared client/server rank-comparator SoT for watchlist drag ordering, careful numeric-string handling to avoid IEEE-754 rounding of Postgres numeric positions.

src/lib/watchlist-scope.npmtest.mjs — TEST — watchlist-scope coverage; not vacuous.

src/lib/watchlist-scope.ts — WORKING-WIRED — org vs personal watchlist scope resolution helper.

src/lib/workspace/profile.ts — WORKING-WIRED — WorkspaceProfile interface, getWorkspaceProfile/relevanceForItem, refs=6.
  DEAD: fields `products`, `operationalBaseline`, `officeFootprint`, `regulationScope` are populated from the DB `profile` jsonb column (~lines 69-72: `products: p.products ?? [], operationalBaseline: p.operational_baseline ?? [], officeFootprint: p.office_footprint ?? "", regulationScope: p.regulation_scope ?? DEFAULT_WORKSPACE_PROFILE.regulationScope`) but computed-then-discarded — grep across all of src/ for `officeFootprint|regulationScope|operationalBaseline|\.products\b` shows these fields are read only inside profile.ts itself; `relevanceForItem` (~lines 88-97) only passes `roles`, `transportModes`, `jurisdictions`, `verticals` into `computeItemRelevance`. Four struct fields are fetched/shaped but never consumed downstream.

src/lib/workspace/relevance.mjs — WORKING-WIRED — pure item-relevance scoring against a workspace profile (roles/transportModes/jurisdictions/verticals).

src/lib/workspace/relevance.test.mjs — TEST — relevance.mjs coverage; not vacuous.

src/lib/workspace/viewer-relevance.npmtest.mjs — TEST — genuine fail-soft proof for viewer-relevance.ts; not vacuous.

src/lib/workspace/viewer-relevance.ts — WORKING-WIRED — per-viewer relevance wrapper around workspace/relevance.mjs, refs=5, fail-soft by design (never breaks the render on a relevance-computation error).

src/proxy.ts — WORKING-WIRED — Next.js request-interceptor (auth/session gating on incoming requests).
  WIRING: OVERTURNS the GRAPH:UNREACHABLE flag. File's own comment states: "Sprint 4 1.0b... per @workflow/next docs this is easy to miss in Next.js 16 where proxy.ts replaced middleware.ts". Confirmed via package.json that `"next": "16.1.6"`. Next.js 16 auto-invokes src/proxy.ts per its exported `config.matcher` — refs=0 (no static importer) is expected for a framework-auto-registered entry point and does not indicate dead code.

## Lane summary

### Counts by STATUS (79 files)
- WORKING-WIRED: 61
- INCOMPLETE: 4 (send-invitation-email.ts, refresh-published-price-statistics.mjs, series-registry.mjs, trust.ts)
- WORKING-UNWIRED: 1 (export/download.ts)
- TEST: 13 (entity-resolve.test.mjs, source-role.test.mjs, spend-health.test.mjs, region-crosswalk.test.mjs, region-grid.test.mjs, state-roster.test.mjs, bls-oews-parser.npmtest.mjs, eurostat-nrg-pc-205-parser.npmtest.mjs, regional-facts-envelope.npmtest.mjs, taxonomy.npmtest.mjs, theme-brief.npmtest.mjs, supabase-server-watchlist.npmtest.mjs, stack-hash.test.mjs, surface-health.test.mjs, tier-labels.test.mjs, trust-evaluators.npmtest.mjs, watchlist-links.npmtest.mjs, watchlist-scope.npmtest.mjs, relevance.test.mjs, viewer-relevance.npmtest.mjs)
  (Note: recount — 20 TEST files present in the list; see file-by-file section for the exact set. Non-TEST count is 79 - 20 = 59; of those 59, 1 is WORKING-UNWIRED, 4 are INCOMPLETE, 54 are WORKING-WIRED.)
- DEFECTIVE: 0
- STUB: 0
- DEAD-HISTORICAL: 0
- OPERATOR-TOOL: 0 (none of the 79 files is itself operator-invoked; lineage-backfill.mjs and write-market-series.mjs are WORKING-WIRED libraries that *feed* operator tools/scripts outside this lane)
- TEST-ONLY: 0
- AMBIGUOUS: 0

### Top findings, ranked
1. **src/lib/trust.ts:438-442, 463-465** — `evaluateDemotion`'s `critical_conflict` and `paywall_introduced` switch cases have empty bodies; neither trigger can fire demotion through this function. `critical_conflict` has no documented alternate path in this file (its comment says it "would need conflict detail data" not currently passed in); `paywall_introduced` is claimed event-driven elsewhere but that claim is unverified from this file alone. Any caller expecting evaluateDemotion to catch either condition is silently unprotected.
2. **src/lib/supabase-server.ts:~1800-1836** — `allSynopses` array in `fetchDashboardData` is declared, documented as intentionally shelved (intelligence_summaries table has 2,040 live rows per table-usage.txt but is never read here), and never populated — `DashboardData.synopses` is always `[]`. Confirmed intentional (CLAUDE.md sector-activation note cited in-code), but it's dead weight in the app's most central, highest-fan-in file (refs=24) and a re-activation trap if someone assumes the field is live.
3. **src/lib/market/refresh-published-price-statistics.mjs:SERIES_ITEM_MAP** — deliberately empty mapping means this producer path outputs `[]` for every published-price-statistics refresh until an operator ratifies entries. published_price_statistics has only 4 live rows (table-usage.txt) — consistent with this path essentially never having run productively.
4. **src/lib/market/series-registry.mjs** — 3 of 4 registered market-series producers (`eex-eua`, `ecb-fx`, `eia-v2`) are `implemented: false` stubs; only `eu-oil-bulletin` is live. market_series has only 6 live rows total (table-usage.txt), consistent with a single working producer.
5. **src/lib/email/send-invitation-email.ts** — org invitations cannot actually deliver email on this deployment; the function is wired and called but always returns `delivered:false`. org_invitations has 0 live rows (table-usage.txt), consistent with this path never having produced a working invite email in production.
6. **src/lib/export/download.ts** — genuinely dead: sole caller BulkSelectBar.tsx is itself unreferenced by any live route/page. Confirms (does not overturn) its GRAPH:UNREACHABLE flag.
7. **src/lib/workspace/profile.ts:69-72** — 4 profile fields (`products`, `operationalBaseline`, `officeFootprint`, `regulationScope`) are fetched from DB and shaped into WorkspaceProfile but never read by any downstream consumer (grep-verified across src/); only `roles/transportModes/jurisdictions/verticals` feed `relevanceForItem`.
8. **src/lib/notifications/seed-fallback-flag.ts** — the `service_role_missing` failure path is structurally unrecordable (writing the flag needs the very key that's missing); it's logged via console.error only and never counted in integrity_flags, so any dashboard built on integrity_flags counts will undercount this specific failure mode. Separately, `null_orgId` triggers are deliberately routed to console.info-only per a documented 2026-07-13 operator ruling, not written to integrity_flags.
9. **Two GRAPH:UNREACHABLE flags overturned as false negatives of the mechanical import-graph tool**: src/lib/trust.selftest.mjs (invoked via child-process spawn from .discipline/fitness/functions/F11-trust-tier-weights.mjs) and src/proxy.ts (invoked via Next.js 16 framework auto-registration, confirmed against package.json's `"next": "16.1.6"`). Both are genuinely wired; refs=0 was expected for both given their invocation mechanism, not evidence of dead code.
10. **src/lib/regional/bls-oews-parser.mjs** — series-ID construction convention is self-documented as unverified against a live BLS API call in this sandbox (network egress to api.bls.gov unavailable); it is built from BLS's published convention but has not been confirmed against a real response this audit.
11. **src/lib/supabase-server.ts DASHBOARD_DATA_CACHE_KEY** — tied to a commit-hook (rule 021) hashing the DashboardData interface text; documented limitation that nested-type shape changes require either optional fields or a manual key rotation — a latent staleness risk not automatically caught by the hook for nested shapes.

### Coverage attestation
Files read in full: 79/79.
Lines read (sum of lane-manifest line counts, including the two large files read via sequential offset chunks and confirmed to reach EOF — supabase-server.ts at 3670 and trust.ts at 917): **13,597** lines.

No file in this lane was left partially read.
