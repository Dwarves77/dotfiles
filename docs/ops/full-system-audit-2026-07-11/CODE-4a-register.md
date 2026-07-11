# CODE-4a Register — UI Components (`fsi-app/src/components/**`)

Full-system audit 2026-07-11 · baseline master `71bcbd46a30e6b4e5f953a4949c3b8e276dacf8b` · READ-ONLY.
Slice: 183 files / 56,778 lines per `_manifest_files.tsv`. Every file read line-by-line; liveness
established by a reverse-import map (direct imports, `@/…` aliases, relative paths, the two barrels
`ui/index.ts` + `credibility/index.ts`, and `next/dynamic` call sites) — components listed dead below
have ZERO importers on any of those channels, verified individually.

## Headline results

1. **No FABRICATION-class content on any MOUNTED surface.** The 2026-06-02 surface-honesty purge held:
   every live customer surface (Regulations, Market Intel, Research, Operations, Community, Dashboard,
   Map, Assistant) renders RPC/row-backed data with honest em-dash / omit / PendingFrame states. The
   only hardcoded-metrics components left in the tree (`domains/*`, see F-03) are imported by nothing.
2. **~10,000 lines (38 files, ~18% of the slice) are dead weight** — orphaned pre-redesign surfaces
   retained in the tree.
3. Two live defects: a 404 link on the Community surface (F-01) and a dead admin affordance (F-02).
4. Accordion doctrine (closed-by-default, no `defaultOpen={i===0}`) holds everywhere live; the one
   all-open accordion set (RegulationDetailSurface reader) is intentional per HANDOFF section 6.2.
5. Tier-label discipline holds: every live tier renderer imports `src/lib/tier-labels.ts`
   (CredibilityBadge.tsx:30, OperationsDetailSurface, ResearchFindingDetailSurface, AskAssistant).
   One admin-only inline legend remains (F-06).

---

## Findings

### breaks-customer

**F-01 — Community links to nonexistent `/account` route (404).**
`src/components/community/CommunityRooms.tsx:1295` and `:1472` — `<Link href="/account">`.
No `/account` route exists under `src/app` (account surfaces are `/profile` and `/settings`);
`next.config.ts` redirects only `/events` → `/community`. Customer clicking either link gets a 404.
Next-action: repoint both links to `/profile` (or `/settings`, whichever the copy intends).

**F-02 — Admin "Run discovery" button is a dead affordance.**
`src/components/admin/CoverageMatrixView.tsx:617-624` emits `onAction({ kind: "discover", … })`
(union declared at :89), but the consumer `src/components/admin/AdminDashboard.tsx:619-620` handles
only `action.kind === "bulk-add"` — the `discover` branch silently no-ops. Rendered button, bound
handler, no effect. Admin-facing, so customer blast radius is zero, but it reads as a working control.
Next-action: wire `discover` to the discovery endpoint or remove the button until it is.

### breaks-doctrine

**F-03 — FABRICATION-class hardcoded intelligence in the three `domains/*` components (currently
unmounted — dead-weight today, breaks-doctrine the moment anything imports them).**
- `src/components/domains/RegionalIntelligence.tsx` (831 lines) — hardcoded per-region electricity
  tariffs, labor costs, solar rules presented as data with `data_provider` citations (e.g. :55
  "AED 0.23-0.38/kWh commercial", :118 "£0.25-0.35/kWh commercial (2024)").
- `src/components/domains/TechnologyTracker.tsx` (430 lines) — `TECH_CATEGORIES` with battery pack
  costs, EV ranges, TCO-parity estimates stated as fact (:48 "$115/kWh", "$139/kWh (2023)"; :50
  "~200 globally" MCS chargers), each with provider/URL/update-frequency dressing.
- `src/components/domains/FacilityOptimization.tsx` (253 lines) — `FACILITY_CATEGORIES` (:21-115)
  with tariff ranges and certification mandates (:28 "$0.08-0.20/kWh") in the same as-if-live format.
Zero importers (the retired "7 intelligence domains" model, navigated by the equally dead
`TabBar.tsx`). These are exactly the content class the surface-honesty purge removed from live
surfaces; their continued presence is a re-mount hazard.
Next-action: delete all three with TabBar.tsx (F-05), or move to an explicitly non-buildable archive.

**F-04 — Phase-language in customer-visible error copy (stale).**
`src/components/community/CommunityShell.tsx:291` comment "C4 ships these endpoints; until then they
404" and `:294` customer-visible error string "Invitations API not live yet — wiring up in C4."
The endpoints (`/api/community/invitations/[id]/accept|decline|revoke`) exist now, so the copy is
both stale AND leaks internal phase-language ("C4") to a customer surface on the error path.
Next-action: replace with a generic retryable-failure message; delete the stale comment.

### dead-weight (0 importers, verified; 38 files, ~10,047 lines)

**F-05 — Retired pre-redesign surfaces still in tree.** Candidate next-action for all: delete
(git history preserves them), EXCEPT where noted.

| File | Lines | Note |
|---|---|---|
| `regulations/RegulationsSurface.tsx` | 1963 | Old kanban Regulations surface; `/regulations/page.tsx` mounts RegulationsLedger |
| `domains/RegionalIntelligence.tsx` | 831 | See F-03 |
| `pages/OperationsPage.tsx` | 1012 | `/operations/page.tsx` mounts OperationsLedger. (Did correctly remove the FACTS object in the 2026-06-02 purge) |
| `community/NotificationPreferencesPanel.tsx` | 551 | `profile/NotificationPreferences.tsx` is the live one |
| `domains/TechnologyTracker.tsx` | 430 | See F-03 |
| `resource/SectorSynopsis.tsx` | 423 | **Do NOT delete without operator ruling** — CLAUDE.md "Sector Activation" doctrine says SectorSynopsisView stays (SHELVE decision). See F-08 |
| `resource/ResourceDetail.tsx` | 418 | Head of the dead legacy resource chain (imports TimelineBar, ShareMenu, SectorSynopsisView) |
| `admin/IssuesQueue.tsx` | 416 | Superseded by `admin/redesign/AdminIssuesRail`; references non-existent admin tab IDs |
| `market/PolicySignals.tsx` | 371 | Pre-redesign /market; MarketIntelLedger is live |
| `profile/AtAGlanceBlock.tsx` | 262 | UserProfilePage builds its own blocks inline |
| `settings/DashboardSettings.tsx` | 261 | SettingsPage uses inline DashboardSettingsCard |
| `explore/FilterBar.tsx` | 217 | 4 textual refs in comments/paths, no imports |
| `market/WatchlistSidebar.tsx` | 209 | |
| `settings/HelpSection.tsx` | 204 | SettingsPage uses HonestFrame inline |
| `resource/IntelligenceMetadataStrip.tsx` | 201 | Still listed in fsi-app/.claude/CLAUDE.md "Phase B.2.5 surfaces" — stale doctrine ref (F-08) |
| `market/KeyMetricsRow.tsx` | 200 | |
| `resource/ResourceCard.tsx` | 179 | |
| `market/OwnersContent.tsx` | 168 | |
| `profile/QuickLinksSection.tsx` | 154 | UserProfilePage uses inline QuickLinksRail |
| `ui/Skeleton.tsx` | 131 | Incl. ResourceCardSkeleton/SourceListSkeleton/DomainViewSkeleton — all orphaned |
| `market/FreightRelevanceCallout.tsx` | 114 | |
| `TabBar.tsx` | 112 | Retired 7-domain nav ("technology", "regional", "Research & Sources") |
| `home/HousekeepingSection.tsx` | 106 | HomeSurface builds housekeeping inline |
| `profile/SectorSelector.tsx` | 98 | Doctrine says it is the shared placeholder at /onboarding + /profile — it is NOT mounted by either (F-08) |
| `ShareMenu.tsx` (resource/) | 93 | Only importer is dead ResourceDetail |
| `resource/TimelineBar.tsx` | 87 | Only importer is dead ResourceDetail |
| `explore/SearchBar.tsx` | 86 | |
| `ui/StatCard.tsx` | 86 | Live surfaces use `cl-stat-card` CSS directly or their own stat markup |
| `ui/UrgencyFilterBar.tsx` | 71 | Incl. the REGULATIONS/MARKET_INTEL/RESEARCH_URGENCY config exports |
| `admin/MtdSpendTile.tsx` | 69 | AdminDashboard renders MTD inline; only remaining ref is a comment in generate-brief.ts |
| `ui/Section.tsx` | 56 | 83 grep hits are the English word "section", zero imports. (Compliant `defaultOpen=false`, moot) |
| `home/TypesetSection.tsx` | 56 | |
| `explore/SortSelector.tsx` | 48 | |
| `ui/Card.tsx` | 37 | Zero importers direct or via barrel |
| `credibility/index.ts` | 33 | Barrel with zero importers (credibility components are imported directly) |
| `ui/PageContext.tsx` | 24 | |
| `ui/index.ts` | 17 | Barrel with zero importers; its own header admits migration never progressed |

Liveness boundary note: `ui/PriorityBadge.tsx` and `ui/RowCard.tsx` each have 1 external importer —
both are LIVE and are excluded from the dead totals (38 files / ~10,047 lines).
(Verified live ui primitives and importer counts: Button 15, EditorialMasthead 11, SystemErrorBanner 5,
AiPromptBar 4, Toast 3, ModeBadge 2, Tag 2, WatchButton 2, Tooltip 1, AcronymText 1, ErrorState 1,
Toggle 1, Pill 1, RowCard 1, PriorityBadge 1.)

### cosmetic

**F-06 — Inline tier legend duplicates the ruled vocabulary.**
`src/components/sources/SourceHealthDashboard.tsx` renders a hardcoded T1-T7 legend consistent with
`src/lib/tier-labels.ts` today but outside the drift guard (tier-labels.test.mjs). Admin-only.
Next-action: import TIER_LABELS for the legend text.

**F-07 — Hardcoded "Vol IV" masthead eyebrow.**
`src/components/ui/EditorialMasthead.tsx:9,62` — volume is fixed at "IV" per the 2026-04 handoff;
week number and day are computed. Editorial affectation, not a data claim. Note only.

### doctrine-drift (documentation vs tree — for the master gap register)

**F-08 — fsi-app/.claude/CLAUDE.md references components that are no longer mounted:**
- "Sector Activation … Both surfaces use the shared `SectorSelector` component" — SectorSelector has
  zero importers; OnboardingWizard and UserProfilePage each build their own sector UI.
- "DO NOT remove `SectorSynopsisView`. The UI surface stays" — its only mount (ResourceDetail) is
  itself unmounted, so the retained surface is unreachable. Keeping the file honors the SHELVE
  decision's letter but not its "surface stays" intent. Operator ruling needed before any deletion.
- Key-files list still names `resource/IntelligenceMetadataStrip.tsx` as a live Phase B.2.5 surface.

---

## Verified-good notes (per-file defect classes 1-6 swept; no findings)

- **Regulations**: RegulationsLedger, RegulationDetailSurface (all-open reader accordions intentional
  per HANDOFF 6.2), sections/* (ActionList/ObligationsTable/ProseSection/RegulationSections/
  RegulationTimeline/SectionCard/SourcesList all carry F-1-style unbacked-row guards),
  AffectedLanesCard/OwnerTeamCard/LinkedItemsCard/PriorityDropdown/BulkSelectBar/ConfidenceFacet/
  SectorChipFilter/SortRow/ViewToggles/DismissedStash (closed `<details>`, no `open`).
- **Market**: MarketIntelLedger, MarketSignalDetailSurface (honest section-4 price frame; NotesField
  persists to workspace_item_overrides), TrajectoryBars (data-backed, 3-belt guard).
- **Operations**: OperationsLedger, OperationsItemsView, OperationsDetailSurface (matrix-gated S3/S4,
  honest omit-notes, tier-labels import).
- **Research**: ResearchLedger, ResearchFindingDetailSurface (em-dash key figure when absent).
- **Dashboard (home/)**: DashboardHero (TILES_AS_LIVE_FILTERS=false — disabled-by-design plumbing,
  not a dead affordance: tiles render non-interactive), DashboardAskBar, TopPriority, Watchlist,
  WhatChanged (never implies live detection), Supersessions, AwaitingReview, ByOwner, CoverageGaps,
  SurfaceCoverage, RailCard, HomeSurface — all counts from getSurfaceCounts/getWorkspaceAggregates
  fail-soft aggregates, none recomputed from visible rows, none hardcoded.
- **Community**: fully wired to /api/community/*; NotificationsBell/List, ModerationQueue/Actions,
  GroupModals, Post/PostList/PostComposer/ReplyComposer, PromotePostButton/Dialog, ReportPostMenu,
  RoleBadge/VerifierBadge, CommunityMasthead/RegionTabs/SearchResults/Sidebar/CouncilMembersRail,
  BrowseGroupsGrid, GroupCard/GroupHeader, HowPublishingWorks, types.ts. (Sole defects = F-01, F-04.)
- **Map**: MapPageView (live, mounts MapView via next/dynamic:43), MapView (type + dynamic import
  from /map/page.tsx), jurisdictionCentroids.ts. Honest mode-tag caption.
- **Admin**: AdminDashboard (modulo F-02), CoverageMatrixView (modulo F-02), IntegrityFlagsView,
  PlatformIntegrityFlagsView, IngestRejectionsView, PendingJurisdictionReviewView,
  TierOpinionDisagreementsView, ResearchPipelineQueueView, CommunityPickupsQueueView, BulkImportView,
  OrganizationsTable, InvitationsPanel, IssueFilterCaption, ProvenanceFailures, redesign/*
  (AdminIssuesRail computed-sum totals; WorkspacesUsageRow "Active this month" honest-pending em-dash;
  FlagsRejectionsQueue; MembersPanel).
- **Sources**: SourceHealthDashboard (modulo F-06), SourceAdminControls, CanonicalSourceReview,
  ProvisionalReviewCard, SourceTierAuditPanel, B2ProgressBanner, IntersectionDetectionView,
  SourceProvenanceBadge.
- **Settings/Profile/Account/Onboarding**: SettingsPage (dynamic-imports DataSummary,
  SupersessionHistory, ArchiveViewer, SavedSearchesSection — all live via next/dynamic),
  BriefingScheduleSection (real workspace_settings write), SavedSearchesSection (localStorage,
  honestly labeled local), UserProfilePage, profile/MembersPanel (org-scoped ban),
  OrganizationPanel, NotificationPreferences, AccountMasthead, AccountPrimitives, OnboardingWizard
  (persists profiles + workspace_settings.sector_profile; workspaceStore.setSectorProfile is
  client-only by design), InvitationLandingPage, NoWorkspaceLanding.
- **Shell/root/auth/credibility**: AppShell, Sidebar, PageMasthead, SectionHeader, StatStrip,
  BackToTop, ThemeInitializer, AskAssistant (tier-labels import), ExportBuilder (Blob download,
  constraint-compliant), AuthProvider (server-hydrated), UserMenu, UserMenuDropdown (dynamic),
  CommunityShell (modulo F-04), CredibilityBadge (TIER_LABELS import, n/a fallback for invalid tier),
  BiasBadge, CitationCountChip, JurisdictionChip, ProvenancePanel (composes, no placeholder fallback),
  RecencyChip, SignalStrength.
- **Live ui primitives**: Button, Pill, Tag, Toast, Toggle, Tooltip/AcronymText (static definitional
  glossary — qualitative definitions, no metric claims), ModeBadge, PriorityBadge, RowCard,
  EditorialMasthead (modulo F-07), ErrorState, SystemErrorBanner, AiPromptBar (dispatches
  `open-ask-assistant`, consumed by AskAssistant), WatchButton (persists via /api/watchlist,
  optimistic with revert — the wired replacement for the old local-state stubs).

---

## Manifest check-off: 183/183 files (lines reconciled)

`awk` over `_manifest_files.tsv` slice `fsi-app/src/components/**`: 183 files, 56,778 lines — matches
the read set exactly (file-by-file list verified against the tsv dump; ±1-line trailing-newline
variance between tsv counts and Read output on 3 files, treated as reconciled).

## Tool-call count

~275 total for this agent (267 tool_use events recorded in the session transcript at register-writing
time, plus the final verification and write calls). Breakdown by kind: Read (bulk of calls — every
slice file), Bash (reverse-import mapping, route existence checks, manifest reconciliation), Grep
(targeted pattern sweeps), TodoWrite (progress tracking), Write (this register only).

## Deviation log

1. **No DB SELECT cross-check run.** The task allowed optional SELECT-only verification of NULL
   counts for render-without-backing-field findings; none of the findings required DB adjudication
   (all live surfaces guard absent fields client-side with honest states), so zero DB calls were
   made — keeps the read-only surface minimal.
2. **Import-graph via bash grep loops** rather than per-file Grep tool calls — required to build the
   183-file reverse-import matrix efficiently; every dead verdict was then re-verified individually
   (barrels, relative paths, next/dynamic) before inclusion in F-05. One loop produced a
   false-negative sweep (quoting defect, returned 0 for known-live imports); it was discarded and
   re-run correctly rather than trusted.
3. **Two files >1,900 lines** (RegulationsSurface.tsx, CommunityRooms.tsx) read in multiple offset
   passes to stay within Read limits; full line coverage confirmed.
4. **This register file is the one write** performed by this agent (the audit deliverable per the
   task OUTPUT spec). No existing file was modified; no scripts executed with side effects; zero
   fetches; zero DB writes.
