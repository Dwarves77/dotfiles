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

## Round 2 — lane MOBILE-2, 2026-09-03

Second operator report, phone: "too much space between squished words and words doubling what's
below them and going off page." The coordinator's own 390px production probe (same-origin iframe
against the deployed build) measured four findings across `/regulations/g14`, `/operations`, and
`/market`; `/`, `/research`, `/community` were clean, and `/regulations`'s ledger rows (screenshot
`08-regulations-ledger-stale-or-broken.jpg`) were already fixed on the deployed build — that
screenshot was a stale client session, not a live defect, and is not re-fixed here (see the
next.config.ts finding below, which turned out to be the actual reason a stale session looked
plausible).

### Regulation detail — breadcrumb clipped + "doubling" (`09-regulation-detail-breadcrumb.jpg` →
`after-09-regulation-detail-breadcrumb.png`)

**Confirmed cause.** `RegulationDetailSurface.tsx`'s breadcrumb `<nav>` used `whiteSpace: nowrap`
on the crumb group and the last crumb (the resource's own title) with no wrap escape — at 390px it
ran off the right edge with no scrolling ancestor. The same last crumb, rendered a second time as
the full title, sat directly above the real `<h1>` — the "doubling" read. Header padding was a flat
36px with no responsive step. Zero `data-guard-title` anywhere on the page, so nothing had ever
been measured here.

**Fix.** Breadcrumb: `nowrap` removed from the group and the last crumb (`overflowWrap: anywhere`,
`minWidth: 0` instead); the last crumb and its separator are hidden at ≤640px (`.cl-reg-crumb-last`,
inline `<style>` in the file) rather than truncated, since the full title already renders once,
correctly, as the `<h1>` right below — hiding the duplicate is the fix, not shrinking it further.
Header/integrity-banner/ask-bar/`#cl-detail-grid` padding: flat `36px` → `var(--cl-detail-pad-x)`
(new token, `globals.css`: `36px` desktop, `16px` at ≤767px — the same convention item 1 asked
for). `data-guard-title` added to the `<h1>` and every `SectionCard`/`Accordion` heading;
`data-guard-container` added to the header and each section card so the squeezed-title detector has
a real container to measure against (the same false-positive class Round 1's README documents).
Tab strip buttons, `ActionButton`, the "All N milestones →" link, and the Short/Full summary
toggle were all under the law-2 floor (13–32px tall, several with 0–6px clearance) — fixed with
`minHeight: 44` + inline-flex/center on each.

**Also found and fixed while building the smoke spec (not in the two screenshots, but the same
"row/card squeeze" class item 4 asked to sweep for).** `RegulationTimeline.tsx`'s date/label row
used a fixed `gridTemplateColumns: "120px 1fr"` with `whiteSpace: nowrap` on the date — same shape
as Round 1's `OperationsItemsView` fixed-column bug; fixed with `minmax(0, 120px) 1fr` +
`overflowWrap: anywhere`. A blank timeline label (two milestones sharing a year) collapsed to an
8px-wide hit target — fixed with `minWidth: 44` on the label buttons. The "All N milestones →"
button, once grown to a real 44px hit-box for its own law-2 fix, left only ~2px of clearance to the
first timeline dot below it (traced with a Playwright debug script calling the real
`detectSmallTargets`/`boxGap` directly, not by inspection — the analytical gap estimate was wrong
by 16px because of how the row's baseline alignment placed the taller box) — fixed by growing that
row's bottom margin 6px → 18px.

**Proof.** `detail-surfaces-smoke.mjs` (new), mounting all four real detail surfaces at 375×812 and
1280×800 with an 80+ char title, a long breadcrumb, and six sections. Registered temporarily to
verify locally, reverted before commit per the lane contract (registry line below). With the fixes
above: `UX smoke specs: 8 (…, detail-surfaces) ux checks: 116` — 0 failures, both viewports.

### Operations region matrix — clipped past the right edge (`01-operations-regions.png`'s
successor; new production finding, not in the original seven) → `after-10-operations-matrix-mobile.png`

**Confirmed cause.** `RegionDimensionMatrix.tsx`'s region×dimension table (`overflowX: auto` on its
own wrapper, pre-existing since before this lane) requires horizontal panning to read at a phone
width once the live region roster grows past what fits — the coordinator's probe read this off a
screenshot as "United States 1/5 dimensions sourced" clipped at the edge. The table's own
`overflowX: auto` makes this **not** a bug the guard's `detectClippedOverflow` detector can catch —
that detector explicitly exempts anything behind a scrolling ancestor "on purpose (a strip)"; a
correctly-scrolling comparison table and a deliberate horizontal strip look identical to it. Fixing
this is a UX judgment call (a phone user should not have to pan sideways to read the page's primary
region comparison), not a mechanically-provable regression — see the honest red-then-green writeup
in `operations-rows-smoke.mjs`'s own comment.

**Fix.** `.cl-ops-matrix-cards`/`.cl-ops-matrix-table` (`globals.css`): the table is unchanged at
>640px; at ≤640px it is replaced with one full-width card per region (region name, "n/N
dimensions" chip, the sourced dimensions stacked, each a real 44px expand/collapse button, wrapping
facts). Both views share `openDimension`/`baseRegion` state so they never disagree mid-session.

**Proof.** `operations-rows-smoke.mjs`'s `REGIONS` fixture grown from 5 to 6 (EU/US/ASIA/UK/UAE/SG
— matching the coordinator's "growing live region roster" note, not a stale 5-region count). Tried
honestly for red-then-green: reverted the component to its pre-fix (base `e5766cc0`) content in a
worktree and ran the guard against the six-region fixture — it PASSED, unfixed, at every viewport,
for the reason above (the detector's scrollable-ancestor exemption applies regardless of region
count). Reported as a genuine detector-coverage gap rather than staged as a false failure. The fix
was still built and is exercised, post-fix, by the same six-region fixture (0 failures) — see the
`UX smoke specs: 8 (…) ux checks: 116` line above, which includes `operations-rows` unchanged in
spec count but now measuring 6 regions instead of 5 within it.

### Market upcoming-obligations strip tiles — verified, one genuine fix
(`04-market-signals.png`'s neighbour; new finding) → `after-11-market-upcoming-strip.png`

**Checked against the coordinator's two-part test.** (1) Visible affordance: the strip has no
scroll-snap and fixed 240px cards, so whenever the strip's total content width isn't an exact
multiple of the viewport, the next tile is genuinely, visibly partially shown — confirmed true by
reading the markup (unchanged) and by the after-screenshot above. (2) Tile text wraps within the
tile: **false** — the title used `whiteSpace: nowrap` + `overflow: hidden` + `textOverflow:
ellipsis`, cutting it mid-word inside the 240px card ("Compliance deadline September 2…").

**Fix.** `UpcomingObligationsStripView.tsx`'s `EventCard` title: `nowrap`/ellipsis replaced with a
genuine 2-line wrap (`overflowWrap: anywhere`, `WebkitLineClamp: 2`) — same idiom the card already
used one paragraph down for the obligation-text preview. `data-guard-container` added to the card
(without it the squeezed-title detector falls back to the full page width for a 240px tile — same
false-positive class as Round 1's cross-cutting finding). Flat `36px` strip padding also converted
to `var(--cl-detail-pad-x)` (widens the strip and shows slightly more of the next tile on a phone).

**Proof.** Exercised inside `detail-surfaces-smoke.mjs`'s Regulations mount (the strip renders on
the same page) and directly in the after-screenshot above, which shows the title genuinely wrapped
to two lines with a partial next tile visible at the right edge.

### `next.config.ts` — dead Cache-Control config removed

**Confirmed cause.** The coordinator's same-origin iframe probe against the deployed build found
every route in the `headers()` block actually serving `Cache-Control: private, no-cache, no-store`
in production, not the configured PERF-1 values — Next.js overrides a config-level Cache-Control on
any dynamic route (every route here reads `cookies()`/auth, so all seven-plus are dynamic), so this
entire block never reached a client. This is also the likely reason screenshot
`08-regulations-ledger-stale-or-broken.jpg` showed pre-fix layout on the operator's phone after the
fix had shipped — something in the client's own caching, never this config (it was never live), was
serving a stale session.

**Fix.** The `headers()` function and its ~38-line PERF-1 explanatory comment removed; one comment
left naming this probe as the reason, so a future reader isn't left wondering why PERF-1's design
doc describes headers that no longer exist in code. `redirects()` untouched.

**deploymentId / skew protection — report only, not enabled.** `next.config.ts` does not set
`deploymentId` and the app has no `vercel.json` skew-protection config; nothing to remove or
report beyond "not configured, unchanged by this lane."

### Sweep (item 4) — every file changed, every file judged fine, and why

**Changed** (beyond the four findings above): `SectionCard.tsx` (heading `flexWrap`, `data-guard-
title`, `overflowWrap`); `OperationsDetailSurface.tsx` and `ResearchFindingDetailSurface.tsx`
(`px-9` → `var(--cl-detail-pad-x)`, `data-guard-container`/`data-guard-title` on the container/
`BriefSection`/section-card headings, header-row `flexWrap`, **two** source-attribution `<a>` tags
each — a hero one and a second, separately-rendered legacy "Sources" `BriefSection` one, both
20-ish px tall, both fixed to `minHeight: 24`); `operations/[slug]/page.tsx` and
`research/[slug]/page.tsx` (back-link padding → the same token); `ChangedSinceStrip.tsx`
(`.cl-changed-since-grid` collapses to one column at ≤640px — a fixed multi-column grid with no
mobile step, same defect class as Round 1's `.cl-ops-item-card`).

**Judged fine, not changed** (grepped for `gridTemplateColumns`, `whiteSpace: "nowrap"`,
`flexShrink: 0` across the four index pages, the four detail surfaces, and every directory in the
write set): every other fixed-column grid found already had a responsive override or a legitimate
reason to stay fixed (e.g. a two-character status badge, a small icon slot with `flexShrink: 0`
correctly paired with a `minWidth: 0`/`flex: 1` sibling doing the actual wrapping) — read
individually, not assumed safe by pattern match alone. None of these carried a proving smoke test
this lane's time budget extended to write, so they are asserted by reading, not measured; flagged
here rather than silently claimed equivalent to the measured findings above.

### F35 `ROW_COMPONENTS` — lines to add (coordinator, F35-row-ux-coverage.mjs is out of this lane's
write set)

```
'src/components/regulations/RegulationDetailSurface.tsx',
'src/components/operations/OperationsDetailSurface.tsx',
'src/components/research/ResearchFindingDetailSurface.tsx',
'src/components/pages/MarketSignalDetailSurface.tsx', // coverage only — outside every lane's write set today per the brief; flag if that should change
```

Registry line to re-add if the coordinator wants `detail-surfaces-smoke.mjs` live permanently
(`ux-smoke-specs.mjs`, reverted by this lane before commit per instruction):

```js
import { runSmoke as runDetailSurfacesSmoke } from './detail-surfaces-smoke.mjs';
// ...
{ name: "detail-surfaces", run: runDetailSurfacesSmoke },
```

### NEEDS WRITE-SET EXPANSION (found, not fixed — out of this lane's write set)

- `src/components/pages/MarketSignalDetailSurface.tsx` — the Market detail surface's own header/
  breadcrumb/tabs were never audited or fixed by this lane (`src/components/pages/**` not in the
  write set); mounted read-only in `detail-surfaces-smoke.mjs` for coverage, all assertions skipped.
- `src/components/shell/PageMasthead.tsx` (and its wrapper `src/components/ui/EditorialMasthead.tsx`)
  — already well-built (title clamp, 640px breakpoint, flexWrap — confirmed by reading), but carries
  no `data-guard-title`, so Operations/Research's page-level `<h1>` (rendered by `page.tsx` through
  this component, not the detail surfaces) is unmeasured by any smoke spec. `src/components/shell/**`
  and `src/components/ui/**` are both outside the write set.
- `@/components/ui/AiPromptBar` — the chip row + input + "Ask" button below `RegulationDetailSurface`'s
  header fails law-2 (5 targets, 17–21px). Pre-existing, not introduced by this lane;
  `src/components/ui/**` is outside the write set. Excluded from `detail-surfaces-smoke.mjs`'s
  assertions by name, not silently passed.

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
