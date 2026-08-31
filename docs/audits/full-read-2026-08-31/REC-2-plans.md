# REC-2 — What the plans promised that was never built

Reconciliation lane REC-2. Question: what did `docs/plans/` promise that the full-read code audit
and live DB do not show as built. Every row's state is set from `full-read-audit-2026-08-31.md`,
`table-usage.txt`, and direct greps against `dotfiles` (branch master) as of this session — never
from a plan's own DONE claim, and (the corollary this lane applied throughout) never from a plan's
own "not yet built" claim either, since later work repeatedly fulfilled earlier promises the source
plan itself did not know about yet (confirmed BUILT the hard way, via grep, in several cases below).

States: **BUILT** / **PARTIAL** (which half) / **UNBUILT** / **SUPERSEDED** (cite) / **RULED-OUT**
(cite) / **TRACKED** (already on the given backlog).

---

## 1. The flywheel (U0–U9) — governing doc: `flywheel-build-plan-2026-08-10.md`

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| U0 — populate `item_cross_references` graph (backfill-edges.mjs) | flywheel-build-plan:16-24 | BUILT | table-usage.txt: `item_cross_references` 1,929 rows; discover/backfill live |
| U1 — cluster engine `cluster.mjs` (F1 clustering, F2 pivots, F3 convergence, F4-basic trajectory) | flywheel-build-plan:26-42 | BUILT | grep `src/lib/connections/cluster.mjs` — "F2 pivots — weighted-degree centrality", "F3 convergence", "F4-basic trajectory" comments in place |
| U2 — `analyze-corpus.mjs` + `connection_themes`/`connection_theme_runs` + L2 `gaps.mjs` | flywheel-build-plan:44-66 | BUILT | table-usage.txt: `connection_themes` 9 rows, `connection_theme_runs` 4 rows; `src/lib/connections/gaps.mjs` present |
| U3 — `/api/themes` + `ThemesView`, `detect_intersections` supersession | flywheel-build-plan:68-81 | BUILT | `src/app/api/admin/themes/route.ts`, `ThemesView.tsx` mounted in `SourceHealthDashboard` at `/admin` |
| U4 — incremental discovery at mint (`mint-item.ts` calls `discoverConnections`) | flywheel-build-plan:83-91 | BUILT | grep confirms `mint-item.ts` imports `discoverConnections`/writes edges post-insert |
| U5 — L3 anticipatory targeting | flywheel-build-plan:93-97 | **TRACKED** | given backlog item; still BLOCKED on forward-participation (B1), doc itself says so |
| U6 — F5 theme briefs (migration 266) + L4 capability compounding | flywheel-build-plan:99-104 | BUILT (F5 only; L4 not attempted) | table-usage.txt: `theme_briefs` 9 rows, all hash-fresh per `wo20-assumption-register-spec.md:44`; L4 (scorer self-tuning from flags) never built — no consumer found |
| U7 — contract advance (role-generic prompt fix, forward-participation, A3 graph-into-briefs, two-homes version bump) | flywheel-build-plan:106-121 | **TRACKED** | given backlog item; still UNBUILT per `connection-redesign-and-build-scope-2026-08-29.md:219` ("wants WO-27/28's cleaner graph first") |
| U8 — skill↔code drift gate | flywheel-build-plan:123-129 | PARTIAL | `skill-contract-map.mjs`/`skill-drift-gate.test.mjs` exist but self-referenced only per prior-session grep; not confirmed wired as a named fitness function distinct from the suite glob |
| U9 — read-time relevance lens + connections on the five surfaces | flywheel-build-plan:131-136 | PARTIAL, then BUILT (miscounted by the plans themselves) | `RelevanceBadge`/`ItemConnectionsCard` confirmed wired on Regulations/Market/Research/Operations detail surfaces via `viewer-relevance.ts`; `connection-redesign-and-build-scope-2026-08-29.md:221` itself flags this as a **discrepancy** — "listed 'not started,' but the U9 components are ON MASTER and wired" — an internal plans-vs-plans miss, not a code miss |

## 2. System-level intelligence / Pillar F — governing doc: `system-level-intelligence-2026-08-09.md`

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| F1–F4 (theme detection, pivot/centrality, cross-surface convergence, trajectory) | whole doc | BUILT (later, via U1/U2) | same `cluster.mjs`/`theme-stats.mjs` evidence as U1 above; doc's own "dormant" framing was true only as of 2026-08-09, superseded by the same month's U1/U2 landing |
| F5 — system-level synthesis briefs | whole doc | BUILT | = U6 above |
| F6 — management loop (operator ratifies/dismisses cluster-level flags) | whole doc | UNBUILT | no distinct F6 consumer found beyond the existing `integrity_flags` admin queue, which is generic, not F6-specific |

## 3. Recursive-compounding discovery (L1–L4) — governing doc: `recursive-compounding-discovery-2026-08-10.md`

| Promise | State | Evidence |
|---|---|---|
| L1 — node growth at mint | BUILT | = U4 |
| L2 — cluster→gap→discovery loop | BUILT | = U2's gap detection into `integrity_flags coverage_gap` |
| L3 — trajectory→anticipatory | **TRACKED** (= U5) | still blocked on B1/forward-participation |
| L4 — capability compounding (recurring flag patterns become scorer-signal candidates) | UNBUILT | no ratification mechanism found; same gap as U6's L4 half above |

## 4. Cross-surface intelligence / connection layer redesign — governing doc: `cross-surface-intelligence-2026-08-09.md` + `connection-redesign-and-build-scope-2026-08-29.md`

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| WO-27A — remove dead `same_instrument` signal from `discover.mjs` | connection-redesign:113-124 | BUILT | grep: `discover.mjs:109` "same_instrument REMOVED (WO-27, 2026-08-29)" |
| WO-27B — delete dead `fetchXrefPairs`/`verification.ts`/`xrefPairs` fetch chain | connection-redesign:126-131 | BUILT (asserted by the doc's own later evidence; not independently re-verified this session beyond the WO-27A grep, low risk) | `discover.mjs` comment confirms WO-27 landed as one unit |
| WO-27C/D — correct `integrity_flags` A1 text, ADR-021 written | connection-redesign:132-145 | PARTIAL/UNCONFIRMED | not independently checked for the ADR file's existence this session |
| WO-28 — typed lineage edges (`implements`/`amends`/`depends_on`) via `entity-resolve.mjs` `classifyRelationship()`, plus `derogates_under` on the widened CHECK, plus the `mint-item.ts` news-duplicate CHECK-violation fix | connection-redesign:149-193 | BUILT | grep: `src/lib/entities/entity-resolve.mjs` exports `classifyRelationship`, comments cite "WO-28, ADR-021"; `research-lane-spec-from-repo.md:42` independently confirms 11 live typed edges (implements×5, amends×5, depends_on×1) |
| WO-29 — stored `instrument_family_key` | connection-redesign:194-201 | RULED-OUT (deliberately deferred) | doc's own text: "rejected for now," named revisit trigger (~50 resolved lineage pairs) not yet met |
| U9 close-out audit (correcting the board's stale "not started" record) | connection-redesign:221 | UNBUILT (paperwork item) | no evidence a corrected board entry was written; cosmetic, not a code gap |

## 5. Master execution plan v2 — governing doc: `master-execution-plan-2026-08-17.md`

| Promise | Line | State | Evidence |
|---|---|---|---|
| WO-1, WO-2 | 59 | BUILT (doc's own DONE claim, unusually corroborated — PR #467 merged, mig 265 applied) | not independently re-verified beyond doc's internal consistency; low risk, closed items |
| WO-3 (renderer, PR #470) | 60 | BUILT | superseded discussion in surface-rebuild-plan/connection-redesign treats it as landed; no contrary evidence |
| WO-4 (domain-coalesce mapper fix, `row.domain \|\| 1` → `?? undefined`) | 45, 60 | BUILT | doc states "EXECUTED 2026-08-18"; matches ingest-restart-sequencing's separate confirmation that the `domain: 1` hardcode class was fixed |
| WO-5 (orphan-field disposition: `instrument_identifier`, `trajectory_points`, `signal_band`, `marketData.currentPrice`) | 77-84 | PARTIAL → mostly BUILT via later rulings | `unblocking-the-five-2026-08-30.md` §3 rules all four (B1 split Yes-Regs/No-Market, B2 fold into WO-7, B3 keep, B4 re-point); B4 confirmed BUILT via `MarketIntelLedger.tsx` `priceStat` grep; B1-Regs and B2 not independently re-verified |
| WO-6/7/8 (flywheel tag-gap enrichment) | 61, 148 | UNBUILT | gated behind ⛔ operator tag-gap ruling per doc; no evidence of execution |
| WO-9 (Operations matrix, PR #471) | 62 | BUILT | `unblocking-the-five` and `operations-lane-spec-from-repo` both treat the matrix as shipped and build residual fixes (WO-10/21/22) on top of it |
| WO-12 (extend envelope columns onto `regional_data_facts`) | 86-104 | BUILT (schema); PARTIAL (no backfill) | migration 267 confirmed on disk (origin_class + envelope); `regional_data_facts` still 0/75 rows with `value_numeric` populated per `operations-lane-spec-from-repo.md:44-47` |
| WO-13 (Market re-point + B1=NO decision) | 105, market-lane-spec:34-193 | BUILT | grep: `MarketIntelLedger.tsx` reads `item.priceStat`, `types/resource.ts` carries `priceStat`, comment cites the removed `marketData.currentPrice` orphan |
| WO-14 (Market series board / "Sources tracked" rail) | 63, market-lane-spec:197-312 | BUILT | grep: `MarketIntelLedger.tsx:789` "Sources tracked (WO-14 residual)" section present |
| WO-15 (Research surface-population fetch fix) | 64, research-lane-spec:55-249 | BUILT | grep: `supabase-server.ts:902-932` comments explicitly cite "WO-15 fix", now uses `surfaceOf`-derived predicate not the bare `item_type='research_finding'` filter |
| WO-16 (`market_series` table + 4 producers, EU Oil Bulletin live, EEX/ECB/EIA stubs) | 105-114 | **TRACKED** (producers = "producers (ecb-fx/eia/eex stubs)" on given backlog) | table (`market_series`, migration 268) confirmed on disk; EU Oil Bulletin producer BUILT (implemented=true per registry), other three still documented stubs — matches TRACKED item verbatim |
| WO-16.2 (`published_price_statistics` fed from `market_series`) | 109-114 | RULED (feed, not retire) then partially wired | ruling recorded in connection-redesign:206; WO-13's `priceStat` decoration is the list-page half; the feeder/refresher itself (`refresh-published-price-statistics.mjs`) confirmed to exist per market-lane-spec:258 |
| WO-17 (Operations EU/US facts producers, Eurostat/BLS) | 116-120 | UNBUILT (kill-switched) | operations-lane-spec-from-repo.md:56-58: both producers confirmed `ENABLED=false` literal constants, never armed |
| WO-18 (emission_factors seeders, DESNZ/EPA) | 122-129 | PARTIAL | EPA fixture clean but not applied; DESNZ fixture `[UNCONFIRMED]` against primary source, never `--apply`'d; table confirmed 0 rows live (`emission_factors` in table-usage.txt is absent — table did not exist at earlier audit cut, later migration 258 created it; live count reconfirmed 0/2 across sessions) |
| WO-19 (`origin_class` on `intelligence_items`, backfill) | 131-141 | PARTIAL | column added (migration 267 confirmed); backfill CASE-mapping in `wo19-origin-class-backfill-mapping.md` still "DRAFT, awaiting operator ratification" as of its own text, and no evidence of ratification or execution found this session — population state of the column is UNCONFIRMED |
| WO-20 (assumption register) | 149 | PARTIAL | table BUILT as migration 271 `assumption_register.sql` (confirmed on disk, renumbered from the doc's proposed 269); backfill of the 10 catalogued constants and the `/admin` reader panel both explicitly deferred by the spec itself, not confirmed built |
| WO-21 (Operations region-card severity color bug) | connection-redesign context; operations-lane-spec:306-386 | BUILT | grep: `OperationsLedger.tsx:737` comment "WO-21: this used to render in the region's regulatory-severity hue" past tense, confirms the fix landed |
| WO-22 (Operations region grouping via `iso_codes` crosswalk, not regex) | operations-lane-spec:389-475 | BUILT | grep: `OperationsLedger.tsx:110-196` now carries `isoCodes`/`regions.iso_codes crosswalk` logic, comment "confirmed 2026-08-30" |
| WO-23 (watchlist `market_series` CHECK widening + code) | 143-146; market-lane-spec:315-476 | BUILT | migration `270_widen_org_watchlist_market_series.sql` confirmed on disk |
| WO-24 (Market carbon overlay, corridor-gated) | market-lane-spec:479-612 | PARTIAL | honest pending-frame confirmed BUILT (`MarketSignalDetailSurface.tsx` `PendingFrame` for corridor band); real overlay still gated on DESNZ verification (Gate 1) and corridor identity (Gate 2), both UNBUILT — no corridor table/column exists anywhere |
| WO-25 (Research theme-brief surfacing on detail page) | research-lane-spec:253-421 | UNCONFIRMED (not independently grepped this session) | plan states theme_briefs are BUILT/fresh but zero customer-facing consumer as of the plan's own writing (2026-08-30); not re-verified whether WO-25's own fix subsequently landed |

## 6. Unblocking-the-five rulings — governing doc: `unblocking-the-five-2026-08-30.md`

| Promise | State | Evidence |
|---|---|---|
| DESNZ primary-spreadsheet verification (Gate 1 for WO-18/WO-24) | UNBUILT | doc names the coordinator as the one to verify in-browser; no evidence this session that the verification ran or that `emission_factors` grew past 0-2 rows |
| Migration 270 (watchlist CHECK widen) | BUILT | confirmed on disk, matches doc's own "no window to schedule, apply now" ruling |

## 7. Ingest / classification integrity — multiple governing docs

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| Domain-leakage fix (4 hardcoded `domain: 1` sites) | ingest-restart-sequencing-2026-05-22.md; classification-backfill-plan-2026-05-22.md | BUILT | leakage-fix merged `4ca7fbd`, backfill migration 101 applied, both DONE 2026-05-23; further hardened by WO-4's mapper coalesce fix (2026-08-18) |
| REC-OBS-G — category-aware RPCs (`get_market_intel_items`/`get_research_items`/`get_operations_items`) wired into their pages instead of `item_type` heuristics | fix-d-scope-2026-05-23.md; ingest-restart-sequencing-2026-05-22.md; classification-backfill-plan-2026-05-22.md; spec-audit-synthesis-2026-05-23.md (4 separate citations of the same gap) | BUILT (resolved after all four docs were written) | grep: `src/lib/data.ts:850,877,892` define `getMarketIntelItems`/`getResearchItems`/`getOperationsItems`, each explicitly calling the category-routed RPC; all three consumed by their respective `page.tsx` — the "not wired" framing in all four source docs is now stale |
| Scheduled/restarted ingest (step e of the ingest-restart sequence) | ingest-restart-sequencing-2026-05-22.md | UNBUILT (deliberate) | audit's own §action-queue: "every data lane's schedule is commented out per the build-mode ruling" — matches TRACKED "schedule re-arm" item |
| Operations Facility sub-tab disposition (d=6 empty after Migration 101) | fix-d-scope-2026-05-23.md | SUPERSEDED | absorbed into the Operations rebuild per `spec-audit-operations-2026-05-23.md` and superseded again by WO-9's matrix rebuild (`surface-rebuild-plan-2026-08-11.md`) |

## 8. Ingest repair / extraction plan lineage

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| `crawl-rebuild-spec-2026-07-18.md` (entire) | header | SUPERSEDED | doc's own header: "SUPERSEDED 2026-07-18 as a build basis... DO NOT build from this document," names `ingest-repair-and-extraction-build-plan-2026-07-19.md` as successor |
| Phase R — repair (snapshot-writer, tier-discipline, `applyLedgerDiff` fail-closed, retire `plan-intake.ts`) | ingest-repair-and-extraction-build-plan-2026-07-19.md | BUILT | grep: `plan-intake.ts` no longer exists; `mint-item.ts` carries a `dryRun` opt with comment "F6 (plan-intake retired)"; `mint-item.ts` fail-closed error strings confirmed at multiple gates |
| Phase 1 — complete extraction (`enumerateSourceDocuments()`) | same doc | UNBUILT as literally named | grep: zero hits for `enumerateSourceDocuments` anywhere in src/scripts; functionally absorbed instead by the separately-authored `scrape-and-build-content-plan-2026-07-19.md`'s B1-B3 (portal-harvest, register-walk, feed-walk), which use different names for overlapping intake-completeness goals |
| Phase 2 — change-to-analysis (`applyDetectedChange()` using `compareFreshness`+`cheapVerifyClaims`) | same doc | BUILT under a different name | grep: `compareFreshness`/`cheapVerifyClaims`-equivalent logic lives in `src/lib/sources/change-sweep.mjs`, which self-identifies as "B4 of the scrape-and-build plan," not this doc — the functionality landed, the literal function name and governing doc did not |
| Phase 3/4 — discovery, reconciliation | same doc | UNCONFIRMED | not independently traced this session |
| B1 portal-harvest consumer | scrape-and-build-content-plan-2026-07-19.md | BUILT | `src/lib/intake/portal-harvest.ts` + test confirmed present |
| B2 register-API index walk | same | BUILT | `src/lib/sources/register-walk.mjs` confirmed present |
| B3 feed transport | same | BUILT | `src/lib/sources/feed-walk.mjs` confirmed present, consumed by `check-sources` worker route |
| B4 change-to-analysis consumer | same | BUILT | = Phase 2 above, `change-sweep.mjs` |
| `fetch-align-diff-engine` persistence adapter to `item_timelines`, fetch-half re-collection, canonical-pipeline wiring | fetch-align-diff-engine-2026-07-14.md | UNBUILT | doc's own DEFERRED list; not independently re-checked, no contrary evidence found |

## 9. Source registry / classification framework

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| Role→Tier mapping table (5-axis source-classification-framework) | source-classification-framework-2026-05-10.md | SUPERSEDED (self-annotated) | doc carries its own in-line "⚠ SUPERSEDED (2026-06-01)... was never implemented as the base_tier derivation" |
| Phase 2 — source-aware routing using Axis-5 distribution as tie-breaker | same doc | UNBUILT | grep for `axis5\|axis_5\|source_role.*routing` returns nothing |
| Phase 3 — 9 item-level schema fields (`in_force`, `effective_date`, `adopted_date`, denormalized `source_role`, `affected_modes`, `affected_verticals`, `jurisdictions[]`, `citation_to_primary_authority`, `axis5_distribution_at_classification`) | same doc | UNBUILT | none of the 9 fields found on `intelligence_items` via schema grep |
| SOURCE-TYPE-TAXONOMY-PROPOSAL (`source_type TEXT[]`, 11-value taxonomy, migration 049, backfill, `coverage-gaps.ts` refactor) | SOURCE-TYPE-TAXONOMY-PROPOSAL.md | UNBUILT | doc is explicitly "doc-only PR, no schema changes"; grep confirms zero `source_type` column anywhere; `src/lib/coverage-gaps.ts` still carries the literal comment "STOPGAP — the durable fix is a `source_type` taxonomy column" |
| W2.F monthly random-sample verification audit job (cron) | W2F-verification-pipeline.md | UNBUILT | no cron/script artifact found named for this; W2.G itself never materialized |
| False-positive tracking weekly report | same doc | UNBUILT | no report artifact found |
| `jurisdictions` entity table (11 entity types, full SQL given) | skill-refinements-prework-2026-05-15.md, "reference-jurisdictions" item | UNBUILT | grep confirms no `CREATE TABLE jurisdictions` in any migration; only a `regions` table (5 rows) exists, a different, smaller entity |
| `rule-character-normalization` backfill sweep (49/168 en/em dash occurrences in briefs) | same doc | UNCONFIRMED | not independently re-checked |
| `dispatch-2.5-writer-redistribution` 4 gap rule-files (incl. HIGH-severity `rule-cause-and-effect-chain`) | dispatch-2.5-writer-redistribution-prework-2026-05-15.md | UNCONFIRMED, likely out of audit's evidence scope | skill-content files are not covered by the code audit's file-verdict corpus |

## 10. Registry-to-ingestion handoff

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| P3 pattern + trigger for `pending_first_fetch` queue | registry-to-ingestion-handoff-design-2026-05-10.md | BUILT, but queue backlogged | table-usage.txt: `pending_first_fetch` 1,376 rows, matches audit §4's "operator decision required" backlog note |

## 11. W4 backfill / W5 cost projection

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| W4.A/B/C small backfill scripts | W4-backfill-plan.md | BUILT/executed (historical) | references PR #20 as landed; historical record, not a current gap |
| W5's 6 cost-recommendations (tiered scan cadence, hash-based regen, Haiku triage, prompt caching, jurisdiction-churn-capped refresh, cost telemetry in admin dashboard) | W5-cost-projection.md | UNCONFIRMED, partially plausible BUILT | not independently traced item-by-item this session; several (prompt caching, cost telemetry) are referenced as live elsewhere in the plans corpus (e.g. `cache_control` blocks in `/api/ask`), suggesting partial adoption, but not confirmed as a direct response to this doc |

## 12. Fleet / system remediation

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| Fleet cost control: 12 authorship shards → 1 daily worker, self-metering, charter versioning | fleet-cost-control-plan-2026-08-08.md | UNCONFIRMED (operational/process change, outside code-audit evidence) | not independently checked; `docs/runbooks/fleet-charters/` existence not verified this session |
| System remediation P0 security cluster (`admin_set_pause_state`, `gate_a_health`, `set_provenance_status` search_path, `create_org_for_self` escalation, capture-worker auth) + P0 capture 202-fix + P0 pipeline integrity (eraseStep/gate-A/provenance-flip-GUC) | system-remediation-plan-2026-08-09.md | BUILT (inferred) | none of these appear in the current (2026-08-31) full-read-audit's §2 DEFECTS list of 6 items — strong circumstantial evidence of closure, not independently grep-confirmed function-by-function this session |
| P1 dropped-error sweep, P1 correctness rulings, P2 hygiene | same doc | UNCONFIRMED | not independently checked |
| Phase 8 capabilities-inventory doc | same doc | UNCONFIRMED | not independently checked |

## 13. Community C5–C9

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| C5 feed (post/thread/group core) | C5-feed-spec.md | BUILT | table-usage.txt: `community_posts`, `community_groups` live with real row counts |
| C5 Phase D — reactions (`community_post_reactions` table + endpoint) | C5-feed-spec.md | **TRACKED**-adjacent, UNBUILT | grep: zero hits for `community_post_reactions` in migrations or src; matches audit's "12 never-ran / built-but-stub" class |
| C5 Phase D — soft delete (`deleted_at`) | C5-feed-spec.md | UNBUILT | grep: no `deleted_at` column on `community_posts` |
| C6 promote-to-intelligence | C6-promote-spec.md | BUILT | doc's "Status: Implemented (this PR)"; `PromotePostButton` + promote route confirmed by spec-audit-community |
| C6 Phase D — approval-handler linkage, "Promoted from community" attribution badge | C6-promote-spec.md | UNBUILT | spec-audit-community-2026-05-23.md §4 item 8 confirms: promote is "a one-shot copy, not a curatorial loop," no attribution badge on the receiving page |
| C7 notifications core | C7-notifications-spec.md | BUILT | migration 032 table live |
| C7 email/push channel delivery | C7-notifications-spec.md | **TRACKED** | given backlog item; table-usage.txt: `notification_preferences` 0 rows, `notifications` 0 rows |
| C8 moderation workflow core | C8-moderation-spec.md | BUILT | `ModerationQueue` confirmed live at `/community/moderation` |
| C8 `mute_user` Phase-D stub | C8-moderation-spec.md | **TRACKED** | given backlog item ("12 never-ran features" class); `community_group_members` still has no `muted_until` column |
| C8 `remove_post` hard-delete-only (no soft delete) | C8-moderation-spec.md | UNBUILT | same `deleted_at` absence as C5 |
| C9 realtime infrastructure | C9-realtime-spec.md | RULED-OUT | commit `3bf9b203`: "C9 realtime REMOVED per the no-half-built doctrine: realtime.ts + both hooks had ZERO importers... Returns as a deliberate build if usage warrants" |
| Community: org/employer context on post authors | spec-audit-community-2026-05-23.md §4 item 1 | UNBUILT | posts API confirmed to select only `id, full_name, avatar_url`, no org join |
| Community: author-identity credibility signals (`verifier_status` on posts API) | same, item 2 | UNBUILT | `VerifierBadge` component exists but wired to a field the posts API does not return |
| Community: topic-clustered cross-group discussion | same, item 3 | UNBUILT | no platform-level topic/tag schema on `community_posts`; only a private per-user sidebar bookmark table exists |
| Community: peer-org directory | same, item 4 | UNBUILT | no directory surface joining `organizations`+`org_memberships` for public browse |
| Community: expertise/specialism tagging on members | same, item 5 | UNBUILT | no `expertise_tags` field found |
| Community: trusted-peer DM | same, item 6 | UNBUILT (explicitly out of scope per code comment) | `CommunitySidebar.tsx` comment: "NO Direct messages section (out of scope for Phase C and D)" |
| Community: cross-surface "peers are discussing this" panel on Regulations/Market/Research/Operations | same, item 7 | UNBUILT | grep across those four surfaces for `community\|peer\|discussion` returns nothing substantive |
| Vendor directory | multi-tenant-foundation-prework-2026-05-15.md (shipped-per-spec claim); spec-audit-community item 10 | UNBUILT (spec/reality mismatch, deprecable per spec) | grep confirms zero `vendor`/`directory` code under `src/app/community`; spec's own "shipped" claim is stale |
| Sector-profile-driven Community group auto-seeding for new workspaces | spec-audit-community item 9; multi-tenant-foundation-prework | UNBUILT | new workspaces land on `NoWorkspaceLanding` with no auto group-seed |

## 14. Dead-code / category-E disposition

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| Category A.3 admin routes awaiting UI consumers (`/api/admin/sources/discover`, `recently-auto-approved`, `verify`) | dead-code-disposition-2026-05-21.md | UNBUILT | doc's own OPEN status, not independently re-verified this session |
| Category A.4 (RegulationDetailSurface "Workspace data pending", PageContext+AiPromptBar) | same | UNBUILT | doc's own OPEN status |
| `credibility.ts`/`critical-items.ts` DELETE (R2 approved) vs `src/components/credibility/` (7 files) still dead | remediation-and-weight-2026-08-10.md vs full-read-audit §4/§5 | **DISCREPANCY, resolved this session** | grep confirms BOTH `src/lib/dashboard/credibility.ts` + `critical-items.ts` (still present, referenced live by `DashboardHero.tsx`'s `criticalSnapshot` per spec-audit-dashboard-2026-05-23.md:106,121) AND `src/components/credibility/*.tsx` (7 files, a *different* path) — remediation-and-weight's "DELETED" claim refers only to the `.tsx` component family or is simply stale; the `.ts` lib files were never deleted and are in active use. Net: remediation-and-weight-2026-08-10's R2 claim is **inaccurate as a completion record**; treat `src/components/credibility/` as the still-dead item, matching audit §5 |
| TabBar / mobile nav | category-e-investigation-2026-05-21.md | UNBUILT (never wired) | zero JSX callsites confirmed by the investigation itself |
| `DueThisQuarter` widget+toggle+store-flag | same | UNBUILT (clean half-build) | all 3 pieces exist per the investigation but wiring between toggle and dashboard render was never built |
| `/events` route | spec-audit-user-chrome-2026-05-23.md | DEAD CODE, awaiting operator delete authorization | 308-redirects to a target (`/community/events`) removed by commit `9cd364f`; unreachable, no inbound links |
| `/profile` Sectors panel writes to inert per-user override layer (dashboard reads workspace-level instead) | spec-audit-user-chrome-2026-05-23.md §6 | UNBUILT (functionally inert) | `server-bootstrap.ts:42-46` composition layer never wired; matches the same bug class the onboarding wizard was rerouted to fix |
| Regulations `Add to watchlist` button (`false &&` guard) | spec-audit-regulations-2026-05-23.md | UNBUILT (dead JSX) | confirmed `false && <ActionButton>` at `RegulationDetailSurface.tsx:419-427` |
| Regulations `Your exposure` / `Lanes affected` hero stats | same | UNBUILT | hard-wired to `"—"`, no workspace-shipment data layer exists |
| Bulk-select watchlist (localStorage only, no server persistence) | same | PARTIAL | writes locally, no `/api` route, no cross-device read-back |

## 15. Multi-tenant foundation

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| profiles/user_profiles merge, Phase 3 table drop | multi-tenant-foundation-prework-2026-05-15.md | UNCONFIRMED | not independently re-checked this session whether `user_profiles` was actually dropped |
| Email-delivered invitations (currently copy-URL only) | same; spec-audit-user-chrome item 4 | **TRACKED** | matches given backlog "invitation-email" item; doc explicitly says "send" verb is stubbed to "create row + log" |
| Onboarding sector-taxonomy expansion beyond 6 highlighted niches | same | UNBUILT | spec-audit-user-chrome confirms wizard still ships the "6 highlighted + all sectors" two-tier model |
| LinkedIn import wizard step | same | BUILT (later than the doc's own framing) | spec-audit-user-chrome confirms live OAuth round-trip behind `LINKEDIN_CLIENT_ID`, landed at commit `a5db2fa`, after the prework doc called it a stub |

## 16. Dashboard widgets — governing doc: `wave1-track5-widget-implementation-plan.md` (superseded by `spec-audit-dashboard-2026-05-23.md`)

| Promise | State | Evidence |
|---|---|---|
| `DashboardWatchlist`, `DashboardByOwner`, `DashboardCoverageGaps`, `DashboardAwaitingReview`, `HousekeepingSection` | BUILT | all five confirmed live and rendered per spec-audit-dashboard-2026-05-23.md §2C; migrations `060_user_watchlist`/`061_coverage_gaps` (or their renumbered equivalents) confirmed via table-usage.txt (`user_watchlist` 1 row, `coverage_gaps` 2 rows) |
| Cross-surface widget scope (watchlist/owner covering all five surfaces, not just Regulations) | spec-audit-dashboard-2026-05-23.md §3.1 (M-5, M-6) | UNBUILT | `WatchlistItem` type union is `source\|reg\|signal` only; `DashboardByOwner` is Regulations-only |
| Dashboard: severity-label vocabulary (ACTION REQUIRED/COST ALERT/etc.) distinct from priority tiles | spec-audit-dashboard §3.1 | UNBUILT | no severity_label field consumed anywhere on the Dashboard payload |
| Dashboard: cause-and-effect chain per data point | same | UNBUILT | no structured field; chain is at most implicit in free text |
| Dashboard: per-surface credibility chip vocabulary switching by row | same (M-9) | UNBUILT | one Research-style chip set applied uniformly to all `WeeklyBriefing` rows regardless of source surface |

## 17. Build 8 — Research Q9 signals — governing doc: `build-8-research-surface.md`

| Promise | State | Evidence |
|---|---|---|
| 8.1 citation-count visibility, 8.2 tier rendering, 8.3 bias-tag surfacing, 8.4 recency-decay grouping on `/research` pipeline rows | UNBUILT | full-read-audit §4/§5: `src/components/credibility/` (CitationCountChip, RecencyChip, CredibilityBadge, BiasBadge, JurisdictionChip, SignalStrength, ProvenancePanel) confirmed still dead / zero customer-surface importers; matches audit's "~35 unwired modules" TRACKED class, this is the specific promise behind several of them |
| 8.5 coverage-matrix wiring | BUILT (later, as a separate effort) | migration 100 RPC confirmed live and consumed by `ResearchLedger.tsx`'s source-coverage rail, per `research-lane-spec-from-repo.md:46` |

## 18. Surface-rebuild-plan (2026-08-11) substrate fixes

| Promise | Line | State | Evidence |
|---|---|---|---|
| S1 — one surface guard on all four detail routes (`surfaceOf` check, 404 on mismatch) | §7 Phase 0.1 | BUILT | `research/[slug]/page.tsx` confirmed to 404 unless `canonicalSurface==='research'` per `research-lane-spec-from-repo.md:262-266`; pattern matches all four surfaces per the doc's own description |
| S2 — one population per page (row RPC and count RPC agree via `surfaceOf`) | §7 Phase 0.2 | BUILT | WO-15's fix (§5 above) is exactly this for Research; migration 269 `routing_rpcs_use_surface_of.sql` confirms the RPCs were repointed platform-wide |
| S3 — ~17 orphan fields, producer-or-deletion | §7 Phase 0.3 | PARTIAL | several closed via WO-5/WO-13 (marketData deleted), several still open (Regulations' `penaltyRange`/`costMechanism`/`enforcementBody` not re-verified this session) |
| S4 — per-page prose renderer (Market/Operations stop importing Regulations' `ProseSection`) | §7 Phase 0.5 | UNCONFIRMED | not independently re-checked |
| Phase 1 acceptance gate `scripts/verify/surface-acceptance.mjs` (fitness F26) | §7 Phase 1 | **TRACKED**-adjacent, UNBUILT | matches REC-1's independently-confirmed finding that this script does not exist |

## 19. Map, user-chrome, misc small items

| Promise | Governing doc:line | State | Evidence |
|---|---|---|---|
| Map surface itself | spec-audit-map-2026-05-23.md | BUILT, matches spec | doc's own verdict: "appropriately specified and built to match spec" — not a broken promise |
| Map: agent-availability geo layer, Community-group geo layer (both named "future") | same | UNBUILT (explicitly future, not a current promise) | no data shape exists for either |
| `/privacy` reachable only via Settings→Help, not from unauthenticated pages | spec-audit-user-chrome §9 | UNBUILT (operator decision pending) | confirmed only reachable one click deep in authenticated chrome |
| Settings: saved searches server-side sync (currently localStorage only) | spec-audit-user-chrome §7 | UNBUILT | doc confirms `saved_searches` L2 backend split never happened; matches audit's TRACKED "saved-searches" item |

---

## Counts by state

| State | Count |
|---|---|
| BUILT | 47 |
| PARTIAL | 14 |
| UNBUILT | 46 |
| SUPERSEDED | 3 |
| RULED-OUT | 2 |
| TRACKED (given backlog) | 9 |
| UNCONFIRMED (not independently settled this session) | 11 |

(132 distinct promises extracted after aggressive dedup across 64 documents; a "promise" here is one governed claim, not one row of raw text — the same WO cited by 3-4 docs collapses to one row citing its primary governing doc.)

## Ranked misses — UNBUILT/PARTIAL items NOT already on the given TRACKED list

Ranked by how load-bearing the gap is to the product's own stated differentiators, most consequential first.

1. **U7 contract advance never shipped** (§1) — the platform's own graph-feeds-briefs capability, the single item every later flywheel doc (recursive-compounding, cross-surface-intelligence, connection-redesign) treats as the payoff of everything else that DID ship. *[This one is explicitly on the given TRACKED list — listed here only to flag it is still the largest live gap, not as a miss.]*
2. **Community's core differentiator — peer org/employer context, cross-group topic discovery, peer directory, trusted-peer DM, cross-surface "peers are discussing this"** (§13) — 7 distinct UNBUILT items under one spec claim ("co-equal core value surface... the freight industry information-isolation problem"). This is the single largest concentration of undertracked misses in the whole corpus; none of these 7 appear on the given TRACKED list.
3. **Source-type taxonomy never built** (§9) — `coverage-gaps.ts` still carries its own "STOPGAP" comment naming the exact fix (`source_type` column) as durable-but-undone since the proposal doc; not on the TRACKED list.
4. **5-axis source-classification Phase 2/3** (§9) — axis-5 routing and 9 item-level schema fields, self-evidently unbuilt by grep, not on the TRACKED list.
5. **`emission_factors` carbon-factor seeding blocked on an unverified primary source (DESNZ)** (§5, §6, WO-18/WO-24) — a genuinely close-to-shippable item (EPA half is clean) stalled on one human verification step named explicitly in two different 2026-08-30 docs; not on the TRACKED list.
6. **Market corridor identity — zero schema anywhere links a Market item to `corridor_id`** (§5, WO-24 Gate 2) — discovered fresh by `market-lane-spec-from-repo.md` this cycle, blocks the carbon-overlay promise from ever being real; not on the TRACKED list.
7. **W2.F monthly verification-audit cron + false-positive weekly report** (§9) — named as a concrete governance mechanism, never materialized; not on the TRACKED list.
8. **Dashboard's cross-surface promise is one rail widget, not a rebalanced page** (§16) — Watchlist/ByOwner/WeeklyBriefing/WhatChanged/Supersessions are all still Regulations-only despite the platform's five-surface co-equality rule; not on the TRACKED list.
9. **Build 8 Q9 credibility chips on `/research` pipeline rows** (§17) — the specific promise behind several of the audit's generically-named "~35 unwired modules"; useful to have the named promise attached to the generic TRACKED bucket.
10. **`/profile` Sectors panel writes to a dead-end column** (§14) — a customer-visible no-op edit action, confirmed by direct code read, not flagged anywhere else.
11. **origin_class backfill ratification status unresolved** (§5, WO-19) — column exists, mapping drafted, no evidence of ratification or execution; ages daily per the doc's own "clock" framing; adjacent to but not identical to the given TRACKED items.
12. **`/events` dead route awaiting a one-line delete the operator has not yet authorized** (§14) — smallest item on this list, cheapest to close, still open.

---

## Coverage attestation

- Files in `docs/plans/`: **64/64 read in full** (every line, per the task's requirement), across this
  session and the pre-compaction portion of this lane's work.
- Total lines in `docs/plans/`: **~15,844** (per `wc -l` at task start).
- Evidence sources consulted: `full-read-audit-2026-08-31.md` (full read), `table-usage.txt` (full
  read, all 90 rows), plus targeted greps/reads against `dotfiles` branch `master` for every promise
  whose built-state the audit and table-usage did not settle on their own — approximately 60 distinct
  grep/read verification passes run this session against the live worktree.
- Known residual gaps in this register, disclosed rather than silently smoothed over: several
  "UNCONFIRMED" rows (W5's 6 recommendations, fleet-cost-control's operational change, multi-tenant's
  `user_profiles` drop, WO-25/WO-3/WO-27C-D's exact landing state) were read in full but not run
  through an independent grep verification pass this session, owing to the volume of the corpus;
  each is labelled UNCONFIRMED rather than asserted BUILT or UNBUILT, consistent with the task's
  "never trust a plan's own claim" instruction cutting both ways.
