# A2 — Customer Surfaces wiring audit (2026-09-04)

Scope: every route under `fsi-app/src/app` and component under `fsi-app/src/components` touched by a
commit since 2026-08-21 (`git log --since=2026-08-21 --name-only -- fsi-app/src/app
fsi-app/src/components`, 27 commits, cross-referenced against `_prs.txt`). Live counts are read-only
SQL against Supabase project `kwrsbpiseruzbfwjpvsp`, run 2026-09-04. Nav reachability is read from
`fsi-app/src/components/Sidebar.tsx`. No browser was opened; "renders" below means "the code path that
would render it is reachable and the query it depends on returns rows," not a rendered screenshot.

Global live counts referenced throughout (`[CONFIRMED]`, SQL, 2026-09-04):
`intelligence_items` 2766 total, all graded (`item_grade`: `record` 1695, `brief` 1071) · `item_forward_events`
1149 · `item_cross_references` 20401 · `item_supersessions` 11 · `published_price_statistics` 4 ·
`market_series` 2743 · `connection_themes` 21 · `theme_briefs` 9 · `region_dimension_coverage` 30 ·
`obligations` 1149. Per-surface `item_grade` split (`surface_of(item_type, domain)`, SQL): regulations
brief 873/record 1689, market brief 82/record 6, research brief 61/record 0, operations brief 52/record 0,
uncategorized brief 3.

Nav (`Sidebar.tsx` `PRIMARY_NAV`/`COMMUNITY_NAV`, `[CONFIRMED]` read): Dashboard, Regulations, Market
Intel, Research, Operations, Map, then a divider, then Community. Admin is not in the nav — footer
button, gated `userRole in {owner, admin}`. Every route this audit covers is reachable from this list
except `/community/discover`, `/community/directory`, `/community/benchmarks` which hang off
`CommunitySidebar` (confirmed present, not separately loaded — see Community section).

## Regulations: bands, IMMEDIATE-first ordering, band empty states

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| Four-band ledger (CRITICAL→IMMEDIATE / HIGH→ACTION / MODERATE→MONITOR / LOW→AWARENESS), priority-within-band sort | PR #501/#536/#537/#539 (wave 1–3) | `RegulationsLedger.tsx`, rendered by `/regulations` (`src/app/regulations/page.tsx`) | `RegulationsLedger.tsx:122-165` defines `BAND_ORDER`; counts sourced from the RPC bundle (`bandCount`, line 368) not client-filtered rows — `[CONFIRMED]` file read | customer surface (Regulations) | WIRED+USED | none found |
| `band-empty-state.ts` — honest "Loading N…" vs "No matching" copy | PR #572 (2f110fea, 2026-09-04) | `RegulationsLedger.tsx:65` imports `bandEmptyStateText` | Header of the file documents the exact production defect it replaces (`[CONFIRMED, live production, 2026-09-04 ~08:15 UTC]`, per the file's own citation) and has a co-located test `band-empty-state.npmtest.mjs`; import confirmed live in the ledger | customer surfaces | WIRED+USED | none — real bug fix, freshest PR in the window |
| PERF loading skeletons (`loading.tsx` × 5 routes) + PERF-2 `Promise.all` fan-out on regulations detail | PR #540/#542 | Next.js route segment convention | `[CONFIRMED]`: `find src/app -iname loading.tsx` returns `app/, regulations/, regulations/[slug]/, market/, market/[slug]/, research/, research/[slug]/, operations/, operations/[slug]/` (9 files — matches the Sidebar PERF-4 comment's claim of "five of these seven hrefs now have one"); `regulations/[slug]/page.tsx:160,175` shows two `Promise.all` calls | Regulations detail perf | WIRED+USED | none |
| PERF-4 prefetch removal (Sidebar `Link`s go back to framework-default prefetch) | PR #563 area / same wave | `Sidebar.tsx` `renderNavItem` | `[CONFIRMED]` code read: the file carries a ~50-line comment tracing the claim through `node_modules/next/dist/client/app-dir/link.js` and `segment-cache/scheduler.js` line numbers, verified against installed Next 16.1.6 | Cross-cutting nav perf | WIRED+USED | Evidence is a code-comment trace of `node_modules` source, not a measured before/after load-time run in this audit — believable given the citation but **not independently re-measured here** |

## Forward events — "Upcoming obligations" strip

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| `UpcomingObligationsStrip` / `UpcomingObligationsStripView` | PR #539 (e8dc50f8), mobile pass PR #544 | `/regulations` top strip (`app/regulations/page.tsx:105-120`) and near the connections card on `RegulationDetailSurface.tsx:460` | `item_forward_events` = 1149 rows live `[CONFIRMED SQL]`. Health endpoint exists specifically to catch this strip going silently empty: `src/app/api/health/surfaces/route.ts:181-221` counts `forward_events_visible_on_regulations` against the exact RLS predicate migration 274 checks. `ObligationRegister.tsx:63` cites "901+ rows live" as of its own writing; live count now 1149, i.e. grown since, not stale | customer surfaces (Regulations) — renders `population-turn` mint output | WIRED+USED | none — this is the one feature in this lane with a purpose-built health check guarding against silent regression |
| `ObligationRegister` + `ObligationRegisterFilterBar` (full obligation table, not just the strip) | PR #536 (`obligations` table, migration 290)/#544 mobile table-to-cards | `RegulationDetailSurface.tsx` | `obligations` table = 1149 rows `[CONFIRMED SQL]`, 1:1 with `item_forward_events` (same underlying extraction, migration 290 derives `obligations` from it — `derive-obligations.mjs` maintenance step, PR #537) | Regulations surface | WIRED+USED | none |

## Connections card (item_cross_references) and relevance

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| `ItemConnectionsCard` (shared right-rail card, supersedes per-surface `LinkedItemsCard`) | Predates the window structurally but is the render target every detail surface in this window was rewired to (`RegulationDetailSurface.tsx`, `MarketSignalDetailSurface.tsx`, `ResearchFindingDetailSurface.tsx`, `OperationsDetailSurface.tsx` all appear in the changed-file list, PR #536-#544) | All four intelligence detail surfaces | `item_cross_references` = 20401 rows `[CONFIRMED SQL]`; `supabase-server.ts:2966` reads `item_cross_references` inside `fetchIntelligenceItem`; `ItemConnectionsCard.tsx` header states it is "the single home for rendering a connection row on ANY of the four intelligence surfaces" | population-turn (connection discovery) → customer surfaces | WIRED+USED | none |
| `RelevanceBadge` (read-time relevance lens) | Not in the 2026-08-21+ changed-file list — pre-existing, unchanged this window | Item detail pages | Not independently re-verified this lane (out of window) | customer surfaces | not in scope — **not audited** (no file under it changed since 2026-08-21) | flagged only so the coordinator doesn't assume A2 covered it |

## Credibility / tier chips and record-grade badge

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| `CredibilityChipAuthority` / `CredibilityChipEvidence` / `CredibilityChipShared` + `credibility-grade-modifiers.mjs` | PR #536 (d60124b9) | `ResearchLedger.tsx`, `app/research/page.tsx` only | `[CONFIRMED]` grep: these three chip files and their consumers are used **only** on the Research surface — not Regulations/Market/Operations | Research surface (customer-facing GRADE ledger) | WIRED+USED (Research only) | Not present on the other three intelligence surfaces — may be intentional (Research-specific credibility framing) but nothing in the code documents that as a deliberate scope line the way `RecordGradeBadge`'s header does (see next row); coordinator should confirm with operator whether this is a gap or a deliberate Research-only feature |
| `RecordGradeBadge` (record-vs-brief label, migration 278) | PR #563/#567 (RECORD-SURFACE lane, 2026-09-04 reword) | `RegulationDetailSurface.tsx`, `MarketSignalDetailSurface.tsx`, `ResearchFindingDetailSurface.tsx` — **not** `OperationsDetailSurface.tsx` | `[CONFIRMED]` file header states explicitly: "the three surfaces this lane wired it into." `grep -c RecordGradeBadge` on `OperationsDetailSurface.tsx` = 0. Live data: Operations currently has 0 `record`-grade items (all 52 Operations items are `brief` grade, SQL), so the omission has **no live customer-facing effect today** — but the operator ruling the badge exists to satisfy ("record-grade items MAY appear on customer surfaces, as long as they are LABELED") is written surface-agnostically, so this is a latent gap that will surface silently the first time an Operations item is minted at `record` grade | population-turn (record-grade mint under THE GATE) → customer surfaces | WIRED+USED on 3/4 surfaces | Operations detail surface has no record-grade label path; dormant today only because no Operations item has that grade yet |

## Series board / published price statistics (Market Intel)

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| `MarketSeriesBoard` (`fetchMarketSeriesBoard` → `market_series` table) | PR #490 (Wave 11)/#536 un-silenced, #539 spec-09 CSS | `/market` (`app/market/page.tsx:138`) | `market_series` = 2743 rows `[CONFIRMED SQL]`, `fetchMarketSeriesBoard` in `supabase-server.ts:2761` reads it directly, live | market-intel customer surface — renders `market_series` producer output (Stage 7) | WIRED+USED | none — this is the one Market numeric channel that is genuinely populated |
| `PriceBoard` / `fetchPriceStatsByItemIds` (`published_price_statistics`) | PR #486 (un-silenced), PR #517 (WO-13 B4 list-page decoration) | `market/[slug]/page.tsx`, `MarketSignalDetailSurface.tsx`, and list-page batch decoration via `data.ts:850-865` (`cachedMarketPriceStats`) | `published_price_statistics` = **4 rows** `[CONFIRMED SQL]`. Root cause confirmed in code, not inferred: `scripts/producers/market/refresh-published-price-statistics.mjs` header states the WO-16.2 ruling held the refresher at zero output *by design* — `SERIES_ITEM_MAP` (`src/lib/market/series-item-map.mjs`) has every oil-bulletin series `item_id: null` ("UNRATIFIED... pending ruling R-D"), so "this script currently plans and writes ZERO rows regardless of `--apply`; the unratified map IS the switch until an operator ratifies an entry." | market-intel — reconciliation step of `population-turn` (WO-16, market_series → published_price_statistics) | WIRED, DATA GATED (not a bug — an explicit, named, unmet operator ratification gate) | The 4 live rows are earlier/manual, not from this producer. **This is an open operator decision (R-D: which market_series entries to ratify as customer-facing price points), not an engineering gap** — flag for the coordinator to route to the operator rather than to a build lane |
| `MarketComparativeRibbon`, `SurchargeAuditPanel`(view split) | PR #517/#539 | `/market` and `MarketIntelLedger.tsx` | Ribbon reads the same `fetchMarketSeriesBoard` payload (`MarketComparativeRibbon.tsx:7` header) — no separate query | market-intel | WIRED+USED (rides on market_series' 2743 live rows) | none |

## Market Intel — spec-09 numeric panels (OEM roadmap, rerouting, surcharge audit)

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| `OemRoadmapPanel`/View, `ReroutingPanel`/View, `SurchargeAuditPanel`/View | PR #539 (Wave 3, spec-09) | `MarketIntelLedger.tsx` | Tables: `oem_tech_roadmaps` 0 rows, `reroute_events` 0 rows, `surcharge_audits` 0 rows `[CONFIRMED SQL]`. Producers exist (`scripts/spec09/oem-roadmap-producer.mjs`, `reroute-producer.mjs`, `surcharge-audit-producer.mjs`) and each is documented, per-table, in `scripts/spec09/SOURCES.md` as shipping 0 rows **by design** — e.g. surcharge_audits needs a customer-uploaded carrier invoice (no upload flow exists), OEM roadmaps require parsing free-text press releases which the lane's $0/no-LLM rule forbids, reroute_events needs a second `corridor` entity that doesn't exist yet in the spine | market-intel (source-sweep→population gap, honestly named) | WIRED, correctly renders honest-empty; DATA SOURCING GAP is self-documented, not silent | Every one of these gaps is already named in `scripts/spec09/SOURCES.md` with a specific blocking reason (customer upload flow, LLM-cost rule, missing spine entity) — nothing to add except: no dispatch/registry ever runs these producers even on the $0 subset that IS available (`reroute_events`' "entity spine, read-only" partial path) |

## Operations — cross-region matrix and spec-09 physical-asset panels

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| `RegionDimensionMatrix` | PR #484 (e56e540e), mobile reflow PR #544 | `OperationsDetailSurface.tsx` | `region_dimension_coverage` = 30 rows `[CONFIRMED SQL]`, live | Operations customer surface | WIRED+USED | none |
| `GridQueuePanel`, `DqiPanel`, `AuxiliaryEnergyPanel`, `EudrCustodyPanel` (+ views) | PR #539 (Wave 3, spec-09) | `OperationsItemsView.tsx` / `OperationsLedger.tsx` | Tables: `grid_connection_queues` 0, `tce_data_quality` 0, `auxiliary_energy_profiles` 0, `eudr_plot_claims` 0 (`[CONFIRMED SQL]`, all four). Every panel's fetcher (`fetchRows`, `getServiceSupabase().from(...)`) is real and reads the correct table name — this is a data-population gap, not a broken query. `scripts/spec09/SOURCES.md` documents each: DQI and auxiliary-energy profiles are customer/shipment-specific facts with no public bulk source (by nature, not oversight); grid connection queues have no confirmed $0 demand-side feed (only generation-side feeds exist, and the lane explicitly refused to conflate the two as fabrication); EUDR plot claims are filed per-consignment through EU TRACES, not bulk-downloadable | Operations (source-sweep gap, honestly named) | WIRED, correctly renders honest-empty; DATA SOURCING GAP self-documented | Same category as the Market spec-09 panels above — built, wired, tested against real tables, zero rows by a named and defensible sourcing constraint, not dispatched even for the identified partial paths |
| `AutomateVsHireCalculator` (Capacity investment estimate) | PR #530/#517 | `/operations` (`app/operations/page.tsx`) | `[CONFIRMED]` in changed-file list; commit message states "run #10 landed (39/39, 92 live)" — a self-reported test/measurement claim from the PR, not independently re-run in this lane | Operations customer surface | WIRED+USED (per PR's own claim; not independently re-verified) | none found; flag only that the "92 live" figure is asserted by the commit message, not re-measured here |

## Research — pipeline/coverage, credibility ledger, theme strip

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| `ThemeStrip` (`connection_themes` + `theme_briefs`) | PR #544/#484 area | `ResearchFindingDetailSurface.tsx` / `/research` | `connection_themes` = 21 rows, `theme_briefs` = 9 rows `[CONFIRMED SQL]` — live, non-trivial | population-turn (connection discovery → tags) → Research surface | WIRED+USED | none |
| `fetchResearchPipelineRows` (surfaceOf-based admission, WO-15 fix) | PR #486 (99fe8061) | `/research` page (`app/research/page.tsx`) | Code comment documents the exact bug fixed: `.eq("item_type","research_finding")` undercounted by 7 rows (31 vs true 38) vs `surfaceOf()`'s real admission rule; SQL run this lane against `surface_of(item_type, domain)` confirms `research` surface = 61 items live today, and the SQL function exists and is callable — i.e. the DB-side twin this comment claims (migration 148) is real, not just asserted | Research surface | WIRED+USED | none |
| `AiPromptBar` (contextual assistant prompt) | PR #544 | `RegulationDetailSurface.tsx`, `MarketSignalDetailSurface.tsx` — **not** `ResearchFindingDetailSurface.tsx` or `OperationsDetailSurface.tsx` | `[CONFIRMED]` grep: 0 matches in both files. The global `AskAssistant` chat (mounted once in `AppShell.tsx` via `layout.tsx`) is present on every route regardless, so the Assistant itself is reachable everywhere — this gap is specifically the contextual per-item prompt suggestions, not the Assistant's overall reachability | customer surfaces (population-turn → connections/tags feeding assistant context) | WIRED+USED on 2/4 detail surfaces | Research and Operations detail pages lack the contextual `AiPromptBar` that Regulations and Market have; no comment in either file explains this as deliberate |

## Community — what actually seeds today (operator-flagged item)

The operator's ruling today: *"community should not be populated with rooms for every topic; people
start rooms, rooms don't already exist; regions exist."* Findings, cited:

**What is live right now** — `[CONFIRMED SQL]`:
- `community_groups` = **7 rows**. These are the 7 fixed **regional** rooms (`room-global`, `room-eu`,
  `room-us`, `room-uk`, `room-apac`, `room-latam`, `room-meaf`), created 2026-07-07 (predates the audit
  window) by `scripts/seed-community-regional-rooms.mjs`, one row per region, matching the hardcoded
  `ROOMS` vocabulary in `src/lib/community/rooms.ts` exactly (slug-for-slug). This is region seeding,
  consistent with the operator's "regions exist" half of the ruling.
- `community_topics` = **0 rows**. `community_topic_groups` = **0 rows**.
- `community_member_profiles` = **0 rows** (nobody has completed corporate-email verification yet — the
  route exists and is correct, PR #539/#563, just unused so far).
- `community_benchmark_instruments` = 3, `community_benchmark_responses` = 0, `community_posts` = 0,
  `post_promotions` = 0. `community_group_members` = 1 (one seed-owner membership in `room-global`).

**What is built but NOT run, and is exactly the "topic rooms" pattern the operator ruled against today:**
`scripts/seed/community-topics-seed.mjs` (tested, real) defines a fixed **7-topic taxonomy** ("ETS & FuelEU
Maritime," "SAF & CORSIA," "CBAM & customs carbon," "ESG disclosure (CSRD/ISSB)," "Fleet & fuels
technology," "Fine art & live-events logistics," "Regional operating costs") and links each to the
regional rooms via `community_topic_groups`. `scripts/maintenance/community-topics-seed.mjs` is a MAINT
dispatch wrapper for it, added PR #536 (2026-09-02), whose own header states: *"nothing ever dispatched
it. Live count: 0 community_topics rows. This wrapper is that dispatch, not a reimplementation."*
`[CONFIRMED]`: neither script appears in any maintenance runner registry this lane could find (no
`run-all`/index file references either path outside their own test files) — it has never been fired.

**A second, structural finding beyond "never run": even if dispatched, it would not do what "seed topics
for everyone" implies.** `EntityDiscoveryPanel.tsx`'s own header (the component actually driving
`/community/discover`'s topic-discovery UI) documents this directly: *"this platform's only cross-group
grouping concept is `community_topics` (migration 031), and it is structurally per-user/private (RLS:
`owner_user_id = auth.uid()` on every policy) — it cannot back a shared, discoverable topic surface."*
The dispatch wrapper resolves a single owner (first platform admin, or first profile row) and writes the
7 topics under that one user's `owner_user_id` — so even applied, the seeded topics would be invisible to
every other user under RLS, not a shared "topic room" any member could see. The actual `/community/discover`
experience already routes around `community_topics` entirely, using spine-entity-bound thread lookup
(`GET /api/community/entities/[entityId]/threads`) instead — labelled `[INFERRED]` by the component's own
header.

Spec citation (`docs/specs/05-community.md` §5, component 9): *"Working groups and forums with region and
sector structure, seeded from `sector_profile` on workspace creation."* §7 (gap section) independently
confirms: *"sector-driven group seeding are the gaps already named in platform-intent and remain open."*
So the spec itself calls for seeded structure but the *sector* half was never built (no `sector_profile`
seeding path exists in this repo at all — only the regional-room half shipped), and the one artifact that
comes closest to "seed a room for every topic" is untested-in-production, dispatched to nobody, and
structurally can't be shared even if run.

**Recommendation for the coordinator to put to the operator:** the current live state (7 region rooms,
0 topic rooms) already matches the operator's ruling as stated. The risk is the dormant
`community-topics-seed` mechanism — it should be explicitly retired (not just left un-dispatched) if the
operator's ruling stands, since a future lane could "complete" PR #536's own stated intent ("nothing ever
dispatched it... this wrapper is that dispatch") and run it, silently violating today's ruling. Either
delete both scripts or add a loud comment/gate citing this ruling.

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| Regional rooms (`community_groups`, 7 rows) | Pre-window (2026-07-07), UI wave PR #539/#537 | `/community`, `CommunitySidebar.tsx`, `/community/discover`, `/community/directory` | 7 rows live, matches `src/lib/community/rooms.ts` vocabulary `[CONFIRMED SQL + code]` | customer surface (Community) | WIRED+USED | none — matches operator's "regions exist" |
| `community-topics-seed` (7 fixed topic taxonomy) | PR #536 dispatch wrapper (2026-09-02); underlying script pre-window | Not dispatched by anything | `community_topics`=0, `community_topic_groups`=0 rows; wrapper's own header: "nothing ever dispatched it" `[CONFIRMED]` | Would-be Community surface | DESIGNED-ONLY / BUILT-NOT-WIRED (never dispatched) — and structurally mismatched (per-user RLS) even if it were | Operator-relevant: this is the mechanism that would violate today's "no pre-seeded topic rooms" ruling if ever dispatched. Recommend explicit retirement, not just continued non-dispatch |
| `EntityDiscoveryPanel` (actual topic-discovery UI, entity-bound) | PR #539 | `/community/discover` | Reads `community_group_members`, `community_group_invitations`, spine entities via `getEntityThreads` API; "follow" persisted to `localStorage` only (no server-side subscription — documented in-file as deliberate) | Community surface, entity-bound (spec 05 §5 component 2) | WIRED+USED (as the de facto topic mechanism) | Follow/digest is per-device only, not durable/cross-device — named in the component's own header, not hidden |
| `BenchmarksPanel` / `community_benchmark_instruments` | PR #536/#539 | `/community/benchmarks`, `community/[slug]/page.tsx` | 3 instruments live, 0 responses yet `[CONFIRMED SQL]` | Community (spec 05 §5 component 4, "anti-empty-room mechanism") | WIRED, DATA THIN (0 responses) | Anti-empty-room mechanism itself currently has nothing to show — matches spec §7's own gap note that most of §1-§4 (antitrust guard, verified-pseudonymous identity beyond corporate-email, the full 5-gate promotion machine) is "absent" |
| Corporate-email verification (`/api/community/profile/verify`) | PR #536/#539/#552 | `ProfileForm.tsx`, `BenchmarksPanel.tsx` refusal link | Route logic confirmed correct (checks `profiles.email` domain against `FREE_MAIL_DOMAINS`); `community_member_profiles` = 0 rows — nobody has completed it | Community (spec 05 §5 component 1 precondition) | WIRED, NOT YET USED (0 live verifications) | Not a defect — feature is new and unexercised, not broken |

## Item detail pages (cross-surface)

All four intelligence surfaces (`regulations/[slug]`, `market/[slug]`, `research/[slug]`,
`operations/[slug]`) were rewritten across PR #536-#544 onto the same shared shell pattern:
`ItemConnectionsCard` for connections, `WatchButton` for watchlisting, `RecordGradeBadge` on 3/4 (see
above), `AiPromptBar` on 2/4 (see above), plus the PERF loading/Promise.all work. `WatchButton` usage
confirmed `[CONFIRMED grep]` on all four detail surfaces plus `MarketSeriesBoard.tsx` and
`app/operations/AutomateVsHireCalculator.tsx`; `fetchWatchlist`/`/api/watchlist` route exists and was
touched in PR #536/#496/#551 (pagination/ordering fixes). No live row count was pulled for the watchlist
table itself (per-user data, not meaningfully summarizable as a platform-health count) — **not verified**
beyond code-path presence.

## Intelligence Assistant

| Component | Built (PR, date) | Invoked by | Evidence of use | Loop stage | Verdict | Gap |
|---|---|---|---|---|---|---|
| Global `AskAssistant` (`/api/ask`) | Pre-window base, touched PR #485/#478 (spend gate, retired-scope pin) | `AppShell.tsx` via `layout.tsx` — every route | `src/app/api/ask/route.ts` is 633 lines, present; `d3c6e620` (PR #478, pre-window edge but listed) hardens a "fail-closed spend gate" and "retired-scope-vocabulary pin" — both framed in the commit message as "attack-proven" fixes, not speculative hardening | customer surfaces (assistant reads across the corpus, cites `item_cross_references` per `system-prompt.ts`) | WIRED+USED | Contextual `AiPromptBar` gap noted above (Research/Operations detail lack it); the global chat itself is universally reachable |

## Ranked list of gaps

1. **Community topic-seed mechanism is built, undispatched, and directly contradicts today's operator
   ruling if ever run.** `scripts/seed/community-topics-seed.mjs` + `scripts/maintenance/community-topics-seed.mjs`
   would seed a fixed 7-topic taxonomy the moment someone dispatches the MAINT step — exactly the
   "rooms for every topic" pattern just ruled out. It is also structurally broken for that purpose
   (topics are per-user under RLS), so even a well-intentioned "let's finish PR #536's stated intent"
   move would ship something that doesn't work as a shared room. **Action: explicit operator ruling to
   retire (not just leave dormant) or repurpose.**
2. **`published_price_statistics` is gated behind an unratified operator decision (R-D: which
   `market_series` entries become customer-facing price points), not a bug** — but nothing on the Market
   surface currently tells the operator this gate exists and is the reason the price board is thin (4
   rows against 2743 `market_series` observations). Worth surfacing as an open decision, not an
   engineering backlog item.
3. **Nine spec-09 physical/financial-asset tables ship 0 rows across Operations and Market by explicit,
   documented $0-sourcing constraints** (customer-upload flows that don't exist yet, no-LLM rule blocking
   press-release parsing, missing spine entities). This is honestly self-documented in
   `scripts/spec09/SOURCES.md`, so it is not a silent gap — but it means 7 built, tested, wired panels
   (`GridQueuePanel`, `DqiPanel`, `AuxiliaryEnergyPanel`, `EudrCustodyPanel`, `OemRoadmapPanel`,
   `ReroutingPanel`, `SurchargeAuditPanel`) render honest-empty on every live page load today.
4. **`AiPromptBar` (contextual assistant prompt) is on Regulations and Market detail pages but not
   Research or Operations**, with no comment explaining the asymmetry. Low severity (the global Assistant
   is reachable everywhere) but looks like an incomplete rollout rather than a decision.
5. **`RecordGradeBadge` is wired into 3 of 4 intelligence detail surfaces, explicitly excluding
   Operations** (the component's own header says "the three surfaces this lane wired it into"). Currently
   inert because Operations has 0 record-grade items live, but the operator's own labeling requirement
   ("record-grade items MAY appear on customer surfaces, as long as they are LABELED") is surface-agnostic
   — this will surface silently the first time an Operations item is minted at record grade.
6. **Credibility chips (`CredibilityChipAuthority`/`Evidence`) are Research-only**, not present on
   Regulations/Market/Operations. Unlike the RecordGradeBadge gap, nothing in the code frames this as a
   deliberate scope decision — worth a one-line operator confirmation that this is intentional.

## What could not be confirmed

This lane did not open a browser (per instructions), so nothing here confirms actual rendered pixels,
client-side error states, or auth-gated flows beyond what server-side code and live-table row counts
imply. The PERF-4 prefetch claim in `Sidebar.tsx` is a code-comment trace through `node_modules/next`
source rather than a measured load-time result — it reads as correct on inspection but was not re-timed.
The `AutomateVsHireCalculator`'s "run #10, 39/39, 92 live" claim is the PR author's own self-report, not
independently re-run. Per-user data (individual watchlist contents, individual community follow lists in
`localStorage`) cannot be meaningfully summarized by a platform-wide SQL count and was not sampled.
Finally, whether the `AiPromptBar`/`RecordGradeBadge`/`CredibilityChip` surface asymmetries reported above
are deliberate, undocumented decisions or genuine oversights was not resolved from code alone — each is
flagged for the coordinator to route to the operator rather than asserted as a defect.
