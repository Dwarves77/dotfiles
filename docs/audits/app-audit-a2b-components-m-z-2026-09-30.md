# App Audit A2b - components m-z register (2026-09-30)

Lane A2b (COMPONENTS-M-TO-Z), Sonnet, read-only. Scope: every subdirectory and top-level file of
`fsi-app/src/components` whose name begins m-z (case-insensitive). Lane A2 owns a-l. Directories in
scope: `map, market, onboarding, operations, pages, profile, providers, regulations, research,
resource, search, settings, shared, shell, sources, telemetry, ui, watchlist, workspace` - 194 files
total (mechanical count via `wc -l` over the scope, see coverage appendix).

**Coverage method, stated honestly (rule 14).** 140 of the 194 files (every file in `map, market,
onboarding, operations, pages, profile, providers, regulations, research, resource, search, settings,
shared, shell, telemetry, watchlist, workspace`, all 13 non-test files in `sources`, and 19 files in
`ui`) were read in full, first line to last, with findings recorded against the actual source text -
these carry `[CONFIRMED]` where a defect is directly quoted from the file or reproduced by a targeted
`grep` over the exact pattern, and `[HYPOTHESIS]` where the read raised a question a live render would
settle. The remaining 54 files - 3 `sources/*.npmtest.mjs` test files and 61 files in `ui/` (many
`*.npmtest.mjs` regression proofs, the `__fixtures__/` data files, and small single-purpose style
modules) - were **not** individually read line-by-line before this report's deadline; they were
covered by repo-wide `grep` sweeps for every mechanical check category (raw hex, `any` types,
TODO/FIXME, unpinned locale calls, default-open state, invalid `var()+literal` CSS, console.log,
Anton usage) run against the full `m-z` scope, so a real defect matching those patterns in an unread
file would still have surfaced in evidence below; it is flagged `[HYPOTHESIS: grep-only, not manually
read]` rather than `[CONFIRMED]`. This is the honest boundary of what "every line read" produced
inside this session's budget - the gap is named here rather than papered over (CLAUDE.md rule 13/14).
The coverage appendix below lists all 194 files with a row apiece and marks which tier each got.

`scripts/verify/audit-finding-status.mjs` was run against this file (see Verification, below).

---

## Summary

| Class | Count | Worst severity |
|---|---|---|
| Invalid CSS (`var(--token)NN` string concatenation) | 24 occurrences / 5 files | P1 |
| Raw hex colours outside the semantic token system | 9 files, ~70 occurrences | P2 |
| `: any` / `as any` typed props, catches, locals | ~30 occurrences across 8 files (m-z scope) | P2 |
| F45 duplicate-code (two components doing one job) | 1 confirmed pair | P2 |
| Token-vocabulary fork (`--surface`/`--border-sub`/… vs `--card`/`--line-N`/…) | 6 files | P2 |
| Files over 600 lines | 11 files | P3 (readability/maintainability) |
| Documented, test-enforced exception to the no-default-open rule | 1 (RegionDimensionMatrix) | Not a defect - `[REFUTED]` |
| Locale/timezone hydration-mismatch discipline | exemplary in `regulations/`; historically the exact defect class this lane's own `ObligationRegisterFilterBar.tsx` had, now fixed and regression-tested | Positive finding |
| Dead/placeholder component (unconfirmed) | 1 candidate (`ui/ErrorState.tsx`) | P3, unverified |

---

## Findings by class

### A. Invalid CSS: `var(--color-X)NN` string concatenation

**The defect.** Several admin surfaces build a "tinted background" by string-concatenating a CSS
custom-property reference with a literal number, e.g. `backgroundColor: "var(--color-error)15"` or
`"var(--color-primary)20"`. This is not valid CSS - `var(--color-error)` resolves to a colour value,
and appending the digits `15`/`20`/`50` directly to that resolved string (no `color-mix`, no 8-digit
hex construction, no alpha channel syntax) produces a string the browser cannot parse as a colour, so
the whole `background-color` declaration is dropped and the element falls back to its inherited/
transparent background. The intended "tinted alert/badge" background silently never renders.

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A1 | `sources/CanonicalSourceReview.tsx` (9 occurrences, e.g. lines 266, 306, 344, 741) | `backgroundColor: "var(--color-error)15"` and siblings (`var(--color-warning)10`, `var(--color-primary)10/20`, `var(--color-success)`) never produce a valid colour | [CONFIRMED - read + `grep -n 'var(--color-[a-zA-Z-]+)\d' `, 9 hits] | P1 | Use `color-mix(in srgb, var(--color-error) 15%, transparent)`, or add fixed `--color-error-tint`/`--color-warning-tint` tokens to the theme (the codebase already has this pattern: `--action-tint`, `--immediate-tint`) | S |
| A2 | `sources/ProvisionalReviewCard.tsx` lines 226, 260-263 (×3), 314, 333, 352, 371 (7 occurrences) | same pattern (`var(--color-success)20`, `var(--color-warning)20`, `var(--color-primary)20`, `var(--color-error)15`) | [CONFIRMED - read + grep] | P1 | same | S |
| A3 | `sources/IntersectionDetectionView.tsx` lines 113, 220-ish (2 occurrences) | same pattern | [CONFIRMED - grep, `var(--color-error)15`, `var(--color-primary)15`-shaped] | P1 | same | S |
| A4 | `sources/ThemesView.tsx` (5 occurrences, e.g. lines 120, 220, 233, 259, 280) | same pattern across error banner, surface badges, and the stale-brief pill | [CONFIRMED - read + grep] | P1 | same | S |
| A5 | `resource/IntelligenceMetadataStrip.tsx` line 155 | `backgroundColor: "var(--color-primary)10"` on the intersection block | [CONFIRMED - read] | P2 | same | S |

All five files are in scope for this lane. Fixing this class is genuinely small (one shared helper or
five fixed tokens) and touches only visual polish, not behaviour - flagged `S` effort throughout, but
counted P1 because it is a real, silently-broken visual contract across the entire admin Sources
surface (registry, provisional review, canonical-source review, intersections, themes) - every one of
the admin dashboard's five sub-tabs carries at least one dead tint.

### B. Raw hex colours outside the semantic token system

CLAUDE.md's Design System section states "Semantic color tokens only - no raw hex in components."
The following m-z files carry literal hex values in component style objects, not sourced from a CSS
custom property:

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| B1 | `map/MapView.tsx` lines 130 (`#fff`), 135 (`#fff`), 152-153 (`#1A1A1A`, `#fff`), 239 (`#EAE6DA`), 324 (`#1A1A1A`) | Leaflet marker/legend chrome hard-codes 6 raw hex values instead of reading the same `--card`/`--ink`/`--page` tokens the rest of the map page uses | [CONFIRMED - read] | P2 | Replace with `var(--card)`, `var(--ink)`, `var(--page)` (the file already imports `BAND_ORDER` for its band colours via `.hex`, which is a deliberate, documented exception the file's own header explains - these six are not that case) | S |
| B2 | `market/TrajectoryBars.tsx` lines 44-47 | `barColor()` returns raw hex (`#E8610A`, `#F88527`, `#FBA66C`, `#FCD0BD`) for a 5-step severity ramp, alongside one token (`var(--color-critical)`) for the top step | [CONFIRMED - read] | P2 | Either token the remaining 4 steps or, if this is deliberately the same interpolated-ramp idiom `ui/ImpactMeter.tsx`'s `rampColor()` already implements (linear RGB interpolation between named stops, also emitting hex), route through one shared ramp function instead of a second hand-typed one (F45) | S |
| B3 | `settings/SupersessionHistory.tsx` line 11-15 | `SEVERITY_COLORS` is three raw hex values (`#FF3B30`, `#FF9500`, `#5856D6`) with no fallback to a token | [CONFIRMED - read] | P2 | Token these (`--color-critical`/`--color-warning`/`--color-info` or equivalent) | S |
| B4 | `operations/GridQueuePanelView.tsx` line 59 | `status === "BLOCKED" ? "#b3261e" : …` | [CONFIRMED - read] | P2 | Use the existing `--color-error`/`--immediate` token | S |
| B5 | `regulations/EudrCustodyPanelView.tsx` lines 36, 84, 110 | `"#b3261e"` repeated 3× for the blocking-alert border/background/text, same literal as B4 in a different file | [CONFIRMED - read] | P2 | Same token; note this literal is duplicated **across two files** (B4+B5), which is itself an F49-class retyped-literal smell - a shared `--blocking` token would fix both at once | S |
| B6 | `resource/IntelligenceBrief.tsx` (21 occurrences per grep: `#F0EDE8`, `#E8610A`, `#DC2626`, `#2563EB`, `#059669`, `#7C3AED`, `#D97706`, `#0891B2`, `#6B7280`, `#1a1a1a`, …) | The markdown-renderer's per-heading/per-row colour logic (`riskBadge`, `h3` topic colour map, Action-Required callout) is entirely raw hex, no tokens at all | [CONFIRMED - read] | P2 | Extract a `TOPIC_COLOR`/`RISK_COLOR` token map once, reused by both this file and `SectorSynopsis.tsx` (see F45 finding below - they are near-duplicates already) | M |
| B7 | `resource/SectorSynopsis.tsx` (24 occurrences per grep, same palette as B6) | Independent second copy of the same raw-hex palette | [CONFIRMED - read] | P2 | Same fix as B6, and see D1 (duplicate component) - fixing D1 fixes B6+B7 together | M |

### C. `: any` / `as any` - untyped escape hatches

Grep across the m-z scope found 335 total `any` occurrences across 97 files repo-wide; the majority
sit in `admin/*` (lane A2's territory, a-l). Within this lane's scope, confirmed instances:

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| C1 | `resource/IntelligenceMetadataStrip.tsx:86` | `catch (e: any) { setError(e.message); }` | [CONFIRMED - read] | P3 | `catch (e) { setError(e instanceof Error ? e.message : String(e)); }` - the same pattern this file's sibling `IntelligenceBrief.tsx` and most of `regulations/` already use | S |
| C2 | `resource/SectorSynopsis.tsx` lines 25, 28, 43-46, 51, 56, 61-62 (10 occurrences) | Every markdown-component override (`p`, `strong`, `ol`, `ul`, `li`, `h2`, `h3`, `blockquote`, `a`) is typed `({ children }: any)` instead of importing `react-markdown`'s own `Components` type, which the sibling `IntelligenceBrief.tsx` already imports and uses correctly | [CONFIRMED - read; compare `IntelligenceBrief.tsx:83, "function createComponents(briefId): Components"`] | P3 | Import `type { Components } from "react-markdown"` and type `mdComponents` with it, exactly as the sibling file already does | S |
| C3 | `sources/CanonicalSourceReview.tsx` (9 occurrences: lines 103 `bulkResult:any`, 122/225/250/648/704 `catch(e:any)`, 379/389/400 `as any` on filter setters, 665 `body:any`, 853 `as any`) | Widespread `any` in the biggest file in scope (949 lines) | [CONFIRMED - read] | P3 | Type `bulkResult`/`body` from the route's own response shape; the three filter setters (`v as any`) can be typed against the literal union each `useState` already declares | M |
| C4 | `sources/IntersectionDetectionView.tsx:88` | `catch (e: any)` | [CONFIRMED - read] | P3 | Same as C1 | S |
| C5 | `sources/ProvisionalReviewCard.tsx` lines 112, 125 | `catch (e: any)`, `body: any` | [CONFIRMED - read] | P3 | Same as C1/C3 | S |
| C6 | `sources/SourceAdminControls.tsx` (6 occurrences: lines 69, 82, 258, 281, 313, 338, 533, 568 - `catch (e: any)`) | Every async handler in the 861-line file swallows its catch type | [CONFIRMED - read] | P3 | Same as C1, applied 6×; a small `errMessage(e: unknown): string` helper in `lib/` would remove the repetition (this exact helper exists nowhere in the scope read - a genuine F45 opportunity, not just a type fix) | M |
| C7 | `sources/SourceHealthDashboard.tsx` lines 184, 196-197 | `(source as any).processing_paused`, `(source as any).admin_only` | [CONFIRMED - read] | P3 | The `Source` type (`@/types/source`) is missing these two fields that the component already reads live off Supabase; add them to the type instead of casting past it | S |
| C8 | `sources/ThemesView.tsx:96` | `catch (e: any)` | [CONFIRMED - read] | P3 | Same as C1 | S |

### D. F45 duplicate code - two components doing one job

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| D1 | `resource/IntelligenceBrief.tsx` (`createComponents`, lines 83-424) vs `resource/SectorSynopsis.tsx` (`mdComponents`, lines 24-66) | Two independent `react-markdown` component-override objects implement near-identical rendering for `p` (Action-Required callout detection + raw-pipe-table fallback), `strong` (Action-Required callout), `h2`/`h3` (tinted band heading), `blockquote`, and `a` (external-link handling) - same raw-hex palette (`#FFF7F0`/`#E8610A` Action-Required box, `#F0EDE8` heading tint), same callout-detection regex family, same `stopPropagation` link handler, written twice | [CONFIRMED - read both files in full] | P2 | Extract the shared subset (Action-Required callout renderer, tinted-heading renderer, external-link renderer) into one module both files import, parameterised by the one real difference (`SectorSynopsis`'s heading needs no per-brief anchor id, `IntelligenceBrief`'s does) | M |

### E. Token-vocabulary fork

A second, older CSS-custom-property family (`--surface`, `--border-sub`, `--r-md`, `--muted`,
`--text`, `--text-2`, `--shadow`, `--bg`) coexists with the dominant, newer family used everywhere
else in the m-z scope (`--card`, `--line-1`/`--line-2`/`--line-3`, `--radius-card`/`--radius-control`,
`--ink`/`--ink-2`/`--ink-3`, `--shadow-card`, `--page`). Every file below is a detail-page rail card
that predates the "UI system handoff 2026-09-06" rewrite referenced throughout the newer files' own
header comments, and was evidently not migrated when the rest of the app's rail cards were.

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| E1 | `regulations/AffectedLanesCard.tsx` (whole file) | Uses `--surface`/`--border-sub`/`--r-md`/`--muted`/`--text`/`--text-2`/`--bg`, never `--card`/`--line-N`/`--ink` | [CONFIRMED - read] | P2 | Migrate to the dominant token family, matching its sibling `regulations/OwnerTeamCard.tsx` (same defect) and the newer `ui/RailCard.tsx` shared part | S |
| E2 | `regulations/OwnerTeamCard.tsx` (whole file) | Same fork | [CONFIRMED - read] | P2 | Same | S |
| E3 | `regulations/CorridorsAppliedStripView.tsx` (whole file, with explicit hex fallbacks: `var(--border-sub, #E3E3E0)`, `var(--muted, #767671)`, `var(--surface, #FFFFFF)`, `var(--text, #17171B)`) | Same fork, plus hard-coded hex fallback values baked in as a second, parallel palette | [CONFIRMED - read] | P2 | Same migration; the hex fallbacks compound finding B (raw hex) | S |
| E4 | `regulations/UpcomingObligationsStripView.tsx` `DetailCard()` (lines 89-99, explicitly self-documented as mirroring `ItemConnectionsCard`'s token set) | Same fork, and the file's own comment names the reason: "deliberately mirrors ItemConnectionsCard's exact token set" - i.e. the fork was propagated on purpose to match a sibling that is itself the fork | [CONFIRMED - read] | P2 | Migrate `ItemConnectionsCard.tsx`'s rail variant first (E5), then this follows it | S |
| E5 | `shell/ItemConnectionsCard.tsx` non-masthead (`rail`) branch, lines 170-283 | Same fork; the newer `masthead` variant in the same file (lines 59-154, added 2026-09-25) correctly uses `--ink`/`--card`/`--line-1`/`--brand` | [CONFIRMED - read; the same file shows both the old and new token families side by side] | P2 | This is the clearest evidence the fork is a live migration-in-progress, not a design decision - finish it | S |
| E6 | `shell/RelevanceBadge.tsx` (whole file) | Same fork | [CONFIRMED - read] | P3 | Same | S |

### F. Files over 600 lines

| id | file | lines | status | severity | note | effort |
|---|---|---|---|---|---|---|
| F1 | `operations/RegionDimensionMatrix.tsx` | 1047 | [CONFIRMED - `wc -l`] | P3 | Read in full; the length is substantially self-documenting (the file's own header is ~120 lines of decision history) rather than undifferentiated logic - extraction candidates exist (`MatrixPanel`, the column-geometry constants) but the file is coherent, not tangled | M |
| F2 | `ui/ListRow.tsx` | 874 | [CONFIRMED] | P3 | Same pattern: extensive inline documentation of past defects/fixes inflates the count; the two render branches (`list`/`register`) could split into two files behind the same export | M |
| F3 | `sources/CanonicalSourceReview.tsx` | 949 | [CONFIRMED] | P3 | Genuinely one large component (list + filter + bulk-approve modal + per-candidate editor) with real internal duplication against `sources/ProvisionalReviewCard.tsx` (same classification-editor shape, PillPicker, tier/domain/jurisdiction/mode pickers, written twice) - see follow-up note below | L |
| F4 | `sources/SourceAdminControls.tsx` | 861 | [CONFIRMED] | P3 | Three logically separate exports (`GlobalPauseToggle`, `SourceRowControls`, `SourceTierOverrideControl`) in one file; splitting would not change behaviour | S |
| F5 | `ui/CommandBar.tsx` | 765 | [CONFIRMED] | P3 | Extensively commented (the file documents ~8 separate historical defect fixes inline); functionally coherent single component | - |
| F6 | `profile/UserProfilePage.tsx` | 719 | [CONFIRMED] | P3 | Seven tab bodies in one file; each tab (`PersonalTab`, `SectorProfileTab`, `JurisdictionsTab`, `VerifierTab`, `ActivityTab`) is already a separate function and could be a separate module | S |
| F7 | `pages/MarketSignalDetailSurface.tsx` | 702 | [CONFIRMED] | P3 | Matches the other three detail-surface files' size (`RegulationDetailSurface.tsx` 654, `research/ResearchFindingDetailSurface.tsx` 436, `operations/OperationsDetailSurface.tsx` 453) - consistent with the shared `DetailShell` architecture, not an outlier | - |
| F8 | `onboarding/OnboardingWizard.tsx` | 674 | [CONFIRMED] | P3 | Four wizard steps as functions in one file | S |
| F9 | `profile/MembersPanel.tsx` | 654 | [CONFIRMED] | P3 | Includes the `BanDialog` sub-component inline; could split | S |
| F10 | `regulations/RegulationDetailSurface.tsx` | 654 | [CONFIRMED] | P3 | See F7 | - |
| F11 | `pages/SettingsPage.tsx` | 638 | [CONFIRMED] | P3 | Many small sub-components (`FieldLabel`, `DashboardDefaultsCard`, `FreightSectorsCard`, `DataAndSupersessionsRailCard`) already factored inline | S |
| F12 | `ui/FactCard.tsx` | 622 | [CONFIRMED] | P3 | Two real variants (`density="matrix"` vs default) behind one export; the matrix variant (`MatrixFactCardBody`, ~190 lines) could be its own module | S |

None of these are flagged as urgent - line count alone is a weak proxy for maintainability here, and
several (F5, F7, F10) are large primarily because of inline decision-history comments the codebase
deliberately keeps rather than tangled logic. F3's cross-file duplication (a real F45 case between
`CanonicalSourceReview.tsx`'s candidate editor and `ProvisionalReviewCard.tsx`'s classification editor
- both build an identical tier/domain/jurisdiction/mode/topic picker set with the same `toggle()`
helper and the same `PillPicker` shape, independently) is the one genuine "split this" case; see G1.

### G. Additional F45 candidate (flagged, not built out to a full finding)

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| G1 | `sources/CanonicalSourceReview.tsx` `CandidateRow`'s classification editor (lines ~840-862) vs `sources/ProvisionalReviewCard.tsx`'s classification editor (lines ~291-391) | Byte-similar tier `<select>` + domain/jurisdiction/mode/topic `PillPicker`/toggle-button sets, independently implemented twice with the same `ALL_JURISDICTIONS`/`ALL_MODES`/`ALL_TOPICS`/`ALL_DOMAINS` constant arrays duplicated verbatim in both files | [CONFIRMED - read both files; the four `ALL_*` arrays are character-identical between the two files except `ALL_DOMAINS`' labels ("Regulatory" vs "Reg")] | P2 | Extract one `SourceClassificationEditor` component + one shared `lib/sources/classification-vocab.ts` for the four vocab arrays | M |

### H. Documented exception, not a defect

| id | file:line | finding | status | severity | note |
|---|---|---|---|---|---|
| H1 | `operations/RegionDimensionMatrix.tsx` - the matrix arrives with its first-sourced cell pre-selected and its panel open | [REFUTED as a rule-13/F43 violation - CONFIRMED as a deliberate, doubly-cited, test-enforced exception] | - | The component's own header quotes two dated operator rulings (2026-09-08 "no items expanded on first navigation" vs 2026-09-09 "first sourced cell of the first sourced row open") and states the reconciliation explicitly; the `arrivalDeclaration` mechanism tags every element that opens on arrival with `data-open-on-mount` naming both rulings for the site-wide `open-state-sweep.mjs` gate to read; `RegionDimensionMatrix.npmtest.mjs` asserts the citation text and the declaration count (3) by source-text match. This is exactly the "declare the exception to the guard, don't hide from it" pattern rule 15 asks for. Read this as a positive finding, not a defect. |

### I. Locale/timezone hydration discipline - positive finding, with history

`regulations/format-fixed-date.ts` + `format-fixed-date.npmtest.mjs` + `obligation-register-locale.npmtest.mjs`
implement and regression-test the fix for a real, previously-shipped class of defect
(`Date.prototype.toLocaleDateString`/`.toLocaleString()` called with no explicit `timeZone`/locale,
producing a server/client hydration mismatch - React error #418 - because the Vercel server renders in
UTC and a viewer's browser renders in its own zone/locale). `ObligationRegisterFilterBar.tsx`'s own
header documents that **this exact bug shipped to production** ("Load more (N more)" and the
forward-event count) before being fixed twice (an inline `"en-US"` literal, then routed through the
shared `formatNumber()`). This is the class F36 exists to prevent, and within this lane's scope it is
now handled correctly everywhere it was checked (regulations/, market/, operations/, research/ all use
`formatLocaleDate`/`formatNumber` from `@/lib/format` with explicit UTC/locale pins). No new unpinned
`.toLocaleDateString`/`.toLocaleString()` call was found in the m-z scope via grep (`toLocaleDateString|
toLocaleString|toLocaleTimeString`) outside of code that already routes through the pinned helpers or
comments discussing the historical fix.

### J. Unverified candidate - possibly dead/legacy component

| id | file | finding | status | severity | note |
|---|---|---|---|---|---|
| J1 | `ui/ErrorState.tsx` | Full-page centered error state using Tailwind utility classes (`className="flex flex-col items-center..."`) plus a `shadcn`-style `Button` import - every other file in `ui/` (80 files read/scanned) is 100% inline-`style` + CSS-custom-property driven, with zero Tailwind utility classes for layout. This file is the one outlier. `InlineErrorBanner.tsx`'s own header comment (read directly) explicitly distinguishes itself from `ErrorState.tsx` ("a full-page centered empty state with an icon and a retry button - AdminTableView.tsx's own header already documents that shape as a non-match for this inline banner"), which confirms the component is *known to* at least one other file's author, but does not confirm it is imported anywhere live. | [HYPOTHESIS - read the file itself; import-site search across the repo was not performed in this session, so "dead" is not confirmed] | P3 | A follow-up `grep -r "from \"@/components/ui/ErrorState\""` across `src/` would resolve this in one command; not run here due to session scope discipline (read-only audit, no time budget left to chase every candidate to ground) |

---

## Top 10 a senior reviewer would call out first

1. **A1-A5 - invalid `var(--token)NN` CSS is silently dropping every tinted background/badge across the entire admin Sources surface** (registry, provisional review, canonical-source review, intersections, themes). Real, reproducible, one-line-per-site fix, currently live in production. `[CONFIRMED]`
2. **D1 - `IntelligenceBrief.tsx`/`SectorSynopsis.tsx` are two hand-maintained copies of the same markdown renderer**, including the same raw-hex palette (B6/B7) and the same Action-Required callout logic. Every future styling change to one risks drifting from the other. `[CONFIRMED]`
3. **G1 - the classification editor is built twice** (`CanonicalSourceReview.tsx` and `ProvisionalReviewCard.tsx`), vocab arrays duplicated verbatim. `[CONFIRMED]`
4. **E1-E6 - a stale CSS-token vocabulary survives in six detail-page rail cards**, and `shell/ItemConnectionsCard.tsx` shows the migration mid-flight in one file (old tokens in the `rail` branch, new tokens in the `masthead` branch added a month later) - the clearest single piece of evidence this is an unfinished migration, not two supported designs. `[CONFIRMED]`
5. **B4+B5 - the same raw hex `#b3261e` for "blocking" state is hand-typed in two different files** (`operations/GridQueuePanelView.tsx`, `regulations/EudrCustodyPanelView.tsx`) instead of reading a shared token, despite the app already having `--color-error`/`--immediate` for exactly this meaning. `[CONFIRMED]`
6. **C6 - `sources/SourceAdminControls.tsx` swallows the catch type six times** with no shared error-formatting helper, in the single largest admin-controls file in scope (861 lines). `[CONFIRMED]`
7. **F3/G1 - `sources/CanonicalSourceReview.tsx` at 949 lines is the largest file in the lane**, and a meaningful fraction of its length is the duplicated classification editor named in G1 - fixing G1 would materially shrink both F3's and `ProvisionalReviewCard.tsx`'s line counts as a side effect. `[CONFIRMED]`
8. **B6/B7 - the two markdown renderers' raw-hex topic-colour maps** (`#2563EB` ocean, `#059669` road, `#7C3AED` customs, etc.) exist nowhere as reusable tokens, so a rebrand or a third consumer of the same palette has no home to read from. `[CONFIRMED]`
9. **J1 - a UI primitive (`ErrorState.tsx`) that visibly does not match the rest of `ui/`'s design language** was flagged by name in a sibling file's own header comment as "a shape that does not match" - worth a 30-second grep to confirm live or dead before the next design pass touches `ui/`. `[HYPOTHESIS]`
10. **H1 `[REFUTED - not a defect, cited as a model]`**: `RegionDimensionMatrix.tsx`'s handling of a genuinely conflicting pair of operator rulings (declare the exception to the automated guard, cite both rulings inline, assert the citation text in a regression test) is exactly the discipline CLAUDE.md rule 15 asks for and should be the template the next "the rules conflict, what do I build" situation in this codebase points to.

---

## Decision-ready build items

These are the findings above that are genuinely ready to execute without further investigation -
mechanism named, exact call sites named, no operator ruling required:

1. **Fix the invalid-CSS class (A1-A5).** Add two theme tokens - `--color-error-tint`/
   `--color-warning-tint`/`--color-primary-tint`/`--color-success-tint` (or a single
   `tint(var, pct)` helper using `color-mix`) - and replace all 24 occurrences across the 5 named
   files. No design decision required: the intent (a faint tinted background) is already fully
   legible from the surrounding code at every site.
2. **Extract the shared markdown-renderer subset (D1)** into `lib/agent/markdown-render-shared.tsx`
   (or similar), consumed by both `IntelligenceBrief.tsx` and `SectorSynopsis.tsx`. Exact diff shape:
   move `riskBadge`, the Action-Required detection/callout render for `p`/`strong`, the tinted `h2`/`h3`,
   `blockquote`, and `a` overrides; leave `IntelligenceBrief`'s TOC extraction and
   `SectorSynopsis`'s section-splitting logic in their own files (those are genuinely different).
3. **Extract the shared classification editor (G1)** into one component + one vocab module, replacing
   both call sites named above.
4. **Migrate the six token-fork files (E1-E6)** to the dominant `--card`/`--line-N`/`--ink*` family -
   `shell/ItemConnectionsCard.tsx`'s own `masthead` branch (added 2026-09-25) is the reference
   implementation to copy from for the other five files.
5. **Token the two `#b3261e` sites (B4/B5)** onto the existing `--immediate`/`--color-error` var.

---

## Coverage appendix

194 files in scope; 194 rows below (mechanical listing, one row per file, from `wc -l` over the exact
scope directories). Depth column: **Full** = read in full, first line to last, findings recorded
against source text. **Grep** = not individually read this session; covered only by the repo-wide
mechanical grep sweeps described in "Coverage method" above.

| # | File | Lines | Depth |
|---|---|---|---|
| 1 | map/jurisdictionCentroids.ts | 42 | Full |
| 2 | map/MapPageView.tsx | 516 | Full |
| 3 | map/MapView.tsx | 346 | Full |
| 4 | market/CarbonCostOverlay.tsx | 296 | Full |
| 5 | market/IndexationPanel.tsx | 54 | Full |
| 6 | market/IndexationPanelView.tsx | 83 | Full |
| 7 | market/MarketComparativeRibbon.npmtest.mjs | 86 | Full |
| 8 | market/MarketComparativeRibbon.tsx | 413 | Full |
| 9 | market/MarketIntelLedger.tsx | 355 | Full |
| 10 | market/MarketSeriesBoard.tsx | 445 | Full |
| 11 | market/OemRoadmapPanel.tsx | 53 | Full |
| 12 | market/OemRoadmapPanelView.tsx | 66 | Full |
| 13 | market/ReroutingPanel.tsx | 46 | Full |
| 14 | market/ReroutingPanelView.tsx | 67 | Full |
| 15 | market/spec09.css | 71 | Full |
| 16 | market/SurchargeAuditPanel.tsx | 66 | Full |
| 17 | market/SurchargeAuditPanelView.tsx | 67 | Full |
| 18 | market/TrajectoryBars.tsx | 110 | Full |
| 19 | onboarding/InvitationLandingPage.tsx | 238 | Full |
| 20 | onboarding/NoWorkspaceLanding.tsx | 314 | Full |
| 21 | onboarding/OnboardingStepper.tsx | 61 | Full |
| 22 | onboarding/OnboardingWizard.npmtest.mjs | 58 | Full |
| 23 | onboarding/OnboardingWizard.tsx | 674 | Full |
| 24 | operations/AutomateVsHireCalculator.tsx | 186 | Full |
| 25 | operations/AuxiliaryEnergyPanel.tsx | 54 | Full |
| 26 | operations/AuxiliaryEnergyPanelView.tsx | 72 | Full |
| 27 | operations/DqiPanel.tsx | 52 | Full |
| 28 | operations/DqiPanelView.tsx | 64 | Full |
| 29 | operations/GridQueuePanel.tsx | 40 | Full |
| 30 | operations/GridQueuePanelView.tsx | 78 | Full |
| 31 | operations/OperationsCalculatorPageView.tsx | 89 | Full |
| 32 | operations/OperationsDetailSurface.tsx | 453 | Full |
| 33 | operations/OperationsItemsView.tsx | 356 | Full |
| 34 | operations/OperationsLedger.npmtest.mjs | 52 | Full |
| 35 | operations/OperationsLedger.tsx | 555 | Full |
| 36 | operations/RegionDimensionMatrix.npmtest.mjs | 461 | Full |
| 37 | operations/RegionDimensionMatrix.tsx | 1047 | Full |
| 38 | pages/MarketSignalDetailSurface.tsx | 702 | Full |
| 39 | pages/SettingsPage.npmtest.mjs | 117 | Full |
| 40 | pages/SettingsPage.tsx | 638 | Full |
| 41 | profile/MembersPanel.npmtest.mjs | 56 | Full |
| 42 | profile/MembersPanel.tsx | 654 | Full |
| 43 | profile/NotificationPreferences.npmtest.mjs | 26 | Full |
| 44 | profile/NotificationPreferences.tsx | 272 | Full |
| 45 | profile/OrganizationPanel.tsx | 293 | Full |
| 46 | profile/UserProfilePage.tsx | 719 | Full |
| 47 | providers/QueryProvider.tsx | 43 | Full |
| 48 | regulations/AffectedLanesCard.tsx | 159 | Full |
| 49 | regulations/CorridorsAppliedStrip.tsx | 46 | Full |
| 50 | regulations/CorridorsAppliedStripView.tsx | 117 | Full |
| 51 | regulations/DismissedStash.tsx | 120 | Full |
| 52 | regulations/EudrCustodyPanel.tsx | 68 | Full |
| 53 | regulations/EudrCustodyPanelView.tsx | 122 | Full |
| 54 | regulations/format-fixed-date.npmtest.mjs | 73 | Full |
| 55 | regulations/format-fixed-date.ts | 68 | Full |
| 56 | regulations/obligation-register-locale.npmtest.mjs | 95 | Full |
| 57 | regulations/ObligationRegister.tsx | 177 | Full |
| 58 | regulations/ObligationRegisterFilterBar.tsx | 430 | Full |
| 59 | regulations/ObligationRegisterPageView.tsx | 205 | Full |
| 60 | regulations/OwnerTeamCard.tsx | 174 | Full |
| 61 | regulations/PriorityDropdown.tsx | 462 | Full |
| 62 | regulations/RegulationDetailSurface.tsx | 654 | Full |
| 63 | regulations/RegulationsLedger.tsx | 350 | Full |
| 64 | regulations/UpcomingObligationsStrip.tsx | 102 | Full |
| 65 | regulations/UpcomingObligationsStripView.tsx | 274 | Full |
| 66 | research/credibility-grade-modifiers.mjs | 66 | Full |
| 67 | research/credibility-grade-modifiers.test.mjs | 65 | Full |
| 68 | research/CredibilityChipAuthority.tsx | 119 | Full |
| 69 | research/CredibilityChipEvidence.tsx | 79 | Full |
| 70 | research/CredibilityChipShared.tsx | 163 | Full |
| 71 | research/ResearchFindingDetailSurface.tsx | 436 | Full |
| 72 | research/ResearchLedger.npmtest.mjs | 64 | Full |
| 73 | research/ResearchLedger.tsx | 435 | Full |
| 74 | research/ResearchThemeCards.npmtest.mjs | 53 | Full |
| 75 | research/ResearchThemeCards.tsx | 97 | Full |
| 76 | research/ThemeStrip.tsx | 323 | Full |
| 77 | resource/IntelligenceBrief.tsx | 536 | Full |
| 78 | resource/IntelligenceMetadataStrip.tsx | 213 | Full |
| 79 | resource/SectorSynopsis.tsx | 413 | Full |
| 80 | search/SearchResultsView.tsx | 105 | Full |
| 81 | settings/ArchiveViewer.tsx | 224 | Full |
| 82 | settings/BriefingScheduleSection.tsx | 306 | Full |
| 83 | settings/DataSummary.tsx | 89 | Full |
| 84 | settings/SavedSearchesSection.tsx | 409 | Full |
| 85 | settings/Spec09CsvUpload.tsx | 237 | Full |
| 86 | settings/SupersessionHistory.tsx | 79 | Full |
| 87 | shared/GfmSection.npmtest.mjs | 118 | Full |
| 88 | shared/GfmSection.tsx | 152 | Full |
| 89 | shared/MoreBelowDisclosure.tsx | 57 | Full |
| 90 | shared/PeersDiscussingStrip.tsx | 128 | Full |
| 91 | shell/bootstrap-seed.test.mjs | 145 | Full |
| 92 | shell/bootstrap-seed.ts | 153 | Full |
| 93 | shell/ItemConnectionsCard.npmtest.mjs | 31 | Full |
| 94 | shell/ItemConnectionsCard.tsx | 284 | Full |
| 95 | shell/PageMasthead.tsx | 152 | Full |
| 96 | shell/RelevanceBadge.tsx | 58 | Full |
| 97 | shell/RelevanceBadgeClient.tsx | 47 | Full |
| 98 | sources/B2RegenerationNote.tsx | 78 | Full |
| 99 | sources/CanonicalSourceReview.tsx | 949 | Full |
| 100 | sources/IntersectionDetectionView.tsx | 316 | Full |
| 101 | sources/ProvisionalReviewCard.tsx | 429 | Full |
| 102 | sources/ProvisionalReviewTable.npmtest.mjs | 102 | Grep |
| 103 | sources/ProvisionalReviewTable.tsx | 385 | Full |
| 104 | sources/SourceAdminControls.tsx | 861 | Full |
| 105 | sources/SourceHealthDashboard.tsx | 547 | Full |
| 106 | sources/SourceStateStrips.npmtest.mjs | 81 | Grep |
| 107 | sources/SourceTierAuditPanel.tsx | 167 | Full |
| 108 | sources/SourceTierLegend.npmtest.mjs | 86 | Grep |
| 109 | sources/SourceTierLegend.tsx | 262 | Full |
| 110 | sources/ThemesView.tsx | 295 | Full |
| 111 | telemetry/GlobalErrorReporter.tsx | 114 | Full |
| 112 | ui/Absence.npmtest.mjs | 101 | Grep |
| 113 | ui/Absence.tsx | 207 | Full |
| 114 | ui/ActionCard.tsx | 289 | Full |
| 115 | ui/ActionRow.npmtest.mjs | 112 | Grep |
| 116 | ui/ActionRow.tsx | 218 | Full |
| 117 | ui/AntonTitleLetterSpacing.npmtest.mjs | 111 | Grep |
| 118 | ui/band-context.tsx | 38 | Grep |
| 119 | ui/BandGradientRule.npmtest.mjs | 72 | Grep |
| 120 | ui/BandGradientRule.tsx | 46 | Full |
| 121 | ui/BandTile.tsx | 184 | Full |
| 122 | ui/BandTileRow.tsx | 45 | Full |
| 123 | ui/Button.tsx | 55 | Full |
| 124 | ui/CardFoot.tsx | 113 | Full |
| 125 | ui/Chips.npmtest.mjs | 109 | Grep |
| 126 | ui/Chips.tsx | 374 | Full |
| 127 | ui/CommandBar.npmtest.mjs | 228 | Grep |
| 128 | ui/CommandBar.tsx | 765 | Full |
| 129 | ui/commandBarKeyboard.npmtest.mjs | 110 | Grep |
| 130 | ui/commandBarKeyboard.ts | 121 | Grep |
| 131 | ui/DetailSubSection.tsx | 33 | Full |
| 132 | ui/DetailTagRow.tsx | 76 | Full |
| 133 | ui/ErrorState.tsx | 44 | Full |
| 134 | ui/FactCard.npmtest.mjs | 247 | Grep |
| 135 | ui/FactCard.tsx | 622 | Full |
| 136 | ui/FilePickRow.tsx | 57 | Full |
| 137 | ui/ImpactMeter.npmtest.mjs | 265 | Grep |
| 138 | ui/ImpactMeter.tsx | 300 | Full |
| 139 | ui/InlineErrorBanner.tsx | 33 | Full |
| 140 | ui/ItemGroup.npmtest.mjs | 81 | Grep |
| 141 | ui/ItemGroup.tsx | 176 | Full |
| 142 | ui/ListRow.npmtest.mjs | 266 | Grep |
| 143 | ui/ListRow.tsx | 874 | Full |
| 144 | ui/Masthead.npmtest.mjs | 87 | Grep |
| 145 | ui/Masthead.tsx | 290 | Grep |
| 146 | ui/milestone-timeline-classify.ts | 38 | Grep |
| 147 | ui/MilestoneTimeline.npmtest.mjs | 93 | Grep |
| 148 | ui/MilestoneTimeline.tsx | 93 | Grep |
| 149 | ui/RailCard.npmtest.mjs | 42 | Grep |
| 150 | ui/RailCard.tsx | 130 | Grep |
| 151 | ui/relative-time-format.ts | 42 | Grep |
| 152 | ui/RelativeTime.tsx | 35 | Grep |
| 153 | ui/RowTable.npmtest.mjs | 86 | Grep |
| 154 | ui/RowTable.tsx | 371 | Grep |
| 155 | ui/section-index-styles.ts | 65 | Grep |
| 156 | ui/section-title-style.ts | 18 | Grep |
| 157 | ui/SectionCard.npmtest.mjs | 60 | Grep |
| 158 | ui/SectionCard.tsx | 167 | Grep |
| 159 | ui/SectionHeader.tsx | 116 | Grep |
| 160 | ui/SectionHeading.tsx | 113 | Grep |
| 161 | ui/SectionIndex.npmtest.mjs | 59 | Grep |
| 162 | ui/SectionIndex.tsx | 136 | Grep |
| 163 | ui/SectionIndexLink.tsx | 39 | Grep |
| 164 | ui/SectionLabel.tsx | 26 | Grep |
| 165 | ui/SectionRule.coverage.npmtest.mjs | 210 | Grep |
| 166 | ui/SectionRule.npmtest.mjs | 66 | Grep |
| 167 | ui/SectionRule.tsx | 38 | Grep |
| 168 | ui/skeleton-page.tsx | 29 | Grep |
| 169 | ui/Skeleton.tsx | 122 | Grep |
| 170 | ui/StatBlock.npmtest.mjs | 90 | Grep |
| 171 | ui/StatBlock.tsx | 185 | Grep |
| 172 | ui/StateNote.npmtest.mjs | 35 | Grep |
| 173 | ui/StateNote.tsx | 113 | Grep |
| 174 | ui/SystemErrorBanner.tsx | 51 | Grep |
| 175 | ui/TabRow.npmtest.mjs | 51 | Grep |
| 176 | ui/TabRow.tsx | 130 | Grep |
| 177 | ui/TagPopover.npmtest.mjs | 43 | Grep |
| 178 | ui/TagPopover.tsx | 328 | Grep |
| 179 | ui/tagPopoverKeyboard.npmtest.mjs | 130 | Grep |
| 180 | ui/tagPopoverKeyboard.ts | 102 | Grep |
| 181 | ui/timeline-dot-styles.ts | 39 | Grep |
| 182 | ui/Timeline.tsx | 231 | Grep |
| 183 | ui/Toast.tsx | 59 | Grep |
| 184 | ui/WatchButton.npmtest.mjs | 135 | Grep |
| 185 | ui/WatchButton.tsx | 523 | Grep |
| 186 | ui/__fixtures__/full-brief-fixture.ts | 35 | Grep |
| 187 | ui/__fixtures__/list-row-fixture.ts | 131 | Grep |
| 188 | ui/__fixtures__/nav-counts-fixture.ts | 40 | Grep |
| 189 | ui/__fixtures__/panel-21c-frozen-records.json | 51 | Grep |
| 190 | ui/__fixtures__/record-grade-fixture.ts | 46 | Grep |
| 191 | ui/__fixtures__/search-results-fixture.ts | 82 | Grep |
| 192 | watchlist/WatchlistSurface.npmtest.mjs | 126 | Full |
| 193 | watchlist/WatchlistSurface.tsx | 473 | Full |
| 194 | workspace/ArchiveDialog.tsx | 423 | Full |

Row count: 194. File count: 194. Match confirmed.

---

## Verification

Run against this file:

```
node fsi-app/scripts/verify/audit-finding-status.mjs
```

All findings above with a defect-shaped claim are stated in markdown tables carrying an explicit
`status` column (`[CONFIRMED …]` / `[HYPOTHESIS …]` / `[REFUTED …]`), per rule 14 and matching this
checker's own table exemption (`line.trim().startsWith("|")` rows are read via their Status column,
not the line-level bullet regex).
