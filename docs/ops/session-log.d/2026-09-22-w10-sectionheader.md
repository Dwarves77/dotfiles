# Lane W10-SectionHeader session log (2026-09-22)

Brief: `docs/dispatches/lane-briefs/2026-09-22/brief-w10-sectionheader.md`, amendment 1 (wins where
they conflict): `docs/dispatches/lane-briefs/2026-09-22/brief-w10-sectionheader-amendment-1.md`.
Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-landdocs-0911`, branch `lane/w10-sectionheader`.

Skills: `fsi-app:environmental-policy-and-innovation` does not exist under that name in this
session's skill list; loaded `anthropic-skills:environmental-policy-and-innovation` instead (its
content is unrelated to this UI lane - it governs freight sustainability content generation, not
frontend parts work - loaded per the process instruction anyway, not applied to any deliverable
here). `frontend-design` loaded. `remediation-discipline` does not exist in this session's skill
list; skipped per instruction. `caros-ledge-platform-intent` also does not exist as an invocable
skill in this session; its `SKILL.md` was read directly (per the governed-file block's own fallback
instruction) before editing the two files it gates (`src/app/admin/parts/item-group/page.tsx`,
implicitly `src/app/admin/parts/section-header/page.tsx`).

## Item 1: verify "every fact card inside ItemGroup on both grades" (amendment 1 scope)

The fix itself (record-grade regulation path wrapped in `ItemGroup`) already landed as PR #784
(`b8068ea5`), confirmed by reading `RegulationDetailSurface.tsx` (its own local `ItemGroup` wrap at
what is now lines ~502/522 after this lane's edits, unchanged shape) and
`.discipline/rendering/smoke/record-grade-smoke.mjs` (already exists, already registered).

The brief's own test description - "mounts each detail surface's record-grade and full-brief
fixtures and asserts every `[data-part="fact-card"]` has an `[data-part="item-group"]` ancestor" -
did NOT exist at that scope. `record-grade-smoke.mjs` covers only Regulations' record-grade path.
No spec covered Market/Research record-grade (`RecordFactsBody`, `src/components/detail/
primitives.tsx`) or any surface's full-brief path (`FactBlocks`, `src/components/detail/
FactBlocks.tsx`) directly with this ancestor assertion, even though reading those two files' own
source confirms they already wrap every card in `ItemGroup` by construction.

Added: `.discipline/rendering/smoke/item-group-coverage-smoke.mjs`, registered in
`ux-smoke-specs.mjs` as `item-group-coverage`. Mounts 7 cases (regulation/market/research
record-grade via the real primitives; regulation/market/research/operations full-brief via the real
`FactBlocks`; Operations has no record-grade path - confirmed by grep, no `itemGrade === "record"`
branch in `OperationsDetailSurface.tsx` - so it is honestly full-brief-only here) against real
fixture data (below), and asserts every `[data-part="fact-card"]` has an `[data-part="item-group"]`
ancestor. Result: PASS on first run, no fix-at-the-cause needed for the DOM invariant itself (the
underlying wiring was already correct); one gate defect was found and fixed in building the test
itself (see "Corrections" below).

Fixtures added: `src/components/ui/__fixtures__/full-brief-fixture.ts` (full-brief content_md,
built from the SAME verbatim spans `record-grade-fixture.ts` already freezes - EC 391/2009,
EUR-Lex, intelligence_items.id = f8268063-0e07-4562-82da-a1373d6dd797 - reshaped as FACT
paragraphs per `fact-paragraphs.ts`'s citation convention, no invented claim text, no URL literal
per F46). Reused `record-grade-fixture.ts` (already frozen by lane W10-ActionCard-b) for the
record-grade cases rather than creating a second copy.

## Item 2: SectionHeader part

Built `src/components/ui/SectionHeader.tsx` (`data-part="section-header"`), one file: optional
"S2"-style index label + Anton 20 uppercase title + right meta, padding `14px 20px 10px`, 1px
`rgba(0,0,0,.08)` rule under the WHOLE header block (ruling 1, 2026-09-20, confirmed verbatim in
`docs/design/handoff-2026-09-07/README.md` "Undrawn cases" item 1), never under the title alone.
Mobile stacking follows the same precedent `SectionHeading.tsx`'s own MOBILE-60/FOLD-62 rulings
established for the sibling component.

Wired into `DetailSection` (`src/components/detail/DetailShell.tsx`), the ONE render path every
S-section on all four detail surfaces already goes through - `DetailSection` now renders
`SectionHeader` internally instead of its own inline `<h2>` + aside (F49). Added an optional
`index?: number` prop to `DetailSection`; the regulation surface (the only surface with a real
ordinal source today, `REGULATION_SECTION_INDEX` in `section-index-data.ts`, reused not
duplicated - the same table `SectionIndex` itself already reads) now passes it for all four of its
`DetailSection` calls (Summary, the dynamic Obligations/Requirements/Registration/Operations/
Compliance sections, Penalties, Sources), computed by a `sectionOrdinal(id)` lookup against that
table. Market/Research/Operations `DetailSection` calls do not pass `index` - honest omission, no
per-surface ordinal table exists yet for them, and `SectionHeader`'s own contract (its header
comment) is explicit that the index is never invented.

Title text: unchanged from what each surface's `DetailSection` call already passed (`CANONICAL_HEADINGS`
for Regulations, `RESEARCH_SECTION_HEADINGS` for Research, literal per-section strings for
Market/Operations) - the brief's "reuse section-index-data.ts, do not duplicate the names" is read
as: do not build a second short/full-name table; the ordinal comes from that one table, the full
title stays whatever the caller already supplies (never a short SectionIndex label).

F45 duplicate-code found real overlap between `SectionHeader.tsx`'s title `<h2>` style and
`SectionHeading.tsx`'s own (both Anton/20/.04em/--ink) - extracted to
`src/components/ui/section-title-style.ts` (`SECTION_TITLE_STYLE`), both files now spread it. This
is a genuine, deliberate shared-style extraction, not a workaround: the two components stay
separate (different rule/no-rule behavior per two different 2026-09-07/2026-09-20 rulings), only
the literal title type is shared.

## Item 3: fixture pages

`/admin/parts/item-group` (extended, not new): added a third panel, "Record-grade (frozen real
record)", rendering the same frozen EC 391/2009 record through `ItemGroup` + `RecordFactCard`
(the exact regulation-surface / `RecordFactsBody` shape), alongside the two pre-existing panels
(panel-21c groups, overflow demo, headerless group).

`/admin/parts/section-header` (new): three states, all from the frozen real record's own title/meta
data, no placeholder text - "S1 Summary" (ordinal + title + meta shape), "Sources" (title + meta,
no ordinal - the honest-omission shape), and the frozen record's own full, unabridged instrument
title with no ordinal/meta (proves the title wraps, never truncates - "no analysis text is ever cut
to fit a layout").

Both added to `/admin/parts` index (`src/app/admin/parts/page.tsx`).

## Corrections (found only by actually running the gates)

1. `full-brief-fixture.ts`'s first draft built an `eur-lex.europa.eu` URL literal for its citation
   text. `identifier-variants.test.mjs`'s "ONE home for eur-lex.europa.eu" test (F46) failed on it -
   correct catch, this repo already has exactly one home for that host's URL construction
   (`src/lib/sources/identifier-variants.mjs`) and my fixture duplicated it. Fixed by dropping the
   URL segment from the citation (same choice `record-grade-fixture.ts`'s own header documents for
   the same reason), keeping only title/issuer/date, which the citation parser accepts fine (URL is
   optional in that grammar).
2. `item-group-coverage-smoke.mjs`'s first draft repeated three near-identical `FactBlocks` mount
   bodies (regulation/market/research/operations full-brief) and two near-identical `RecordFactsBody`
   bodies inline per case. Not itself gated (`.discipline/` is outside F45's scanned tree), but bad
   practice regardless - refactored to one parameterized `SHAPES` object (3 shape functions) the 7
   cases select from, before this was ever an issue; not a gate-driven fix, a self-caught one.
3. `SectionHeader.tsx` vs `SectionHeading.tsx`'s title `<h2>` style block was a real F45 duplicate
   (3-line shared window). Fixed by extracting `section-title-style.ts` (see item 2 above). Required
   updating `AntonTitleLetterSpacing.npmtest.mjs`'s two per-component "carries letterSpacing 0.04em"
   tests to assert the shared module instead, following the SAME pattern that file's own
   `SectionHeading` promotion (lane comp-11, 2026-09-08) already used for `DashboardBrief`/
   `WatchlistSurface`/`MapPageView` - a component test follows its component; delegation is checked
   by the import assertion.
4. Same file's `DetailSection` test asserted a literal `letterSpacing: "0.04em"` string inside
   `DetailShell.tsx`'s `DetailSection` function body - true before this lane, false after
   (`DetailSection` now delegates to `SectionHeader`, no longer types that style itself). Fixed by
   rewriting the test to assert delegation (imports `SectionHeader`, renders `<SectionHeader>`, no
   `<h2>` of its own) plus a new, separate test asserting the style on `SectionHeader.tsx` itself -
   same "component test follows the component" pattern as correction 3.

## Consumers checked

- `grep -rn "<DetailSection" fsi-app/src`: four call sites in `OperationsDetailSurface.tsx`, one in
  `MarketSignalDetailSurface.tsx` (7 calls), one in `RegulationDetailSurface.tsx` (4 calls, all
  given `index`), `ResearchFindingDetailSurface.tsx` (4 calls). All pass through the new
  `SectionHeader`-backed render unchanged except the four Regulation calls, which additionally gain
  a real ordinal. No call site's `title`/`aside` prop shape changed.
- `grep -rn "SectionHeading" fsi-app/src`: unchanged consumers (`DashboardBrief.tsx`,
  `WatchlistSurface.tsx`, `MapPageView.tsx`) - `SectionHeading.tsx`'s own props/behavior are
  untouched; only its internal style construction now reuses the shared constant.
- `grep -rn "REGULATION_SECTION_INDEX" fsi-app/src`: `SectionIndex.tsx` (re-export),
  `RegulationDetailSurface.tsx` (existing `orderedDynamicEntries`/`indexEntries` uses, unchanged;
  new `sectionOrdinal` lookup added, read-only, no write to the table).
- `docs/decisions/`: no ADR names `DetailSection`, `SectionHeader`, or `ItemGroup`'s ancestor
  contract; nothing to check against.

## UX compliance

**`/regulations/[slug]` (and the other three detail surfaces via the shared `DetailSection`).**
Primary goal: unchanged - read a section's compliance content. Path: unchanged navigation; the
S-section head now additionally shows an ordinal on the regulation surface (Summary/Obligations/
etc. now read "S1 Summary", "S2 Obligations", ... instead of a bare title), a wayfinding aid, not a
new step. One primary action: unchanged, `DetailSection` carries no interactive control of its own.
Feedback state: n/a, `SectionHeader` is presentational only, no async behavior.

**`/admin/parts/item-group`, `/admin/parts/section-header`.** Primary goal: platform-admin fixture
sign-off, read the part's real states. Path: one page load, no interaction required, static fixture
data. One primary action: none (read-only gallery). Feedback state: n/a, no async behavior, no
database read on either page.

Law 2 (touch targets): neither new component (`SectionHeader`, the two fixture pages) introduces an
interactive control. Law 8 (icon-only targets with no label): n/a, no icons. `prefers-reduced-motion`:
n/a, no animation in either component.

## Gates

- `npx tsc --noEmit`: clean, three times (after each round of fixes).
- `bash .discipline/run-test-suite.sh` (the no-npm glob): final run 6351+1518 tests, 0 fail (two
  earlier runs each surfaced one real defect, fixed at the cause per "Corrections" above).
- `sh fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh` (run from the worktree root, per that
  script's own path check): final run 1485 tests, 0 fail (one earlier run surfaced the
  `AntonTitleLetterSpacing.npmtest.mjs` defect, fixed at the cause).
- `node fsi-app/.discipline/fitness/runner.mjs`: final run, 47 functions checked, 0 violations
  (one earlier run surfaced the F45 duplicate-code regression, fixed at the cause).
- `node .discipline/rendering/run-rendering-guard.mjs`: PASS on every run this session, including
  the two final runs after all fixes landed (see the session's own final report for the exact
  summary lines).

## Open items

- The locked push-gate preflight (`DISCIPLINE_HOOK_TRAMPOLINE=1 sh fsi-app/.discipline/hooks/pre-push`)
  and the "locked push gate" background task named in the brief: attempted; see the final report for
  outcome (STOP/result recorded there, not duplicated here).
- Market/Research/Operations `DetailSection` calls carry no `index` (ordinal) - honest gap, not a
  defect: no per-surface ordinal table exists for those three surfaces yet. A future lane building
  one for Market/Research/Operations (mirroring `REGULATION_SECTION_INDEX`) can wire it through
  `DetailSection`'s existing `index` prop with no `SectionHeader`/`DetailSection` change needed.
