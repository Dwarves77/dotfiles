# Phase 4 Category E Investigation, 2026-05-21

Read-only investigation of the 17 Category E items from
`docs/plans/dead-code-disposition-2026-05-21.md` lines 119 to 138. Per the
operator binding rule (`feedback_site_code_deletes_need_operator_signoff.md`),
each item is reported as WHAT / WHEN / WHY / STATE with no recommendations.
Operator decides keep, wire, or remove for each item.

All file paths are absolute from the repo root (`C:/Users/jason/dotfiles`).

---

## 1. TabBar

- **WHAT**: Sticky top-of-page tab navigation, distinct from the persistent
  `Sidebar`. Defines five primary tabs (Dashboard, Regulations, Market
  Intelligence, Operations, Research and Sources) plus two utility tabs
  (Community, Map). Reads and writes `useNavigationStore().tab`. File:
  `fsi-app/src/components/TabBar.tsx`. Entry point: exported `TabBar()`.
- **WHEN**: Introduced 2026-03-02 in commit `6d18112` ("Add FSI app Phase 1:
  static dashboard with full interactivity"). Has not been touched as a
  rendered surface since the sidebar shipped.
- **WHY**: Original Phase 1 navigation primitive before the left
  `Sidebar` rail landed in Phase A (2026-04-10, commit `b97b7ac`). Was
  the planned mobile bottom-nav equivalent in the early IA.
- **STATE**: Zero JSX callsites in `fsi-app/src`. The only repo reference is
  the definition itself (`fsi-app/src/components/TabBar.tsx:27`). Not
  imported anywhere. Never mounted in the current shell. Has never shipped
  in the post-Sidebar build.

---

## 2. FacilityOptimization

- **WHAT**: Static domain dashboard displaying facility cost categories
  (industrial electricity tariffs, solar ROI, battery storage, labor
  benchmarks, green-building certifications) with hardcoded data points and
  external tool links. File:
  `fsi-app/src/components/domains/FacilityOptimization.tsx`. Entry point:
  exported `FacilityOptimization()`.
- **WHEN**: Introduced 2026-04-04 in commit `a8cd8d1` ("Caro's Ledge: Major
  renovation, source monitoring, multi-tenant, auth, admin").
- **WHY**: Part of the Domains family (Phase-1 Operations exploration)
  serving as a category-level reference for "Warehouse and Facility
  Optimization" before the live Operations surface (Build 9) was scoped.
- **STATE**: Zero JSX callsites. Only self-reference at
  `FacilityOptimization.tsx`. Not imported. Not mounted. Build 9
  `OperationsPage` ships a `FacilityPanel` (sibling, different code path,
  `OperationsPage.tsx:820`) that groups by `intelligence_items.topic`, so
  the Build 9 surface already has its own facility renderer that does not
  reuse this static component.

---

## 3. TechnologyTracker

- **WHAT**: Static domain dashboard listing technology categories (batteries,
  SAF, hydrogen, wind, solar, marine fuels, etc.) with TRL ranges, cost
  trajectory, key metrics, decision thresholds. File:
  `fsi-app/src/components/domains/TechnologyTracker.tsx`. Entry point:
  exported `TechnologyTracker()`.
- **WHEN**: 2026-04-04 in commit `a8cd8d1` (same renovation commit as item 2).
- **WHY**: Phase-1 Domains family component for technology readiness
  category tracking, in the same exploratory family as
  `FacilityOptimization` and `RegionalIntelligence`. Predated the Build 7
  Market Intelligence work which now owns technology readiness UX.
- **STATE**: Zero JSX callsites. Only self-reference. Build 7 Market Intel
  (MarketPage `OBS-20`) ships a sector-anchored empty-state copy block for
  "technology readiness" without consuming this static component. Not
  imported, not mounted.

---

## 4. RegionalIntelligence

- **WHAT**: Static domain dashboard listing regional profiles (jurisdictions
  with solar / electricity / labor data points, confidence levels, data
  provider URLs). File:
  `fsi-app/src/components/domains/RegionalIntelligence.tsx`. Entry point:
  exported `RegionalIntelligence()`.
- **WHEN**: 2026-04-04 in commit `a8cd8d1` (renovation commit).
- **WHY**: Phase-1 Domains sibling of items 2 and 3. Region-level reference
  data that pre-existed the Build 9 Operations regional architecture.
- **STATE**: Zero JSX callsites. Only self-reference. Build 9 OperationsPage
  ships its own `RegulatoryFeasibilitySection`, `EmptyJurisdiction`, and
  regional resource chip grid (`OperationsPage.tsx:584+`) without consuming
  this static module. Not imported, not mounted.

---

## 5. FilterBar + UrgencyFilterBar

- **WHAT**:
  - `FilterBar`: Multi-facet filter bar (modes, topics, jurisdictions,
    priorities) reading `useResourceStore().filters` and saving defaults to
    `useSettingsStore().savedFilters`. File:
    `fsi-app/src/components/explore/FilterBar.tsx`. Entry point: exported
    `FilterBar()`.
  - `UrgencyFilterBar`: Reusable per-page urgency-tier filter row. Takes
    options + counts + active prop; renders priority-colored pills. File:
    `fsi-app/src/components/ui/UrgencyFilterBar.tsx`. Entry point: exported
    `UrgencyFilterBar({options, activeFilter, onFilter, counts})` plus
    three pre-built configs (`REGULATIONS_URGENCY`, `MARKET_INTEL_URGENCY`,
    `RESEARCH_URGENCY`).
- **WHEN**:
  - `FilterBar` introduced 2026-03-02 in commit `6d18112` (Phase 1).
  - `UrgencyFilterBar` introduced 2026-04-12 in commit `1afc40e` ("feat:
    urgency filter bars on Market Intel and Research pages").
- **WHY**: `FilterBar` was the Phase 1 universal multi-facet filter for the
  Resource explorer. `UrgencyFilterBar` was the Phase-2 per-surface urgency
  row for Market Intel and Research after the explorer split into separate
  pages.
- **STATE**: Zero JSX callsites for either. Only references are the
  definition files plus a stale comment in
  `fsi-app/src/app/api/community/posts/[id]/promote/route.ts:300` ("read
  paths (FilterBar, scoring...)") and a stale comment in
  `fsi-app/src/components/onboarding/OnboardingWizard.tsx:247`. Neither is
  imported nor mounted in the current shell. Cross-surface filtering today
  uses inline implementations per-page.

---

## 6. SortSelector + SortRow

- **WHAT**:
  - `SortSelector`: Sort selector bound to `useResourceStore().sort` with
    four sort keys (urgency, alpha, added, modified). File:
    `fsi-app/src/components/explore/SortSelector.tsx`. Entry point: exported
    `SortSelector()`.
  - `SortRow`: Standalone sort component for `/regulations` with four
    options (newest, priority, confidence, alpha) and a controlled
    value/onChange contract. File:
    `fsi-app/src/components/regulations/SortRow.tsx`. Entry point: exported
    `SortRow({value, onChange})` plus `SortKey` type and `authorityRank`
    helper.
- **WHEN**:
  - `SortSelector` introduced 2026-03-02 in commit `6d18112` (Phase 1).
  - `SortRow` introduced 2026-05-06 in commit `ef50918` ("ui: Regulations
    index sector chip system + facets").
- **WHY**: `SortSelector` was the Phase 1 universal sort for the Resource
  explorer (paired with `FilterBar`). `SortRow` is the Regulations-surface
  sort that replaced the universal selector once `/regulations` became its
  own dedicated page.
- **STATE**:
  - `SortSelector`: zero JSX callsites; only self-reference. Not imported.
  - `SortRow`: ACTIVELY USED at
    `fsi-app/src/components/regulations/RegulationsSurface.tsx:756` with
    `<SortRow value={sort} onChange={setSort} />`. Also exports
    `authorityRank` consumed by the same surface. NOT dead, despite being
    grouped with the cross-surface sorting gap.

---

## 7. DueThisQuarter widget + showDueThisQuarter toggle + store flag

- **WHAT**:
  - `DueThisQuarter` widget: Collapsible card showing resources with
    timeline items due in the next 90 days. File:
    `fsi-app/src/components/home/DueThisQuarter.tsx`. Entry point: exported
    `DueThisQuarter({resources})`.
  - `showDueThisQuarter` toggle: User-controlled show/hide in Dashboard
    Settings. File:
    `fsi-app/src/components/settings/DashboardSettings.tsx:35`.
  - Store flag: `showDueThisQuarter: boolean` field in `useSettingsStore`,
    defaults `true`, persisted under the `housekeeping.dueThisQuarter` key.
    File: `fsi-app/src/stores/settingsStore.ts:12`, default at line 87,
    persist mapping at lines 63 and 181.
- **WHEN**: All three pieces introduced together 2026-03-02 in commit
  `6d18112` (Phase 1).
- **WHY**: Phase 1 dashboard widget for compliance-deadline visibility. The
  toggle and persisted store flag were built to let users hide it.
- **STATE**: Widget is NEVER RENDERED. Zero `<DueThisQuarter>` JSX
  callsites. The toggle in DashboardSettings reads and writes the
  `showDueThisQuarter` flag, but nothing in the dashboard tree consults
  the flag to render the widget. Half-built: the controls exist, the
  store flag exists, the widget code exists, but the wiring between
  settings toggle and dashboard render was never built (or was removed
  during a dashboard restructure without removing the toggle / widget /
  flag).

---

## 8. lib/briefing/systemPrompt.ts (buildBriefingSystemPrompt)

- **WHAT**: Pure function returning a sector-aware Claude system prompt for
  weekly regulatory briefings. Takes sectors + orgName + optional
  jurisdictions + transport modes; outputs a markdown-formatted instruction
  block. File: `fsi-app/src/lib/briefing/systemPrompt.ts`. Entry point:
  exported `buildBriefingSystemPrompt(sectors, orgName, jurisdictions?,
  transportModes?)`.
- **WHEN**: Introduced 2026-05-04 in commit `a92695c` ("feat(admin):
  integrity flags + notifications + verification + bulk-import + discovery
  + coverage matrix").
- **WHY**: Marked in code comment as "Pure function, ready for Phase 3
  automated scanning integration." Authored to drive a future weekly
  briefing pipeline; documented intent was Build 7 / Build 8 sector-aware
  briefing generation.
- **STATE**: Zero callsites. Only references are the definition itself and
  a stale comment in
  `fsi-app/src/app/api/community/posts/[id]/promote/route.ts:301`
  ("briefing/systemPrompt, the dashboard RPCs"). Not imported anywhere.
  The current `WeeklyBriefing` component
  (`fsi-app/src/components/home/WeeklyBriefing.tsx`) handles its own
  prompting independently. Module ships in the bundle as dead code unless
  Build 7 or 8 picks it up.

---

## 9. ExportBuilder

- **WHAT**: Drag-and-drop UI for assembling a multi-resource export bundle
  (HTML report or Slack markdown). Reads `useExportStore` for selection
  state, calls `lib/export/htmlReport.toEmailHTML` and
  `lib/export/slackFormat.toSlack`, dispatches `lib/export/download`. File:
  `fsi-app/src/components/ExportBuilder.tsx`. Entry point: exported
  `ExportBuilder({resources, changelog, disputes, onToast})`.
- **WHEN**: Introduced 2026-03-02 in commit `6d18112` (Phase 1).
- **WHY**: Phase 1 multi-resource export builder bound to a selection
  store, intended for the explorer "select multiple items, export as a
  packet" flow.
- **STATE**: Zero JSX callsites. `ExportBuilder` is not imported anywhere.
  Its store `useExportStore` is only imported by `ExportBuilder.tsx`
  itself. The export helpers (`toEmailHTML`, `toSlack`, `downloadFile`)
  ARE used by `WeeklyBriefing.tsx:97+`, so removing `ExportBuilder`
  would not orphan the `lib/export/` helpers, but it would orphan
  `useExportStore`.

---

## 10. ui/Card + ui/StatCard primitives

- **WHAT**:
  - `ui/Card`: Three-padding-size card primitive wrapping `cl-card` Tailwind
    class, optional element tag, optional onClick. File:
    `fsi-app/src/components/ui/Card.tsx`. Entry point: exported `Card`
    (named + default).
  - `ui/StatCard`: Single-stat tile primitive with priority color, icon,
    label, count, optional sublabel, optional click handler. File:
    `fsi-app/src/components/ui/StatCard.tsx`. Entry point: exported
    `StatCard` (named + default).
- **WHEN**:
  - `ui/Card` introduced 2026-05-01 in commit `d4dd9b6` ("housekeeping:
    Card primitive + AmbientOrbs cleanup + LinkedIn button hide").
  - `ui/StatCard` introduced 2026-05-01 in commit `9799932` ("ui
    primitives: RowCard + EditorialMasthead + barrel + Badge to
    PriorityBadge + AiPromptBar rework").
- **WHY**: Phase C component-system primitives. The barrel comment at
  `fsi-app/src/components/ui/index.ts:1` calls them "the three-card system
  documented in design_handoff_2026-04/preview (`cl-card`, `cl-stat-card`,
  `cl-row-card`)" alongside `RowCard`.
- **STATE**:
  - `ui/Card`: Zero callsites that import from `@/components/ui/Card` or
    `@/components/ui`. `SettingsPage.tsx:317` and `UserProfilePage.tsx:893`
    each define their OWN local `function Card(...)` rather than importing
    the primitive.
  - `ui/StatCard`: Zero callsites that import the primitive. Only
    references are the definition file and the barrel export.
  - Both primitives are exported via `fsi-app/src/components/ui/index.ts`
    but no consumer imports through the barrel either.

---

## 11. PolicySignals.tsx:264 "Source pending" per-row badge

- **WHAT**: Per-row dashed-border uppercase badge with the literal text
  "Source pending" that renders when a policy signal row has no resolvable
  source. File: `fsi-app/src/components/market/PolicySignals.tsx:264`
  (inside the `PolicySignals` list renderer body).
- **WHEN**: `PolicySignals.tsx` introduced 2026-05-06 in commit `cfc7f7e`
  ("ui: Market Intel content pattern + F11b template propagation"). The
  "Source pending" string has been present since the file was added.
- **WHY**: Inline source-provenance indicator for the
  POLICY ACCELERATION SIGNALS list when an item lacks a confirmed source.
  Predates the OBS-20 EmptyState rewrite pattern; the badge wording was
  authored before the platform-intent skill Section 11 anti-pattern
  guidance forbade "pending" phrasing.
- **STATE**: `PolicySignals` is RENDERED (imports + JSX in
  `fsi-app/src/components/pages/MarketPage.tsx`,
  `fsi-app/src/components/credibility/SignalStrength.tsx`,
  `fsi-app/src/components/market/FreightRelevanceCallout.tsx`). The
  "Source pending" badge appears live to customers whenever a row resolves
  with no source. End-to-end functional. Wording is the only question.

---

## 12. OperationsPage.tsx empty-state "Coming soon" banners

- **WHAT**: Originally a set of empty-state banners using the phrase
  "Coming soon" for regional intelligence and facility data fallbacks.
  File: `fsi-app/src/components/pages/OperationsPage.tsx`.
- **WHEN**: Introduced 2026-04-10 in commit `b97b7ac` ("Phase A: Left
  sidebar rail + Next.js route foundation").
- **WHY**: Phase A scaffolded the four-page route foundation; the empty
  states used "Coming soon" copy as placeholders for jurisdictions and
  facility categories without ingested data.
- **STATE**: ALREADY CLOSED. The OBS-19 Build 9 rewrite replaced the live
  "Coming soon" copy with workspace-anchored empty states. Current state:
  - `OperationsPage.tsx:553` ships `<NoDataBanner note="No regional
    resource data has been ingested for this jurisdiction yet..." />`.
  - `OperationsPage.tsx:796` ships `EmptyJurisdiction` with copy
    "No regional data for this workspace yet" plus a workspace-scoped
    explanation.
  - `OperationsPage.tsx:868` ships the facility empty-state "No facility
    data for this workspace yet".
  - The only remaining literal "Coming soon" hits in the file are in code
    comments at lines 550, 792, 857 describing the OBS-19 closure history.
  No live customer-facing "Coming soon" string remains on this surface.

---

## 13. MarketPage.tsx empty-state "Coming soon" banners

- **WHAT**: Originally a set of empty-state banners using "Coming soon" for
  technology intelligence and price signals sections. File:
  `fsi-app/src/components/pages/MarketPage.tsx`.
- **WHEN**: Introduced 2026-04-10 in commit `b97b7ac` (Phase A sidebar +
  route foundation).
- **WHY**: Phase A scaffold; the technology and pricing sections used
  "Coming soon" placeholders for sectors without ingested data.
- **STATE**: ALREADY CLOSED. The OBS-20 Build 7 rewrite replaced the live
  copy with workspace + sector-anchored EmptyState helpers:
  - `MarketPage.tsx:854` defines `emptyStateTitle(section, sectorProfile)`
    producing "No technology readiness items scoped for {scope}" /
    "No market signals scoped for {scope}".
  - `MarketPage.tsx:861` defines `emptyStateBody(...)` with sector-aware
    body copy.
  - Only remaining "coming soon" literal in the file is in a code comment
    at line 835 describing the OBS-20 closure history.
  No live customer-facing "Coming soon" string remains on this surface.

---

## 14. SavedSearchesSection "Cross-device sync coming soon"

- **WHAT**: Subtitle text reading "Stored locally in this browser.
  Cross-device sync coming soon." at the top of the saved-searches
  management UI. File:
  `fsi-app/src/components/settings/SavedSearchesSection.tsx:134`.
- **WHEN**: `SavedSearchesSection.tsx` introduced 2026-05-07 in commit
  `e14455` ("ui: Profile + Settings restorations per Decisions #14 + #15").
  The phrase has been present since the file was added.
- **WHY**: PR-L Settings restoration. Per the file header
  (`SavedSearchesSection.tsx:11`) the component is the "L1" surface that
  persists to localStorage following the PR-E pattern, with "no
  `saved_searches` table exists today" called out explicitly. The
  "coming soon" subtitle is a customer-facing acknowledgement of the
  L1/L2 split.
- **STATE**: `SavedSearchesSection` is RENDERED at
  `fsi-app/src/components/pages/SettingsPage.tsx:296`. End-to-end
  functional (creates and recalls saved searches against localStorage).
  The "Cross-device sync coming soon" string ships live to the customer.

---

## 15. RegulationDetailSurface {false && watchlist button}

- **WHAT**: A `{false && <ActionButton primary>+ Add to watchlist</ActionButton>}`
  expression that compiles a JSX element behind a dead-code guard. File:
  `fsi-app/src/components/regulations/RegulationDetailSurface.tsx:427`.
- **WHEN**: Introduced 2026-05-01 in commit `2a2d78` ("feat(surfaces):
  rebuild Dashboard + Regulations + Regulation Detail (Phase C Block B)").
- **WHY**: Comments at lines 420 to 426 explain the intent: "PR-E3
  (watchlist persistence) is deferred. There's no backend table or API
  for per-user / per-workspace watchlist membership yet, so the button
  has no destination. Restoring it requires PR-E3 to land first; at
  that point change the ternary below to render `<ActionButton primary
  onClick={...}>` that calls the watchlist add/remove endpoint."
- **STATE**: `RegulationDetailSurface` is RENDERED at
  `fsi-app/src/app/regulations/[slug]/page.tsx:216`. The `{false && ...}`
  expression never produces output (guarded literal). The element is in
  the bundle (JSX is compiled regardless of the guard), but is invisible
  to customers. End-to-end-functional surface, with a dormant button
  literal awaiting PR-E3 / Build 7.

---

## 16. lib/jurisdictions/tiers.ts:20 "Tier 1 placeholder"

- **WHAT**: A header comment in the jurisdiction-tier taxonomy module.
  Line 20 reads: "Cities are not canonical ISO codes, so we map them to
  the most-canonical-state code that contains them. This is a Tier 1
  placeholder until the platform adopts a richer city schema." File:
  `fsi-app/src/lib/jurisdictions/tiers.ts:20`.
- **WHEN**: `tiers.ts` introduced 2026-04-10 in commit `bd51bd0` ("Two-
  level sector control system"). The comment has been present since
  the file was added.
- **WHY**: Documents an architectural limitation in the city-to-ISO
  mapping (NYC to US-NY, Tokyo to JP-13, etc.). The "placeholder"
  language indicates the city mapping is a stopgap until the platform
  emits richer ISO 3166-2 city codes (the comment names "US-NY-NYC-style
  codes" as a future direction).
- **STATE**: `tiers.ts` is ACTIVELY CONSUMED at
  `fsi-app/src/app/api/admin/coverage/route.ts:30` which imports
  `TIER_1_JURISDICTIONS`, `TIER_2_JURISDICTIONS`, `jurisdictionTier`,
  `isSubnational`, `countryGroupForIso`. The module ships and works.
  The "placeholder" copy lives only in an internal taxonomy comment, not
  in any customer-facing UI string.

---

## 17. lib/llm/first-fetch-classify.ts + worker stub-row creation pattern

- **WHAT**: Shared Haiku-classifier module that enriches first-fetch stub
  rows with title, summary, severity, priority, urgency_tier, topic_tags,
  jurisdictions. Mirrors the inline `haikuClassify` in
  `scripts/wave1-cold-start.mjs` so cron-drained stubs are
  indistinguishable from cold-start stubs. File:
  `fsi-app/src/lib/llm/first-fetch-classify.ts`. Entry point: exported
  `firstFetchClassify(input, apiKey)`, plus shape types
  `FirstFetchClassifyInput` / `Output` / `Result` and a `__test` export.
- **WHEN**: Introduced 2026-05-15 in commit `38d2f52` ("fix(wave1b): drain
  worker calls Haiku to enrich stub at first-fetch time (#102)").
- **WHY**: Per the file header, "Shared first-fetch Haiku classifier for
  the Wave 1b drain worker and any other code path that needs to enrich
  a freshly-seeded intelligence_items stub with title / summary /
  priority / etc." The classifier landed to close the Wave 1b stub-quality
  gap where drain-worker-created stubs had empty `title` and `summary`
  fields.
- **STATE**: ACTIVELY USED at
  `fsi-app/src/app/api/worker/drain-first-fetch/route.ts:6` (import) and
  line 197 (callsite). The worker calls `firstFetchClassify(...)` for
  every queued URL. End-to-end functional. The "stub-row creation pattern"
  is the Wave 1b worker pipeline (stub insert with later Haiku enrichment
  during drain); the disposition question is about the pattern itself, not
  whether the classifier code works.

---

## PATTERN GROUPING

Items grouped by closure pattern.

### Stub-language copy reword (5 items, 2 already closed)

The OBS-20 / OBS-19 rewrite pattern (workspace + sector-anchored copy,
no "coming soon" phase language) applies to wording-only items.

- Item 11 `PolicySignals.tsx:264` "Source pending" badge: ELIGIBLE for
  wording fix. Same anti-pattern surface; just per-row, not empty-state.
- Item 12 OperationsPage "Coming soon" banners: ALREADY CLOSED via
  OBS-19. Live copy is workspace-anchored. Operator decision is moot
  unless re-auditing.
- Item 13 MarketPage "Coming soon" banners: ALREADY CLOSED via OBS-20.
  Live copy is workspace + sector-anchored. Operator decision is moot
  unless re-auditing.
- Item 14 SavedSearchesSection "Cross-device sync coming soon":
  ELIGIBLE for wording fix. Customer-facing phase language same shape as
  OBS-20 anti-pattern, scoped to the localStorage L1 surface.
- Item 15 RegulationDetailSurface `{false && watchlist button}`: PARTIAL
  fit. Not a copy reword, but a binary keep-or-rewrite decision tied to
  PR-E3 / Build 7. If watchlist persists, flip the literal to `true` and
  wire the handler; if not, delete the JSX block and the explanatory
  comment.

### Phase-1 component reuse-or-rebuild (3 items)

Build 7, 8, or 9 territory. Each Phase-1 Domains component has a sibling
Build-N surface that ships its own renderer without consuming the
static module.

- Item 2 FacilityOptimization: Build 9 OperationsPage `FacilityPanel`
  already exists at `OperationsPage.tsx:820`.
- Item 3 TechnologyTracker: Build 7 MarketPage technology section
  already exists with `emptyStateTitle`/`emptyStateBody` helpers.
- Item 4 RegionalIntelligence: Build 9 OperationsPage regional sections
  (`RegulatoryFeasibilitySection`, `EmptyJurisdiction`, chip grid)
  already exist.

All three are reused-or-rebuilt decisions: the rebuild path is the
de-facto live one. The "reuse" path would require porting hardcoded
static data into the live data model.

### Cross-surface UX gaps (2 items, 1 partially live)

- Item 5 FilterBar + UrgencyFilterBar: Both are orphans. No cross-
  surface filtering primitive is in use; pages implement their own.
- Item 6 SortSelector + SortRow: Mixed. `SortSelector` is an orphan.
  `SortRow` is LIVE on `/regulations`. The cross-surface gap is real
  for sort UX, but `SortRow` is not dead.

### Half-built widgets (1 item)

- Item 7 DueThisQuarter widget + toggle + store flag: Three-piece
  half-build. Widget code exists, toggle exists, store flag persists,
  but the dashboard never reads the flag to render the widget. Either
  wire the dashboard to mount `<DueThisQuarter>` when the flag is true,
  or delete all three pieces atomically.

### Orphan primitives (2 items)

- Item 9 ExportBuilder: Orphan UI; helpers (`toEmailHTML`, `toSlack`,
  `downloadFile`) ship via `WeeklyBriefing`. Removing the builder would
  also orphan `useExportStore`.
- Item 10 ui/Card + ui/StatCard: Orphan primitives. `SettingsPage` and
  `UserProfilePage` each define their own local `Card`. No consumer of
  `StatCard`. The Phase C "three-card system" lives as design intent
  but never consolidated.

### Internal taxonomy / lib stubs (3 items)

- Item 8 buildBriefingSystemPrompt: Orphan library function. Build 7 / 8
  may pick it up; otherwise dead.
- Item 16 tiers.ts:20 "Tier 1 placeholder" comment: Internal-only
  comment in a live, working taxonomy module. Wording question only;
  no customer-facing surface.
- Item 17 first-fetch-classify + worker pattern: ACTIVELY USED by the
  drain worker. Not dead. The disposition question is whether the
  stub-and-enrich pattern itself should persist or be replaced.

### Mobile nav (1 item)

- Item 1 TabBar: Orphan since the Sidebar shipped. Never has a mobile
  bottom-nav equivalent landed in the current shell. Operator decides
  whether to wire a mobile shell that consumes TabBar, or delete it.

---

## Notes on items where investigation revealed unexpected state

- **Item 6 SortRow IS LIVE.** The disposition ledger groups SortRow with
  SortSelector under "cross-surface sorting gap," but `SortRow` is the
  active sort component on `/regulations` (callsite
  `RegulationsSurface.tsx:756`). The "gap" only applies to other
  surfaces that lack a shared sort primitive. SortRow is not a delete
  candidate.

- **Item 12 OperationsPage "Coming soon" is ALREADY CLOSED.** OBS-19
  (Build 9) rewrote the live empty states to workspace-anchored copy.
  The only "Coming soon" hits are in code comments documenting the
  closure history. No customer-facing string remains.

- **Item 13 MarketPage "Coming soon" is ALREADY CLOSED.** OBS-20
  (Build 7) rewrote the live empty states using `emptyStateTitle` /
  `emptyStateBody` helpers with sector-anchored copy. Only comment
  remnants remain.

- **Item 15 RegulationDetailSurface watchlist button is dead JSX but the
  surrounding surface is LIVE.** The `{false && ...}` guard compiles the
  element but never renders it. Surface itself is in active production
  use at `/regulations/[slug]`.

- **Item 16 tiers.ts is an INTERNAL TAXONOMY module that is LIVE.** It is
  imported and consumed by `api/admin/coverage/route.ts`. The "Tier 1
  placeholder" string is a header comment describing the city-to-ISO
  mapping limitation, not a customer-facing string. Wording question
  only; no risk of customer impact.

- **Item 17 firstFetchClassify is LIVE in the drain worker.** It runs
  every cron tick that processes a queued URL. End-to-end functional.
  The disposition question is the stub-and-enrich pattern, not the
  module.

- **Item 7 DueThisQuarter is the cleanest half-build in the set.** All
  three pieces (widget, toggle, store flag) exist and are internally
  consistent (toggle reads the flag, store persists it), but the
  dashboard never mounts the widget. The toggle has no observable
  effect for the user today.
