# Caro's Ledge — Complete Finishing Dispatch (v3)

**Date:** 2026-05-06 (v2 authored), 2026-05-07 (v3 transition edits applied)
**Supersedes:** docs/FINISHING-DISPATCH-2026-05-06.md (v2)
**Master HEAD at v3 authoring:** `3f8d813` (post PR #54 Map Coverage gaps card)
**Master HEAD at v2 commit:** `946403c` (post Wave 3 surface + PR-K smaller-delta merges)
**Master HEAD at v2 authoring:** `cfc7f7e` (post Wave 2 merges) — preserved for historical context

## Intended-use principle (anchors v3 Wave 4 restructure)

**Design audits are commentary on design fidelity. Preview files are design exploration source-of-truth, not architectural authority. When audit findings conflict with intended use, intended use wins.**

This principle (now codified in `fsi-app/.claude/CLAUDE.md`) anchors the Wave 4 restructure below. Several audit findings that v2 treated as full-rebuild scope turned out to be commentary on preview files that intentionally lag the live surfaces. Where the live surface is correct per intended use, the dispatch downscopes to a preview-update or a single targeted fix; where the live surface is genuinely broken, the rebuild proceeds as scoped. Functional and factual fixes proceed autonomously; aesthetic drift the system cannot resolve from intended-use signals routes to integrity flags for Admin review (see CLAUDE.md "Integrity flags — agent contract for design_drift"), not to Jason chat.

## Changes from v2

- **Wave 4 restructured per audit-framing principle.**
  - **PR-I Operations rebuild → CANCELED.** Audit confirmed the live Operations surface is OK as shipped; the "rebuild" scope was commentary on a preview that no longer matches intended use. Closes the rebuild scope. If specific functional issues surface later, they get individual targeted PRs, not a full rebuild dispatch.
  - **PR-H Research full reframe → DOWNSCOPED to Source coverage note.** Audit's "horizon scan reframe" was commentary; the live Research surface plus Hotfix-4 context pass already covers the intended use. Remaining actionable item is a Source coverage note on the Pipeline tab — bundled into Track A as Agent A1.
  - **PR-J Map full fix → DOWNSCOPED.** Two actionable items remain: (1) Abstract toggle removal (Track A Agent A2 — the toggle was a preview-era affordance with no operator value), (2) Coverage gaps data-driven (Track A Agent A3 — already merged at PR #54, `3f8d813`). Sub-national markers + 5-canonical-jurisdictions question is Track C (integrity-flag routing if the agent can't resolve from dispatch context).
- **Wave 4 = three tracks running concurrently.**
  - **Track A: 5 surface agents** (small targeted fixes carved out of the canceled/downscoped Wave 4 PRs above, plus PR #54 already merged).
  - **Track B: this doc PR** (`docs/wave4-documentation-and-integrity-flags`) — design-audit framing codified, dispatch v3 commit, preview cleanup, design_drift integrity-flag agent contract documented.
  - **Track C: self-routing via integrity flags** — design drift the agents can't resolve from dispatch context lands as `category='design_drift'` flag rows for Admin review, no Jason bottleneck. Schema vehicle for these flags is documented in CLAUDE.md as a separate-dispatch dependency (current `agent_integrity_flag` columns on `intelligence_items` don't carry a category yet).

## Changes from v1

- Added Hotfix wave (between Wave 2 and Wave 3) addressing F4/F5 routing regression, dashboard panel issues, map UX, perf audit, Research context pass
- Restructured Tier 1 jurisdictional rollout from "data layer track at lower concurrency" to dedicated full-concurrency track running parallel to surface waves
- Tier 1 collapses from 8 to 12 wave windows to 3 windows (Tier 1 Wave A all US, Wave B international, Wave C major cities)
- EU 5 regulation inserts pulled forward as parallel small dispatch in Tier 1 Wave A
- Wave 2 follow-ups (PR-E2, PR-E3, PR-G2, topic backfill) folded into Wave 5 tail

## Three transition edits applied 2026-05-07 (v2 authoring → v2 commit)

Between v2 authoring (post Wave 2) and v2 commit (post Wave 3), three adjustments were applied to reflect actual execution state:

1. **Wave 3 already executed.** PR-F (#38), PR-L (#40), PR-A2 (#39) merged sequentially. Wave 3 PRECONDITION for Hotfix (originally "Wave 2 merged, fire Hotfix") is replaced by "Wave 3 + PR-K smaller-delta merged, fire Hotfix."
2. **PR-K reframed: rebuild → additive smaller-delta completion.** The original PR-K agent halted at investigation finding the community surface ~90% built (Phase C had already shipped composer, posts, promote, moderation, notifications). Re-dispatch landed an additive 5-component scope (VerifierBadge, RoleBadge, HowPublishingWorks, VendorMentionsRail, CouncilMembersRail) plus side-rail layout and label tweak. Merged at PR #41 (`946403c`).
3. **Tier 1 Wave A regional lists carve out NY/WA/TX.** PR-A2 (#39, merged at `23304a5`) already retagged + source-linked NY, WA, TX state-level items. Tier 1 Wave A West agent excludes US-WA. Midwest agent excludes US-TX. Northeast agent excludes US-NY. State counts adjust accordingly (West 11, Midwest 16, Northeast 10).

## End-state definition

Platform reaches finished state when:

- All 23 F-series page-level audit items resolved or explicitly deferred with rationale
- All 6 actionable CC cross-cutting items resolved (CC1 through CC6; CC7 not actionable)
- All IA divergences resolved (resolved in Wave 2)
- All 17 locked decisions implemented in surfaces
- Tier 1 jurisdictional rollout complete (50 US states + DC + 5 territories, 27 EU members, 4 UK nations, 13 CA provinces, AU federal + 8, APAC priority, major cities)
- EU 5 missing regulation inserts complete (ReFuelEU, Clean Trucking, AFIR, EU ETS Directive, CBAM)
- Wave 2 follow-ups merged (PR-E2 workspace_settings backend, PR-E3 watchlist persistence, PR-G2 time-series aggregation, topic backfill)
- Master plan PRs PR-D through PR-N all merged

## Track structure (3 tracks)

**Surface track:** Visual audit propagation. Hotfix wave + Waves 3, 4, 5. Sequential, gates wave by wave on prior wave's merge state.

**Tier 1 jurisdictional track:** Sub-national + national jurisdictional rollout. 3 waves at full concurrency (5 to 6 parallel agents per wave). Runs parallel to surface track, file-disjoint by jurisdiction legacy_id partition.

**Architectural foundations track:** CLAUDE.md updates, principle codifications, infrastructure improvements. Folded into surface PRs where appropriate, no dedicated dispatches.

## Coordination invariants (apply to all waves)

- **Verification-before-authorization.** Investigation first, halt conditions enforced, per-step verification logged.
- **Code state and data state are separate stores.** Data writes are durable on script execution, not on PR merge. Code reverts do not undo data effects.
- **No bypass flags** (`--force`, `--admin`, `--no-verify`).
- **Halt and surface on scope expansion or unexpected state.**
- **File-disjoint partitioning across parallel agents,** confirmed by `gh pr view --json files` before merge.
- **No PR merges without explicit authorization** (autonomous mode merges per dispatch contract within wave; human-in-the-loop only at halt conditions and end-of-wave summary).
- **Sequential merges within a wave** with smoke between.

## Concurrency budget per wave window

Based on Wave 2's clean 4-agent execution and Tier 1 work being more file-disjoint than surface work:

- Hotfix wave window: 4 surface agents
- Surface waves 3 to 5: 3 to 4 agents per wave
- Tier 1 Wave A: 5 regional US agents + 1 EU inserts agent = 6 agents
- Tier 1 Wave B: 5 international regional agents = 5 agents
- Tier 1 Wave C: 1 to 2 major cities agents = 1 to 2 agents

Tier 1 waves run parallel to surface waves where possible. Maximum concurrent agents per wave window: 9 (Hotfix 4 + Tier 1 Wave A 5). Fall back to staggered if Claude Code surfaces coordination issues.

---

## Hotfix wave (immediate, post Wave 2)

Addresses Wave 2 regression + previously-documented-but-unfixed issues + perf audit + Research context pass.

**Audit items addressed:** F4/F5 (corrected), dashboard panel independence, dashboard regulation links, map UX (partial PR-J pulled forward), perf gap, Research stopgap (full PR-H still in Wave 4).

### Hotfix wave paste-ready dispatch

```
DISPATCH: Hotfix wave
Four parallel agents via worktrees, file-disjoint, branched off
master at cfc7f7e. Autonomous execution per autonomous mode dispatch.

═══════════════════════════════════════════════════════════════════
HOTFIX 1: F4/F5 routing revert + Dashboard panel fixes
═══════════════════════════════════════════════════════════════════
BRANCH: fix/hotfix-1-dashboard
PR TITLE: fix: dashboard routing revert + panel independence + regulation links

SCOPE
1. Revert PR-G's F4/F5 routing change. DashboardHero priority
   callouts route to /regulations?priority=X NOT /market?priority=X.
   The "10 critical" badge represents critical regulations and
   should land on filtered regulations index.
2. THIS WEEK panel independence: WEEKLY BRIEFING and WHAT CHANGED
   each have independent expand/collapse state. Currently expanding
   one collapses or blanks the other. Likely shared state variable
   in panel component; split into two state variables.
3. THIS WEEK panel regulation links: each regulation entry within
   WEEKLY BRIEFING and WHAT CHANGED links to its detail page.
   Currently text-only. Wrap entries in anchor tags. Browser back
   button returns to dashboard.

INVESTIGATION FIRST
- DashboardHero current routing logic post-PR-G
- THIS WEEK panel state management
- Regulation entry rendering, identify click handler gap

VERIFICATION
- Priority badges route to /regulations?priority=X
- WEEKLY BRIEFING and WHAT CHANGED expand/collapse independently
- Regulation entries within both panels route to detail page
- Back button from detail returns to dashboard
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

═══════════════════════════════════════════════════════════════════
HOTFIX 2: Map critical-UX fixes (partial PR-J pulled forward)
═══════════════════════════════════════════════════════════════════
BRANCH: fix/hotfix-2-map
PR TITLE: fix: map clickability + count reconciliation + abstract overlay

SCOPE
1. Map markers clickable. Clicking a jurisdiction marker opens
   detail panel (same panel as right-side "BY JURISDICTION CLICK
   TO FLY" list).
2. Critical count reconciliation. Header "4 critical" vs EU
   per-jurisdiction "6 critical": determine source of each, reconcile
   to one consistent metric, or label both unambiguously.
3. Map regulation preview links to full detail. Currently shows
   only preview content. Add "View full detail" link or make
   preview header clickable.
4. Abstract view button overlay fix. Real/Abstract toggle in
   top-right overlays content beneath. Fix z-index / positioning.

INVESTIGATION FIRST
- MapView.tsx structure
- Marker click handlers
- Source of "4 critical" header count vs per-jurisdiction count
- Regulation preview component within detail panel
- Abstract view toggle z-index and position

VERIFICATION
- All map markers clickable
- Critical count consistent or labels disambiguated
- Regulation preview links to full detail page
- Abstract view toggle no longer overlays content
- No regressions on existing map filtering or rendering
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

NOTE: Full PR-J scope (5 canonical jurisdictions per Decision #13,
sub-national markers integrated with Tier 1 data) remains in Wave 4.

═══════════════════════════════════════════════════════════════════
HOTFIX 3: Performance audit
═══════════════════════════════════════════════════════════════════
BRANCH: perf/hotfix-3-perf-audit
PR TITLE: perf: full audit + identified bottleneck fixes

SCOPE
Use existing measurement infra from PR #30
(scripts/measure-bundles.mjs, @next/bundle-analyzer,
docs/PERF-PLAYBOOK.md):
1. Bundle size analysis on production builds
2. Network waterfall on slowest pages (Dashboard, Regulations,
   Market Intel, Map)
3. Server-side query profiling (Supabase round trips)
4. Hydration timing per surface
5. Image and font loading

Compare against PR #30 baseline (docs/perf-snapshot-2026-05-06.txt)
to identify Wave 1 + Wave 2 regressions.

INVESTIGATION FIRST
- Run measurement scripts, capture current state
- Identify top 3 to 5 bottlenecks ranked by impact
- Surface findings before any fixes

WRITES PHASE (after Jason explicitly authorizes specific fixes)
- Apply only the fixes Jason authorizes
- Possible: code-splitting tweaks, query optimization, ISR
  cache adjustments, image upgrades, font-display fixes

VERIFICATION
- Post-fix bundle sizes vs baseline
- Post-fix page load times cold and warm
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Bottleneck root cause is in third-party dependency
- Fix requires architectural change (defer to dedicated PR)
- More than 3 bottlenecks compete for priority

This is the ONE hotfix where writes phase requires explicit
auth, since perf optimization choices have real architectural
implications.

═══════════════════════════════════════════════════════════════════
HOTFIX 4: Research surface context pass
═══════════════════════════════════════════════════════════════════
BRANCH: ui/hotfix-4-research-context
PR TITLE: ui: Research surface context pass (pre-PR-H)

SCOPE
Lightweight context-add to make Research surface useful before
full PR-H reframe in Wave 4. Add per current Pipeline tab:
- Header context explaining what Pipeline shows
- Per-stage description (Draft, Active review, Published)
- Quick filter or counter (X items in Active review, Y Published
  this week)
- Source attribution surfaced more prominently per CC3
- Light "What's new this week" callout for recent Published items

Do NOT do full PR-H operator horizon scan reframe. That's Wave 4.

INVESTIGATION FIRST
- ResearchView.tsx Pipeline tab current rendering
- Available data (per-stage counts, recency, source attribution)

VERIFICATION
- Research surface gives coherent first impression
- Pipeline entries have clearer context
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Full reframe needed to add useful context (means PR-H must
  move to hotfix scope; surface for decision)

POST-PR (all 4 agents)
Hotfix 1, 2, 4 merge autonomously per dispatch contract.
Hotfix 3 perf writes phase requires explicit auth.

After Hotfix wave merges and production green, fire next track
per updated plan.
```

---

## Surface track Wave 3 — MERGED 2026-05-07

**Status:** Complete. PR-F (#38) merged at `be34f1b`. PR-L (#40) merged at `e144550`. PR-A2 (#39) merged at `23304a5`. PR-K reframed to smaller-delta completion (#41) merged at `946403c`. All deploys SUCCESS.

**Targets:** PR-F, PR-K (smaller-delta), PR-L. Three surface PRs composing with Wave 1 + Wave 2 results. (PR-A2 ran on the data track in this same window per dispatch elasticity.)

**Audit items addressed:** F6, F7, F9, F10, F14, F15, F17, F20, F22 (full), F23, CC2 remaining, CC6, Decisions #11, #12, #14, #15.

**Note on PR-K reframing:** original PR-K dispatch said "rebuild." Investigation revealed Phase C community surface was ~90% built (composer, PostList, group detail, promote dialog, moderation, notifications all live). Re-dispatch landed additive deltas only — no regression of working code. See "Three transition edits" at top of this document.

### Wave 3 paste-ready dispatch

```
DISPATCH: Surface Wave 3
PRECONDITION: Hotfix wave merged, production green.

Three parallel surface agents via worktrees, branched off master
post-Hotfix. Autonomous execution.

═══════════════════════════════════════════════════════════════════
PR-F: Regulation detail design components
═══════════════════════════════════════════════════════════════════
BRANCH: ui/pr-f-regulation-detail-components
PR TITLE: ui: Regulation detail components + production-additions
rationalization

SCOPE per F22, F23, Decision #12, composes with PR #24

Right-rail cards (orthogonal to #24)
- AFFECTED LANES card (origin/destination city pairs, freight
  modes, volume estimates)
- OWNER & TEAM card (assignee, team distribution, last update)
- LINKED ITEMS card (cross-references with relationship type)

Summary content area (composes with #24)
- Inline horizontal Timeline placed within Summary flow alongside
  #24's Tier 2 Operational briefing expander; additive, not
  replacement

Production additions rationalization (Decision #12)
- KEEP: Penalty calculator, Sources, Exposure, Add to watchlist
- DROP: Team notes tab from TABS array
- MERGE: Full text into Synopsis. Rewire #24's
  navigateToFullSection helper to scroll to inline Full text
  section, OR remove if Tier 2 expander obviates

INVESTIGATION FIRST
- RegulationDetailSurface.tsx structure post-#24 merge
- intelligence_items lane data, owner data, cross-references,
  timeline events: schema additions needed?
- item_cross_references table population
- Timeline events source columns
- Compose decision: Timeline placement, helper retention

VERIFICATION
- 4 new components render with real data or honest empty state
- TABS array no longer includes Team notes
- Synopsis tab includes inline Full text section or expander
- #24's Tier 2 expander preserved and functional
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- AFFECTED LANES requires substantial schema additions
- Timeline events have no source data
- LINKED ITEMS table empty (acceptable, render empty state)

═══════════════════════════════════════════════════════════════════
PR-K: Community Phase D rebuild
═══════════════════════════════════════════════════════════════════
BRANCH: ui/pr-k-community-phase-d
PR TITLE: ui: Community Phase D rebuild

SCOPE per F15, F17, CC2 remaining, CC6, Decisions #3, #9
- Composer (post create, edit, delete, attachments, mentions)
- Role-based groups with badges (operator, verifier, admin
  visibility)
- Threaded posts with verifier badges
- PROMOTE TO PUBLIC actions on internal posts
- Vendor mentions rail folding /vendors content (Decision #9)
- Events calendar at /community/events (Decision #3)
- HOW PUBLISHING WORKS section

Composes with PR-D's mid-rail Community placement (Wave 2).

INVESTIGATION FIRST
- CommunitySurface.tsx current state (placeholder per F15)
- community_posts, community_groups, community_events tables
  (existence)
- Mention/notification system existence
- Vendor data location post-PR-D fold
- Backend persistence requirements

VERIFICATION
- Composer functional (create, edit, delete)
- Threaded posts with verifier badges
- Role-based groups with correct membership
- PROMOTE TO PUBLIC works
- Events calendar functional
- Vendor mentions surface
- HOW PUBLISHING WORKS section present
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Backend persistence not in place (split K1 surface + K2 backend)
- Mention/notification system requires substantial new work
- Events calendar requires substantial calendar component build

═══════════════════════════════════════════════════════════════════
PR-L: Profile + Settings restorations + W2.E admin dot
═══════════════════════════════════════════════════════════════════
BRANCH: ui/pr-l-profile-settings-restorations
PR TITLE: ui: Profile + Settings restorations + admin-attention dot

SCOPE
Profile restorations (Decision #15, F6, F7, F20)
- AT A GLANCE block (key stats, recent activity, role indicator)
- QUICK LINKS section
- "You are Owner" indicator
- Populated form fields (name, email, role, sector preferences,
  workspace memberships)

Settings restorations (Decision #14, F9, F10, F14)
- BRIEFING SCHEDULE section
- SAVED SEARCHES section
- HELP section
- Notifications-in-GENERAL: do not modify (PR-D shipped this)

W2.E admin-attention dot restoration in UserMenu (orphaned by
PR-D's rail cleanup)

INVESTIGATION FIRST
- ProfilePage.tsx and SettingsPage.tsx state post-PR-D
- User data sources (memberships, sector_subscriptions,
  saved_searches)
- Briefing schedule storage and delivery mechanism
- W2.E admin-attention dot original location and behavior

VERIFICATION
- All 4 Profile restorations render
- All 3 Settings restorations functional
- Admin-attention dot restored inside UserMenu
- No regression on PR-D's notifications-in-GENERAL
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Saved searches table doesn't exist (data layer first)
- Briefing schedule delivery mechanism doesn't exist (split L1
  surface + L2 delivery backend)

POST-PR (all 3 agents)
Surface consolidated report. Merge sequentially per autonomous
mode. After production green, fire Wave 4.
```

---

## Surface track Wave 4 (v3 restructure)

**Targets:** Three concurrent tracks per the intended-use principle (see "Changes from v2" at top of this document).

- **Track A — Surface (5 agents).** Small carve-outs of the canceled/downscoped Wave 4 PRs. Source coverage note on Research Pipeline (Agent A1), Abstract toggle removal on Map (Agent A2), Coverage gaps data-driven on Map (Agent A3 — already merged at PR #54 `3f8d813`), plus two additional surface agents working in parallel on file-disjoint targets discovered during dispatch authoring.
- **Track B — Documentation + integrity-flag wiring.** This very doc PR (`docs/wave4-documentation-and-integrity-flags`) commits dispatch v3, codifies the audit-framing + accordion-default principles in CLAUDE.md, updates the settings preview to track the live SettingsPage tab roster, archives orphan community preview iterations, and documents the agent contract for `category='design_drift'` integrity flags.
- **Track C — Self-routing integrity flags.** No dispatch fires; agents writing flags is the dispatch. Drift findings the agents can't resolve from dispatch context surface as Admin-queue rows rather than chat interruptions to Jason.

**Audit items addressed (v3):** F12 actionable remainder (Source coverage note), F19 actionable remainders (Abstract toggle removal — done in Track A; Coverage gaps data-driven — done at PR #54). Operations rebuild scope explicitly canceled. Sub-national markers + 5-canonical-jurisdictions deferred to Track C self-routing if the agents can't resolve, and to PR-N URL param work in Wave 5 for the URL-handling layer.

### Wave 4 v3 dispatch — Track A (paste-ready)

```
DISPATCH: Wave 4 Track A surface agents
PRECONDITION: Wave 3 merged, production green. PR #54 (Coverage gaps
data-driven) already merged at 3f8d813.

Two parallel surface agents via worktrees, file-disjoint. Autonomous
execution per autonomous mode dispatch.

═══════════════════════════════════════════════════════════════════
A1: Research Pipeline source coverage note
═══════════════════════════════════════════════════════════════════
BRANCH: ui/wave4-a1-research-source-coverage-note
PR TITLE: ui: Research Pipeline source coverage note

SCOPE
Adds a header note on the Research Pipeline tab explaining current
source coverage at the per-stage level. Replaces the dropped "full
reframe" — the live surface plus Hotfix-4 context pass already cover
the intended use; the only remaining audit-actionable item is making
source coverage explicit per stage.

INVESTIGATION FIRST
- ResearchView.tsx Pipeline tab structure post-Hotfix-4
- per-stage source counts (Draft, Active review, Published)
- existing aggregation queries that can be reused

VERIFICATION
- Source coverage note renders per stage
- Counts source from real queries (no placeholder strings)
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

═══════════════════════════════════════════════════════════════════
A2: Map Abstract toggle removal
═══════════════════════════════════════════════════════════════════
BRANCH: ui/wave4-a2-map-abstract-toggle-removal
PR TITLE: ui: Remove Map Abstract toggle (preview-era affordance)

SCOPE
Removes the Real/Abstract toggle from MapView. The toggle is a
preview-era affordance with no operator value — Real view is the only
production-relevant rendering. Hotfix-2 fixed its z-index but the
toggle itself is the design drift; intended-use principle says drop
it rather than keep maintaining it.

INVESTIGATION FIRST
- MapView.tsx toggle component + state
- any code paths that branch on the toggle state
- any URL params or stored preferences referencing Abstract view

VERIFICATION
- Toggle no longer renders
- No dead branches in MapView code
- Map renders Real view only (the production-relevant path)
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

POST-PR (both agents)
Both merge autonomously per dispatch contract. After Track A merges
and production green, Wave 4 closes. Wave 5 dispatch fires unchanged.
```

### Track B paste-ready dispatch (this PR)

See `docs/wave4-documentation-and-integrity-flags` branch. Five sub-tasks:
DESIGN-AUDIT-2026-05.md commit (skipped — file not in repo), dispatch v3
update (this commit), preview/settings.html update to live tab roster,
community preview archival (community-v1/-v2.html files not present in
repo — surfaced rather than fabricated), CLAUDE.md additions for design-
audit framing + accordion default + design_drift integrity flag contract.

### Track C contract

Agents writing `category='design_drift'` flags is the dispatch. The
schema vehicle (an `integrity_flags` table with a `category` column) is
not in place as of `3f8d813`; current `agent_integrity_flag` columns on
`intelligence_items` flag agent-emitted brief integrity, not design
drift. Until the vehicle ships (separate dispatch), drift findings the
agents can't resolve surface in PR descriptions and verification logs
under a "design drift surfaced" heading. See CLAUDE.md for the full
contract.

### v2 Wave 4 dispatch (RETAINED FOR HISTORICAL CONTEXT — DO NOT FIRE)

```
DISPATCH: Surface Wave 4
PRECONDITION: Wave 3 merged, production green.

Three parallel surface agents via worktrees. Autonomous execution.

═══════════════════════════════════════════════════════════════════
PR-H: Research full reframe
═══════════════════════════════════════════════════════════════════
BRANCH: ui/pr-h-research-reframe
PR TITLE: ui: Research full reframe to operator horizon scan

SCOPE per F12, Decision #5
Full reframe from editorial-workflow to operator-facing horizon
scan. Stays in main rail (Option B override of design intent).
- Horizon scan grid (regulations entering tracking, recently
  updated, approaching effective dates)
- Confidence/maturity indicators per item
- Filter controls (jurisdiction, sector, time horizon)
- Pipeline tab preserved per Hotfix 4 context pass enhancements
- Source coverage tab remains hidden per #33

INVESTIGATION FIRST
- ResearchView.tsx structure post-Hotfix-4
- Pipeline tab existing functionality
- Horizon scan data: aggregation queries that exist or need
  building?

VERIFICATION
- Horizon scan grid renders with real items
- Confidence/maturity indicators visible
- Filter controls work
- Pipeline tab preserved
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Horizon scan data requires substantial aggregation queries
  (split H1 surface + H2 data layer)

═══════════════════════════════════════════════════════════════════
PR-I: Operations full rebuild
═══════════════════════════════════════════════════════════════════
BRANCH: ui/pr-i-operations-rebuild
PR TITLE: ui: Operations full rebuild

SCOPE
Full rebuild beyond #33 hide pattern:
- Horizontal pill region nav (replace accordion-only layout)
- Populated cells for regions with data
- COVERAGE callout
- OWNERS-CONTENT section

INVESTIGATION FIRST
- OperationsPage.tsx structure post-#33
- Per-region data state (which regions have data, which empty)
- Horizontal pill nav component reusability
- COVERAGE data sources

VERIFICATION
- Horizontal pill nav functional
- Regions with data show populated cells
- Empty regions retain #33 banner pattern
- COVERAGE callout renders with real data or honest empty state
- OWNERS-CONTENT functional
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Most regions still have no data (defer until data backfill)
- COVERAGE requires aggregation queries

═══════════════════════════════════════════════════════════════════
PR-J: Map full fix
═══════════════════════════════════════════════════════════════════
BRANCH: ui/pr-j-map-full-fix
PR TITLE: ui: Map jurisdiction canonical labels + sub-national
markers

SCOPE per F19, Decision #13
Resolves hotfix-2's residual scope:
- 5 canonical jurisdictions consistently rendered (EU, UK, US,
  IMO, ICAO)
- Sub-national markers for all states/regions with tagged data
  post-Tier 1 Wave A (50 US states + DC + territories) and
  Tier 1 Wave B (international sub-nationals)
- Click filtering at sub-national granularity
- Resolves residual 30 vs 16 vs 5 inconsistency

PRECONDITION: Tier 1 Wave A merged at minimum (provides US
sub-national data to surface). Tier 1 Wave B preferred but not
required.

INVESTIGATION FIRST
- MapView.tsx state post-Hotfix-2
- 30/16/5 inconsistency root cause across components
- Map library sub-national geography support
- Tier 1 data layer state at dispatch time

VERIFICATION
- 5 canonical jurisdictions rendered consistently
- Sub-national markers for all Tier 1 jurisdictions with data
- Click filtering at sub-national granularity
- No regressions on existing functionality
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- 30/16/5 inconsistency spans many components
- Map library doesn't support sub-national geography
  (substantial component swap)

POST-PR
After all 3 merge and production green, fire Wave 5.
```

---

## Surface track Wave 5 (tail)

**Targets:** PR-M, PR-N, F3 specific work, Wave 2 follow-ups (PR-E2, PR-E3, PR-G2, topic backfill).

### Wave 5 paste-ready dispatch

```
DISPATCH: Surface Wave 5 tail + Wave 2 follow-ups
PRECONDITION: Wave 4 merged, production green.

Multiple parallel agents per dispatch concurrency. Autonomous execution.

═══════════════════════════════════════════════════════════════════
PR-M: Admin organizations table
═══════════════════════════════════════════════════════════════════
BRANCH: ui/pr-m-admin-organizations
SCOPE per F21, Decision #11
- Admin organizations table (workspace-level org list, member
  counts, roles, last activity)
- Role-gating verification per F21
- Honest empty state if data not ready

═══════════════════════════════════════════════════════════════════
PR-N: URL param sub-national filtering
═══════════════════════════════════════════════════════════════════
BRANCH: ui/pr-n-url-params-sub-national
SCOPE
- /regulations accepts ?region=us-ca, ?region=us-ny, etc.
- /map accepts equivalent URL params
- Composes with PR-E sector chips and PR-J map markers

═══════════════════════════════════════════════════════════════════
PR-F3: Dashboard Weekly Briefing reflow tail (if not absorbed)
═══════════════════════════════════════════════════════════════════
BRANCH: ui/pr-f3-dashboard-reflow
SCOPE
F3 specific work not absorbed by PR-C layout shell or Hotfix-1.
If F3 fully resolved by Hotfix-1's panel fixes, close without PR.

═══════════════════════════════════════════════════════════════════
PR-E2: workspace_settings backend
═══════════════════════════════════════════════════════════════════
BRANCH: data/pr-e2-workspace-settings
SCOPE
Server-side persistence for "save as default" filter combinations
on /regulations. Replaces localStorage stopgap from PR-E.

═══════════════════════════════════════════════════════════════════
PR-E3: watchlist persistence
═══════════════════════════════════════════════════════════════════
BRANCH: data/pr-e3-watchlist-persistence
SCOPE
Server-side watchlist table + API for WATCHLIST sidebar (Market
Intel, regulation detail "Add to watchlist"). Replaces stopgap.

═══════════════════════════════════════════════════════════════════
PR-G2: time-series aggregation
═══════════════════════════════════════════════════════════════════
BRANCH: data/pr-g2-aggregation
SCOPE
Aggregation queries for COST TRAJECTORY, KEY METRICS deltas,
OWNERS-CONTENT actionOwner population. Replaces honest empty
state banners from PR-G with real data.

═══════════════════════════════════════════════════════════════════
TOPIC BACKFILL: re-tag intelligence_items.topic
═══════════════════════════════════════════════════════════════════
BRANCH: data/topic-backfill
SCOPE
Re-tag intelligence_items.topic where empty (clean fix for
"Uncategorized" pattern surfaced in Wave 2 PR-G).
```

---

## Tier 1 jurisdictional track

Three waves at full concurrency. Runs parallel to surface waves.

### Tier 1 Wave A: All US states + DC + territories + EU 5 inserts

**Concurrency:** 5 regional US agents + 1 EU inserts agent = 6 agents
**Coverage:** 50 US states + DC + 5 territories (PR, VI, GU, AS, MP) + 5 EU regulation inserts
**Fires:** Parallel to Hotfix wave (file-disjoint with surface work) OR sequentially after Hotfix lands. Recommend parallel; fall back to sequential if Claude Code surfaces coordination issues.

#### Tier 1 Wave A paste-ready dispatch

```
DISPATCH: Tier 1 Wave A, all US states + DC + territories + EU
inserts. Six parallel agents via worktrees, file-disjoint by
legacy_id partition. Branch off master at cfc7f7e.

GLOBAL CONSTRAINTS per autonomous mode dispatch.

CROSS-AGENT FILE-DISJOINT CONFIRMATION
All six agents touch intelligence_items + sources tables. Partition:
- US Regional agents: legacy_ids namespaced by state
  (e.g., wa_clean_air_act, tx_hb_2127, fl_house_bill_77)
- EU inserts agent: legacy_ids namespaced by EU regulation
  (eu_refueleu_2023_2405, eu_clean_trucking_2024_1610, etc.)
No legacy_id overlap. Each agent confirms its planned namespace
before any writes.

═══════════════════════════════════════════════════════════════════
AGENT 1: West region (11 jurisdictions, US-WA already covered by PR-A2)
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-us-west
PR TITLE: data: Tier 1 US West region (OR, NV, AZ, ID, MT,
WY, CO, UT, NM, AK, HI)

SCOPE
Per state in this region, reuse PR-A1/PR-A2 template:
- Investigation: existing intelligence_items currently tagged
  ["US"] that should be ["US-{state-code}"]; existing source
  rows for state environmental body + state legislature; sub-
  national retag candidates
- Source registry inserts: state environmental body + state
  legislature where missing
- Item retags: jurisdiction_iso ["US"] to ["US-{state-code}"]
  for state-specific items
- source_id relinks to new state sources

States in scope (ISO 3166-2 codes):
US-OR, US-NV, US-AZ, US-ID, US-MT, US-WY, US-CO, US-UT,
US-NM, US-AK, US-HI

NOTE: US-WA was already retagged + source-linked by PR-A2 (#39,
merged 2026-05-07). WA Ecology + WA State Legislature source rows
already exist at tier 1. Skip WA in this agent.

INVESTIGATION FIRST (consolidated across all 12 states)
- Per state: count of items needing retag, source rows existing,
  source rows needing insert
- Surface single consolidated regional report

WRITES PHASE (after Jason auth)
- Per state, execute writes with per-step verification
- Single PR with all 12 states bundled

═══════════════════════════════════════════════════════════════════
AGENT 2: Midwest region (16 jurisdictions, US-TX already covered by PR-A2)
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-us-midwest
PR TITLE: data: Tier 1 US Midwest region

SCOPE
US-OK, US-KS, US-NE, US-ND, US-SD, US-MN, US-IA, US-MO,
US-AR, US-LA, US-MS, US-WI, US-IL, US-IN, US-MI, US-OH

NOTE: US-TX was already retagged + source-linked by PR-A2 (#39,
merged 2026-05-07). TCEQ + Texas Legislature source rows already
exist at tier 1. Skip TX in this agent.

Same pattern as Agent 1.

═══════════════════════════════════════════════════════════════════
AGENT 3: South region (9 jurisdictions)
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-us-south
PR TITLE: data: Tier 1 US South region

SCOPE
US-AL, US-GA, US-FL, US-TN, US-KY, US-NC, US-SC, US-VA, US-WV

Same pattern.

═══════════════════════════════════════════════════════════════════
AGENT 4: Northeast region (10 jurisdictions, US-NY already covered by PR-A1 + PR-A2)
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-us-northeast
PR TITLE: data: Tier 1 US Northeast region

SCOPE
US-MD, US-DE, US-NJ, US-PA,
US-CT, US-RI, US-MA, US-NH, US-VT, US-ME

NOTE: US-NY was covered across PR-A1 (NYC LL97 retag, 2026-05-06)
and PR-A2 (NY State Senate/Assembly source insert, 2026-05-07).
NY DEC source already exists in registry at tier 1. NY state-level
items beyond LL97 had zero retag candidates per PR-A2's deeper
investigation. Skip NY in this agent.

Same pattern.

═══════════════════════════════════════════════════════════════════
AGENT 5: DC + Territories (6 jurisdictions)
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-us-dc-territories
PR TITLE: data: Tier 1 US DC + territories

SCOPE
US-DC, US-PR, US-VI, US-GU, US-AS, US-MP

Same pattern. Note territories may have minimal existing
intelligence_items; investigation likely surfaces few retags
but source registry still needs entries for completeness.

═══════════════════════════════════════════════════════════════════
AGENT 6: EU 5 regulation inserts
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-eu-5-inserts
PR TITLE: data: 5 missing EU regulations

SCOPE per handoff doc Priority 5
Insert as intelligence_items rows:
- ReFuelEU Aviation (Regulation EU 2023/2405)
  legacy_id: eu_refueleu_2023_2405
- Clean Trucking Regulation (EU 2024/1610)
  legacy_id: eu_clean_trucking_2024_1610
- AFIR (EU 2023/1804)
  legacy_id: eu_afir_2023_1804
- EU ETS Directive (EU 2023/959)
  legacy_id: eu_ets_directive_2023_959
- CBAM (EU 2023/956)
  legacy_id: eu_cbam_2023_956

For each: title, slug, jurisdiction_iso = ["EU"], priority per
content (likely CRITICAL or HIGH for these), source_url,
source_id linked to existing EU source rows, full_brief generated
per existing structure.

After inserts: scan existing intelligence_items.full_brief for
cross-references; create item_cross_references where appropriate.

INVESTIGATION FIRST
- Confirm none exist (search legacy_id, title)
- Identify EU source rows for source_id linkage
- Estimate brief generation cost (~$0.80)

VERIFICATION
- 5 new rows with correct metadata
- full_brief populated per structure
- Cross-references count surfaced before applying
- Build clean, typecheck clean, Vercel checks SUCCESS

HALT AND SURFACE IF
- Any of the 5 already exists in some form
- Brief generation cost exceeds 2x estimate ($1.60)
- More than 20 cross-reference candidates surface

POST-PR (all 6 agents)
Surface consolidated report covering all regions + EU inserts.
Each agent's writes phase requires Jason's auth (data layer per
the 6-decisions pattern from PR-A1). After all six PRs open and
verification logs surface, Jason authorizes merges per agent.

End-state: 50 US states + DC + 5 territories tagged, 5 EU
regulations inserted, ready for surface PR-J Map fix in Wave 4
to expose sub-national markers.
```

### Tier 1 Wave B: International (5 agents)

**Concurrency:** 5 international regional agents
**Coverage:** 27 EU member states + 4 UK nations + 13 CA provinces + AU federal + 8 + APAC priority (SG, HK, JP, KR)
**Fires:** Parallel to Wave 3 (file-disjoint with surface work) OR sequentially after Tier 1 Wave A lands. Recommend parallel.

#### Tier 1 Wave B paste-ready dispatch

```
DISPATCH: Tier 1 Wave B international, 5 parallel agents.
PRECONDITION: Tier 1 Wave A merged.

═══════════════════════════════════════════════════════════════════
AGENT 1: EU member states first batch (Western + Nordic)
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-eu-western-nordic
PR TITLE: data: Tier 1 EU Western + Nordic member states

SCOPE
DE, FR, NL, BE, LU, AT, DK, SE, FI, IE (10 member states)
Same PR-A1 template pattern.

═══════════════════════════════════════════════════════════════════
AGENT 2: EU member states second batch (Southern + Eastern)
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-eu-southern-eastern
PR TITLE: data: Tier 1 EU Southern + Eastern member states

SCOPE
ES, IT, PT, GR, MT, CY (Southern, 6) + PL, CZ, SK, HU, RO, BG,
HR, SI, LT, LV, EE (Eastern, 11) = 17 member states
Same pattern.

═══════════════════════════════════════════════════════════════════
AGENT 3: UK 4 nations
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-uk-nations
PR TITLE: data: Tier 1 UK 4 nations

SCOPE
GB-ENG (England), GB-SCT (Scotland), GB-WLS (Wales), GB-NIR
(Northern Ireland)
Source registry: DEFRA, Scottish EPA, NRW, NIEA respectively.

═══════════════════════════════════════════════════════════════════
AGENT 4: Canadian provinces + territories
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-ca-provinces
PR TITLE: data: Tier 1 Canadian provinces + territories

SCOPE
13 entities: ON, QC, BC, AB, MB, SK, NS, NB, NL, PE (provinces)
+ YT, NT, NU (territories)
Source registry: ECCC + provincial bodies (e.g., Quebec MELCC,
Ontario MECP, BC MOECCS).

═══════════════════════════════════════════════════════════════════
AGENT 5: Australia + APAC priority
═══════════════════════════════════════════════════════════════════
BRANCH: data/tier1-au-apac
PR TITLE: data: Tier 1 Australia + APAC priority jurisdictions

SCOPE
Australia: AU federal + 6 states + 2 territories (NSW, VIC, QLD,
WA, SA, TAS, ACT, NT) = 9
APAC priority: SG, HK, JP, KR = 4

Same pattern.

POST-PR (all 5 agents)
Surface consolidated report. Auth per agent for writes phase
(data layer pattern). Merge per agent after auth.

End-state: full international Tier 1 coverage. Combined with
Tier 1 Wave A: 50 US + DC + territories + 27 EU + 4 UK + 13 CA
+ 9 AU + 4 APAC = ~107 sub-national/national jurisdictions.
```

### Tier 1 Wave C: Major cities

**Concurrency:** 1 to 2 agents
**Coverage:** Major-city jurisdictions per Decision #1 priority list (NYC, LA, London, Tokyo, Shanghai, Dubai, Singapore-city, HK, Sydney, Melbourne, Toronto, Montreal, Paris, Berlin, etc.)
**Fires:** After Tier 1 Wave B merges. Smaller scope, single dispatch.

#### Tier 1 Wave C paste-ready dispatch

```
DISPATCH: Tier 1 Wave C major cities, 1 to 2 agents per scope.
PRECONDITION: Tier 1 Waves A and B merged.

SCOPE
Major-city jurisdictions per Decision #1 priority list. Cities
where municipal-level regulation is freight-relevant for
Dietl/Rockit operations:

US cities: NYC (already partly tagged via LL97 in PR-A1), LA,
Chicago, Houston, San Francisco, Boston, Seattle, Miami,
Philadelphia, Atlanta

International cities: London (GB-LON, already partly via UK
nations work), Paris (FR-IDF or city), Berlin (DE-BE), Tokyo
(JP-13), Shanghai (CN-31), Dubai (AE-DU), Singapore (full city,
already covered as country), Hong Kong (HK), Sydney (AU-NSW
city-level), Toronto (CA-ON city), Montreal (CA-QC city)

Note: ISO 3166-2 city codes are inconsistent across countries.
Use established ISO codes where they exist; document custom
codes (e.g., US-NYC, UK-LON) where they don't.

Same PR-A1 template pattern. 1 agent for US cities, 1 agent for
international cities.

POST-PR
Surface consolidated report. Tier 1 jurisdictional rollout
complete after this wave merges.
```

---

## End-state verification checklist

After all waves complete, verify:

- [ ] All 23 F-series resolved or explicitly deferred
- [ ] All 6 actionable CC items resolved
- [ ] All IA divergences resolved (achieved Wave 2)
- [ ] All 17 locked decisions implemented
- [ ] Sector chip system live (Decision #1, achieved Wave 2)
- [ ] Tier 1 jurisdictional rollout complete: 50 US states + DC + 5 territories + 27 EU members + 4 UK nations + 13 CA provinces + AU federal + 8 + APAC priority + major cities
- [ ] EU 5 regulation inserts complete (Tier 1 Wave A)
- [ ] Wave 2 follow-ups merged (PR-E2, PR-E3, PR-G2, topic backfill in Wave 5)
- [ ] All master plan PRs merged (PR-D through PR-N)
- [ ] CLAUDE.md contains: architecture model, perf discipline, verification-before-authorization, code-vs-data state separation, plus principles discovered in execution
- [ ] All wave dispatch logs and verification logs committed to docs/

## Concurrency and pacing

**Estimated wave windows to completion:** 5 to 7 sessions

| Window | Surface | Tier 1 (parallel) | Total agents |
|---|---|---|---|
| 1 | Hotfix (4) | Tier 1 Wave A (6) | 10 |
| 2 | Wave 3 (3) | Tier 1 Wave B (5) | 8 |
| 3 | Wave 4 (3) | Tier 1 Wave C (1 to 2) | 4 to 5 |
| 4 | Wave 5 tail (multiple) | (complete) | 4 to 6 |
| 5+ | Polish + edge cases | - | as needed |

If 10-agent first window strains Claude Code coordination, fall back to staggered: Hotfix wave alone first, Tier 1 Wave A second. Adds one wave window; same total work.

**Halt conditions to escalate:**

- Cross-agent file-disjoint confirmation fails repeatedly
- Production deploy regressions on smoke
- More than 2 PRs per wave halt-and-surface for scope expansion
- Investigation surfaces fundamental data layer gaps blocking multiple PRs

## Document handoff

This finishing dispatch v3 belongs at `docs/FINISHING-DISPATCH-2026-05-06.md` (replaces v2, which replaced v1). Pairs with:

- `docs/SESSION-AUDIT-2026-05-05.md`
- `docs/VISUAL-RECONCILIATION-2026-05-06.md`
- `docs/SESSION-STATUS-REVIEW-2026-05-06.md`
- `docs/BUILD-BREAKDOWN-2026-05-06.md`
- `docs/PERF-PLAYBOOK.md`

Three-document handoff for next session if interrupted: this finishing dispatch v3 + visual reconciliation + session-audit.
