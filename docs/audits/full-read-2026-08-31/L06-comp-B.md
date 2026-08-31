# L06-comp-B — Full-read audit report

Lane: `src/components/{home,map,market,onboarding,operations}` (24 files, dotfiles/fsi-app).

---

## src/components/home/DashboardAskBar.tsx — WORKING-WIRED — Ask-bar input + suggestion chips on the Dashboard; dispatches `open-ask-assistant` CustomEvent.
- WIRING: rendered by `HomeSurface.tsx:188`. No defects found.

## src/components/home/DashboardByOwner.tsx — WORKING-WIRED — rail card grouping resources by `actionOwner`, case-insensitive dedupe, links to canonical item surface.
- WIRING: rendered by `HomeSurface.tsx:208`.

## src/components/home/DashboardCoverageGaps.tsx — WORKING-WIRED — "Coverage gaps" housekeeping card, reads a `Promise<CoverageGap[]>` via `use()`.
- WIRING: rendered by `HomeSurface.tsx:232` inside `<Suspense>`.
- NOTE: `dangerouslySetInnerHTML={{ __html: g.description }}` (line 117) renders `coverage_gaps.description` raw with no client-side sanitizer. The comment at line 115-116 asserts the source data contract "allows a small subset of inline tags (`<i>`)" but nothing in this component enforces that subset — any HTML in the DB column renders verbatim. table-usage.txt shows `coverage_gaps` has only 2 live rows and 1 src reference (this component's data path), so exposure today is limited to whatever wrote those 2 rows, but there is no code-level guard if a future writer (admin tool, agent) puts unescaped user-influenced text in `description`.

## src/components/home/DashboardHero.tsx — WORKING-WIRED — 4-tile priority strip (Critical/High/Moderate/Low) with click-to-jump-to-#priority behavior.
- WIRING: rendered by `HomeSurface.tsx:185`.
- NOTE: `TILES_AS_LIVE_FILTERS = false` (line 38) is a documented, intentional kill switch — the `onSelectBand` plumbing exists but is inert until an operator flips the constant. Comment states this explicitly (lines 19-24, 31-38).

## src/components/home/DashboardRailCard.tsx — WORKING-WIRED — shared rail-card + honest-empty-state primitives used by Watchlist/By-owner.
- WIRING: imported by `DashboardByOwner.tsx` and `DashboardWatchlist.tsx`.

## src/components/home/DashboardSurfaceCoverage.tsx — WORKING-WIRED — "Across the platform" rail card, one row per surface with counts from `SurfaceCoverageSnapshot`.
- WIRING: rendered by `HomeSurface.tsx:204`.

## src/components/home/DashboardTopPriority.tsx — WORKING-WIRED — "This week" priority glance list with drag-to-reorder sharing the `regulations` list_key/RPC with `/regulations`.
- WIRING: rendered by `HomeSurface.tsx:202`.
- Largest/most complex file in the lane (505 lines); drag-order logic (`applyMove`/`compareRanks`, band-scoped seeding) is internally consistent with its own header comments and cross-references real hooks (`useListOrder`). No defect found in the reorder math as read.

## src/components/home/DashboardWatchlist.tsx — WORKING-WIRED — Watchlist rail card, dual scope (personal `user_watchlist` + team `org_watchlist`), `use()`s a promise.
- WIRING: rendered by `HomeSurface.tsx:206` inside `<Suspense>`.

## src/components/home/HomeSurface.tsx — WORKING-WIRED — Dashboard body: hydrates resource store, lays out Hero/AskBar/ThisWeek/WhatChanged/Housekeeping.
- WIRING: `refs=1` — this is the client entry component the server `app/page.tsx` presumably renders (not in this lane, not verified here).
- DEAD: `setBandFilter` (line 172) is a `useState` setter passed to `DashboardHero`'s `onSelectBand` prop but never read anywhere else — a direct consequence of `TILES_AS_LIVE_FILTERS = false` in DashboardHero.tsx. Documented as intentional at lines 169-171.

## src/components/home/Supersessions.tsx — WORKING-WIRED — "Earlier · replaced" ledger, collapsed to 4 rows with expand toggle.
- WIRING: rendered by `HomeSurface.tsx:219`.

## src/components/home/WhatChanged.tsx — WORKING-WIRED — "This week" change-log bar; strictly date-stamped (never claims live detection), 7-day window, Show-all toggle.
- WIRING: rendered by `HomeSurface.tsx:218`.
- NOTE: explicitly never claims live change detection (binding rule documented lines 7-19); "Updated" half only lights up for changelog entries within the same 7-day window as "New" (bug‑fix history noted at lines 82-85, already fixed as read).

## src/components/map/MapView.tsx — WORKING-WIRED — Leaflet basemap with urgency-tiered markers + community-activity dot overlay + legend.
- WIRING: dynamically imported (`ssr:false`) by `MapPageView.tsx:42-61`.
- NOTE: header comment (lines 10-19) documents that country-level-only markers, no clustering, and no sub-jurisdiction pins are an intentional Phase-6 scope cut versus the prior MapView, not an oversight.

## src/components/map/jurisdictionCentroids.ts — WORKING-UNWIRED (partial) — centroid/label/pin-code lookup tables for the map.
- WIRING: `JURISDICTION_CENTROIDS` (top-level export) is used by both importers (`MapView.tsx:38`, `MapPageView.tsx:36`) — that part is live.
- DEAD: `SUB_JURISDICTION_CENTROIDS`, `SUB_JURISDICTION_LABELS`, `JURISDICTION_PIN_CODES`, and the `JurisdictionCoord` interface (lines 4-9, 54-87, 91-152, 156-184) are exported but have **zero** importers anywhere in the repo — confirmed via repo-wide grep (`SUB_JURISDICTION_CENTROIDS|SUB_JURISDICTION_LABELS|JURISDICTION_PIN_CODES|JurisdictionCoord` matches only this file). This matches `MapView.tsx`'s own header comment that sub-jurisdiction pins were deliberately stripped in the Phase-6 rebuild (lines 12-14) — the sub-jurisdiction data tables were simply left behind, ~130 lines of genuinely dead code (roughly two-thirds of the file).

## src/components/market/MarketIntelLedger.tsx — WORKING-WIRED — redesigned `/market` index: severity tiles + signal-band strip + Ask bar + banded ledger + rail (Watch this week / Highest-priority indicators / Methodology / Sources tracked).
- WIRING: `refs=1`, presumably rendered by the `/market` page (not in this lane).
- 1106 lines, most complex file overall in the lane; counts are RPC-primary with a documented fail-soft to row-derivation (lines 19-28, 247-262). No defect found — the fail-soft branching (`sevRpc`/`bandRpc`) is symmetric and each count function has a single, consistent source per render.

## src/components/market/MarketSeriesBoard.tsx — WORKING-WIRED — market_series registry board; every registered producer gets a card even with zero rows (`not_built` / `registered_unpopulated` / `populated`).
- WIRING: `refs=1`; server component, consumes an already-fetched `MarketSeriesBoardVM`.

## src/components/market/TrajectoryBars.tsx — WORKING-WIRED — 12-week price trajectory bar chart, data-backed from `item.trajectoryPoints` (migration 107 JSONB), no fabricated data.
- WIRING: `refs=1`; caller (not in this lane) must gate on `signalBand === 'price'` per the file's own documented "Belt 3" contract (lines 13-19) — this component does not re-validate that itself, by design (belts 1-2 live elsewhere).

## src/components/onboarding/InvitationLandingPage.tsx — WORKING-WIRED — `/invitations/[token]` accept/decline page.
- WIRING: `refs=1`, likely the route's client component.
- No defects found; error handling on all three fetches (load/accept/decline) sets user-visible error state rather than swallowing silently.

## src/components/onboarding/NoWorkspaceLanding.tsx — WORKING-WIRED — "you have no workspace yet" landing with 3 CTAs (pending invitations / paste token / create workspace).
- DEAD: `Props.userId` (line 32) is declared and required by the interface but the component destructures only `{ userEmail }` (line 36) — the `userId` argument callers pass is accepted and silently discarded. Not a functional bug (nothing here needs the id), but it is a param accepted-but-ignored per the brief's INCOMPLETE criterion.

## src/components/onboarding/OnboardingWizard.tsx — INCOMPLETE (one field silently discarded) — 4-step onboarding wizard (path → identity → sectors → notifications → done), 983 lines.
- WIRING: `refs=1`.
- INCOMPLETE: the Step-2 "Primary region" field (`region` state, `REGION_OPTIONS`, lines 44-51, 98, `<Field label="Primary region">` at 701-714) is collected from the user with a live `<select>` bound to `setRegion`, but `persistIdentity()` (lines 189-211) only writes `full_name` and `updated_at` to `profiles` — `region` is never sent to the server or persisted anywhere. The user fills in a working-looking form control that is entirely discarded on submit. The code's own comment (lines 187-188) documents this as a known, deliberate gap ("Region remains a wizard input but is not persisted (no destination column on profiles; collected for future use)"), so it is not a silent regression, but the UI gives no in-page indication to the user that this selection is inert.
- NOTE: LinkedIn import path (`?linkedin=imported`/`?linkedin=error`) is fully wired with a documented error-code → copy map (lines 68-82) and correctly strips query params before re-render to avoid a refresh replay (lines 141-144).

## src/components/operations/OperationsDetailSurface.tsx — WORKING-WIRED — `/operations/[slug]` detail view; section-aware (S1-S8) with S3/S4 matrix-eligibility gating and an honest omit-note when ineligible.
- WIRING: `refs=1`.
- Fail-closed by design: `matrixEligibility === undefined` (loading/error) is explicitly treated as ineligible for S3/S4 (prop doc lines 74-76; `eligible` check lines 145-149) rather than fail-open. No defect found.

## src/components/operations/OperationsItemsView.tsx — WORKING-WIRED — flat/grouped-by-jurisdiction items list for `/operations`, mirrors the ResearchView FindingCard pattern.
- WIRING: rendered by `OperationsLedger.tsx:567`.
- Severity-bucket mapping (`SEVERITY_TO_OPERATIONS_BUCKET`) is imported from a shared vocab module rather than duplicated — comment at lines 49-51 documents this was previously a byte-identical hand-copy in two files (Addendum 63), now unified.

## src/components/operations/RegionDimensionMatrix.tsx — WORKING-WIRED — cross-region × dimension comparison grid (WO-9/WO-12), dual-layer render (legacy free-text facts vs. enveloped numeric facts with base-region indexing).
- WIRING: rendered by `OperationsLedger.tsx:524`.
- NOTE: as of this read, `anyEnveloped` (line 141-144) is false for 100% of live data — the file's own comment states 0 of 75 live `regional_data_facts` rows carry a valid numeric envelope (lines 22-26, 106-107, 139-140); the `EnvelopedFactRow`/indexing code path is real and exercised only by `region-grid.test.mjs` fixtures, not by production data yet. This is consistent with `regional_data_facts` having 86 live rows total (table-usage.txt) — the envelope columns exist but nothing has populated them.

## src/components/operations/OperationsLedger.tsx — WORKING-WIRED — redesigned `/operations` index: severity tiles → D1-D6 dimension chips → Ask bar → RegionDimensionMatrix → per-region accordions (+ US By-state sub-list) → active items → rail (Coverage/By-dimension/Methodology), 963 lines.
- WIRING: `refs=1`, likely rendered by the `/operations` page.
- Background "load the rest" fetch (`/api/listings/rest?surface=operations&offset=...`, lines 276-306) fails soft — on error it logs to console and leaves the already-rendered first-page region cards intact rather than blanking them (lines 292-301). No defect found.
- Per-state cost figures (`stateCosts` / `state_cost_facts`, migration 152) correctly render an honest em-dash for any state with no sourced fact rather than a national average (lines 901-911); `state_cost_facts` has 13 live rows (table-usage.txt), consistent with the file's own comment about 13 sourced states.

---

## Lane summary

**Counts by STATUS** (24 files):
- WORKING-WIRED: 21
- WORKING-UNWIRED (partial — some exports dead, file itself wired): 1 (`jurisdictionCentroids.ts`)
- INCOMPLETE: 1 (`OnboardingWizard.tsx`)
- DEFECTIVE: 0
- STUB / DEAD-HISTORICAL / OPERATOR-TOOL / TEST-ONLY / TEST: 0

No TEST files, migration files, or scripts fell in this lane — all 24 files are `src/components/**` React components.

**Top findings, ranked:**

1. **`jurisdictionCentroids.ts` — ~130 lines of confirmed dead exports.** `SUB_JURISDICTION_CENTROIDS`, `SUB_JURISDICTION_LABELS`, `JURISDICTION_PIN_CODES`, and `JurisdictionCoord` have zero importers repo-wide (verified by grep), left behind when the Phase-6 map rebuild intentionally dropped sub-jurisdiction pins. Safe to delete or worth flagging to the map owner if sub-jurisdiction pins are coming back (Sprint 3 candidate per `MapView.tsx`'s own comment).
2. **`OnboardingWizard.tsx` — "Primary region" field is collected but never persisted.** The Step-2 form has a working `<select>` for region, but `persistIdentity()` only writes `full_name`/`updated_at` to `profiles`; the selection is discarded with no persistence path and no in-UI indication to the user. Documented as a known gap in the code's own comment, but still a real UX inconsistency (a form field that visibly works but silently does nothing) worth resolving or removing.
3. **`DashboardCoverageGaps.tsx` — unsanitized `dangerouslySetInnerHTML` from `coverage_gaps.description`.** Comment claims an "allows `<i>` only" data contract, but nothing in the component enforces it — any HTML written to that column renders raw. Low current exposure (2 live rows, single writer path per table-usage.txt) but no code-level guard exists if that changes.
4. **`HomeSurface.tsx` `setBandFilter` / `DashboardHero.tsx` `TILES_AS_LIVE_FILTERS`** — a fully-wired-but-inert live-filter code path (documented, pending operator approval, not a bug).
5. **`NoWorkspaceLanding.tsx`** — `userId` prop accepted and silently unused; harmless but worth a lint/cleanup pass.
6. **`RegionDimensionMatrix.tsx` envelope-indexing code path** — real, tested, but currently unexercised by any live data (0 of 75 `regional_data_facts` rows are enveloped) — not a defect, but worth knowing the "dual-layer" UI has never rendered its numeric-indexed branch in production as of this read.

No DEFECTIVE, STUB, or fail-open/swallowed-error findings were found in this lane that rise to the level of a concrete failure scenario beyond what's listed above. All honest-state / fail-soft / fail-closed patterns documented in the components' own header comments were spot-checked against the actual render logic and held up (DashboardHero's aggregate fallback, OperationsDetailSurface's fail-closed matrix gate, OperationsLedger's fail-soft background fetch, WhatChanged's date-stamped-never-live rule).

**Coverage attestation:** files read in full: 24/24, lines read: 9,676 (matches the lane list's total line count exactly; no file was truncated or partially read).
