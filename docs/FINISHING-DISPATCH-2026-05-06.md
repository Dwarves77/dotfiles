# Caro's Ledge — Complete Finishing Dispatch

**Date:** 2026-05-06
**Scope:** Single-document dispatch sequence from current state (4 open PRs: #24, #31, #32, #33) to platform design-match completion across all 23 F-series page-level audit issues, all 7 CC cross-cutting issues (CC7 not actionable), all IA divergences, all 17 locked decisions, and Tier 1 jurisdictional rollout.
**How to use:** Five waves. Each wave has its own paste-ready dispatch block. Fire wave by wave. Wait for all PRs in a wave to merge and production to be green before firing the next wave. Each PR within a wave investigates first, surfaces findings, awaits explicit authorization for writes, then writes with per-step verification.

## Coordination invariants (apply to all waves)

- **Verification-before-authorization.** Every dispatch begins with read-only investigation. Findings surface. Jason authorizes writes phase explicitly. Writes execute with per-step verification logged before PR opens.
- **Code state and data state are separate.** Writes scripts execute against the data layer with service-role privileges. Data changes are durable on script execution, not on PR merge. The PR captures audit trail and governance. Rollback of data changes requires a separate writes script. This principle gets added to CLAUDE.md in Wave 0.
- **No bypass flags.** No `--force`, `--admin`, `--no-verify` anywhere.
- **Halt and surface on scope expansion.** Investigation reveals dispatch is materially larger than estimated, agent halts and surfaces for re-scoping.
- **File-disjoint partitioning across parallel agents.** Confirmed by `gh pr view --json files` before merge.
- **No PR merges without explicit authorization.** Agent surfaces PR URL + verification log; Jason authorizes merge separately.
- **Sequential merges within a wave.** Even when PRs are file-disjoint, merge them one at a time with brief production smoke between.

---

## Wave 0: CLAUDE.md update (small, fast)

Add code-vs-data separation principle to `fsi-app/.claude/CLAUDE.md` alongside the existing verification-before-authorization principle.

### Wave 0 paste-ready dispatch

```
DISPATCH: Wave 0 CLAUDE.md update
Add code-vs-data separation principle to fsi-app/.claude/CLAUDE.md
under the existing Architecture Model section, alongside the
verification-before-authorization principle landed in PR #31.

Direct commit to master, no PR needed for an additive doc principle.

PRINCIPLE TEXT TO ADD

## Code-vs-data state separation

Code state and data state are separate stores with separate change
mechanisms.

- Code changes land via PR merge to master, then deploy to Vercel.
- Data changes land via writes scripts executed with service-role
  privileges against Supabase. Data changes are durable on script
  execution, not on PR merge.

The PR captures audit trail and governance for the writes (scripts,
verification logs, rationale, source citations). The data itself
lives in the database regardless of PR merge state.

Rollback implications:
- Code reverts (git revert + redeploy) do NOT undo data layer
  effects.
- Data rollback requires a separate writes script that explicitly
  reverses prior changes, executed with the same service-role
  privileges and the same verification discipline.
- A closed-without-merge PR for a writes script still leaves the
  data changes durable. The PR was the audit trail; the data is
  the effect.

This separation is why writes scripts in fsi-app/scripts/ live in
the repo even though they're one-shot tools. They're the audit
record of every data layer change, retrievable for forensics or
rollback construction.

Worked example: PR-A1 (PR #31). The writes script ran during the
investigate-execute cycle and updated 4 California intelligence_items,
2 California sources, and 2 sub-national retags (l7, NYC LL97).
These changes are live in production right now, regardless of
PR #31's merge state. PR #31 commits the scripts, JSON logs, and
CLAUDE.md update; it does not commit the data, which already
exists.

EXECUTION
- Read fsi-app/.claude/CLAUDE.md to find the verification-before-
  authorization section
- Insert the code-vs-data separation principle immediately after it
- Commit directly to master with message:
  docs(claude.md): add code-vs-data state separation principle
- Confirm commit landed, surface SHA

CONSTRAINTS
- No PR (this is an additive doc-only principle)
- No code or data changes
- Single commit to master
```

---

## Wave 1: Merge 4 open PRs

**Targets:** #24, #31, #32, #33. All four are OPEN, MERGEABLE, CLEAN. All four are file-disjoint from each other (verified by `gh pr view --json files`).

**Recommended merge order:** #24 first (its SummaryPanel structure is precondition for PR-F dispatch in Wave 3), then #31, then #32, then #33. Order is flexible; all four are file-disjoint, so any order works.

**End state of Wave 1:**
- #24 lands intelligence-depth layering on regulation detail Summary tab (Tier 2 Operational briefing expander, severity callout, deep-link to Full text)
- #31 lands California Tier 1 architecture (data already live; PR commits audit trail)
- #32 lands layout shell clamp (CC1 fully resolved, F1 + F2 fully resolved)
- #33 lands F13 + F18 honest empty-state pattern
- 4 of 23 F-series fully resolved (F1, F2, F13, F18); 2 partial (F3, F22)
- 1 of 7 CC fully resolved (CC1); 1 partial (CC2)

### Wave 1 paste-ready dispatch

```
DISPATCH: Wave 1 merges
Merge PR #24, #31, #32, #33 sequentially. After each merge, smoke
production briefly before the next.

For each merge:
- gh pr merge {number} --squash --delete-branch
- Wait for production deploy SUCCESS on both Vercel projects
- Capture merge SHA + production deploy URLs

Smoke checks (brief, between merges):
- After #24: visit a regulation detail page, confirm Tier 2
  Operational briefing expander renders with three subsections
  and severity callout if applicable
- After #31: visit /map, confirm California shows 4 items in
  drilldown (data is already live, smoke confirms surface
  consumption)
- After #32: visit / and /regulations at wide viewport (>1920px),
  confirm header band clamped to content column not edge-to-edge
- After #33: visit /operations, confirm region accordions show
  single banner per empty region; visit /research, confirm no
  Source coverage tab visible

Surface a Wave 1 completion report:
- 4 merge SHAs + timestamps
- 4 production deploy URLs
- Smoke results per PR
- Confirmation production gates green

CONSTRAINTS
- No --force, --admin, --no-verify, or bypass flags
- Halt and surface on any unexpected state
- Sequential merges, not parallel
```

---

## Wave 2: First parallel surface push (3 agents)

**Targets:** PR-D, PR-E, PR-G. Three highest-leverage surface PRs that don't depend on PR #24's structure.

**Audit items addressed:** F4, F5, F8 (if XS), F11, F11b, F16, IA divergence (Profile/Admin/Settings to user-footer dropdown, Community to mid-rail, /events + /vendors route moves), Decision #1 (sector chips), Decision #4 (callouts wired), Decision #6 (F11b template propagation), CC3 (source citations partial), CC4 (callouts interactivity).

**Concurrent data layer:** Critical cleanups (handoff doc Priority 7). File-disjoint with all surface PRs.

**File-disjoint matrix:**
- PR-D: AppShell.tsx, new UserFooterDropdown component, route file structure for /events + /vendors, SettingsPage.tsx (notifications-in-GENERAL section only)
- PR-E: RegulationsSurface.tsx, new filter components, sector taxonomy
- PR-G: MarketIntelView.tsx, new sub-components (WATCHLIST, KEY METRICS, COST TRAJECTORY, POLICY ACCELERATION SIGNALS, FREIGHT FORWARDING RELEVANCE, OWNERS-CONTENT)
- Cleanups: scripts only + intelligence_items updates (no surface files)

PR-D and PR-L both touch SettingsPage.tsx but PR-L is in Wave 3, not Wave 2. PR-D's notifications-in-GENERAL change is non-conflicting with PR-L's later restoration items, but they need sequential not parallel ordering.

### Wave 2 paste-ready dispatch

```
DISPATCH: Wave 2, three parallel surface agents + one data agent
File-disjoint, parallel-safe per the proven worktree pattern.
Branch off master post-Wave-1-merges.

GLOBAL CONSTRAINTS (all 4 agents)
- No --force, --admin, --no-verify, or bypass flags
- Investigation phase first, read-only, no writes
- Surface investigation findings, await Jason's authorization
- Writes phase only after auth, with per-step verification
- Halt and surface on scope expansion or unexpected state
- Do not merge without explicit merge authorization

CROSS-AGENT FILE-DISJOINT CONFIRMATION
Before any writes, each agent confirms its planned file scope does
not overlap with the other three agents' planned scopes.

═══════════════════════════════════════════════════════════════
AGENT 1, DISPATCH D: IA refactor
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-d-ia-refactor
PR TITLE: ui: IA refactor (user-footer dropdown, Community
mid-rail, route moves)

SCOPE
- Move Profile, Admin, Settings out of main rail into a user-footer
  dropdown component anchored at bottom of rail (per design source)
- Move Community from sub-nav to mid-rail (per design)
- Route moves: /events to /community/events, /vendors to
  /community/vendors (preserve existing URLs via redirects)
- F16 Notifications: relocate from standalone tab into Settings
  GENERAL tab section (per design)
- F8 Jump-to-top FAB: include if XS effort, else halt and surface

INVESTIGATION FIRST
- AppShell.tsx current rail structure
- Existing routing for /events and /vendors, redirect strategy
- SettingsPage.tsx current notifications tab structure
- Design source-of-truth for user-footer dropdown component
  (dashboard-v3.html)
- F8 FAB scoping

VERIFICATION
- Rail matches design (Community mid-rail, user-footer dropdown)
- /events redirects to /community/events; /vendors redirects to
  /community/vendors; existing bookmarks preserved
- Notifications inside Settings GENERAL tab
- All primary routes navigate correctly post-refactor
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Rail change requires layout restructuring beyond AppShell.tsx
- Route redirect strategy is non-trivial
- F8 FAB is L effort

═══════════════════════════════════════════════════════════════
AGENT 2, DISPATCH E: Regulations index sector chip system
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-e-regulations-sector-chips
PR TITLE: ui: Regulations index sector chip system + facets

SCOPE per Decision #1
- 28 sector chips for Dietl/Rockit cargo verticals: Fine Art, Live
  Events, Luxury Goods, Film/TV, Automotive, Humanitarian,
  Industrial Equipment, Construction, Metals, Mining, Aerospace,
  Energy, Oil & Gas, Dangerous Goods, Electronics, Agriculture,
  Live Animals, Forestry, Air Freight, Ocean FCL/LCL, Road, Rail,
  Personal Effects, Government/Military, Sports, Precious Goods,
  Nuclear, Dry Bulk
- CONFIDENCE facet alongside priority + jurisdiction
- Sort row (newest, priority, confidence, alphabetical)
- View toggles (card grid, dense list, table)
- Bulk select with bulk actions (Add to watchlist, Export)
- Save as default (filter combination persistence)
- Reset to my sectors (user default restoration)

INVESTIGATION FIRST
- RegulationsSurface.tsx structure, filter state management
- Sector taxonomy: data layer field on intelligence_items, or
  inferred? If inferred, halt and surface (data layer work needed
  first)
- User preferences storage for save default and my sectors
- Existing chip component reusability

VERIFICATION
- 28 chips render and filter correctly with combinator semantics
- CONFIDENCE facet visible and functional
- Sort row, view toggles, bulk select all work
- Save default + reset persist across sessions
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Sector taxonomy doesn't exist at data layer (defer chip filter
  state or land with empty)
- Save as default needs backend work (split E1 + E2)

═══════════════════════════════════════════════════════════════
AGENT 3, DISPATCH G: Market Intel content pattern rebuild
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-g-market-intel-rebuild
PR TITLE: ui: Market Intel content pattern + F11b template
propagation

SCOPE per F11, F11b, Decision #4, Decision #6, CC3
- WATCHLIST sidebar
- KEY METRICS rows with deltas, trend indicators, time period
  selector
- COST TRAJECTORY chart (multi-line per cargo vertical)
- POLICY ACCELERATION SIGNALS section with sourced badges per CC3
- FREIGHT FORWARDING RELEVANCE callout (Dietl/Rockit-specific)
- OWNERS-CONTENT section (per-owner feed)
- F4 + F5: wire dashboard callouts to filtered Market Intel views
- F11b: copy Price Signals & Trade pattern to Tech Readiness

INVESTIGATION FIRST
- MarketIntelView.tsx + sub-component structure
- Data sources for KEY METRICS, COST TRAJECTORY, POLICY
  ACCELERATION SIGNALS: aggregation queries that exist or need
  building?
- WATCHLIST persistence (backend or client?)
- Uncategorized root cause (handoff doc note)
- Source citation linkage for sourced badges

VERIFICATION
- All 6 sections render with real data or honest empty state
- F4 + F5 dashboard callouts wired to filtered views
- F11b Tech Readiness pattern matches Price Signals & Trade
- Sourced badges visible per CC3
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- KEY METRICS or COST TRAJECTORY require data layer aggregation
- WATCHLIST persistence requires backend (split G1 + G2)

═══════════════════════════════════════════════════════════════
AGENT 4, DATA TRACK: Critical cleanups
═══════════════════════════════════════════════════════════════
BRANCH: data/wave2-critical-cleanups
PR TITLE: data: critical cleanups (Wave 2)

SCOPE per handoff doc Priority 7
1. Re-run 12 stale provisional_sources through W2.F orchestration
2. Fix Dubai/UAE jurisdiction tagging: ["GLOBAL"] to ["AE"]
3. Battery brief citation table sanity check (parse showed src=0)
4. Backfill provisional_sources.discovered_for_jurisdiction for
   12 stale rows

INVESTIGATION FIRST
- Confirm 12 stale provisional_sources, identify
- Identify Dubai/UAE items under [GLOBAL]
- Battery brief: confirm src=0, identify root cause
- Confirm 12 rows lack discovered_for_jurisdiction

VERIFICATION (per fix)
- Provisional sources: pre/post count
- Dubai/UAE: pre/post jurisdiction_iso, count
- Battery citation: pre/post src count
- Backfill: pre/post non-null count
- Build clean, typecheck clean, Vercel checks SUCCESS

HALT AND SURFACE IF
- Stale source count differs from 12
- More than 5 Dubai/UAE items under wrong tag
- Battery citation root cause is in agent system prompt
- Backfill row count differs from 12

POST-PR (all 4 agents)
Surface PR URLs and verification logs in single consolidated
report. Await merge authorization.
```

---

## Wave 3: Second parallel surface push (3 agents) + Tier 1 data

**Targets:** PR-F, PR-K, PR-L. The three biggest surface rebuilds that compose with Wave 1 and Wave 2 results.

**Audit items addressed:** F6, F7, F9, F10, F14, F15, F17, F20, F22 (full), F23, plus CC2 remaining, CC6, Decisions #11 (Admin deferred), #12 (production additions rationalization), #14 (Settings restorations), #15 (Profile restorations).

**Concurrent data layer:** PR-A2 first US states batch (NY + WA + TX). Reuses PR-A1 script template.

**Composition with Wave 1 / Wave 2 results:**
- PR-F builds on PR #24's SummaryPanel structure (Tier 2 Operational briefing expander, severity callout, navigateToFullSection helper). Right-rail components (AFFECTED LANES, OWNER & TEAM, LINKED ITEMS) are orthogonal to #24. Inline horizontal Timeline composes with #24's Summary content area. Decision #12's "merge Full text into Synopsis" rewires #24's navigateToFullSection helper.
- PR-K Community rebuild composes with PR-D's mid-rail Community placement (PR-D in Wave 2 must land first).
- PR-L composes with PR-D's notifications-in-GENERAL change to SettingsPage.tsx (PR-D in Wave 2 must land first).

### Wave 3 paste-ready dispatch

```
DISPATCH: Wave 3, three parallel surface agents + one data agent
PRECONDITION: Wave 2 PR-D fully merged before this dispatch fires.
PR-K and PR-L compose with PR-D's SettingsPage.tsx and Community
mid-rail changes.

GLOBAL CONSTRAINTS (all 4 agents) per Wave 2 dispatch.

CROSS-AGENT FILE-DISJOINT CONFIRMATION
- PR-F: RegulationDetailSurface.tsx (post-#24), new right-rail
  components
- PR-K: CommunitySurface.tsx + sub-components (composer, posts,
  groups, vendor mentions, events calendar)
- PR-L: ProfilePage.tsx, SettingsPage.tsx (post-PR-D restoration
  items only, not notifications-in-GENERAL which PR-D already
  shipped)
- PR-A2: scripts + intelligence_items updates (legacy_id partition
  no overlap with surface)

═══════════════════════════════════════════════════════════════
AGENT 1, DISPATCH F: Regulation detail design components
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-f-regulation-detail-components
PR TITLE: ui: Regulation detail components + production-additions
rationalization

SCOPE per F22, F23, Decision #12, composing with PR #24

Right-rail cards (orthogonal to #24)
- AFFECTED LANES card (origin/destination city pairs, freight
  modes, volume estimates)
- OWNER & TEAM card (assignee, team distribution, last update)
- LINKED ITEMS card (cross-references with relationship type)

Summary content area (composes with #24)
- Inline horizontal Timeline (regulation lifecycle: proposed,
  consultation, adopted, effective, enforced) placed within
  Summary flow alongside #24's Tier 2 Operational briefing
  expander; no replacement of #24's expander, additive

Production additions rationalization (Decision #12)
- KEEP: Penalty calculator, Sources, Exposure, Add to watchlist
- DROP: Team notes tab (remove from TABS array)
- MERGE: Full text into Synopsis. Rewire #24's
  navigateToFullSection helper to scroll to inline Full text
  section within Synopsis, OR remove the helper if Tier 2's
  expander obviates it (decide during investigation)

INVESTIGATION FIRST
- RegulationDetailSurface.tsx structure post-#24 merge
- Existing data: do intelligence_items have lane data, owner data,
  cross-references, timeline events? Schema additions needed?
- LINKED ITEMS: item_cross_references table state and population
- Timeline events: source columns (effective_date, proposal_date,
  adoption_date)
- Compose decision: where Timeline sits within Summary flow,
  whether to keep navigateToFullSection helper

VERIFICATION
- 4 new components render with real data or honest empty state
- TABS array no longer includes Team notes
- Synopsis tab includes inline Full text section (or expander)
- #24's Tier 2 expander preserved and functional
- No regressions on detail page
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- AFFECTED LANES requires substantial schema additions (defer to
  data layer track, render honest empty state)
- Timeline events have no source data
- LINKED ITEMS table is empty (acceptable, render empty state)

═══════════════════════════════════════════════════════════════
AGENT 2, DISPATCH K: Community Phase D rebuild
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-k-community-phase-d
PR TITLE: ui: Community Phase D rebuild

SCOPE per F15, F17, CC2 remaining, CC6, Decisions #3, #9
- Restore platform rail per design (Community mid-rail position
  was set in PR-D; this PR rebuilds the surface itself)
- Composer (post creation: text, attachments, mentions, groups)
- Role-based groups with badges (operator, verifier, admin
  visibility)
- Threaded posts with verifier badges (per design source-of-truth)
- PROMOTE TO PUBLIC actions on internal posts
- Vendor mentions rail folding /vendors content (per Decision #9)
- Events calendar at /community/events (per Decision #3)
- HOW PUBLISHING WORKS section (per design)

INVESTIGATION FIRST
- CommunitySurface.tsx current state (likely placeholder per F15)
- Existing community_posts, community_groups, community_events
  tables (or absence thereof)
- Mention/notification system existence
- Vendor data location post-PR-D fold
- Backend persistence requirements

VERIFICATION
- Composer functional (post create, edit, delete)
- Threaded posts render with verifier badges
- Role-based groups display correct membership
- PROMOTE TO PUBLIC works
- Events calendar at /community/events functional
- Vendor mentions surface at /community/vendors
- HOW PUBLISHING WORKS section present
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Backend persistence not in place (split into K1 surface +
  K2 backend)
- Mention/notification system requires substantial new work
  (defer to separate PR)
- Events calendar requires substantial calendar component build
  (defer or use minimal MVP)

═══════════════════════════════════════════════════════════════
AGENT 3, DISPATCH L: Profile + Settings restorations
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-l-profile-settings-restorations
PR TITLE: ui: Profile + Settings restorations per Decisions
#14 + #15

SCOPE
Profile restorations (Decision #15, F6, F7, F20)
- AT A GLANCE block (key stats, recent activity, role indicator)
- QUICK LINKS section (jump-to surfaces user accesses frequently)
- "You are Owner" indicator
- Populated form fields (name, email, role, sector preferences,
  workspace memberships)

Settings restorations (Decision #14, F9, F10, F14)
- BRIEFING SCHEDULE section (cadence, time, jurisdictions,
  delivery method)
- SAVED SEARCHES section (named filter combinations, manage,
  delete)
- HELP section (documentation links, support contact, version info)
- Notifications-in-GENERAL: do not modify (PR-D already shipped
  this restructure in Wave 2)

INVESTIGATION FIRST
- ProfilePage.tsx and SettingsPage.tsx current state post-PR-D
- Existing user data sources (memberships, sector_subscriptions,
  saved_searches table existence)
- Briefing schedule storage and delivery mechanism

VERIFICATION
- All 4 Profile restorations render correctly with user data
- All 3 Settings restorations functional
- No regression on PR-D's notifications-in-GENERAL
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Saved searches table doesn't exist (data layer work first)
- Briefing schedule delivery mechanism doesn't exist (split L1
  surface + L2 delivery backend)

═══════════════════════════════════════════════════════════════
AGENT 4, DATA TRACK: PR-A2 first US states batch
═══════════════════════════════════════════════════════════════
BRANCH: data/pr-a2-us-ny-wa-tx
PR TITLE: data: Tier 1 US states batch (NY + WA + TX)

SCOPE
Tier 1 jurisdiction rollout for next 3 US states by Dietl/Rockit
freight relevance:
- New York (NY DEC + state legislature, NYC Local Law 97 already
  retagged in PR-A1; additional NY state regs to investigate)
- Washington (WA Ecology + state legislature, West Coast port
  relevance)
- Texas (TCEQ + state legislature, Houston port + Gulf relevance)

Reuse PR-A1 script template (fsi-app/scripts/pr-a1-investigate.mjs,
pr-a1-execute.mjs). Clone, swap jurisdiction codes and source URLs,
investigate then execute.

INVESTIGATION FIRST (per state)
- Existing intelligence_items with NY-specific, WA-specific,
  TX-specific content
- Existing source rows for NY DEC, WA Ecology, TCEQ
- Sub-national retag candidates (items currently tagged ["US"]
  that should be ["US-NY"], ["US-WA"], ["US-TX"])
- Source registry inserts needed

VERIFICATION (per state)
- intelligence_items retags: pre/post jurisdiction_iso counts
- Source registry inserts: row count + tier verification
- source_id relinks: count of items linked to new state sources
- Reusable script template followed pattern

HALT AND SURFACE IF
- Any state surfaces > 30 retag candidates (split into per-state
  PRs)
- Source registry has unexpected pre-existing rows
- Cross-state legacy_id collisions

POST-PR (all 4 agents)
Surface consolidated report. Await merge authorization.
```

---

## Wave 4: Third parallel surface push (3 agents) + data layer expansion

**Targets:** PR-H, PR-I, PR-J. Three remaining major surface rebuilds.

**Audit items addressed:** F12 (Research reframe per Decision #5), F19 (Map jurisdictions canonical 5 per Decision #13), Operations rebuild beyond F13 hide pattern.

**Concurrent data layer:** PR-A3 next US states batch (FL + IL + others by freight relevance) + EU 5 regulation inserts.

### Wave 4 paste-ready dispatch

```
DISPATCH: Wave 4, three parallel surface agents + two data agents
PRECONDITION: Wave 3 fully merged.

GLOBAL CONSTRAINTS per prior waves.

CROSS-AGENT FILE-DISJOINT CONFIRMATION
- PR-H: ResearchView.tsx + sub-components
- PR-I: OperationsPage.tsx + sub-components (post-#33 hide pattern)
- PR-J: MapView.tsx + jurisdiction rendering
- PR-A3: scripts + intelligence_items updates
- EU inserts: scripts + new intelligence_items rows

═══════════════════════════════════════════════════════════════
AGENT 1, DISPATCH H: Research reframe
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-h-research-reframe
PR TITLE: ui: Research reframe to operator horizon scan

SCOPE per F12, Decision #5
Reframe Research from current editorial-workflow surface to
operator-facing horizon scan. Stays in main rail (Option B
override of design's editorial intent).

Components per design intent adapted for operator framing:
- Horizon scan grid (regulations entering tracking, recently
  updated, approaching effective dates)
- Confidence/maturity indicators per item
- Filter controls (jurisdiction, sector, time horizon)
- Pipeline tab preserved (post-#33, Source coverage tab already
  hidden)

INVESTIGATION FIRST
- ResearchView.tsx current structure
- Pipeline tab existing functionality
- Horizon scan data: what queries surface "entering tracking,"
  "recently updated," "approaching effective dates"?

VERIFICATION
- Horizon scan grid renders with real items
- Confidence/maturity indicators visible
- Filter controls work
- Pipeline tab unchanged
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Horizon scan data requires substantial aggregation queries
  (split into H1 surface + H2 data layer)

═══════════════════════════════════════════════════════════════
AGENT 2, DISPATCH I: Operations full rebuild
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-i-operations-rebuild
PR TITLE: ui: Operations full rebuild (beyond F13 hide pattern)

SCOPE
Full Operations rebuild beyond #33's hide pattern. Per audit:
- Horizontal pill region nav (replace current accordion-only
  layout)
- Populated cells for regions with data (audit notes Facility
  Data tab has real description content; preserve and extend)
- COVERAGE callout (per design)
- OWNERS-CONTENT section (per-owner operational view)

INVESTIGATION FIRST
- OperationsPage.tsx structure post-#33
- Existing data per region (which regions have facility data,
  which still empty)
- Horizontal pill nav component reusability from elsewhere in
  the codebase
- COVERAGE data sources

VERIFICATION
- Horizontal pill nav functional
- Regions with data show populated cells
- Empty regions retain #33's banner pattern
- COVERAGE callout renders with real data or honest empty state
- OWNERS-CONTENT section functional
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- Most regions still have no data (defer until data backfill
  ships)
- COVERAGE requires aggregation queries

═══════════════════════════════════════════════════════════════
AGENT 3, DISPATCH J: Map jurisdiction fix
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-j-map-jurisdiction-fix
PR TITLE: ui: Map jurisdiction canonical labels (5 per Decision
#13)

SCOPE per F19, Decision #13
Canonical jurisdictions: 5 per design (EU, UK, US, IMO, ICAO).
Resolve current 30 vs 16 vs 5 inconsistency.

Plus sub-national markers (composes with PR-A1 + PR-A2 + PR-A3
data layer): California, NY, WA, TX, FL, IL render as distinct
markers within US, click filters to state-specific regulations.

INVESTIGATION FIRST
- MapView.tsx current jurisdiction rendering
- Source of 30 / 16 / 5 inconsistency (multiple components
  rendering different jurisdiction sets?)
- Map library sub-national geography support
- Existing sub-national markers (post-PR-A1, US-CA + US-NY data
  is live; post-PR-A2, US-WA + US-TX live)

VERIFICATION
- 5 canonical jurisdictions consistently rendered across all
  Map surfaces
- Sub-national markers render for all states with tagged data
- Click filtering works at sub-national granularity
- Build clean, typecheck clean, no hydration warnings
- All 3 Vercel preview checks SUCCESS

HALT AND SURFACE IF
- 30/16/5 inconsistency is across many components (broader fix)
- Map library doesn't support sub-national geography (substantial
  component swap)

═══════════════════════════════════════════════════════════════
AGENT 4, DATA TRACK: PR-A3 next US states batch
═══════════════════════════════════════════════════════════════
BRANCH: data/pr-a3-us-fl-il-batch
PR TITLE: data: Tier 1 US states batch (FL + IL + freight-relevant)

SCOPE
Continue Tier 1 US states rollout per Dietl/Rockit freight
relevance:
- Florida (DEP + state legislature, Miami port relevance)
- Illinois (EPA Illinois + state legislature, Chicago intermodal
  relevance)
- Plus 2 more states by freight relevance (recommend NJ for
  Newark port, GA for Savannah port)

Reuse PR-A1 script template per Wave 3 PR-A2.

VERIFICATION + HALT per Wave 3 PR-A2 dispatch.

═══════════════════════════════════════════════════════════════
AGENT 5, DATA TRACK: EU 5 regulation inserts
═══════════════════════════════════════════════════════════════
BRANCH: data/wave4-eu-inserts
PR TITLE: data: 5 missing EU regulations (Wave 4)

SCOPE per handoff doc Priority 5
- ReFuelEU Aviation (Regulation EU 2023/2405)
- Clean Trucking Regulation (EU 2024/1610)
- AFIR (EU 2023/1804)
- EU ETS Directive (EU 2023/959)
- CBAM (EU 2023/956)

For each: title, slug, jurisdiction_iso = ["EU"], priority per
content, source_url, source_id linked to existing EU source rows,
full_brief generated per existing structure. After inserts: scan
existing intelligence_items.full_brief for cross-references.

PARTITION
Legacy_id partition: new IDs eu_refueleu_2023_2405,
eu_clean_trucking_2024_1610, eu_afir_2023_1804,
eu_ets_directive_2023_959, eu_cbam_2023_956. Confirm no overlap
with PR-A3 retags.

VERIFICATION + HALT per Wave 2 EU inserts dispatch (in original
Wave 2 framing, now moved to Wave 4 for sequencing).

POST-PR (all 5 agents)
Surface consolidated report. Await merge authorization.
```

---

## Wave 5: Tail (small surface PRs + Tier 1 expansion)

**Targets:** PR-M, PR-N, PR-F3 (Dashboard reflow tail), plus continuing Tier 1 rollout (UK nations, EU member states, CA provinces, AU + APAC priority).

**Audit items addressed:** F3 (full), F21 (Admin role-gating), URL params for sub-national filtering, remaining Tier 1 jurisdictions.

### Wave 5 paste-ready dispatch

```
DISPATCH: Wave 5, three small surface agents + multiple data
agents (Tier 1 continuation)
PRECONDITION: Wave 4 fully merged.

GLOBAL CONSTRAINTS per prior waves.

═══════════════════════════════════════════════════════════════
AGENT 1, DISPATCH M: Admin organizations table
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-m-admin-organizations
PR TITLE: ui: Admin organizations table (Phase D placeholder
unblock)

SCOPE per F21, Decision #11
- Admin organizations table (workspace-level org list, member
  counts, roles, last activity)
- Role-gating verification per F21
- Honest empty state if data not yet ready

INVESTIGATION FIRST
- AdminOrganizationsPage.tsx existence (likely placeholder per
  Decision #11)
- orgs + memberships tables (Migration 006 should have these per
  prior session context)
- Role-gating mechanism

VERIFICATION
- Organizations list renders with real data
- Role-gating enforced (only Admin role sees this)
- Build clean, typecheck clean
- Vercel checks SUCCESS

═══════════════════════════════════════════════════════════════
AGENT 2, DISPATCH N: URL param sub-national filtering
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-n-url-params-sub-national
PR TITLE: ui: URL param expansion for sub-national filtering

SCOPE
- /regulations accepts ?region=us-ca, ?region=us-ny, etc. per
  jurisdiction_iso values
- /map accepts equivalent URL params
- Composes with PR-E sector chips and PR-J map markers (Wave 2
  + Wave 4 results)

INVESTIGATION FIRST
- Current URL param handling on /regulations and /map
- jurisdiction_iso values present in data layer post-PR-A1 +
  PR-A2 + PR-A3

VERIFICATION
- ?region=us-ca renders 4 California items on /regulations
- /map URL state preserved on jurisdiction filter
- Build clean, typecheck clean
- Vercel checks SUCCESS

═══════════════════════════════════════════════════════════════
AGENT 3, DISPATCH F3: Dashboard Weekly Briefing reflow
═══════════════════════════════════════════════════════════════
BRANCH: ui/pr-f3-dashboard-reflow
PR TITLE: ui: F3 Dashboard Weekly Briefing reflow tail fix

SCOPE
F3 specific work not absorbed by PR-C layout shell clamp. If F3
is fully resolved by PR-C in production smoke, close this dispatch
without PR.

INVESTIGATION FIRST
- F3 production state post-PR-C
- If reflow tail still visible: identify root cause (column
  layout? grid gap? content overflow?)

VERIFICATION (if PR opens)
- Reflow tail eliminated at standard + wide viewports
- Build clean, typecheck clean
- Vercel checks SUCCESS

HALT AND SURFACE IF
- F3 already resolved by PR-C (close dispatch, no PR)

═══════════════════════════════════════════════════════════════
AGENTS 4 through N, DATA TRACK: Tier 1 continuation
═══════════════════════════════════════════════════════════════

Continue Tier 1 jurisdictional rollout per Decision #1 priority
list. Reuse PR-A1 script template. Recommend dispatching 2 to 3
data agents per wave window (file-disjoint by legacy_id partition):

UK nations batch
- England (DEFRA + UK gov)
- Scotland (Scottish EPA + Scottish gov)
- Wales (NRW + Welsh gov)
- Northern Ireland (NIEA + NI Executive)

EU member states first batch (highest freight relevance)
- Germany, France, Netherlands, Belgium, Italy

EU member states second batch
- Spain, Poland, Sweden, Denmark, Ireland, Austria, Czech
  Republic, Greece, Portugal, Finland, Hungary, Romania,
  Bulgaria, Croatia, Slovakia, Slovenia, Lithuania, Latvia,
  Estonia, Luxembourg, Malta, Cyprus

CA provinces batch
- Ontario, Quebec, BC, Alberta, Manitoba, Saskatchewan, Nova
  Scotia, New Brunswick, Newfoundland, PEI, plus 3 territories

APAC priority
- Singapore, Hong Kong, Japan, South Korea

Australia
- Federal + 6 states + 2 territories

Major-city jurisdictions per Decision #1 priority list

VERIFICATION + HALT per PR-A1 / PR-A2 dispatch pattern.

POST-PR (all agents)
Surface consolidated report. Await merge authorization.
```

---

## End-state verification checklist

After Wave 5 completes, verify:

- [ ] All 23 F-series page-level audit items resolved or explicitly deferred with rationale
- [ ] All 6 actionable CC cross-cutting items resolved (CC1 through CC6; CC7 not actionable)
- [ ] All IA divergences resolved (Profile/Admin/Settings to user-footer dropdown, Community to mid-rail, /events + /vendors route moves, F16 notifications-in-GENERAL)
- [ ] All 17 locked decisions implemented in surfaces
- [ ] Sector chip system live with 28 cargo verticals (Decision #1)
- [ ] Tier 1 jurisdictional rollout substantively complete (US states, UK nations, EU members, CA provinces, AU + APAC priority)
- [ ] EU 5 missing regulation inserts complete
- [ ] Critical cleanups complete
- [ ] All master plan PRs merged (PR-D through PR-N + PR-A2, PR-A3, additional Tier 1 batches, EU inserts, cleanups)
- [ ] CLAUDE.md contains: architecture model, perf discipline, verification-before-authorization, code-vs-data state separation
- [ ] All Wave 0 through Wave 5 dispatch logs and verification logs committed to docs/

## Concurrency and pacing

**Recommended cadence:** One wave per session, with merge cycle and brief production stabilization between. Estimated 5 sessions to full design-match completion plus N additional sessions for Tier 1 jurisdictional rollout continuation in Wave 5.

**Parallelism limit:** Max 5 agents per wave window (3 to 4 surface + 1 to 2 data). Beyond 5 creates coordination overhead and reduces Claude Code reliability.

**Halt conditions to escalate:**
- Any wave's investigation phase surfaces fundamental data layer gaps that block multiple PRs
- Cross-agent file-disjoint confirmation fails repeatedly
- Production deploy regressions on smoke checks
- More than 2 PRs per wave halt-and-surface for scope expansion

When any halt condition triggers, pause wave, regroup, decide whether to split scope, defer specific PRs, or reframe the wave.

## Document handoff

This finishing dispatch belongs in `docs/FINISHING-DISPATCH-2026-05-06.md` as the canonical roadmap. Pairs with:

- `docs/SESSION-AUDIT-2026-05-05.md` (handoff ground truth)
- `docs/VISUAL-RECONCILIATION-2026-05-06.md` (visual audit, in PR #31)
- `docs/SESSION-STATUS-REVIEW-2026-05-06.md` (status review, optional commit)
- `docs/BUILD-BREAKDOWN-2026-05-06.md` (14-section platform breakdown)
- `docs/PERF-PLAYBOOK.md` (measurement-first workflow)

Three-document handoff for next session: this finishing dispatch + visual reconciliation + session-audit.
