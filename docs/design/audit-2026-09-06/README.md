# Caro's Ledge UI audit — 2026-09-06

Evidence package for the site-wide UI system overhaul. **Documentation only: nothing here
proposes a design.** Design decisions belong to Claude Design and the operator.

| File | What it is |
|---|---|
| `ASSESSMENT.md` | The assessment. Part A observation, Part B what is liked and why consistency governs, Part C session context and build gates, Part D findings from the full capture run. |
| `CONTACT-SHEET.html` | Every capture in order, labeled, defects noted per page, with a DO NOT USE panel. Open this first. |
| `captures/` | 161 frames, **all at desktop width**. `<page>-<nn>.jpg` is scroll order, `<page>-<state>.jpg` is an interaction state, `<page>-d<nn>.jpg` is a deeper second-pass scroll. Downsampled to 1100px wide for storage. |
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

## There are no mobile frames

A 390px capture run was attempted and failed: the browser tool's `resize_window` reports
success but never changes the rendered viewport (`window.outerWidth` moved to 390 while
`innerWidth` stayed at 1568). The 51 files it produced were desktop captures and are named
`-d`, not `-m`. **Nothing in `captures/` is a mobile screenshot.** `ASSESSMENT.md` §29-31
documents mobile from source instead: the drawer nav is implemented, but only 27 of 160
`.tsx` files carry any responsive rule and none of the data components do.
