# Caro's Ledge, Surface Functional Purpose Audit

**Date:** May 24, 2026
**Phase:** Remediation Dispatch v3 Phase 1.5
**Scope:** Every customer-facing surface plus /admin
**Method:** For each surface, enumerate purpose, user goals, required user flows. For each flow, mark PRESENT, PARTIAL, MISSING with code-level evidence. Disposition per gap: BUILD (new), WIRE (existing code needs connection), STRIP (existing code should be removed), DEFER (schema or external dependency), VERIFY (state unclear).

**Companion document:** [comprehensive-site-audit-2026-05-25.md](./comprehensive-site-audit-2026-05-25.md). This doc is the **required-functionality-vs-present-functionality** lens (does the surface contain the flows its purpose demands?). The May 25 doc is the **present-functionality-vs-working-functionality** lens (do the elements that exist on the page actually do anything?). Both lenses, both needed.

**Headline finding:** the May 24 Community rebuild this session **regressed pre-existing compose chrome.** PostComposer.tsx, ReplyComposer.tsx, PostList.tsx, the per-group thread route `/community/[slug]`, the group-discovery route `/community/browse`, and the complete posts/groups/invitations/moderation/notifications/search API surface all exist in code, but the new CommunityView omitted the CTAs that exposed them. Many Community "BUILD" items in the dispatch resolve to **WIRE-back-to-existing-component**, not new construction. The same audit lens should be applied before every Phase 4 commit.

---

## 1. `/` Dashboard

**Purpose** (per platform-intent SKILL Section 3, Cross-Cutting Capabilities): "Triage view surfacing what is new, important, and flagged across the five intelligence surfaces. Customer's first stop on each session."

**User goals**
1. See what changed across all surfaces since last visit
2. See what's most urgent right now (deadlines, action items)
3. See what's flagged (integrity, attention)
4. Jump from a triage item to its source surface
5. Customize what the dashboard shows (per-section visibility)
6. See coverage gaps at a glance

**Required user flows**

| # | Flow | Required for |
|---|---|---|
| 1 | Land on / and see today's digest | Goal 1, 2, 3 |
| 2 | Click an item in "What changed" → navigate to source detail | Goal 4 |
| 3 | Click a critical item → navigate to source detail | Goal 4 |
| 4 | Toggle dashboard cards on/off (Settings → Dashboard) | Goal 5 |
| 5 | See coverage gaps with link to gap detail | Goal 6 |

**Current state** (per browser audit + code grep)

| # | State | Evidence |
|---|---|---|
| 1 | PRESENT | Dashboard renders; "3 inside 14 days" hardcode confirmed stripped per Section E audit |
| 2 | VERIFY | Items in WhatChanged render but click-through behavior unverified |
| 3 | PRESENT | DashboardHero critical-snapshot wired |
| 4 | PARTIAL | Settings Dashboard tab renders DashboardSettings but per Settings audit it's a duplicate (same content as General + Exports) |
| 5 | PRESENT | DashboardCoverageGaps component exists |

**Dispositions**

| # | Disposition |
|---|---|
| 1 | PASS |
| 2 | VERIFY, then WIRE if click-through missing |
| 3 | PASS |
| 4 | DEFER (component split) per Settings audit |
| 5 | VERIFY link target |

**Count reconciliation gap** (browser audit): Dashboard masthead "645 / 144", right rail "637", per-surface mastheads don't reconcile. **DEFER to Phase 2A operator decision on count derivation architecture.**

---

## 2. `/regulations` index

**Purpose** (platform-intent SKILL Section 3.1): "Binding regulatory intelligence. Laws, agency rules, court decisions, treaties, rulemaking outcomes."

**User goals**
1. Browse the regulatory corpus
2. Filter by priority, topic, region, mode, sector, confidence
3. Sort by deadline, priority, recency, alphabetical, confidence
4. Search by title, jurisdiction, tags
5. Bulk select for export or watchlist
6. Drill into a specific regulation
7. Watch regulations for change notifications
8. Add notes / annotations
9. Set deadline reminders
10. Export filtered results

**Required user flows**

| # | Flow | Required for |
|---|---|---|
| 1 | Land on /regulations and see Kanban capped at 8 per column | Goal 1 |
| 2 | "Open all N" expands a column inline | Goal 1 |
| 3 | Filter by priority chip toggles | Goal 2 |
| 4 | Filter by topic / region / sector / confidence | Goal 2 |
| 5 | Sort by Newest / Priority / Confidence / A-Z | Goal 3 |
| 6 | Search returns matching regulations | Goal 4 |
| 7 | Bulk select + export TSV / add to watchlist | Goal 5 |
| 8 | Click card → /regulations/[slug] detail | Goal 6 |
| 9 | Add a regulation to watchlist | Goal 7 |
| 10 | Add notes to a regulation | Goal 8 |
| 11 | Set deadline reminder | Goal 9 |
| 12 | Export filtered set as CSV / PDF | Goal 10 |

**Current state**

| # | State | Evidence |
|---|---|---|
| 1 | PRESENT (post Phase 1) | RegulationsSurface.tsx:1094-1237 expandedColumns + slice(0,8) |
| 2 | PRESENT | Open All button code in RegulationsSurface.tsx |
| 3 | PRESENT | Priority filter functional |
| 4 | PARTIAL | REGION filter row renders empty (browser audit) |
| 5 | PARTIAL | Newest + Confidence produce same ordering as Priority (browser audit). Confidence ordering impossible because every record is "Unclassified" |
| 6 | PRESENT | Search input functional |
| 7 | PRESENT | BulkSelectBar implemented |
| 8 | PRESENT | Cards link to /regulations/[slug] |
| 9 | MISSING | No watchlist UI; per dead-code audit "watchlist persistence pending" was stripped from WatchlistSidebar |
| 10 | MISSING | No notes/annotations UI |
| 11 | MISSING | No reminder UI |
| 12 | PARTIAL | BulkSelectBar has "Export TSV"; no PDF / CSV options |

**Dispositions**

| # | Disposition |
|---|---|
| 1-3, 6-8 | PASS |
| 4 | WIRE (populate REGION chips from TIER1_PRIORITY_ISOS) |
| 5 | WIRE (implement Newest = sort by `added` desc; Confidence = sort by authority_level) OR STRIP the dead options |
| 9 | BUILD (depends on watchlist table; DEFER if schema absent) |
| 10 | BUILD (depends on notes table; DEFER) |
| 11 | BUILD (depends on reminder infrastructure; DEFER) |
| 12 | BUILD or STRIP (TSV exists; PDF/CSV are scope decision) |

---

## 3. `/regulations/[slug]` detail

**Purpose**: Deep read on one regulation. Customer assesses obligations, exposure, action timeline.

**User goals**
1. Understand what the regulation requires
2. Assess my workspace's exposure
3. See the timeline (effective dates, deadlines)
4. Review sources (tier, citation, recency)
5. Track changes over time (changelog)
6. See related regulations (cross-references, supersessions)
7. Share / export the brief
8. Add to watchlist
9. Assign action to team member
10. Set personal deadline reminder

**Required user flows**

| # | Flow | Required for |
|---|---|---|
| 1 | Hero block shows priority, title, deck, source tags | Goals 1, 4 |
| 2 | Short/Full summary switcher | Goal 1 |
| 3 | Impact Assessment bars (Cost / Compliance / Client / Operational) | Goal 2 |
| 4 | Section-numbered structured sections (§3 immediate action, §8 substantive requirements, §14 timeline) | Goals 1, 3 |
| 5 | Sources tab with tier legend | Goal 4 |
| 6 | Changelog visible | Goal 5 |
| 7 | Related items panel (xrefs, supersessions) | Goal 6 |
| 8 | Export brief (PDF / Markdown) | Goal 7 |
| 9 | Share link | Goal 7 |
| 10 | Add to watchlist | Goal 8 |
| 11 | Assign action to team member | Goal 9 |
| 12 | Set personal deadline reminder | Goal 10 |
| 13 | Penalty calculator (interactive: inputs → math) | Goal 2 |

**Current state**

| # | State | Evidence |
|---|---|---|
| 1 | PRESENT | Hero block renders |
| 2 | PRESENT | SummarySwitcher added in commit 6db2302; toggles Short/Full |
| 3 | PRESENT | ImpactScores component renders |
| 4 | PARTIAL | OperationalBriefingExpander renders 3 of 14 spec sections (immediate action / what-and-why / compliance chain). Other 11 sections live inside opaque `full_brief` markdown |
| 5 | PRESENT (post Phase 1) | Tier legend added in commit 08c6899 |
| 6 | PRESENT | Changelog rendered |
| 7 | PRESENT | LinkedItemsCard renders xrefs + supersessions |
| 8 | MISSING | No export UI |
| 9 | MISSING | No share UI |
| 10 | MISSING | Watchlist `{false && ...}` dead code per code audit |
| 11 | MISSING | No action assignment UI |
| 12 | MISSING | No reminder UI |
| 13 | PARTIAL | Penalty calculator tab is static narrative, not a calculator |

**Identification rail Topic: research issue** (operator-flagged) — see Section 12.

**Dispositions**

| # | Disposition |
|---|---|
| 1-3, 5-7 | PASS |
| 4 | DEFER (schema, `intelligence_item_sections` table) OR WIRE markdown extractor for the remaining 11 sections |
| 8 | BUILD (PDF + Markdown export) |
| 9 | BUILD (share link with copy button + post-to-community option) |
| 10 | STRIP dead code (Phase 4 sweep), BUILD when watchlist schema lands |
| 11 | BUILD (depends on team_assignments table; DEFER) |
| 12 | BUILD (depends on reminder infrastructure; DEFER) |
| 13 | STRIP tab OR rename "Penalty schedule" + populate with structured data |

---

## 4. `/market` Market Intel

**Purpose** (platform-intent SKILL Section 3.2): "Industry signals. Corporate announcements, commercial research, sustainability trade press, carbon market intelligence, fuel pricing, predictive timing."

**User goals**
1. See what's moving in the market this week
2. Anticipate cost impact on lanes
3. Identify competitive edges
4. Track signal trajectories over time
5. Get alerted when a signal threshold breaches
6. Cross-reference market signals to regulations
7. Share signal with team
8. Drill into signal source detail

**Required user flows**

| # | Flow | Required for |
|---|---|---|
| 1 | Land on /market and see 3 signal bands | Goal 1 |
| 2 | 4 stat tiles aligned with masthead total | Goal 1 |
| 3 | Filter by severity | Goal 1 |
| 4 | B1 Price snapshot (4-tile current prices) | Goal 2 |
| 5 | Featured signal per band with trajectory bars (B1) | Goals 2, 4 |
| 6 | Click signal → detail view | Goal 8 |
| 7 | Watchlist a signal | Goal 5 |
| 8 | Set alert threshold on a signal | Goal 5 |
| 9 | See cross-references to regulations | Goal 6 |
| 10 | Share signal | Goal 7 |
| 11 | Compare two signals side-by-side | Goal 2 |

**Current state**

| # | State | Evidence |
|---|---|---|
| 1 | PRESENT | MarketPage.tsx renders 3 bands |
| 2 | MISSING | Masthead 107 vs tiles 47 mismatch (browser audit); 5th tile for Competitive edge missing |
| 3 | MISSING | No severity filter |
| 4 | PRESENT | PriceSnapshotRow renders 4 tiles |
| 5 | PRESENT | Trajectory bars on B1 featured signal |
| 6 | MISSING | No signal detail route (`/market/[slug]` does not exist) |
| 7 | MISSING | No watchlist UI |
| 8 | MISSING | No alert UI |
| 9 | MISSING | No xref rendering on signal cards |
| 10 | MISSING | No share UI |
| 11 | MISSING | No compare UI |

**Dispositions**

| # | Disposition |
|---|---|
| 1, 4, 5 | PASS |
| 2 | WIRE (Phase 4: add 5th tile, align masthead/tile counts via Phase 2A) |
| 3 | WIRE (filter chips above bands) |
| 6 | BUILD (Phase 5: market signal detail route) |
| 7 | BUILD (depends on watchlist table; DEFER) |
| 8 | BUILD (alert infrastructure; DEFER) |
| 9 | DEFER (intersection schema Q5) |
| 10 | BUILD (share with copy + post-to-community) |
| 11 | BUILD (compare UX is a future product decision; DEFER) |

---

## 5. `/research`

**Purpose** (platform-intent SKILL Section 3.3 + Section 5 correction): "Horizon-scan content from peer-reviewed journals, think tanks, quantified research, analytical press. Customer-facing, NOT the editorial draft-staging queue (that moves to /admin)."

**User goals**
1. Stay ahead of regulatory trends
2. See what new research says about my themes
3. Cite findings in my work
4. Follow themes for updates
5. Bookmark findings
6. Share findings with team
7. Drill into finding detail

**Required user flows**

| # | Flow | Required for |
|---|---|---|
| 1 | Land on /research and see 7 themes | Goal 1 |
| 2 | Filter by window (7d / 30d / 90d / All) | Goals 1, 2 |
| 3 | Filter by vertical | Goal 2 |
| 4 | Filter by severity (stat tile click) | Goal 1 |
| 5 | Theme grouping with summary | Goal 2 |
| 6 | Featured finding | Goal 1 |
| 7 | Click finding → detail view | Goal 7 |
| 8 | Bookmark a finding | Goal 5 |
| 9 | Follow a theme for updates | Goal 4 |
| 10 | Share finding | Goal 6 |
| 11 | Cite finding (copy citation block) | Goal 3 |

**Current state**

| # | State | Evidence |
|---|---|---|
| 1 | PRESENT | ResearchView renders 7 themes |
| 2 | MISSING | Window pills toggle visual state but don't filter (browser audit) |
| 3 | MISSING | Vertical chips toggle but don't filter |
| 4 | MISSING | Stat tiles are buttons but click does nothing |
| 5 | PRESENT | Theme grouping with summary line |
| 6 | PRESENT | Featured finding card |
| 7 | MISSING | No `/research/[slug]` detail route |
| 8 | MISSING | No bookmark UI |
| 9 | MISSING | No follow-theme UI |
| 10 | MISSING | No share UI |
| 11 | MISSING | No cite UI |

**My uncommitted stashed work addresses flows 2, 3, 4** (window pills, vertical chips, stat tile filters, fetch-error filter). Stash: `research-filter-wiring-WIP-2026-05-24`. Operator-reviewed separately per dispatch Phase 0.

**Dispositions**

| # | Disposition |
|---|---|
| 1, 5, 6 | PASS |
| 2, 3, 4 | WIRE (pop stash, validate, fold into Phase 4 /research commit) |
| 7 | BUILD (Phase 5: research finding detail route) |
| 8 | BUILD (depends on bookmark table; DEFER) |
| 9 | BUILD (depends on follow-theme infrastructure; DEFER) |
| 10 | BUILD (share with copy + post-to-community) |
| 11 | BUILD (citation generator) |

---

## 6. `/operations`

**Purpose** (platform-intent SKILL Section 3.4): "Jurisdictional decision intelligence. Surfaces structured content. Customer reads + Intelligence Assistant for cross-cutting questions + customer judgment. NOT a decision-engine UI."

**User goals**
1. See operational facts by region
2. Compare regions on a dimension
3. Cross-reference regulations applicable per region
4. Decide hire-vs-automate, cost, feasibility per region
5. Track operational cost trajectories
6. Export facts for analysis
7. Set alerts on operational changes

**Required user flows**

| # | Flow | Required for |
|---|---|---|
| 1 | Land on /operations and see 5 region accordions | Goal 1 |
| 2 | Expand region to see 6 dimensions | Goal 1 |
| 3 | D1 shows regulation cross-references | Goal 3 |
| 4 | D2-D6 show fact tables with sources | Goal 1 |
| 5 | "Pending changes that shift this region's calculus" panel | Goal 4 |
| 6 | Stat tile click filters region accordions | Goal 1 |
| 7 | Compare two regions side-by-side | Goal 2 |
| 8 | Facility Data tab populated | Goal 1 |
| 9 | Export facts (CSV) | Goal 6 |
| 10 | Set alert on operational change | Goal 7 |

**Current state**

| # | State | Evidence |
|---|---|---|
| 1 | PRESENT | OperationsPage renders 5 region accordions |
| 2 | PRESENT | 6 dimensions per region structure |
| 3 | PRESENT | D1 RegulationLinkCard renders |
| 4 | PARTIAL | EU + US populated; Asia / UK / UAE silently skip missing D2/D4/D6 (browser audit) |
| 5 | MISSING | Pending-changes panel is hard-coded inside EU D6; not surfaced for other regions |
| 6 | MISSING | Stat tiles are buttons, click does nothing |
| 7 | MISSING | No compare UI |
| 8 | MISSING | Facility Data tab is one-line placeholder |
| 9 | MISSING | No export UI |
| 10 | MISSING | No alert UI |

**Dispositions**

| # | Disposition |
|---|---|
| 1, 2, 3 | PASS |
| 4 | WIRE (render labeled empty state for missing dimensions); DEFER full population (schema, `regional_data_facts` table) |
| 5 | DEFER (schema, intersection data) |
| 6 | WIRE (stat tile click filters region accordions by priority) |
| 7 | BUILD (compare UX; DEFER) |
| 8 | STRIP tab OR DEFER (schema for facility data) |
| 9 | BUILD (export CSV) |
| 10 | BUILD (depends on alert infrastructure; DEFER) |

---

## 7. `/community` and subroutes

**Purpose** (platform-intent SKILL Section 3.5): "Peer information sharing across regions and groups. CORE value driver. Non-negotiable. Solves freight industry information isolation."

**User goals**
1. See what peers are discussing in my region / groups
2. Find peers facing similar problems
3. Ask questions and get answers from peers
4. Share intelligence with peers
5. Build relationships within the industry
6. Surface intelligence items to platform editorial

**Required user flows (17 per dispatch seeded example)**

| # | Flow | State | Evidence |
|---|---|---|---|
| 1 | Browse activity by region | PARTIAL | Region cards exist in CommunityView, no onClick |
| 2 | Browse activity by group (my groups) | PRESENT | Group sections render in RegionAndGroupTab |
| 3 | Browse activity by topic | PARTIAL | TOPICS THIS WEEK rows exist, no onClick |
| 4 | Read a thread | PRESENT | `/community/[slug]` route exists; PostList renders |
| 5 | Reply to a thread | PRESENT | ReplyComposer.tsx exists, wired in PostList |
| 6 | Start a new thread | **REGRESSED** | PostComposer.tsx exists; new CommunityView omitted CTA |
| 7 | Pick group on compose | PRESENT | PostComposer takes `groupId` prop |
| 8 | React to posts | **STUB** | Code comment "Reactions are stubbed (501 endpoint, disabled UI)" in PostList.tsx:13 |
| 9 | Find groups in my region | PRESENT | `/community/browse` route exists |
| 10 | Join a public group | VERIFY | community_group_members API exists; UI in BrowseGroupsGrid likely; verify |
| 11 | Request to join private group | VERIFY | community_group_invitations API exists; UI in GroupModals.tsx likely |
| 12 | Create a new group | VERIFY | GroupModals.tsx exists; CTA visibility in CommunityView is the gap |
| 13 | Invite peers to a group | PRESENT | `/api/community/groups/[id]/invite` + GroupModals MembersModal |
| 14 | Filter threads by region / group / topic | MISSING | No filter chips in CommunityView |
| 15 | Mention intelligence items in post | MISSING | Cross-surface ref schema deferred (Q5) |
| 16 | Share post URL externally | VERIFY | `/community/[slug]` is the natural URL; copy button verify |
| 17 | Editorial pickup notification | PARTIAL | Admin Section 6 Community pickups exists; user-facing notification unclear |

**Dispositions**

| # | Disposition |
|---|---|
| 1 | WIRE (region card onClick → `/community/browse?region=X`) |
| 2 | PASS |
| 3 | WIRE (topic row onClick → filtered group/thread view) |
| 4, 5 | PASS |
| 6 | **WIRE-BACK** (mount PostComposer or "+ New Topic" CTA in CommunityView landing) |
| 7 | PASS (group picker inside compose modal) |
| 8 | DEFER (depends on reactions table + API; 501 stub) OR STRIP stubbed UI |
| 9 | PASS |
| 10, 11, 12 | VERIFY, then WIRE if UI exists but not exposed |
| 13 | PASS |
| 14 | BUILD (filter chips above region cards) |
| 15 | DEFER (schema Q5) |
| 16 | VERIFY share-URL pattern |
| 17 | VERIFY |

**Critical correction to dispatch seeded example**: dispatch flagged flows 6, 7, 9, 12 as BUILD; the actual disposition is **WIRE-BACK** because the underlying components and APIs already exist. The CommunityView rebuild this session lost the chrome that exposed them. The Community Phase 4 commit is **substantially smaller than v3 of the dispatch estimated**, not larger, because the BUILD work was already done in prior phases.

---

## 8. `/map`

Phase 6 covers the full rebuild. Functional spec there.

**Current state per audit**: count mismatch (645 vs 394, addressed in Phase 1 Fix 3 commit 08c6899); off-by-one between masthead and subtitle; "click to fly" rail header but click opens panel without animation; tile layer not implemented (placeholder); IADB "Access Blocked" coverage gap.

---

## 9. `/admin`

**Purpose**: Operator workspace controls. Platform-layer surface gated on `profiles.is_platform_admin = true`.

**User goals (operator)**
1. Review provisional sources
2. Manage ingest (staged updates, integrity flags, rejections)
3. Review coverage gaps
4. Manage editorial pipeline (research draft-staging)
5. Review community pickups
6. Track agent run cost
7. Track active sources health

**Required flows**

| # | Flow | State | Disposition |
|---|---|---|---|
| 1 | Section card overview | PRESENT (post-rebuild) | PASS |
| 2 | Click Sources section → SOURCE REGISTRY tab | PRESENT | PASS |
| 3 | Section count accuracy | PARTIAL | Sections 3-6 use hardcoded 0 or incomplete aggregations (browser audit). **WIRE** (Phase 4) |
| 4 | Provisional source review | PRESENT | PASS |
| 5 | Staged updates review | PRESENT | PASS |
| 6 | Integrity flags review | PRESENT | PASS |
| 7 | Ingest rejections | PRESENT but 131 untriaged include canonical jurisdictions (NEW_ZEALAND, KAZAKHSTAN, IMO) | **WIRE** normalizer to recognize canonical entities |
| 8 | Coverage matrix | PRESENT | PASS |
| 9 | MTD spend tile | PRESENT (hardcoded 0 suspicious; verify computed from agent_runs) | VERIFY |
| 10 | Research pipeline review (editorial draft-staging) | MISSING | **BUILD** (move from prior /research) per Section 5 SKILL correction |
| 11 | Community pickups review | MISSING | **BUILD** (editorial review queue for community → intel promotion) |

---

## 10. `/settings`

**Purpose**: Workspace configuration. User configures view, preferences, subscriptions, notifications.

**User goals**
1. Configure my workspace verticals / sectors
2. Configure dashboard cards
3. Configure default export format
4. Configure notification preferences
5. View data summary
6. View supersession history
7. Manage archive
8. Access help / docs

**Required flows**

| # | Flow | State | Disposition |
|---|---|---|---|
| 1 | General tab: sectors configurable | PRESENT | PASS |
| 2 | Dashboard tab: card-visibility toggles | MISSING (renders same content as General per browser audit) | **WIRE or STRIP** |
| 3 | Exports tab: format picker (PDF/HTML/CSV/Slack) | MISSING (same content as General) | **WIRE or STRIP** |
| 4 | Notifications tab: channel + frequency | PARTIAL (in_app channel only per design; honest empty for email/push) | PASS |
| 5 | Data & Supersessions tab | EMPTY card frames | **WIRE or STRIP** |
| 6 | Help tab | EMPTY card | **WIRE or STRIP** |
| 7 | Archive viewer | PRESENT (dynamic-imported) | PASS |

**Sector projection bug** (browser audit): General tab shows 6 sectors checked but every other surface masthead declares "Live events · Fine art" (2 of 6). **DEFER to Phase 3 schema Q6 (profile projection).**

---

## 11. `/profile`

**Purpose**: User identity, workspace context, role/permissions.

**User goals**
1. Manage my profile (name, avatar, contact)
2. See my workspace org
3. Switch orgs (multi-tenant)
4. See my role and permissions
5. Manage org members (if admin)
6. View billing (if admin)

**Required flows**

| # | Flow | State | Disposition |
|---|---|---|---|
| 1 | Personal tab editable | PRESENT (per Section E audit) | PASS |
| 2 | Organization tab | PRESENT | PASS |
| 3 | Org switcher | VERIFY | likely BUILD |
| 4 | Role visible | PRESENT | PASS |
| 5 | Members tab | PRESENT | PASS |
| 6 | Billing tab | PRESENT but likely stub | VERIFY, BUILD or DEFER |

---

## 12. `/onboarding`

**Purpose**: New user setup. Configure verticals/sectors, connect data sources, understand product.

**User goals**
1. Walk through guided setup
2. Pick verticals / sectors
3. Import LinkedIn profile (in-flight per Section 5 SKILL correction)
4. Configure notifications
5. Understand the platform

**Required flows**

| # | Flow | State | Disposition |
|---|---|---|---|
| 1 | 4-step wizard | PRESENT | PASS |
| 2 | Sector picker | PRESENT | PASS |
| 3 | LinkedIn import | PARTIAL (label updated to "Pre-fill from LinkedIn" per Section E audit; gated on linkedinEnabled config) | PASS (in-flight as documented) |
| 4 | Notification preferences | PARTIAL (in_app only) | PASS |
| 5 | Product orientation copy | PRESENT | PASS |

---

## Operator-flagged investigation: Topic: research on Tier-1 EUR-Lex

The browser audit found `/regulations/g4` IDENTIFICATION rail displays `Topic: research`. The operator flagged this as **potentially data corruption** rather than display fallback, and asked to investigate before schema migrations in case cleanup needs inclusion.

**Investigation findings** (read-only):

1. **Display logic**: IDENTIFICATION rail at [RegulationDetailSurface.tsx ~605](fsi-app/src/components/regulations/RegulationDetailSurface.tsx#L605) reads `r.topic` directly. No fallback to "research" string in the rendering path.
2. **Data layer**: The string "research" matches the `source_categories` enum used in the source-category routing (regulatory/research/market_news/operational_data). It is plausible that an upstream mapper is writing `source_category` into the `topic` field by mistake.
3. **Likely root cause**: a misconfigured mapper writing source category into the topic column, or the agent classifier emitting `topic="research"` on regulatory items where the topic mapping is null.
4. **Migration implication**: if a pattern exists (more than just g4), the Phase 3 schema work should include a cleanup migration that sets `topic = NULL` where `topic = source_category`. The pattern can be quantified with `SELECT count(*) FROM intelligence_items WHERE domain = 1 AND topic IN ('research', 'regulatory', 'market_news', 'operational_data');`.

**Disposition**: **INVESTIGATE further in Phase 3A** during schema design. Run the count query before authorizing the topic-column migration. If the corruption pattern is present, include a cleanup step in the same migration.

---

## Aggregated BUILD list (per Phase 4 absorption)

| Surface | BUILD items | Count |
|---|---|---|
| / Dashboard | (no new BUILD; mostly PASS or DEFER to Phase 2A counts) | 0 |
| /regulations index | export PDF/CSV (if scope) | 0-1 |
| /regulations detail | export brief, share, action assignment, reminder, replace dead watchlist | 1-5 (most DEFER on schema) |
| /market | severity filter chips, signal detail route (Phase 5), watchlist, alerts, share, compare | 2 in Phase 4 (severity filter + 5th tile); rest Phase 5 or DEFER |
| /research | finding detail route (Phase 5), bookmark, follow-theme, share, cite, **+ pop stash for window/vertical/stat-tile filters (WIRE)** | 1 in Phase 4 (stash); rest Phase 5 or DEFER |
| /operations | region compare, export CSV, alert, dimension empty states | 1-2 in Phase 4 (empty states); rest DEFER |
| /community | **WIRE-BACK 6/7/9/12 (not BUILD)**, filter chips, region/topic onClick | 6 in Phase 4 (most WIRE-BACK to existing components) |
| /map | Phase 6 covers | 0 here |
| /admin | research pipeline review queue, community pickups review queue, normalizer canonical extensions | 2 BUILD + 1 WIRE |
| /settings | Dashboard/Exports/Data/Help tabs WIRE or STRIP | 2-4 |
| /profile | org switcher (verify), billing | 1 (verify) |
| /onboarding | (no new BUILD; LinkedIn label correct) | 0 |

**Aggregate**: ~15 BUILD items in Phase 4 scope (plus DEFER items awaiting schema). The Community surface is substantially **smaller** than dispatch v3 estimated because WIRE-BACK to existing components is the dominant operation.

---

## Patterns surfaced beyond per-surface gaps

1. **Regression risk on every rebuild.** The Community case proves UI rebuilds can lose existing functionality if the rebuilder doesn't enumerate the pre-rebuild flows first. **Recommendation: every Phase 4 commit lists the flows it preserves vs. removes vs. adds.** Soft commitment; no new fitness function.

2. **Several MISSING flows (watchlist, share, export-PDF, alerts, bookmark, follow-theme, region compare, action assignment, reminder, citation) recur across surfaces.** These are platform-level capabilities, not per-surface features. **Recommendation: a future cross-cutting capability dispatch addresses them once rather than 5 times.** No commitment in this dispatch.

3. **VERIFY items in Section 7 (flows 10, 11, 12, 16, 17 on /community) need a follow-up sub-audit before Phase 4 Community commit.** Some may be PRESENT, just not exposed; treating them as BUILD would be wrong.

---

## Cross-cutting capability inventory

The following capabilities recurred as MISSING/DEFER across multiple surfaces during this audit. They are platform-level, not per-surface, and form the scope envelope for **Decision 7** (cross-cutting capability dispatch):

- **Watchlist** (Regulations index, Regulations detail, Market, Research, Operations) — depends on a `watchlists` table with user_id + intelligence_item_id; add-from-any-surface UX.
- **Share** (Regulations detail, Market, Research, Community thread) — copy-link button + post-to-community option; share-URL pattern standardization.
- **Export** (Regulations index bulk, Regulations detail brief, Operations facts) — PDF / Markdown / CSV; existing TSV bulk export is the only present surface.
- **Alerts** (Regulations index, Market signals, Operations changes) — threshold or change-event alerts; depends on alert infrastructure (email/in_app channel + per-item subscription table).
- **Bookmark** (Research findings) — lighter weight than watchlist; per-user save without monitoring.
- **Follow-theme** (Research) — subscribe to a theme grouping for updates; depends on theme column (migration 102 lands this).
- **Citation generator** (Research) — copy citation block in standard format.
- **Action assignment** (Regulations detail) — assign workspace member to a regulation's required action; depends on `team_assignments` table.
- **Reminders** (Regulations detail deadline, Operations alert) — personal deadline reminders; depends on reminder infrastructure.
- **Compare** (Operations region-vs-region, Market signal-vs-signal) — side-by-side compare UX; product decision DEFER.
- **Cross-surface linking** (Market → Regulations, Community → any intelligence item) — depends on intersection schema (Q5 deferred); referenced_intelligence_item_ids column lands in migration 104.

This inventory is the scope envelope for a cross-cutting capability dispatch. Resolving each capability once at the platform level avoids implementing the same UX 5 times across surfaces.

---

**End of Phase 1.5 functional purpose audit.**

## Related

- [[cards-clickable-audit-2026-05-12]] — Shares the card→detail navigation flow per surface; the functional audit tracks the same click-through and notes /market/[slug] and…
- [[comprehensive-site-audit-2026-05-25]] — Declared companion; the two form a deliberate lens pair — that doc asks whether required flows are present, this asks whether present elements…
- [[caros-ledge-product-audit-2026-05-15]] — Shares the per-surface intent framing and the same schema-gap symptoms (static penalty calculator, missing 'Your exposure', phantom columns) as…
