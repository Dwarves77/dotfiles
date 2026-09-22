# Rendering guard real-fonts tree measurement, 2026-09-22 (RD-80, lane G3)

Read-only measurement pass required by brief-g3.md build item 6. This is not a fix pass: nothing
below is remediated in this lane. Every finding is a record for the part lane that owns the surface
it names.

## What changed before this measurement

Lane G3 (brief-g3.md, invariant RD-80) fixed the Rendering guard's harness so it measures with the
application's own font files (`Plus Jakarta Sans` 400/500/600/700/800, `Anton` 400) loaded and
ready, instead of the OS font-matching fallback every prior guard run silently measured against. See
`fsi-app/.discipline/rendering/smoke/smoke-fixtures.mjs` (`fontFaceCss()`, `assertFontsReady()`) and
`fsi-app/.discipline/rendering/run-rendering-guard.mjs` for the mechanism. No component, smoke spec,
or layout-guard rule was touched by this lane; the branch this measurement ran on differs from
`origin/master` only in the rendering-guard harness itself, so this measurement is "origin/master
with real fonts," per the brief.

## Method

`[CONFIRMED]` Command: `node .discipline/rendering/run-rendering-guard.mjs`, run from `fsi-app/` on
this lane's branch (`lane/g3-guard-real-fonts`, cut from `origin/master` at `af898bc2`), on
2026-09-22, twice consecutively. Both runs produced byte-identical failure lists (see the lane's
final report for the exact diff command and result).

## Result

`[CONFIRMED]` 75 failures, zero errors, zero `RD-80 fonts did not resolve` lines (every one of the
14 hand-reproduced fixtures × 12 viewports, the 14 SM smoke specs, and the 13 UX smoke specs
resolved every required face cleanly). All 75 failures are from the site-wide layout guard
(`layout-guard/run-layout-guard.mjs`, rules L2/L6/L7/L9), which the baseline mechanism
(`layout-guard/baseline.mjs`, expiring 2026-10-15) did not cover; 563 other layout-guard findings on
this same run matched the existing baseline and were suppressed as already-known, per that
mechanism's own design (`docs/audits/layout-guard-2026-09-08.md` names the owning part for each
baselined finding). Zero failures from the extreme-data fixture legs, the SM smoke specs, or the UX
smoke specs.

### By detector class

| Rule | Count | What it measures |
|---|---|---|
| L2 | 34 | Two elements with visible content intersect and neither contains the other |
| L9 | 31 | An interactive target is below the 44×28px hit-target floor, or two adjacent targets overlap |
| L6 | 8 | A card is missing part of its chrome (the 3px top rule) |
| L7 | 2 | Anton renders on an element outside the operator's named allowlist |

### By route

| Route @ width | Count |
|---|---|
| /settings@1024 | 40 (L2 22, L9 18) |
| /settings@1440 | 18 (L2 12, L9 6) |
| /watchlist@1440 | 4 (L6) |
| /watchlist@1024 | 4 (L6) |
| /research@1440 | 2 (L9) |
| /research@1024 | 2 (L9) |
| /profile@1440 | 1 (L9) |
| /map@1440 | 1 (L9) |
| /map@1024 | 1 (L9) |
| /admin@1440 | 1 (L7) |
| /admin@1024 | 1 (L7) |

### Full failure list

```
✗ layout-guard L9 /research@1440: button[30d] - 44×28px (long 44 < 44 or short 28 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /research@1440: button[90d] - 43.9×28px (long 43.9 < 44 or short 28 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /research@1024: button[30d] - 44×28px (long 44 < 44 or short 28 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /research@1024: button[90d] - 43.9×28px (long 43.9 < 44 or short 28 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /map@1440: button.cl-filter-chip[Rail] - 43.2×28.5px (long 43.2 < 44 or short 28.5 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /map@1024: button.cl-filter-chip[Rail] - 43.2×28.5px (long 43.2 < 44 or short 28.5 < 28) [interactive target below the hit-target floor]
✗ layout-guard L6 /watchlist@1440: li.cl-row-card[Fixture entity 09/5/2026, 5:00] - 3px top rule (measured none) [a card is missing part of its chrome]
✗ layout-guard L6 /watchlist@1440: li.cl-row-card[Fixture entity 19/5/2026, 5:00] - 3px top rule (measured none) [a card is missing part of its chrome]
✗ layout-guard L6 /watchlist@1440: li.cl-row-card[Fixture entity 29/5/2026, 5:00] - 3px top rule (measured none) [a card is missing part of its chrome]
✗ layout-guard L6 /watchlist@1440: li.cl-row-card[Fixture entity 39/5/2026, 5:00] - 3px top rule (measured none) [a card is missing part of its chrome]
✗ layout-guard L6 /watchlist@1024: li.cl-row-card[Fixture entity 09/5/2026, 5:00] - 3px top rule (measured none) [a card is missing part of its chrome]
✗ layout-guard L6 /watchlist@1024: li.cl-row-card[Fixture entity 19/5/2026, 5:00] - 3px top rule (measured none) [a card is missing part of its chrome]
✗ layout-guard L6 /watchlist@1024: li.cl-row-card[Fixture entity 29/5/2026, 5:00] - 3px top rule (measured none) [a card is missing part of its chrome]
✗ layout-guard L6 /watchlist@1024: li.cl-row-card[Fixture entity 39/5/2026, 5:00] - 3px top rule (measured none) [a card is missing part of its chrome]
✗ layout-guard L7 /admin@1440: p[May 27] - font-family resolves to Anton on "May 27" [Anton only on: page-title, card-title, band-tile-numeral, stat-block-numeral, headline-figure, timeline-callout, matrix-cell-score, matrix-fact-figure, nav-wordmark]
✗ layout-guard L7 /admin@1024: p[May 27] - font-family resolves to Anton on "May 27" [Anton only on: page-title, card-title, band-tile-numeral, stat-block-numeral, headline-figure, timeline-callout, matrix-cell-score, matrix-fact-figure, nav-wordmark]
✗ layout-guard L9 /profile@1440: a[Settings · notifications, brie] - 258×18.8px (long 258 < 44 or short 18.8 < 28) [interactive target below the hit-target floor]
✗ layout-guard L2 /settings@1440: button[Central America] × div[Data & supersessionsSaved sear] - overlap 109.2×4.5px (a at 1117,811.7 109.2×28.5; b at 1100,835.7 300×142.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[EU] × div[Data & supersessionsSaved sear] - overlap 38.5×4.5px (a at 1232.2,811.7 38.5×28.5; b at 1100,835.7 300×142.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[Germany] × div[Data & supersessionsSaved sear] - overlap 72.7×4.5px (a at 1276.6,811.7 72.7×28.5; b at 1100,835.7 300×142.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[Greece] × a[Archive] - overlap 63.8×4.3px (a at 1117,915.2 63.8×28.5; b at 1117,939.4 266×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[Portugal] × a[Archive] - overlap 69.3×4.3px (a at 1186.8,915.2 69.3×28.5; b at 1117,939.4 266×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[Romania] × a[Archive] - overlap 70×4.3px (a at 1262.2,915.2 70×28.5; b at 1117,939.4 266×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[CIS (other)] × section[Saved searchesNamed filter com] - overlap 81×28.5px (a at 1117,1605.2 81×28.5; b at 308,1433.4 1092×220.5) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[Kazakhstan] × section[Saved searchesNamed filter com] - overlap 84.7×28.5px (a at 1204,1605.2 84.7×28.5; b at 308,1433.4 1092×220.5) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[Global] × section[Saved searchesNamed filter com] - overlap 59.3×28.5px (a at 1294.7,1605.2 59.3×28.5; b at 308,1433.4 1092×220.5) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[IMO] × section[Saved searchesNamed filter com] - overlap 46.3×14.3px (a at 1117,1639.7 46.3×28.5; b at 308,1433.4 1092×220.5) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[ICAO] × section[Saved searchesNamed filter com] - overlap 52.5×14.3px (a at 1169.3,1639.7 52.5×28.5; b at 308,1433.4 1092×220.5) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1440: button[WTO] × section[Saved searchesNamed filter com] - overlap 50.3×14.3px (a at 1227.8,1639.7 50.3×28.5; b at 308,1433.4 1092×220.5) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L9 /settings@1440: button[Tue] - 41.3×30px (long 41.3 < 44 or short 30 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /settings@1440: button[Thu] - 41.5×30px (long 41.5 < 44 or short 30 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /settings@1440: button[Greece] × a[Archive] - adjacent targets overlap by 63.8×4.3px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1440: button[Portugal] × a[Archive] - adjacent targets overlap by 69.3×4.3px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1440: button[Romania] × a[Archive] - adjacent targets overlap by 70×4.3px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1440: button[Iran] - 43.8×28.5px (long 43.8 < 44 or short 28.5 < 28) [interactive target below the hit-target floor]
✗ layout-guard L2 /settings@1024: button[China] × div[AppearanceLight only. There is] - overlap 54.5×26.5px (a at 805.8,2010.7 54.5×28.5; b at 308,1960.4 676×76.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Japan] × div[AppearanceLight only. There is] - overlap 54.8×26.5px (a at 866.3,2010.7 54.8×28.5; b at 308,1960.4 676×76.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[UAE] × a[Saved searches · 0] - overlap 45.8×4.8px (a at 604.5,2114.2 45.8×28.5; b at 325,2094.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[UAE] × a[Data summary] - overlap 45.8×17.8px (a at 604.5,2114.2 45.8×28.5; b at 325,2124.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Saudi Arabia] × a[Saved searches · 0] - overlap 90.2×4.8px (a at 656.3,2114.2 90.2×28.5; b at 325,2094.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Saudi Arabia] × a[Data summary] - overlap 90.2×17.8px (a at 656.3,2114.2 90.2×28.5; b at 325,2124.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Qatar] × a[Saved searches · 0] - overlap 54.6×4.8px (a at 752.5,2114.2 54.6×28.5; b at 325,2094.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Qatar] × a[Data summary] - overlap 54.6×17.8px (a at 752.5,2114.2 54.6×28.5; b at 325,2124.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Kuwait] × a[Saved searches · 0] - overlap 60.5×4.8px (a at 813.1,2114.2 60.5×28.5; b at 325,2094.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Kuwait] × a[Data summary] - overlap 60.5×17.8px (a at 813.1,2114.2 60.5×28.5; b at 325,2124.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Bahrain] × a[Saved searches · 0] - overlap 63.9×4.8px (a at 879.6,2114.2 63.9×28.5; b at 325,2094.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Bahrain] × a[Data summary] - overlap 63.9×17.8px (a at 879.6,2114.2 63.9×28.5; b at 325,2124.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Jordan] × a[Archive] - overlap 59.6×22.3px (a at 540.4,2148.7 59.6×28.5; b at 325,2154.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Iraq] × a[Archive] - overlap 44.7×22.3px (a at 606,2148.7 44.7×28.5; b at 325,2154.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Iran] × a[Archive] - overlap 43.8×22.3px (a at 656.7,2148.7 43.8×28.5; b at 325,2154.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Middle East (other)] × a[Archive] - overlap 123.8×22.3px (a at 706.5,2148.7 123.8×28.5; b at 325,2154.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Egypt] × a[Archive] - overlap 55.8×22.3px (a at 836.3,2148.7 55.8×28.5; b at 325,2154.9 642×24) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[North Africa (other)] × div[Data & supersessionsSaved sear] - overlap 126×10.8px (a at 536.5,2183.2 126×28.5; b at 308,2051.2 676×142.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[South Africa] × div[Data & supersessionsSaved sear] - overlap 89×10.8px (a at 668.5,2183.2 89×28.5; b at 308,2051.2 676×142.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Nigeria] × div[Data & supersessionsSaved sear] - overlap 61.8×10.8px (a at 763.4,2183.2 61.8×28.5; b at 308,2051.2 676×142.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Kenya] × div[Data & supersessionsSaved sear] - overlap 56.6×10.8px (a at 831.3,2183.2 56.6×28.5; b at 308,2051.2 676×142.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L2 /settings@1024: button[Ethiopia] × div[Data & supersessionsSaved sear] - overlap 67.8×10.8px (a at 893.9,2183.2 67.8×28.5; b at 308,2051.2 676×142.8) [two elements with visible content intersect and neither contains the other]
✗ layout-guard L9 /settings@1024: button[Tue] - 41.3×30px (long 41.3 < 44 or short 30 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /settings@1024: button[Thu] - 41.5×30px (long 41.5 < 44 or short 30 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /settings@1024: button[UAE] × a[Saved searches · 0] - adjacent targets overlap by 45.8×4.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[UAE] × a[Data summary] - adjacent targets overlap by 45.8×17.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Saudi Arabia] × a[Saved searches · 0] - adjacent targets overlap by 90.2×4.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Saudi Arabia] × a[Data summary] - adjacent targets overlap by 90.2×17.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Qatar] × a[Saved searches · 0] - adjacent targets overlap by 54.6×4.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Qatar] × a[Data summary] - adjacent targets overlap by 54.6×17.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Kuwait] × a[Saved searches · 0] - adjacent targets overlap by 60.5×4.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Kuwait] × a[Data summary] - adjacent targets overlap by 60.5×17.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Bahrain] × a[Saved searches · 0] - adjacent targets overlap by 63.9×4.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Bahrain] × a[Data summary] - adjacent targets overlap by 63.9×17.8px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Jordan] × a[Archive] - adjacent targets overlap by 59.6×22.3px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Iraq] × a[Archive] - adjacent targets overlap by 44.7×22.3px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Iran] - 43.8×28.5px (long 43.8 < 44 or short 28.5 < 28) [interactive target below the hit-target floor]
✗ layout-guard L9 /settings@1024: button[Iran] × a[Archive] - adjacent targets overlap by 43.8×22.3px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Middle East (other)] × a[Archive] - adjacent targets overlap by 123.8×22.3px [adjacent interactive targets must not overlap]
✗ layout-guard L9 /settings@1024: button[Egypt] × a[Archive] - adjacent targets overlap by 55.8×22.3px [adjacent interactive targets must not overlap]
```

## Interpretation, not a fix

`[HYPOTHESIS]` These are baseline deltas: the layout guard's baseline (`baseline.json`, expiring
2026-10-15) was captured against the guard's PRIOR fallback-font measurements. Real font metrics
(the true `Plus Jakarta Sans`/`Anton` advance widths, replacing whatever the running OS fell back
to) shift text-dependent box sizes, most visibly here as country-chip and day-button hit targets
landing fractions of a pixel under the 44×28 floor (e.g. `43.8×28.5px`, `43.9×28px`) and the
watchlist row card's 3px top rule failing to render against fixture text these fixtures compose. This
lane did not investigate which of the 75 are newly caused by real-font metrics versus pre-existing
and merely absent from the current baseline; that investigation and any fix belongs to the part lane
that owns `/settings`, `/watchlist`, `/research`, `/map`, `/profile`, and `/admin` respectively.

## Not covered by this measurement

The 563 layout-guard findings already covered by the dated baseline are not reproduced here. The
`[A]`-`[E]` lines this run also printed are the `ops-matrix-acceptance` SM smoke spec's own
diagnostic output (one of the 14 registered specs; see `smoke/ops-matrix-acceptance-smoke.mjs`), not
a failure; that spec reported zero failures on this run.
