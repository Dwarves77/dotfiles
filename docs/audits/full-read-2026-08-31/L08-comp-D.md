# Lane L08-comp-D — Report

Repo: /root/work/dotfiles/fsi-app. 38 files, all read in full.

## Per-file verdicts

### src/components/settings/ArchiveViewer.tsx — WORKING-WIRED — dual-scope (team/personal) archive list with search/filter and restore.
- WIRING: lane flag says GRAPH:UNREACHABLE (refs=0) but this is a **static-graph false negative**. `src/components/pages/SettingsPage.tsx:35` mounts it via `dynamic(() => import("@/components/settings/ArchiveViewer")...)` and renders `<ArchiveViewer />` at line 187. Dynamic `import()` calls are invisible to a static import-graph scanner. Overturning GRAPH:UNREACHABLE → wired.
- NOTE: personal-scope restore round-trips a network call (`restorePersonal`) and can fail; team-scope restore (`restoreResource`) is fire-and-forget with no visible error path (lines 96–97) — if it fails silently in the store, the row would appear to remain but no error is shown here (component-level; the failure surface, if any, lives in the store, not audited here).

### src/components/settings/BriefingScheduleSection.tsx — WORKING-WIRED — workspace briefing cadence/day/time/jurisdiction-weight editor, read-modify-write on `workspace_settings.alert_config` JSONB.
- WIRING: refs=1, consistent with mount in SettingsPage (not separately verified beyond the one ref).
- NOTE: `briefingDelivery` is hardcoded to `"in_app"` on every save (line 134) regardless of any other UI state — matches the copy "Delivery · in-app / Email and push follow the notifications channel work" (lines 213–216), so this is a documented not-yet-built feature, not a bug.

### src/components/settings/DataSummary.tsx — WORKING-WIRED — stat/coverage breakdown (priority, jurisdiction, mode, topic) over active+archived resources.
- WIRING: lane flag GRAPH:UNREACHABLE overturned — same as ArchiveViewer, mounted via `dynamic(...)` in SettingsPage.tsx:33 and rendered at line 168.

### src/components/settings/SavedSearchesSection.tsx — WORKING-WIRED — named filter/query combos, persisted to `localStorage` (key `fsi-saved-searches`), not a DB table.
- WIRING: lane flag GRAPH:UNREACHABLE overturned — mounted via `dynamic(...)` in SettingsPage.tsx:36, rendered at line 161.
- NOTE: explicit in-code admission (lines 8–21) that no `saved_searches` table exists; this is deliberately local-only ("candidate L2 backend split"). Cross-device sync is explicitly not implemented (line 134 UI copy). Not a defect — documented scope limit.
- NOTE: the "Query (optional)" field explains that topic/mode/jurisdiction filters aren't wired into the save yet (lines 204–211) — recall only replays `q`, not those filters, because `draft` never captures them (SavedSearch objects are always created with `modes: []`, `topics: []`, etc., lines 84–88). This is an INCOMPLETE feature by the component's own admission, not a hidden bug.

### src/components/settings/SupersessionHistory.tsx — WORKING-WIRED — renders a resource's supersession history (old→new pairs) with severity coloring.
- WIRING: lane flag GRAPH:UNREACHABLE overturned — mounted via `dynamic(...)` in SettingsPage.tsx:34, rendered at line 171.

### src/components/shared/GfmSection.tsx — WORKING-WIRED — shared GFM markdown renderer (tables/lists/headings) for Operations/Market/Research section content, replacing the narrower ProseSection.
- WIRING: refs=4, confirmed used at minimum by ThemesView.tsx:289 (brief markdown).

### src/components/shell/ItemConnectionsCard.tsx — WORKING-WIRED — shared right-rail "Connections" card (supersessions + cross-references) for item detail pages across 4 surfaces.
- WIRING: refs=4. Pure view-shell; delegates row-building to `connection-view-model.mjs`.

### src/components/shell/PageMasthead.tsx — WORKING-WIRED — editorial page header (eyebrow/title/meta), consumed by EditorialMasthead.tsx.
- WIRING: refs=3, confirmed: EditorialMasthead.tsx wraps it directly (line 23, 81).

### src/components/shell/RelevanceBadge.tsx — WORKING-WIRED — server-component relevance-lens badge (band + one-line summary) on item detail pages.
- WIRING: refs=4.
- NOTE: fail-open by design — absent relevance renders nothing (line 27), documented as intentional, not a defect.

### src/components/shell/SectionHeader.tsx — WORKING-UNWIRED — canonical Anton-30px section-header pattern component.
- WIRING: GRAPH:UNREACHABLE **confirmed**. Grepped all of src/ for `SectionHeader` — the only other hits are in `OnboardingWizard.tsx`, which defines and uses its own **locally-scoped** `function SectionHeader(...)` (line 952) unrelated to this shared component; it never imports from `@/components/shell/SectionHeader`. Nothing imports this file.

### src/components/shell/StatStrip.tsx — WORKING-UNWIRED — 4-up stat-tile strip pattern (tone-colored eyebrow/numeral/helper, one "primary" rail slot).
- WIRING: GRAPH:UNREACHABLE **confirmed**. No importer found anywhere in src/.

### src/components/sources/B2ProgressBanner.tsx — WORKING-WIRED — polls `/api/admin/b2-progress` every 30s, renders contract-version regeneration progress.
- WIRING: refs=1, confirmed: mounted in SourceHealthDashboard.tsx:363.

### src/components/sources/CanonicalSourceReview.tsx — WORKING-WIRED — canonical-source-candidate review UI (approve/reject/defer/bulk-approve/pre-cache classification), largest file in lane (961 lines).
- WIRING: refs=1, confirmed: mounted in SourceHealthDashboard.tsx as the "canonical" tab (line 509).
- NOTE: `canonical_source_candidates` has 331 live rows and src=5 per table-usage.txt — consistent with active use (this component + its backing API routes).
- NOTE (defensive-but-odd): line 94 in the sibling ProvisionalReviewCard has a redundant boolean (`decision !== "defer" && decision === "approve"`) — see that file's entry; the same pattern does not appear here.

### src/components/sources/IntersectionDetectionView.tsx — WORKING-WIRED — reads `/api/admin/intersections` (backed by persisted `item_cross_references` graph), renders strong/medium/weak/explicit connection bands.
- WIRING: refs=1, confirmed: mounted in SourceHealthDashboard.tsx as "intersections" tab (line 514).
- NOTE: in-code comment states the older `detect_intersections` RPC is retired (migration 265) in favor of `discover.mjs` — consistent with `item_cross_references` having 1929 live rows, src=8 per table-usage.txt.

### src/components/sources/ProvisionalReviewCard.tsx — WORKING-WIRED — single provisional-source review card (AI tier recommendation + approve/reject/defer), embeds SourceTierAuditPanel.
- WIRING: refs=1, confirmed: mounted per-row in SourceHealthDashboard.tsx's "provisional" tab (line 498).
- NOTE (not a functional bug, dead condition): line 94, `if (decision !== "defer" && decision === "approve" && !tier) return;` — the first clause is always true whenever the second is true (`"approve" !== "defer"` is a tautology), so the check reduces to `decision === "approve" && !tier`. Harmless (correct net behavior) but the redundant clause is dead weight, and since `tier` is state seeded to `4` by default (line 47) and never falsy in practice, this guard is effectively unreachable regardless.

### src/components/sources/SourceAdminControls.tsx — WORKING-WIRED — three exported controls: `GlobalPauseToggle` (system-wide scrape cadence + emergency stop), `SourceRowControls` (pause/fetch-now/regenerate-brief/visibility per source), `SourceTierOverrideControl` (base/override/effective tier with audit trail).
- WIRING: refs=1 (module-level; all three are actually mounted — confirmed via SourceHealthDashboard.tsx importing `GlobalPauseToggle, SourceRowControls, SourceTierOverrideControl` at line 31 and rendering `GlobalPauseToggle` at 366, `SourceRowControls` at 266, `SourceTierOverrideControl` at 278).
- NOTE: `SourceTierOverrideControl`'s GET load is wrapped in a silent catch (lines 460–463) — "Silent fail: keep the initial props-derived view" — explicitly documented as intentional degrade, not a swallowed error hiding a real failure.

### src/components/sources/SourceHealthDashboard.tsx — WORKING-WIRED — the admin Source Intelligence dashboard: tier summary grid, tabbed views (registry/health/provisional/canonical/intersections/themes), composes nearly every other file in this lane's `sources/` directory.
- WIRING: refs=1, confirmed: imported and rendered by `src/components/admin/AdminDashboard.tsx:34,589`.
- NOTE: line 345/346, the "Canonical Source Issues" and "Intersections" tab counts are hardcoded to `0` in `viewTabs` (never reflect `stats.total` from those sub-views) — cosmetic (the tab body itself shows real counts once opened), not a functional defect.

### src/components/sources/SourceProvenanceBadge.tsx — WORKING-UNWIRED (superseded) — tier-accented source-attribution badge/link.
- WIRING: GRAPH:UNREACHABLE **confirmed**. The only other hits for `SourceProvenanceBadge` in src/ are a comment in `CredibilityBadge.tsx` ("Replaces (going forward) the consumer-side use of `SourceProvenanceBadge`...") and a comment in `types/resource.ts` — neither is an import. Nothing renders this component; `CredibilityBadge.tsx` appears to be its intended successor.

### src/components/sources/SourceTierAuditPanel.tsx — WORKING-WIRED — Haiku tier-recommendation + accept/override/flag-ambiguous panel, embedded in both provisional and seeded source rows.
- WIRING: refs=2, confirmed: `ProvisionalReviewCard.tsx:206` (kind="provisional") and `SourceHealthDashboard.tsx:291` (kind="seeded").
- NOTE: explicit self-documented state as "UNVERIFIED-PENDING-RUNTIME" (line 8) — the component renders correctly but the recommend/commit round-trip against live Haiku calls had not been runtime-verified at time of authorship per its own docstring. This is a self-reported caveat, not something this read confirmed or refuted independently (no backend route in this lane).

### src/components/sources/ThemesView.tsx — WORKING-WIRED — connection-theme clusters (high/medium/low convergence bands) with expandable AI-generated briefs via GfmSection.
- WIRING: refs=1, confirmed: mounted in SourceHealthDashboard.tsx as "themes" tab (line 515).
- NOTE: `CONVERGENCE_BANDS` (line 66) is intentionally duplicated from `theme-stats.mjs` rather than shared, with an explicit rationale comment (client-bundle-boundary avoidance) — a documented drift risk, not a current defect.

### src/components/telemetry/GlobalErrorReporter.tsx — WORKING-WIRED — window.onerror/unhandledrejection → `/api/telemetry/error`, rate-limited via sessionStorage.
- WIRING: refs=2 — mounted in `src/app/layout.tsx` (grep-confirmed) and `reportClientError` re-used by `src/app/error.tsx`.
- NOTE: pre-auth pages are explicitly not captured (line 66, "documented R0.2 deviation") — errors before a session token exists are dropped by design.

### src/components/ui/AiPromptBar.tsx — WORKING-WIRED — inline ask-bar with chip suggestions; dispatches `open-ask-assistant` CustomEvent when no `onSubmit` prop given.
- WIRING: refs=2.
- NOTE: fallback path (no `onSubmit`) depends on a listener for the `open-ask-assistant` window event existing elsewhere (not verified in this lane — likely `AskAssistant.tsx`, which appeared as an importer of WatchButton-adjacent modules in this lane's grep but was not itself in this lane's file list).

### src/components/ui/Button.tsx — WORKING-WIRED — base button primitive (variant/size), 16 refs.

### src/components/ui/EditorialMasthead.tsx — WORKING-WIRED — auto-eyebrow ("VOL IV · NO. {isoWeek} · {DAY}") wrapper over PageMasthead.
- WIRING: refs=11.
- NOTE: locks locale to `en-US` and timezone to UTC specifically to avoid SSR/hydration mismatch (documented, lines 61–70) — correct defensive pattern, not a defect.

### src/components/ui/ErrorState.tsx — WORKING-WIRED — generic error/retry empty-state, refs=1.

### src/components/ui/Pill.tsx — WORKING-UNWIRED — filter-pill primitive (active/color/count/accent-border variants).
- WIRING: GRAPH:UNREACHABLE **confirmed** — grepped for any import path ending in `/Pill"` or `/Pill'` across src/: zero matches.

### src/components/ui/RelativeTime.tsx — WORKING-WIRED — hydration-safe "N min ago" label component, refs=2 (confirmed used by WatchlistSurface.tsx:35,113).

### src/components/ui/RowCard.tsx — WORKING-UNWIRED — `.cl-row-card` wrapper primitive with priority-accent modifier.
- WIRING: GRAPH:UNREACHABLE **confirmed** — zero import-path matches for `/RowCard"` or `/RowCard'`.

### src/components/ui/SystemErrorBanner.tsx — WORKING-WIRED — conditional "data temporarily unavailable" banner keyed off a `data._error` sentinel, refs=5.

### src/components/ui/Tag.tsx — WORKING-UNWIRED — colored tag/chip primitive.
- WIRING: GRAPH:UNREACHABLE **confirmed** — zero import-path matches.

### src/components/ui/Toast.tsx — WORKING-WIRED — bottom-right success/error toast, refs=3 (SavedSearchesSection.tsx is one confirmed consumer, line 5/313-316).

### src/components/ui/Toggle.tsx — WORKING-UNWIRED — labeled switch primitive.
- WIRING: GRAPH:UNREACHABLE **confirmed** — zero import-path matches.

### src/components/ui/Tooltip.tsx — WORKING-UNWIRED — hover tooltip primitive **and** a 30-entry acronym glossary (`ACRONYMS`) + `AcronymTooltip` component.
- WIRING: GRAPH:UNREACHABLE **confirmed** for both the base `Tooltip` export and `AcronymTooltip` — grepped `AcronymTooltip` across all of src/: only the definition itself matches, no consumer. The entire 30-term FSI acronym glossary (PPWR, CBAM, CII, ETS, SAF, CORSIA, CSRD, ESRS, EUDR, etc., lines 36–70) is unreachable dead code.

### src/components/ui/WatchButton.npmtest.mjs — TEST — structural regression test asserting `WatchButton.tsx` imports `WatchlistItemType` from `@/lib/data` rather than a re-hardcoded literal union, and that no narrower 5/6-value inline union has crept back in.
- Not vacuous: it reads WatchButton.tsx's actual source text and asserts on import statement + prop-type shape + absence of a specific hardcoded-union regex pattern; it would fail if the type import were removed or an inline union reappeared. Confirmed against the current WatchButton.tsx: it does import `WatchlistItemType` from `@/lib/data` (WatchButton.tsx:5) and does type `itemType: WatchlistItemType` (line 71) — the test's assertions currently pass by inspection.
- WIRING: refs=0 is expected/correct for a `.npmtest.mjs` file (it's an entry point invoked by the test runner, not imported by app code).

### src/components/ui/WatchButton.tsx — WORKING-WIRED — dual-scope (personal/team) watch toggle backed by `/api/watchlist`, gates team-only item types (e.g. `market_series`) via `isTeamOnlyWatchType`.
- WIRING: refs=5.
- NOTE: this file's own docstring records a **prior, now-fixed** defect (a hand-copied 5-value `itemType` union that silently omitted `market_series` when it shipped) — the fix (typed import) is present and covered by the sibling `.npmtest.mjs`. No live defect found in the current source.
- NOTE: for a team-only-and-no-team-available state, renders a disabled `<span>` rather than a clickable control (lines 221–238) — a deliberate "no affordance that can only fail" pattern, not a bug.

### src/components/ui/relative-time-format.ts — WORKING-WIRED — JSX-free `stableDateLabel`/`relativeTimeLabel` formatters extracted from RelativeTime.tsx for portable `node --test` coverage.
- WIRING: refs=2, confirmed re-exported by RelativeTime.tsx:23 and used internally there.

### src/components/watchlist/WatchlistSurface.tsx — WORKING-WIRED — full `/watchlist` page body: scope/type filters, three honest empty-states, cap-reached notice.
- WIRING: refs=1, confirmed: `src/app/watchlist/page.tsx:1,44`.
- NOTE: explicitly does not re-sort (relies on server order) and explicitly has no drag-reorder on this page by design (lines 4–18) — documented scope boundary, not a gap.

### src/components/workspace/ArchiveDialog.tsx — WORKING-WIRED — dual-scope (personal/workspace) archive dialog with live impact preview (`/api/workspace/archive-impact`), required reason for team-scope, advisory role gate.
- WIRING: refs=2.
- NOTE: explicitly states the client-side `canTeam` role check is advisory only, "the 403 from the write path is the real gate" (lines 128–129) — correct fail-closed posture (client gate is UX-only, server enforces).

## Lane summary

**Counts by STATUS** (38 files):
- WORKING-WIRED: 30
- WORKING-UNWIRED: 7 (SectionHeader.tsx, StatStrip.tsx, SourceProvenanceBadge.tsx, Pill.tsx, RowCard.tsx, Tag.tsx, Toggle.tsx — note: 7 items but Tooltip.tsx also unwired, making it 8; see corrected count below)
- TEST: 1 (WatchButton.npmtest.mjs)

Corrected STATUS tally: **WORKING-WIRED: 30, WORKING-UNWIRED: 7, TEST: 1** — the 7 unwired are: SectionHeader.tsx, StatStrip.tsx, SourceProvenanceBadge.tsx, Pill.tsx, RowCard.tsx, Tag.tsx, Toggle.tsx. Tooltip.tsx is an 8th unwired file — total unwired is **8**, total WORKING-WIRED is **29**. (38 = 29 + 8 + 1.)

**Top findings, ranked:**

1. **Graph-flag false negative, 4 files: ArchiveViewer.tsx, DataSummary.tsx, SavedSearchesSection.tsx, SupersessionHistory.tsx** — all four are flagged `GRAPH:UNREACHABLE refs=0` but are actually wired: `SettingsPage.tsx` mounts every one of them via `next/dynamic(() => import(...))`, which a static import-graph scanner does not see. All four are live, rendered UI on the Settings page. This is the single most consequential correction in this lane — a naive read of the ground-truth flags would have reported 4 working settings-page sections as dead code.

2. **Genuinely dead code confirmed (8 files, ~600 lines): SectionHeader.tsx, StatStrip.tsx, SourceProvenanceBadge.tsx, Pill.tsx, RowCard.tsx, Tag.tsx, Toggle.tsx, Tooltip.tsx** — each independently grep-confirmed to have zero importers anywhere in src/. `SourceProvenanceBadge.tsx` appears superseded by `CredibilityBadge.tsx` per that file's own comment. `Tooltip.tsx` is notable: it carries not just the unused `Tooltip` primitive but a fully unreferenced 30-entry regulatory-acronym glossary (`ACRONYMS`, PPWR/CBAM/CII/ETS/SAF/CORSIA/CSRD/ESRS/EUDR/etc.) and an `AcronymTooltip` component, none of which is rendered anywhere in the app.

3. **SavedSearchesSection.tsx is intentionally localStorage-only, by design admission** (component's own docstring, lines 8–21): no `saved_searches` table exists; the feature is scoped as an L1 (local) placeholder pending an L2 backend. Saved searches do not sync across devices or browsers, and the "Query" field only captures free text — topic/mode/jurisdiction filters selected elsewhere are never attached to a saved search (draft object hardcodes `modes: [], topics: [], jurisdictions: [], priorities: []` at creation, lines 84–88), so the filter-recall feature only ever recalls the query string, never the filters, contradicting nothing since the UI itself says so (line 208–211) but worth flagging as an incomplete feature a stakeholder should know is not "done."

4. **CanonicalSourceReview.tsx / ProvisionalReviewCard.tsx / SourceTierAuditPanel.tsx / IntersectionDetectionView.tsx / ThemesView.tsx / B2ProgressBanner.tsx / SourceAdminControls.tsx / SourceHealthDashboard.tsx form one tightly-composed admin subsystem**, all confirmed wired through `SourceHealthDashboard.tsx` (mounted by `AdminDashboard.tsx`). None of these are speculative or orphaned; the lane's `sources/` directory is the single most load-bearing part of this file list.

5. **SourceTierAuditPanel.tsx self-documents as "UNVERIFIED-PENDING-RUNTIME"** at the time of authorship (line 8 docstring) — the recommend-tier / commit-tier-change round trip against live Haiku calls was not runtime-verified when written. This lane cannot independently confirm or refute the backend behavior (the API routes are out of scope), so this is passed through as a NOTE an owner should be aware of, not resolved.

6. **ArchiveViewer.tsx's two restore paths have asymmetric error handling**: personal-scope restore (`restorePersonal`) is awaited and surfaces a failure message inline (lines 92–93); team-scope restore (`restoreResource`) is fire-and-forget with no error path visible in this component (line 96) — if the underlying store call fails, the user gets no feedback from this component. Whether the store itself surfaces an error was not checked (out of lane).

7. **SourceHealthDashboard.tsx's tab-count badges for "Canonical Source Issues" and "Intersections" are hardcoded to 0`** (lines 345–346) regardless of actual pending-item counts — a cosmetic display gap (the tab body itself shows correct counts once opened), not a functional defect, but worth an owner's attention since it could read as "nothing pending" when items exist.

8. **ProvisionalReviewCard.tsx line 94 has a tautological/dead condition** (`decision !== "defer" && decision === "approve"`) that reduces to the second clause alone — harmless in effect, purely a redundant-logic note.

9. **No defects that change program behavior incorrectly were found** in this lane beyond the redundant-but-harmless condition in item 8 and the cosmetic zero-count badges in item 7. Everything else reviewed is either working-as-designed, explicitly-scoped-incomplete (with the UI saying so), or confirmed dead/unwired code.

**Coverage attestation:** files read in full: 38/38, lines read: 7,597 (matches `wc -l` totals for every file in the lane list; no file was truncated or partially read).
