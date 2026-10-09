# MKT-1 (lane id mkt1-market-components): Market Intel renders what it already computes, 2026-10-08

Branch `lane/mkt1-market-components`, cut from origin/master 6028b228. Brief and common terms: the lane's own
briefs of 2026-10-04 (source-loop wave). Register rows worked: VERIFY-1 `02S6` r1, r9, r10, r11.

## Accomplished (each fact confirmed by a run named beside it)

- r1, comparative ribbon: CLOSED. `MarketComparativeRibbon.tsx` now renders level, 1w, 1m, YoY, a sparkline and the as-of date
  on every headline card, plus the series' freshness state. Before: level, 1w and as-of only (the 1m, YoY and sparkline were
  computed by `series-deltas.mjs` and attached by `series-board-view-model.mjs` and drawn by nothing).
- r10, methodology and provenance disclosure: CLOSED for `/market` and `/market/series`. `/market` mounts one disclosure under the
  ribbon, one block per series on the row, each block the series board's own fields grid. `/market/[slug]` closed in the follow-up commit.
- r11, freshness panel: CLOSED for `/market` and `/market/series`. `/market` mounts the board's panel summary under the ribbon and a
  freshness badge on each card. `/market/[slug]` closed in the follow-up commit.
- r9, policy timeline filtered to Market: CLOSED in the follow-up commit (coordinator grant of 2026-10-08), see "Follow-up commit".

Before/after per row:

| Row | Before | After |
|---|---|---|
| r1 | card: level, `▼1.7% 1w`, as-of. A missing 1w change drew a dash then the word "pending" | card: level, 1w, 1m, YoY, sparkline (aria-labelled with its span and count), as-of, freshness badge. A missing change names its spec 00 section 4 state |
| r10 | `<details>` per series on `/market/series` only | same part on `/market/series` (markup moved, unchanged) and one disclosure on `/market` |
| r11 | panel summary and badge on `/market/series` only | same parts on `/market/series` (moved, unchanged) and on `/market` |

Files changed: `src/components/market/MarketComparativeRibbon.tsx`, `MarketSeriesBoard.tsx`, `src/app/market/page.tsx`; created
`src/components/market/SeriesFreshness.tsx`, `SeriesProvenance.tsx`, `MarketComparativeRibbon.render.npmtest.mjs`; edited the
existing `MarketComparativeRibbon.npmtest.mjs` (one regex, for the new `nowIso` prop on the mount).

## Read and reused

- Read in full: CLAUDE.md, lane-common-contract.md, spec 02 (all), spec 00 sections 2 to 4, ux-laws.md, design-principles.md,
  the VERIFY-1 register, then every file in the write set and the consumers found by grep.
- Reused, not rebuilt: `buildSeriesBoard` and `computeSeriesDeltas` (the deltas and sparkline), `selectHeadlineSeries` (which series
  appear), `deriveSeriesFreshness` and `summarizeBoardFreshness` (freshness arithmetic over `stalenessOf`), `producerFor` (registry
  cadence), `formatDelta` (percent formatting, "quantity" kind), `OBS_STATUS` and `isMissing` (the six-state codes), `Absence.tsx`
  `ABSENCE_TEXT_STYLE` (absence type treatment), `SectionCard`, and the series board's own drawer and panel JSX, which was moved
  into `SeriesProvenance.tsx` and `SeriesFreshness.tsx` rather than retyped. The test follows the `ImpactMeter.npmtest.mjs` pattern
  (esbuild compile of the real .tsx, `renderToStaticMarkup`).
- Searched and found nothing to reuse: a "N hidden by your scope" component or text (git grep over src, scripts, docs/specs), and a
  mode-and-geography scope reader on the series board (see below).

## Decisions

- A missing change maps to spec 00 section 4 as: no data yet (series covered, window has too little history; the text names the days
  of history needed), suppressed (the unit or currency changed across the compared pair; reason class stated), not applicable (the
  prior value was zero so a percent is undefined), not covered (the row carries no comparison; reachable only by calling
  `deltaCellModel` directly, because headline rule 4 keeps an un-compared series off this row). Each carries its SDMX code on
  `data-obs-status` and its reason in the accessible name and on hover. No dash, no "pending".
- No predicted "expected refresh" date is drawn for no data yet. `series-freshness.mjs` records the standing decision that a date
  promised by a scheduler that does not exist is the defect spec 02 section 9 names; the card states the history the window needs,
  and the last known value and as-of date are already on the card.
- The disclosure on `/market` is ONE block under the track (one click from any number), not one per card: a 150 px card cannot open
  a fields grid. Each block is headed by its series and draws `SeriesProvenanceFields`, the same grid the series board draws.
- The sparkline samples a series to at most 60 points (first and last kept) and states its span and observation count in its
  accessible name.
- Two pre-existing defects in the components this lane edits were fixed in the same motion (rule 13), each measured in chromium
  before the change (the same measurement run on origin/master code): the headline caption ran to 409 px on a 375 px screen and was
  clipped by the card (removed `white-space: nowrap`), and two links were below the law 2 target floor ("Series board" 104 by 13 px,
  the provenance source link 86 by 12 px; both now at least 24 px tall). The second changes the series board's drawer link by 12 px
  of height, the one place `/market/series` is not byte-for-byte what it was.

## Red then green

- New file `MarketComparativeRibbon.render.npmtest.mjs`, 16 tests. Run against origin/master's ribbon, board and page (the three
  modified files stashed, the new component files present): 16 tests, 3 pass, 13 fail (every behavior test red, including the
  "retired word pending" test, which caught the old output). Run against the new code: 16 of 16 pass.
- Existing market tests, run with `node --test`: `market-series-deltas`, `market-series-board-view-model`, `market-series-freshness`,
  `market-headline-series-select`, `market-series-registry`, `LeadTimeChart.test`, `MarketComparativeRibbon.npmtest`, `Absence.npmtest`,
  `SectionRule.coverage.npmtest`: 103 of 103 pass. `npx tsc --noEmit` and `npx eslint` on the five touched source files: clean.
- Series board unchanged by the extraction: real `MarketSeriesBoard` from origin/master and from this branch rendered over the same
  board (WatchButton stubbed): identical HTML after removing the `data-audit` and `data-freshness` attributes the shared parts add.
  That comparison ran before the link-padding edit above.

## Measured at 375 px and 1280 px (real chromium, the repo's own detectors, scratch script under gitignored scripts/tmp)

- 375 px: cards 150 px wide, 172.8 px tall (were 90.8 px); no document overflow; `measureGuard` clean; the track scrolls inside its
  own box (scrollWidth 662, clientWidth 341). 1280 px: cards 234.8 px wide, 149.8 px tall (were 74 px); `measureGuard` clean.
- `measureUx` at 375 px: law 2 clean after the two link fixes; the remaining "clipped past the viewport" lines name the cards inside the
  intentionally scrolling track, the same class origin/master code reports (16 elements before, 29 after because the cards hold more
  elements). The standing `narrow-overflow-live-fixes` smoke, which mounts the real ribbon at 375 px: 16 checks, 0 failures.
- The ribbon is not in F35's `ROW_COMPONENTS` and has no UX smoke spec of its own; see "NEEDS WRITE-SET EXPANSION".

### UX compliance

- Block: Market `/market` headline ribbon (cards, freshness panel, methodology disclosure). Primary goal: the 15-second "has anything
  moved that changes my week" read. Path: zero steps to read level, 1w, 1m, YoY, trend and freshness; one click on "Methodology &
  provenance for these series" to see how any number was made. The one primary element is each card's level with its 1w change;
  the disclosure is deliberately quieter and closed by default. Feedback states: no asynchronous action (server rendered, native
  `<details>`, no client fetch); a missing value shows its state in words, not a blank. Targets: the two links now measure at least
  24 px tall; the `<summary>` is 25 px tall and full width. Measured as above; the rendering guard's UX smoke slot has no spec for
  this component (not in the write set), so the measurement came from the repo's detectors run directly.
- Block: `/market` policy timeline (scoped). Primary goal: see the dated obligations that apply to the modes and regions in scope.
  Path: zero steps to read; one click on "N hidden by your scope, Show all" to see everything, one click on "Back to your scope" to
  return. The one primary action is the widen control, drawn as a quiet bordered button; it is absent when nothing is hidden. Feedback:
  the strip shows "Loading upcoming obligations" while the scoped or widened read is in flight, and the control and scope line
  swap on the response; a failed read falls back to the strip's existing empty state. Targets: 32 px tall with 8 px gaps (law 2), measured
  by the market-ribbon smoke at 375, 768, 1024 and 1280 with a real click proving widen and narrow.
- Block: `/market/[slug]` price board and carbon figure drawers. Goal: forward a screenshot with its method attached. Path: one click on
  "Methodology & provenance" under the figure; closed by default; a freshness badge appears under the price board after mount for the
  ratified series items. No asynchronous action (server data, native details). Not in a ux smoke spec (the detail surfaces mount
  through `detail-surfaces-smoke`, which still passes in the local guard run).
- Block: `/market/series` (series board). No visible change except the provenance source link, now a 24 px target.

## DESIGN CHANGES OWED (rule 20, for Claude Design, cited by artboard)

- Artboard 04, `id="p4"` HEADLINE SERIES card (coordinator ruling 4, 2026-10-08): the system needs a sparkline, a 1m change, a YoY change,
  a freshness state per card, a freshness panel strip and a methodology disclosure under the track (spec 02 rows 1, 10, 11). p4 draws
  none of them (it measured zero svg and an 86.84 px card). The build follows the spec; the artboard needs the new card drawn. State
  wording to draw: "1m, no data yet", "YoY, suppressed", "1w, not applicable".
- Artboard 04, the policy timeline region under the ledger (row 9): the system needs a scope line ("Scope: Ocean, EU"), an "N hidden by
  your scope, Show all" control and a "Back to your scope" control. No artboard draws them.
- Artboard 05, `/market/[slug]` (signal detail): the system needs a methodology and provenance drawer under the price board and under the
  carbon figure, and a freshness badge under the price board when the item is one of the ratified series items. Artboard 05 draws neither.
- The two p4-derived audit rows that forbade the sparkline and the 1m or YoY row are REPLACED in
  `fsi-app/.discipline/rendering/audit/spec/compose-04-market-list.json` by rows that require them (1m form, a YoY slot on every card,
  a sparkline polyline on every card, a freshness badge on every card). Measured on the audit mount: all four MATCH (1m 11px, 700, ink,
  nowrap; 5 YoY slots; 5 sparkline polylines, fill none, stroke 1.25px; 5 freshness badges).

## Follow-up commit, coordinator rulings of 2026-10-08

1. r9, policy timeline (GRANTED): CLOSED. Active scope is the ledger's URL facets `mode` and `region` when present, else the workspace
   profile's transport modes and jurisdictions, decided per dimension (`resolveScope`, `read-upcoming.mjs`).
   - `readUpcoming` (new, the one read) returns `{ events, hiddenByScope }`; `fetchUpcomingObligations` is its unchanged array form, so
     every pre-existing caller is untouched. `hiddenByScope` counts what the mode and jurisdiction filters removed from the SAME fetched
     upcoming window, against that window with no scope at all. An item with no modes is mode-agnostic and is kept (the same rule
     `workspace/relevance.mjs` uses). The item join now also selects `transport_modes`.
   - `GET /api/obligations/upcoming`: `?scope=1` (with optional `modes` and `regions`, comma separated) is the scoped list read and adds
     `scope` and `hiddenByScope` to the response; `?scope=all` is the widen control (no mode and no jurisdiction filter); no `scope` is
     the old read, byte for byte.
   - `UpcomingObligationsStrip` takes an optional `scope` prop and filters when given; `UpcomingObligationsStripView` takes an optional
     `scopeInfo` and draws the filter as text ("Scope: Ocean, EU"), "N hidden by your scope, Show all" and, once widened, "Back to your
     scope". The Regulations mounts pass no scope and render exactly as before (asserted: an unscoped render contains no scope markup).
   - New `MarketPolicyTimeline.tsx` reads the facets with the ledger's own `filterFromSearchParams` and mounts the strip; `/market` mounts
     it inside Suspense in place of the bare strip, and the heading copy no longer says "not yet filtered".
2. /market/[slug] (GRANTED): the drawer describes the envelope of the figure actually shown, with one component. `SeriesProvenance.tsx`
   props are now a figure envelope (`ProvenanceDrawer`, `ProvenanceFields`, `FigureEnvelope`); `envelopeFromSeriesRow` adapts a series row
   (board and ribbon, output unchanged), `envelopeFromFactorRow` an emission factor with its licence-gate entry, `envelopeFromPriceStat` a
   published statistic. On the detail page: the carbon figure's drawer is built from the factor row it used (the page now selects
   `derivation, origin_class, method_version, n_observations, as_at_date` from `emission_factors` and reads `licence_clear_sources` for
   licence and attribution); the price board's drawer is built from the market_series row behind it, found through `SERIES_ITEM_MAP_RAW`
   (the same map the refresh producer writes the board from), with a freshness badge judged after mount against the viewer's clock (the
   route is statically built, so a build-time "now" would freeze the label).
   - CORRECTION to the ruling's premise, [CONFIRMED by reading migration 151 and 258]: `emission_factors` carries the envelope columns,
     `published_price_statistics` does NOT (its columns are label, value_display, unit, context_line, severity_tone, source_tier,
     released_at, next_release_at, next_release_label, sort_order). So the price board's envelope comes from the series behind it when the
     item is one of the six ratified series items, and otherwise shows only the source rating and release date the table carries; no
     field is invented. No migration was written.
3. Ribbon UX smoke spec (GRANTED): `fsi-app/.discipline/rendering/smoke/market-ribbon-smoke.mjs` (ribbon, in a full and a thin state,
   plus the scoped timeline view with a real click that widens and narrows), registered in `ux-smoke-specs.mjs` as `market-ribbon`;
   F35 `ROW_COMPONENTS` lists `MarketComparativeRibbon.tsx` (checked by calling the F35 `check` over every enumerated file: no violations).
   The ribbon track now declares `data-guard-strip` and the card label carries `data-guard-title`. Run through `runUxSpec`: 23 checks,
   0 failures (law 2 targets, overflow, titles, clipped text at 375, 768, 1024, 1280, plus the 1440 bounds sweep and the bespoke checks).
   Two law-2 target defects it found in my own earlier work were fixed (the "Series board" link and the provenance link measured 23 px
   tall at 6 px padding; now 25 px).
4. Audit rows (GRANTED): rewritten as above. results.json and the audit document were NOT regenerated, see open items.
5. Sparkline window: one year back from the series' own latest date (`SPARKLINE_WINDOW_DAYS`, equal to the YoY window), sampled to 60
   points, stated in the accessible name ("Trend over the last year, 53 observations, 2025-09-08 to 2026-09-07").
6. Request coverage: left as is (COV-1 builds the control); the not-covered state text is unchanged.

## Read and reused (follow-up)

- Read in full: `read-upcoming.mjs` and its test, the route, the strip and its view, `list-surface-helpers.ts` (facet parameters),
  `useListSurfaceFilter.ts`, `workspace/relevance.mjs` (mode-agnostic rule), `workspace/profile.ts`, `[slug]/page.tsx`,
  `MarketSignalDetailSurface.tsx`, migrations 151, 258 and 268 (columns, grants), `series-item-map.mjs`, F35, the smoke registry and
  `ux-harness.mjs`, and the audit harness README and spec file.
- Reused: `jurisdictionMatches` and `defaultJurisdictionFilter` (region matching and the profile default), `filterFromSearchParams` (the
  facet contract), `getWorkspaceProfile` (profile modes and jurisdictions), `buildSeriesBoard` (the series behind a price board),
  `deriveSeriesFreshness` (freshness), the licence gate view `licence_clear_sources`, `runUxSpec` and `fullAppCss`.

## Red then green (follow-up)

- Run against the pre-change code (every tracked source file, the smoke registration and the F35 line stashed; the new test files and the
  new smoke spec left in place): `read-upcoming-scope.test.mjs` cannot import the old module's new exports (fails at load); of the 26
  tests reported across the three new test files, 9 fail (the 17 that pass assert behaviour that must not change, such as the unscoped
  render carrying no scope markup); the `market-ribbon` smoke spec crashes waiting for `[data-audit="policy-scope-widen"]`, a control the
  old view does not have. Run against the new code: 77 of 77 pass across the five touched or new test files (`read-upcoming.test`,
  `read-upcoming-scope.test`, `UpcomingObligationsStripScope.npmtest`, `MarketComparativeRibbon.render.npmtest`,
  `MarketComparativeRibbon.npmtest`); 225 of 227 pass in the 14 other test files that mention the touched components (2 skipped, 0 fail);
  `tsc --noEmit` and eslint clean.
- The `market-ribbon` smoke spec through `runUxSpec`: 23 checks, 0 failures. The whole rendering guard run locally with this branch
  (`node .discipline/rendering/run-rendering-guard.mjs`): exit 0, 30 UX smoke specs including `market-ribbon`, 727 UX checks.

## Audit harness: results.json and the audit document NOT regenerated (coordinator ruling 2026-10-08, closed)

- [CONFIRMED by running `npm run audit:design` on this branch and reading the harness errors and `mounts.mjs`]: the design-audit harness is
  stale against the DetailShell refactor. Eleven specs fail to build: actionrow, detailheader, detailsection, detailtagrow,
  detailtimeline, inthisliststat, railcards, sectionindex, settings-section-index, summarydepthswitch, tagpopover. Their mounts in
  `fsi-app/.discipline/rendering/audit/mounts.mjs` (the import block around lines 1920 to 1931, and the `SectionIndex` import near line
  1883) import three names from `@/components/detail/DetailShell` that it no longer exports: `DetailHeader`, `DetailTimeline` and
  `SectionIndex` (`DetailShell.tsx` exports `DetailMasthead`, `SummaryDepthSwitch`, `DetailSection`, `DetailPageWrapper`, `DetailLayout`,
  `DetailRail` and others; `SectionIndex` now lives in `src/components/ui/SectionIndex.tsx`; no `DetailHeader` or `DetailTimeline`
  export exists in `src/components/detail`).
- Effect: those specs produce no rows, so a full regeneration (2336 checks, 2206 MATCH, 70 MISMATCH, 60 NOT BUILT) deletes 6179 lines of
  `results.json` and rewrites 787 lines of `AUDIT-2026-09-07.md`. Ruling: the regenerated pair is not committed; the broken mounts are a
  separate defect and get their own lane, which fixes the mounts and regenerates once. This lane ran the generator, inspected the output
  and reverted it; the spec rows it changed (compose-04-market-list.json) are committed and will be picked up by that regeneration.

## Other open items

- `getPublicMarketIntelItems`-style caching: the detail route's item bundle is cached; the new `market_series` and `licence_clear_sources`
  reads sit inside it (authenticated-only tables, read by the same client as the existing `emission_factors` read). I did not verify the
  live grants from this lane (no live access); the code fails soft to an empty envelope on a read error, so the drawer shows less, never
  a wrong field. [NOT-WORK: fact, no action]
- The scoped timeline's hidden count is bounded by the strip's fetched window (limit times five upcoming events), the same window the
  existing jurisdiction filter already worked on; it is "hidden in the next events read", not a corpus-wide count. [NOT-WORK: fact, no action]

## Not done

- Pages with no figure: none under `/market`. [NOT-WORK: fact, no action]
- The request-coverage control (COV-1). [CLOSED: PR 1020]
- No migration, no producer change, no live read or write. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
