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

- ~~7 credibility components~~ → CLOSED via Build 7/8/9/11: CredibilityBadge + BiasBadge + CitationCountChip + RecencyChip mounted on Research PipelineRow (Build 8.1-8.4), Market Intel cards (Build 7), Operations cards (Build 9), Dashboard WeeklyBriefing items (Build 11). ProvenancePanel + JurisdictionChip + SignalStrength remain available for ad-hoc mount; not customer-facing dead code.
- ~~`/api/admin/sources/[id]/tier-override` route + columns~~ → CLOSED Phase 7: SourceTierOverrideControl in SourceAdminControls inlines base / effective / override + override form + revert + audit trail per DP-1 single-pane principle.

### A.2 Blueprint data layer (consumer in scheduled build)

- ~~`intelligence_item_citations` table + `get_source_citation_stats` RPC swap~~ → CLOSED Build 8.1 (migration 098 body swap landed).
- ~~`source_bias_tags` table~~ → CLOSED Build 8.3: BiasBadge mounted on PipelineRow with source_bias_tags read path.
- ~~`source_tier_opinions` table + `get_tier_opinion_disagreements` RPC~~ → CLOSED Phase 7: TierOpinionDisagreementsView surfaces every disagreement with accept/reject/defer actions; migration 099 adds RLS + review state columns.
- ~~`ingest_rejections` + `pending_jurisdiction_review` tables~~ → CLOSED Phase 7: IngestRejectionsView + PendingJurisdictionReviewView mounted under new AdminDashboard tabs.

### A.3 Routes awaiting UI consumers

- `/api/admin/sources/discover` → CoverageMatrixView discover button
- `/api/admin/sources/recently-auto-approved` → SourceHealthDashboard sub-tab
- `/api/admin/sources/verify` → operator-investigate-then-decide (possibly superseded internally)
- ~~`/api/community/groups/[id]/invite`~~ → CLOSED Build 10 InviteModal wires this route.
- ~~`/api/community/invitations/[id]/revoke`~~ → CLOSED Build 10 InviteModal: per-row Revoke button (gated by server-side `can_revoke` flag) calls POST, confirms via inline prompt, optimistic-removes the row on success, surfaces errors via toast. Route returns 404 not-found, 409 if status != pending, 403 unauthorized, 200 ok; service-role write after inviter-or-admin auth check. Soft-delete via status='revoked' (schema uses status enum, not revoked_at timestamp). Verified 2026-05-22.
- ~~`/api/notifications/trigger`~~ → CLOSED via notifications fanout dispatch (reply + invite + moderation + promote + mention via shared `dispatchNotification`).

### A.4 Broken-but-needed (currently visible to customers; wire to real data)

- ~~`DashboardHero` hardcoded "3 inside 14 days"~~ → CLOSED Build 11: workspace-scoped critical-items snapshot via new `lib/dashboard/critical-items.ts` (compliance_deadline + item_timelines fallback).
- `/regulations` hardcoded "last sync 4 min ago" → small wire-up to `workspace.last_sync`
- `RegulationDetailSurface` "Workspace data pending" → workspace exposure RPC OR strip if exposure not in current blueprint scope
- ~~`WatchlistSidebar` persistence pending~~ → CLOSED Build 7: rail renamed to "Highest-priority indicators" matching what it surfaces; pin-persistence disclaimer stripped (future user_watchlist work can restore the Watchlist label).
- ~~`CostTrajectoryChart` pending banner~~ → CLOSED Build 7: slot removed from MarketPage; component file deleted. Cost time-series schema + chart returns when the data-source + granularity decision lands (per sprint-2 planning Build 9 operator decision matrix).
- ~~`OwnersContent` coming soon~~ → CLOSED Build 7: component now returns null when no items have populated actionOwner (collapses the rail). Renders grouped feed automatically as soon as owner data lands.
- ~~`KeyMetricsRow` period selector~~ → CLOSED Build 7: non-functional 30D/90D/1Y buttons removed; returns alongside the cost time-series schema.
- ~~`GroupHeader` Members + Settings "ships in C6"~~ → CLOSED Build 10: MembersModal + SettingsModal + InviteModal wired via new `/api/community/groups/[id]/members`, `/settings`, `/invite-candidates`, `/invitations` routes.
- ~~`CommunityShell` masthead search "Search coming soon"~~ → CLOSED Build 10: masthead search dropdown via new `/api/community/search?q=&scope=` (ILIKE; FTS deferred to OBS follow-up).
- ~~`CommunitySidebar` hardcoded unread/mentions~~ → CLOSED Build 10: unread + mention counts now wired via `/api/community/notifications/counts`.
- `ResearchView` source coverage matrix → Build 8 explicit scope
- `OnboardingWizard` LinkedIn import → LinkedIn OAuth + profile-mapping (operator confirmed: KEEP)
- `GeopoliticalSignals` function → Build 7 Market Intel signal engine (geopolitical disruption is first-class freight market signal; Strait of Hormuz / supply chain disruption type). Phase-1 `GeopoliticalSignals.tsx` flagged for Build 7 to evaluate (reuse vs build new).
- `SearchBar` / search function → Build 10 Community search + cross-surface search consideration in Build 11. Phase-1 `SearchBar` code flagged for reuse-or-rebuild evaluation.
- `PageContext` + `AiPromptBar` (Intelligence Assistant UX) → dedicated small dispatch: assistant bar must expand inline as a drop-down, NOT open secondary popup. Cross-cutting on every surface.
- ~~`UserProfilePage` Organization tab~~ → CLOSED Phase 7: OrganizationPanel (identity + owner + member count + edit form + status banner) replaces PanelComingSoon.
- ~~`UserProfilePage` Members tab~~ → CLOSED Phase 7: MembersPanel (role picker + save + revoke per row; owner cannot revoke self) wired via new `/api/orgs/[org_id]/members` route.

---

## Category B — SCHEDULED IN NAMED BUILD (no separate dispatch needed)

- EmptyState "coming soon" copy rewording on /market and /operations → Build 7 + Build 9 absorb as side effect
- Operations regex chip matchers → Build 9 explicit
- ~~Dashboard count incoherence (643 vs 69+35 etc)~~ → CLOSED Build 11: headline + tile sums + per-surface rail counts now reconcile by construction with explicit "uncategorized" bucket.
- ~~Dashboard regulation-skew (no Community surface)~~ → CLOSED Build 11 + OBS-41: new DashboardSurfaceCoverage widget mounts all five surfaces as co-equal entry points.
- ~~Community sidebar placement~~ → CLOSED Build 10: Community moved into intelligence-pages nav block between Operations and Map.
- Community region taxonomy fork from intelligence surfaces → deferred to OBS-65 (Build 10 commit c600d36 documents divergence rationale).

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

---

## Phase 3 — Status (closed 2026-05-21)

All 10 Category A wire-up dispatches landed on master:

| Dispatch | Status | Master commit |
|---|---|---|
| 3.1 /regulations last-sync | CLOSED | earlier |
| 3.2 Assistant inline UX | CLOSED | earlier |
| 3.3 notifications fanout | CLOSED | 7c13f64 |
| 3.4 Build 8 Research (8.1-8.4) | CLOSED | aa4ac6a + 8.2-8.4 |
| 3.5 Build 7 Market Intel | CLOSED | 44d0b09 |
| 3.6 Build 9 Operations | CLOSED | c6fa803 |
| 3.7 Build 10 Community | CLOSED | 07982b8 |
| 3.8 LinkedIn OAuth | CLOSED | b1b3f90 |
| 3.9 Build 11 Dashboard | CLOSED | 6df86a6 |
| 3.10 Phase 7 admin chrome | CLOSED | fd3ba2b |

## Phase 4 — Status (investigation 2026-05-21)

Category E investigation complete (`docs/plans/category-e-investigation-2026-05-21.md`, commit `e9819d3`). 17 items investigated; 2 already closed by Build 7/9 EmptyState rewrites (items 12 + 13); 3 LIVE not dead (items 6 SortRow, 16 tiers.ts comment, 17 firstFetchClassify); 11 remain pending operator decision. Operator decides item-by-item per `feedback_site_code_deletes_need_operator_signoff.md`.

## Phase 5 — Status (investigation 2026-05-21)

Source health architecture investigation complete (`docs/plans/source-health-architecture-investigation-2026-05-21.md`, commit `4d374e0`). 4 questions investigated with decision matrix. Key findings: `source_health_summary` view conclusively unused; dashboard conflates `trust_score.overall` with reliability slice; skill Section 8 amendment required if health becomes customer-facing; `ProvenancePanel` is lowest-reversibility-cost extension path. Operator decides.

## Operator follow-ups (post-Phase-3)

1. **Apply migration 099 to remote Supabase** — `099_tier_opinion_review_state.sql` adds RLS + review_state columns to `source_tier_opinions`. Phase 7 disagreement-review UI surface depends on this. Not applied by the dispatch agent (operator-authorized DB writes only).
2. **Phase 4 Category E decisions** — 11 remaining items in `docs/plans/category-e-investigation-2026-05-21.md` need keep/wire/remove per item.
3. **Phase 5 Source health decisions** — 4 questions in `docs/plans/source-health-architecture-investigation-2026-05-21.md`.
4. **Workspace admin role expansion (optional)** — Phase 7 MembersPanel currently restricts role-change + revoke to owners. 2-line server change in `/api/orgs/[org_id]/members` if workspace `admin` role should also manage non-owner members.
