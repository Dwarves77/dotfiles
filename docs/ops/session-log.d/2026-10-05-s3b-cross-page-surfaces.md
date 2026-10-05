# 2026-10-05 s3b-cross-page-surfaces (lane S3-B)

Lane S3-B: intersections and theme analysis on every page. Branch `lane/s3b-cross-page-surfaces`, cut from
origin/master `08deba4f` (includes PR 937 intersections and PR 939 theme brief batches). No database, no
network, no data written; every read is fixture-proven or soft-failing.

## Accomplished

- One shared "Across pages" section, `src/components/detail/CrossPageSection.tsx`, mounted at the foot of the
  main column on all four detail pages (Regulations, Market Intel, Research, Operations). It renders nothing
  when it has no data.
  - Intersections: the item's own `intersection_summary` (stated coupling), then intersecting items on other
    pages grouped by page in page order, this page last. Strong and medium tiers inline; weak tier in a
    collapsed "Possible connections" group. Each row: title, link to that page's detail route, and the
    coupling in plain words from the scenarios and compliance objects by human label. No raw slug and no
    score or strength reaches the output (tested). No second fetch: the basis already rides on the
    `connections` that `fetchIntelligenceItem` loads (its select already carries `basis`), so that select was
    not extended.
  - Theme analysis: brief title; what it means; what follows on THIS page (only this page's `ramifications`
    subsection travels to the page); what to watch; the other members grouped by page with links (capped at 6
    per page with "and N more on <page>"); `connection` and `gaps` behind one disclosure. A stale brief says
    so in words and still shows. A brief with no sections shows its `brief_md`. A theme with no brief shows
    its members and the absence wording ("A brief for this theme has not been written yet..."). A structured
    brief with no subsection for this page says so.
- Brief lookup now goes through `resolveBriefForTheme` (new loader `fetchCrossPageForItem` in
  `src/lib/supabase-server.ts`, all briefs read with the three migration-351 columns and a fallback read of
  the base columns when they are absent, plus the latest run's `theme_delta` lineage). A drifted theme id
  finds its prior brief, shown stale. This replaces the Research detail page's exact-id lookup.
- `ThemeBriefCard` moved out of `ResearchFindingDetailSurface.tsx` to `src/components/detail/ThemeBriefCard.tsx`
  with its markup unchanged (the rail's Cluster synthesis pointer card stays on Research, see below).
- Themes on all four list pages: `ThemeStrip` generalised and moved to `src/components/shell/ThemeStrip.tsx`
  (presentational half `ThemeStripView` is `ThemeStripView.tsx`), mounted through each ledger's
  `belowRows` slot. Themes with at least one item on the page, most convergent first, each naming the pages it
  spans. A chip opens the highest-centrality member of the theme ON THAT PAGE (pivot rank, then title).
  What it linked to before: the theme's top pivot item on the pivot's own page, plus up to three other-member
  links; the three member links are kept. Members are classified by their own item type and domain
  (`surfaceOf`), not by `connection_themes.surfaces`.
- Dashboard: the "Across the platform" card gains "Themes across pages" (top 3 themes spanning two or more
  pages; brief title when a brief exists, else the pivot item title; pages spanned; links to the top pivot).
- One human-label source for tags: `src/lib/connections/tag-labels.mjs` (19 closed compliance objects, the
  scenario glossary, a humanising fallback for the open vocabulary). Drift tests read both vocabularies from
  their owning files as text.
- Pure view-models, all tested: `buildIntersectionView`, `couplingText`, `SURFACE_LABELS`, `SURFACE_ORDER`
  (`connection-view-model.mjs`); `buildThemeAnalysisView`, `buildThemeChips`, `selectThemeBriefForItem`
  extended with `sections` and `lineage` (`src/lib/research/theme-brief.mjs`).

## Read and reused

Read in full: the inventory sections Q4 and Q5; `docs/design/ux-laws.md`; `docs/design/design-principles.md`;
`lane-common-contract.md`; spec 00 section 6; `ItemConnectionsCard.tsx`, `connection-view-model.mjs`,
`pair-view.mjs`, `intersections.mjs`, `resource-lookup.ts`, `brief-staleness.mjs`, `theme-brief.mjs`,
`load-detail.ts`, `load-detail-core.ts`, the four detail surfaces' mount points and route pages, `ThemeStrip.tsx`
(old), `DashboardBrief.tsx` (card and props), `IntelligenceMetadataStrip.tsx`, theme-briefs README and
`schema.mjs`, `data.mjs`, migration 351, F35, `ux-assert.mjs`, `ux-harness.mjs`, the smoke registry.
Reused, not rebuilt: `isIntersectionEntry` (basis entry shape), `resolveBriefForTheme` and `lineageFromThemeDelta`
(continuity), `parseRamifications` and `SURFACE_HEADING` from the theme-briefs validator (so the reader and the
validator agree on a "### <Surface>" subsection; same src-imports-scripts precedent as `assess.mjs`),
`surfaceOf`, `buildResourceLookup` results (the customer read gate on titles), `DetailSection`,
`DetailSubSection`, `StateNote`, `GfmSection`, `SectionCard`, `ListSurfaceShell`'s existing `belowRows` slot,
`runUxSpec`. brief-candidates reads intersection detail through `basisDetailText` in `intersections.mjs`, which
is outside this lane's write set, so the new label source is not wired there.

## Decisions

- Placement: a main-column section on all four pages, not a rail card. The brief text is long and the rail is
  300px. The Research rail keeps the artboard's Cluster synthesis pointer card (the rendering audit, the layout
  guard manifests and `compose-07` measure that card's exact head and meta text, and manifests are not this
  lane's to edit). The section's own title is "Across pages", so the audit's single "Cluster synthesis" span
  count is unchanged.
- `IntelligenceMetadataStrip` and `SectorSynopsisView`: neither deleted, neither reused. Item 1 covers the
  strip's intersection block (summary and related items) but not its tag lists, severity and regeneration
  chips; `SectorSynopsis.tsx` is on F25's COMPONENTS allowlist as a decision still waiting, and
  `fsi-app/.claude/CLAUDE.md` says "DO NOT remove SectorSynopsisView" (shelved per-sector reporting, operator
  decision 2026-04-30). The strip is that view's child. Left for the operator's ruling on that shelf.
- Old strip query selected a column `type` from `intelligence_items`; the column is `item_type`.
  [HYPOTHESIS, not verifiable without the database] the old read errored and the strip rendered nothing. The
  rewrite uses `item_type`.
- Intersections with no classifiable page (`uncategorized`) or no gated title are dropped, never shown with a
  raw id.
- Registered the two new row components in F35 `ROW_COMPONENTS` and the new smoke spec in
  `ux-smoke-specs.mjs` in this lane (the write set lists F35 registration and the smoke specs; the contract
  text says the coordinator registers, so this is flagged for the coordinator's review).

## DESIGN CHANGES OWED (for Claude Design)

- Artboards 03, 05, 07, 09 (the four detail pages): no region draws an "Across pages" section (intersections
  grouped by page, collapsed possible connections, theme analysis with meaning, this-page ramifications, watch,
  members by page, a connection and gaps disclosure). Built as a main-column section with existing shell parts.
- Artboard 07 (Research detail): the Cluster synthesis rail card now sits beside the full analysis section; the
  design may fold the card into the section.
- Artboards 02, 04, 06, 08 (the four lists): no region draws a themes strip on Regulations, Market Intel and
  Operations (Research already carried one). Mounted at the foot of the content column.
- Artboard 01 (Dashboard): the "Across the platform" rail card gains a "Themes across pages" list.

## UX compliance

- Detail pages, "Across pages" section. Primary goal: understand what this item connects to on other pages and
  what that means. Path: scroll to the section (one step; it is the last section of the main column), read.
  One primary action: open a connected item (every row is one link of at least 44px). Secondary and quieter:
  two native disclosures ("Possible connections", "How the items connect and what is missing"), each with a 44px
  summary. Feedback: no asynchronous action; links navigate and the disclosures toggle natively. Absence is
  stated in words (no brief written, no ramifications for this page), never an empty block.
- List pages, themes strip. Goal: see which cross-page themes touch this page and open one. Path: one tap on a
  chip's title (44px target); other-member links are 24px targets with 8px clearance. One primary action: open
  the chip's item. Feedback: navigation only. The strip renders nothing when no theme touches the page.
- Dashboard, "Themes across pages". Goal: spot cross-page themes from the home page. Path: one tap on a row
  (44px). One primary action: open the theme's top item. Renders nothing when there are no such themes.
- Law 2: measured at 375 and 1280 by the new `cross-page` smoke spec (and `dashboard-brief`): 0 findings.

## Verification (confirmed this session)

- Red then green: `tag-labels.test.mjs` failed with module-not-found before `tag-labels.mjs` existed, passed
  after (6 of 6). The new `connection-view-model.test.mjs` cases failed with "does not provide an export named
  SURFACE_LABELS", passed after (20 of 20). The new `theme-brief.npmtest.mjs` cases failed with "does not
  provide an export named MAX_MEMBERS_PER_PAGE" then "buildThemeChips", passed after (27 of 27).
- `node --test` on the touched test files plus `brief-staleness.test.mjs`, `ItemConnectionsCard.npmtest.mjs`
  and `prose-renderer-scope.test.mjs`: 75 of 75 pass.
- `tsc --noEmit` clean; eslint clean on the new and changed components and `supabase-server.ts`.
- `run-rendering-guard.mjs` locally: PASS. `UX smoke specs: 23 (... labour-chain, cross-page)  ux checks: 392`;
  `layout guard: 36 route×width measurement(s), 0 finding(s)`.
- Harness governing files: none of the files this lane touches is in any family's governing list
  (`scripts/harness-runs/governing-files.mjs` checked), so no pending marker is owed and no `family.json`
  changed.

## CI fixes (PR 941, coordinator-approved)

- ESLint: unused `convergence` binding in `buildThemeChips` renamed to `_convergence` in the destructure (chip shape unchanged).
- F45 ratchet: reproduced locally, HEAD 5395 against base 5379. Per-file delta against the merge-base tree named
  exactly two files, 8 lines each: `OperationsDetailSurface.tsx` and `MarketSignalDetailSurface.tsx`, the identical
  run of shared props (supersessions, connections, relevance, resourceLookup, crossPage, the three watch flags).
  A first fix reordered props to dodge the detector; the coordinator rejected it and it was reverted. The real fix:
  `DetailSurfaceSharedProps` (`src/components/detail/shared-props.ts`) declares those eight props once and the
  Props of all four detail surfaces extend it (Regulations narrows its required ones). After: HEAD 5379, equal to
  base 5379, not below: the run was below the 8-line window before this lane added `crossPage`, so base had no
  such clone to remove, and the clones F45 still sees across the four surfaces predate this lane. Ceiling untouched.
  Detail, cross-page, parity and market raw-dump smoke specs pass locally.

## NOT done

- No live-data check: counts of themes, briefs, structured briefs and intersection entries on live rows are
  unknown to this lane; the section renders from whatever exists and nothing when empty.
- Browser look at the real routes (Definition of done item 4) is not done here: no dev server and no data.
- `brief-candidates.mjs` readable line not moved onto the label module (outside the write set).
- Strip and dashboard themes use the exact-id and overlap brief lookup; a theme found only through a
  pre-migration-351 lineage pair also resolves (lineage passed), but this was proven on fixtures only.

## Open items

- Ruling needed: the shelved `SectorSynopsisView` and `IntelligenceMetadataStrip` (see Decisions).
- Migration 351 must be applied for structured brief sections to show; until then a brief shows its
  `brief_md` (tolerated, tested).
