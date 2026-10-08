# MKT-1 (lane id mkt1-market-components): Market Intel renders what it already computes, 2026-10-08

Branch `lane/mkt1-market-components`, cut from origin/master 6028b228. Brief and common terms: the lane's own
briefs of 2026-10-04 (source-loop wave). Register rows worked: VERIFY-1 `02S6` r1, r9, r10, r11.

## Accomplished (each fact confirmed by a run named beside it)

- r1, comparative ribbon: CLOSED. `MarketComparativeRibbon.tsx` now renders level, 1w, 1m, YoY, a sparkline and the as-of date
  on every headline card, plus the series' freshness state. Before: level, 1w and as-of only (the 1m, YoY and sparkline were
  computed by `series-deltas.mjs` and attached by `series-board-view-model.mjs` and drawn by nothing).
- r10, methodology and provenance disclosure: CLOSED for `/market` and `/market/series`. `/market` mounts one disclosure under the
  ribbon, one block per series on the row, each block the series board's own fields grid. NOT closed for `/market/[slug]`, see
  "Not done".
- r11, freshness panel: CLOSED for `/market` and `/market/series`. `/market` mounts the board's panel summary under the ribbon and a
  freshness badge on each card. NOT closed for `/market/[slug]`, see "Not done".
- r9, policy timeline filtered to Market: NOT DONE. Stopped before any edit, see "NEEDS WRITE-SET EXPANSION".

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
- Block: `/market/series` (series board). No visible change except the provenance source link, now a 24 px target.

## DESIGN CHANGES OWED (rule 20, for Claude Design, cited by artboard)

- Artboard 04, `id="p4"` HEADLINE SERIES card: the system now needs, per spec 02 rows 1, 10, 11, a 1m change, a YoY change, a sparkline,
  a freshness state per card, a freshness panel strip and a methodology disclosure under the track. p4 draws none of them (it
  measured zero svg and a 86.84 px card). The build follows the spec; the artboard needs the new card drawn. State wording to draw:
  "1m, no data yet", "YoY, suppressed", "1w, not applicable".
- The p4-derived rows in `fsi-app/.discipline/rendering/audit/spec/compose-04-market-list.json` ("no sparkline anywhere in the HEADLINE
  SERIES card", "no 1m or YoY delta row in the HEADLINE SERIES card") now contradict the spec. `audit:design` (not a CI job) will
  report them NOT IN SPEC until the coordinator updates them and regenerates `results.json`. Not in this lane's write set.

## NEEDS WRITE-SET EXPANSION (nothing below was touched)

1. r9, policy timeline filtered to Market. The brief says to reuse "the scope the series board uses; reuse its scope reader". That
   reader does not exist: the series board (`MarketSeriesBoard`, `buildSeriesBoard`, `selectHeadlineSeries`, series-registry) carries no
   mode or geography scope (git grep scope over `src/lib/market` and `src/components/market`). The only Market scope readers found:
   the ledger's URL facets `mode` and `region` (`useListSurfaceFilter`, `filterFromSearchParams`, `list-surface-helpers.ts`) and the
   workspace profile's `transportModes` and `jurisdictions` (`getWorkspaceProfile`). The timeline today is
   `UpcomingObligationsStrip` over `GET /api/obligations/upcoming`, which filters by the workspace's jurisdictions only
   (`defaultJurisdictionFilter`), selects `item_forward_events` joined to `id, title, legacy_id, jurisdiction_iso` (no mode column is
   selected), and returns no count of events it hid. Building r9 needs: `fsi-app/src/lib/forward-events/read-upcoming.mjs` and its test
   (a mode filter, and a `hiddenByScope` count from the same query), `fsi-app/src/app/api/obligations/upcoming/route.ts`,
   `fsi-app/src/components/regulations/UpcomingObligationsStrip.tsx` and `UpcomingObligationsStripView.tsx` (the visible scope text
   such as "Ocean, EU" and the "N hidden by your scope" widen control), plus a ruling on which scope is "active" (URL facets or
   workspace profile). Regulations mounts the same strip, so the change must keep its unscoped behavior.
2. r10 and r11 on `/market/[slug]`. That page shows figures (the price board from `published_price_statistics`, carbon intensity and cost
   per FEU from `emission_factors`), not `market_series` rows, so the series board's parts have no row to describe there, and
   `SERIES_ITEM_MAP` does not carry the stat-to-series key. Mounting needs `fsi-app/src/components/pages/MarketSignalDetailSurface.tsx`
   (and a ruling on which source the drawer describes for a price stat, or a series key added to the price-board read in
   `fsi-app/src/app/market/[slug]/page.tsx`). `/market/series` already mounts both; `/market` now does through the ribbon.
3. UX smoke coverage for the ribbon: a spec under `fsi-app/.discipline/rendering/smoke/` built on `runUxSpec`, its registration in
   `ux-smoke-specs.mjs`, and the F35 `ROW_COMPONENTS` line. Not added because the directory is outside the write set.

## Not done

- r9 and the `/market/[slug]` halves of r10 and r11 (above).
- The spec 00 section 4 "request coverage" control for the not-covered state: no such control exists anywhere in the product
  (VERIFY-1, 00S4) and it needs an endpoint; the state is named and explained, with no control.
- Pages with no figure (none under `/market`): nothing to unmount.
- Registry state is unchanged: no migration, no producer, no data write, no live read; the series computations are untouched.

## Open items

- A freshness state on the ribbon uses the injected render instant; mounts that pass no `nowIso` (a smoke fixture) fall back to the
  host clock, marked `clock-ok` as `MarketSeriesBoard` does.
- The sparkline window is "all observations on record, sampled to 60 points", so a daily series and a weekly series span different
  lengths of time; the span is stated in the accessible name. A fixed-window rule (for example 52 weeks) is a product decision not in
  the brief.
