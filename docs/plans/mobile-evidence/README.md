# Mobile evidence — lane MOBILE, 2026-09-03

Seven operator screenshots (`01`–`07`, iPhone-class portrait, taken against `origin/master`
before this lane) showed the same defect class across five surfaces: an inline-styled flex/grid
row put a non-shrinking aside beside a `flex:1`/`1fr` title with no responsive escape, so at a
phone width the title wrapped one word per line or the aside ran text off the right edge. Root
cause confirmed first in `MarketIntelLedger.tsx` (~L900), then read/confirmed independently in
each other file below before it was changed — none was assumed fixed by analogy alone.

The fix is one shared responsive layer, `.cl-row` / `.cl-row__main` / `.cl-row__aside` /
`.cl-row__figure` / `.cl-row__actions` / `.cl-row-grid*` / `.cl-section-head*` /
`.cl-ops-item-card` (`fsi-app/src/app/globals.css`, "ROW SYSTEM" block), applied to every row/card/
header in the lane's write set: at ≤640px the aside stacks BELOW the title at full width instead
of squeezing it, every text-bearing flex/grid child gets `min-width: 0`, and titles get
`overflow-wrap: anywhere` instead of the fixed `nowrap` that caused the overflow.

Each row below is measured for real by a UX smoke spec
(`fsi-app/.discipline/rendering/smoke/{market,operations,research,regulations}-rows-smoke.mjs`,
`home-sections-smoke.mjs`) that mounts the actual `.tsx` component with esbuild + Playwright at
375×812 and 1280×800 and asserts no horizontal overflow, no squeezed (one-word-per-line) title, and
no interactive target under the law-2 floor — not a hand-reproduction of the markup. The `after-*`
screenshots in this directory were captured from those same mounted components at 375px.

## 01 — Operations regions (`01-operations-regions.png` → `after-01-operations-regions.png`)

**Confirmed cause.** Two defects in `RegionDimensionMatrix.tsx`, both confirmed by reading the file
and reproducing in the smoke spec:
1. A region×dimension fact VALUE (`DimensionCell` in `OperationsLedger.tsx`, not
   `RegionDimensionMatrix.tsx` itself — read: it can be a full sentence, e.g. "Tight specialist
   pool: fine art logistics…") rendered in a `<span>` with `whiteSpace: nowrap` and no
   `min-width: 0`, so a long value ran off the right edge instead of wrapping.
2. The dimension-name `<td>` carried neither `data-guard-title` nor `overflow-wrap`, so the
   squeezed-title detector had nothing to measure on this table at all.

**Fix.** (1) `whiteSpace: nowrap` removed, `minWidth: 0` + `overflowWrap: anywhere` added, in a
`flexWrap: wrap` parent, so a long value now wraps within the row or drops to its own line.
(2) `data-guard-title` + `overflowWrap: anywhere` added to the dimension-name cell, moved onto an
unpadded inner `<span>` (see "unrelated finding" below). The region×dimension TABLE itself was
already wrapped in its own `overflowX: auto` container before this lane (pre-existing) — confirmed
still holds under real data via the smoke spec's overflow assertion, not re-fixed.

**Unrelated finding, also fixed while building this spec.** `.cl-ops-dims` (the D1–D6 dimension-chip
grid) and `.cl-ops-tiles` (severity tiles) had responsive breakpoints stopping at 900px (2–3
columns) with no further step for a phone width — 3 columns of chips like "D3 Labor markets"
computed wider than their share of a 375px page and overflowed the body horizontally. Added
breakpoints at 640px (2 columns) and 420px (1 column) in `globals.css`.

## 02 — Operations items (`02-operations-items.png` → `after-02-operations-items.png`)

**Confirmed cause.** `OperationsItemsView.tsx`'s `OperationsItemCard` used a fixed
`gridTemplateColumns: "1fr 220px"` with no responsive override — at 375px the title column got
roughly `375 − padding − gap − 220px` ≈ 40px, so every word of the title wrapped onto its own line.
Same shape reused by `OperationsLedger.tsx`'s own "Active operations items" section (it renders
`OperationsItemsView` directly).

**Fix.** `.cl-ops-item-card` (globals.css): `grid-template-columns: 1fr` at ≤640px — the right
column (tier badge, severity pill, "what it changes") drops below the title, full width. The title
`<h4>` already carried `data-guard-title` + `overflowWrap: anywhere`; `data-guard-container` added
to the card so the squeezed-title detector measures the card's own width rather than falling back
to the page body (see the cross-cutting note below).

## 03 — Research findings (`03-research-findings.png` → `after-03-research-findings.png`)

**Confirmed cause.** `ResearchLedger.tsx`'s `FindingRow` — same shape as MarketIntelLedger's
`SignalRow`: an inline-styled flex row with a non-shrinking aside (key figure + "Full analysis →"
link + expand toggle) beside a `flex:1`/`minWidth:0` title.

**Fix.** `.cl-row` / `.cl-row__main` / `.cl-row__aside` / `.cl-row__figure` / `.cl-row__actions`
applied; `data-guard-container="finding-row"` and `data-guard-title` on the title `<p>` (both
pre-existing on this file from earlier in this lane).

**Unrelated finding, also fixed.** The time-window segmented control (7d/30d/90d/All) and the two
credibility chips ("Evidence × agreement" / "Source authority") were under the law-2 floor (26px
and 14px tall respectively, with 0px clearance between the window buttons). Fixed with `minHeight`
(44 and 24 respectively) — see `CredibilityChipShared.tsx` and `ResearchLedger.tsx`.

## 04 — Market signals (`04-market-signals.png` → `after-04-market-signals.png`)

**Confirmed cause [CONFIRMED, the dispatch's own root-cause finding].** `MarketIntelLedger.tsx`'s
`SignalRow`, ~L900: an inline-styled flex row put a non-shrinking aside (`flexShrink: 0`,
`minWidth: 120`, a nowrap price figure + "Full analysis →" link + "+" toggle, ~330px) beside a
`flex: 1; minWidth: 0` title. At 375px the title got ~40px and every word wrapped onto its own
line.

**Fix.** `.cl-row` / `.cl-row__main` / `.cl-row__aside` / `.cl-row__figure` / `.cl-row__actions` —
the aside stacks BELOW the title at ≤640px, full width, figure + actions back on one line.
`data-guard-container="signal-row"` + `data-guard-title` on the title `<p>`.

## 05 — Regulations upcoming (`05-regulations-upcoming.png` → `after-05-regulations-upcoming.png`)

**Confirmed cause.** `UpcomingObligationsStrip.tsx` was (a) an async Server Component (its data-
access import chain reaches `next/headers` → `cookies()`) and (b) its `EventCard` title column was
narrow relative to a "···"/icon-only-style control, matching the screenshot's "narrow title column,
icon-only control" description.

**Fix.** Split into a fetch half (`UpcomingObligationsStrip.tsx`, unchanged server-side behaviour)
and a pure presentational half (`UpcomingObligationsStripView.tsx`, new — carries every byte of the
row markup, zero server-only imports) so the row markup is mountable in a browser bundle at all
(esbuild resolves the async component fine, but *using* any export of it evaluates `next/headers`'s
top-level code and throws "process is not defined" outside Next's server runtime — confirmed
empirically building this spec). The list-strip `EventCard` title is deliberately `nowrap` +
ellipsis inside a fixed 240px tile in a horizontally-**scrolling strip** (`overflowX: auto` on the
strip's own parent, never the page) — the same carve-out the row-system comment names for a chip or
bounded figure, not a regression of the "no nowrap" rule. The detail-rail `DetailCard`'s obligation
text wraps normally (`overflowWrap: anywhere`, `data-guard-title`).

**F35 `ROW_COMPONENTS` path change (report to coordinator).** F35 still lists
`src/components/regulations/UpcomingObligationsStrip.tsx` (the async server half, which cannot be
mounted in a browser bundle at all — see above). The row markup this lane's spec actually measures
now lives in `UpcomingObligationsStripView.tsx`. Ask: update F35's `ROW_COMPONENTS` key from
`UpcomingObligationsStrip.tsx` to `UpcomingObligationsStripView.tsx` (basis unchanged: screenshot
05, narrow title column + icon-only control). Until that lands, `run-rendering-guard.mjs`'s UX
smoke slot is green (the real row markup is measured) but `F35 row-ux-coverage` reports the old
path as uncovered — this is the ONE MOBILE-owned F35 violation in the PROOF section below.

## 06/07 — Home (`06-home-what-changed.png`, `07-home-five-surfaces.png` →
`after-06-home-what-changed.png`, `after-07-home-five-surfaces.png`)

**Confirmed cause.** `HomeSurface.tsx`'s shared `SectionHeading` (used by both "What changed" and
"Across your five surfaces", among others): the aside carried `whiteSpace: nowrap` with no
`max-width` and no `minWidth: 0` on either flex child. At 375px the aside's forced-nowrap subtitle
("Source and theme monitoring, change log across the registry") claimed its own full text width as
its flex minimum, leaving the title only its longest single word ("WHAT" / "CHANGED" stacked)
while the subtitle itself ran off the right edge with no wrap and no ellipsis.

**Fix.** `.cl-section-head` / `.cl-section-head__title` / `.cl-section-head__aside`: the subtitle
now wraps like ordinary prose (it is prose, not a chip or bounded figure, so `nowrap` was wrong for
it outright) and the two stack at ≤640px instead of squeezing onto one row.

**Unrelated findings, also fixed while building `home-sections-smoke.mjs`** (this test applies the
full UX-law check set to `HomeSurface`'s children for the first time — the pre-existing
`list-order-smoke.mjs` mounts `DashboardTopPriority` but only asserts overflow, not law-2 target
size, so these were never caught before): the "Watchlist →" title link and "Browse what to
watch/regulations →" empty-state CTA (`DashboardRailCard.tsx`, shared by multiple rail cards, ~11–
14px tall), the "Jane Doe"-style owner link (`DashboardByOwner.tsx`, ~15px tall, 2px from its
neighbour), and the drag-handle grip button (`DashboardTopPriority.tsx`, 26px wide flush against
the row `<Link>`, 0px clearance) were all under the law-2 floor. Fixed with `minHeight: 24`
(links) and a `columnGap: 8` on the drag-handle grid (button stays 26px, the row-Link too, just no
longer touching).

## Cross-cutting finding: `data-guard-container` and the squeezed-title false positive

Building `operations-rows-smoke.mjs` surfaced that the squeezed-title detector
(`ux-assert.mjs`'s `measureUx`, read-only to this lane) falls back to `document.body` for a
title's "container width" when no `[data-guard-container]` ancestor is present — which
`MarketIntelLedger` / `ResearchLedger` already had (`data-guard-container="signal-row"` /
`"finding-row"`) but `OperationsItemsView`, `OperationsLedger`'s region card, and
`RegulationsLedger`'s row did not. Without it, a title correctly laid out in a normal multi-column
page still reads as "squeezed" relative to the FULL page width — a false positive, not a real
defect (confirmed: a raw DOM trace showed the title on one line at its actual column width; the
detector's own container reference was simply wrong). Added `data-guard-container` to all three so
the detector measures each row's own width. Documented in `smoke-fixtures.mjs`'s `fullAppCss`
header, since the same investigation also found that injecting only this lane's new row-system CSS
subset (rather than the real `globals.css` + `theme.css`) left `OperationsLedger`'s pre-existing
`.cl-ops-grid` collapse rule un-applied in the test, producing a second false "horizontal overflow"
failure that does not reproduce in the real app.

## Not reproduced / not independently confirmed

Screenshots 01–07 above were each read against the named file and the described defect confirmed in
the source before it was changed (never fixed by analogy to another file alone). The broader "every
row/card/header in the write set" pass (scope item 2) was applied to the nine components F35's
`ROW_COMPONENTS` names (proven via the five smoke specs) plus a light, unproven consistency pass on
`MarketSeriesBoard.tsx`'s producer-card title (same `min-width: 0`/`overflow-wrap` treatment,
applied for consistency — no defect caught, no smoke spec built for it, since it is not one of
F35's `ROW_COMPONENTS`). `MarketComparativeRibbon.tsx`, `CarbonCostOverlay.tsx`, `TrajectoryBars.tsx`,
`OperationsDetailSurface.tsx`, and the remainder of `research/**`, `home/**` (beyond `HomeSurface`'s
own children exercised above), `dashboard/**`, `watchlist/**`, and `shell/**` were not exhaustively
re-audited for this same defect class beyond a grep pass for the `justifyContent: "space-between"`
pattern with no hit investigated further; none showed the pattern strongly enough to warrant a
change without a proving smoke test this lane's time budget did not extend to. Flagged here rather
than silently left unstated.
