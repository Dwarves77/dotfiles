# Caro's Ledge — site assessment for Claude Design

Observation only. Nothing in this document proposes a fix; every entry is something
measured, read out of source, or captured on the live site on **6 September 2026**.
Evidence status is marked on every claim: `[MEASURED]` ran this session,
`[SOURCE]` read in the repo at `origin/master`, `[OBSERVED]` seen in a capture.

Companion asset: `captures/` — the live site photographed page by page, top to bottom,
in overlapping scroll frames, with named interaction states.

---

## 1. What the product is

A subscription intelligence product for freight sustainability and regulatory compliance.
The reader is a professional at a forwarder, importer or exporter who needs to know what
is binding on them, when it bites, and what it costs. `[SOURCE]` `docs/plans/complete-system-build-plan-2026-09-04.md`

Content is organised as five surfaces over one corpus of 1,434 items:

| Surface | Items | What it holds |
|---|---|---|
| Regulations | 1,316 | binding law, agency rules, court decisions |
| Market intel | 55 | price series, corporate moves, capital flow |
| Research | 39 | horizon-scan findings from journals and analytical press |
| Operations | 25 | regional cost, feasibility, infrastructure |
| Community | 7 rooms | peer working groups |

Every item carries a jurisdiction, one or more transport modes, a source set with a
credibility tier (T1–T6), and an urgency classification.

## 2. Route inventory

All 18 top-level routes return HTTP 200 `[MEASURED]`; `/login` and `/signup` redirect
because the captured session is authenticated.

```
/                      dashboard, "Your brief"
/regulations           list + 4 band tiles + obligations rail
/regulations/[slug]    detail, 5 tabs
/market                list + comparative price ribbon + carbon cost panel
/market/[slug]         detail, 6 tabs
/research              list + 4 band tiles + 4 theme tiles
/research/[slug]       detail
/operations            list + 4 band tiles + 6 dimension tiles + region matrix
/operations/[slug]     detail, no tabs
/map                   basemap + jurisdiction register, 3 view modes
/community             7 regional rooms + one open room
/community/[slug]      a room
/community/browse      room directory
/community/moderation  operator surface
/watchlist             saved items
/profile               account, 2 tab rows (2 + 7 tabs)
/settings              preferences
/admin                 operator console, 7 section panels + issues queue
/admin/factors         factor register
/onboarding /login /signup /workspace/new /invitations/[token] /privacy
```

Three different URL identifier schemes coexist on a single page `[OBSERVED, /operations]`:
readable slugs (`singapore-regional-operations-profile`), raw UUIDs
(`282e480c-3d79-4ab8-8f60-b4c77fa3b228`), and short codes (`r32`, `g25`).
The same mixture appears on `/market`.

## 3. The token layer, read from source

`[SOURCE]` `fsi-app/src/app/theme.css`, `fsi-app/src/app/globals.css`

Fonts, self-hosted via `@fontsource`:
- display `Anton` — uppercase, letter-spacing `.04em`, line-height `1.08`, weight 400
- body `Plus Jakarta Sans` — 400/500/600/700

Surfaces and ink:
```
--color-bg-base        #FAFAF8      --color-text-primary   #1A1A1A
--color-bg-surface     #FFFFFF      --color-text-secondary #5A6B67
--color-bg-raised      #F5F2EE      --color-text-muted     #7A6E6C
--color-border         rgba(0,0,0,0.12)   subtle .06   strong .20
--radius-sm/md/lg/pill 6 / 10 / 14 / 999
--shadow-card          0 1px 3px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04)
--transition-fast/base .12s / .18s ease
```

Impact dimension colours: cost `#CA8A04`, compliance `#9333EA`, client `#0D9488`,
operational `#2563EB`.

Topic colours: emissions `#5856D6`, fuels `#A2845E`, transport `#16A34A`,
reporting `#9333EA`, packaging `#E11D48`, corridors `#2563EB`, research `#0891B2`.

### 3.1 Two token sets coexist, by design

`theme.css` states it in its own header comment `[SOURCE]`:

> "Editorial tokens … are added ADDITIVELY in this file. The pre-existing orange/blue
> token set is intentionally retained so components that currently reference
> `--color-primary` keep rendering unchanged. **PRs 2+ migrate components onto the
> editorial tokens one screen at a time.**"

It also names a prior design package as the source of truth for the editorial set:
`design_handoff_2026-04/DESIGN_SYSTEM.md`.

### 3.2 Two priority scales, same names, different colours

```
--critical  #DC2626      --color-critical  #DC2626   bg #FEF2F2  bd #FECACA
--high      #D97706      --color-high      #D97706   bg #FFF7ED  bd #FED7AA
--moderate  #6B7280 grey --color-moderate  #EAB308 yellow
--low       #9CA3AF grey --color-low       #16A34A green
```
A component built against the first set renders Moderate grey; one built against the
second renders it yellow. Both are live.

### 3.3 Two brand accents

```
--color-primary  #E8610A   orange   (buttons, active nav, CTAs)
--accent         #1E3A8A   navy     (editorial set)
--color-secondary/--accent-blue  #2563EB   (links, tier chips, masthead meta)
```

## 4. Urgency vocabulary: five sets for one four-band system `[OBSERVED]`

| Surface | Words used |
|---|---|
| Regulations list | Immediate action · Action · Monitor · Awareness |
| Dashboard | Immediate action · High · Moderate · Low |
| Research | Action required · Cost alert · Monitor · Background |
| Market intel | Action required · Cost alert · Window closing · Competitive edge · Monitoring *(five)* |
| Operations | Critical · High · Moderate · Low |
| Detail page chip | "Action 6mo" |

## 5. Structural inconsistencies `[OBSERVED]`

1. **Left nav width changes between pages.** 157px on list pages and Operations detail;
   207px on Regulation and Market detail. The page shifts horizontally on navigation.
2. **Four detail-page architectures.** Regulation: 5 tabs. Market: 6 tabs, only "Sources"
   shared. Operations: no tabs. Account: two stacked tab rows (2 then 7).
3. **Click affordance differs by surface.** On Regulations the row title is the link.
   On Market and Research the link is a separate "Full analysis →" button; the title is not
   clickable.
4. **Page chrome differs.** Regulations / Market / Research / Operations / Community /
   Watchlist carry a masthead card with `VOL IV · NO. 36`. Admin does not. Regulation and
   Market detail replace the masthead with a breadcrumb. Operations detail uses a small
   "← Operations" link.
5. **Right rail is inconsistent.** Present on Dashboard, Research, Map, Community, Admin
   and all detail pages; absent on Regulations, Market and Operations lists.
6. **The AI ask bar repeats.** Dashboard, Regulations, Research, Operations, and on
   *every tab* of every detail page — roughly 140px of identical control re-rendered per tab.
   Market list has none.
7. **The band-tile component is reused for non-band data.** On `/profile` the same tile
   renders Sectors followed, Home jurisdictions, Member since and Admin attention;
   "Admin attention 5,074" is styled in critical red at the same weight as "Immediate 15".
8. **Counts disagree.** Dashboard header says 1,434 items; its own platform panel says
   Regulations 1,315; the Regulations page says 1,316.
9. **Dashboard content is non-deterministic.** Two loads three minutes apart returned
   different "Top priority this week" sets (first: Mexico SEMARNAT, Reg (EU) 2024/1157,
   EU PPWR, EUDR, Delegated Reg 2024/3214; second: California AB 1305, Mexico SEMARNAT,
   Reg (EU) 2024/1157, EU Battery Regulation, EU PPWR).

## 6. List rendering `[OBSERVED, /regulations and /market]`

- Every row carries a **second full-height row** holding two chips:
  `EVIDENCE × AGREEMENT: NOT SCORED (1)` and `SOURCE AUTHORITY: NOT SCORED`.
  Present on effectively every item on both surfaces.
- Row heights vary roughly **90px to 160px** as titles wrap one to three lines.
- Three stacked control clusters precede the first item on `/regulations`: the AI ask box
  with three suggestion chips, then a search field with four sort toggles and a Filters
  button, then the band header. Roughly 200px before any content.
- The right-hand column shows a date and a blue numeric chip (`T1`, `11`) with no legend
  on the page.
- All four band tiles are identical in size; the largest numeral on the page is
  `1,119 MONITOR`.

## 7. The two components that appear on one page only `[OBSERVED, /regulations/[slug]]`

- **Impact assessment.** Four horizontal bars — Cost impact, Compliance obligation,
  Client-facing, Operational — each with a filled track, an `x/3` value and a Low/High word.
  Colour per dimension from the token set in §3.
- **Milestone timeline.** A horizontal track with filled and hollow dots on a
  green-to-amber gradient, year labels 2023–2027, and a callout for the current milestone.
  "Showing 8 key milestones of 12."

Neither appears on Market, Research, Operations, the Dashboard, or any list.

## 8. Content pattern: extracted facts re-buried in prose `[OBSERVED]`

The pipeline extracts structured facts and then renders them as running paragraphs with
inline labels and raw URLs.

- Regulation detail, "Issues requiring immediate action": paragraphs containing
  `Cause: FACT: "…"`, `*Source: …`, `Mechanical consequence: …`, `Effect on workspace: …`
  with full URLs inline. The operative date (30 September 2026) sits mid-sentence.
- Penalty schedule: the fact that no verbatim penalty rate exists is a clause inside a
  paragraph, not a stated condition.
- Operations detail: Singapore port-dues concession terms (100% concession, CF ≤ 1.375,
  B100, B24–B49, methanol, ammonia with N₂O addressed) inside a single ten-line block.
- Market detail: `275.412 (Index 1982=100) in April 2026, up from 262.811 in March and
  252.364 in January` inside running text.

## 9. Honest-absence states `[OBSERVED]`

The product states absence rather than faking data, and does so frequently:
`NOT SCORED`, `no data yet`, `no delta yet (history backfill pending)`, `NO PRICE DIMENSION`,
`NO KEY FIGURE YET`, `LANE-LEVEL EXPOSURE PENDING`, `PUBLISHED STATISTICS PENDING`,
`NOT BUILT YET`, `no discussions yet`, `— no data` (Operations matrix, 7 of 25 cells),
`DISPOSITION PENDING`. On Market's carbon-cost panel a `GAP` block lists four separate
reasons a figure is unavailable. These are currently rendered as grey text in bordered boxes.

## 10. Performance `[MEASURED, /regulations/[slug]]`

| Metric | Value |
|---|---|
| TTFB | 28 ms |
| DOMContentLoaded | 644 ms |
| Load event | 772 ms |
| First contentful paint | 14,096 ms |
| Total payload | 224 KB across 78 resources |
| Client-side fetches | 44, last completing at 34,218 ms |
| Scripts | 25, last completing at 33,666 ms |

Named fetches in the waterfall include `bootstrap`, `relevance?itemId=`, `register?itemId=`,
`regulations?_rsc=`. Server and payload are not the constraint.

**Caveat:** the FCP figure was taken in a tab that may have been backgrounded, and Chrome
throttles rendering in background tabs. The 44 fetches and the 34 s tail are structural and
hold regardless; the 14 s paint needs a foreground re-measure before being quoted as final.

Consequence for design: for several seconds the reader is looking at a partially rendered
page. That intermediate state currently has no defined appearance.

## 11. Interaction defects seen while clicking `[OBSERVED]`

- `/regulations/[slug]` — clicking "Full summary" revealed a **third** option,
  "Complete brief", that was not present before the click, and the body still displayed
  `SHORT SUMMARY`.
- `/regulations` — the row title is the only click target; clicking elsewhere in the row
  does nothing.
- `/market` — clicking a signal title does nothing; only "Full analysis →" navigates.
- The right rail on Regulation and Market detail is **cut off at 1440px** viewport width;
  "AT A GLANCE" and the relevance panel are clipped at the right edge.

## 12. Capture coverage

Captured: see `captures/`. Named by page and state.

Not captured, and why:
- **390px mobile and 1024px tablet** — no frames taken at either width.
- **Logged-out flow** (`/login`, `/signup`, `/onboarding`, `/workspace/new`, invitation
  accept) — the session is authenticated, so these redirect. Needs a private window.
- **Loading states** — capturable by screenshotting immediately after navigation rather
  than after a wait. Not yet done.
- **Overlays** — Export brief, Share, the per-row `⋯` priority dropdown, the Ask AI panel.
- **Content extremes** — most captured items sit at the sparse end. A regulation and a
  market signal with full data are not represented.
- **Empty results** — a search or filter combination returning nothing.

---

# Part B — What is liked, and why consistency is the governing constraint

Sections 13–15 record stated preference, not observation. Quotes are the operator's own
words from the review session of 6 September 2026 and are marked `[OPERATOR]`.

## 13. What the operator values in the current site

The brief is explicitly **not** a repudiation. `[OPERATOR]` *"I like some aspects of the
design"*; the stated problems are that it is *"hard to read, not easy to navigate."*
Three things are named as things to keep and use more:

**13.1 The milestone timelines.** `[OPERATOR]` *"i love that our site has the timelines
built the way it does."*
What it does: a horizontal track carrying filled dots for milestones passed, a highlighted
dot for the current one, hollow dots for those ahead, on a green-to-amber gradient with
year labels. A regulation's life is legible as a shape before a word is read.
Where it exists: `/regulations/[slug]` Summary tab only.

**13.2 The relevance levels and gradations.** `[OPERATOR]` *"the relevance levels and
gradations for important."*
What it does: the four-band urgency classification, rendered as coloured tiles with a
ramp from red through amber and yellow to green, repeated as a left border on list rows
and as a gradient rule above the list. Urgency is carried by the visual system rather
than by wording.
Where it exists: every list surface, though under five different vocabularies (§4).

**13.3 The meters with gradation.** `[OPERATOR]` *"the relevant meters with gradation."*
What it does: the Impact assessment block — four named dimensions, each a filled track
with an `x/3` value and a word, each dimension in its own colour. Four separate judgements
readable in one glance without reading.
Where it exists: `/regulations/[slug]` only. The same two underlying scores render on
list rows as text chips reading `NOT SCORED`.

**13.4 Not named by the operator, but consistent with the above.** The masthead
convention — `VOL IV · NO. 36 · SUNDAY`, the Anton display face, the newspaper framing —
gives the product an identity distinct from generic SaaS. It carries on eight surfaces
and is absent on Admin and the detail pages.

**13.5 Explicitly rejected as a direction.** `[OPERATOR]` *"i dont need images on the site
as filler, we need to have the data easily navigated."* Decorative imagery is out of scope.

## 14. Reference products and what is valued in each

None of these were captured; three of the four sit behind a subscription. What follows is
the operator's stated judgement plus a factual description of the pattern being referred to.

| Product | Verdict `[OPERATOR]` | What it is being referenced for |
|---|---|---|
| **Koyfin** | *"organized so the data is easy to navigate unlike ours"* | Grouped navigation with saved views promoted to the top; a consistent panel grid; one search that reaches any instrument; dense tables with held headers |
| **AlphaSense** | *"as does alphasense"* | Search-first navigation; a result list that stays pinned while a document opens beside it, so position is never lost; facet filters with live counts always visible rather than hidden behind a control |
| **Bloomberg Professional** | *"pleasing, dont like the dark mode vibe"* | Generous whitespace around dense blocks; separation by rules rather than by boxing every element; a restrained palette with a single accent; confident section headings. The dark theme is rejected; the spatial discipline is not |
| **The Economist** | *"looks pretty good"* | Disciplined typography — small caps reserved for one job, rules doing structural work, a single accent used sparingly; colour ramps earned by being used for one thing only |
| **Lloyd's List** | *"pretty good not great"* | A 290-year-old shipping publication carrying a masthead alongside hard operational data — the closest tonal precedent for the Caro's Ledge framing |
| **Federal Register** | *"boring but functional"* | Document timelines and structured legal presentation. The function is noted; the appearance is rejected |
| **Financial Times** | *"looks like its from 1990, its not practically catchy and visually pleasing"* | Rejected |
| **GOV.UK Design System** | *"boring and NOT what i want"* | Rejected |

The common thread across the four accepted references is **navigation of dense data**, not
decoration: knowing where you are, seeing how much there is, and not losing your place.

## 15. Why consistency is the governing constraint

The operator states the failure mode directly `[OPERATOR]`:

> *"what has happened in the past is we redesign one page and the others get done later and
> don't quite match or have the same cool attributes."*

This is not a hypothesis. It is documented in the codebase and visible in the artefacts.

**15.1 The mechanism is written into the stylesheet.** `[SOURCE]` `theme.css` retains a
complete second token set specifically so that unmigrated components keep rendering, and
states the migration plan as *"PRs 2+ migrate components onto the editorial tokens one
screen at a time."* One screen at a time is the drift, adopted as policy.

**15.2 A prior design package exists and its deviation log is empty.** `[SOURCE]`
`docs/design/redesign/` holds eleven approved `.dc.html` page mocks, a build handoff brief,
and `DESIGN-DEVIATIONS.md`, whose stated purpose is that *"any departure from the mock goes
in DESIGN-DEVIATIONS.md as a proposal for Jason, never a unilateral decision."* The file
contains its header and table row and **no entries**. Eleven templates were built and no
deviation was ever recorded. The operator has since discarded this package.
`theme.css` also names a still earlier one, `design_handoff_2026-04/DESIGN_SYSTEM.md`.

**15.3 The result is measurable, not aesthetic.** Every item in §4 and §5 is an instance of
the same cause: one component or convention was decided on one screen and never propagated.
Five urgency vocabularies. Two priority scales sharing names. Two brand accents. Two nav
widths. Four detail-page architectures. Three URL schemes. Two click affordances. A tile
component reused for unrelated data.

**15.4 What it costs the reader.** The four-band gradation, the meters and the timelines —
the three things the operator names as the product's best ideas — are each undermined by
inconsistency rather than by their own design. The gradation is diluted because five
vocabularies describe it and two token sets colour it. The meters are invisible on the
surfaces where scanning happens, because there they render as the words `NOT SCORED`. The
timeline exists on one screen out of twenty. The strengths are present but not systematic,
which is why the product reads as hard to navigate despite containing good components.

**15.5 The implication for how the work is structured.** A page-at-a-time redesign has now
been attempted at least twice and drifted both times, with the second attempt leaving an
empty deviation log as its record. Any approach that produces one page and defers the rest
reproduces the documented failure.

---

# Part C — Session context, constraints, and method

Recorded so a designer picking this up has the reasoning, not just the conclusions.

## 16. How the brief arrived, in order

The brief was not given as a specification; it emerged across a review session. In sequence:

1. Opening statement `[OPERATOR]`: *"Unsatisfied with the UI and design of the site. I think
   it's hard to read, not easy to navigate. I like some aspects of the design."*
2. A prior Claude Design package was found committed at `docs/design/redesign/`. The operator
   had already deleted it in the Claude Design canvas: *"i erased those claude design docs
   because i want to start fresh and not have those embedded mistakes."* The repo copies are
   still on `origin/master` and were flagged as a contamination risk for any agent reading
   the repo, since that folder's README instructs agents that *"the mock wins."*
3. Reference sites were proposed and judged one by one (§14). GOV.UK was proposed first and
   rejected: *"this is boring and NOT what i want."* The correction is recorded because it
   shaped everything after: the product has editorial character and the brief is to make it
   readable, not to neutralise it.
4. The operator named what to keep: timelines, relevance gradations, meters (§13).
5. Scope was set: *"we need a complete overhaul of every page on my site and click into every
   one of them, this is about consistency across the site."*
6. Method was set: *"its not just about what a page looks like when you first enter but how it
   flows"* — states and transitions, not first paint. Then: *"if there is a place to click on
   any page the agents should be clicking because this will also tell us whats connected
   correctly or not"* — the capture doubles as a connectivity audit.
7. Roles were set: *"you're not as good as claude design at design, it needs to have the info
   you are collecting"*, and finally *"do not come up with solutions, your job is to just
   document."* This document is written to that instruction. Every proposal previously offered
   in conversation was withdrawn.
8. Imagery was ruled out: *"i dont need images on the site as filler, we need to have the data
   easily navigated."*

## 17. Division of labour on this project

- **The operator** rules. Design decisions are his.
- **Claude Design** makes the design decisions on the canvas. Reading order, hierarchy,
  what to do when a fact disappears into a wall of prose (§8) — these are design questions
  and are not answered in this document.
- **The coordinating session** (author of this document) captures, measures, documents, and
  hands over. It does not design.
- **Sonnet and Haiku lane agents** implement against an approved design, working from a brief,
  in isolated git worktrees, landed as trains through CI.

## 18. Build constraints any design must satisfy

A design that cannot pass these gates cannot land, so they are stated as facts about the
target, not as design guidance.

- **Stack** `[SOURCE]`: Next.js App Router, Tailwind v4 (`@theme inline` in `globals.css`),
  React. Fonts are self-hosted through `@fontsource` (`Anton`, `Plus Jakarta Sans`), not
  fetched from Google at runtime.
- **Rendering guard** `[SOURCE]` `fsi-app/.discipline/rendering/run-rendering-guard.mjs` —
  a real-browser check for overflow, placeholder leakage and hydration faults. New surfaces
  register a smoke spec.
- **Fitness functions** `[SOURCE]` `fsi-app/.discipline/fitness/runner.mjs` — 32 checks
  enforced in CI. F35 maintains a `ROW_COMPONENTS` register; F25 fails on any module that is
  built but unreachable, so a component drawn and not wired will fail the build rather than
  sit dormant.
- **Design principles** `[SOURCE]` `docs/design/design-principles.md`. DP-1, "Single-Pane
  Operator Review", is binding on operator surfaces: every action related to one item must be
  reachable from one location; tab-switching across the admin surface to handle related
  decisions on the same item is forbidden by design. It explicitly does **not** apply to
  customer-facing UI.
- **Memory gate**: any change touching `.tsx` must ship with a session-log entry including a
  UX compliance block, or CI fails.
- **Performance work is already in flight separately.** The §10 measurements were handed to
  another agent working on the application. The fetch-waterfall problem is being addressed
  there, not in the design.

## 19. Method and its limits

**How the captures were taken.** Chrome, authenticated as the operator, viewport 1440×840.
Each page navigated, allowed 10 seconds to render, then captured top to bottom in overlapping
scroll frames. Named interaction states captured by locating the control and clicking it.
Six agents worked in parallel, each in its own browser tab. Files are in `captures/`, named
`<page>-<nn>.jpg` for scroll order and `<page>-<state>.jpg` for interaction states.

**Known limits of this evidence set:**

1. The browser tool returns one 1440×840 viewport per call; window resizing did not increase
   capture height. Full pages are therefore reconstructed from overlapping frames, not single
   images.
2. Screenshot calls intermittently fail with a renderer timeout on this site. Retries were
   used; any frame that failed three times was skipped and noted.
3. The corpus is live and changes between loads (§5.9), so two captures of the same page may
   not show the same items.
4. The session is authenticated as an owner with admin rights. Nothing has been seen as a
   plain member, a read-only viewer, or a logged-out visitor.
5. Coverage gaps are listed in §12 and are real gaps, not oversights: mobile, tablet,
   logged-out, loading, overlays, empty results, and data-rich examples.
6. Reference products were not captured (§14); three of four are behind subscriptions.

## 20. What this hands over

- `ASSESSMENT.md` — this document.
- `captures/` — the live site, page by page and state by state.
- The prior design package at `docs/design/redesign/` on `origin/master` is **superseded and
  should not be read as a specification.** The operator has discarded it. It is named here only
  so that an agent that encounters it in the repo knows to ignore it.

---

# Part D — Findings from the full capture run

Added after the six-agent capture completed. 118 frames. `[OBSERVED]` unless marked.

## 21. A dead control, confirmed

`/regulations/[slug]` — the **"Complete brief"** toggle, which appears beside "Short summary"
and "Full summary" only *after* Full summary is clicked, is **not wired**. Inspected in the
DOM `[MEASURED]`: a plain `<span>` with no click handler, no `disabled` attribute, and no
`button` or `tab` role. Clicking it by element reference and by coordinate both produced no
state change. A third summary depth is advertised to the reader and does not exist.

## 22. A fifth detail-page architecture

`/research/[slug]` has **no tabs at all** — a single flowing document running S1 "What the
research found" through S6 "Sources", plus Related Findings and Recalculation Notices.
Eleven scroll frames. The count in §5.2 is therefore five architectures, not four:

| Surface | Structure |
|---|---|
| Regulation detail | 5 tabs |
| Market detail | 6 tabs, only "Sources" shared |
| Research detail | no tabs, one long document |
| Operations detail | no tabs, sectioned |
| Account | two stacked tab rows, 2 then 7 |

## 23. Hit targets miss

On `/research`, clicking the "Full analysis →" link landed on an adjacent `+` expand control
instead. The capture agent had to recover the destination from the DOM
(`/research/9118aab6-bafe-43d8-9944-baf8dc698aab`) and navigate directly. Adjacent controls
are close enough that an intended click lands on its neighbour.

## 24. Page lengths

`/market` has a real scrollable height of approximately **17,570px** — eleven capture frames.
Below the comparative ribbon and carbon-cost panel sit a 55-signal feed including a 41-item
Monitoring band, then a Market Series Board, a Policy Timeline, and an Upcoming Obligations
section at the very bottom. `/research/[slug]` runs eleven frames. `/regulations/[slug]` in
Full summary runs five.

## 25. Scroll containment `[MEASURED]`

The real scroll container is an inner `<main class="overflow-y-auto">`, not `document.body`.
`document.body.scrollHeight` and the window report a fixed ~1050px regardless of scroll
position. Consequences observed: browser scroll restoration does not apply, and returning to
a list after opening an item does not restore position.

## 26. An empty-result state was captured

`research-window-7d.jpg` — the 7-day window applied on top of an active theme filter yields
**"0 of 39 findings / Nothing to show"**. This closes one of the §12 gaps: an empty-result
state now exists in the capture set.

## 27. Expanded rows carry real data

`operations-dimension-expanded.jpg` — clicking the "Labor markets" row in the region matrix
expands an inline Facts row with sourced figures per region (EU €40.4/hr; US $30–60k/yr;
Hong Kong and Japan minimum wage; UK £40–42k/yr driver wages; UAE private-sector salary
growth). This data exists and is one click below a cell that otherwise reads as a bare
number or "— no data".

## 28. Revised gap list

Closed by this run: empty-result state (§26), all detail-page architectures, all admin
panels, all account sub-tabs, community room and browse, map view modes.

Still open, unchanged: **mobile 390px, tablet 1024px, logged-out flow, loading states,
overlays** (Export brief, Share, the per-row ⋯ dropdown, Ask AI), **data-rich content
extremes**, and **non-admin roles**.
