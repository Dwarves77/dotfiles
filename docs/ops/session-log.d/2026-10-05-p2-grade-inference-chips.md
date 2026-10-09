## 2026-10-05, lane p2-grade-inference-chips: grade chip returns, inferences reach customers, theme chips read as themes

Facts below are things this lane ran or read. Nothing was run against a live database (no network or credentials in a worktree).

### Accomplished
- Grade chip (plan Stage 8). `ListRow` takes `itemGrade`; "record" draws the one `GradeChip` on the meta line after the kind
  chip (desktop) and at the head of line 2 (phone, where the meta line is hidden); "brief" or absent renders nothing and
  the row is byte-identical to before (test). All four ledgers pass `itemGrade: r.itemGrade`. All four detail surfaces put
  the chip in the masthead's ActionCard pill row through its existing `extraChips`. It stays a neutral tag, never a tier.
- Inferences to customers (ADR-044 decision 3). New pure `src/lib/detail/inference-view.mjs` (+ test): the rules and the
  read (`readCustomerInferences`, fake-client tested). `fetchCrossPageForItem` (supabase-server.ts) resolves the item through the customer read gate and calls it. New `components/detail/InferenceSection.tsx`, rendered by `CrossPageSection` after the Across pages section.
  The inferences ride the existing cross-page read (`fetchCrossPageForItem` returns them beside the theme) and `CrossPageSection` renders the section, so there is one read site and one mount on all four pages. The section draws the existing `InferenceClaim` with use "display".
- Theme chips (item 3). `deriveThemeLabel` + `buildThemeChips` `label` in `theme-brief.mjs`; ThemeStripView and the
  dashboard theme rows show `label` and keep the pivot item's title as the link's title attribute.
- Coordinator item 5 (same PR). The item detail read loads the item's cited registered sources (one bounded join of
  intelligence_item_citations to sources, cap 50, then one bounded bias read grouped by `groupBiasTagsBySource`) onto
  `Resource.citedSources`. `sourceEntriesOf` matches every non-primary Sources entry by `canonicalizeUrl`: a match takes the
  customer tier (`customerSourceTier`, applied in the loader) and its BiasChips; no match, or no citations, is unchanged.
- UX specs: `inference-section-smoke.mjs` registered in `ux-smoke-specs.mjs`; F35 lists `InferenceSection.tsx`; the market
  rows spec fixture now carries record-grade rows (the other three already did); the two theme chip fixtures carry `label`.

### Read and reused
Read in full: COMMON.md, p2.md, CLAUDE.md, the lane contract, ux-laws.md, design-principles.md, the registers' Q4e, Q7c
and Q3, ADR-039 (a), ADR-044, migration 338, `InferenceClaim.tsx`, `drain.ts` Pass 2b, `load-detail.ts`, the four detail
route pages and surfaces, `shared-props.ts`, `CrossPageSection.tsx`, `fetchCrossPageForItem`, `Chips.tsx`, `ListRow.tsx`,
`ActionCard.tsx`, `theme-brief.mjs` and its test, `ThemeStripView.tsx`, `trigger-questions.mjs`, `learning/constants.mjs`,
`flag-namespaces.mjs`, `SourcesGrid.tsx`, the P1 log, F35, the smoke registry, `cross-page-smoke.mjs`, and L4-B's branch
(`infer-from-question.ts`) for the row shape (method id `infer-from-question`, `trigger_question_ref` = subject ref,
`computed_by` = batch name; nothing imported from it).
Reused: `InferenceClaim` and `admissibleForInference` (the one gate), `DetailSection`, `StateNote`, `readVerifiedItemsByIds`
(customer gate for cited titles), `itemIdColumn`, `PRODUCT_QUESTIONS`, `GradeChip`, `ActionCard.extraChips`,
`groupBiasTagsBySource`, `customerSourceTier`, `canonicalizeUrl`, `BiasChips`, the esbuild + renderToStaticMarkup test pattern.

### Decisions
- Inference read is a service-role server read in supabase-server.ts, no API route: every customer read of a guarded table
  (connections, themes, claims) is a server read in a loader, and a route would only add a public surface (migration 338's
  header said "a service-role API route", which no other customer read uses).
- "Current" means admissibility 'current' AND no other row names it in `supersedes` (a recompute inserts a new row that
  points at the old). [CONFIRMED by reading 338 and drain.ts] `/admin/inferences` filters `supersedes IS NULL`, which keeps the
  ORIGINAL rows and drops recomputed ones: a likely defect there, not touched (outside the write set), reported.
- ADR-039(a) filter: an ALLOWLIST of method ids (`infer-from-question`), so any other method is hidden until added on purpose.
- The question in words comes from the last segment of `trigger_question_ref` mapped to the four product questions; an
  unrecognised ref shows no question line.
- A citation the customer cannot open (not verified or archived) is dropped; an inference left with none is not shown.
- Cached item-scoped bundle (300s): a newly written inference can take up to that long to appear.
- Theme label rule: strongest dominant signal's plain phrase (else "N linked items"), then "across <pages>" or "on <page>";
  page names collapse to "across N pages" past 56 characters; the lead is cut at a word boundary if still over. A theme with a
  brief keeps the brief's title. No wording invented: the four signal phrases are the four signal names in plain words.
- F28: no edited file is a governing file of any harness family (grep of every `family.json`), so no pending marker.

### Red then green
- `grade-and-inference.npmtest.mjs`: on the old ListRow the record-grade row tests fail (no chip); on the old SourcesGrid the
  matched-by-url test fails. `inference-view.test.mjs`: red by missing module. `theme-brief.npmtest.mjs`: red by missing
  exports on the old module, 32 pass now. Rendering guard: first run FAILED `inference-section:extreme@375` (+358px
  overflow from an unbroken token); fixed with `overflow-wrap: anywhere` on each inference's wrapper; second run GREEN
  (`UX smoke specs: 24 ... ux checks: 411`, `rendering guard PASS`). `tsc --noEmit` clean.

### UX compliance
- Row grade chip (four ledgers). Goal: tell a catalogue record from a brief and open the item. Path: read the row, one tap
  anywhere on it. One primary action: open the item (unchanged). The chip is static text, no control. Feedback: none (no
  async action). Law 2: no new target. Phone: the chip sits at the head of line 2 so line 1 keeps its width.
- Detail masthead chip (four surfaces). Same: one static chip in the pill row beside the kind chip; no control.
- Inferences section (four surfaces). Goal: read what the system infers about this item without mistaking it for a fact.
  Path: scroll to the section, read question then claim. One primary action: none (read only); the cited titles are text.
  Feedback: none, no async action; the section renders nothing when there is nothing to show (no empty state to misread).
  Laws 4 and 17: question above its claim; status, origin, confidence and citations inside one card.
- Theme chips and rows. Goal: see what a theme is about and open it. Path: one 44px link. The label is bounded to 56
  characters so it no longer wraps as a citation. One primary action unchanged.
- Sources grid entries (item 5). Static chips outside the link as in P1; the existing disclosure button is unchanged.

### DESIGN CHANGES OWED (for Claude Design, rule 20)
- Artboards 01, 02, 04, 06, 08 (dashboard and the four lists): the row's meta line gains the "Catalogue record" chip after the
  kind chip; at 375 px it is the first item of the row's second line. (Dashboard rows: see NOT done.)
- Artboards 03, 05, 07, 09 (the four detail pages): the masthead pill row gains the "Catalogue record" chip after the kind chip.
- Artboards 03, 05, 07, 09: a new "Inferences" section after "Across pages": heading, a one-sentence note, then per inference a
  question line and the InferenceClaim card (status, origin, confidence, cited titles). No artboard draws it.
- Artboards 01 and the four list pages (theme strip and "Themes across pages"): a chip without a brief shows a derived label,
  not an item title.
- Artboards 03, 05, 07, 09 (Sources section): bias chips and the registry tier now also appear on cited sources other than
  the item's own.

### Round 2 (coordinator rulings on PR 947)
- F45 failed at 5387 vs base 5368 (+19). Located with a per-file diff against the base tree: 16 lines were the repeated detail-surface
  prop and mount run (destructure, `<InferenceSection .../>`, route-page reads) and 3 were `itemGrade: r.itemGrade,` joining the
  ledgers' repeated row-field run. Real extraction: the inferences now travel in `fetchCrossPageForItem`/`CrossPageSection` (the four
  pages, four surfaces and `shared-props.ts` revert to base, no new prop or mount), and the ledgers' value cells moved into one
  `rowValueFields` in `list-row-fields.ts`, also used by `toListRowFields`. F45 now 5339 vs base 5368 (measured with the F45 module).
- Dashboard rows carry the grade on both paths: `rowValueFields` (corpus path) and `RecentChangeRow.itemGrade` from the existing
  follow-up read (`item_grade` added to its select) for the degraded path; both ListRows in DashboardBrief pass it. Tests in
  `brief-rows.npmtest.mjs`.
- `THEME_COLUMNS` selects `dominant_signals`; the label rule's signal lead is live (mapping tested in theme-brief.npmtest.mjs and a
  source test in grade-and-inference.npmtest.mjs).
- OperationsItemsView deleted with its test, F35 entry, smoke mount, dead `.cl-ops-item-card` CSS and the comments naming it;
  severity-ui-bucket test 2 removed with the reason stated in the file (no live component has that property);
  `coverage-report.json` regenerated by `coverage-scan.mjs` (it also caught up entries other lanes had not regenerated).
  The name survives only in git history, session logs, docs/audits, docs/PROGRAM-BOARD.md, docs/plans, docs/dispatches,
  docs/ops audits and fsi-app/docs/design/redesign/DESIGN-DEVIATIONS.md (historical records, outside any grant).
- `/admin/inferences` now reads every row and applies `currentInferenceRows` (the rule shared with the customer read); tests cover an
  original, a recomputed chain and a refuted row. `InferenceReview.tsx` needed no change.

### Owed
- Migration (not this lane): GIN index for the customer containment read.
  `CREATE INDEX IF NOT EXISTS inference_records_cited_item_ids_gin_idx ON public.inference_records USING gin (cited_item_ids);`

### NOT done (each with its reason)
- PR 944's note stands: row chips ellipsise heavily at 768 to 1023 px (title column 169 px at 768). Not attempted: the grade chip is
  one short nowrap chip on the same meta line, so at that width it takes room from the bias chips and meta text. Not measured at those
  widths (the rendering guard measures 375 and 1280).
- Citation-title links: InferenceClaim prints titles as text; links need a change to InferenceClaim.tsx.
- The inference read is inside the cached 300s item bundle, so a new inference can take that long to appear. [NOT-WORK: fact, no action]

### Open items
- None. [NOT-WORK: fact, no action]
