## 2026-10-05, lane p1-source-rating-display: every item shows its source's rating and bias, correctly

CLAUDE.md rule 18 ("the surface shows the rating"), plan Stage 1 item S1-E. Facts below are things this lane ran or
read. Nothing was run against a live database (no network, no credentials in a worktree).

### Accomplished
- One customer tier rule: `fsi-app/src/lib/customer-source-tier.ts` returns `tier_override`, else `effective_tier`,
  else `base_tier` (migration 090's stated formula, SKILL.md Section 7). A value outside the tier vocabulary is
  treated as absent, never clamped. It also exports `SOURCE_TIER_MAX` and `tierScaleSpan`, both derived from
  `src/lib/tier-labels.ts`.
- Every customer loader that computed the tier inline now selects `tier_override` and calls the helper, in
  `src/lib/supabase-server.ts`: `enrichCategoryRows` (all four list pages and the dashboard), the item detail read
  `fetchIntelligenceItemUncached`, the watchlist tier read, and `fetchResearchPipelineRows`; and in
  `src/app/api/ask/route.ts`: the per-item line, the top-sources line and the citation `source_tier`.
  A test fails if either file inlines `effective_tier ?? base_tier` again.
- T7 shows as T7: `TierChip`'s default ceiling is `SOURCE_TIER_MAX` (7). Rows (ListRow), the ActionCard and every
  other default caller follow. The detail rail legend and the dashboard legend are built by `tierScaleSpan`, so
  they now end at "T7 news / commentary".
- Per-claim tier on brief-grade facts: new `ClaimTierProvider` (in `ui/FactCard.tsx`) carries the surface's existing
  claim-tier map; `FactCard` resolves its claim through `withClaimTiers` (`lib/detail/fact-card-model.ts`). All four
  detail surfaces wrap their content in it. Operations detail now runs `fetchClaimTierMap` in its route page (it had
  no call before) and passes `claimTiers`. A card with no grounded rated source shows the Absence part in the tier
  slot (dash form, "needs primary-source figure" on aria-label and title), never a guessed tier.
- Bias for customers: new part `ui/BiasChips.tsx` (+ `lib/credibility/bias-display.mjs` model). Detail: the primary
  source on the ActionCard ("Primary source" row) and the matching Sources grid row show up to three chips and one
  disclosure button for the rest. Rows (all four lists, the dashboard): up to two chips plus a visible "+N more" count
  on the meta line; on the phone the same chips sit on their own line at the foot of the row (the meta line is hidden
  below 768px). Research list rows now load bias (`fetchResearchItems` and `fetchPublicResearchItems` enable
  `enrichBiasTags`); the dashboard enables it through `enrichRowSourceChips(..., { enrichBiasTags: true })`.
  A tag below 0.80 confidence reads "<label> . lower confidence" in words. The Research page renders the real bias
  vocabulary legend (`BiasLegend`); the legend no longer passes an empty list.
- The item detail read now returns `biasTags` of the primary source (one bounded read inside the existing parallel
  batch). `sourceEntriesOf` gives the item's own source row (matched by canonical url, else name) the customer tier
  and the bias; other entries are untouched.
- Dedupe: three copies of the source_bias_tags grouping loop became `groupBiasTagsBySource` (F45 now measures
  5352 against a base of 5379).

### Read and reused
Read in full: COMMON.md, p1.md, CLAUDE.md, the lane common contract, ux-laws.md, design-principles.md, the register
Q4 to Q7, the source-credibility-model skill, `tier-labels.ts`, `ui/Chips.tsx`, `ListRow.tsx`, `ActionCard.tsx`,
`FactCard.tsx`, `Absence.tsx`, `SourcesGrid.tsx`, `DetailShell.tsx` (legend), `fact-card-model.ts`,
`fact-paragraphs.ts`, `load-detail-core.ts`, `parse-record-sections.ts` (header and match rule), the loaders named
above, `list-row-fields.ts`, `brief-rows.ts`, `src/app/page.tsx`, `research/page.tsx`, the four ledgers, the four
detail surfaces and the operations route page, `CredibilityChip*.tsx`, `chip-selection.mjs` (+ test),
`bias-tag-pipeline.mjs`, `credibility-grade-modifiers.mjs`, the tier-override route, `recomputeEffectiveTier` in
`trust.ts`, the S1-B log, spec 00 section 3.2, spec 03 section 4, the rendering harness and the 23 UX smoke specs.
Reused instead of built: `TagChip` (the chip), `selectBiasChipsForDisplay` (the bound), `HIGH_CONFIDENCE_THRESHOLD`
and `BIAS_TAG_VOCAB` (confidence line and vocabulary), `Absence`, `fetchClaimTierMap` (per-claim read, unchanged),
`canonicalizeUrl`, `enrichCategoryRows`, `enrichRowSourceChips`, `FactCard`'s existing `TierSquare`, ImpactMeter's
esbuild + `renderToStaticMarkup` test pattern.
Why the CredibilityChip parts were not reused: `CredibilityChipEvidence` and `CredibilityChipAuthority` are the
evidence x agreement and source authority scores (spec 03 section 4), each a 44px button that prints a needs-phrase
when it has no data. They cannot sit in a row's meta line and cannot honour "render nothing when absent".

### Decisions
- Per-claim rule untouched (`tier_override ?? base_tier`, never effective_tier, migration 145).
- Brief-grade claims have no byte-identical line to match (record-grade ones do). The match is by normalised
  containment, minimum 24 characters, and a card whose text matches claims grounded in different sources gets no
  tier. Record-grade cards (`recordGrade` on the model) are never re-matched: their exact-line rule stands. This is [HYPOTHESIS] against live data: the claim_text shape was read from `parse-output.ts` and the
  ledger prompt in `canonical-pipeline.ts`, not from rows.
- A row's chips carry no control (a row is one click target); the disclosure exists on detail surfaces only.
- ClaimTierProvider (context) instead of a prop through `FactBlocks.tsx`, which is not in this lane's write set.
- F28: none of the edited files is a governing file of any harness family (checked against
  `GOVERNING_FILES`), so no pending marker is owed.

### Measured (headless Chromium, the repo's own harness, fixture data)
- Rows at 375 px (Regulations ledger fixture), row height: no bias 84 px; five tags 129 px (+45); one lower-confidence
  tag 121 px (+37); three lower-confidence tags 157 px (+73). The bias group is 246 px wide (the row's content width),
  the rightmost chip edge is 300 px, the 44 px control gutter starts at 306 px. No horizontal overflow.
- Rows at 1280: 57 px with and without bias; meta text keeps its width. At 1024: five tags fit in full; three
  lower-confidence tags make the chips ellipsise (meta text 36 px). At 768 (the tablet grid, title column 169 px):
  chips ellipsise hard (first chip 48 px, second 37 px, "+3 more" 47 px).
- Detail at 375: ActionCard bias group 317 px wide, 82 px tall closed, 109 px open; Sources grid group 291 px wide,
  82 px closed, 122 px open; disclosure button 62 x 28 px (87 x 28 open). At 1280 the button is 8 px clear of the link.
- All 23 registered UX smoke specs, run through a scratch runner (not the full guard): 402 checks, 0 failures. The
  specs mount a T7 source and the five-tag worst case on every ledger, the dashboard, the four detail surfaces and
  the ActionCard.

### Red then green
- `customer-source-tier.test.mjs`: the loader-routing test failed against the old loaders (red), then passed.
- Old tree (stashed, rendered): `TierChip tier=7` printed T6, `ActionCard tier=7` printed T6, a brief-grade FactCard
  rendered no tier square and no Absence part, a tier-less Sources row rendered no Absence part. New tree: T7, T7,
  tier square when grounded and the Absence part when not, Absence part.
- Four existing structural tests asserted the old shapes and were updated to the new contracts
  (`FactCard.npmtest.mjs` x2, `SourcesGrid.npmtest.mjs` x2).
- New: `customer-source-tier.test.mjs` (8), `bias-display.test.mjs` (11), `fact-card-model.test.mjs` +9,
  `source-rating-display.npmtest.mjs` (20 render proofs). 733 related tests passed in one batch.

### UX compliance
- Row (all four lists, dashboard). Goal: see how far to trust the item's source and open the item. Path: read the
  row, one tap anywhere on it. One primary action: open the item (the whole row is the link, unchanged). The bias
  chips are static text, no control, so nothing competes. Feedback: none (no async action). Law 2: no new target.
  Law 12: the group ellipsises on one line (tablet) or wraps whole chips (phone); measured above.
- ActionCard bias row and Sources grid chips (four detail pages). Goal: judge the primary source's lens at a glance.
  Path: it is on the first card, one read. One primary action unchanged (Export brief). The "+N more" disclosure is
  a quiet text button, 28 px high with 8 px clear of other targets, `aria-expanded`, toggles in place (immediate
  feedback, no async work). The control sits outside the Sources link, never nested in an anchor.
- Fact card provenance (brief-grade). Goal: see what rated source backs a claim. Path: read the provenance column.
  A missing rating is an explicit dash with the reason on aria-label/title, in the tier square's own slot, so the
  column keeps its four-line budget.
- Research page legend. Goal: learn the bias vocabulary. Renders the stored vocabulary, grouped; no action.

### DESIGN CHANGES OWED (for Claude Design, rule 20; no artboard draws any of these)
- Artboards 01 (dashboard), 02 (regulations list), 04 (market list), 06 (research list), 08 (operations list): the
  row's meta line gains the source's bias chips (two plus "+N more"); at 375 px the row gains a third line for them.
- Artboards 03, 05, 07, 09 (detail): the ActionCard gains a "Primary source" bias row under the pill row, and the
  Sources section draws bias chips under the matching source.
- Artboard 21c (fact card): the provenance tier slot shows a dash when the claim has no rated source.
- Artboard 06 (research list): the credibility legend gains the source bias vocabulary legend.

### NOT done (each with its reason)
- (Closed after coordinator ruling on PR 944.) `ListSurfaceRailCards.tsx` legend now uses `tierScaleSpan`; a grep of src/components and src/app finds no other customer text naming T6 as the top of the scale. The F25 `LEGACY_ALLOWLIST` entry for `chip-selection.mjs` is deleted: the operator ruling it cited ("wire selectBiasChipsForDisplay elsewhere") is closed by this PR, which wires it through `bias-display.mjs`. [NOT-WORK: fact, no action]
- Operations matrix fact cards now show the source's customer tier (or the Absence part): the existing `source:sources(...)` join in `fetchOperationsCoverage` selects the three tier columns, `source_tier` is mapped through `customerSourceTier`, `RegionDimensionMatrix` passes `sourceTier`, the matrix `FactCard` draws it. No new query. Tests: a rated and an unrated fact in `source-rating-display.npmtest.mjs`. [NOT-WORK: fact, no action]
- Sources grid entries other than the item's own registered source carry no bias and keep the tier the brief text
  was written with: the parsed list has no source id. What would supply it: a loader read of `intelligence_item_citations` (item to source ids, migration 089) joined to `sources` and matched to each entry by canonical url, in `fetchIntelligenceItemUncached`, plus a typed field on Resource. [WORK: DFIX-2]
- At 768 to 1023 px the title column is narrow (169 px at 768), so row chips ellipsise heavily; the count stays. [REFUTED: PAR-1 (2026-10-07) replaced the 768 to 1023 grid with the stacked row; measured in Chromium on PR 1059, title 627 px at 768 and no clipped chip at 768, 900, 1023, 1024, 1100]
- Claim matching against live rows is unverified (see Decisions). No live read was possible. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
- `ProvisionalReviewCard.tsx` and the admin parts pages were not touched (no new part had to be shown there). [NOT-WORK: fact, no action]

### Open items
- None blocking beyond the two expansions above. [NOT-WORK: fact, no action]
