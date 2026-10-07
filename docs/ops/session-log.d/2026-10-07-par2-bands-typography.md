## 2026-10-07, lane par2-bands-typography: group headers, band tiles, detail typography, Connected intelligence rows

Claude Design look rulings on artboard 22 (rulings A, B, C of the lane brief). The handoff file `docs/design/handoff-2026-09-07/Caros Ledge UI System.dc.html` does not contain artboard 22 (grep for "Divergence board" and "0.5 New parts" returned 0), so this was built to the ruling text. Facts below were run or read in this lane. No database, no route, no migration touched.

### Accomplished
- A, group header: `BandSectionHeader` (ListSurfaceShell.tsx, now exported for the smoke mount) is white (`var(--card)`), 3px band rule on top, band name Anton 18px uppercase in the band colour, definition grey and truncating with its full text in `title`. The band-tint background, the 7px dot and the 11px label are removed.
- Anton site registered: CLAUDE.md Design System Anton list (one line, `fsi-app/.claude/CLAUDE.md`) and the layout guard L7 allowlist (`ANTON_ALLOWLIST` entry `band-group-name`, `data-guard-display="band-group-name"`). F49 only scans route page.tsx files, so it needed nothing.
- B, band tile: label and definition share one line (definition truncates, full text in `title`); numeral row is a fixed 34px box at every width (mobile keeps 30px type inside the 34px row); the 4px bottom rule stays pinned with `margin: auto`.
- C, detail section header: `DetailSection` reads the item band from `BandProvider` and sets `--cl-detail-head-tint` to `band.tintCssVar`; `globals.css` `.cl-detail-section-head` paints it and sets the title to 24px (inline 20px of the shared SectionHeader is overridden for detail sections only). No band context renders no tint.
- C, 02.x sub-sections: `GfmSection` h1 to h4 render as an uppercase 12px/800 label with a 2px rule (`--line-1`), body face.
- C, row titles 15px: `CrossPageSection` `ROW_TITLE` 12.5px to 15px (theme title override removed so it is also 15px).
- C, disclosures: the two `<details>` in `CrossPageSection` are rule-separated rows (1px `--line-2` above and below, no box, fill or radius).
- Smoke spec `par2-bands-smoke.mjs`, registered in `ux-smoke-specs.mjs` (one import and one entry line; the common contract says the coordinator registers, kept registered so the proof executes, revert the two lines if unwanted).

### Decisions
- Band colour on white at 18px Anton is used as ruled; contrast of the awareness green on white was not measured here.
- The 2px rule colour and the 12px label size for 02.x sub-sections are not stated in the ruling; chosen as `--line-1` and 12px/800/.08em.

### NOT done (decision-ready)
- "Body text in detail sections 14px, summary 15px": GfmSection body was already 14px; the S1 summary paragraph is rendered by each detail surface (RegulationDetailSurface, Market, Research, Operations), outside this write set. NEEDS WRITE-SET EXPANSION to set it to 15px.
- ItemGroup header (`ui/ItemGroup.tsx`) is still band tinted; it is not the list group header and is outside the write set. Ruling A's "tints stay only on" list does not name it. Question for the coordinator.
- The Connected intelligence "stated coupling" callout tint was not built: CrossPageSection has no client boundary and the callout needs the band context hook (a client component). Currently the stated coupling is a plain label plus text.
- `.discipline/rendering/audit/spec/bandtile.json` still describes the old stacked label; it is an audit measurement spec, not run by a gate, and was not regenerated.

### DESIGN CHANGES OWED (question for Claude Design)
- Artboard 22 is absent from the committed handoff file, so no frame was read. Please add it so the 02.x rule colour and label size can be confirmed.
- Band tile min-height is still 112px; with a one line label the tile has empty space above the rule. Ruling B states no height.

### Read and reused
Read: COMMON.md, par2.md, CLAUDE.md, lane-common-contract, ux-laws.md, design-principles.md, ListSurfaceShell.tsx (BandSectionHeader), BandTile.tsx, BandTileRow.tsx, DetailShell.tsx, SectionHeader.tsx, section-title-style.ts, band-context.tsx, GfmSection.tsx, CrossPageSection.tsx, ItemGroup.tsx, StateNote.tsx, DetailSubSection.tsx, SectionLabel.tsx, theme.css band tokens, globals.css, allowlists.mjs L7, cross-page-smoke.mjs, ux-harness.mjs, ux-smoke-specs.mjs. Reused: the band tint tokens (`tintCssVar`), `BandProvider`/`useBandContext`, the shared `SectionHeader`, `runUxSpec`, the cross-page smoke fixtures pattern, `BAND_ORDER`. Nothing new was built beside them.

### Evidence
- Red: `par2-bands-smoke.mjs` against the old src (with only the export added so it bundles): 96 failures (tinted group header, 30px numeral row, label and definition on two lines, no section tint, no disclosure rows). Green on the new src: 41 checks, 0 failures at 375, 768, 1024 and 1280.
- Measured: numeral row 34px on all four tiles, bottom rules at one offset; group header background rgb(255,255,255), top rule 3px, name 18px Anton equal to the rule colour; section header background equals the immediate tint, title 24px; disclosure rows have 0 radius, 0 side borders, transparent fill, 1px top and bottom.
- DetailShell (17), ListSurfaceShell (12), theme-brief-render (4), GfmSection (7), AntonTitleLetterSpacing (9), FactBlocks (5), grade-and-inference (19), band-tile-count-source (3), SectionRule.coverage (10) npmtests pass. `tsc --noEmit` clean.
- Rendering guard: PASS, UX smoke specs 26 (includes par2-bands), ux checks 605, layout guard 0 findings in the guard's own run.

### UX compliance
- Screen/block: list group headers, band tiles, detail section headers, 02.x sub-labels, Connected intelligence rows and disclosures.
- Primary goal: see which band a group or section belongs to and read the item list. Path: zero steps to read; one tap to filter by a band tile or open a disclosure or a connected item.
- Primary action: filter by band (tile) and open a connected item (row link); the disclosures are secondary and quieter (hairline rows).
- Feedback states: the tile and the disclosure toggle are synchronous (no async action added). A truncating definition keeps its full text in `title`. Targets: disclosure summary and row links keep their 44px minimum height; the rendering guard measured no target below the floor at the four widths.
