## 2026-10-07, lane s8f2-statements-build: industry-level statements on the Operations list

Built to the coordinator's design in the S8-F2 brief (ADR-043: the statements replace the removed calculator; spec 04 sections 2, 3, 6, 9; rule 18; rule 19; ADR-024 decision 2). No database, no network, no migration, no API, no producer, no other surface touched. Everything below was run or read in this lane.

### Accomplished
- `fsi-app/src/lib/operations/statements.mjs` (new, pure): `buildStatements({ facts, regions, dimensions, baseRegionCode })` returns `{dimension, factLabel, sentence, components[], index?, absence?}` per (dimension, fact label) group, from `OperationsFact` rows only. Eligibility is an enveloped value (`isEnvelopedFact`) with origin class official, verified, partner or derived; two or more regions give the sentence, one gives the absence line "needs a second sourced region" and no sentence, none gives nothing. Regions follow display order, roster regions without a value are named at the end ("<Regions>: not available."), units stay native, and an index "(base <Region> = 100)" is appended per component only when every component shares unit and currency (`indexAgainstBase`).
- `fsi-app/src/components/operations/StatementsBlock.tsx` (new, render only): one `SectionCard` with `SectionHeading` "Statements" and the dek "What the held figures say across regions. Components shown; nothing estimated."; per statement the dimension kicker, the sentence (or the label plus the absence line), and one row per region component with `TierChip` (or the `Absence` dash when unrated), source name (linked when a URL exists), dataset ref, reference period, status flag (derivation and origin class labels) and as-at date. Phone (under 768 px): one bordered card per statement, component rows stacked. No disclosure exists, so there is no target to size beyond the source links (28 px min height, the FactCard value, measured clean by the guard). With no statements the block renders nothing.
- `OperationsLedger.tsx`: one mount, `<StatementsBlock>` directly below `RegionDimensionMatrix` in `aboveRows` (a fragment; the shell's flex column supplies the 16 px gap).
- `statements.test.mjs` (23 tests) and `.discipline/rendering/smoke/statements-smoke.mjs`, registered in `ux-smoke-specs.mjs`; F35 `ROW_COMPONENTS` carries `StatementsBlock.tsx`.

### Read and reused
Read: COMMON.md, the S8-F2 brief, the fact register (`industry-statements-design-2026-10-08.md` on PR 983's branch, in full), CLAUDE.md, `lane-common-contract.md`, `ux-laws.md`, `design-principles.md`, `region-grid.mjs`, `RegionDimensionMatrix.tsx` (all of it), `OperationsLedger.tsx`, `FactCard.tsx`, `Absence.tsx`, `Chips.tsx`, `customer-source-tier.ts`, `supabase-server.ts` (`OperationsFact`, `fetchOperationsCoverage`), `labour-chain.ts`/`LabourChain.tsx` and its smoke (pattern), `SectionCard.tsx`, `SectionHeading.tsx`, `ux-harness.mjs`, `ux-smoke-specs.mjs`, F35, `cross-page-smoke.mjs`, `vocabularies.mjs` (origin class), `envelope.mjs` (derivation labels, significant figures), the regional parsers' label templates.
Reused instead of built: `isEnvelopedFact`, `indexAgainstBase`, `formatEnvelopedValue`, `originClassLabel`, `originClassStrength`, `derivationLabel` (region-grid.mjs); `customerSourceTier` output as already carried on `OperationsFact.source_tier`; `TierChip`, `Absence`, `ABSENCE_TEXT_STYLE`, `SectionCard`, `SectionHeading`; `runUxSpec`. Not reused, and why: FactCard's private `TierSquare` and `TierAbsence` are not exported, `TierChip` is the exported tier square, so that was used.

### Decisions (each one a place the brief gave latitude or was silent)
- Base region. The matrix exposes no base state: its "Compare against" control was deleted and compare mode implies its base in `MatrixPanel` as the first region in column order carrying an enveloped fact. There is no state to lift into a prop, so `baseRegionCode` is an optional input and, when absent (as it is from the Ledger), `buildStatements` applies that same implied rule (first eligible component in display order). No second selector was added. The rule now exists twice (`MatrixPanel`, `indexGroup`); folding the matrix onto a shared helper needs `RegionDimensionMatrix.tsx` and `region-grid.mjs`, outside this write set.
- Label grouping. Live producers write labels as "<REGION> <dash> <description>", so a raw label never repeats across regions. The row's own region prefix is stripped (`humaniseFactLabel`), underscores become spaces, first letter capitalised; the group key is that text lowercased.
- Verdict words. A label carrying one (`VERDICT_PATTERN`: automate forms, hire/hires/hired, cheap/cheaper/cheapest, better, worse, superior, inferior, recommend forms, should, preferable) is never echoed: the whole group is withheld (the matrix still shows the fact). "Hiring" is not matched, it is a labour chain term.
- Index requires equal unit AND equal currency (stricter than `indexAgainstBase`, which checks unit only), is all-or-nothing per group, and is absent when the base region has no value in the group or the base is zero.
- A group with no eligible region yields no statement (the absence line is for exactly one).
- Where several facts of one region fall in one group the strongest origin class wins, then the later as-at date, then the better tier, so input order never decides.
- Values print through `formatEnvelopedValue`, so a statement and a matrix card round identically (a row with no `n_observations` rounds to one significant figure: 40.4 prints as 40). The index uses the held numbers, not the rounded text.
- Scope of the block: all roster regions and all six dimensions; the rail's Region and Dimension facets scope the matrix, not the statements.
- Absence wording uses `ABSENCE_TEXT_STYLE` with the phrase from the brief, because the closed `Absence` vocabulary has no such reason (RecalculationNotice and LeadTimeChart take the same route).
- Field labels are "Published by" and "Status flag", not "Source" and "Status": the rendering guard's placeholder-literal scan failed 8 of 24 checks on the bare header words (it is a header-literal list, `HEADER_LITERALS`).

### Coordinator rulings applied (PR 989 round 2)
- F45 (CI red, +18 duplicated lines): the source-name anchor typed in `FactCard.tsx`'s matrix card and again in `StatementsBlock.tsx` is now one part, `ui/SourceLink.tsx`, imported by both. Local F45 measure after the change: 5322 duplicated lines, equal to the CI base of 5322. Write-set expansion granted for FactCard.tsx.
- The implied-base rule exists once: `impliedBaseFact` in `region-grid.mjs` (first valid envelope in the order given, by reference), called by `MatrixPanel` (that one call site) and by `statements.mjs`. Test added in `region-grid.test.mjs`; the one `RegionDimensionMatrix.npmtest.mjs` source assertion that pinned the old inline expression now pins the helper call. Write-set expansion granted for region-grid.mjs and RegionDimensionMatrix.tsx.
- The earlier "NOT done" note about folding the matrix onto a shared helper is closed by the above.

### OWED TO THE PRODUCER WAVE (coordinator is designing it; not built here)
- Statements group by label text, which is right for today's rows (after the producer's own region prefix is stripped). The structural fix is a canonical measure key on `regional_data_facts` that producers write and statements group by, so two regions' differently worded labels for one measure can meet in one statement. Until it exists, groups across producers with different wording stay one-region and show the absence line.

### Evidence
- Red: `statements.test.mjs` before the module existed: 1 test, 1 fail (ERR_MODULE_NOT_FOUND on `./statements.mjs`). Green: 23 of 23 pass.
- Attack by mutation: with the verdict screen removed from `buildStatements`, the attack test fails (22 of 23); restored, 23 of 23. With the phone card rule and the empty guard removed from the component, `statements-smoke` fails 2 checks (phone borders 0px, empty renders a node); restored, 0.
- `statements-smoke.mjs` run on the real components in chromium: 24 checks, 0 failures at 375, 768, 1024, 1280 and the 1440 bounds sweep (law-2 targets, overflow, squeezed title, placeholder literals, plus the bespoke checks: absence line present, index text present, mixed-unit sentence carries no index, no verdict word renders, 6 component rows, rule-separated at 1280, one card per statement at 375, nothing rendered when no group is sourced).
- Neighbours re-run green: `operations-rows-smoke` 30 checks 0 failures, `ops-matrix-acceptance-smoke` 37 checks 0 failures, `labour-chain-smoke` 12 checks 0 failures, `OperationsLedger.npmtest` and `RegionDimensionMatrix.npmtest` 38 of 38, `F35-row-ux-coverage.test.mjs` 11 of 11, `npx tsc --noEmit` exit 0.
- Fixture dry run: with the live shape (the 75 legacy rows have no envelope; 14 official and 1 derived enveloped rows are recorded in the L13 log, `[HYPOTHESIS]` not re-queried), the Ledger would render statements only where two regions hold the same de-prefixed label. The BLS and Eurostat producers write different descriptions, so today most groups would show the one-region absence line or nothing. That is the honest result of the rule, not a defect.

### NOT done
- `RegionDimensionMatrix.tsx` was not changed to share the implied-base rule (outside the write set).
- No browser look at the live route (no database here); the layout was measured on fixtures only.
- The dimension facet does not scope the block (decision above); the coordinator may rule otherwise.

### DESIGN CHANGES OWED (for Claude Design; no artboard draws this block)
Component list to draw, cited by the Operations list artboard 08 position "below the matrix card, full width" (rule 20: the system need drove the build, the look is a first pass):
1. Block head: "Statements" (shared section head) plus the one-line dek.
2. Statement item: dimension kicker (small caps), one 13 px sentence (max 72 ch), then component rows; rule-separated rows on desktop, one bordered card per statement under 768 px.
3. Component row: tier square (or dash), region name (bold), formatted value, optional "index N", then a wrapping provenance line of five labelled fields (Published by, Dataset, Period, Status flag, As at).
4. Absence item: fact label (semi bold) over the small-caps line "needs a second sourced region", then the single component row.
5. The empty state is deliberately no block at all.

### UX compliance
- Screen/block: Statements block on /operations, under the Regions side by side matrix.
- Primary goal: read what the held, sourced figures say across regions and check what each sentence is made of. Path: zero steps (visible on arrival); one tap on a source name to open the source.
- Primary action: open a source (a link on the component row); there is no other control, and nothing opens or closes.
- Feedback states: no asynchronous action (computed at render from the page's existing facts). The empty state renders nothing; a one-region group states "needs a second sourced region"; a provenance field the row lacks says "not stated". Targets: source links are 28 px minimum height with clear space; the rendering guard measured no target below the floor at 375, 768, 1024 and 1280.
