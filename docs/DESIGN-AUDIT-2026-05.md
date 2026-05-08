# Design Audit — Preview vs Live App

**2026-05 · 11 routes · 30+ components · For Claude Code handoff**

The preview HTML files in `preview/` are the source of truth for visual and editorial intent. The live Next.js app in `fsi-app/` implements most of the structural skeleton faithfully, but a handful of sections have collapsed-accordion patterns, missing legend strips, or simplified content shapes that drift. Each section below lists what matches, what diverges, and concrete file paths for edits.

## Status summary

- **OK (4):** Regulations (list), Regulation detail, Operations, Map
- **Partial (5):** Dashboard, Market Intel, Research, Admin, Profile, Community
- **Diverged (1):** Settings (post-refactor; needs human decision)

---

## 01 · Dashboard — Your Brief — Partial

### Files
- Preview: `preview/dashboard-v3.html`
- Route: `fsi-app/src/app/page.tsx`
- Components: `HomeSurface.tsx` · `DashboardHero.tsx` · `WeeklyBriefing.tsx` · `WhatChanged.tsx` · `Supersessions.tsx` · `EditorialMasthead.tsx`

**Verdict.** Masthead and 4-up hero are pixel-faithful. The three sections below the hero have all drifted into collapsed accordions where the design wants always-open editorial blocks.

### What matches

- Editorial masthead: title "Dashboard — Your Brief", eyebrow, and meta string `{date} · {N} regulations tracked · {N} jurisdictions` match exactly.
- 4-up hero strip: `gridTemplateColumns: "1.4fr 1fr 1fr 1fr"`, 84px Anton on Critical / 72px on others, gradient + 4px left rail on Critical, eyebrow + sub-label copy. `DashboardHero.tsx` explicitly cites `dashboard-v3.html`.
- Helper copy on Critical tile: `CRITICAL_HELPER_COPY = "3 inside 14 days: LL97 filing, FuelEU Q1, CBAM defaults"` — identical string.
- "This Week" 1.3fr / 1fr grid: layout ratio matches; `cl-this-week-grid` in `HomeSurface.tsx`.

### What diverges

- **Weekly Briefing** — collapsed accordion vs always-open editorial block. Design: always open, numbered "Top priority this week — 5 items" list, summary paragraph, day-count side meta (18 days, 6 days, 76 days). Live: collapsed-by-default with chevron, list of `<Link>`s with priority badges, no day-count side meta, no summary paragraph. (`fsi-app/src/components/home/WeeklyBriefing.tsx`)
- **What Changed** — collapsed accordion, content shape simplified. Design: open by default, summary paragraph + 3 items each labelled `New · Critical / Updated · High / etc`. Live: collapsed accordion with header "What Changed (N)", no summary paragraph, no compound severity labels. (`fsi-app/src/components/home/WhatChanged.tsx`)
- **Replaced** — vertical accordion vs 5-up horizontal strip. Design: 5 small horizontal cards in a row showing `MEPC.304(72) → MEPC.377(80)` arrow pairs. Live: collapsed accordion containing full-width vertical cards with severity badges. (`fsi-app/src/components/home/Supersessions.tsx`)
- Hero tiles are clickable (route to `/regulations?priority=…`) — likely intentional per PR-G F4/F5.

### For Claude Code

1. Rebuild `WeeklyBriefing.tsx` as an always-open editorial block: numbered list, summary paragraph, day-count side meta. Drop the chevron/collapse behavior.
2. Rebuild `WhatChanged.tsx` as an open block with summary paragraph and compound `{change-type} · {priority}` labels.
3. Rebuild `Supersessions.tsx` as a 5-column horizontal strip of small arrow-pair cards. Move the existing detailed-card view to the regulation detail page if needed elsewhere.

---

## 02 · Regulations (list) — OK

### Files
- Preview: `preview/regulations.html`
- Route: `fsi-app/src/app/regulations/page.tsx`
- Components: `RegulationsSurface.tsx` · `ViewToggles.tsx` · `SortRow.tsx` · `SectorChipFilter.tsx` · `ConfidenceFacet.tsx` · `BulkSelectBar.tsx`

**Verdict.** The kanban-first regulations workspace is the most complete page in the app. Component header explicitly enumerates Decision #1 (Dispatch E) wiring — 28 sector chips, confidence facet, sort row, view toggles, bulk-select with watchlist export. All present.

### Confirmed against code

- 4-column priority kanban: CRITICAL · HIGH · MODERATE · LOW, shared `PRIORITY_DISPLAY_LABEL` editorial vocabulary. Responsive collapse 2-col @ 1100px / 1-col @ 640px.
- View toggles: kanban / list / table.
- Sort row: Newest / Priority / Confidence / Alphabetical.
- Filter persistence: localStorage key `"fsi-regulations-defaults"` persists sectors, confidence, priorities, topics, regions, modes, sort, view. Save-as-default + Reset-to-my-sectors banner wired.
- URL deep-link from dashboard: `?priority=CRITICAL` hydrates `activePriorities` on first paint; explicit comment "land on the priority-filtered kanban".
- Editorial vocabulary centralized: `PRIORITY_DISPLAY_LABEL.*` feeds chips, sidebar, stat tiles. Don't fork.
- Confidence "Unclassified" bucket: `CONFIDENCE_UNCLASSIFIED_ID` handles items missing `authorityLevel`.

### For Claude Code

- No structural changes required. Optional polish: spot-check kanban card density and the bulk-select bar entry animation against `preview/regulations.html`.

---

## 03 · Regulation detail — OK

### Files
- Preview: `preview/regulation-detail.html` · `regulation-detail-v2.html`
- Route: `fsi-app/src/app/regulations/[id]/page.tsx`
- Components: `RegulationDetailSurface.tsx` · `TimelineBar.tsx` · `LinkedItemsCard.tsx` · `OwnerTeamCard.tsx` · `AffectedLanesCard.tsx`

**Verdict.** Detail surface implements the v2 design: hero card with mode chips, 4-up stat strip, tabs, and 1fr / 320px right rail.

### Confirmed against code

- Hero card: mode chips, title + pills, deck (description), tag chips, action buttons. Priority tone via `PRIORITY_TONE` map keyed by CRITICAL / HIGH / MODERATE / LOW.
- 4-up stat strip: `cl-detail-stat-strip` with `repeat(4, 1fr)` grid; collapses to 2-col @ 1100px.
- Tabs: Summary · Exposure · Penalty calculator · Timeline · Sources — matches PR-F rationalization. Code comment cites Decision #12.
- 1fr / 320px layout: `cl-detail-layout`; collapses single-column @ 1100px.
- Inline horizontal Timeline section (PR-F F22) reuses `TimelineBar`; hidden when no data.

### For Claude Code

- No structural changes required.

---

## 04 · Market Intel — Partial

### Files
- Preview: `preview/market-intel.html`
- Route: `fsi-app/src/app/market/page.tsx`
- Components: `MarketPage.tsx` · `CostTrajectoryChart.tsx` · `KeyMetricsRow.tsx` · `OwnersContent.tsx` · `PolicySignals.tsx` · `WatchlistSidebar.tsx` · `FreightRelevanceCallout.tsx`

**Verdict.** Closer to OK than v1 implied. F11b parity contract is honored — both tabs share the same `SectionTemplate` (PolicySignals → FreightRelevanceCallout → KeyMetricsRow → CostTrajectoryChart → category accordions), with the right rail (Watchlist, Owners, Watch this week, Methodology).

### Confirmed against code

- F11b structural parity: both tabs render the SAME structural template; only `renderCategoryBody` differs. TechBody = titled cards w/ lifecycle pill; PriceBody = price-row cards with "Why this matters" callout.
- Lifecycle vocab: `LIFECYCLE` map: Critical→Watch, High→Elevated, Moderate→Stable, Low→Informational.
- Right-rail Watch-this-week alert card: `tone="alert"` SideCard renders `{watchCount + elevatedCount}` with editorial copy.
- Sourced badges per CC3: PolicySignals comment confirms "POLICY ACCELERATION SIGNALS, sourced badges per CC3".
- URL state for tab + dashboard hero deep links wired (PR-G F4/F5).

### Real divergences

1. Category accordions are collapsed-except-first. `defaultOpen={i === 0}` — only the first category renders open. If preview shows them all open, this is a drift.
2. Empty-state fallback for ungrouped items. `groupByCategory` falls back to "Technology" / "Market signal" / "Other" when both topic and sub are missing — surfaces a data-quality gap honestly.
3. CostTrajectoryChart legend. Verify the cargo-vertical legend strip renders below the chart with colored swatches matching preview.
4. PolicySignals layout. Verify horizontal-strip layout vs vertical card stack.
5. FreightRelevanceCallout placement. Confirm it sits inline between chart and policy signals, not in the sidebar.

### For Claude Code

1. Confirm category accordion default-open behavior matches preview; if preview shows all open, change to `defaultOpen` always-true (or no accordion).
2. Audit `CostTrajectoryChart.tsx` for the cargo-vertical legend strip below the chart.
3. Audit `PolicySignals.tsx` for horizontal-strip layout.
4. Verify FreightRelevanceCallout placement.

---

## 05 · Research — Partial

### Files
- Preview: `preview/research.html`
- Route: `fsi-app/src/app/research/page.tsx`
- Components: `ResearchView.tsx`

**Verdict.** Page faithfully implements `preview/research.html`'s structure — masthead, legend strip, 4-up StatStrip with Active review primary, AiPromptBar, Pipeline tab. Source coverage tab is intentionally commented out.

### Confirmed against code

- Pipeline as the surface — not a kanban: filtered row cards (collapsible PipelineRow), NOT a multi-column kanban. `STAGE_LABEL`: Draft / Active review / Published / Archived. Stage filter is a chip row, not column drag.
- "What's new this week" callout: renders only when `publishedThisWeek.length > 0` using `isWithinLast7Days(addedDate)`. Honest empty state.
- Pipeline counter status bar: aria-live status row — "N in active review · N in draft · N published this week · N live".
- Source kicker per row (CC3): each PipelineRow renders the source name as an uppercase kicker above the title.

### Real divergences

- Source coverage tab is commented out. Code comment is explicit: "Source coverage tab is hidden until the source registry rollup endpoint exists. The COVERAGE_MATRIX values below are stub placeholders that would mislead workspace users." The full table renderer (modes × regions matrix with colored-dot encoding) exists but isn't reachable.

### For Claude Code

1. Decision needed: ship the Source coverage tab with stub data + a "preview only" banner, or wait for the source registry rollup endpoint?
2. If preview research.html shows a Pipeline kanban (columns), not row cards, that's a layout drift to call out separately.

---

## 06 · Operations — OK

### Files
- Preview: `preview/operations.html`
- Route: `fsi-app/src/app/operations/page.tsx`
- Components: `OperationsPage.tsx`

**Verdict.** Page faithfully implements the preview. By Jurisdiction tab → region cards with chip grid (Solar / Electricity / Labor / EV Charging / Green Building) + Active items list. Facility Data tab → category accordions.

### Confirmed against code

- Editorial chip taxonomy: `CHIP_DEFS` defines 5 chips with regex matchers that infer chip key from item title/note/tags.
- Honest partial-region rendering: empty chips render dimmed (no per-cell placeholder); region-level `ComingSoonBanner` only shows when ALL chips are empty.
- Coverage side card: "N jurisdictions with data" — copy adapts when a priority filter is active.
- Inlined `ComingSoonBanner`: comment is explicit about not abstracting it from `AdminDashboard.tsx` — same visual treatment, no shared-component extraction.

### For Claude Code

- No changes required.

---

## 07 · Map — Partial

### Files
- Preview: `preview/map.html`
- Route: `fsi-app/src/app/map/page.tsx`
- Components: `MapPageView.tsx` · `MapView.tsx` · `jurisdictionCentroids.ts`

**Verdict.** 70/30 layout (1fr / 320px), Real/Abstract toggle, mode-filter toolbar, side rail (Active heat → By jurisdiction click-to-fly → Coverage gaps) all implemented. Two known gaps.

### Confirmed against code

- Active heat dual-metric reconciliation: surfaces BOTH "N jurisdictions with critical" and "N critical items total" with explicit comment about reconciling per-jurisdiction "N CRITICAL" badge with the global header. Excellent honest disclosure.
- Click-to-fly side rail: `pendingSelectJur` uses `{id, nonce}` tuple so clicking the same row twice still triggers MapView's drill effect.
- Real/Abstract toggle anchored top-LEFT: explicit z-index ordering (1100, above Leaflet's ≤1000 panes), avoids overlap with MapView's own Split/Map/List toggle (top-right).

### Real divergences

1. Abstract view is a stub. Renders a placeholder: "Abstract view — Flat editorial styling lands in a follow-up. Switch to Real to see the live Leaflet map." Toggle wired but only Real renders.
2. Coverage gaps card is hard-coded copy. Currently: "Africa — sub-Saharan transport regulators not yet covered. Flagged by 2 design partners. Latam ocean partial." Static string, not data-driven.

### For Claude Code

1. Decision needed: ship the Abstract view (flat editorial map styling) or hide the toggle until the implementation lands?
2. Optionally derive Coverage gaps from real source-registry data instead of static copy.

---

## 08 · Community — Partial (upgraded from "diverged")

### Files
- Previews: `preview/community.html` · `community-v1.html` · `community-v2.html`
- Routes: `fsi-app/src/app/community/page.tsx`, `[slug]/page.tsx`, `browse/page.tsx`, `events/page.tsx`, `vendors/page.tsx`, `moderation/page.tsx`
- Components (26 files): `CommunityShell` · `CommunityMasthead` · `CommunitySidebar` · `CommunityRegionTabs` · `CommunityHub` · `GroupHeader` · `BrowseGroupsGrid` · `GroupCard` · `HowPublishingWorks` · `VendorMentionsRail` · `CouncilMembersRail` · `PostList` · `Post` · `PostComposer` · `ReplyComposer` · `PromotePostButton` · `PromotePostDialog` · `ReportPostMenu` · `ModerationQueue` · `ModerationActions` · `NotificationsBell` · `NotificationsList` · `NotificationPreferencesPanel` · `RoleBadge` · `VerifierBadge`

**Verdict.** My v1 report was wrong to call Community "diverged." The community surface has 5 distinct routes, all wrapped in `CommunityShell`, with most of the design realized. The "stub" copy I quoted from `CommunityShell.tsx` only fires on the `/community` hub when no group is selected — every other route renders real content.

### Route inventory

- `/community` — hub / fallback: renders `CommunityShell` with the "pick a group from the sidebar" stub when no slug is in the URL. Landing pad, not the full surface.
- `/community/[slug]` ★ — single group view: this is the real feed. `GroupHeader` + `PostList` + 260px right rail with `HowPublishingWorks` + `CouncilMembersRail` + `VendorMentionsRail`. Privacy enforcement layered: RLS gates SELECT, plus belt-and-braces `notFound()` if caller isn't a member of a private group. Two-phase `Promise.all` server-side fetch is well-engineered.
- `/community/browse` — public group directory: dedicated route, public-only by design (intentional Phase C scope). Per-region filter, in-memory join for membership state (NOT N+1), `BrowseGroupsGrid`. Code comment cites design rationale.
- `/community/events` — industry calendar: full implementation. Events grouped by month, past-event treatment with `PAST` badge + RSVP-closed pill (computed once on initial render to avoid hydration mismatch). RSVP fires "Coming soon" toast. Originally `/events`, 308-redirected per PR-D IA refactor.
- `/community/vendors` — curated directory: 3-column grid of `cl-card` tiles, 10 seeded vendors with verified-checkmark badge, tags, description, "Mention this vendor" + "Request introduction" buttons. Backend ships in Phase D — both CTAs fire toast. Originally `/vendors`, 308-redirected.
- `/community/moderation` — global queue (Block C8): `ModerationQueue` with no `groupId`; RLS narrows visible reports to (a) reports caller filed, (b) reports targeting posts in groups caller admins, or (c) all reports for platform admins. Wrapped in `CommunityShell` for consistent chrome.

### Real divergences from preview

1. v1 / v2 preview variants are not implemented. `preview/community-v1.html` and `community-v2.html` exist as exploration. Live code targets canonical `preview/community.html` only.
2. Search bar is intentionally a stub. `onSearchSubmit={() => showToast("Search rolling out — Phase D")}`.
3. Events / Vendors backends are stubs. Both surfaces render fully but RSVP / Mention / Request-intro fire toasts. Phase D scope.
4. Hub fallback copy is stale. When no slug is selected, `/community` shows "Group feeds and post composer ship in the next PR" — but feeds are already live at `/community/[slug]`.

### For Claude Code

1. Update the stub copy in `CommunityShell.tsx` when no group is selected — the surrounding text claims feeds ship "next PR" but they're already live at `/community/[slug]`.
2. Decision needed from human: ship `community.html` as canonical, or pick up v1 / v2?
3. Cross-link the hub (`/community`) directly to a "recently active group" or to `/community/browse` instead of leaving an empty pane.

---

## 09 · Admin — Partial

### Files
- Preview: `preview/admin.html`
- Route: `fsi-app/src/app/admin/page.tsx`
- Components: `AdminDashboard.tsx` · `BulkImportView.tsx` · `CoverageMatrixView.tsx` · `IntegrityFlagsView.tsx` · `IssuesQueue.tsx` · `IssueFilterCaption.tsx` · `WorkspaceProfile.tsx`

**Verdict.** Admin uses `EditorialMasthead` + tabs structure. Header comment notes 4 operational tabs (sources / staged / scan / audit) and a `ComingSoonBanner` placeholder for tabs whose backing service isn't online yet.

### What matches

- Masthead + tab-strip structure: same masthead component as the rest of the app — consistent grammar with Dashboard / Operations / Market.
- Coverage matrix legend: `CoverageMatrixView.tsx` renders a legend with "LEGEND" uppercase eyebrow.

### Things to verify

- Tab roster vs preview: confirm the 4 active tabs and their order match `preview/admin.html`.
- Bulk import textarea styling: `font-mono text-[12px]` — confirm matches preview's mono-input treatment. (`fsi-app/src/components/admin/BulkImportView.tsx`)

### For Claude Code

1. Cross-check the tab roster against `preview/admin.html`.
2. Verify `IssuesQueue` and `IntegrityFlagsView` column structure matches preview tables.

---

## 10 · Profile — Partial

### Files
- Preview: `preview/profile.html`
- Route: `fsi-app/src/app/profile/page.tsx`
- Components: `UserProfilePage.tsx` · `AtAGlanceBlock.tsx` · `NotificationPreferences.tsx` · `QuickLinksSection.tsx` · `SectorSelector.tsx`

**Verdict.** Tabs follow the design preview, but only Personal / Sectors / Jurisdictions / Verifier badge / Activity tabs are wired (per code comment). Remaining tabs are gated for later phases.

### What matches

- Tab roster matches preview structure: `TABS` array carries `phaseC: boolean` per tab — code is explicit about which tabs are live vs scoped to Phase C.
- Verifier badge application flow: header comment confirms verifier badge application is implemented.

### Things to verify

- Disabled / phaseC tab visual treatment: confirm gated tabs render with a "coming soon" affordance the user can see, not invisible disabled state.
- Bio / about textareas: multiple resize-vertical textareas with standard border outline-none pattern — verify against preview's input geometry.

### For Claude Code

1. Confirm phase-gated tabs have a visible affordance (locked icon, "Coming soon" label) rather than silently disabled.
2. Spot-check input/textarea spacing against preview.

---

## 11 · Settings — Diverged · post-refactor intentional

### Files
- Preview: `preview/settings.html`
- Route: `fsi-app/src/app/settings/page.tsx`
- Components: `SettingsPage.tsx` · `ArchiveViewer.tsx` · `BriefingScheduleSection.tsx` · `DashboardSettings.tsx` · `DataSummary.tsx` · `HelpSection.tsx` · `SavedSearchesSection.tsx` · `SupersessionHistory.tsx`

**Verdict.** Code header in `SettingsPage.tsx` is explicit: "Tabs (post-refactor, per design intent…)" — meaning the team consciously deviated from the original preview tab roster. Worth confirming with a human whether the preview should be updated to match the live tab list, or vice versa.

### What's intentionally different

- Tab roster reorganized post-design: live `TABS` reflect a refactored grouping that probably no longer matches `preview/settings.html`. Code is honest about it.
- Briefing schedule, saved searches, archive viewer — separate sections: each is its own component; preview likely shows a flatter structure.

### For Claude Code / human review

1. Decision needed: update `preview/settings.html` to reflect post-refactor tab structure, or restore preview's original tab roster in code?
2. Once decided, align the two so future audits don't re-flag this.

---

## ★ Cross-cutting concerns

- **Sidebar IA — matches design intent.** `Sidebar.tsx` (PR-D refactor) carries 6 product nav items + Community as a separate middle section + Profile/Admin/Settings in the user-footer dropdown. Comment in code explicitly cites visual-reconciliation §4 IA grammar. Solid.
- **`EditorialMasthead` is the universal header.** Used by Dashboard, Map, Market, Operations, Research, Admin, and Community. Consistency is excellent.
- **Priority vocabulary is centralized.** `PRIORITY_DISPLAY_LABEL` / `PRIORITY_DISPLAY_LABEL_SHORT` shared across kanban headers, filter chips, sidebar badges, stat tiles. Don't fork this.
- **AI prompt bar lives on Regulations / Market / Research / Operations only** (per the move from Dashboard). Confirmed and matches the rule called out in `HomeSurface.tsx`'s comment.
- **Collapse-by-default is the recurring drift pattern.** Weekly Briefing, What Changed, and Replaced (Dashboard) are all collapsed accordions in code where the design wants always-open editorial blocks. Worth deciding as a system: do collapsed sections belong on a "Brief"-style overview page at all? Likely no.
- **Honest empty states.** Operations and Map both gracefully fall back to stub messages — good pattern, keep it.
- **Stub-flagged surfaces.** Community search, Events RSVP, Vendor mention/intro, Map Abstract view, Research Source coverage tab, several Profile/Admin tabs are explicitly scoped to later phases. None are bugs — visible "next-PR" boundaries.

---

## Top-priority work order for Claude Code

1. **Dashboard editorial blocks (3 components)** — biggest user-facing drift. Rebuild Weekly Briefing, What Changed, Replaced from collapsed accordions to always-open editorial layouts. (`HomeSurface.tsx`, `WeeklyBriefing.tsx`, `WhatChanged.tsx`, `Supersessions.tsx`)
2. **Community hub stub copy** — fix the stale "ships next PR" message in `CommunityShell.tsx`; feeds are live.
3. **Market category accordions** — verify `defaultOpen={i === 0}` matches preview; if preview shows all open, change to always-open.
4. **Settings tab roster reconciliation** — human decision then alignment.
5. **Research Source coverage tab** — human decision: ship with banner or wait for endpoint.
6. **Map Abstract view** — human decision: ship or hide toggle.
7. **Spot-check polish:** Market `CostTrajectoryChart` legend, `PolicySignals` layout, `FreightRelevanceCallout` placement; Admin tab roster; Profile gated-tab affordance.
