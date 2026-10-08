## 2026-10-08, lane smoke2-content-invariants: the live smoke proves content, not only status

Brief smoke2.md, common terms COMMON.md (source-loop wave). No database, no network, no sign-in: everything is proven on
fixtures and a stub browser. Branch `lane/smoke2-content-invariants`, cut from origin/master e23feb02.

### Accomplished
- New `fsi-app/.discipline/rendering/live/live-content.mjs` (pure, no imports): the content requirement table and its
  judgement. One named invariant per element, each requirement naming the page kind, the selector, the scope and the
  minimum content:
  - `content-grade-chip`: lists, any scope, `[data-part="chip-grade"]`, text length >= 8.
  - `content-bias-chips`: lists and details, any scope, `[data-part="bias-chips"]`, text >= 3, >= 1 `[data-bias-tag]`.
  - `content-tier-square`: every list page (each scope), details (any scope), `[data-part="chip-tier"]`, text matching `^T\d+$`.
  - `content-connected-intelligence`: details, any scope, `#across-pages`, text >= 60 matching "Connected intelligence",
    >= 1 `[data-guard-container="cross-page"]`.
  - `content-inferences-section`: details, any scope, `#inferences`, text >= 60 matching "Inferences", >= 1
    `[data-figure-kind="inference"]`.
  - `content-across-pages-rail`: the home page (each scope), `[data-audit="across-platform-card"]`, text >= 100 matching
    "Connected across pages", >= 5 `a[href]` (four surface stat links plus at least one theme link).
- `live-snapshot.mjs`: `collectContentInPage` / `collectContent` MEASURE visible matches only (a hidden desktop or phone
  copy is not content a customer receives); an invalid selector measures as no match and never throws.
- `live-assertions.mjs`: the six ids join `INVARIANTS`; `checkSnapshot` carries the per-page (`each`) findings.
- `live-smoke.mjs`: `runLiveSmoke({ contentChecks })` measures per page kind, collects the snapshots and judges the `any`
  scope once over the run (`checkContentRun`), per viewport. The CLI entry passes `contentChecks: true`. A kind with no page
  visited at a width is itself a failure; a kind whose pages all redirected to login is left to `session-invalid`.
- A missing element fails with the page path, the viewport and the selector, for example
  `FAIL content-inferences-section GET 200 /market/x :: detail page: missing Inferences section: expected 1+ visible #inferences ...`.
- Tests: `live-content.test.mjs` (17), `live-smoke-content.test.mjs` (5, the runner against a stub browser).

### Read and reused
Read in full: CLAUDE.md, lane-common-contract.md, COMMON.md, smoke2.md, `live-assertions.mjs`, `live-smoke.mjs`,
`live-snapshot.mjs`, `live-preflight.mjs`, both existing live tests, `smoke/live-smoke-fixture-smoke.mjs`,
`.github/workflows/live-smoke.yml`, `scripts/turns/emit-live-smoke-artifact.mjs`, the live-smoke `family.json`,
`overflow-rule.mjs` (collector entry), and the app sources that fix the selectors: `Chips.tsx` (GradeChip, TierChip),
`BiasChips.tsx`, `CrossPageSection.tsx`, `InferenceSection.tsx`, `InferenceClaim.tsx`, `DetailShell.tsx` (DetailSection),
`SectionCard.tsx` (`data-audit`), `DashboardBrief.tsx` (rail), `section-index-data.ts`, and the P2, S3-B and IDX-1 session logs.
Reused: the snapshot / pure-assertion split (`collectSnapshotInPage` -> `checkSnapshot`), `INVARIANTS`, `formatSummary` and
`buildReport` unchanged (the artifact emitter derives one metric per `INVARIANTS` value, so the six new ids flow into the
`live-smoke` harness-run artifact with no emitter edit), the existing `#across-pages` id the snapshot already used, the
exact `data-part` / `data-audit` / `data-figure-kind` hooks the components already render. No second copy of any selector.

### Decisions
- Conditional elements are `any` scope. A Catalogue record chip renders only for a record-grade item, bias chips only for an
  item whose source carries bias tags, Inferences only when an inference is customer-visible. The smoke account visits a
  small fixed item set, so asserting these on every page would fail on legitimate data; absent from EVERY visited page of
  the kind at a width is the defect. Always-rendered slots (list tier cell, the dashboard rail card) are `each`.
- The "Across pages rail" is the dashboard "Across the platform" rail card with its "Connected across pages" list. The
  Connected intelligence SECTION is a different element (detail pages, DOM id `across-pages`); both are asserted.
- `contentChecks` defaults to false in `runLiveSmoke` and is true in the CLI. Reason: the end-to-end fixture proof
  (`smoke/live-smoke-fixture-smoke.mjs`, outside this write set) serves pages with none of the six elements and expects its
  clean leg to be green, so a default of true would redden the rendering guard. See NEEDS WRITE-SET EXPANSION 2.
- Changed governing files of the live-smoke family: `live-assertions.mjs` and `live-smoke.mjs`. Per GATE-3 nothing is
  declared; the next run's `governing_hash` and the ledger record it. No `pending/` directory created.

### What is NOT done
- NEEDS WRITE-SET EXPANSION 1: `fsi-app/src/lib/detail/section-index-fixtures.ts`. The brief names "admin gallery fixtures
  for the two new tabs"; the register does not name them, but IDX-1's session log does: the `/admin/parts/section-index`
  body fixtures have no bodies for the Connected and Inferences tabs. The only gallery fixtures file is under `src/**`
  (`SectionIndexGallery.tsx` imports it), which the brief also lists as NOT mine. Staged edit: two entries appended to
  `SECTION_INDEX_BODY_FIXTURES`, ids `across-pages` (`S9 Connected intelligence`) and `inferences` (`S10 Inferences`), each
  with a one-sentence placeholder body, matching the existing entries' shape. Nothing in this lane touched it.
- NEEDS WRITE-SET EXPANSION 2: `fsi-app/.discipline/rendering/smoke/live-smoke-fixture-smoke.mjs`. Staged edit: pass
  `contentChecks: true` in `runFixtureLeg`; add the six elements to the clean `sitePages` (home rail card, list tier
  squares, a record chip, bias chips, the two sections) and omit them in the defective site; add the six ids to
  `EXPECTED_DEFECTS`. Until then the content invariants are proven by the pure and stub-browser tests only, not by a real
  chromium against a fixture server. The live run in CI (`live-smoke.yml`) uses the CLI and already has them on.
- The missing-credentials path is unchanged: `live-preflight.mjs` and the workflow's preflight step fail with exit 1 and a
  named `::error::` (not exit 2), and `main()` exits 2 only on a runner error. The brief says the skip convention "stays";
  what exists today is fail-fast, not skip. Not altered.
- No live run. Whether the six elements are present on production for the smoke account is unknown until the first CI run
  after merge; a red there is the gate reporting a real content gap (for example no customer-visible inference yet), not a
  selector fault, because each selector is the hook the component itself renders.

### Open items
- First live-smoke run with content checks on: read its report for any `content-*` line.
- Both expansions above, then the fixture smoke carries the end-to-end proof.
