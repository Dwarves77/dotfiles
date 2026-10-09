## 2026-10-07, lane par1b-meter-spec: the impact meter to Claude Design's exact spec

Claude Design ruling 2026-10-07 on the twelve segment meter built by PAR-1 (PR 969). Facts below were run or read in this lane. No database, no route touched.

### Accomplished
- `fsi-app/src/components/ui/ImpactMeter.tsx` row variant: segments 5 x 12, radius 1, gap 1.5 within a group, 4 between groups, total 84 (12 x 5 + 8 x 1.5 + 3 x 4), all as exported constants plus `ROW_SEGMENTS_TOTAL_PX`. Value gap `ROW_VALUE_GAP_PX = 8`.
- Empty segment colour: no token matched #E5E1DB in theme.css or globals.css, so `--cl-impact-track: #E5E1DB` was added to the `:root` line in `fsi-app/src/app/globals.css`; the component uses `var(--cl-impact-track)`, no raw hex.
- Unscored: twelve dashed outlines plus the dash, accessible label "Impact not scored" unchanged; no word renders.
- Visible value, per coordinator ruling 2026-10-07: `ROW_VALUE_VISIBLE = false` (exported, with a comment citing the ruling). New prop `valueVisible` defaults to it. The list row (ListRow.tsx, untouched) therefore shows segments only; the value stays in the accessible label ("Impact N of 12"). The legend card (`ListSurfaceRailCards.tsx` `LegendRailCard`) and the detail rail (`DetailShell.tsx` `ImpactRailCard`) pass `valueVisible`, drawing "N/12" 8 px right of the segments. The unscored dash is gated by the same flag (it occupies the same value slot).
- Legend prose in DetailShell.tsx and DashboardBrief.tsx already reads "one meter of twelve segments, filled left to right; the number beside it is the score, out of 12", which stays true (the legend card shows the number); unchanged.
- Smoke spec `impact-meter-partial-smoke.mjs`: asserts 5px x 12px segments, bars and meter width 84 or less at 375, 768, 1024 and 1280, and no visible value in the list row. ListRow grid untouched (3 / 56 / 1fr / 88 / 84 / 76 / 40 / 44).

### NEEDS WRITE-SET EXPANSION (used under the coordinator ruling, disclosed)
- One line in `fsi-app/src/components/list-surface/ListSurfaceRailCards.tsx` (`<ImpactMeter total={8} valueVisible />`), because the ruling says the legend shows the figure and the legend meter lives there.

### DESIGN CHANGES OWED (question for Claude Design)
- The ruling puts segments at 84 px and the value 8 px to their right, inside an 88 px slot. 84 + 8 + about 20 (the "8/12" figure at 11px tabular) is about 112 px against 88. The list row's impact cell is `overflow: hidden` (ListRow.tsx), so a visible value would clip. Which gives: the value (hidden, current), the 84 px segments, the 88 px slot (widen the track and shrink the 1fr), or the 8 px gap (stack the value)? Answer is a one-line flip of `ROW_VALUE_VISIBLE` if the value is to show, or a ListRow grid change otherwise.

### Read and reused
Read: COMMON.md, par1b.md, CLAUDE.md, lane-common-contract, ux-laws.md, design-principles.md, ImpactMeter.tsx and its npmtest, impact-meter-partial-smoke.mjs, PAR-1's session log, globals.css and theme.css tokens, ListRow.tsx grid and impact cell, all ImpactMeter consumers. Reused: PAR-1's exported geometry constants, `Segments`, `Absence`, `rampColor`, the existing smoke slot and the `UX_VIEWPORTS` loop.

### Evidence
- Red: new ImpactMeter.npmtest.mjs against the old (3 px) component: 8 failed, 18 passed. Green on the new component: 26 of 26.
- ListRow (33), DetailShell (17), ProvisionalReviewTable (9), source-rating-display (23) npmtests pass. `tsc --noEmit` clean.
- Rendering guard: PASS; impact-meter-partial smoke slot green (SM smoke checks 459, 0 failures) at all four widths; UX smoke specs 25, 564 checks.

### UX compliance
- Screen/block: impact meter in list rows, legend rail card, detail impact rail card.
- Primary goal: read the impact total of an item at a glance. Path: zero steps (visible in the row or rail).
- Primary action: none (display only, not interactive; no target added, law 2 not engaged).
- Feedback states: none asynchronous. Unscored shows dashed outlines (and the dash where the value shows); absence is carried in the accessible label.
- Laws applied: 12 (simple shape), 16 (one meter implementation everywhere), 4 (value beside segments where there is room).

### NOT done
- The visible list-row value, pending the design answer above. [NOT-WORK: operator item, recorded on the board]
