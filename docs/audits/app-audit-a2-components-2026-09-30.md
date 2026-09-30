# App Audit A2, Components register (2026-09-30)

Lane A2 (COMPONENTS), read-only, Sonnet. Scope: every file under `fsi-app/src/components/**`
(248 `.ts`/`.tsx` files, 63,952 lines, excluding `*.npmtest.mjs`). Operator framing: "Will we be
embarrassed by top developers seeing what we have built?"

## Method and honest scope disclosure

Per CLAUDE.md rule 14 (a finding is a hypothesis until verified, and status is never fabricated),
this section states plainly what was and was not done, because a mid-audit instruction asked for
literal line-by-line reading of all 248 files with zero sampling. That bar was not fully reached
in this session and this report does not claim it was:

1. **13 files were read in full, top to bottom** (see Coverage appendix, "read-in-full"): the app
   shell/nav/ask-assistant layer (`AppShell.tsx`, `AskAssistant.tsx`, `BackToTop.tsx`,
   `Sidebar.tsx`), `account/AccountPrimitives.tsx`, and eight admin components
   (`AdminDashboard.tsx`, `AdminTableView.tsx`, `AssumptionRegisterPanel.tsx`,
   `BulkImportView.tsx`, `CommunityPickupsQueueView.tsx`, `CorpusTurnPanel.tsx`,
   `CoverageCatalogueView.tsx`, `CoverageMatrixView.tsx`, `ErrorGroupsView.tsx`,
   `FactCardGallery.tsx`, `IngestRejectionsView.tsx`).
2. `[CONFIRMED]` **Every one of the 248 files was swept with `ripgrep` for each named defect class** in the
   dispatch (TODO/FIXME, `any` typing, literal placeholder/"coming soon" strings, hex colours,
   unpinned `toLocaleDateString`, `defaultOpen`-first-open accordions, div-as-button `onClick`,
   `<img>` without alt, dialog/modal without `role="dialog"`/`aria-modal`). A sweep is exhaustive
   for the pattern it searches (100% of files, not a sample) but is not equivalent to reading a
   file for logic, prop-wiring or dead-state defects that no fixed string pattern catches.
3. **The repo's own fitness functions were executed directly** (F35 row-ux-coverage, F42
   card-shell-outside-section-card, F45 duplicate-code, F49 parts-not-pages), these scan 100% of
   `fsi-app/src` themselves, so their PASS/violation counts are exhaustive, not sampled.
4. **Import-count checks** (grep for `from "@/components/ui/<name>"`) were run for every UI
   primitive suspected of being dead, across the full `fsi-app/src` tree, not just `components/`.
5. What was **not** done: full manual read-through of the remaining 235 files for wiring-level and
   prop-drilling defects (class 3 "unwired props", class 7 "prop drilling depth", class 6 focus
   traps). Those classes are under-covered outside the 13 read-in-full files and outside what the
   grep sweeps could catch, and are flagged as a scope gap, not silently skipped.

Every finding below carries `[CONFIRMED]` (re-derived this session by the method named),
`[HYPOTHESIS]` (read from a prior audit doc or inferred, not independently re-verified this
session), or `[REFUTED]`.

## Summary

| Severity | Count | Classes |
|---|---|---|
| P0 | 0 |, |
| P1 | 6 | dead/duplicate naming, a11y, quality (file size), parts discipline (prior-audit citations) |
| P2 | 9 | `any` typing, quality, a11y, duplication baseline |

By class:

| Class | Findings |
|---|---|
| 1. Dead / duplicate components | 2 |
| 2. Broken / placeholder | 0 confirmed (see method note) |
| 3. Unwired | 0 confirmed this session (scope gap, see Method section 5) |
| 4. Parts discipline | 3 (2 `[HYPOTHESIS]` citing `docs/design/parts-brief` prior audit, 1 `[CONFIRMED]`) |
| 5. UX at 375px | 0 violations, F35 executed directly, exhaustive, green |
| 6. Accessibility | 2 |
| 7. Quality | 8 |

## Fitness / discipline tooling run this session

- `node fsi-app/.discipline/fitness/functions/F35-row-ux-coverage.mjs` (executed directly against
  every `ROW_COMPONENTS` entry and the smoke-spec registry), **0 violations** `[CONFIRMED]`.
- `F42-card-shell-outside-section-card.mjs`, **0 violations** `[CONFIRMED]`.
- `F45-duplicate-code.mjs`, **0 new violations**, but the function's own baseline tolerates
  **5,867 duplicated lines** across the codebase (`base: 5867`, logged by the function itself) ,
  `[CONFIRMED]`. This is a real quality signal even though it is not a new regression: a top
  engineer would ask why 5,867 lines of duplication is the accepted floor rather than a number
  trending toward zero.
- `F49-parts-not-pages.mjs`, **0 violations** `[CONFIRMED]`.
- The full `fsi-app/.discipline/fitness/runner.mjs` (all F-functions across the whole repo, not
  just components) was started but did not complete inside two background attempts (timed out
  silently, 0-byte output both times), `[CONFIRMED]` that it did not finish; not run to
  completion, not included in the counts above. Flagged as a P2 tooling-reliability item below (Q-8).
- `jscpd`, no `.jscpd.json`/config found anywhere in the repo (`find . -iname ".jscpd*"` empty).
  Not configured; not run. `[CONFIRMED]`.

## 1. Dead / duplicate components

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| D-1 | `sources/CanonicalSourceReview.tsx:533` | A second, unrelated local function is also named `ItemGroup` (`function ItemGroup({ group, onCandidateActioned })`), colliding in name (not behavior) with the canonical, exported `ui/ItemGroup.tsx` used by every detail surface. Both are real, both are reachable, but the name collision means a repo-wide grep for "ItemGroup" or an IDE "go to definition" from an unfamiliar caller can land on the wrong one. | `[CONFIRMED]` file read + grep | P2 | Rename the local admin-review grouping helper (e.g. `CandidateGroup` or `SourceCandidateGroup`), it groups canonical-source review candidates, not fact cards; the name was never accurate. | S |
| D-2 | `ui/*` primitives suspected dead | 17 lesser-used `ui/` primitives checked for zero-importer status (`FilePickRow`, `BandTileRow`, `BandTile`, `TabRow`, `WatchButton`, `Toast`, `InlineErrorBanner`, `SystemErrorBanner`, `MilestoneTimeline`, `RowTable`, `ActionRow`, `CardFoot`, `DetailTagRow`, `DetailSubSection`, `SectionIndexLink`, `SectionLabel`, `TagPopover`), **all have ≥1 real importer** (1 to 8 each). No dead components found among these. | `[REFUTED]` (hypothesis going in; grep across full `fsi-app/src` disproved it) |, | None needed. |, |

## 2. Broken / placeholder

No literal `TODO`/`FIXME` markers found anywhere under `fsi-app/src/components` (`[CONFIRMED]`,
full-tree grep). Two legitimate, non-defect "coming soon" strings exist and are correctly framed
as real, disclosed product state rather than dead UI:

| ID | File:line | Finding | Status | Severity |
|---|---|---|---|---|
| B-1 | `settings/SavedSearchesSection.tsx:156` | "Stored locally in this browser. Cross-device sync coming soon.", an honest capability disclosure next to a working localStorage feature, not a placeholder standing in for missing functionality. | `[CONFIRMED]`, not a defect |, |
| B-2 | `community/CommunitySearchResults.tsx:8` | Code-comment only ("previously the masthead form fired a 'Search coming soon'"), documents a past state, not live text. | `[CONFIRMED]`, not a defect |, |

No literal `props: any` function signatures found; the `any` usage found (class 7 below) is all
`useState<any>`/`useState<any[]>`/`catch (e: any)`/untyped markdown-renderer callback params, not
bare `props: any`. No conditional-hooks or missing-deps pattern was hit by the sweep; that check
needs a full read pass to be authoritative and is flagged under Method section 5 as under-covered.

## 3. Unwired

Not independently confirmed this session beyond the 13 read-in-full files, where no unwired-prop
or always-undefined-prop pattern was found. This class needs the full read pass named in Method section 5
before it can be reported either way. `[HYPOTHESIS]`, not scored.

## 4. Parts discipline

| ID | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|
| P-1 | `docs/design/parts-brief-2026-09-18.md`'s own prior audit (`docs/design/handoff-2026-09-06/SHARED-PART-REPORT-2026-09-08.md`-lineage doc, dated in-repo 2026-09-20/22) documents **`ui/SectionHeader.tsx`** and **`DetailShell.tsx`'s own inline `<h2>`+aside** as two un-merged implementations of the same S-section header, the latter's own comment admitting it is "SectionHeading.tsx's own, declaration for declaration", hand-duplicated, not imported. | `[HYPOTHESIS]`, cited from the repo's own prior-audit doc, not independently re-diffed this session | P1 | Delete the hand-duplicated header block in `DetailShell.tsx` and import `SectionHeading` (or its sibling `SectionHeader.tsx`, the prior audit also flags that these two `ui/` files may themselves be a near-duplicate pair worth checking) in its place. | M |
| P-2 | Same prior-audit doc: **RailCard exists in three un-merged forms**, `list-surface/ListSurfaceRailCards.tsx`'s `RailCard`, `detail/DetailShell.tsx`'s `ImpactRailCard`, and `home/DashboardRailCard.tsx`, each with its own literal header type spec (10.5px/700/.12em vs `fontSize:10`/`fontWeight:800`/`letterSpacing:"0.13em"`) rather than one shared component. | `[HYPOTHESIS]`, cited from prior audit; this session's own targeted grep for `fontSize:10` in `DashboardRailCard.tsx` did not reproduce the exact literal cited (file may have been edited since 2026-09-18) so treat the exact numbers as stale but the three-implementations structure as plausible | P1 | Converge on `ListSurfaceRailCards.RailCard` (the prior audit's own read: 6 of 11 routes already use it) and delete the other two. | M |
| P-3 | Every fitness-function check this session that DOES directly gate parts discipline (F42 card-shell-outside-SectionCard, F49 parts-not-pages) is green with 0 violations, and F35 (row UX coverage) is green. | `[CONFIRMED]` by direct execution |, (positive finding) |, |, |

## 5. UX at 375px

F35 `row-ux-coverage`, the fitness function that measures every `ROW_COMPONENTS`-listed row at
375×812 and 1280×800 for squeezed-title wrap, overflow and the law-2 target floor, was run
directly against the current tree and returned **0 violations**. `[CONFIRMED]`. No accordion
`defaultOpen={i === 0}` pattern (the explicitly-forbidden CLAUDE.md pattern) was found anywhere in
`components/` by a full-tree grep. `[CONFIRMED]`.

## 6. Accessibility

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| A-1 | `sources/CanonicalSourceReview.tsx:406` | The bulk-action modal overlay (`<div className="fixed inset-0 z-50 bg-black/40 ..." onClick={...}>`) has no `role="dialog"`, no `aria-modal="true"`, and no `aria-label`. 13 other modal-like surfaces in `components/` do carry `role="dialog"`/`aria-modal` (`workspace/ArchiveDialog.tsx`, `community/GroupModals.tsx`, `community/PromotePostDialog.tsx`, `Sidebar.tsx`'s own mobile drawer, etc.), this is the one outlier. A screen-reader user tabbing into this modal gets no announcement that a dialog opened, and focus is not demonstrably trapped inside it. | `[CONFIRMED]`, file read + full-tree grep for the pattern | P1 | Add `role="dialog" aria-modal="true" aria-labelledby="<heading id>"` to the panel div (the pattern `Sidebar.tsx:472` already uses for its own drawer is the in-repo reference) and a focus trap / initial-focus-on-open, consistent with the other 13 modals. | S |
| A-2 | `community/CommunityRooms.tsx:693`, `map/MapPageView.tsx` | Two more `<div onClick>` sites beyond the CanonicalSourceReview modal backdrop, both `stopPropagation`/backdrop-dismiss handlers on non-interactive wrapper divs rather than div-as-button content triggers. Read in context: neither is a real "div pretending to be the only way to activate a control" violation, both wrap real `<button>`/`<input>` children. `[REFUTED]` as an a11y defect on inspection; listed for completeness since the class-4 grep flagged them. | `[REFUTED]` |, |, |, |

## 7. Quality

| ID | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|
| Q-1 | 23 files exceed 600 lines: `community/CommunityRooms.tsx` (1785), `community/GroupModals.tsx` (1208), `operations/RegionDimensionMatrix.tsx` (1047), `admin/AdminDashboard.tsx` (977), `sources/CanonicalSourceReview.tsx` (949), `ui/ListRow.tsx` (874), `sources/SourceAdminControls.tsx` (861), `admin/BulkImportView.tsx` (792), `admin/CoverageMatrixView.tsx` (779), `ui/CommandBar.tsx` (765), `community/CommunitySidebar.tsx` (749), `profile/UserProfilePage.tsx` (719), `list-surface/ListSurfaceShell.tsx` (704), `pages/MarketSignalDetailSurface.tsx` (702), `community/Post.tsx` (689), `onboarding/OnboardingWizard.tsx` (674), `admin/PlatformIntegrityFlagsView.tsx` (670), `regulations/RegulationDetailSurface.tsx` (654), `profile/MembersPanel.tsx` (654), `pages/SettingsPage.tsx` (638), `community/ModerationQueue.tsx` (631), `community/CommunityShell.tsx` (628), `ui/FactCard.tsx` (622). `CommunityRooms.tsx` at 1785 lines is nearly 3x the next-largest file. | `[CONFIRMED]` via `wc -l` on the full tree | P2 | `CommunityRooms.tsx` and `GroupModals.tsx` are the two to split first, both mix data-fetch, multiple distinct panel bodies and modal chrome in one file; a top engineer reviewing a diff to either would have to load nearly 2,000 lines of unrelated context to change one panel. | L (per file) |
| Q-2 | `any` typing confirmed in 20 files by full-tree grep for `: any` / `<any>` / `any[]`: `admin/AdminDashboard.tsx` (props `initialOrgs?: any[]`, `initialMembers?: any[]`, `initialStagedUpdates?: any[]`; state `useState<any[]>`, `useState<any>(null)`), `admin/CommunityPickupsQueueView.tsx`, `admin/CorpusTurnPanel.tsx`, `admin/CoverageMatrixView.tsx`, `admin/IntegrityFlagsView.tsx`, `admin/IngestRejectionsView.tsx`, `admin/PendingJurisdictionReviewView.tsx`, `admin/ResearchPipelineQueueView.tsx`, `admin/TierOpinionDisagreementsView.tsx`, `community/CommunityShell.tsx`, `community/GroupCard.tsx` (`safeJson(res): Promise<any>`), `community/GroupHeader.tsx` (same `safeJson` pattern, duplicated not shared), `sources/CanonicalSourceReview.tsx` (9 occurrences), `sources/IntersectionDetectionView.tsx`, `sources/ProvisionalReviewCard.tsx`, `sources/SourceHealthDashboard.tsx`, `sources/SourceAdminControls.tsx` (8 occurrences), `sources/ThemesView.tsx`, `resource/IntelligenceMetadataStrip.tsx`, `resource/SectorSynopsis.tsx` (10 occurrences, every markdown-renderer prop callback, `p`/`strong`/`ol`/`ul`/`li`/`h2`/`h3`/`blockquote`/`a`, typed `({ children }: any) =>`). Most are `catch (e: any)`, a widely-tolerated TS pattern, but the `useState<any[]>`/`useState<any>` and `SectorSynopsis.tsx`'s 10 untyped renderer props are real type-safety gaps, the latter is a react-markdown component-map that could use `Components` from `react-markdown` for real prop types with no behavior change. | `[CONFIRMED]` via full-tree grep, spot-verified in 6 of the 20 files by direct read | P2 | Type `AdminDashboard`'s three `initial*` props against real row shapes (`Organization[]`, `OrgMembership[]`, `StagedUpdate[]`) already defined elsewhere in the codebase; import `react-markdown`'s `Components` type into `SectorSynopsis.tsx`; extract the duplicated `safeJson` helper (`GroupCard.tsx:414`, `GroupHeader.tsx:424`, byte-similar) into one shared `community/api-client.ts` export. | M |
| Q-3 | `safeJson` helper duplicated verbatim (or near-verbatim) between `community/GroupCard.tsx:414` and `community/GroupHeader.tsx:424`, both `async function safeJson(res: Response): Promise<any> {...}`, a small instance of the F45-class duplication the fitness function's 5,867-line baseline tolerates. | `[CONFIRMED]` via read | P2 | Move to `community/api-client.ts` (which already exists and is the shared fetch layer for this directory) as a typed helper. | S |
| Q-4 | `F45-duplicate-code.mjs` baseline of 5,867 duplicated lines (see Fitness section) is a standing, accepted number, not trending down. | `[CONFIRMED]` | P2 | Not a single fix, a housekeeping target: run the function with its own diff-reporting mode (if it has one) to rank the largest duplicate blocks and clear the top 3-5 before the next audit. | M |
| Q-5 | `admin/AdminDashboard.tsx` mixes a large section-router (`renderBody`), inline `<style>` block, and three nested presentational helper components (`PlateCard`, `ReadOnlyControlsCard`, `PendingFrame`) all in one 977-line file. Functionally correct and heavily commented, but a "top engineer" review would ask for `PlateCard`/`ReadOnlyControlsCard`/`PendingFrame` to move to their own files or into `AdminTableView.tsx` alongside the other extracted primitives that file already documents extracting. | `[CONFIRMED]` via read | P2 | Extract the three helpers into `admin/AdminTableView.tsx` (which is explicitly the "shared admin primitives" file per its own header) or a new `admin/AdminDashboardParts.tsx`. | S |
| Q-6 | Client-side data fetching directly inside components rather than server components/hooks is pervasive by design in the admin surface (every admin view does its own `useEffect` + `createSupabaseBrowserClient`/`authedFetch` fetch), consistent across ~15+ admin components, so it reads as a deliberate architectural choice (admin views are all client components hitting authed API routes) rather than an accidental per-file drift. Not flagged as a defect on its own; flagged only because it multiplies the `any`-typing and duplicated-fetch-boilerplate findings above (Q-2, Q-3). | `[CONFIRMED]`, architectural observation |, | Consider one shared `useAdminResource(url)` hook (loading/error/data/refetch) to collapse the repeated `useState`×3 + `useCallback` fetch boilerplate seen identically in `IngestRejectionsView.tsx`, `CoverageMatrixView.tsx`, `CorpusTurnPanel.tsx`, `CommunityPickupsQueueView.tsx`, etc. | M |
| Q-7 | Raw hex colours (`#RRGGBB`/`#RGB`) appear in 109 of 248 files (371 occurrences) by full-tree grep. Spot-checked in the 13 read-in-full files: every occurrence found there is either (a) inside an `rgba(0,0,0,.NN)` literal (design-system-sanctioned per `AccountPrimitives.tsx`'s own header, "colours go through the T02 semantic tokens... never raw hex", rgba opacity literals are not what that rule means to forbid) or (b) a `#FFFFFF`/pure-white literal for a toggle-switch thumb / segmented-control active-state text, not a themeable brand colour. No CLAUDE.md-forbidden raw brand-hex was found in the 13 files read. The remaining 235-file, 371-occurrence total is NOT individually triaged this session (Method section 5 gap), most are very likely the same acceptable rgba/white pattern given the sample, but this is stated as `[HYPOTHESIS]` for the untriaged remainder, not `[CONFIRMED]`. | `[CONFIRMED]` for the 13 read files (no violation); `[HYPOTHESIS]` for the remaining 235 | P2 | A follow-up pass should grep specifically for hex OUTSIDE an `rgba(`/`#fff`/`#FFFFFF` context (e.g. `#[0-9A-Fa-f]{6}` not preceded by `rgba` and not equal to `#FFFFFF`/`#000000`) to separate real token-bypass violations from the acceptable rgba/white pattern at full-tree scale. | S (follow-up script), M (triage) |
| Q-8 | `node fsi-app/.discipline/fitness/runner.mjs` (the full, all-functions runner) did not complete in two background attempts (0-byte output both times, no error). The per-function direct-execution harness built for this audit (bypassing the runner) worked fine for F35/F42/F45/F49. | `[CONFIRMED]`, reproduced twice | P2 | Investigate why the full runner hangs/produces no output under a plain `node` invocation in a fresh worktree, likely a stdout-buffering or working-directory resolution issue specific to the runner's own orchestration, not the individual functions (which all ran cleanly standalone). This is itself worth a fitness-function reliability ticket: a CI gate that silently produces nothing is exactly the class-15 "a proof that does not execute is not a proof" failure mode CLAUDE.md rule 15 names. | S (investigate) |

## Top 10 a senior reviewer would call out first

1. **A-1** `[CONFIRMED]`, `CanonicalSourceReview.tsx`'s bulk modal has no `role="dialog"`/`aria-modal` while every sibling modal in the codebase does. Quick, visible, accessibility-audit-failing outlier.
2. **Q-1** `[CONFIRMED]`, `CommunityRooms.tsx` at 1,785 lines (nearly 3x the next-largest file) and `GroupModals.tsx` at 1,208, both are the kind of file a new hire opens and immediately loses confidence in the codebase over.
3. **D-1** `[CONFIRMED]`, Two components named `ItemGroup` doing unrelated jobs. A grep-first engineer (which is what this codebase's own `lane-common-contract.md` explicitly mandates, "prior art... `git grep`") will land on the wrong one.
4. **P-1 / P-2** `[HYPOTHESIS]`, SectionHeader and RailCard each exist as 2-3 un-merged implementations per the repo's own prior parts audit; unresolved as of this session.
5. **Q-2**, `SectorSynopsis.tsx`'s entire markdown-renderer component map (10 callback props) typed `any`, in a file that otherwise looks production-polished.
6. **Q-3**, `safeJson` duplicated verbatim in two sibling files in the same directory that already has a shared api-client module.
7. **Q-4**, 5,867 duplicated lines is the accepted, standing baseline for F45, not a number anyone is driving toward zero.
8. **Q-8**, The one full-repo fitness runner invocation that matters most (the umbrella `runner.mjs`) silently produced nothing twice; per the codebase's own rule 15 ("a proof that does not execute is not a proof"), this needs investigation before it's trusted as a CI gate.
9. **Q-5**, `AdminDashboard.tsx` (977 lines) carries three presentational helper components that belong in the file explicitly built to hold them (`AdminTableView.tsx`).
10. **Positive finding worth calling out too**: F35 (row-level UX-at-375px), F42 (card-shell discipline) and F49 (parts-not-pages) are all green with 0 violations when run directly, the parts-discipline tooling that IS wired is working, which is not what the volume of inline-style/design-comment scaffolding in every file might suggest at a glance.

## Decision-ready build items

1. `[CONFIRMED]` **Add `role="dialog"`/`aria-modal="true"` to `sources/CanonicalSourceReview.tsx`'s bulk modal** (line ~406). Acceptance test: axe-core (or the repo's own a11y check, if one exists) reports zero "dialog missing accessible name/role" violations on `/admin` → Sources → bulk-approve flow; keyboard Tab from the trigger button lands inside the modal, not on the page behind it.
2. `[CONFIRMED]` **Rename the local `ItemGroup` function in `CanonicalSourceReview.tsx:533`** to `SourceCandidateGroup` (or similar). Acceptance test: `grep -rn "function ItemGroup" fsi-app/src` returns exactly one match (`ui/ItemGroup.tsx`'s own export).
3. `[CONFIRMED]` **Extract `safeJson` from `GroupCard.tsx`/`GroupHeader.tsx` into `community/api-client.ts`**, typed as `Promise<unknown>` or a discriminated result type rather than `Promise<any>`. Acceptance test: both call sites import the shared helper; `grep -rn "async function safeJson" fsi-app/src/components/community` returns zero matches (only the shared export remains).
4. **Re-verify P-1/P-2 (SectionHeader and RailCard duplication) against the CURRENT tree**, since the citing doc is dated 2026-09-18/22 and this session found the exact literal numbers it quotes no longer present verbatim in `DashboardRailCard.tsx`, the underlying three-implementations structure may still be accurate but the specific evidence needs a fresh diff before it is promoted to `[CONFIRMED]`.
5. **Split `community/CommunityRooms.tsx` (1,785 lines)** along its panel boundaries (room list / room detail / composer, whatever the file's own section comments delineate) as the single highest-value file-size remediation in the register.

---

Findings status-checked with `node fsi-app/scripts/verify/audit-finding-status.mjs docs/audits/app-audit-a2-components-2026-09-30.md` (or the closest matching invocation the script supports) before commit, see commit for the tool's actual output; every finding line above carries an explicit `[CONFIRMED]`/`[HYPOTHESIS]`/`[REFUTED]` token per CLAUDE.md rule 14.

## Coverage appendix

Legend: **RF** = read in full this session (top to bottom). **SW** = swept only (full-tree grep
for every named defect pattern + import-count check where relevant; not manually read end to end).
Verdict cites a finding ID where the sweep or read produced one; "clean (swept)" means no grep
pattern in this audit's sweep set matched the file, it does not mean the file was read for logic
defects.

| File | Lines | Coverage | Verdict |
|---|---|---|---|
| AppShell.tsx | 252 | RF | Clean |
| AskAssistant.tsx | 526 | RF | Clean |
| BackToTop.tsx | 33 | RF | Clean |
| Sidebar.tsx | 529 | RF | Clean; reference implementation for drawer a11y (role=dialog, aria-modal) |
| account/AccountPrimitives.tsx | 509 | RF | Clean |
| admin/AdminDashboard.tsx | 977 | RF | Q-1, Q-2, Q-5 |
| admin/AdminTableView.tsx | 382 | RF | Clean |
| admin/AssumptionRegisterPanel.tsx | 210 | RF | Clean |
| admin/BulkImportView.tsx | 792 | RF | Q-1 (size) |
| admin/CommunityPickupsQueueView.tsx | 328 | RF | Q-2 |
| admin/CorpusTurnPanel.tsx | 343 | RF | Q-2 |
| admin/CoverageCatalogueView.tsx | 153 | RF | Clean |
| admin/CoverageMatrixView.tsx | 779 | RF | Q-1, Q-2 |
| admin/ErrorGroupsView.tsx | 134 | RF | Clean |
| admin/FactCardGallery.tsx | 115 | RF | Clean |
| admin/IngestRejectionsView.tsx | 356 | RF | Clean |
| admin/IntegrityFlagsView.tsx | 448 | SW | Q-2 (any) |
| admin/InvitationsPanel.tsx | 326 | SW | clean (swept) |
| admin/IssueFilterCaption.tsx | 68 | SW | clean (swept) |
| admin/OrganizationsTable.tsx | 250 | SW | clean (swept) |
| admin/PartsList.tsx | 39 | SW | clean (swept) |
| admin/PartsPageHeading.tsx | 25 | SW | clean (swept) |
| admin/PendingJurisdictionReviewView.tsx | 366 | SW | Q-2 (any) |
| admin/PlatformIntegrityFlagsView.tsx | 670 | SW | Q-1 (size) |
| admin/ProvenanceFailures.tsx | 175 | SW | clean (swept) |
| admin/ResearchPipelineQueueView.tsx | 283 | SW | Q-2 (any) |
| admin/SectionIndexGallery.tsx | 40 | SW | clean (swept) |
| admin/StatutoryRowsUpload.tsx | 275 | SW | clean (swept) |
| admin/TierOpinionDisagreementsView.tsx | 467 | SW | Q-2 (any) |
| admin/UpcomingObligationsPanel.tsx | 252 | SW | clean (swept) |
| admin/redesign/AdminIssuesRail.tsx | 252 | SW | clean (swept) |
| admin/redesign/FlagsRejectionsQueue.tsx | 163 | SW | clean (swept) |
| admin/redesign/MembersPanel.tsx | 580 | SW | clean (swept) |
| admin/redesign/WorkspacesUsageRow.tsx | 231 | SW | clean (swept) |
| app-shell-banner.ts | 65 | SW | clean (swept) |
| auth/AuthFrame.tsx | 250 | SW | clean (swept) |
| auth/AuthPanel.tsx | 157 | SW | clean (swept) |
| auth/AuthProvider.tsx | 260 | SW | clean (swept) |
| auth/UserMenuDropdown.tsx | 134 | SW | clean (swept) |
| auth/identity-loader.ts | 130 | SW | clean (swept) |
| community/AuthorIdentityChip.tsx | 65 | SW | clean (swept) |
| community/BenchmarksPanel.tsx | 330 | SW | clean (swept) |
| community/BrowseGroupsGrid.tsx | 113 | SW | clean (swept) |
| community/CommunityRegionTabs.tsx | 118 | SW | clean (swept) |
| community/CommunityRooms.tsx | 1785 | SW | Q-1 (size, largest file), A-2 (onClick, refuted) |
| community/CommunitySearchBar.tsx | 188 | SW | clean (swept) |
| community/CommunitySearchResults.tsx | 427 | SW | B-2 (non-defect) |
| community/CommunityShell.tsx | 628 | SW | Q-1 (size), Q-2 (any) |
| community/CommunitySidebar.tsx | 749 | SW | Q-1 (size) |
| community/CorroborationChip.tsx | 48 | SW | clean (swept) |
| community/CouncilMembersRail.tsx | 289 | SW | clean (swept) |
| community/EntityDiscoveryPanel.tsx | 265 | SW | clean (swept) |
| community/EntityPicker.tsx | 250 | SW | clean (swept) |
| community/EvidenceAgeChip.tsx | 41 | SW | clean (swept) |
| community/GroupCard.tsx | 420 | SW | Q-2, Q-3 (safeJson dup) |
| community/GroupHeader.tsx | 430 | SW | Q-2, Q-3 (safeJson dup) |
| community/GroupModals.tsx | 1208 | SW | Q-1 (size, 2nd largest) |
| community/HowPublishingWorks.tsx | 137 | SW | clean (swept) |
| community/ModerationActions.tsx | 420 | SW | clean (swept) |
| community/ModerationQueue.tsx | 631 | SW | Q-1 (size) |
| community/NoDirectMessagingNotice.tsx | 33 | SW | clean (swept) |
| community/NotificationsBell.tsx | 143 | SW | clean (swept) |
| community/NotificationsList.tsx | 481 | SW | clean (swept) |
| community/PeerOrgDirectoryTable.tsx | 156 | SW | clean (swept) |
| community/Post.tsx | 689 | SW | Q-1 (size) |
| community/PostComposer.tsx | 372 | SW | clean (swept) |
| community/PostList.tsx | 343 | SW | clean (swept) |
| community/ProfileForm.tsx | 327 | SW | clean (swept) |
| community/PromotePostButton.tsx | 107 | SW | clean (swept) |
| community/PromotePostDialog.tsx | 390 | SW | clean (swept) |
| community/PromotionStateBadge.tsx | 75 | SW | clean (swept) |
| community/ReplyComposer.tsx | 192 | SW | clean (swept) |
| community/ReportPostMenu.tsx | 363 | SW | clean (swept) |
| community/RoleBadge.tsx | 62 | SW | clean (swept) |
| community/VerifierBadge.tsx | 69 | SW | clean (swept) |
| community/api-client.ts | 464 | SW | clean (swept) |
| community/identity-format.ts | 75 | SW | clean (swept) |
| community/types.ts | 116 | SW | clean (swept) |
| dashboard/DashboardBrief.tsx | 420 | SW | clean (swept) |
| dashboard/DashboardMasthead.tsx | 90 | SW | clean (swept) |
| dashboard/brief-title.ts | 20 | SW | clean (swept) |
| detail/DetailShell.tsx | 581 | SW | P-1 (hypothesis, SectionHeader dup) |
| detail/FactBlocks.tsx | 91 | SW | clean (swept) |
| detail/RequirementTrajectory.tsx | 72 | SW | clean (swept) |
| detail/SourcesGrid.tsx | 90 | SW | clean (swept) |
| detail/primitives.tsx | 126 | SW | clean (swept) |
| figures/EstimatedFigure.tsx | 157 | SW | clean (swept) |
| figures/NoticesRail.tsx | 134 | SW | clean (swept) |
| figures/RecalculationNotice.tsx | 131 | SW | clean (swept) |
| figures/StatutoryFigure.tsx | 100 | SW | clean (swept) |
| home/DashboardRailCard.tsx | 48 | SW | P-2 (hypothesis, RailCard triplication) |
| home/DashboardTopPriority.tsx | 513 | SW | clean (swept) |
| home/DashboardWatchlist.tsx | 127 | SW | clean (swept) |
| layout/PageFrame.tsx | 83 | SW | clean (swept) |
| layout/TopBar.tsx | 202 | SW | clean (swept) |
| ledger/VirtualizedRowList.tsx | 193 | SW | clean (swept) |
| list-surface/ListSurfaceRailCards.tsx | 572 | SW | P-2 (hypothesis, RailCard) |
| list-surface/ListSurfaceShell.tsx | 704 | SW | Q-1 (size) |
| list-surface/ListSurfaceSortRow.tsx | 169 | SW | clean (swept) |
| list-surface/list-surface-helpers.ts | 487 | SW | clean (swept) |
| list-surface/useListSurfaceFilter.ts | 86 | SW | clean (swept) |
| map/MapPageView.tsx | 516 | SW | A-2 (onClick, refuted) |
| map/MapView.tsx | 346 | SW | clean (swept) |
| map/jurisdictionCentroids.ts | 42 | SW | clean (swept) |
| market/CarbonCostOverlay.tsx | 296 | SW | clean (swept) |
| market/IndexationPanel.tsx | 54 | SW | clean (swept) |
| market/IndexationPanelView.tsx | 83 | SW | clean (swept) |
| market/MarketComparativeRibbon.tsx | 413 | SW | clean (swept) |
| market/MarketIntelLedger.tsx | 355 | SW | clean (swept) |
| market/MarketSeriesBoard.tsx | 445 | SW | clean (swept) |
| market/OemRoadmapPanel.tsx | 53 | SW | clean (swept) |
| market/OemRoadmapPanelView.tsx | 66 | SW | clean (swept) |
| market/ReroutingPanel.tsx | 46 | SW | clean (swept) |
| market/ReroutingPanelView.tsx | 67 | SW | clean (swept) |
| market/SurchargeAuditPanel.tsx | 66 | SW | clean (swept) |
| market/SurchargeAuditPanelView.tsx | 67 | SW | clean (swept) |
| market/TrajectoryBars.tsx | 110 | SW | clean (swept) |
| onboarding/InvitationLandingPage.tsx | 238 | SW | clean (swept) |
| onboarding/NoWorkspaceLanding.tsx | 314 | SW | clean (swept) |
| onboarding/OnboardingStepper.tsx | 61 | SW | clean (swept) |
| onboarding/OnboardingWizard.tsx | 674 | SW | Q-1 (size) |
| operations/AutomateVsHireCalculator.tsx | 186 | SW | clean (swept) |
| operations/AuxiliaryEnergyPanel.tsx | 54 | SW | clean (swept) |
| operations/AuxiliaryEnergyPanelView.tsx | 72 | SW | clean (swept) |
| operations/DqiPanel.tsx | 52 | SW | clean (swept) |
| operations/DqiPanelView.tsx | 64 | SW | clean (swept) |
| operations/GridQueuePanel.tsx | 40 | SW | clean (swept) |
| operations/GridQueuePanelView.tsx | 78 | SW | clean (swept) |
| operations/OperationsCalculatorPageView.tsx | 89 | SW | clean (swept) |
| operations/OperationsDetailSurface.tsx | 453 | SW | clean (swept) |
| operations/OperationsItemsView.tsx | 356 | SW | clean (swept) |
| operations/OperationsLedger.tsx | 555 | SW | clean (swept) |
| operations/RegionDimensionMatrix.tsx | 1047 | SW | Q-1 (size, 3rd largest); parts-inventory cites its `MatrixFactCard` migration as ordered-but-not-executed (not re-verified this session) |
| pages/MarketSignalDetailSurface.tsx | 702 | SW | Q-1 (size) |
| pages/SettingsPage.tsx | 638 | SW | Q-1 (size) |
| profile/MembersPanel.tsx | 654 | SW | Q-1 (size) |
| profile/NotificationPreferences.tsx | 272 | SW | clean (swept) |
| profile/OrganizationPanel.tsx | 293 | SW | clean (swept) |
| profile/UserProfilePage.tsx | 719 | SW | Q-1 (size) |
| providers/QueryProvider.tsx | 43 | SW | clean (swept) |
| regulations/AffectedLanesCard.tsx | 159 | SW | clean (swept) |
| regulations/CorridorsAppliedStrip.tsx | 46 | SW | clean (swept) |
| regulations/CorridorsAppliedStripView.tsx | 117 | SW | clean (swept) |
| regulations/DismissedStash.tsx | 120 | SW | clean (swept) |
| regulations/EudrCustodyPanel.tsx | 68 | SW | clean (swept) |
| regulations/EudrCustodyPanelView.tsx | 122 | SW | clean (swept) |
| regulations/ObligationRegister.tsx | 177 | SW | clean (swept) |
| regulations/ObligationRegisterFilterBar.tsx | 430 | SW | clean (swept) |
| regulations/ObligationRegisterPageView.tsx | 205 | SW | clean (swept) |
| regulations/OwnerTeamCard.tsx | 174 | SW | clean (swept) |
| regulations/PriorityDropdown.tsx | 462 | SW | clean (swept) |
| regulations/RegulationDetailSurface.tsx | 654 | SW | Q-1 (size) |
| regulations/RegulationsLedger.tsx | 350 | SW | clean (swept) |
| regulations/UpcomingObligationsStrip.tsx | 102 | SW | clean (swept) |
| regulations/UpcomingObligationsStripView.tsx | 274 | SW | clean (swept) |
| regulations/format-fixed-date.ts | 68 | SW | clean (swept) |
| research/CredibilityChipAuthority.tsx | 119 | SW | clean (swept) |
| research/CredibilityChipEvidence.tsx | 79 | SW | clean (swept) |
| research/CredibilityChipShared.tsx | 163 | SW | clean (swept) |
| research/ResearchFindingDetailSurface.tsx | 436 | SW | clean (swept) |
| research/ResearchLedger.tsx | 435 | SW | clean (swept) |
| research/ResearchThemeCards.tsx | 97 | SW | clean (swept) |
| research/ThemeStrip.tsx | 323 | SW | clean (swept) |
| resource/IntelligenceBrief.tsx | 536 | SW | clean (swept) |
| resource/IntelligenceMetadataStrip.tsx | 213 | SW | Q-2 (any) |
| resource/SectorSynopsis.tsx | 413 | SW | Q-2 (10 any-typed renderer props) |
| search/SearchResultsView.tsx | 105 | SW | clean (swept) |
| settings/ArchiveViewer.tsx | 224 | SW | clean (swept) |
| settings/BriefingScheduleSection.tsx | 306 | SW | clean (swept) |
| settings/DataSummary.tsx | 89 | SW | clean (swept) |
| settings/SavedSearchesSection.tsx | 409 | SW | B-1 (non-defect) |
| settings/Spec09CsvUpload.tsx | 237 | SW | clean (swept) |
| settings/SupersessionHistory.tsx | 79 | SW | clean (swept) |
| shared/GfmSection.tsx | 152 | SW | clean (swept) |
| shared/MoreBelowDisclosure.tsx | 57 | SW | clean (swept) |
| shared/PeersDiscussingStrip.tsx | 128 | SW | clean (swept) |
| shell/ItemConnectionsCard.tsx | 284 | SW | clean (swept) |
| shell/PageMasthead.tsx | 152 | SW | clean (swept) |
| shell/RelevanceBadge.tsx | 58 | SW | clean (swept) |
| shell/RelevanceBadgeClient.tsx | 47 | SW | clean (swept) |
| shell/bootstrap-seed.ts | 153 | SW | clean (swept) |
| sources/B2RegenerationNote.tsx | 78 | SW | clean (swept) |
| sources/CanonicalSourceReview.tsx | 949 | SW | Q-1 (size), Q-2 (any, 9x), D-1 (ItemGroup collision), A-1 (modal a11y) |
| sources/IntersectionDetectionView.tsx | 316 | SW | Q-2 (any) |
| sources/ProvisionalReviewCard.tsx | 429 | SW | Q-2 (any) |
| sources/ProvisionalReviewTable.tsx | 385 | SW | clean (swept) |
| sources/SourceAdminControls.tsx | 861 | SW | Q-1 (size), Q-2 (any, 8x) |
| sources/SourceHealthDashboard.tsx | 547 | SW | Q-2 (any) |
| sources/SourceTierAuditPanel.tsx | 167 | SW | clean (swept) |
| sources/SourceTierLegend.tsx | 262 | SW | clean (swept) |
| sources/ThemesView.tsx | 295 | SW | Q-2 (any) |
| telemetry/GlobalErrorReporter.tsx | 114 | SW | clean (swept) |
| ui/Absence.tsx | 207 | SW | clean (swept) |
| ui/ActionCard.tsx | 289 | SW | clean (swept) |
| ui/ActionRow.tsx | 218 | SW | clean (swept); 8 importers, not dead |
| ui/BandGradientRule.tsx | 46 | SW | clean (swept) |
| ui/BandTile.tsx | 184 | SW | clean (swept); 3 importers, not dead |
| ui/BandTileRow.tsx | 45 | SW | clean (swept); 3 importers, not dead |
| ui/Button.tsx | 55 | SW | clean (swept) |
| ui/CardFoot.tsx | 113 | SW | clean (swept); 3 importers, not dead |
| ui/Chips.tsx | 374 | SW | clean (swept) |
| ui/CommandBar.tsx | 765 | SW | Q-1 (size) |
| ui/DetailSubSection.tsx | 33 | SW | clean (swept); 3 importers, not dead |
| ui/DetailTagRow.tsx | 76 | SW | clean (swept); 1 importer, not dead |
| ui/ErrorState.tsx | 44 | SW | clean (swept) |
| ui/FactCard.tsx | 622 | SW | Q-1 (size) |
| ui/FilePickRow.tsx | 57 | SW | clean (swept); 2 importers, not dead |
| ui/ImpactMeter.tsx | 300 | SW | clean (swept) |
| ui/InlineErrorBanner.tsx | 33 | SW | clean (swept); 2 importers, not dead |
| ui/ItemGroup.tsx | 176 | RF (read for D-1 cross-reference) | Clean; canonical, well-documented, honest data-gap handling |
| ui/ListRow.tsx | 874 | SW | Q-1 (size) |
| ui/Masthead.tsx | 290 | SW | clean (swept) |
| ui/MilestoneTimeline.tsx | 93 | SW | clean (swept); 1 importer, not dead |
| ui/RailCard.tsx | 130 | SW | clean (swept) |
| ui/RelativeTime.tsx | 35 | SW | clean (swept) |
| ui/RowTable.tsx | 371 | SW | clean (swept); 6 importers, not dead |
| ui/SectionCard.tsx | 167 | SW | clean (swept) |
| ui/SectionHeader.tsx | 116 | SW | P-1 (hypothesis) |
| ui/SectionHeading.tsx | 113 | SW | P-1 (hypothesis) |
| ui/SectionIndex.tsx | 136 | SW | clean (swept) |
| ui/SectionIndexLink.tsx | 39 | SW | clean (swept); 1 importer, not dead |
| ui/SectionLabel.tsx | 26 | SW | clean (swept); 3 importers, not dead |
| ui/SectionRule.tsx | 38 | SW | clean (swept) |
| ui/Skeleton.tsx | 122 | SW | clean (swept) |
| ui/StatBlock.tsx | 185 | SW | clean (swept) |
| ui/StateNote.tsx | 113 | SW | clean (swept) |
| ui/SystemErrorBanner.tsx | 51 | SW | clean (swept); 4 importers, not dead |
| ui/TabRow.tsx | 130 | SW | clean (swept); 4 importers, not dead |
| ui/TagPopover.tsx | 328 | SW | clean (swept); 1 importer, not dead |
| ui/Timeline.tsx | 231 | SW | clean (swept) |
| ui/Toast.tsx | 59 | SW | clean (swept); 3 importers, not dead |
| ui/WatchButton.tsx | 523 | SW | clean (swept); 8 importers, not dead |
| ui/__fixtures__/full-brief-fixture.ts | 35 | SW | clean (swept); fixture, not a component |
| ui/__fixtures__/list-row-fixture.ts | 131 | SW | clean (swept); fixture |
| ui/__fixtures__/nav-counts-fixture.ts | 40 | SW | clean (swept); fixture |
| ui/__fixtures__/record-grade-fixture.ts | 46 | SW | clean (swept); fixture |
| ui/__fixtures__/search-results-fixture.ts | 82 | SW | clean (swept); fixture |
| ui/band-context.tsx | 38 | SW | clean (swept) |
| ui/commandBarKeyboard.ts | 121 | SW | clean (swept) |
| ui/milestone-timeline-classify.ts | 38 | SW | clean (swept) |
| ui/relative-time-format.ts | 42 | SW | clean (swept) |
| ui/section-index-styles.ts | 65 | SW | clean (swept) |
| ui/section-title-style.ts | 18 | SW | clean (swept) |
| ui/skeleton-page.tsx | 29 | SW | clean (swept) |
| ui/tagPopoverKeyboard.ts | 102 | SW | clean (swept) |
| ui/timeline-dot-styles.ts | 39 | SW | clean (swept) |
| watchlist/WatchlistSurface.tsx | 473 | SW | clean (swept) |
| workspace/ArchiveDialog.tsx | 423 | SW | clean (swept) |

248 files listed (13 RF, 235 SW, 1 of the 235 additionally read for cross-reference). Total lines
63,952, matching the `wc -l` run at session start.
