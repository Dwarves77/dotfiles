# 2026-10-08 COV-1: coverage is a first-class, generated, customer-facing surface

Lane COV-1 (branch `lane/cov1-coverage-surface`, cut from origin/master `6028b228`). Brief: spec 00 section 4, VERIFY-1 register rows 00S4.

## Value Delivery Check

This lane's work DOES directly advance customer-facing value delivery.

Surface: all four intelligence surfaces (Regulations, Market Intel, Research, Operations) get a coverage denominator line and a link to the generated Coverage page; the portfolio-add flow (cross-cutting) gets a coverage line per result; Map's coverage rail gets a distinct error state. Community is human-operated and has no census, so it carries no line (recorded, not skipped). Intelligence Assistant and Onboarding are untouched. Coverage is NOT a sixth customer surface (PI-1): it is a generated page reachable from the five, with no content category of its own.

Dual posture: the matrix is platform-global and industry-agnostic (jurisdiction x data class x mode), so it serves current verticals and expansion users equally. No narrowing.

## Accomplished

- Vocabulary: `COVERAGE_STATE` (six states, six treatments) and `SUPPRESSION_REASON` added to `fsi-app/src/lib/contracts/vocabularies.mjs`, registered in `VOCABULARIES` (11 to 13). Four states carry the SDMX `OBS_STATUS` code that already existed (O, L, H, Q); the two that are missing from OBS_STATUS (not filtered in, error) carry `obsStatus: null`.
- Renderer: `components/ui/CoverageState.tsx`, ONE component, six treatments, three variants (block, inline, cell), unknown state renders the caller's fallback. Copy and action decisions live in `lib/coverage/coverage-state.mjs`.
- Surface: `/dashboard/coverage` (`app/dashboard/coverage/page.tsx`, `components/coverage/CoveragePageView.tsx`), generated from `getCoverageIndex` / `getCoverageEntries` through `lib/coverage/matrix-data.ts` (cached, first customer-path caller of the index), pure generator `lib/coverage/coverage-matrix.mjs`, injected-dependency loader `lib/coverage/load-matrix.mjs`.
- Export: `GET /api/dashboard/coverage/matrix` (`?format=csv` file download, `?summary=1` totals, default full matrix); client Blob download in `lib/coverage/client.ts` (no clipboard, no window.open).
- Request coverage: `POST /api/dashboard/coverage/request` writes one `coverage_gap` `integrity_flags` row (existing platform-flag channel, migration 048) via `lib/coverage/request-coverage.mjs` (SHARED-WRITER header), de-duplicated per open subject.
- Denominator lines: `components/coverage/CoverageDenominatorLine(.View).tsx` mounted in the `belowRows` slot of /regulations, /market, /research, /operations.
- Portfolio-add line: `PortfolioAddSearch.tsx` shows "Coverage for this: N of M catalogued <surface> instruments are dual-verified" per result, linked to the cell.

## Read and reused

Read in full before writing: `CLAUDE.md`, `docs/dispatches/lane-common-contract.md`, `docs/design/ux-laws.md`, DP-2 of `docs/design/design-principles.md`, spec 00 sections 3 and 4, `fsi-app/.claude/CLAUDE.md` (integrity-flags agent contract), `src/lib/coverage/index-data.ts`, `src/lib/contracts/vocabularies.mjs`, `src/__tests__/contracts-vocabularies.test.mjs`, `src/lib/coverage-gaps.ts` and `-rollup.ts`, `src/app/api/dashboard/coverage/entries/route.ts`, `components/admin/CoverageMatrixView.tsx`, `components/ui/{Absence,StateNote,Button,SectionCard,InlineErrorBanner}.tsx`, `lib/api/{route-guard,authed-fetch,rate-limit}.ts`, `lib/portfolio/client.ts`, `PortfolioAddSearch.tsx`, `ObligationRegisterFilterBar.tsx`, `RegionDimensionMatrix.tsx` (cell and panel regions), the five spec-09 panel views, `app/api/admin/sources/bulk-import/route.ts` (the integrity_flags insert idiom), `.discipline/shared-writer-registry.test.mjs`, `ImpactMeter.npmtest.mjs` (render-test idiom), `ActionRow.downloadMarkdownBrief` (Blob convention).

Reused instead of built: `getCoverageIndex` / `getCoverageEntries` (called, not changed); the `integrity_flags` coverage_gap channel and its `PlatformIntegrityFlagsView` reader; `requireUserRoute` / `rateLimitHeaders` / `withErrorCapture`; `authedFetch`; the Absence part's declared-dash form (`data-absence`, same JS-escape glyph) for the cell variant; `ABSENCE_TEXT_STYLE`; `StateNote`'s left-rule look; `Masthead`, `SectionCard`, `SectionHeading`, `RailCard`, `LIST_SURFACE_MOBILE_CSS`; the `belowRows` slot and ThemeStrip frame; the OBS_STATUS codes; TRANSPORT_MODES / `normaliseMode`; `surfaceOf`; the register page's masthead/grid frame.

## Decisions (each confirmed against the files, none a guess)

1. The two missing states are NOT added to `OBS_STATUS`. That vocabulary adopts SDMX letters ("adopt, do not invent"), and "not filtered in" and "error" are not observation statuses. They live in a separate `COVERAGE_STATE` table in the same file, same shape (code, label, order), with `obsStatus: null`. A test pins that the four SDMX-backed states point at real missing codes and that no letter is invented.
2. The matrix is AGGREGATES ONLY. The operator ruling of 2026-07-29 (cited in `app/api/coverage/entries/route.ts`) keeps catalogue ENTRIES (titles, identifiers, URLs) admin-only. The page, the routes and the loader expose counts per cell; a test asserts no entry field reaches the payload. `/dashboard/coverage` is authenticated, like every page not on the public list; making it reachable without sign-in would need `PUBLIC_ROUTES` in `lib/auth/route-policy.ts`, which is outside the write set.
3. Numerator = dual-verified (firm-core relevance AND identity verified) catalogued instruments; denominator = catalogued census instruments in the cell. The grounded verified-brief count is shown separately and never mixed in. Both definitions are printed on the page and carried in the CSV's definitions.
4. Mode axis (coordinator grant 2026-10-08, `index-data.ts`): `loadCoverage` now also selects `sources.transport_modes` and each `CoverageEntry` carries `modes`, the transport modes of the instrument's SOURCE as the registry tags them (empty when the source carries none, never guessed). An instrument whose source carries no mode sits in the `untagged` mode; the page states how many instruments are tagged ("N of M") and shows the "not covered" gap only while none is. The generator counts an instrument once per mode and once in the "all modes" cell. Proven by `index-data.npmtest.mjs` through the real loader with a fake client.
5. Data as-of (same grant): each entry carries `checkedAt` (`identity_checked_at`); the matrix's data as-of is the latest check date, and the page prints "not recorded by the index yet" only when no instrument has been checked.
6. Cell links are `?data_class=&geography=&mode=` (defaults omitted). A cell with no catalogued instrument is a real gap (the "not covered" state), never a zero.
7. Spec09 "No rows yet" panels (OEM roadmap, rerouting, indexation, auxiliary energy, grid queue) are switched to `not_covered` with their existing source-reason line kept as the gap text; the rendering guard's spec09 "No rows yet" count still holds.

## Call sites switched (every one keeps its previous render as the fallback for an unknown state)

| Call site | Was | Now |
|---|---|---|
| `market/OemRoadmapPanelView` empty | one muted sentence | `not_covered`, reason line kept, Request coverage |
| `market/ReroutingPanelView` empty | same | `not_covered` |
| `market/IndexationPanelView` empty | same | `not_covered` |
| `operations/AuxiliaryEnergyPanelView` empty | same | `not_covered` |
| `operations/GridQueuePanelView` empty | same | `not_covered` |
| `map/MapPageView` coverage rail "Coverage snapshot unavailable." | quiet sentence | `error` with Retry (reloads the page) |
| `regulations/ObligationRegisterFilterBar` zero rows under an active facet | fell into the "register is empty" message (misleading: it told a filtering reader the register held nothing) | `not_filtered_in` with Widen scope (clears every facet; plumbed through `ObligationRegister` and `ObligationRegisterPageView`); no hidden count is stated because the route returns the filtered total only |
| same file, register genuinely empty | muted sentence | `no_data_yet`, the explanatory sentence kept as its reason |
| same file, "Could not load more" / "Could not refresh" | orange sentence | `error` with Retry that repeats the call that failed |
| `research/ResearchLedger` source-coverage rail empty | "No coverage matrix populated yet." | `no_data_yet` |
| `operations/RegionDimensionMatrix` cell with no sourced fact | Absence narrow dash ("needs primary-source figure") | `not_covered` cell variant: the same declared dash, now stating which state and why on hover and to assistive technology |

Left on the Absence convention on purpose, recorded: `RegionDimensionMatrix` panel sentence and legend (a sentence the existing tests pin, and the legend must show the Absence glyph it explains); `ObligationRegisterFilterBar` Jurisdiction and Mode "needs ..." dashes (per-row missing values, pinned by `ObligationRegisterFilterBar.npmtest.mjs`); `DetailShell` / `SourcesGrid` / `primitives` / `FactCard` per-field Absence uses (a value absent from one record, not a coverage state; the Absence vocabulary owns it). The `suppressed` state has no live call site yet: nothing on the five surfaces withholds a value for confidentiality, k-anonymity or licence today; the renderer and tests exist so the first one cannot be built as a grey dash.

## Tests, red then green

- `contracts-vocabularies.test.mjs`: with the old `vocabularies.mjs` the import fails (`does not provide an export named 'COVERAGE_STATE'`); with the change 40 of 40 pass.
- New: `coverage-state.test.mjs` (10), `coverage-matrix.test.mjs` (18), `request-coverage.test.mjs` (6), `load-matrix.test.mjs` (4) under the no-npm `node --test` glob; `CoverageState.npmtest.mjs` (11), `coverage-views.npmtest.mjs` (13), `coverage-routes.npmtest.mjs` (11) under the npm-deps glob. Each new module's test fails to import against the tree without the module.
- `index-data.npmtest.mjs` (5): against the old `index-data.ts` 0 of 5 pass (no `transport_modes` in the select, no `modes` or `checkedAt` on entries); with the change 5 of 5.
- Existing tests re-run green with the edits: `RegionDimensionMatrix`, `ObligationRegisterFilterBar` and the other regulations/operations/market/research/portfolio/map npmtests (159), `viewer-read-only`, F41, `jurisdiction-iso-mapping`.
- `npx tsc --noEmit`: exit 0. `eslint` on every touched file: clean.
- Rendering: with a throwaway spec (not committed) the real components were mounted through `runUxSpec` at 375, 768, 1024, 1280 and the 1440 bounds sweep in 10 states (page, gap cell, present cell, error, empty matrix, denominator line, line error, the three Market empty panels, the portfolio line in three item kinds, all six states): `checks=50 failures=0`. The first run FAILED at 768, 1024 and 1280 (a long geography title squeezed under 60 percent of its card beside the cell chips); the row now stacks title above chips and the run is green.

## UX compliance

- `/dashboard/coverage` (Coverage page). Primary goal: see how much of a surface, place or mode the platform covers before relying on it. Path: arrive from a surface's denominator line already on that data class (1 step), or open the page and pick an axis (select, Show). One primary action per section: the matrix section's Download CSV; the selected-cell section's Request coverage when the cell is a gap. Feedback: Download shows "Preparing the file..." the moment it is pressed, then "Saved. The file holds <view>, with its version and dates in columns."; a failure states what went wrong and leaves the button in place. Request coverage shows "Requesting...", then "Requested. It is recorded in the coverage queue." (or "Already requested..."), a failure shows its message beside the button and the button stays. A failed read renders the error state with a Retry link to the same view. Every control is 44 px tall; geography rows stack title over wrapping chips so nothing overflows at 375.
- Denominator line (four list pages). Goal: see the denominator beside the count. Path: zero steps (it is on the page); one link, "See coverage". Primary action: the link. Feedback: server-rendered; a failed read is the error state with a Retry link to the page.
- Portfolio-add line. Goal: set expectations at commitment. Path: type, results appear with the line already under each; Add is unchanged and never waits on the line. Primary action stays Add. Feedback: if the summary read fails, one error state above the results with a Retry button.
- Six states (all call sites). Each states its own state word, a sentence, and its own action (request, widen, retry); Request/Retry/Widen are 44 px; the not-applicable and cell forms are the declared dash with the explanation on hover and aria-label.

## DESIGN CHANGES OWED (for Claude Design, cited by ruling; rule 20)

1. The Coverage page itself has no artboard. Built from existing parts (Masthead, SectionCard, RailCard) in the register-page frame; geography rows are wrapping flex rows (title over chips), not a table, so they hold at 375. Needs an artboard and a ruling on table vs rows at desktop width.
2. The six state treatments have no artboard. Built as the StateNote left-rule strip (block), the same words with no strip (inline) and the declared dash (cell); the error variant uses the error colour for the rule and the label. Needs a drawn treatment per state.
3. Per-cell "not covered" chips on the page use the dash form inside a link chip; the artboards' absence rule (README 0.4) names the narrow-cell dash but not a dash inside an interactive chip.

## Coordinator rulings applied (2026-10-08, after the first stop on rule 018)

1. Route: the page lives at `/dashboard/coverage` beside `/dashboard/portfolio`, authenticated; rule 018 untouched. Every link, the form action, the request subject refs and the API paths moved: `GET /api/dashboard/coverage/matrix`, `POST /api/dashboard/coverage/request` (the admin-only `/api/coverage/entries` is unchanged). "Publicly linkable" is a stable URL per cell, not anonymous access.
2. `src/lib/coverage/index-data.ts` (+ `index-data.npmtest.mjs`): modes and as-of, see decisions 4 and 5.
3. Committed UX smoke spec `fsi-app/.discipline/rendering/smoke/coverage-smoke.mjs` (10 states, 50 checks at 375, 768, 1024, 1280 and the 1440 sweep, 0 failures), registered in `ux-smoke-specs.mjs`, with the F35 `ROW_COMPONENTS` row for `src/components/coverage/CoveragePageView.tsx` (F35 run on its own: PASS). The spec failed on its first run (a long place name squeezed beside its chips at 768 and above); the row now stacks title over chips.
4. `route-policy.ts` untouched; the page stays authenticated.
5. Plumbing accepted as the brief implied, listed: `ObligationRegister.tsx` and `ObligationRegisterPageView.tsx` (carry `onWiden` to the filter bar), `PortfolioAddSearch.tsx` (the portfolio-add line and the exported `PortfolioCoverageLine`).
6. Counts per cell only: kept, asserted by tests that no entry field reaches the page or the routes.
7. Numerator definition: stated in one line in a closed methodology drawer on the page ("How these figures are made": a cell's figure is the catalogued instruments that are dual-verified over all instruments catalogued in that cell) and in decision 3 above. MKT-1's `SeriesProvenance` had not merged into origin/master when this was committed (`git grep SeriesProvenance origin/master` found nothing), so the drawer is a native, closed `details` element in the page's own type; swap it for that component once it lands.
8. `suppressed` with no live call site: left; `CoverageState.npmtest.mjs` covers it.

## CI follow-up: F23 on PR 1020 (coordinator grant: skill-map.mjs, one entry, not an exemption)

F23 `governed-surface-coverage` failed with "UNMAPPED WRITES: 1, ceiling 0"; `coverage-scan.mjs` named `fsi-app/src/lib/coverage/request-coverage.mjs`. The existing `integrity_flags` writers (those carrying `SHARED-WRITER: integrity_flags`) are governed as follows, [CONFIRMED] by reading `fsi-app/.discipline/governance/skill-map.mjs`: the two route writers `src/app/api/admin/integrity-flags/route.ts` and `src/app/api/admin/sources/bulk-import/route.ts` fall under the `caros-ledge-platform-intent` entry's `'fsi-app/src/app/', // any new page.tsx route` line; `src/lib/d3/hooks.mjs` under `remediation-discipline` (`'fsi-app/src/lib/d3/'`); `src/lib/sources/*` under `source-credibility-model`; `src/lib/agent/` and `src/lib/intake/` under `environmental-policy-and-innovation`. The request-coverage writer is the module behind a customer-facing route under `src/app/`, in the same position as the two route writers, and the workspace-layer writers `item-notes.mjs` / `item-assignments.mjs` (S8-A, "governed with the surfaces ... Mapped here, no exemption") are the precedent for a `src/lib` writer mapped there. One entry added under `caros-ledge-platform-intent`: `'fsi-app/src/lib/coverage/request-coverage.mjs'`. After the change `coverage-scan.mjs` reports GAPS 0 and `--function=F23` passes locally.

## NOT done (stated, each with its reason)

- `suppressed` has no live call site. `ObligationRegisterFilterBar` states no hidden count for `not_filtered_in` (the API returns the filtered total only).
- No live database read and no deploy: the page, loader and routes are proven on fixtures with injected dependencies (COMMON rule 5). The page has not been looked at in a browser against live data (definition of done item 4 is owed after merge). [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
- The SeriesProvenance swap in the methodology drawer (see ruling 7).
- Throwaway run scripts and their output (`fsi-app/scripts/tmp/cov1-*`) are gitignored and not part of the commit. [NOT-WORK: fact, no action]
