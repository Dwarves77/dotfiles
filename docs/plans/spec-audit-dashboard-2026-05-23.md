# Spec Audit: Dashboard `/` Built vs `caros-ledge-platform-intent` SKILL

**Date:** 2026-05-23
**Auditor branch:** `chore/spec-audit-dashboard` (off `origin/master` at `9ca913c`)
**Scope:** READ-ONLY comparison of the Dashboard surface (route `/`) against the binding platform intent skill plus Build 11 deliverables (commits `ce9a984`, `c09ca04`, `ffc3537`) and the `3133b82` `WhatChanged` hotfix.
**Constraint:** No code changes. No prescriptions. Line-cited gap analysis only.

---

## 1. Spec Excerpt: Dashboard Surface

The `caros-ledge-platform-intent` SKILL does NOT define a "Dashboard" as one of the five customer-facing surfaces. The five surfaces are Regulations, Market Intel, Research, Operations, and Community (`fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md:45-127`). Dashboard is implicit, not enumerated. The relevant spec inputs that constrain a Dashboard are:

**Five-surface co-equality** (`SKILL.md:21`):
> Community is a CORE customer-facing surface, co-equal with the four intelligence pages. Not Category 5. Not an onboarding mechanism. Not a sub-feature.

**Intelligence Assistant scope** (`SKILL.md:23`):
> The Intelligence Assistant is a RESEARCH HELPER, not a synthesis or decision engine. ... There is no separate "Operations decision engine" or equivalent to build.

**Dual-posture default** (`SKILL.md:43`):
> Decisions about source coverage, classifier scope, jurisdiction taxonomy, ingest volume, page features, Community configuration, vendor directory entries, and onboarding flow must consider both current users (specialized verticals) and onboarding-time-future users (broader freight forwarding). ... Silent narrowing is forbidden.

**Anti-pattern: phase-language leak** (`SKILL.md:321`):
> Allowing phase-language ("Coming soon, Phase D", "Phase N", etc.) to leak into customer-facing UI. Customers do not know what Phase D is.

**Workspace-anchored output rule** (`environmental-policy-and-innovation/SKILL.md:82-95`):
> Every output is anchored to the reader's workspace profile. The output never names the workspace, its company, or any individual person. Anchoring is by role, operation, cargo verticals, transport modes, trade lanes, products, and supply chain position.

**Severity labels mandatory** (`environmental-policy-and-innovation/SKILL.md:152-160`):
> ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING. Mandatory on every regulatory fact document, every market signal brief, every technology profile, every operations profile.

**Per-surface credibility signal vocabulary** (`source-credibility-model/SKILL.md:295-303` Section 8 table):
> Regulations: tier + jurisdiction + binding status. Research: tier + bias tag + citation count + recency. Market Intel: tier + recency + signal-strength. Operations: tier + jurisdiction + applicability. Community: author identity + workspace verification.

> Build 11 Dashboard: aggregates across surfaces. (`source-credibility-model/SKILL.md:313`)

**Cause-and-effect requirement** (`environmental-policy-and-innovation/SKILL.md:162-182`):
> Every data point in every section must have a cause and effect chain ... what is happening, what it causes, what the effect is on the workspace's operations.

These spec inputs together define a Dashboard that, if it exists, must aggregate across all five surfaces co-equally, use the consistent credibility vocabulary across surfaces, be workspace-anchored, surface decision pressure via severity labels, and never leak phase-language to customers. The SKILL does NOT define what the customer comes to the Dashboard FOR; that question is left to a separate operator decision and is the central audit gap.

---

## 2. Current Built Reality

Render order top to bottom, as a freight forwarder would see `/` on Monday morning:

### A. Masthead (`fsi-app/src/app/page.tsx:96-108`)

- Title: `"Dashboard — Your Brief"` (`page.tsx:99`, contains an em dash, see Section 3 row M-2).
- Meta line: `` `${dateStr} · ${itemsCount} intelligence items across 5 surfaces · ${jurisdictionsCount} jurisdictions` `` (`page.tsx:94`).

### B. DashboardHero 4-up strip (`fsi-app/src/components/home/DashboardHero.tsx:122-252`)

Four tiles, all linking exclusively to `/regulations?priority=<TONE>` (`DashboardHero.tsx:164`):

- Tile 1 (CRITICAL): wider 1.4fr column, diagonal pink gradient, eyebrow "IMMEDIATE ACTION", label `"Critical, within 90 days"`, helper line built from `criticalSnapshot` (Build 11, `DashboardHero.tsx:75-93`).
- Tile 2 (HIGH): eyebrow "HIGH", label `"Action, 6 mo"`.
- Tile 3 (MODERATE): eyebrow "MODERATE", label `"Monitor, 6 to 12 mo"`.
- Tile 4 (LOW): eyebrow "LOW", label `"Awareness only"`.

Each tile's `aria-label` says `"... · open in Regulations"` (`DashboardHero.tsx:166`). All four tiles deep-link only into Regulations regardless of which surface the priority applies on. The aggregate counts come from `aggregates.byPriority` and so include items from Market Intel, Research, and Operations as well, but the click target sends the user to `/regulations`. The route filter `priority` on `/regulations` will silently drop the non-regulation items from view.

### C. Body grid (`fsi-app/src/components/home/HomeSurface.tsx:165-297`)

Two-column grid: main 1fr + rail 300px (`HomeSurface.tsx:177`). Below 1024px collapses to single column (`HomeSurface.tsx:182-188`).

**Main column.**

1. **"This Week" section** (`HomeSurface.tsx:195-232`). Header: `"This Week"`, aside `"Weekly briefing · <today>"`.

   - `<WeeklyBriefing>` left (1.3fr): title `"Top priority this week — N items"` (em dash, `WeeklyBriefing.tsx:155`); summary line `` `Tracking ${totalItems} intelligence items across ${totalJurisdictions} jurisdictions. N new this week.` `` (`WeeklyBriefing.tsx:135-137`); a ranked top-5 list scored by `urgencyScore` (`WeeklyBriefing.tsx:99`), each row linking to `/regulations/${r.id}` (`WeeklyBriefing.tsx:215`); Build 11 Q9 chips (`tier`, `citationCount`, `recency`, `bias`) rendered per row when available (`WeeklyBriefing.tsx:183-270`); Download HTML / Download Slack buttons (`WeeklyBriefing.tsx:288-310`).
   - `<WhatChanged>` right (1fr): title `"What changed — N since last audit"` (em dash, `WhatChanged.tsx:148`); since-2026-05-23 hotfix the header + `"Last updated <relative>"` always render, with empty-state copy `"No new or updated items in the last 7 days."` (`WhatChanged.tsx:119`). Each row links to `/regulations/${row.resource.id}` (`WhatChanged.tsx:176`).

2. **"Replaced" section** (`HomeSurface.tsx:235-251`). Header: `"Replaced"`, aside `"<N> regulations superseded by newer versions"` (`HomeSurface.tsx:240-244`). Renders only if `supersessions.length > 0` (`HomeSurface.tsx:235`). Body is `<Supersessions>` (`Supersessions.tsx:23-110`), 5-up card row, each card linking to `/regulations/${s.new}` (`Supersessions.tsx:49,99`). Copy hard-codes "regulations" only.

3. **"Housekeeping" section** (`HomeSurface.tsx:254-269` via `HousekeepingSection.tsx:30-42`). Header: `"Housekeeping"`, aside `"Registry health · review queue"` (`HousekeepingSection.tsx:33-34`).

   - Left card: `<DashboardCoverageGaps>` (`DashboardCoverageGaps.tsx:36-121`). Eyebrow "What you might be missing", deck "Heuristic — severity is a recommendation, not a precise score." (em dash). Each row has a recommended editor action (`Suggest a source`, `Add to registry`). Hand-curated `coverage_gaps` table.
   - Right card: `<DashboardAwaitingReview>` (`DashboardAwaitingReview.tsx:44-133`). Eyebrow "What you should do today". Items typed `prov` / `intg` / `spot` (provisional source / integrity flag / spotcheck). Footer link `"Open admin queue →"` to `/admin` (`DashboardAwaitingReview.tsx:129`). Per the file's own comment (`DashboardAwaitingReview.tsx:11-12`), this widget is admin-gated server-side: `fetchAwaitingReview` returns `[]` for non-admins.

**Rail column** (`HomeSurface.tsx:272-296`). 300px wide, top-down:

1. **`<DashboardSurfaceCoverage>`** (Build 11 addition, `DashboardSurfaceCoverage.tsx:46-213`). Eyebrow "Across the platform", title "All five surfaces", count `"N active across 5 surfaces"`, deck "Regulations, Market Intel, Research, Operations, and Community are co-equal entry points." Five fixed-order rows: Regulations, Market Intel, Research, Operations, Community. Each row: label + deck + count + Link. Community row uses groups count + unread-mention badge (`DashboardSurfaceCoverage.tsx:81-91`). Uncategorized footer note when `intel.uncategorized > 0` (`DashboardSurfaceCoverage.tsx:198-210`).
2. **`<DashboardWatchlist>`** (`DashboardWatchlist.tsx:54-123`). Eyebrow "Tracked by you", title "Watchlist". Items typed `source` / `reg` / `signal` (`DashboardWatchlist.tsx:27-31`); `hrefFor` routes `reg` → `/regulations/<id>`, `source` → `/sources/<id>`, `signal` → `/market#<id>` (`DashboardWatchlist.tsx:48-52`). No Research, Operations, or Community types.
3. **`<DashboardByOwner>`** (`DashboardByOwner.tsx:109-184`). Eyebrow "On whose plate", title "By Owner". Aggregates `resource.actionOwner`. Each top-item link routes to `/regulations/${g.top.id}` and the owner link routes to `/regulations?owner=...` (`DashboardByOwner.tsx:159,171`). Regulation-only.

### D. AI prompt bar

Removed from Dashboard per the comment at `HomeSurface.tsx:167-171` ("AI prompt bar removed from Dashboard per Phase D placement rule").

### E. Cross-cutting

- AppShell sidebar and global Intelligence Assistant floating button are layout chrome, not Dashboard-specific.
- The masthead-meta + DashboardHero counts + DashboardSurfaceCoverage counts are intended to reconcile per Build 11 commit message `c09ca04`.

---

## 3. Line-Cited Gap Analysis

### 3.1 Spec-driven requirements

| Spec requirement | Source | Status | Citation + note |
|---|---|---|---|
| Five surfaces co-equal in Dashboard representation | `caros-ledge-platform-intent SKILL.md:45-127` + `:325` | **PRESENT (partial)** | Only the rail widget `DashboardSurfaceCoverage` (`DashboardSurfaceCoverage.tsx:50-92`) honours this. The 4-up hero, WeeklyBriefing top-5, WhatChanged, Supersessions, Watchlist, and ByOwner are all regulation-routed (`DashboardHero.tsx:164`, `WeeklyBriefing.tsx:215`, `WhatChanged.tsx:176`, `Supersessions.tsx:49`, `DashboardWatchlist.tsx:48-52`, `DashboardByOwner.tsx:159,171`). Build 11 added a single co-equal widget on the rail without rebalancing the editorial weight. |
| Workspace-anchored output (no naming, role-anchored) | `environmental-policy-and-innovation SKILL.md:82-95` | **PRESENT** | The widgets do not name the workspace or individuals. They surface generic counts and titles. The `criticalSnapshot` helper line uses `jurisdiction` only (`critical-items.ts:201-217`). No violations observed. |
| Severity labels mandatory on briefs | `environmental-policy-and-innovation SKILL.md:152-160` | **MISSING** | The CRITICAL/HIGH/MODERATE/LOW priority taxonomy on the hero (`DashboardHero.tsx:107-112`) is the priority axis, NOT the severity-label set. None of the five labels (ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING) appear on any item card on the Dashboard. WeeklyBriefing rows render only title + note + day-count + Q9 chips. WhatChanged rows render only changeType + priority + title + detail. No decision-pressure label surfaces. |
| Cause-and-effect chain on every data point | `environmental-policy-and-innovation SKILL.md:162-182` | **MISSING** | WeeklyBriefing rows render `r.title` and `r.note` (`WeeklyBriefing.tsx:232,241`); WhatChanged rows render `row.detail = head.now \|\| head.impact \|\| head.fields.join \|\| r.note` (`WhatChanged.tsx:99`). Neither structurally surfaces the cause → mechanical consequence → effect-on-workspace chain. The chain is at most implicit in the note string. |
| Per-surface credibility vocabulary, consistent across surfaces | `source-credibility-model SKILL.md:295-317` Section 8 | **MIS-FRAMED** | Build 11 mounts a Research-style chip set (`tier`, `citationCount`, `recency`, `bias` per `WeeklyBriefing.tsx:254-269`) on every top-5 row regardless of surface. The spec specifies different signal sets per surface: Regulations wants `tier + jurisdiction + binding status`, Market Intel wants `tier + recency + signal-strength`, Operations wants `tier + jurisdiction + applicability`. Dashboard aggregates across surfaces and so should switch chip set by row's source surface. Currently it does not; one chip vocabulary is applied to all. |
| No phase-language leak to customers | `caros-ledge-platform-intent SKILL.md:321` | **PRESENT** | No "Phase D" / "Coming soon" copy on `/`. (One internal code comment in `HomeSurface.tsx:167` references "Phase D placement rule" but is not rendered.) |
| Dual-posture: serves current verticals AND expansion-time users | `caros-ledge-platform-intent SKILL.md:42-43` | **MIS-FRAMED** | Every editorial element on the Dashboard assumes the customer is a regulatory-compliance reader. The four hero tiles map to a regulatory window taxonomy ("within 90 days", "6 mo"). The Watchlist types are `source`/`reg`/`signal`. The ByOwner aggregator presumes `actionOwner` is set on regulations. Expansion-time freight forwarders whose primary value from the platform is Market Intel signals or Operations cost intelligence have no editorial entry point of equivalent weight. The rail widget gestures at this; the body does not. |
| Build 11 Dashboard: aggregates across surfaces | `source-credibility-model SKILL.md:313` | **PRESENT (partial)** | `DashboardSurfaceCoverage` aggregates per-surface counts (`surface-coverage.ts:106-116`). But the surface coverage widget is a single rail tile; the dashboard's editorial body still aggregates Regulations only, not Market Intel signals, not Research findings, not Operations cost data, not Community discussion. |

### 3.2 Customer-question test

The brief asks: when a freight forwarder paying $500/month opens `/` on Monday morning, what does the page help them decide?

| Customer question | Helped? | Where (file:line) | Gap |
|---|---|---|---|
| "What changed since I last looked that needs my attention?" | **Partially** | `WhatChanged.tsx:60-247` | Renders new + updated regulations in a rolling 7-day window from changelog + added-date. After hotfix `3133b82` it always renders the header. Gap: only surfaces Regulations changelog; no `What changed` from Market Intel, Research, Operations, or Community. A new BloombergNEF market signal, a new IPCC research finding, a new region cost shift, or a hot Community discussion thread none surface here. The framing is "what changed in your regulatory queue", not "what changed across all five surfaces". |
| "What's my single most critical item right now?" | **Partially** | `DashboardHero.tsx:75-93` + `critical-items.ts:98-244` | Build 11 added the `criticalSnapshot` helper that surfaces real CRITICAL/HIGH items inside the next 14 days from `compliance_deadline` + `item_timelines`. Gap: the helper is a Regulations / compliance-deadline frame. It does not surface "your most critical Market Intel signal", "your most operationally consequential Operations data point", "the Community thread your peers are responding to". Critical is defined as a regulatory deadline only. |
| "How do my five surfaces look at a glance?" | **Yes, on the rail** | `DashboardSurfaceCoverage.tsx:46-213` | Build 11's surface coverage widget answers this. Caveat: the widget is one 300px-wide rail tile competing with Watchlist and ByOwner below it; the main editorial column above (hero + This Week + Replaced + Housekeeping) is overwhelmingly Regulations-shaped, so the visual answer to the at-a-glance question is "you have a Regulations dashboard with a small five-surface summary tile". |
| "What's brand new vs what's evolving?" | **Partially** | `WhatChanged.tsx:83-103` | The component does split `New` rows from `Updated` rows via `changeType` chip. But again, scoped to regulations changelog only. "Brand new ingest in Market Intel this morning" or "evolving Research consensus on SAF availability" has no surface. |

### 3.3 Customer-decision question (the operator's brief)

| The customer-decision question | Answer | Gap headline |
|---|---|---|
| "When a freight forwarder opens `/` on Monday morning, what does the page help them decide?" | The page helps them decide which regulation to review or assign first. Build 11 added co-equal surface count visibility on the rail but did NOT reorient the editorial body around a five-surface decision frame. The page is structurally a regulatory queue with a co-equality patch. | Build 11 fixed count incoherence (engineering) and added a single rail widget for surface representation (structural patch); it did NOT answer the customer-decision question. The Dashboard's primary editorial weight still answers "what's my regulatory queue today" rather than "what should I do today across my five surfaces". |

### 3.4 Additional gaps surfaced

| ID | Item | File:line | Class |
|---|---|---|---|
| M-1 | The hero tile click target routes priority-filtered traffic into `/regulations` only, despite the aggregate counts including non-regulation intelligence items (per `surface-coverage.ts` classifier sending non-regulation items to Market Intel / Research / Operations buckets). The user clicks "11 HIGH" expecting to see 11 high-priority items, lands on `/regulations?priority=HIGH`, sees fewer than 11. | `DashboardHero.tsx:164` | MIS-FRAMED count-vs-route mismatch |
| M-2 | Title contains em dash: `"Dashboard — Your Brief"`. Per the operator's standing instruction (no em/en dashes; commas only) this is a violation. Also at `WeeklyBriefing.tsx:155`, `WhatChanged.tsx:148`, `DashboardCoverageGaps.tsx:52,82`. | `page.tsx:99`, `WeeklyBriefing.tsx:155`, `WhatChanged.tsx:148`, `DashboardCoverageGaps.tsx:52,82` | PRESENT_BUT_UNAUTHORIZED |
| M-3 | `Housekeeping` is admin-facing surface mixed into the customer Dashboard. `DashboardAwaitingReview` is gated server-side (returns `[]` for non-admins, see `DashboardAwaitingReview.tsx:11-12,53`) but `DashboardCoverageGaps` always renders. A paying freight forwarder gets "Open admin queue" links and "Suggest a source" / "Add to registry" recommendations in the customer dashboard. Editorial scoping question: should the customer surface contain operator-facing chrome at all? | `HomeSurface.tsx:254-269`, `DashboardAwaitingReview.tsx:129`, `DashboardCoverageGaps.tsx:90-107` | MIS-FRAMED (audience mix) |
| M-4 | The `Supersessions` ("Replaced") section is hard-coded to regulatory supersessions only and labels itself `"<N> regulations superseded by newer versions"` (`HomeSurface.tsx:241-243`). When Market Intel signals are supplanted by newer signals or Research findings are superseded, there is no Dashboard surface for that. Reinforces the regulation-centric editorial frame. | `Supersessions.tsx`, `HomeSurface.tsx:236-251` | MIS-FRAMED |
| M-5 | The `Watchlist` widget supports only three item types: `source`, `reg`, `signal` (`DashboardWatchlist.tsx:27-31`). No Research items, no Operations items, no Community threads. A user who wants to watch a Research summary or a Community thread has nowhere to do so. The "Browse what to watch" empty-state CTA routes to `/regulations` only. | `DashboardWatchlist.tsx:27-52,73` | MISSING (data shape + UI) |
| M-6 | The `ByOwner` widget assumes `actionOwner` is set on regulations; routes both the owner link and the top-item link to `/regulations*`. This widget cannot surface "what's on Sarah's plate in Market Intel" or "Operations decisions waiting on Carlos". | `DashboardByOwner.tsx:159,171` | MISSING (cross-surface ownership) |
| M-7 | The hero CRITICAL helper preview is hard-capped at top-3 items in a 14-day window (`critical-items.ts:34-35`). For workspaces with no items in the window, the helper line collapses to undefined (`DashboardHero.tsx:76-78`); the tile renders without a helper, leaving the customer with no signal about WHY their CRITICAL number is what it is. There is no analogous helper for HIGH / MODERATE / LOW tiles. | `DashboardHero.tsx:75-93`, `critical-items.ts:34-35` | PRESENT_BUT_UNAUTHORIZED narrowing |
| M-8 | The `WhatChanged` summary copy hard-codes "since last audit" framing ("`<N> changes since last audit — review and update workflows accordingly.`", `WhatChanged.tsx:122`) and "since last audit" in the header ("`What changed — N since last audit`", `WhatChanged.tsx:148`). For a freight forwarder, "audit" is a regulatory-compliance frame; for Market Intel signal evolution or Research finding updates this language doesn't translate. | `WhatChanged.tsx:122,148` | MIS-FRAMED |
| M-9 | The Build 11 Q9 chip set is mounted only on `WeeklyBriefing` items (`WeeklyBriefing.tsx:183-270`), not on `WhatChanged` items, not on `Supersessions` cards, not on `DashboardSurfaceCoverage` rows. Section 8 vocabulary consistency requires the same chip vocabulary across surfaces; the Dashboard applies it to one widget only. | `WeeklyBriefing.tsx:183-270`, contrast `WhatChanged.tsx:170-244`, `Supersessions.tsx:48-94`, `DashboardSurfaceCoverage.tsx:106-196` | MIS-FRAMED partial application |
| M-10 | Community is structurally different (groups + memberships + threads, per `surface-coverage.ts:14-26` + `source-credibility-model SKILL.md:319-328`). The Dashboard's Community representation is exclusively the rail widget row showing "N groups + unread mentions" (`DashboardSurfaceCoverage.tsx:81-91`). There is no Community discussion thread, no peer-shared link, no editorial pickup of a hot Community discussion in the main body. The information-isolation problem the platform exists to solve (`SKILL.md:21`) is invisible in the Dashboard's editorial weight. | `DashboardSurfaceCoverage.tsx:81-91`, contrast empty Community presence in main body | MISSING (Community editorial entry) |
| M-11 | The Dashboard provides no Intelligence Assistant entry point. The comment at `HomeSurface.tsx:167-171` notes the AI prompt bar was deliberately removed. The per-page assistant scope (per `SKILL.md:134` "Available globally (floating button in AppShell)") is the global floating button only. For a "what should I look at first" page, the absence of an Assistant prompt that says "ask anything about your morning brief" is a deliberate scoping choice the operator may want to revisit. | `HomeSurface.tsx:167-171` | PRESENT_BUT_UNAUTHORIZED scoping decision |
| M-12 | The masthead meta line "X intelligence items across 5 surfaces · Y jurisdictions" (`page.tsx:94`) is the only count line that acknowledges five surfaces in the editorial header. The DashboardHero tile sum reflects priority-bucketed counts that include all five intelligence buckets but funnels into regulations on click (per M-1). The five-surface meta line is unverified by visual editorial weight, which remains regulation-centric. | `page.tsx:94`, contrast `DashboardHero.tsx:103-106` | MIS-FRAMED count-vs-content mismatch |

---

## 4. Missing Data Shapes

Schema, API, or classifier capabilities the spec implies that the Dashboard would need but that do not exist as wired data sources:

| Capability | Why the spec implies it | What exists today |
|---|---|---|
| `What changed across five surfaces` feed | A five-surface dashboard needs change-detection on Market Intel signals, Research findings, Operations data, and Community threads, not just Regulations changelog. | Only Regulations changelog is wired (`WhatChanged.tsx` consumes `changelog` prop from `getAppData` which is regulations-only). No `change_events` shape that spans the four intelligence surfaces + Community. |
| `Most critical signal` for non-Regulations surfaces | The CRITICAL tile helper is built from `compliance_deadline` + `item_timelines` (`critical-items.ts:79-244`). For Market Intel, "most critical" would mean a signal about to materialize. For Research, the highest-impact finding. For Operations, the highest-cost region decision. For Community, the most-engaged thread. | No analogue. The critical-items snapshot is regulatory-deadline-only. |
| Per-surface credibility vocabulary mapping at the row level | Per `source-credibility-model SKILL.md:295-303`, each surface foregrounds different signals. A Dashboard aggregator needs to know each row's source surface to pick the right chip set. | `WeeklyBriefing.tsx:183-270` applies one chip set to all rows. There is no `row.surface` property on the dashboard payload to switch on. |
| Cross-surface ownership / queue model | `DashboardByOwner` only surfaces regulation owners. The platform-intent dual-posture requires expansion-time forwarders whose primary work is in Market Intel or Operations to have an owner-queue surface too. | No `intelligence_item_owners` table; `actionOwner` is a Regulations-only column on `resources`. |
| Cross-surface Watchlist | The current `WatchlistItem` type union is `source \| reg \| signal` (`DashboardWatchlist.tsx:27-31`). A five-surface Dashboard needs `research_finding`, `regional_data`, `community_thread`, and possibly `working_group` as watchable types. | `WatchlistItem` shape limits the type union. |
| Community editorial pickup feed | Per `caros-ledge-platform-intent SKILL.md:120` ("Editorial pickup pipeline") Community discussion can be promoted to public. The Dashboard could surface "this peer discussion is hot" or "an editor picked up this thread". | No data shape feeding into a Community editorial widget on `/`. |
| Severity-label-tagged item payload | Per `environmental-policy-and-innovation SKILL.md:152-160` severity labels are mandatory on briefs. The dashboard rows render priority (urgency taxonomy) but not the severity label (decision-pressure taxonomy). | No `severity_label` field consumed in the dashboard data path (`getAppData` returns `Resource[]` with `priority`, `note`, `complianceDeadline`, etc.; not `severityLabel`). |
| Cause-and-effect chain shape on each row | The spec requires every data point to carry the chain. The dashboard rows render only title + note + day count + chips. | No `causeChain` or equivalent structured field on the row payload. |

---

## 5. Questions for Operator Before Rebuild

1. **Customer-decision frame.** What is the single decision a freight forwarder paying $500/month should be able to make from `/` on Monday morning? Currently the page answers "which regulation to review first". Should it answer "what should I do today across all five surfaces" (cross-surface action queue), or "what's the most consequential change since I last looked" (cross-surface change feed), or something else? Build 11 fixed count incoherence and added a five-surface rail widget but did not reorient the editorial body around this question.

2. **Surface representation balance.** Is the rail-widget-only treatment of co-equality sufficient (status quo), or should the editorial body's weight rebalance so that Market Intel signals, Research findings, Operations data, and Community discussions each have main-column real estate co-equal with Regulations? If the latter, what is the operator's preferred editorial pattern (mixed feed, per-surface lanes, decision-driven blocks, other)?

3. **Audience scoping.** `Housekeeping` (Coverage gaps, Awaiting review with "Open admin queue" link) is operator-facing chrome rendered on the customer Dashboard, with admin-gating only on the right card. Intended? Should `/` be scoped to customer audience exclusively, with operator chrome moved to `/admin`?

4. **Hero tile semantics.** The four hero tiles aggregate priority counts across all five surfaces (per `aggregates.byPriority`) but click-route to `/regulations?priority=...` only. Should each tile (a) route to a cross-surface filtered view if such a view exists, (b) route only to the regulations subset (and change the count to match), or (c) split into per-surface tiles? The current 4-up is a compliance-window taxonomy ("within 90 days", "6 mo") that doesn't translate to Market Intel signal lifecycle or Operations cost-decision pressure.

5. **Severity vs priority taxonomy.** The dashboard surfaces priority (CRITICAL / HIGH / MODERATE / LOW, an urgency axis) but not the severity labels (ACTION REQUIRED / COST ALERT / WINDOW CLOSING / COMPETITIVE EDGE / MONITORING, a decision-pressure axis) that the `environmental-policy-and-innovation` skill mandates on briefs. Should the Dashboard rows surface severity labels alongside priority, replace priority with severity, or some hybrid?

6. **Intelligence Assistant entry.** The AI prompt bar was deliberately removed from `/` per the comment at `HomeSurface.tsx:167-171`. The global floating button remains the only Assistant entry on Dashboard. Should an Assistant prompt return to the Dashboard to support cross-surface questions about the morning brief, or is the floating button sufficient?

7. **Q9 chip vocabulary across surfaces.** Build 11 mounted one chip set (Research-style: tier + citationCount + recency + bias) on every `WeeklyBriefing` top-5 row. Section 8 of `source-credibility-model` specifies different signal sets per surface. Should the Dashboard's chip rendering switch per row by source surface (consistent with the spec), or stay with one chip set on the Dashboard (consistency within the surface) and accept the inconsistency with per-surface vocabulary?

---

## Caveats

- READ-ONLY audit. No spec changes proposed; the operator owns whether and how to define a Dashboard surface in `caros-ledge-platform-intent`.
- The SKILL does not enumerate Dashboard among the five customer-facing surfaces. The audit treats the Dashboard as an implicit aggregator surface and tests it against the spec's binding rules (five-surface co-equality, dual-posture, Section 8 credibility vocabulary, workspace anchoring, severity labels). Whether Dashboard SHOULD be elevated to a sixth surface, demoted to a chrome page, or formally redefined as the cross-surface aggregator is an operator decision.
- Build 11 demonstrably fixed engineering bugs (count incoherence, hardcoded "LL97/FuelEU/CBAM" string, missing surface representation). The customer-decision question is separate from the engineering question and is unanswered by Build 11.
- The `3133b82` `WhatChanged` hotfix today preserves header + last-updated visibility through empty states. The hotfix is in scope of the customer-decision question only insofar as a permanently-visible "What changed" header now invites the customer to read a Regulations-only changelog as the answer to "what changed across the platform".

## Related

- [[wave1-track5-widget-implementation-plan]] — That plan builds the exact widgets audited here (DashboardWatchlist, DashboardByOwner, DashboardCoverageGaps, DashboardAwaitingReview,…
- [[spec-audit-regulations-2026-05-23]] — DashboardHero is shared: audit finds every hero tile deep-links into /regulations, the regulations audit's index chrome
- [[ADR-007-bias-tag-threshold-per-dimension]] — Q9 chip set the audit critiques includes the bias chip governed by this ADR
- [[ADR-008-urgency-score-default]] — WeeklyBriefing top-5 ranks by urgencyScore whose default this ADR sets
- [[spec-audit-synthesis-2026-05-23]] — One of the eight audits synthesized; Dashboard listed as reframing not rebuild
