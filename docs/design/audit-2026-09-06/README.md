# Caro's Ledge UI audit — 2026-09-06

Evidence package for the site-wide UI system overhaul. **Documentation only: nothing here
proposes a design.** Design decisions belong to Claude Design and the operator.

| File | What it is |
|---|---|
| `ASSESSMENT.md` | The assessment. Part A observation, Part B what is liked and why consistency governs, Part C session context and build gates, Part D findings from the full capture run. |
| `CONTACT-SHEET.html` | Every capture in order, labeled, defects noted per page, with a DO NOT USE panel. Open this first. |
| `captures/` | 110 frames. `<page>-<nn>.jpg` is scroll order, `<page>-<state>.jpg` is an interaction state, `-m` marks a 390px mobile frame. Downsampled to 1100px wide for storage; originals were 1440px. |
| `tokens.txt` | Real token values lifted from `fsi-app/src/app/theme.css`. |

## How it was gathered

Chrome, authenticated as owner/admin, 1440x840 viewport, 6 September 2026. Each page
navigated, allowed 10 seconds to render, captured top to bottom in overlapping scroll
frames. Interaction states captured by locating and clicking the control. Six agents
worked in parallel, each in its own browser tab. Limits are stated in `ASSESSMENT.md` §19.

## Superseded

`docs/design/redesign/` is a 2026-07 mock package the operator has discarded. Its README
instructs agents that "the mock wins". It does not. Ignore that folder. `theme.css` also
names an earlier `design_handoff_2026-04/DESIGN_SYSTEM.md`; also superseded.
