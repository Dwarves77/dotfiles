# App Audit A2bc - components m-z completion register (2026-09-30)

Lane A2bc (COMPONENTS-M-Z-UNREAD-FILES), Sonnet, read-only. Scope: every file under
`fsi-app/src/components` whose name begins m-z that lane A2b's register
(`docs/audits/app-audit-a2b-components-m-z-2026-09-30.md`, committed to `audit/a2b-components`)
marked `Grep` (not read in full) in its coverage appendix. This lane closes that gap: every one of
those files is read in full below, first line to last, and checked against A2b's own check list
(dead components, duplicates, placeholders, `any`, dead state, hooks rules, unwired props, F49/F43/
F36/F41 classes, a11y, 375px risks, oversized files).

**Correction to the dispatch's own count.** The dispatch brief says "the appendix marks 54 files as
grep-only". Mechanically counting the appendix's own `| Grep |` rows (`grep -F "| Grep |"` over the
committed file) returns **64**, not 54: 3 `sources/*.npmtest.mjs` files plus 61 `ui/` files (the
appendix's own prose at the top of A2b's register states "3 ... and 61 files in `ui/`" = 64, which
contradicts its own headline "54" two sentences earlier - an inconsistency in A2b's own text, not in
its table). This lane reads all 64 rows the appendix actually marks `Grep`, the larger and more
conservative number, so no grep-only file is left unread regardless of which count is "correct".
`[CONFIRMED - grep -F "| Grep |" ... | wc -l` over the committed appendix returns 64]`.

**Method.** Every file below was opened with a line-by-line read tool (not `grep`), start to end. No
file in this batch required truncation (largest is `WatchButton.tsx` at 523 lines; the batch's total
is approximately 5,700 lines). Findings continue A2b's id scheme (classes A-J) where a finding
confirms or extends a class A2b already opened from a grep-only file that is now fully read; new
classes (K, L) are opened only where nothing in A2b's scheme fits.

---

## Summary

| Class | Count | Worst severity |
|---|---|---|
| A (extended): invalid `var(--token)` CSS-string concatenation | 1 new instance, live on 2 surfaces (every list row's timeline + every detail page's ActionCard timeline) | P1 |
| B (extended): raw hex colours outside the semantic token system | 3 new files, ~9 new occurrences | P2 |
| E (extended): token-vocabulary fork (5th+ variant families found) | 5 new files | P2 |
| J (extended): `ui/` files that mix Tailwind utility classes into an otherwise inline-style layer | 1 new confirmed instance (Toast.tsx), refines A2b's "one outlier" framing | P3 |
| New (K): misleading parameter name masking a dead branch condition | 1 file | P3 |
| New (L): plain `<a href>` for in-app navigation instead of `next/link` | 2 files | P3, unverified whether targets are ever internal |
| Regression-test coverage of the 64 files | Exhaustive and sound; zero defects found in test logic itself | Positive finding |
| Fixture-data integrity (rule 2, "no invented content") | All 6 fixture files verified as frozen real-record reads with cited SELECTs; no fabrication found | Positive finding |

---

## Findings by class

### A (extended). Invalid/silently-broken CSS-in-JS: a `var(--token)` reference concatenated with a literal, producing a value the browser cannot parse

A2b's class A (register findings A1-A5) covered `backgroundColor: "var(--color-X)NN"` string
concatenation in five `sources/` files - a tinted background that silently never renders because
`var(--color-error)15` is not a parseable CSS colour. This lane found the **same defect class**,
manifesting as a **`box-shadow` ring** instead of a background, live on two additional, widely-used
parts that were grep-only in A2b's pass.

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A6 | `ui/timeline-dot-styles.ts:23` (`nextDotStyle`) | `boxShadow: \`0 0 0 ${ringWidthPx}px ${bandHex}33\`` - `bandHex` is documented and typed as a `string`, but every real caller passes a CSS-var reference, never a raw hex string (see below), so the built value is `0 0 0 3px var(--immediate)33`, not a parseable colour. The whole `box-shadow` declaration is dropped; the "next milestone" dot never renders its ring. | [CONFIRMED - read `timeline-dot-styles.ts` in full, then traced both call sites: `ui/Timeline.tsx:178` calls `nextDotStyle(band.cssVar, 12, 3)`, and `ui/ListRow.tsx:685` passes `bandHex={band.cssVar}` into `ui/MilestoneTimeline.tsx`, which calls `nextDotStyle(bandHex, 9, 2)` at `MilestoneTimeline.tsx:86`; `UrgencyBand.cssVar` is confirmed by direct read of `src/lib/urgency/bands.ts:70,82,94,106` to be literal strings `"var(--immediate)"` / `"var(--action)"` / `"var(--monitor)"` / `"var(--awareness)"`, never a raw hex value anywhere in that file] | P1 | Give `UrgencyBand` a second field carrying the raw hex (or an 8-digit-hex-ready form), or build the ring with `color-mix(in srgb, ${bandHex} 20%, transparent)` reading the var directly instead of string-appending an alpha suffix onto it - the same fix shape as A1-A5's own recommendation | S |

**Why this is worse than A1-A5 in reach, not severity-per-site.** A1-A5 are confined to five
admin-only `sources/` files. A6 fires on **every `MilestoneTimeline` row-strip mount** (every list
page's per-row timeline cell, via `ListRow.tsx`) and **every `Timeline` full-card mount** (every
detail page's ActionCard timeline block, via `Timeline.tsx`) that has a "next" milestone - i.e. it is
live on the customer-facing Regulations/Market/Research/Operations surfaces, not only an admin panel.
The visual effect (a missing decorative ring around the one dot that marks "what's next") is more
subtle than A1-A5's missing tinted backgrounds, which is likely why it was not caught by a visual
pass, but the mechanism is the identical CSS defect.

### B (extended). Raw hex colours outside the semantic token system

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| B8 | `ui/TagPopover.tsx` lines 221, 242 (`#FFFFFF` x2), 251 (`#7A6E6C`), 287, 313 (`#FAFAF8` x2) | The "+ Tag" trigger, the popover panel background, the search-icon colour, and both row-hover backgrounds are literal hex, not tokens, in a file that otherwise reads `var(--ink)`/`var(--ink-3)`/`var(--shadow-card)` correctly | [CONFIRMED - read in full] | P2 | `#FFFFFF` -> `var(--card)`; `#7A6E6C` -> `var(--ink-3)` (the same value `Absence.tsx` and others already token); `#FAFAF8` -> a hover token if one exists, or a new `--row-hover-light` token alongside the existing `--row-hover` | S |
| B9 | `ui/section-index-styles.ts:53` | `color: isActive ? "#FFFFFF" : "var(--ink-2)"` - the active tab's text colour is raw hex beside a token for the inactive state in the same ternary | [CONFIRMED - read in full] | P2 | `"#FFFFFF"` -> a `--on-brand`/`--ink-inverse` token (this exact pattern, "white text on the brand fill", recurs at `ActionRow.tsx`'s own primary button per A2b's file, which already hardcodes `"#fff"` rather than a token - not re-flagged here since A2b already read that file in full and did not flag it, but the same fix would consolidate both) | S |
| B10 | `ui/SectionRule.tsx:28` | `SECTION_RULE_GRADIENT = "linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))"` - two raw hex colour stops in a gradient, when `#5A5552` is `--brand`'s own value and CSS gradients accept `var()` as a colour stop (`linear-gradient(90deg, var(--brand), var(--brand) 22%, ...)` is valid CSS) | [CONFIRMED - read in full; the file's own header states "same family as `--brand` (#5A5552)"] | P3 | This is a lower-confidence instance than B8/B9: the file's header explains the value is deliberately locked to the artboard's literal markup, and `SectionRule.coverage.npmtest.mjs`/`SectionRule.npmtest.mjs` both pin this exact string as the regression contract, so a change here has two tests to update in lockstep. Flagged as a genuine token opportunity, not urgent | S |

### E (extended). Token-vocabulary fork - more variant families than A2b's E1-E6 found

A2b's class E documented one fork: an older `--surface`/`--border-sub`/`--r-md`/`--muted`/`--text`/
`--text-2` family surviving in six `regulations/`/`shell/` rail cards, versus the dominant `--card`/
`--line-N`/`--ink*` family used everywhere else in scope. Reading the 64 grep-only files in full
surfaces that the fork is not two families, it is **at least five**, each confined to one or two
files, all resolving to real (legacy) CSS custom properties defined in `theme.css`/`globals.css` (so
none of these are broken CSS the way class A is - they render, they are simply a second, third,
fourth and fifth naming vocabulary for the same handful of concepts).

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| E7 | `ui/RowTable.tsx` lines 224 (`var(--surface)`), 333 (`var(--color-border)`), 334 (`var(--surface)`) | The admin RowTable's action button and overflow menu use `--surface`/`--color-border` (A2b's E-family fork) in the SAME file that uses `--line-2`/`--line-3`/`--ink`/`--ink-3` (the dominant family) everywhere else | [CONFIRMED - read in full; both tokens resolve live per `theme.css`/`globals.css`, confirmed by grep, so this is a vocabulary inconsistency, not broken CSS] | P2 | Migrate the two declarations to `var(--card)`/`var(--line-1)`, matching the file's own dominant usage two lines away | S |
| E8 | `ui/skeleton-page.tsx:19` | `skeletonBox()`'s placeholder uses `var(--color-surface-raised)` - a fourth vocabulary (`color-surface-raised`), distinct from both `--surface` (E-family) and `--card` (dominant family) | [CONFIRMED - read in full] | P3 | Route through `--card` or a dedicated `--skeleton-fill` token shared with `Skeleton.tsx`'s own `shimmer()` (which correctly uses `var(--tag)`) | S |
| E9 | `ui/SystemErrorBanner.tsx` lines 34-36 | `var(--color-warning-bg, #FFF7F0)`, `var(--color-warning-border, #F0D5B8)`, `var(--color-text-primary)` - a fifth vocabulary (`color-warning-bg`/`color-warning-border`/`color-text-primary`), predating the 2026-09-06 UI system handoff (this file is dated Sprint 3, 2026-05-27) | [CONFIRMED - read in full] | P3 | This file is a pre-handoff survivor rendered on every route as the data-fallback banner; migrating it to the dominant family (`--action-tint`/`--card`-adjacent border/`--ink`) would both fix the fork and remove its hard-coded hex fallbacks (B-class adjacent) | S |
| E10 | `ui/WatchButton.tsx:58-64` (`DEFAULT_PALETTE`) | `--color-primary`, `--color-border`, `--color-bg-raised`, `--color-bg-surface`, `--color-text-primary` - a sixth vocabulary, and this is the palette every caller gets by default unless it supplies its own (the file's own comment: "surfaces without a local palette object (research, operations) ... mount the button" with this default) | [CONFIRMED - read in full] | P2 | Higher-reach than E7-E9: this is the DEFAULT palette for two of the five customer surfaces (Research, Operations). Migrate `DEFAULT_PALETTE` to the dominant `--card`/`--line-1`/`--tag`/`--ink`/`--ink` mapping | S |
| E11 | `ui/Toast.tsx` lines 49-51 | `var(--color-success)`, `var(--color-error)`, `var(--color-surface)` - reuses E9's vocabulary family (`color-X`) rather than either the dominant family or a fifth new one, so this is the SAME fork as E9 recurring in a second, unrelated file | [CONFIRMED - read in full] | P2 | Same fix as E9; consolidating E9+E11 argues for one shared `--color-*` -> dominant-family alias pass rather than two independent migrations | S |

### J (extended). A `ui/` file that mixes Tailwind utility classes into an otherwise inline-style-driven layer

A2b's J1 flagged `ui/ErrorState.tsx` as "the one outlier" in `ui/` for using Tailwind utility classes
(`className="flex flex-col items-center..."`) when every other file in the 80 it had read used
inline styles + CSS custom properties. A2b explicitly could not confirm whether `ErrorState.tsx` was
dead code and left it `[HYPOTHESIS]`. Reading the remaining files in this lane's scope finds a
**second** file with the same pattern, which changes the framing from "one outlier" to "at least two,
and this one is confirmed live."

| id | file:line | finding | status | severity | better solution | note |
|---|---|---|---|---|---|---|
| J2 | `ui/Toast.tsx` lines 42-46 | The toast's root `className` is a `cn(...)` call building Tailwind utility classes (`"fixed bottom-6 right-6 z-50"`, `"flex items-center gap-2 px-4 py-3"`, `"rounded-lg border text-sm font-medium shadow-lg"`, `"transition-all duration-300"`) alongside an inline `style` object for colour - the same two-system mixing J1 flagged, in a file `grep`-confirmed to be live (imported and mounted by `community/CommunityShell.tsx:41,174`, `community/BrowseGroupsGrid.tsx:18,105`, and `settings/SavedSearchesSection.tsx:5,381`) | [CONFIRMED - read in full; import/mount sites confirmed by `grep -rn "from \"@/components/ui/Toast\"" src/` returning 3 files] | P3 | Not urgent (Tailwind is configured and works; this is a consistency smell, not broken CSS), but worth folding into whatever remediation J1's follow-up produces - the two outliers should be resolved together, and this lane's finding CONFIRMS `Toast.tsx` is live where J1 could not confirm `ErrorState.tsx` either way |

### K (new). Misleading parameter name masks a dead condition (correct behaviour, wrong-looking code)

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| K1 | `ui/milestone-timeline-classify.ts:15-19` (`dotState`) | The function's second parameter is named `hasNext: boolean`, but its only caller (`classifyTimelineEntries`, line 35) passes `hasExplicitCurrent` into that slot. Because `isFirstFuture` can only be `true` when `hasExplicitCurrent` is already `false` (line 33: `!hasExplicitCurrent && ...`), the check `if (isFirstFuture && !hasNext)` at line 18 has a `!hasNext` clause that is always `true` whenever `isFirstFuture` is `true` - i.e. the clause is dead/redundant, and the parameter's own name describes what it is not | [CONFIRMED - read in full, traced the one call site, and verified the invariant `isFirstFuture ⟹ !hasExplicitCurrent` holds unconditionally from the `&&` on line 33] | P3 | Rename the parameter to `hasExplicitCurrent` (matching the caller) and drop the now-visibly-redundant `!hasNext` check, or add a one-line comment stating the invariant if the redundant check is kept deliberately as defensive coding. Behaviour is unaffected either way - this is a readability/correctness-of-naming finding, not a runtime bug: `MilestoneTimeline.npmtest.mjs`'s 5 unit tests all pass against the current logic | S |

### L (new). Plain `<a href>` for what may be in-app navigation, bypassing `next/link`

| id | file:line | finding | status | severity | better solution | note |
|---|---|---|---|---|---|---|
| L1 | `ui/RailCard.tsx` lines 93-110 (`headLink` branch) | `headLink` renders a bare `<a href={headLink.href}>`, while the sibling `titleHref` branch two lines away (lines 79-85) correctly uses `next/link`'s `<Link>`. The file's own doc comment gives `headLink`'s worked example as `"Calendar →"` (artboard 02/p2), which reads as an in-app route | [HYPOTHESIS - read in full; whether every real `headLink.href` caller passes an internal route (full-page reload, loses client-side transition) or an external URL (correct as a plain `<a>`) was not traced across every call site in this session] | P3 | If callers pass internal routes, switch to `<Link>` for a client-side transition, matching `titleHref`'s own pattern two lines above | S |
| L2 | `ui/StateNote.tsx` lines 78-90 (`action.href` branch) | Same pattern: `action.href` renders a bare `<a>`, and the type (`{ label: string; href?: string; onClick?: () => void }`) does not distinguish "internal route" from "external URL" | [HYPOTHESIS - same caveat as L1] | P3 | Same as L1, if internal routes are a real caller shape | S |

### Positive findings

**Test coverage of the 64 files is exhaustive and internally sound.** Every `*.npmtest.mjs` file in
this batch (24 of the 64) is a well-targeted structural/behavioural regression test against its
sibling `.tsx`/`.ts` source, with clearly stated rationale for the text-level convention (no JSX mount
harness in this repo) and, where the assertion is about real rendered markup rather than source text
(`ImpactMeter.npmtest.mjs`), a genuine `esbuild` + `renderToStaticMarkup` real-render harness. No test
in this batch asserts something false about its own source, and no test was found to be silently
vacuous (several header comments explicitly call out and fix a PRIOR vacuous-assertion trap, e.g.
`SectionRule.npmtest.mjs`'s note about a slice between two markers that no longer exist). This
directly informed the A6/B8-B11/E7-E11 findings above: the tests correctly assert what the source
says, so a defect had to be found by reading the source against the DESIGN INTENT its own comments
state, not by finding a test/source mismatch.

**Fixture-data integrity (rule 2) holds across all 6 fixture files.** `full-brief-fixture.ts`,
`record-grade-fixture.ts`, `list-row-fixture.ts`, `nav-counts-fixture.ts`,
`panel-21c-frozen-records.json`, and `search-results-fixture.ts` each cite the exact read-only SELECT
that produced their values, the live project id, and the freeze date, and each explicitly states the
operator ruling behind the practice ("fixtures render from a frozen real record ... never invented
strings"). Cross-file consistency spot-checked: `SEARCH_FIXTURE_VERIFIED_COUNT` (1440) equals the sum
of `nav-counts-fixture.ts`'s `byPriority` values (22+41+1018+359=1440), which is expected since both
were frozen the same week from the same `provenance_status='verified'` population.

**`RelativeTime.tsx`/`relative-time-format.ts` and `Masthead.tsx`'s `isoWeekNumber` are exemplary
hydration-safe patterns**, both reading UTC field getters and deferring the live/local value to a
post-mount effect - matching A2b's own class I positive finding and extending it into this lane's
scope with two more confirmed-clean instances.

---

## Top findings a senior reviewer would call out first

1. **A6 - the "next milestone" ring is silently invisible sitewide**, on every list row and every
   detail page's Timeline block, from the exact `var(--token)NN`-concatenation defect class A2b found
   in five admin files, now confirmed live on customer-facing surfaces via `ListRow.tsx` and
   `Timeline.tsx`. `[CONFIRMED]` - highest-value finding in this lane, same fix shape as A1-A5.
2. **E10 - the DEFAULT watch-button palette is a fourth-generation token vocabulary**, silently
   served to any Research/Operations surface that doesn't supply its own palette. `[CONFIRMED]`
3. **B8 - `TagPopover.tsx` has 5 raw-hex occurrences** in the one popover every workspace-tag
   interaction opens. `[CONFIRMED]`
4. **J2 confirms `Toast.tsx` is a second, live Tailwind-in-`ui/` outlier**, moving A2b's J1 from "one
   unconfirmed candidate" to "a real, if small, pattern worth resolving as a class." `[CONFIRMED]`
5. **K1 - a misleadingly-named parameter in a shared classifier** used by both `MilestoneTimeline.tsx`
   and `DetailShell.tsx`'s mobile timeline stack; behaviour is correct today but the name actively
   misleads the next reader. `[CONFIRMED]`

---

## Decision-ready build items

1. **Fix A6**: give `UrgencyBand` a raw-hex field (or switch `nextDotStyle` to `color-mix()` reading
   the existing `cssVar` directly) and re-point both call sites (`Timeline.tsx:178`,
   `MilestoneTimeline.tsx:86` via `ListRow.tsx:685`). Two call sites, one shared helper function to
   fix.
2. **Token B8/B9/B10** (TagPopover.tsx, section-index-styles.ts, SectionRule.tsx) onto the dominant
   family, same mechanism as A2b's own B-class recommendation.
3. **Migrate E7/E8/E9/E10/E11** onto the dominant `--card`/`--line-N`/`--ink*` family; E10 is the
   highest-reach (default palette for 2 of 5 customer surfaces) and should go first.
4. **Rename the `hasNext` parameter in `milestone-timeline-classify.ts`** to `hasExplicitCurrent`
   (K1); zero behaviour change, one-line diff.
5. **Trace `headLink`/`action.href` call sites** (L1/L2) to resolve the `[HYPOTHESIS]` status: if any
   caller passes an internal route, switch that branch to `next/link`.

---

## Coverage appendix

64 files in scope (every row A2b's own appendix marked `Grep`); 64 rows below, each read in full,
first line to last, this session.

| # | File | Lines | Depth |
|---|---|---|---|
| 1 | sources/ProvisionalReviewTable.npmtest.mjs | 102 | Full |
| 2 | sources/SourceStateStrips.npmtest.mjs | 81 | Full |
| 3 | sources/SourceTierLegend.npmtest.mjs | 86 | Full |
| 4 | ui/Absence.npmtest.mjs | 101 | Full |
| 5 | ui/ActionRow.npmtest.mjs | 112 | Full |
| 6 | ui/AntonTitleLetterSpacing.npmtest.mjs | 111 | Full |
| 7 | ui/band-context.tsx | 38 | Full |
| 8 | ui/BandGradientRule.npmtest.mjs | 72 | Full |
| 9 | ui/Chips.npmtest.mjs | 109 | Full |
| 10 | ui/CommandBar.npmtest.mjs | 228 | Full |
| 11 | ui/commandBarKeyboard.npmtest.mjs | 110 | Full |
| 12 | ui/commandBarKeyboard.ts | 121 | Full |
| 13 | ui/FactCard.npmtest.mjs | 247 | Full |
| 14 | ui/ImpactMeter.npmtest.mjs | 265 | Full |
| 15 | ui/ItemGroup.npmtest.mjs | 81 | Full |
| 16 | ui/ListRow.npmtest.mjs | 266 | Full |
| 17 | ui/Masthead.npmtest.mjs | 87 | Full |
| 18 | ui/Masthead.tsx | 290 | Full |
| 19 | ui/milestone-timeline-classify.ts | 38 | Full |
| 20 | ui/MilestoneTimeline.npmtest.mjs | 93 | Full |
| 21 | ui/MilestoneTimeline.tsx | 93 | Full |
| 22 | ui/RailCard.npmtest.mjs | 42 | Full |
| 23 | ui/RailCard.tsx | 130 | Full |
| 24 | ui/relative-time-format.ts | 42 | Full |
| 25 | ui/RelativeTime.tsx | 35 | Full |
| 26 | ui/RowTable.npmtest.mjs | 86 | Full |
| 27 | ui/RowTable.tsx | 371 | Full |
| 28 | ui/section-index-styles.ts | 65 | Full |
| 29 | ui/section-title-style.ts | 18 | Full |
| 30 | ui/SectionCard.npmtest.mjs | 60 | Full |
| 31 | ui/SectionCard.tsx | 167 | Full |
| 32 | ui/SectionHeader.tsx | 116 | Full |
| 33 | ui/SectionHeading.tsx | 113 | Full |
| 34 | ui/SectionIndex.npmtest.mjs | 59 | Full |
| 35 | ui/SectionIndex.tsx | 136 | Full |
| 36 | ui/SectionIndexLink.tsx | 39 | Full |
| 37 | ui/SectionLabel.tsx | 26 | Full |
| 38 | ui/SectionRule.coverage.npmtest.mjs | 210 | Full |
| 39 | ui/SectionRule.npmtest.mjs | 66 | Full |
| 40 | ui/SectionRule.tsx | 38 | Full |
| 41 | ui/skeleton-page.tsx | 29 | Full |
| 42 | ui/Skeleton.tsx | 122 | Full |
| 43 | ui/StatBlock.npmtest.mjs | 90 | Full |
| 44 | ui/StatBlock.tsx | 185 | Full |
| 45 | ui/StateNote.npmtest.mjs | 35 | Full |
| 46 | ui/StateNote.tsx | 113 | Full |
| 47 | ui/SystemErrorBanner.tsx | 51 | Full |
| 48 | ui/TabRow.npmtest.mjs | 51 | Full |
| 49 | ui/TabRow.tsx | 130 | Full |
| 50 | ui/TagPopover.npmtest.mjs | 43 | Full |
| 51 | ui/TagPopover.tsx | 328 | Full |
| 52 | ui/tagPopoverKeyboard.npmtest.mjs | 130 | Full |
| 53 | ui/tagPopoverKeyboard.ts | 102 | Full |
| 54 | ui/timeline-dot-styles.ts | 39 | Full |
| 55 | ui/Timeline.tsx | 231 | Full |
| 56 | ui/Toast.tsx | 59 | Full |
| 57 | ui/WatchButton.npmtest.mjs | 135 | Full |
| 58 | ui/WatchButton.tsx | 523 | Full |
| 59 | ui/__fixtures__/full-brief-fixture.ts | 35 | Full |
| 60 | ui/__fixtures__/list-row-fixture.ts | 131 | Full |
| 61 | ui/__fixtures__/nav-counts-fixture.ts | 40 | Full |
| 62 | ui/__fixtures__/panel-21c-frozen-records.json | 51 | Full |
| 63 | ui/__fixtures__/record-grade-fixture.ts | 46 | Full |
| 64 | ui/__fixtures__/search-results-fixture.ts | 82 | Full |

Row count: 64. File count: 64 (every row A2b's appendix marked `Grep`). Match confirmed.

---

## Verification

Run against this file:

```
node fsi-app/scripts/verify/audit-finding-status.mjs
```

Every finding above with a defect-shaped claim is stated in a markdown table carrying an explicit
`status` column (`[CONFIRMED …]` / `[HYPOTHESIS …]`), per rule 14 and matching this checker's own
table exemption (`line.trim().startsWith("|")` rows are read via their Status column, not the
line-level bullet regex).

---

## Closing line

**A2 (components a-l) + A2b (components m-z, read-in-full subset) + A2bc (components m-z, this
register's 64 previously-grep-only files) together cover every file under `fsi-app/src/components`
whose name begins a through z: every file has now been read in full, first line to last, by one of
the three lanes.**
