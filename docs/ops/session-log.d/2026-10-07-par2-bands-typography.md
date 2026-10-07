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

### Coordinator rulings applied (2026-10-07)
- Smoke spec registration in `ux-smoke-specs.mjs`: accepted, kept.
- S1 summary 15px (write-set expansion for the four detail surfaces, that one style only): the summary prose is now 15px in `RegulationDetailSurface` (BriefSummary short text), `OperationsDetailSurface` (S1 paragraph) and `ResearchFindingDetailSurface` (S1 trajectory sentence). `MarketSignalDetailSurface` S1 renders only FactBlocks and a StateNote, no summary paragraph, so nothing changed there.
- ItemGroup header (write-set expansion for ItemGroup and its spec): new shared `ui/BandGroupHeader.tsx` (white, 3px band rule, Anton 18 band name, grey definition truncating with `title`) now renders both the list band block header (`BandSectionHeader` is a thin wrapper) and the ItemGroup header (item title and qualifier inside it). One component, not two. Consequence: an ItemGroup header with a title now shows its band name (the 2026-09-25 "band tag once, in the masthead" pill suppression no longer applies to the header; the header gating, title or explicit band, is unchanged). `ItemGroup.npmtest.mjs` pill assertions were replaced by assertions on the shared header. Band name element keeps `data-part-slot="band-pill"` so the panel 21c acceptance hook still finds it. A narrow-width squeeze found by the smoke (title 125/359 px at 375) was fixed by letting the left cluster wrap and giving the title a 24ch basis.

- `parity-checks-smoke.mjs` check 1 (item groups render band-tinted) failed against the white ItemGroup header; its measure now accepts the 3px band rule on the shared header as the group carrying its band (the ACTION strip tint check is unchanged). Disclosed as a spec edit outside the literal grant, forced by the ItemGroup ruling.

- ImpactMeter (coordinator addition, write-set expansion for ImpactMeter.tsx and its tests): `ROW_VALUE_VISIBLE` and its comment are removed; `valueVisible` defaults to false, so the row variant renders the segments and the accessible label only. The legend and detail rail still pass `valueVisible`. `ImpactMeter.npmtest.mjs` now asserts the constant is gone; the impact-meter smoke message no longer names it.

### Decisions
- The 2px rule colour (`--line-1`) and the 12px/800/.08em label for 02.x sub-sections are my choices, kept per the coordinator; recorded below as a question for Claude Design.
- Band colour on white at 18px Anton is used as ruled; contrast of the awareness green on white was not measured here.

### NOT done (decision-ready)
- The Connected intelligence "stated coupling" callout tint is not built here. Reason: `CrossPageSection.tsx` has no client boundary (no "use client"), and the tint needs `useBandContext`, a client hook; making the callout a client component, or giving the file a boundary, is the coordinator's decision. Currently the stated coupling is a plain label plus text.
- `.discipline/rendering/audit/spec/bandtile.json` still describes the old stacked label; it is an audit measurement spec, not run by a gate, and was not regenerated.

### DESIGN CHANGES OWED (question for Claude Design)
- Artboard 22 is absent from the committed handoff file, so no frame was read. Please add it.
- 02.x sub-section label: what rule colour and label size does the artboard draw? Built as a 2px `--line-1` rule and a 12px/800/.08em uppercase label.
- Impact meter in the list row: 84px of segments plus an 8px gap plus about 20px of "N/12" does not fit the 88px impact slot, so the row shows no visible value. Which figure gives (segments, slot or value)?
- Band tile min-height is still 112px; with a one line label the tile has empty space above the rule. Ruling B states no height.
- The "stated coupling" callout on Connected intelligence keeps its band tint per ruling A, owed pending a client boundary decision (see NOT done).

### Read and reused
Read: COMMON.md, par2.md, CLAUDE.md, lane-common-contract, ux-laws.md, design-principles.md, ListSurfaceShell.tsx (BandSectionHeader), BandTile.tsx, BandTileRow.tsx, DetailShell.tsx, SectionHeader.tsx, section-title-style.ts, band-context.tsx, GfmSection.tsx, CrossPageSection.tsx, ItemGroup.tsx, StateNote.tsx, DetailSubSection.tsx, SectionLabel.tsx, theme.css band tokens, globals.css, allowlists.mjs L7, cross-page-smoke.mjs, ux-harness.mjs, ux-smoke-specs.mjs. Also read: ItemGroup.tsx and its npmtest, panel-21c-smoke.mjs and panel21c-accept.mjs, the four detail surfaces' S1 blocks. Reused: the band tint tokens (`tintCssVar`), `BandProvider`/`useBandContext`, the shared `SectionHeader`, `runUxSpec`, the cross-page smoke fixtures pattern, `BAND_ORDER`. Nothing new was built beside them.

### Evidence
- Red: `par2-bands-smoke.mjs` against the old src (with only the export added so it bundles): 96 failures (tinted group header, 30px numeral row, label and definition on two lines, no section tint, no disclosure rows). Green on the new src: 41 checks, 0 failures at 375, 768, 1024 and 1280.
- Measured: numeral row 34px on all four tiles, bottom rules at one offset; group header background rgb(255,255,255), top rule 3px, name 18px Anton equal to the rule colour; section header background equals the immediate tint, title 24px; disclosure rows have 0 radius, 0 side borders, transparent fill, 1px top and bottom.
- ItemGroup npmtest: 10 of 11 pass against the old ItemGroup, 11 of 11 against the new. DetailShell (17), ListSurfaceShell (12), theme-brief-render (4), GfmSection (7), AntonTitleLetterSpacing (9), FactBlocks (5), grade-and-inference (19), band-tile-count-source (3), SectionRule.coverage (10) npmtests pass. `tsc --noEmit` clean.
- Rendering guard: PASS, UX smoke specs 26 (includes par2-bands), ux checks 605, layout guard 0 findings in the guard's own run.

### UX compliance
- Screen/block: list group headers, band tiles, detail section headers, 02.x sub-labels, Connected intelligence rows and disclosures.
- Primary goal: see which band a group or section belongs to and read the item list. Path: zero steps to read; one tap to filter by a band tile or open a disclosure or a connected item.
- Primary action: filter by band (tile) and open a connected item (row link); the disclosures are secondary and quieter (hairline rows).
- Feedback states: the tile and the disclosure toggle are synchronous (no async action added). A truncating definition keeps its full text in `title`. Targets: disclosure summary and row links keep their 44px minimum height; the rendering guard measured no target below the floor at the four widths.
