## 2026-10-05, lane p3-live-defects: five production defects, fixed at their cause

Facts below are things this lane ran or read. The database was read only, through the existing read-only pattern
(scripts/lib/db.mjs readAll with loadLocalEnvFile semantics), with no write and no secret printed. Scratch scripts under
scripts/tmp/ were deleted afterwards.

### Accomplished
- Defect 1 (ledger text shown). Cause [CONFIRMED]: `parseAgentOutput` removed the Claim Provenance Ledger from the stored
  body only when the block PARSED. A block with invalid JSON (item 9d18608f, line 220; item 5e0af336, line 10) or a FACT
  with no span (item 58bf0406) made the strict locate throw, the catch fell back to "no claims", and the block stayed in
  the body, which became `full_brief` and was split into sections: the literal ledger sat in the last section (key 7 of
  9d18608f, rendered under Findings). Fix: new pure `src/lib/agent/claim-ledger-block.ts` (`stripClaimLedgerBlocks`,
  independent of validity: closed block, unclosed opener, stray closer) called by `parseAgentOutput` after the existing
  splice. Four tests in `parse-output.test.mjs` (valid unchanged; invalid JSON; FACT without span; unclosed opener).
- Defect 2 (strip overflows the phone). Cause [CONFIRMED by measurement]: `ThemeStripView`'s section is a flex-column item
  of the list shell with `margin: 0 auto`; an item with auto cross-axis margins is not stretched, so it sized to its
  content (six 260px cards) and `<main>` scrolled (old strip measured scrollWidth 1252 against clientWidth 359 in the
  smoke). Fix: `width: 100%`, `minWidth: 0`, border-box on the section, `maxWidth: 100%` and snap on the strip, the strip
  is a labelled focusable region; the next card peeks as the scroll affordance. The strip smoke now mounts the strip in
  the shell's real nesting and fails when `<main>` scrolls at 375 or when the strip does not scroll itself.
- Defect 3 (raw slugs and scores in the theme card). `ThemeBriefCard` meta states the live member count once and no
  density. New pure `src/lib/research/theme-brief-text.mjs` (+ test): the patterns are (A) the generator's bold stats
  header line, (B) "dominant signal weight N" (with a parenthesis that held only it), (C) "scores d.ddd" and bare
  three-decimal numbers in [0,1], (D) "density N" phrases, (E) known hyphenated tag slugs replaced by their label from
  `tag-labels.mjs`. `CrossPageSection` applies it to the title and `briefMd` only when the brief has no `sections` (a
  pre-contract brief); a brief with sections renders unchanged. The stale marker is untouched. Applied to all 9 stored
  briefs (read-only): 0 leftovers of those patterns. Prose counts such as "36 of 68 members" and "this theme's 57
  members" are analysis inside sentences and remain: pre-contract briefs are re-authored at population.
- Defect 4 (two tiers for one source). `sourceEntriesOf` drops the brief's parsed tier wording from an entry's meta text
  when a registry tier shows as the chip (the item's own source, or a cited registered source). With no registry tier the
  text stays and the chip slot shows the Absence part. Tests in `grade-and-inference.npmtest.mjs`.
- Defect 5 (bias chips twice). [REFUTED as a rendered duplicate] Mounted a `ListRow` with bias tags at 1280 and 375 in
  chromium: the DOM holds two mounts of `BiasChips` by design (`.cl-row-bias-desktop` in the meta line,
  `.cl-row-bias-mobile` on line 2), exactly one is visible at each width, the other is `display: none` (so it is out of the
  accessibility tree and out of `innerText`). `innerText` of the row shows each label once, upper case. The two mounts sit
  under different parents (meta line versus line 2), so keeping one needs a ListRow restructure, outside the write set and
  not needed. Nothing changed.
- Fact cards with neither tier nor absence. [CONFIRMED by rendering] Only the inference card (ANALYSIS) intentionally
  carries no tier ("not citable"). Every FACT and LEGAL card draws the tier square or the Absence dash (20x15px) in
  `ProvenanceBlock`, whatever its citation shape. No defect found. A sweep test was added to
  `source-rating-display.npmtest.mjs`.

### Item 1 counts (read-only, 2026-10-05)
- Stored sections containing the ledger marker: 4 sections, 4 items: 9d18608f-269e-405a-9ad8-afa638dda928 (section 7,
  market initiative, verified, customer visible), and 5511a87f-2bba-485a-9f54-6911ef385a63,
  27dfbe4c-f152-422e-8eb9-1e14d6e99a10, 4b342a31-623c-41e8-8b0b-0792101c8886 (section 15 each, quarantined, not customer
  visible).
- `intelligence_items.full_brief` containing the marker: 5 items: 27dfbe4c, 5511a87f (quarantined), 58bf0406-3be9-45bd-a2c8-b7c9d0b5c1a4
  (initiative, verified), 5e0af336-e997-47ae-a235-b7b155d742bb (market_signal, verified), 9d18608f (verified).
- The stored rows themselves are wrong: ledger text was persisted into a customer-facing section (9d18608f section 7) and
  into `full_brief` of three verified items. Repair step for the population stage: for each of the 5 ids, set `full_brief`
  to `stripClaimLedgerBlocks(full_brief)` and each of the 4 section rows' `content_md` to
  `stripClaimLedgerBlocks(content_md)`, through the guarded update path in `scripts/lib/db.mjs` (`guardedUpdateByIds`),
  then read back that no stored text contains "CLAIM_PROVENANCE_LEDGER". No data was edited by this lane.

### Coordinator rulings on PR 951 (applied)
- Expansion granted for `fact-paragraphs.ts` and `GfmSection.tsx`: both now run `stripClaimLedgerBlocks` on their markdown input, so a stored ledger block never renders whatever the data says (item 9d18608f section 7 stored shape, as a fixture, in `fact-paragraphs.test.mjs` and `theme-brief-render.npmtest.mjs`; both fail without the change).
- Defect 4, no registry tier: the tier parsed from the brief's own wording is not a rating (rule 18), so the chip slot shows the Absence part and the entry's text stays as written. The P1 and P2 assertions that kept the parsed chip were changed, each with a comment giving the reason (rule 18, 2026-10-05), in `source-rating-display.npmtest.mjs` and `grade-and-inference.npmtest.mjs`.
- The data repair step (5 full_brief rows, 4 section rows) runs at population.

### Owed
- `claim-ledger-block.ts` and lane GATES-2's `src/lib/agent/section-markers.mjs` must share ONE definition of the ledger marker. Not imported here (not on master); to be reconciled by whichever lane merges second.
- Design change owed (rule 20): artboard 07's CLUSTER SYNTHESIS meta line draws "density 0.180"; the system need removes it.

### Read and reused
Read in full: COMMON.md, p3.md, CLAUDE.md, the lane contract, ux-laws.md, `parse-output.ts` (ledger parts),
`canonical-pipeline.ts` (ledger prompt and grounding call), `parse-record-sections.ts`, `fact-card-model.ts`,
`fact-paragraphs.ts`, `FactBlocks.tsx`, `GfmSection.tsx`, `FactCard.tsx` (tier slot), `ThemeBriefCard.tsx`,
`ThemeStripView.tsx`, `ThemeStrip.tsx`, `CrossPageSection.tsx`, `SourcesGrid.tsx`, `extract-regulation-sections.ts` (sources
parser), `tag-labels.mjs`, `theme-brief.mjs`, `BiasChips.tsx`, `Chips.tsx` (TagChip), `ListRow.tsx` (bias mounts and CSS),
`DashboardBrief.tsx` (bias props), `cross-page-smoke.mjs`, `ux-harness.mjs`, `MarketSignalDetailSurface.tsx`.
Reused: the existing ledger locator (kept), `tag-labels.mjs` tables as the one slug source, the smoke harness
(`bundleEntry`, `newSmokePage`, `mountBundle`), the esbuild + renderToStaticMarkup npmtest pattern, existing P1/P2 Sources
tests as the home of the new Sources tests.

### Decisions
- Defect 4, no registry tier: superseded by the coordinator ruling above (no parsed chip; Absence part).
- Defect 3 applies the pass only to briefs without `sections`.
- F28: no edited file is a governing file of any harness family (grep of every `family.json`), so no pending marker.

### Red then green
- `parse-output.test.mjs`: the invalid-JSON, FACT-without-span and unclosed-opener tests fail on the old parser (the ledger
  text stays in the body), pass now (16 of 16). `theme-brief-text.test.mjs`: red by missing module, 8 of 8 now.
  `theme-brief-render.npmtest.mjs`: 2 of 3 fail on the old components, 3 of 3 now. `grade-and-inference.npmtest.mjs`: the
  two registry-tier tests fail on the old SourcesGrid, 19 of 19 now. Strip smoke (`cross-page-smoke.mjs` runSmoke): on the
  old strip 1 failure (`<main>` scrollWidth 1252 > clientWidth 359 at 375), on the new 0 failures over 29 checks.

### UX compliance
- Themes strip (four list pages). Goal: see the active themes and open one. Path: scroll the strip sideways inside itself,
  one tap on a card. One primary action: open the theme's item (unchanged, 44px link). Feedback: no async action; the next
  card peeks at the edge as the scroll affordance and the region is keyboard focusable with a label.
- Theme analysis block (four detail pages). Goal: read what the theme means. Path: read in place. Primary action: open a
  connected item (unchanged 44px rows). No async action; text only changed.
- Research rail cluster card and Sources grid rows. Goal: read the count and the source's one rating. No control added; no
  async action.
- Ledger render guard (same screens as above). Goal: read a section; no control, no async action; stored ledger text is removed from what is drawn.
