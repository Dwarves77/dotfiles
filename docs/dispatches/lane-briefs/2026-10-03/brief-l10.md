# Lane L10: Market Intel signal/fact chip (verification) + lead-time chart (built)

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/
complete-build-plan-2026-10-01.md` section 1.2 (row 02S6 row 4-5) and its L10 entry in section 2;
`docs/specs/02-market-intel.md` sections 2, 6, 7 in full; `docs/plans/finish-plan-2026-09-02.md`'s Wave 2
"CORR" lane paragraph (the superseded ruling, see below); then the README for this dispatch (`docs/
dispatches/lane-briefs/2026-10-03/README.md`) in full, especially "What is already built" item 1 and the
coordinator-ruling section on the lead-time chart.

Lane id: `l10`. Branch: cut from `origin/master`. Branch name: `lane/l10-market-chip-verify-2026-10-03`.
Model: Sonnet. You execute exactly this brief. Anything it does not cover, or any statement here that is
wrong against the code, is a STOP: report it, do not solve it.

## COORDINATOR RULING, 2026-10-03 (under ADR-039's operator delegation) - supersedes the finish-plan hold

`docs/plans/finish-plan-2026-09-02.md` ruled the lead-time chart out ("no data source"). `docs/plans/
complete-build-plan-2026-10-01.md` (ADR-039) is the later decision and supersedes that ruling: **the
lead-time chart is built**, fed by the SBTi Target Dashboard public dataset (free, weekly, no login,
named in spec 02 section 7) via the SBTi producer lane L11 builds. This ruling resolves the conflict the
2026-10-03 README first raised as an open question - it is no longer open. Both halves of this lane now
ship:

1. **Chip verification** (unchanged from this brief's prior draft - the fix is already built and live,
   see "Objective" below).
2. **Lead-time chart, built**, per spec 02S6 row 5 and the plan's own L10 text: `fsi-app/src/components/
   market/LeadTimeChart.tsx`, fed by `market_series` rows the SBTi producer (lane L11) writes.

**You must correct `fsi-app/src/components/market/CarbonCostOverlay.tsx` in place** - both its header
comment (lines 28-29: "Lead-time chart (spec 02 S6 item 5) stays ruled out - no data source (finish-
plan-2026-09-02.md S5)...") and its rendered footer text (lines 187-189: "The lead-time position chart
(spec 02 S6 item 5) is not built here - no data source exists for it..."). Both must now state plainly
that the chart is built (name the component, `LeadTimeChart.tsx`) and point to it, replacing the "ruled
out" framing with the correction, dated and attributed to this coordinator ruling, per rule 14's "a
correction stays visible, not deleted" posture - do not simply delete the old prose, restate it as
superseded in one sentence, then give the current fact.

## Objective and requirement IDs

Spec 02S6 row 4 ("Unverified" chip, promotion state) and row 5 (lead-time chart).

**Chip half** - the README's "What is already built" item 1 establishes [CONFIRMED] that the named
defect (`isSignalType = !!r.type`, unconditional chip) is already fixed: `fsi-app/src/lib/market/
signal-promotion.mjs`'s `derivePromotionState()` is live in `fsi-app/src/components/pages/
MarketSignalDetailSurface.tsx`. This half's objective is to prove that live, not to rebuild it.

**Lead-time-chart half** - per spec 02S6 row 5: "a comparative lead-time position chart (vs peers/
adjacent industries)." Your objective is to build `LeadTimeChart.tsx` reading SBTi Target Dashboard rows
from `market_series` (the table L11's producer writes to), with an explicit "not forecastable" state
when fewer than the SBTi-minimum sample exists - never a fabricated position, per CLAUDE.md rule 2.

## Operator rulings that bind you

- **CLAUDE.md rule 14** (a finding is a hypothesis until verified, and a correction stays visible): the
  chip-fix row converts `[HYPOTHESIS, spec-dated]` to `[CONFIRMED]` or `[REFUTED]` against the live tree.
  The lead-time-chart ruling above is a correction to `CarbonCostOverlay.tsx`'s own prose - correct it in
  place, do not delete the history.
- **CLAUDE.md rule 2** (never fabricate): no verification claim without a live check you ran; the chart's
  "not forecastable" state is mandatory below the SBTi-minimum sample, never a guessed position.
- **This dispatch's coordinator ruling** (above): the lead-time chart is in scope, built, not held.

## Exact write set

- `fsi-app/src/components/market/LeadTimeChart.tsx` (new) - comparative lead-time position chart, reads
  SBTi-sourced `market_series` rows via the existing series-reader pattern (see READ FIRST item 7), renders
  an explicit "not forecastable" state when the live sample is below SBTi's own stated minimum, never a
  fabricated position (negative-tested).
- `fsi-app/src/components/market/LeadTimeChart.test.mjs` or `.test.tsx` (new, matching the existing test
  convention for sibling components in this directory - check which extension `CarbonCostOverlay`'s own
  test, if any, uses before choosing).
- `fsi-app/src/components/market/CarbonCostOverlay.tsx` - IN-PLACE CORRECTION ONLY to the two passages
  named in the coordinator ruling above (lines 28-29 header comment, lines 187-189 footer render text).
  No other change to this file.
- `fsi-app/src/app/market/page.tsx` or wherever the plan's own acceptance test implies the chart mounts
  (confirm the exact mount point by reading `MarketComparativeRibbon.tsx` and the market page first - the
  plan does not name an exact mount file for `LeadTimeChart.tsx`; if none is obvious, report the gap and
  mount it beside `CarbonCostOverlay` on the market ledger page as the nearest existing precedent, stating
  that choice explicitly as a judgment call, not a stated requirement).
- No production code change for the chip half (see Objective above) unless your verification finds the
  fix is NOT actually live, in which case STOP and report the contradiction rather than fixing it
  yourself.
- `fsi-app/.discipline/rendering/smoke/market-signal-detail-smoke.mjs` (new, ONLY if no existing UX smoke
  spec already covers `MarketSignalDetailSurface.tsx`'s promotion-chip render - check first) plus its
  registration line in `ux-smoke-specs.mjs` and `F35`'s `ROW_COMPONENTS` list (report the line, the
  coordinator adds it).
- A second UX smoke spec for `LeadTimeChart.tsx` (new row/card component - the lane common contract's UX
  contract requires one for every row/ledger/card component added).
- `docs/ops/session-log.d/2026-10-03-l10.md` (new).

## READ FIRST (every write-set file's importers/imports, migrations, generated inventories)

1. `fsi-app/src/lib/market/signal-promotion.mjs`, IN FULL - confirm `PROMOTION_STATE` and
   `derivePromotionState()` gate on `originClass`/`citableAsFact` and `independentCiters`, never
   corroboration count alone, exactly as documented.
2. `fsi-app/src/components/pages/MarketSignalDetailSurface.tsx` lines 55-70, 245-260 and 400-410, IN FULL
   for those ranges - confirm the import, the `useMemo` call, and the "Status" field render, by line
   number, in your report.
3. `grep -n "isSignalType" fsi-app/src` - confirm zero hits.
4. `fsi-app/.discipline/rendering/ux-smoke-specs.mjs` and `fsi-app/.discipline/fitness/functions/F35-*` -
   confirm whether a smoke spec already covers `MarketSignalDetailSurface.tsx`; a duplicate is a review
   fail per the lane common contract's prior-art rule.
5. `fsi-app/src/__tests__/market-signal-promotion.test.mjs` - run it, read it, confirm it already asserts
   the no-regression property.
6. `git log --oneline -- fsi-app/src/lib/market/signal-promotion.mjs` - name the commit hash and PR
   number for lane SURF in your report.
7. `fsi-app/src/lib/market/series-registry.mjs` and whichever existing component already reads
   `market_series` for a UI render (`MarketSeriesBoard.tsx` - read it in full) - the exact reader pattern
   `LeadTimeChart.tsx` must reuse, not reinvent, per the lane common contract's prior-art rule.
8. `fsi-app/src/components/market/CarbonCostOverlay.tsx`, IN FULL - the two passages you are correcting,
   confirmed by line number before you edit (line numbers may have drifted since this brief was written;
   locate them by the quoted text, not by the stated line numbers alone).
9. `fsi-app/src/components/market/MarketComparativeRibbon.tsx` and `fsi-app/src/app/market/page.tsx` - to
   determine the chart's mount point (see write set note above).
10. `docs/specs/02-market-intel.md` section 7 - confirm the SBTi minimum-sample threshold it names (or
    its absence - if the spec does not state one, say so and pick a conservative default, documented in
    your report, rather than inventing a number silently).
11. `docs/inventories/migrations.md` - confirm `market_series`'s current shape is unchanged by this lane
    (you touch no schema).

Report "read and reused" naming each file above and what you reused rather than reimplemented.

## Migration number

None requested; none needed (no schema touched; `LeadTimeChart.tsx` reads the existing `market_series`
table L11's producer writes to).

## Harness and flywheel wiring (rule 17: nothing runs alone)

The chip half verifies a pure client-side derivation with no harness family, as before. The chart half is
a pure read-time render against `market_series`; it has no harness family of its own (the SBTi producer,
L11, is the harness-bearing side of this pair). State explicitly that `LeadTimeChart.tsx` is a consumer
of L11's output, not a second write path, and name the exact column/key it reads (confirm against L11's
brief and the live `market_series` schema).

## R14 compliance

No data-population run of your own, no `--apply` path, no live DB write. $0: no network call, no LLM
call. `LeadTimeChart.tsx` reads only what L11's producer has already written; if L11 has not yet landed
live rows when you build this, the chart's own "not forecastable" state is exactly how it must render
against zero rows - that is the honest state, not a blocker to building the component itself (the
component and its data producer are two lanes, per the plan's own dependency framing).

## Tests, and the fire-once requirement

- `node --test fsi-app/src/__tests__/market-signal-promotion.test.mjs` - paste the pass count.
- `node --test` (or the project's `.tsx` test runner) for `LeadTimeChart.test.*` - paste the pass count.
  Negative test: fewer than the SBTi-minimum sample renders "not forecastable" explicitly, never a
  fabricated position (assert the render output, not just the absence of a crash).
- `cd fsi-app && node .discipline/rendering/run-rendering-guard.mjs` with both new/changed smoke specs
  temporarily registered, paste the "UX smoke specs:" line, then revert the registry edit before commit.
- "Test what you build": open the live `/market` route (and `/market/[slug]` for the chip) in a local dev
  server or the existing Playwright smoke harness; paste the rendered Status value (chip) and the
  rendered lead-time chart state (either a real position or the explicit "not forecastable" message) -
  not a description of either.

## UX compliance

Per the lane common contract's UX contract section, for each of the two renders you touch or add:
- **Chip** (unchanged render, verification only): primary goal is an honest promotion-state label; no
  primary action (read-only); no asynchronous state (static server-derived render).
- **LeadTimeChart**: primary goal is an honest comparative position or an honest "not forecastable"
  state, never a fabricated one; no primary action (read-only); no asynchronous state if the data is
  server-assembled like its sibling `CarbonCostOverlay`, confirm this against how the page actually feeds
  it the data and state the real shape, not an assumption.

## Dependencies

L11 (the SBTi producer populates `market_series` with the rows this chart reads). You may build
`LeadTimeChart.tsx` against fixture rows if L11 has not yet landed live data when you start (state this
plainly in your report), but the acceptance test against live data depends on L11's own acceptance test
having run first.

## Report format

Per the lane common contract's "Report" section: `git log --oneline origin/master..HEAD`, file-by-file
what was built, consumers checked (name them), the exact "Status" field value you observed live, the
exact lead-time-chart render you observed (live or fixture-based, state which), the corrected
`CarbonCostOverlay.tsx` passages quoted before and after, and whether the UX smoke specs already existed
or were added. State "the push gate ran clean" or name the exact failing step.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration file. No DB credential, no live write. No fabricated lead-time position
under any sample size - the "not forecastable" state is mandatory, not optional polish.
