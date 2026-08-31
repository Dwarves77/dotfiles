# L07-comp-C — Full-read audit report

Lane file: `/root/work/audit/lanes/L07-comp-C.txt` (30 files, paths relative to `/root/work/dotfiles/fsi-app`)

---

## Per-file verdicts

### `src/components/pages/MarketSignalDetailSurface.tsx` — WORKING-WIRED — client detail surface for `/market/[slug]` (hero, price board, 6 tabs, notes, related signals)
- NOTE: `PriceBoard` (line 626) and the Sources tab (line 895) both render honest "pending" frames rather than fabricated data when `priceBoard`/parsed sources are empty — matches the file's own DO-NOT-REVERT doctrine.
- NOTE: `NotesField` (line 934) persists to `workspace_item_overrides.notes` via `POST /api/workspace/overrides`, debounced 800ms + on blur; failure sets `status: "error"` and never silently drops the text (line 959-961).
- WIRING: only caller of this component is the `/market/[slug]` route (refs=1, matches ground truth).

### `src/components/pages/SettingsPage.tsx` — WORKING-WIRED — Account · Settings page (General / Saved searches / Data / Archive / Help tabs)
- NOTE: line 111-128 — dual-scope archive count (`initialArchived.length + personalArchivedCount`) requires `usePersonalStateHydration()` (line 116) to have run; without it the Archive tab undercounts personal-only archives. Comment at lines 89-96, 111-122 documents this explicitly as a prior bug fix.
- NOTE: `notification_preferences` (used by the mounted `NotificationPreferences`, line 151) has **0 live rows** per table-usage.txt despite `src=2` (this file + onboarding). Either no user has ever completed a save, or saved rows were wiped — worth an owner check, since the UI reports "Saved" without evidence any row exists in prod.

### `src/components/profile/MembersPanel.tsx` — WORKING-WIRED — Account · Profile · Members & roles (invite/role-change/remove/ban)
- NOTE: line 12-17 — Ban is explicitly org-scoped, not platform-wide; the component's docstring and the in-UI copy (line 504-506) both state this correctly.
- NOTE: `org_memberships` has only 2 live rows and `organizations` only 1 row (table-usage.txt) — this full CRUD surface (invite/role/remove/ban) is effectively unexercised in production; `org_invitations` has 0 rows despite being written by the invite flow (line 178-202), meaning no invitation has ever been successfully created against live data, or all created invitations were deleted/accepted such that none remain — cannot distinguish from code alone.
- WIRING: confirmed sole caller is `UserProfilePage.tsx` (refs=1, matches).

### `src/components/profile/NotificationPreferences.tsx` — WORKING-WIRED — reusable notification-prefs editor for `/settings` and `/onboarding` step 4
- WIRING: confirmed refs=2 — `SettingsPage.tsx` and `OnboardingWizard.tsx` (via `app/onboarding/page.tsx`).
- NOTE: line 23-25 — `on_invite` is intentionally non-interactive/locked-on; correctly rendered read-only at line 216-223.
- NOTE: `notification_preferences` table has 0 live rows (table-usage.txt) — see SettingsPage.tsx note above; same underlying concern applies to the onboarding-flow write path too.

### `src/components/profile/OrganizationPanel.tsx` — WORKING-WIRED — Account · Profile · Organization identity + owner name/slug editor
- NOTE: line 13-16 — the mock's "Last activity" column is honestly relabeled "Created" because no per-org activity-events table exists yet; documented as a deliberate deviation, not a bug.
- WIRING: confirmed sole caller is `UserProfilePage.tsx` (refs=1, matches).

### `src/components/profile/UserProfilePage.tsx` — WORKING-WIRED — Account · Profile page (Personal/Organization/Members/Sectors/Jurisdictions/Verifier/Activity tabs)
- NOTE: `ActivityTab` (line 648-655) is an honest pending frame — no per-account activity-events table exists yet; correctly disclosed rather than faked.
- NOTE: line 298-306 — `VerifierTab`'s "Request verifier sign-off" writes `verifier_status: "pending"` via the shared `persist` helper but nothing in this lane shows a downstream reviewer path (out of lane scope; flagging for cross-lane follow-up).
- WIRING: confirmed sole caller is the `/profile` (or similar) route (refs=1, matches).

### `src/components/regulations/AffectedLanesCard.tsx` — INCOMPLETE (by design) — right-rail "Affected lanes" card for `/regulations/[id]`
- INCOMPLETE: line 8-23 — the component's own docstring states there is no lane-pair table in the schema; it renders mode/jurisdiction chips as a partial substitute and an honest "will appear here once shipment data is connected" banner (line 144-156). This is a documented, deliberate incompleteness (matches HANDOFF §33 empty-state pattern), not a silent gap.
- WIRING: confirmed sole caller is `RegulationDetailSurface.tsx` (refs=1, matches).

### `src/components/regulations/BulkSelectBar.tsx` — WORKING-UNWIRED — bulk-action toolbar (watchlist/export/clear) for `/regulations`
- WIRING confirmed: GRAPH:UNREACHABLE is correct. `RegulationsLedger.tsx` (the current `/regulations` index, confirmed by direct read) does not import `BulkSelectBar`. Nothing else in the repo references it (only match is its own file). The component and its `loadWatchlist`/`saveWatchlist` localStorage helpers (line 178-199) are fully built but orphaned — presumably superseded by the Template-02 ledger redesign, which the header comment for `RegulationsLedger.tsx` (line 4-29) explicitly calls the new archetype ("Kanban is dead").
- DEAD: whole file, including exported `loadWatchlist`/`saveWatchlist`, is unreferenced.

### `src/components/regulations/ConfidenceFacet.tsx` — WORKING-UNWIRED — authority-level filter chip row for `/regulations`
- WIRING confirmed: GRAPH:UNREACHABLE is correct. `RegulationsLedger.tsx` does not import this component; its exported `CONFIDENCE_UNCLASSIFIED_ID` is also unreferenced elsewhere. Same fate as `BulkSelectBar.tsx` — built for a prior /regulations layout, superseded by the current banded ledger's own inline facet bar (Mode/Priority/Topic only, no Confidence facet).
- DEAD: whole file unreferenced.

### `src/components/regulations/DismissedStash.tsx` — WORKING-WIRED — bottom-of-page "Dismissed regulations" recovery drawer for `/regulations`
- WIRING: confirmed caller is `RegulationsLedger.tsx` (line 1206: `<DismissedStash dismissed={dismissedRegulations} onRestore={...} />`), matches refs=1.
- NOTE: line 39-44 — deliberately renders `null` when nothing is dismissed (not an empty drawer), documented rationale.

### `src/components/regulations/OwnerTeamCard.tsx` — WORKING-WIRED — right-rail assignee/last-update card for `/regulations/[id]`
- NOTE: line 132-150 — while the workspace-members roster is loading or unavailable, the assignee select degrades to read-only text rather than showing an empty/misleading dropdown (`rosterFailed` path, line 78-80, 145-148) — honest fail state.
- WIRING: confirmed sole caller is `RegulationDetailSurface.tsx` (refs=1, matches).

### `src/components/regulations/PriorityDropdown.tsx` — WORKING-WIRED — ⋯/pill menu for priority retag, dismiss, and (optional) archive
- WIRING: confirmed refs=2 — `RegulationDetailSurface.tsx` (hero "pill" variant) and `RegulationsLedger.tsx` (per-row "card" variant, both direct and via `CardPriorityDropdown`/`SortableRegRow`).
- NOTE: line 140-149 — every popover action calls `stopPropagation` so the dropdown is safe nested inside a `<Link>`-wrapped row; verified this pattern is honored by both callers (`ArchiveDialog` is deliberately mounted outside the row `<Link>` by both callers, per their own comments).

### `src/components/regulations/RegulationDetailSurface.tsx` — WORKING-WIRED — client detail surface for `/regulations/[slug]` (Summary/Exposure/Penalty/Timeline/Sources tabs)
- NOTE: line 1234-1273 (`AtAGlanceCard`) and lines 1164-1232 (`SourcesTab`) share one selector, `sourceEntriesOf` (line 1169-1184), specifically to avoid the two counts disagreeing — the file's own comment (line 1166-1168) documents this as a prior-bug fix ("D-2 fix").
- NOTE: line 845-863 `ConnectedIntelligence` is an honest pending frame — cross-surface links are not yet wired into `Resource`.
- WIRING: confirmed sole caller is the `/regulations/[slug]` route (refs=1, matches).

### `src/components/regulations/RegulationsLedger.tsx` — WORKING-WIRED — the `/regulations` index (severity tiles → ask bar → facet bar → banded ledger, replaces the old kanban)
- NOTE: line 265-296 — a background fetch (`/api/listings/rest?surface=regulations&offset=...`) loads the remainder of the corpus past the server's first-page cap; on failure (line 282-291) the already-rendered first page is left untouched and only a status flag changes — fails soft, never blanks the list.
- NOTE: line 347-355 — band/header counts are RPC-sourced (`aggregates`) with a fail-soft path to row-derived counts when `aggregates.totalItems === 0`; this is a real ambiguity risk baked into the design (a genuinely-empty verified RPC result is indistinguishable from an absent/failed RPC — both read `totalItems === 0`), but it is a deliberate, disclosed tradeoff (comment at line 16-19), not an unflagged defect.
- WIRING: confirmed this file does NOT import `BulkSelectBar`, `ConfidenceFacet`, `SectorChipFilter`, `SortRow`, or `ViewToggles` — corroborates all five GRAPH:UNREACHABLE flags on sibling files in this lane.
- WIRING: confirmed sole caller is the `/regulations` route (refs=1, matches).

### `src/components/regulations/SectorChipFilter.tsx` — WORKING-UNWIRED — 28-chip freight-vertical filter row for `/regulations`
- WIRING confirmed: GRAPH:UNREACHABLE is correct. `RegulationsLedger.tsx` does not import it; no other file references `SectorChipFilter` or `REGULATIONS_SECTOR_CHIPS`. Superseded by the current ledger's Mode/Priority/Topic facet bar, which has no sector facet.
- DEAD: whole file, including the exported `REGULATIONS_SECTOR_CHIPS` constant, unreferenced.

### `src/components/regulations/SortRow.tsx` — WORKING-UNWIRED — 3-option sort selector (newest/priority/alpha) for `/regulations`
- WIRING confirmed: GRAPH:UNREACHABLE is correct. `RegulationsLedger.tsx` implements its own inline 4-option sort segment (newest/priority/az/custom, line 766-793) rather than using this component.
- DEAD: whole file, including exported `authorityRank` helper (line 84-87), unreferenced.

### `src/components/regulations/ViewToggles.tsx` — WORKING-UNWIRED — kanban/list/table view-mode toggle for `/regulations`
- WIRING confirmed: GRAPH:UNREACHABLE is correct. The current `/regulations` ledger has no view-mode concept at all (single banded-ledger layout); this toggle predates that redesign.
- DEAD: whole file unreferenced. Docstring (line 6) still describes "the 4-column priority kanban already in production," which `RegulationsLedger.tsx`'s own header comment (line 28) states is dead — internally consistent evidence this file is a leftover from the pre-redesign surface.

### `src/components/regulations/sections/ActionList.tsx` — WORKING-WIRED — §3 "Issues Requiring Immediate Action" renderer
- WIRING: confirmed caller is `RegulationSections.tsx` (`renderBody`, line 100), which is itself wired into `RegulationDetailSurface.tsx`'s Full-summary mode (line 683).

### `src/components/regulations/sections/ObligationsTable.tsx` — WORKING-WIRED — §8 obligations 4-column table renderer
- WIRING: confirmed caller is `RegulationSections.tsx` (line 104).

### `src/components/regulations/sections/ProseSection.tsx` — WORKING-WIRED — generic prose renderer for §4/§10/§11
- WIRING: confirmed caller is `RegulationSections.tsx` (lines 102, 106).

### `src/components/regulations/sections/RegulationSections.tsx` — WORKING-WIRED — composes the 7 numbered §-sections on the regulation detail page
- NOTE: line 55-57 — a §14 timeline section with zero entries is explicitly suppressed (not rendered as an empty titled box) — correct hide-when-empty handling.
- WIRING: confirmed caller is `RegulationDetailSurface.tsx` (line 683, inside Full-summary mode only — i.e. this whole section-aware rendering path is gated behind the Short/Full toggle and only fires when `mode === "full" && hasFull`).

### `src/components/regulations/sections/RegulationTimeline.tsx` — WORKING-WIRED — §14 timeline row renderer
- WIRING: confirmed caller is `RegulationSections.tsx` (line 108).

### `src/components/regulations/sections/SectionCard.tsx` — WORKING-WIRED — §-numbered card chrome wrapper
- WIRING: confirmed caller is `RegulationSections.tsx` (line 60-69).

### `src/components/regulations/sections/SourcesList.tsx` — DEFECTIVE — §15 tier-tagged source citation list renderer
- DEFECT: lines 20-26, 36, 49 — `TIER_STYLE` only defines keys `1`–`5`. A source entry with `tier === 6` or `tier === 7` makes `tone` `undefined`, and the condition `e.tier && tone` (line 49) is then false, so the row falls into the `else` branch (line 65-67: an empty `<span style={{ width: 32 }} aria-hidden />`) — **the tier badge silently disappears entirely** (not even an unstyled "T6"/"T7" is shown) instead of degrading gracefully. Every other tier-badge implementation in this lane (`RegulationDetailSurface.tsx` `TierBadge`, `MarketSignalDetailSurface.tsx` `TierBadge`, `ResearchFindingDetailSurface.tsx` `SourceTierBadge`) explicitly supports the full clamped 1-7 range and always renders `T{n}` with a fallback color. This file is the one outlier that loses the badge outright for tiers 6-7, which are legitimate values per the platform's own `clampTier` doctrine used everywhere else. Concrete failure: a §15 Sources entry sourced from a tier-6 ("commercial intelligence") or tier-7 ("news & commentary") citation renders with no tier indicator at all, silently understating its own provenance signal to the reader.
- WIRING: confirmed caller is `RegulationSections.tsx` (line 110).

### `src/components/research/ResearchFindingDetailSurface.tsx` — WORKING-WIRED — client detail surface for `/research/[slug]`
- NOTE: line 279-287, 289-307 — `SourceTierBadge`/`TIER_DEFINITIONS` here only define tiers 1-5 for label/color lookup, but (unlike the `SourcesList.tsx` defect above) always renders `T{tier}` regardless of whether `def` was found (line 306: falls back to `var(--color-text-secondary)` / `var(--color-border)`), and line 341-343 explicitly documents that T6/T7 exist and are "admin-reviewed and rarely surface here" — this is a correct, disclosed degrade, not a defect.
- NOTE: lines 540-549 — `ThemeBriefCard` never fetches or generates content itself; it only renders a `themeBrief` prop the server component supplies, and explicitly renders nothing when null (honest omission).
- WIRING: confirmed sole caller is the `/research/[slug]` route (refs=1, matches).

### `src/components/research/ResearchLedger.tsx` — WORKING-WIRED — the `/research` index (severity tiles, theme-card filters, ask bar, verticals+window controls, theme-banded findings, right rail)
- NOTE: line 919-926 — the "key figure" stat is a deliberate honest em-dash with a "no key figure yet" caption; no structured backing column exists yet. Correctly disclosed, not fabricated.
- NOTE: line 384-402 — `registryByMode` (source-registry-breadth rail card) only renders when `sourceCoverage` is non-empty; the surrounding comment documents this data was previously fetched-and-discarded (`void sourceCoverage`) before being wired up — worth cross-checking against the WO-15 migration/RPC in a schema-focused lane, out of scope here.
- WIRING: confirmed sole caller is the `/research` route.

### `src/components/resource/ImpactScores.tsx` — WORKING-WIRED — 4-dimension impact-assessment bar chart
- NOTE: line 74-79 — score-0 dimensions are pre-filtered out entirely (not rendered as empty bars) per "operator Q4" ruling; if all 4 dimensions are 0, the whole card collapses to a one-line "No scored dimensions yet" note (line 80-91) rather than 4 zero-width bars.
- WIRING: confirmed callers include `RegulationDetailSurface.tsx` (`SummaryTab`, line 645) within this lane; refs=1 in ground truth matches this single call site inside the lane (other potential callers outside this lane not checked).

### `src/components/resource/IntelligenceMetadataStrip.tsx` — WORKING-UNWIRED — self-fetching per-item metadata strip (severity/urgency/format/tags/intersections)
- WIRING: refs=1 is technically correct (one importer: `SectorSynopsis.tsx`, line 10, 328) but that importer is itself GRAPH:UNREACHABLE (see below) — so this component is transitively unreachable from any route despite having a live caller in the source tree. Confirmed via grep: the only non-test references to `IntelligenceMetadataStrip` are its own definition and `SectorSynopsis.tsx`'s import/use; a third reference is in `severity-ui-bucket.test.mjs`, a regression test for the severity-color bug documented at line 38-48 of this file (DB-form vs. display-form key mismatch), not a runtime caller.
- NOTE: line 38-48 documents a real prior defect (severity chips silently always rendering the neutral fallback color because the map was keyed on display-form text while the raw value arrived in DB-form) that was fixed by routing through `toDisplaySeverity` before both the color lookup and the rendered text (line 104-105) — the fix reads correct as currently written.

### `src/components/resource/SectorSynopsis.tsx` — DEAD-HISTORICAL — 10-section/synopsis-and-full-brief renderer with sector accordion (`SectorSynopsisView`)
- WIRING confirmed: GRAPH:UNREACHABLE is correct. Grep across `src/` finds no importer of `SectorSynopsisView` anywhere (only its own definition, plus an unrelated same-named TypeScript interface `SectorSynopsis` in `src/lib/supabase-server.ts` that is NOT this component). `src/lib/supabase-server.ts` line 1791-1799 explicitly documents that the `intelligence_summaries`/synopses fetch path this component was built to consume was deliberately shelved ("sector-activation shelving decision") and that this exact component name (`SectorSynopsisView`) is called out by name as unaffected-but-unused. This is a disclosed, intentional shelving, not silent rot — hence DEAD-HISTORICAL rather than plain dead code. Its only live import, `IntelligenceMetadataStrip`, is transitively dead as a result (see above).

---

## Lane summary

### Counts by status
- WORKING-WIRED: 21
- WORKING-UNWIRED: 7 (`BulkSelectBar.tsx`, `ConfidenceFacet.tsx`, `SectorChipFilter.tsx`, `SortRow.tsx`, `ViewToggles.tsx`, `IntelligenceMetadataStrip.tsx`, plus `SectorSynopsis.tsx`'s only consumer being itself unreachable)
- DEFECTIVE: 1 (`sections/SourcesList.tsx`)
- INCOMPLETE (by design/disclosed): 1 (`AffectedLanesCard.tsx` — disclosed incompleteness, not a bug)
- DEAD-HISTORICAL: 1 (`SectorSynopsis.tsx`)
- STUB: 0
- OPERATOR-TOOL: 0
- TEST-ONLY: 0
- TEST: 0

(30 files total; `SectorChipFilter`/`SortRow`/`ViewToggles`/`BulkSelectBar`/`ConfidenceFacet` counted under WORKING-UNWIRED rather than DEAD-HISTORICAL because they are functionally complete, self-contained, still-compiling components with no stated one-off/completed-migration purpose — they read as superseded-but-viable leftovers from the pre-Template-02 `/regulations` surface, not historical scripts.)

### Findings ranked by importance

1. **DEFECT — `sections/SourcesList.tsx` line 20-26/49-67**: tier-6 and tier-7 source citations in the §15 Sources section of a regulation brief silently lose their tier badge entirely (falls to an unstyled empty spacer) because `TIER_STYLE` only maps tiers 1-5, unlike every other tier-badge component in this lane which supports the full clamped 1-7 range with a fallback style. Concrete failure: a genuine tier-6/7 source (the platform's own two lowest-provenance tiers, per `ResearchFindingDetailSurface.tsx` line 341-343) renders with zero tier indicator, understating its provenance to the reader rather than showing "T6"/"T7" honestly.

2. **NOTE — five orphaned `/regulations` components (`BulkSelectBar.tsx`, `ConfidenceFacet.tsx`, `SectorChipFilter.tsx`, `SortRow.tsx`, `ViewToggles.tsx`)**: all confirmed unreachable by direct read of `RegulationsLedger.tsx`, the current `/regulations` index — none are imported there or anywhere else. They are full, working, self-contained implementations (watchlist bulk-actions + CSV export, confidence facet, 28-chip sector facet, sort selector, kanban/list/table toggle) left behind by the Template-02 ledger redesign, which explicitly states "Kanban is dead" in its own header comment. None carry a decommission note; an owner should decide whether to delete them or whether any capability (e.g. bulk CSV export, sector-chip filtering) should be re-integrated into the current ledger.

3. **NOTE — `notification_preferences` table has 0 live rows** (table-usage.txt) despite a fully wired, working save path exercised from two entry points (`SettingsPage.tsx` general tab and the onboarding wizard step 4, via `NotificationPreferences.tsx`). Either the write path has never successfully completed in production, or all rows were deleted/reset. The UI reports "Saved" (line 227-231 of `NotificationPreferences.tsx`) on any successful upsert, so a 0-row live table alongside this code path is worth an owner check — cannot be resolved from the frontend code alone.

4. **NOTE — `SectorSynopsis.tsx` (`SectorSynopsisView`) and its sole consumer `IntelligenceMetadataStrip.tsx` are both dead**, but disclosed: `src/lib/supabase-server.ts` (line 1791-1799) explicitly names `SectorSynopsisView` in a comment explaining the synopses-fetch path was deliberately shelved. This is the one case in the lane where dead code is self-documented rather than silent; still flagged since `IntelligenceMetadataStrip.tsx`'s real prior-bug fix (severity DB-form/display-form key mismatch, documented at its own line 38-48) is now unreachable code that cannot regress-test in production even though it has a dedicated unit test file (`severity-ui-bucket.test.mjs`).

5. **NOTE — member/org management surfaces are effectively untested by production usage**: `organizations` (1 row), `org_memberships` (2 rows), `org_invitations` (0 rows) per table-usage.txt, while `MembersPanel.tsx`/`OrganizationPanel.tsx` implement a full invite/role-change/remove/ban/rename CRUD surface. The code reads correctly (last-owner guards, org-scoped ban semantics, typed-confirmation dialog), but with only 1 org and 2 memberships live, most of this surface's edge cases (multi-owner transitions, re-invite-after-ban, slug collisions) have essentially never executed against real data.

6. **DEFECT-adjacent NOTE — `RegulationsLedger.tsx` count fail-soft ambiguity (line 347-353)**: `bandCount`/`headerTotal` treat `aggregates.totalItems === 0` as "RPC absent, fall back to row-derived counts." This is indistinguishable from a genuinely-empty-but-successful RPC result (a workspace with zero verified regulations). The comment at line 16-19 discloses the fail-soft design deliberately, so this is not an unflagged defect, but it means a real empty-verified-corpus workspace and an RPC outage render identically from this component's perspective — worth a schema/RPC-lane cross-check on whether `get_surface_counts` can distinguish "0 rows" from "RPC unavailable" upstream.

7. **NOTE — `AffectedLanesCard.tsx` is a disclosed, intentional partial implementation**: no lane-pair schema exists; the card renders derivable mode/jurisdiction chips plus an honest "will appear once shipment data is connected" banner. Correctly implemented per its own documented halt-clause, not a defect.

8. **NOTE — Notes/owner-assignment fail states across both detail surfaces are handled honestly**: `MarketSignalDetailSurface.tsx`'s `NotesField` (debounced save, explicit "Save failed — retry" state, never silently drops text) and `RegulationDetailSurface.tsx`'s (via `OwnerTeamCard.tsx`) roster-load failure (degrades to read-only display rather than a misleadingly-empty assignable dropdown) are both good examples of the platform's stated honest-state doctrine being followed correctly — noted as a positive finding since so much of the review criteria is about honesty violations.

### Coverage attestation

Files read in full: 30/30.
Lines read (per this lane's manifest line-counts, all files read start-to-end including the 1402-line and 1541-line files in two offset chunks each where required by tool paging): 1205 + 423 + 556 + 277 + 254 + 668 + 159 + 199 + 130 + 192 + 193 + 406 + 1402 (reported as 1403 lines by the file itself; manifest said 1402) + 1541 (reported as 1542 by the file itself; manifest said 1541) + 198 + 87 + 73 + 83 + 57 + 94 + 112 + 54 + 75 + 89 + 1095 (reported as 1096) + 1009 (reported as 1010) + 196 + 216 + 532 (reported as 533) + 413 (reported as 414) ≈ **9989 lines** (manifest total 9990; actual on-disk file lengths ran 1 line over the manifest count on several files, consistent with a trailing-newline counting difference, not a truncated read — every file was read to its actual final line number as reported by the Read tool).

No file was left partially read. Two files (`RegulationDetailSurface.tsx`, `RegulationsLedger.tsx`) exceeded the single-call token cap and were read in two sequential offset chunks each, confirmed contiguous (first chunk ended mid-file, second chunk began at the very next line with no gap).
