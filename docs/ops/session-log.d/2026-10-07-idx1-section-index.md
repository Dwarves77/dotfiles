## 2026-10-07, lane idx1-section-index: fixed section ordinals on every detail surface, and the cross-page section named for what it holds

Operator rulings 2026-10-07 (brief idx1.md). Nothing touched a database, a route or a migration.

### Accomplished
- The cross-page section header is now "Connected intelligence" (`CrossPageSection.tsx`), its index tab "Connected",
  and the dashboard rail list label is "Connected across pages" (`DashboardBrief.tsx`, that one string only). No
  "Across pages" header remains in rendered text. The section's DOM id stays `across-pages` (the live snapshot script
  `.discipline/rendering/live/live-snapshot.mjs` queries it, and an id is not a header).
- `section-index-data.ts`: `REGULATION_SECTION_INDEX` carries fixed `ord` 1 to 10 (Summary, Obligations, Requirements,
  Registration, Operations, Compliance, Penalties, Sources, Connected, Inferences). The `related` entry and its stale
  comment are deleted. New pure helpers: `regulationSectionOrd`, `connectedSectionOrd`, `inferencesSectionOrd`,
  `crossPageIndexEntries`. Market, Research and Operations keep 01/02/05/06 and gain 07 Connected and 08 Inferences.
- `sectionOrdinal()` in `RegulationDetailSurface.tsx` read the array position, not `ord`. It now is
  `regulationSectionOrd`, the fixed ordinal. Proven: an item without Penalties numbers Sources 08, not 07.
- `crossPagePresence()` (exported from `CrossPageSection.tsx`) decides whether Connected and Inferences render, using
  the same `buildIntersectionView` and `pickVisibleInferences` + `admissibleForInference` gates the render uses, so a
  tab is listed exactly when its section exists. All four surfaces call it for their `indexEntries`.
- Section headers carry the same fixed ordinal as the tab: `CrossPageSection` and `InferenceSection` pass `index`.

### Read and reused
Read: COMMON.md, idx1.md, CLAUDE.md, the lane common contract, `section-index-data.ts` and its test, `SectionIndex.tsx`,
the four detail surfaces, `CrossPageSection.tsx`, `InferenceSection.tsx`, `inference-view.mjs`, the section-index and
cross-page smoke specs, the live smoke fixture, `grade-and-inference.npmtest.mjs`, `DashboardBrief.tsx` rail block.
Reused: `DetailSection`'s existing `index` prop, `SectionIndex`'s existing `ord` support, `buildIntersectionView`,
`pickVisibleInferences`, `admissibleForInference` (the one conversion, now exported as `inferenceClaimOf`).

### Evidence, red then green
- `node --test src/lib/detail/section-index-data.test.mjs`: against the old data file the new test fails at import
  (no `connectedSectionOrd` export); with the change 7 of 7 pass.
- `node --test src/components/detail/grade-and-inference.npmtest.mjs`: against the old `CrossPageSection.tsx` and
  `InferenceSection.tsx`, 4 tests fail (header, Inferences ordinal, presence, wiring regex); with the change 22 of 22.
- `npx tsc --noEmit`: clean. `node .discipline/rendering/run-rendering-guard.mjs`: PASS, 25 UX smoke specs including
  section-index (now asserts 10 links), detail-surfaces and cross-page, at 375, 768, 1024 and 1280.

### Decisions
- Header ordinals: the Connected and Inferences headers show S9 and S10 on Regulations, S7 and S8 on the other three.
- Market's S6 header was "Connected · related <band>", which collided with "Connected intelligence". Coordinator ruling
  2026-10-07: it now reads "Related" (aside carries the band label), matching its tab. No test pinned the old header.
- WRITE-SET NOTE: `InferenceSection.tsx` (index prop, exported `inferenceClaimOf`) and `grade-and-inference.npmtest.mjs`
  (pins the old header and the wiring regex) were edited though not named in the write set; accepted by the coordinator.

### What is NOT done
- Stale "Across pages" comments in seven files were reworded to "Connected intelligence" (comments only, per coordinator). [NOT-WORK: fact, no action]
- The admin gallery `/admin/parts/section-index` body fixtures (`section-index-fixtures.ts`) have no bodies for the two
  new tabs. Not in the write set.

### DESIGN CHANGES OWED (Claude Design, artboards 03, 05, 07, 09; rule 20)
Final tab list per surface, ordinals fixed, a section the item does not carry is omitted, never renumbered:
- 03 Regulations: 01 Summary, 02 Obligations, 03 Requirements, 04 Registration, 05 Operations, 06 Compliance,
  07 Penalties, 08 Sources, 09 Connected, 10 Inferences. No Related (Connections are in the masthead).
- 05 Market Intel: 01 Summary, 02 Findings, 05 Sources, 06 Related, 07 Connected, 08 Inferences.
- 07 Research: 01 Summary, 02 Findings (not on record-grade items), 05 Sources, 06 Related, 07 Connected, 08 Inferences.
- 09 Operations: 01 Summary, 02 Findings, 05 Sources, 07 Connected, 08 Inferences.
Section header "Connected intelligence", aside "Intersections and theme analysis"; dashboard rail list "Connected across
pages". The strip may scroll inside its own box at 375 (it already does).

## UX compliance

Blocks touched: the section index tab strip on the four detail surfaces and the two trailing section headers.
- Primary goal: jump to any section of the item being read.
- Path in steps: one click on a tab. No step added.
- One primary action: jump to the section (the tab link). The Summary | Full switch stays the quiet secondary control.
- Feedback state per async action: none, tabs are anchor links; the active tab follows the existing scroll spy.
- Touch targets: unchanged tab links; the guard asserts the floor at 375, 768, 1024 and 1280.
- Text: tab labels never truncate (short names at most 14 characters); the strip scrolls inside its own box only.
- Row components: none added.
