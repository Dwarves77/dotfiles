# Dead-Code Disposition Report — Caro's Ledge (2026-05-21)

**Status:** AUTHORITATIVE disposition set. Compiled from Claude Code's evidence-based audit + operator corrections (D split, function-to-blueprint level, Category C replacement verification).

**Audit corpus:** ~80 dead-code items across customer-facing site/app code identified via 3 parallel sweep agents (dead routes + components, dead schema artifacts, half-built features) on 2026-05-21.

**Blueprint anchors:** `caros-ledge-platform-intent` SKILL.md (five-surface model + Section 11 anti-patterns), `source-credibility-model` SKILL.md, `docs/sprint-2/sprint-2-planning-2026-05-18.md` (Builds 7-11), `docs/plans/build-8-research-surface.md`, ADR-001 + ADR-002 + ADR-003.

**Operator binding rules invoked:**
- No dead code on the site (feedback_no_dead_code.md)
- Site code deletes need operator signoff (feedback_site_code_deletes_need_operator_signoff.md)
- D1/D2 split: strip only true stubs for features NOT in blueprint; broken-but-needed = wire-up with elevated urgency
- Function-to-blueprint level: ask whether the FUNCTION serves blueprint, not whether the component file is present

---

## Category A — WIRE UP (serves blueprint, needs mounting/completion)

### A.1 Fresh built, waiting for mount

- 7 credibility components (`CredibilityBadge`, `BiasBadge`, `CitationCountChip`, `JurisdictionChip`, `ProvenancePanel`, `RecencyChip`, `SignalStrength`) → Build 7/8/9
- `/api/admin/sources/[id]/tier-override` route + columns → Phase 7 admin UI in SourceAdminControls

### A.2 Blueprint data layer (consumer in scheduled build)

- `intelligence_item_citations` table + `get_source_citation_stats` RPC swap → Build 8 Dispatch 8.1 (now primary deliverable)
- `source_bias_tags` table → BiasBadge mount in Build 7/8/9
- `source_tier_opinions` table + `get_tier_opinion_disagreements` RPC → Phase 7 admin disagreement-review surface
- `ingest_rejections` + `pending_jurisdiction_review` tables → Phase 7 admin triage queue

### A.3 Routes awaiting UI consumers

- `/api/admin/sources/discover` → CoverageMatrixView discover button
- `/api/admin/sources/recently-auto-approved` → SourceHealthDashboard sub-tab
- `/api/admin/sources/verify` → operator-investigate-then-decide (possibly superseded internally)
- `/api/community/groups/[id]/invite` → Build 10
- `/api/community/invitations/[id]/revoke` → Build 10
- `/api/notifications/trigger` → Build 10 OR separate notifications-fanout dispatch (bell + preferences already wired)

### A.4 Broken-but-needed (currently visible to customers; wire to real data)

- `DashboardHero` hardcoded "3 inside 14 days" → Build 11 (workspace-anchored critical-items snapshot)
- `/regulations` hardcoded "last sync 4 min ago" → small wire-up to `workspace.last_sync`
- `RegulationDetailSurface` "Workspace data pending" → workspace exposure RPC OR strip if exposure not in current blueprint scope
- `WatchlistSidebar` persistence pending → Build 7 alerts wiring
- `CostTrajectoryChart` pending banner → Build 7 cost time-series schema + chart
- `OwnersContent` coming soon → Build 7 owner attribution
- `KeyMetricsRow` period selector → Build 7 time-period filtering
- `GroupHeader` Members + Settings "ships in C6" → Build 10
- `CommunityShell` masthead search "Search coming soon" → Build 10 Postgres FTS
- `CommunitySidebar` hardcoded unread/mentions → notifications fanout + Build 10
- `ResearchView` source coverage matrix → Build 8 explicit scope
- `OnboardingWizard` LinkedIn import → LinkedIn OAuth + profile-mapping (operator confirmed: KEEP)
- `GeopoliticalSignals` function → Build 7 Market Intel signal engine (geopolitical disruption is first-class freight market signal; Strait of Hormuz / supply chain disruption type). Phase-1 `GeopoliticalSignals.tsx` flagged for Build 7 to evaluate (reuse vs build new).
- `SearchBar` / search function → Build 10 Community search + cross-surface search consideration in Build 11. Phase-1 `SearchBar` code flagged for reuse-or-rebuild evaluation.
- `PageContext` + `AiPromptBar` (Intelligence Assistant UX) → dedicated small dispatch: assistant bar must expand inline as a drop-down, NOT open secondary popup. Cross-cutting on every surface.
- `UserProfilePage` Organization tab → multi-tenant org chrome (ADR-001 three-layer tenant model; org IS blueprint core)
- `UserProfilePage` Members tab → `org_memberships` management (blueprint core)

---

## Category B — SCHEDULED IN NAMED BUILD (no separate dispatch needed)

- EmptyState "coming soon" copy rewording on /market and /operations → Build 7 + Build 9 absorb as side effect
- Operations regex chip matchers → Build 9 explicit
- Dashboard count incoherence (643 vs 69+35 etc) → Build 11
- Dashboard regulation-skew (no Community surface) → Build 11 five-surface refactor
- Community sidebar placement → Build 10
- Community region taxonomy fork from intelligence surfaces → Build 10

---

## Category C — REMOVE (function delivery verified or not in blueprint)

### C.1 Phase-1 components (function delivered by active surfaces)

- `FocusView` — modal focused list not in blueprint
- `NavigationStack` — App Router delivers
- `WorkspaceProfile` — `SectorSelector` primitive in active use
- `CommunityHub` — `CommunityShell` is active surface (gaps tracked in A.4)
- `DomainItemList` — domain-grouping not in blueprint
- `TimelineView` — timeline mode not in blueprint
- `SummaryStrip` — `DashboardHero` is active dashboard hero
- `TopUrgency` — `DashboardHero` is active dashboard hero
- `ResearchPipeline` (in components/domains/) — `ResearchView.tsx` is active

### C.2 Lib + schema (verified)

- `lib/supabase.ts` `createClient()` — 3 explicit clients in active use
- `sources.tier` compat shim + `sync_sources_tier_columns()` trigger — Phase 1.5 complete; no consumers remain

### C.3 Verification pending before removal

- `/api/data/fetch-source` → verify `/api/admin/sources/[id]/fetch-now` has UI consumer + is called
- `/api/admin/sources/all` → verify AdminDashboard server-side fetch is mounted + working
- `/api/sources` → verify SourceHealthDashboard renders from server-side store without this route
- `/api/data/scan-all` → verify `/api/worker/check-sources` runs via source-monitoring.yml workflow
- `provisional_sources_review` view → verify `ProvisionalReviewCard` reads underlying tables and works without the view

---

## Category D — STRIP (feature not in current blueprint)

- `/community/events` route + RSVP buttons (not in Sprint 2)
- `/community/vendors` route + "Introduce me" CTAs (operator decision: NO VENDORS)
- `VendorMentionsRail` (vendor decision: NO VENDORS — strip entirely)
- Any other vendor-directory residue in code (sweep result fills this in)
- `Post.tsx` "Reactions coming soon" button (Phase D)
- `/api/community/posts/[id]/reactions` 501 endpoint
- `ModerationActions` Mute "phase-D stub"
- `BriefingScheduleSection` email delivery option (saves but no pipeline)
- `NotificationPreferencesPanel` email + push channel toggles (channels not in Sprint 2)
- `UserProfilePage` Billing tab (billing not in Sprint 2; org + members moved to A.4)
- `AdminDashboard` "API & integrations" tab
- `AdminDashboard` "Audit log" tab

---

## Category E — OPERATOR DECIDES ITEM-BY-ITEM (Phase 4 batch)

- `TabBar` (mobile bottom-nav function distinct from Sidebar)
- `FacilityOptimization` (Phase-1 Operations; Build 9 reuses or builds new)
- `TechnologyTracker` (Phase-1; Build 7/8 reuses or builds new)
- `RegionalIntelligence` (Phase-1 Operations; Build 9 reuses or builds new)
- `FilterBar` + `UrgencyFilterBar` (cross-surface filtering gap)
- `SortSelector` + `SortRow` (cross-surface sorting gap)
- `DueThisQuarter` widget + `showDueThisQuarter` toggle + store flag (half-built)
- `lib/briefing/systemPrompt.ts` `buildBriefingSystemPrompt` (reuse for Build 7/8 or remove)
- `ExportBuilder` (orphan UI; helpers ship via WeeklyBriefing)
- `ui/Card` + `ui/StatCard` primitives (SettingsPage + UserProfilePage inline their own)
- `PolicySignals.tsx:264` "Source pending" per-row badge (wording fix or accept)
- `OperationsPage.tsx` empty-state "Coming soon" banners (reword)
- `MarketPage.tsx` empty-state "Coming soon" banners (reword)
- `SavedSearchesSection` "Cross-device sync coming soon"
- `RegulationDetailSurface` `{false && watchlist button}` (Build 7 flip or rewrite)
- `lib/jurisdictions/tiers.ts:20` "Tier 1 placeholder" internal taxonomy
- `lib/llm/first-fetch-classify.ts` + worker stub-row creation pattern

---

## Open questions — Source health architecture (Phase 5)

`source_health_summary` view exists but has no consumer; `SourceHealthDashboard` reimplements rollup client-side. Reconsidered as architectural because source-credibility-model includes reliability as 20% of trust score (health IS conceptually part of tier).

Operator answers required:

1. Should `source_health_summary` view become the canonical source-health data layer consumed by SourceHealthDashboard + trust scoring + customer-facing health visibility?
2. Should source health become a customer-facing signal? Right now health is internal-only (feeds trust score).
3. If health becomes customer-facing: new `HealthIndicator` chip, or extension of `CredibilityBadge` / `ProvenancePanel`?
4. Does `SourceHealthDashboard` need refactoring to consume the view (if kept) instead of computing client-side?

**Disposition:** view stays in Category E pending answers. Don't remove yet.

---

## Execution phases

**Phase 1** — Pre-flight: ledger this report + run 5 C.3 verifications + vendor sweep
**Phase 2** — Atomic cleanup commit (C + D + B passive + slim engine + skill cleanup + ADR fixes + inventory fixes + orphan predicates + pre-push hook install + Build 8 plan amendment + test + push)
**Phase 3** — Category A wire-ups (small standalone first, then Build 8, then Build 7/9/10/LinkedIn parallel, then Build 11, then Phase 7 admin chrome)
**Phase 4** — Category E quick-decision batch
**Phase 5** — Source health architecture decision

**Standing rules**: verify before remove; operator signoff required before deleting site code; WHAT/WHEN/WHY/STATE when surfacing for decisions; no new rules/fitness/checks without demonstrated value; close loops as completed; stop and surface if a verification reveals an unexpected gap.
