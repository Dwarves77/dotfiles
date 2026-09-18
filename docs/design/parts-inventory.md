# Parts inventory: docs/design/parts-brief-2026-09-18.md, section 2

Method note: read `docs/design/parts-brief-2026-09-18.md` in full (incl. section 2.16, added mid-session)
and its section 1.1/1.2/1.3; read the prior-art docs `docs/design/handoff-2026-09-06/SHARED-PART-REPORT-2026-09-08.md`
and the header/method of `AUDIT-2026-09-07.md` (4060-line generated file, not re-read in full, its own
"2557 MATCH, 0 MISMATCH" summary is cited, not reproduced); read every named `src/components/ui/` part
plus the detail-surface, list-surface, dashboard, sidebar and command-bar components that mount them; grep
every `src/app/**/page.tsx` for literal card/chip/rule styles. No rendering run, no browser, no DB query , 
source read only, at repo commit `7f28bbcd21dd9eb058140ea9ac87314b49df164d` (`C:\Users\jason\dotfiles\.worktrees\wt-session-c`,
`fsi-app/`). Depth varies by row: rows marked "spot-checked" below verified a sample of routes, not all 20;
nothing here is a rendered measurement (no `npm run audit:design`, no Playwright), so a route not read
directly is not claimed either way.

Artboard 21 (`screens/21-detail-parts.png`, fact-card v2 / merged action card / long-title masthead), the
fixture picture this whole brief hangs its detail-surface parts on, **is still not in the repo**
(`docs/design/handoff-2026-09-06/screens/` has no file matching `21*`, checked this session). Every FactCard
and ActionCard finding below is therefore measured against the brief's PROSE only; where the prose and the
component disagree there is no image to break the tie, which is itself the first entry in "cases not drawn"
below.

Routes read or grepped this session, beyond the 20 the stage names: the 7 CommunityShell sub-routes
(`/community/browse`, `/directory`, `/discover`, `/benchmarks`, `/moderation`, `/profile`, `/community/[slug]`)
and `/admin/factors`, because they surfaced during the Masthead and literal-style sweeps. Flagged where used.

## The table

| Part (brief section) | Component today | Zones or variants missing vs the brief | Routes using the part | Routes rendering the equivalent without it (file:line) | Literal styles in page.tsx (file:line) |
|---|---|---|---|---|---|
| 2.1 FactCard | `src/components/ui/FactCard.tsx` (`sourced`/`inference`/`counsel`), reached via `src/components/detail/primitives.tsx:65-105` (`RecordFactCard`, regulations) and `src/components/detail/FactBlocks.tsx:22-36` (`parseFactParagraphs`, market/research/operations) | No kind band top strip (kind word + qualifier on a tint, per-kind colour), current card has one eyebrow line ("Fact" / "Legal confirmation required" / a free label), not the brief's fixed kind vocabulary (ACTION REQUIRED, DEADLINE, BASELINE TARGET, NATIONAL TARGET, SCOPE, PENALTY, DEFINITION, ANALYTICAL INFERENCE, 3 variants today vs ~9 kinds). No 132px/1fr/150px body-row grid, no Anton-22 figure lead, no separate provenance COLUMN (provenance is a bottom row, not a right column). Left edge is 2px not 3px. Brief text also names "dashboard What changed" as a FactCard consumer; it is not (see next column) | `regulations/[slug]` (`RecordFactCard`), `market/[slug]`, `research/[slug]`, `operations/[slug]` (all via `FactBlocks`), `operations` matrix panel (`src/components/operations/RegionDimensionMatrix.tsx`) | Dashboard "What changed" (`src/components/dashboard/DashboardBrief.tsx:252-296`) renders `ListRow` rows for changed items, not FactCard, though the brief's own prose lists it as a FactCard surface | none found |
| 2.2 ItemGroup | NONE. No `ItemGroup` component exists (`grep -r ItemGroup src` matches only an unrelated admin review-list component, `src/components/sources/CanonicalSourceReview.tsx`) | Everything: header (item band pill + title + qualifier), inter-group 1px rule, closing ACTION strip (`StateNote` in the band's tint) | none | All four detail S2-equivalents render a flat stack of FactCards with no grouping wrapper, `RegulationDetailSurface.tsx` (via `DetailSection`, `src/components/detail/DetailShell.tsx:651-692`), and the market/research/operations equivalents, same `DetailSection` | none found |
| 2.3 SectionHeader | Two un-merged implementations: `src/components/ui/SectionHeading.tsx` (title + aside; used by dashboard cards) and `DetailSection`'s own inline `<h2>`+aside (`src/components/detail/DetailShell.tsx:671-687`), which its own comment (`:660-670`) says is "SectionHeading.tsx's own, declaration for declaration", i.e. hand-duplicated, not imported | Neither renders the brief's leading "S2"-style index label (10.5px/800 muted before the Anton title). Live contradiction: brief 2.3 asks for a "1px rgba(0,0,0,.08) rule below"; `SectionHeading.tsx:27-30` cites ruling 4.1/5.1 (2026-09-07) that explicitly FORBIDS a divider below this title. "Running prose with no card → one fact card, kind DEFINITION" (S3 "Compliance chain" case) not found anywhere | `SectionHeading.tsx`: dashboard `/` (Due next, What changed, `DashboardBrief.tsx:255-258`, `:... ` second mount for What changed); `DetailSection`'s own header: all four detail routes' S-sections | All four detail routes (`regulations/[slug]`, `market/[slug]`, `research/[slug]`, `operations/[slug]`) render their S-section titles via `DetailSection`'s own markup, not `SectionHeading` | none found |
| 2.4 Masthead | `src/components/ui/Masthead.tsx` (VOL/No. eyebrow, Anton 28/34 title, dek, `CommandBar`) | Where mounted, zones match the brief closely (VOL line, sized title, dek, one command bar). The gap is COVERAGE, not shape: the older `EditorialMasthead` (`src/components/ui/EditorialMasthead.tsx`) is still live on the 7 CommunityShell sub-routes via `CommunityMasthead.tsx:22,54` (`src/components/community/CommunityShell.tsx`). Every other route's own `EditorialMasthead`/`PageMasthead` reference left in the repo is now a stale CODE COMMENT only (verified by direct read: `market/page.tsx:5`, `market/[slug]/page.tsx:277`, `operations/page.tsx:8`, `operations/[slug]/page.tsx:287`, `research/[slug]/page.tsx:23,308`, `regulations/page.tsx:18`, `regulations/[slug]/page.tsx:271`, none of these actually import it any more) | Canonical `Masthead`: `/` (`DashboardMasthead.tsx`), `regulations` + `regulations/[slug]`, `market` + `market/[slug]`, `research` + `research/[slug]`, `operations` + `operations/[slug]` (all via `ListSurfaceShell.tsx:417` for lists, `DetailShell.tsx:191-203` `DetailMasthead` for details), `map` (`MapPageView.tsx`), `watchlist`, top-level `community` (`src/app/community/page.tsx:515`), `settings`, `profile`/account, `regulations/register`, `operations/calculator`, `admin` (`AdminDashboard.tsx`) | `/community/browse`, `/community/directory`, `/community/discover`, `/community/benchmarks`, `/community/moderation`, `/community/profile`, `/community/[slug]`, all via `CommunityShell` → `CommunityMasthead.tsx:54` → `EditorialMasthead`, not `Masthead`. `/login`, `/signup`, `/onboarding` mount neither (own `AuthFrame` header), unresolved, see cases-not-drawn | none found (Masthead assembly lives in components, not page.tsx) |
| 2.5 CommandBar | `src/components/ui/CommandBar.tsx` | The brief (today, 2026-09-18) says "Remove the Search\|Ask toggle and the second 'Search' button." The bar currently HAS exactly that toggle: a `role="group"` pair of "Search"/"Ask" buttons (`CommandBar.tsx:507-548`, `modeTabStyle` `:445-461`), added by a later, separately-ruled lane (CMDSEARCH, 2026-09-09, cited in the file's own header `:28-52`) that post-dates the design system's one-button spec and now directly contradicts this brief. This is the single largest CommandBar gap. Separately CLOSED already: the floating "Ask AI" button is gone (`AskAssistant.tsx:317-326`, ruling 2026-09-07 item 2.2, code comment confirms); no per-page `DashboardAskBar` remains (only a comment reference, `CommandBar.tsx:13`) | Every route with a `Masthead` (see 2.4's list) carries this one bar | none found, the bar itself is the one part, the toggle inside it is the defect | none found |
| 2.6 ActionCard | NONE. Brief wants ONE card (chips+tier+source → action row → rule → EXPOSURE → rule → TIMELINE → next-obligation `StateNote`). Today these are four SEPARATE `SectionCard`-backed components, each its own card: `DetailMasthead` (title card, wraps `Masthead`), `DetailHeader` (`DetailShell.tsx:96-139`, chips+actions), `DetailExposure` (`:222-256`), `DetailTimeline` (`:265-323`) | Merge into one card entirely undone, confirmed by direct read of `RegulationDetailSurface.tsx:191-277`: `<DetailMasthead>`, `<DetailHeader>`, `<DetailExposure>`, `<DetailTimeline>` mount as four consecutive siblings, each `marginBottom: 16` (own gap, not the brief's "40px" wording but still 4 boxes, not 1) | none (part not built) | All four detail routes (`regulations/[slug]`, and by the same `DetailHeader`/`DetailExposure`/`DetailTimeline` components, `market/[slug]`, `research/[slug]`, `operations/[slug]`) render the header/exposure/timeline as three-to-four separate cards | none found |
| 2.7 StateNote | `src/components/ui/StateNote.tsx` | Matches the brief's geometry exactly (border-left 3px solid band colour, band tint background, radius `0 6px 6px 0`, padding `9px 12px`, text left + action link right, neutral `--brand` on `--tag`). No zone gap found this session | Spot-checked: dashboard empty/failure states, detail-timeline next-obligation callout (`DetailShell.tsx:316-318`), `ListSurfaceShell.tsx` empty state (`:507`). Not exhaustively swept for every "state worth declaring" site the brief lists (map/watchlist/admin/account/settings) | Not checked exhaustively this session, no negative finding to report, also no full sweep | none found |
| 2.8 ListRow | `src/components/ui/ListRow.tsx` (+`ListRowColumnHeader`) | Matches the brief's grid (`GRID = "3px 56px 1fr 88px 84px 76px 40px 44px"`, `ListRow.tsx:117`), 56px min-height default (`:471`), hover `--row-hover`/`#FAFAF8` (`:383`), 1px `--line-2` divider. The overflow `⋯` control is the correct bare-glyph, borderless 44x44 button (`src/components/regulations/PriorityDropdown.tsx:243-262`), matching the prior report's "CLOSED" claim [CONFIRMED by this session's own read, not re-derived] | Regulations, Market, Research, Operations (via `ListSurfaceShell`), Watchlist, Dashboard (Due next/What changed), Map (register variant) | None found this session for the row anatomy itself | none found |
| 2.9 Absence | `src/components/ui/Absence.tsx` (+`isImpactScored`/`pickAbsenceReason` in `ImpactMeter.tsx`/`Absence.tsx`) | Matches the brief closely: dashed baseline + em dash for the meter, one small-caps reason from the closed vocabulary in the title cell's meta line (never a second row/column), no literal "UNSCORED"/"PENDING" as source text (rendered uppercase is CSS `text-transform`, not literal caps in the DOM string) | Every `ListRow`-mounting route (see 2.8) | None found this session | none found |
| 2.10 Chips | `src/components/ui/Chips.tsx` (`BandChip`, `TierChip`, `TagChip`, `WorkspaceTagPill`, `FilterChip`/`FilterChipGroup`) | Matches the brief's four families closely: `TagChip variant="row"` is 9.5px/700/.06em/radius 3/padding `2px 6px`/no border (`Chips.tsx:124-148`, matching brief 2.10 exactly, including the brief's own "2px 6px" over the artboard's "1px 6px"); `TierChip` is the one bordered square (`:72-98`); `BandChip` is the tinted dotted pill (`:25-47`); `WorkspaceTagPill` is the square-dot removable tag (`:159-213`). Filter groups keep the group-shell border per 2.10's last line (`FilterChipGroup`, `:255-278`, mobile CSS `:224-250`) | Spot-checked: list rows (`ListRow.tsx` `kind` slot), detail chip rows (`DetailHeader.tsx` via `extraChips`), facet rails | none found this session | none found |
| 2.11 SectionCard | `src/components/ui/SectionCard.tsx` | Matches the brief exactly: `background:#fff`/`var(--card)`, `border:1px solid rgba(0,0,0,.12)`, `border-radius:10px`/`var(--radius-card)`, the two-shadow stack, the 3px gradient rule mounted unconditionally in both its layouts (`SectionCard.tsx:112-164`). Corroborated by `AUDIT-2026-09-07.md`'s own generated CLASS-CLOSURE row, cited not re-run: 2557/2557 MATCH, 0 MISMATCH sitewide as of that file's last run. `suppressRuleForBandGrouping` is the one documented exemption (band-grouping cards, per ruling 5.2) | Universal, every `SectionCard` caller | Two literal hand-built card shells found bypassing it (see literal-styles column) | `src/app/admin/factors/page.tsx:117-254` (border+radius 8 container, `1px dashed` error/empty boxes, `borderRadius:999`/`padding:"1px 7px"` tier and licence pills, a hand-built table card + status pills, no `SectionCard`, no `Chips`); `src/app/community/[slug]/page.tsx:157-176` (`border:"1px solid var(--color-border)"`, `borderRadius:6`, `padding:"16px 20px"` group-description box, not `SectionCard`); `src/app/auth/reset-password/page.tsx:63-75` and `update-password/page.tsx` equivalent use the CORRECT tokens (`var(--radius-card)`, `var(--line-1)`) but still hand-build the box, EXEMPTED at the site by an existing `fitness-allow: F42` comment (`reset-password/page.tsx:57-61`, ruling R1, "not a section card") |
| 2.12 RailCard | Three un-merged implementations: `src/components/list-surface/ListSurfaceRailCards.tsx:43` (`RailCard`, the one closest to spec, header 10.5px/700/.12em per its callers), `src/components/detail/DetailShell.tsx:854` (`ImpactRailCard`), `src/components/home/DashboardRailCard.tsx:19-42` (own header: `fontSize:10`, `fontWeight:800`, `letterSpacing:"0.13em"`, three different literal numbers from the brief's "10.5px uppercase .12em/700") | Facet-row treatment (24px rows, 14px checkbox, tabular count) lives only in `FiltersRailCard` (`ListSurfaceRailCards.tsx:254`), not in the base `RailCard`, so a caller composing a rail with facets is on its own for that zone | `ListSurfaceRailCards.RailCard`: Regulations, Market, Research, Operations (rail slots inside `ListSurfaceShell`), Watchlist (`WatchlistSurface.tsx:462`), Map (`MapPageView.tsx:448`), 6 routes converged on the correct shared part | The 4 detail routes (via `DetailRail`/`ImpactRailCard`, `DetailShell.tsx:766-885`) and Dashboard (`DashboardRailCard.tsx`) each render their own rail-card header, not `ListSurfaceRailCards.RailCard` | none found in page.tsx (all three implementations live in components, not pages) |
| 2.13 StatBlock | `src/components/ui/StatBlock.tsx` | Matches the brief's minimum (label / Anton numeral / note, never a band tile, `tone="critical"` paints the numeral in the immediate-band colour, not a tile). Two additive variants not in the brief's one-line description (`layout="row"`, `size="tile"`), additive, not contradicting | Profile, admin counters (`AdminDashboard.tsx`, `src/app/admin/factors` does NOT use it, see literal styles) | `admin/factors/page.tsx` renders its own pill/table chrome rather than `StatBlock`/`Chips` for its status pills (same file as the 2.11 finding) | see 2.11's `admin/factors/page.tsx` citation (tier/licence pills, not a StatBlock concern directly but the same page bypasses the shared parts wholesale) |
| 2.14 NavCard | `src/components/Sidebar.tsx` | Matches the brief closely: 252px fixed width (`Sidebar.tsx:398`), margin `"20px 0 16px 16px"` verbatim (`:415`), `BandGradientRule` (four-band 3px cap, `:422`,`:481`), two-row footer, Account row then a role-gated Admin row carrying a bordered role badge (`:256-370`; the badge shows the caller's REAL role, not a hardcoded "OWNER" literal, `:349-365`, a deliberate documented deviation from the brief's literal wording), one 1px section rule between every section including between "Intelligence" (ends with Map) and "Network" (Community) (`:203-214`) | Desktop card + mobile drawer, all routes with `AppShell`/`Sidebar` mounted | None found this session | none found |
| 2.15 Page scope | N/A, a removal list, not a component | n/a | n/a | `/market` (`src/app/market/page.tsx`): all four named removals STILL PRESENT, `<CarbonCostOverlay>` `:204`, `<MarketSeriesBoard>` `:219` (no `/market/series` route exists, `find src/app/market` shows only `market/` and `market/[slug]/`), "Policy timeline" section `:232`, `<NoticesRail>` (Recalculation notices) `:245`. `/community`: "Global room region" still present, `CommunityRooms.tsx:1747` lists "Global, EU, US, UK, Asia-Pacific, Latin America, and Middle East & Africa" as region options | n/a, DONE items, confirmed by direct read: `/regulations` Upcoming-obligations strip removed + register moved to `/regulations/register` (`regulations/page.tsx:10,13`, comment states "REMOVED"/"MOVED"); `/operations` DQI/aux/grid moved to the profile page (`operations/page.tsx:16`, "MOVED onto the Operations PROFILE page"); disclaimer bar removed from the frame, kept only on auth/onboarding's left panel (`AppShell.tsx:174-179`, explicit ruling comment, 2026-09-08) |
| 2.16 Impact meter, row variant | `src/components/ui/ImpactMeter.tsx` (`variant="row"`, default) | Wrong model entirely, not a styling gap: the current row variant draws the FOUR SCORED DIMENSIONS sorted ascending, each bar's own height (6/12/18px for score 1/2/3) and own colour (1=green/2=orange/3=red per dimension, `VALUE_COLOR`, `ImpactMeter.tsx:43-47`,`:234-248`). The brief wants a STEPPED FILL OF THE TOTAL N/12, 4 bars at fixed heights 6/9/12/15px, gap 2, radius 1.5, unfilled track `#E5E1DB`, ALL filled bars in ONE colour read off a severity ramp at N (not per-dimension), so two rows with the same sum N render byte-identical markup. Today two rows with the same sum but different per-dimension composition render DIFFERENT bar patterns (e.g. sum=6 as [3,3,0,0] vs [1,1,2,2] draws different heights/colours per position), the brief's own acceptance test ("group rows by N, every row renders byte-identical markup") fails by construction. Bar width today is 9px desktop/8px mobile (brief: 8px always). Corner radius today is `1px 1px 0 0` (top corners only); brief wants 1.5 all corners. Unscored variant already matches (dashed 1px rgba(0,0,0,.3) outline + em dash, no word) | Regulations, Market, Research, Operations, Watchlist, Dashboard (Due next + What changed), detail rail `variant="full"` (different model, per-dimension bar, matches brief's stated "full variant lives only in the detail rail" carve-out), every one of these renders the WRONG (dimension-sorted) row model | n/a, this is the deciding component itself; every list route reaches it via `ListRow.tsx:652` (row) or `DetailShell.tsx:861` (full) | See "LOW → HIGH" header finding below, the two places it survives are components, not page.tsx |

## The "Impact low → high" header text (2.16, requested explicitly)

Deciding line: `src/components/ui/ListRow.tsx:252-258` (function `ListRowColumnHeader`, `:130`). The header
renders `Impact&nbsp;` then a nested lower-weight span reading `low → high`, literal text, not a CSS
pseudo-element, so it is real DOM text a placeholder-literal or copy scan would catch. Brief 2.16 requires
the column to read "Impact" only.

Per-route mount check for `ListRowColumnHeader` (the only place this text can render) vs `ImpactMeter`
(mounted inside every `ListRow`, `ListRow.tsx:652`):

| List route | Mounts `ImpactMeter` via | Mounts `ListRowColumnHeader` (renders "low → high") | File:line |
|---|---|---|---|
| Regulations | `ListSurfaceShell.tsx:520,526,556,562` → `ListRow` | NO, `ListSurfaceShell.tsx` never calls `ListRowColumnHeader`; band-grouped view renders `BandSectionHeader` instead (`:318-360`,`:541`) | n/a |
| Market | same `ListSurfaceShell` path | NO, same reason | n/a |
| Research | same `ListSurfaceShell` path | NO, same reason | n/a |
| Operations | same `ListSurfaceShell` path | NO, same reason | n/a |
| Watchlist | `WatchlistSurface.tsx:326` → `ListRow` | YES | `WatchlistSurface.tsx:311` |
| Dashboard "Due next" | `DashboardBrief.tsx:203` → `ListRow` | YES | `DashboardBrief.tsx:201` |
| Dashboard "What changed" | `DashboardBrief.tsx:293` → `ListRow` | YES | `DashboardBrief.tsx:273` |

So "Impact low → high" is live on 3 of the 7 list surfaces (Watchlist, Dashboard's two cards); the other
four never render a column header for this cell at all (a separate, unrelated gap: no "Impact" label there
either, band-grouped or not, not something the brief's 2.16 asks for explicitly, noted for completeness).

**The legend at 8/12** (brief: "The legend row on every list uses this exact meter at 8/12"): `LegendRailCard`
(`src/components/list-surface/ListSurfaceRailCards.tsx:616-639`) does NOT mount `ImpactMeter` at all, it is
a `<dl>` of PROSE describing the OLD model verbatim ("Four scored dimensions, sorted low to high: green
left, red right. Height is the sum, score 1-3.", `:622-624`). No legend anywhere mounts a live meter
instance, at 8/12 or any other value. `LegendRailCard` is reached from every route that mounts
`ListSurfaceRailCards`' rail slot (see 2.12's route list).

## Literal part styles in page.tsx (the F49 seed, brief rule 1.2)

Full sweep of every `src/app/**/page.tsx` (33 files, 5273 lines total) for `Anton`, `borderRadius`,
`border:`, `padding:`, hex colours from the brief's own palette, and `borderLeft`. Findings:

- **No literal "Anton" font usage found in any page.tsx**, every match is a code comment, not a style
  declaration (`market/page.tsx:6`, `regulations/[slug]/page.tsx:12`). Titles are rendered through
  `Masthead`/`EditorialMasthead`/`DetailSection`, never typed by hand in a route file.
- **No literal `border-radius: 10` / `radius: 10` and no `linear-gradient` 3px-rule strings found in any
  page.tsx.** The card-shell violations that exist (below) use radius 6, 8 or `var(--radius-card)`, not a
  hand-typed `10`.
- `src/app/admin/factors/page.tsx:117-254`, a full hand-built card shell (`border`+`borderRadius:8`+
  `padding`), a hand-built header row, and TWO hand-built pill/chip instances (`borderRadius:999`,
  `padding:"1px 7px"`, bordered) standing in for `SectionCard`+`Chips`/`TierChip`. This route is not one of
  the brief's named 20 (`/admin/factors` is a WO-18 read-only debug sub-route of `/admin`); flagged because
  it is real, reachable product surface.
- `src/app/community/[slug]/page.tsx:157-176`, a hand-built card (`border:1px solid var(--color-border)`,
  `borderRadius:6`, `padding:"16px 20px"`) for the group-description box, not `SectionCard`.
- `src/app/auth/reset-password/page.tsx:63-75` and `src/app/auth/update-password/page.tsx` (equivalent
  block), hand-build a card using the CORRECT tokens (`var(--radius-card)`, `var(--line-1)`) rather than
  importing `SectionCard`. Already carries an explicit `fitness-allow: F44/F42` comment citing ruling R1
  ("auth confirmation note, not a section card") at `reset-password/page.tsx:57-61`, an accepted, logged
  exception, not an unflagged violation.
- Every other `style={{...}}` block found in page.tsx (`community/benchmarks`, `community/browse`,
  `community/directory`, `community/discover`, `community/moderation`, `community/profile`, `login`,
  `map`, `market`, `market/[slug]`, `operations/[slug]`, `page.tsx` root, `privacy`, `regulations/[slug]`,
  `research`, `research/[slug]`, `signup`) is layout-only (page padding, max-width wrappers, flex gap), no
  card border/radius/chip/rule literal found among them this session.

Net: the F44/F49 seed at the page.tsx layer is SMALL, two real card-shell violations
(`admin/factors`, `community/[slug]`) plus one already-exempted auth pair, not the widespread "literal
Anton/radius/chip" problem the brief's rule 1.2 prose implies. The larger defects (2.1, 2.2, 2.3, 2.4, 2.5,
2.6, 2.12, 2.16) live one level down, in the shared-looking `src/components/**` layer (detail surfaces,
`ListRow`, `ImpactMeter`, rail cards, mastheads), components that already exist and already have call
sites everywhere, but are themselves not yet built to the brief's spec, or have un-merged siblings. F44's
literal text ("a route's page.tsx may not contain the literal styles that define a part") is close to
already true; the backlog is almost entirely at the component layer, not the page layer.

## Section 4: cases not drawn (brief rule 1.3)

1. **Artboard 21 does not exist in the repo.** FactCard v2's exact geometry (2.1), the merged ActionCard's
   exact geometry (2.6), and the "long-title masthead" treatment (2.4) are all specified only in the
   brief's prose. Rule 1.3 says the artboard wins where it disagrees with the README and to ask rather than
   invent when a case isn't drawn, there is no artboard to check against at all for these three parts.
2. **SectionHeader's own ruling conflict (2.3).** Brief 2.3 asks for a `1px rgba(0,0,0,.08)` rule below the
   S-section title; `SectionHeading.tsx:27-30` cites a CLOSED 2026-09-07 ruling (4.1/5.1) that the same
   title carries NO rule below it, ever. One of the two is stale; the code currently follows the ruling, not
   today's brief text.
3. **CommandBar's Search|Ask toggle (2.5) was itself a dated, named operator ruling** (CMDSEARCH lane,
   2026-09-09, "we need a simple search function... as well as an AI agent... a toggle between standard
   search and AI question in that bar", `CommandBar.tsx:28-33`). Today's brief reverses it without
   mentioning it. Removing the toggle also removes the bounded-workspace-search feature (`GET /api/search`)
   the toggle exists to reach; the brief's "typing searches; Ask sends the same text" line does not say
   whether that search capability moves somewhere else or is dropped.
4. **Whether Masthead (2.4) / CommandBar (2.5) apply to `/login`, `/signup`, `/onboarding` at all.** These
   three routes mount neither `Masthead` nor `EditorialMasthead`, the auth/onboarding frame
   (`AuthFrame.tsx`) has always been a separate, artboard-16/17-governed treatment (SHARED-PART-REPORT-2026-09-08.md's
   own Table 1 marks items "N/A, artboard draws no nav" for these routes). The brief's "Every page" (2.4)
   and "One control on every page" (2.5) do not say whether auth/onboarding are inside or outside that
   "every."
5. **Dashboard "What changed" is named by the brief as a FactCard (2.1) consumer** but is built, and has
   apparently always been built, on `ListRow` (list-row anatomy: band spine, impact meter, due date, not a
   fact card's kind band/figure-lead/provenance column). Unclear whether the brief means to convert this
   card to fact-card anatomy or was describing the wrong card.
6. **The Legend rail card (2.16)'s "exact meter at 8/12"** has no current implementation to extend, it is
   pure prose today (`ListSurfaceRailCards.tsx:616-639`) describing the OLD per-dimension model, not a
   mounted `<ImpactMeter/>` at all. Whether the legend should show one meter instance frozen at N=8 or a
   small worked diagram of the ramp/geometry is not stated.
7. **`/market/series`, named by the brief (2.15) as the destination for the Series board, does not exist**
   (`src/app/market` has only `market/` and `market/[slug]/`). Whether this is a new route to build or the
   brief means an existing anchor/section id is not stated; today `<MarketSeriesBoard>` renders inline on
   `/market` with an in-page anchor target (`market/page.tsx:217`), not a route.
8. **Admin sub-route `/admin/factors`** (and its literal card/pill styling, F49 seed above) is not named by
   the brief's route list at all. Whether the parts program covers admin sub-routes beyond the top-level
   `/admin` artboard is undecided.

## Counts

16 parts total in the brief's section 2 (2.1-2.15 plus 2.16, added mid-session). By rough verdict against
"renders from one file everywhere it appears, zero equivalents built around it" (not a formal COMPLETE/
PARTIAL/NOT BUILT/BUILT-DORMANT audit table, this stage's brief specifies its own six columns, not the
common audit's six criteria):

- Close to the brief's spec, one shared file, no bypasses found this session: 2.7 StateNote, 2.8 ListRow,
  2.9 Absence, 2.10 Chips, 2.11 SectionCard (also the only one independently corroborated by a generated,
  re-runnable audit, `AUDIT-2026-09-07.md`'s 2557/2557 MATCH), 2.14 NavCard. **6 of 16.**
- One shared file but real coverage gaps (some routes still on an older/divergent implementation): 2.4
  Masthead (7 community sub-routes), 2.12 RailCard (3 separate implementations, converged on 6 of 11
  routes checked). **2 of 16.**
- Built, reachable, but structurally wrong or actively contradicted by the current brief: 2.1 FactCard
  (missing kind-band/figure-lead/provenance-column zones), 2.3 SectionHeader (two un-merged
  implementations plus a ruling conflict), 2.5 CommandBar (toggle the brief says to remove), 2.16 Impact
  meter row variant (wrong model, not a styling gap). **4 of 16.**
- Not built at all: 2.2 ItemGroup, 2.6 ActionCard. **2 of 16.**
- Not a component, a removal checklist: 2.15 Page scope, 3 of 6 named removals done (regulations,
  operations, disclaimer bar), 3 not done (market's four blocks, community's Global room region, plus the
  missing `/market/series` destination). **1 of 16, PARTIAL.**
- 2.13 StatBlock matches its own brief line but the one page that most needed it (`admin/factors`) doesn't
  use it. **1 of 16, mostly complete with one non-consuming route.**

Rows added beyond the brief's 15 (now 16 with 2.16): the "Impact low → high" header sub-table and the
literal-styles sweep are additional detail within the 16 rows, not new rows; the 8 community/auth/admin
sub-routes surfaced during the Masthead and literal-style checks are additional ROUTES noted inside
existing rows, not new parts.
