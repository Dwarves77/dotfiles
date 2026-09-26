# Lane PARITY-PARTS: look-only pass against the new artboards (#801)

Executor lane, dispatch: #800 LOOK-ONLY pass against the artboards merged in PR #801 ("Design
handoff 2026-09-25: connections strip in the masthead; absence names the data it needs"). Worktree
`.claude/worktrees/agent-a5509a6c592b1ef4d`, branch `lane/parity-parts`, rebased onto
`origin/master` (`98d0032c`) before this pass, one conflict (README's own 780px content-width
line, both sides carrying the same value), resolved by keeping origin/master's text.

## The six items

1. **Connections strip in the masthead card.** Done for regulations (03), research (07),
   operations (09). `ItemConnectionsCard` gained a `variant="masthead"` (bare card, Anton 17px
   title plus "N linked items", `repeat(3, minmax(0,1fr))` grid of link-cards, matched to the
   re-exported `.dc.html`'s own masthead-strip markup). `Masthead.tsx` gained an additive
   `connectionsSlot` prop (same pattern as the existing `actionSlot`, its own top divider), wired
   through `DetailShell.tsx`'s `DetailMasthead`. Each of the three surfaces' former "Related"
   main-content section (built by the prior #800 pass, check 8) is removed and dropped from the
   sticky section index. **Market (board 05) is unchanged**: the 2026-09-25 boards name only
   03/07/09 for this move (rule 19); market keeps Connections as a main-content "Related" section.
   Research's "Related" section is not deleted outright, it also carried a by-theme/by-source
   related-findings list the boards do not name for the masthead move, split out (`hasConnections`
   vs `hasRelatedFindings`) so only the Connections half relocated.

2. **Absence wording ("needs ...").** Done. `Absence.tsx`'s default (`reason`) variant is reversed
   from the 2026-09-24 "renders nothing" ruling back to rendering a small-caps "needs ..." phrase,
   per the coordinator close addendum's verbatim reversal. Added a closed `NEEDS_PHRASE` map (not a
   free-text field, per rule 19: the board's own examples, e.g. "needs 4 price inputs", are
   examples of the pattern, not scope to hand-author per call site) covering the four platform
   reasons. "pending"/"unscored"/"not scored" never render as literal words (verified: the
   `NEEDS_PHRASE` values are all lowercase, so they can never collide with the guard's
   case-sensitive `FORBIDDEN` list of uppercase literals). `narrow`/`dash` variants unchanged
   (still an em dash glyph in fixed-width cells, glyph:verbatim, the product's own visual token,
   not authored prose), flagged below as a Design Change Owed since the new board text doesn't
   name the narrow-cell case one way or the other.

3. **Band tag once, in the masthead.** Done. `ItemGroup.tsx`'s dot+label PILL now renders only
   for an explicitly-passed `band` prop; the ambient page band from `BandProvider` (which every
   S-section on regulation/market/research/operations detail pages was inheriting, repainting the
   masthead's own `BandChip` a second time per group) no longer drives the pill. The header's TINT
   (background, ACTION-strip colour) is unchanged, that's a grouping/urgency colour cue, not the
   "tag" the operator's note names.

4. **SCOPE wrapper removed.** NOT FOUND, not built. Exhaustive search (`grep -rn "SCOPE"`
   case-sensitive and case-insensitive across `src/`, `theme.css`, `globals.css`; checked
   `Masthead.tsx`, `DetailShell.tsx`, `EditorialMasthead.tsx`, `PageMasthead.tsx` for any wrapper,
   className, or literal text) found no code artifact resembling a "SCOPE wrapper". Every `SCOPE`
   hit in the codebase is either the FactCard `kind` vocabulary value (a real, wanted 0.5 kind-band
   category) or an unrelated word ("scoped", "scope 3"). This is a visual observation from the
   operator looking at a rendered build, not something a code search can resolve, and I had no
   authenticated way to render the app this session (see below) to identify it by eye. Per rule
   20, this is not guessed; it needs the coordinator to point at the specific element (a
   screenshot or a route plus selector) before it can be removed.

5. **Section cards with the 3px top rule.** Already structurally correct, re-verified, not
   touched. `SectionCard.tsx` unconditionally mounts `<SectionRule/>` (the 3px gradient rule) for
   every card regardless of caller (its own header note, operator item A1); `DetailSection` (the
   part every S-section on every detail surface renders through) uses `SectionCard`. Grepped all
   four detail surfaces for a hand-built section wrapper bypassing `SectionCard`/`DetailSection`,
   none found. F42 (hand-built card shell) and the existing fitness/rendering-guard gates already
   enforce this class; nothing regressed it in this pass.

6. **Operations Sources table (squeezed).** Could not verify, not touched. `SourcesGrid.tsx`
   is the ONE shared "Sources" section body for all four detail surfaces (`grid-template-columns:
   auto 1fr`, no surface-specific override); grepped `OperationsDetailSurface.tsx` for any
   `maxWidth`/`width` override on its Sources section and found none, it renders through the same
   `DetailSection` 72ch column every other surface uses. I could not find a code-level cause
   distinguishing Operations from the other three surfaces, and could not render the page live to
   see the reported squeeze (no test account; see below). Design Change Owed / needs coordinator
   input: either point at the specific squeeze (a route, viewport and screenshot) so a real cause
   can be found, or confirm it was a data-content effect (long source names/regions on that
   particular fixture) rather than a layout defect.

## Why no live render this session

Started the dev server via the Browser pane (`.claude/launch.json`, `npm --prefix
<worktree>/fsi-app run dev`) to visually confirm items 1, 4 and 6 against the artboards. Every
detail route redirects to `/login`; there is no test account, no documented dev-bypass, and the
repo's own artboard-parity harness (`fsi-app/scripts/tmp/artboard-parity-local.mjs`) reads a saved
Playwright `storageState` from a DIFFERENT prior session's scratchpad path that isn't available to
this session. Per the environment's own rule (never enter real credentials, and this session has
none of its own to enter), I did not attempt to sign in, and did not reuse another session's saved
production cookie. Items 2, 3, and 5 were verified by static/fixture means (`node --test`, `tsc`,
the fitness runner, and the parity-checks-smoke.mjs rendering-guard spec, which mounts the real
component tree against fixture data, no auth needed). Items 1, 4 and 6 are code-complete/verified
by grep-and-read where stated above, but a human (or an authenticated session) should confirm the
rendered result against the artboards before sign-off.

## Design Changes Owed

- **SCOPE wrapper** (item 4): location unidentified this session; needs coordinator to name the
  element (route plus selector or screenshot).
- **Operations Sources squeeze** (item 6): no code-level cause found; needs coordinator to confirm
  whether it's a real layout defect or a data-content artifact, and on which route/viewport.
- **Absence `narrow`/`dash` variants**: still render an em dash glyph in fixed-width cells (list
  row tier column, operations matrix), carrying the new `NEEDS_PHRASE` text only on
  `aria-label`/`title`. The 2026-09-25 board text does not name this case; flagging for
  confirmation rather than guessing whether the new "needs ..." text should also appear visually
  in a cell too narrow to hold it.
- **"Related in Asia" removal** (board 09, noted in the coordinator's own `2026-09-25-artboards.md`
  dispatch note): observed as an adjacent board change but explicitly OUT of this lane's six-item
  scope per the dispatch. Not touched; flagging so it isn't lost.

## UX compliance

Three `.tsx` surfaces changed (`RegulationDetailSurface.tsx`, `ResearchFindingDetailSurface.tsx`,
`OperationsDetailSurface.tsx`) plus three shared parts (`Masthead.tsx`, `ItemGroup.tsx`,
`ItemConnectionsCard.tsx`, `Absence.tsx`). Per surface:

- **Primary goal**: read one item's own detail (regulation, finding, or regional profile) and see
  everything it connects to, in one place.
- **Path**: unchanged. Masthead, then action row/exposure/timeline, then section index, then
  sections, then rail; Connections is now reached by scrolling the masthead card itself rather
  than jumping to a separate section, one fewer stop, not an added one.
- **One primary action**: unchanged (Export brief in the action row); this pass touches no action,
  only where existing content renders.
- **Feedback states**: no new async action introduced. Absence's reversal changes a SYNC render
  (there was never a loading state for "no value") from empty to a small-caps line naming what's
  needed, closer to ux-laws' "say what's missing, not just that it's missing" than the prior
  "render nothing" state.
- **375px**: not independently re-verified this session (no live render, see above); the existing
  rendering-guard UX-smoke coverage (`detail-surfaces-smoke.mjs`, `section-index-smoke.mjs`,
  `parity-checks-smoke.mjs`) runs at 1440 and is unaffected structurally by this change (additive
  props, no new fixed widths); flagged for the coordinator's own 375px pass alongside items 1/4/6.

## Addendum: Playwright verification pass (operator-directed, same day)

The operator directed live rendering rather than code-only verification. Method: `src/proxy.ts`'s
auth check was temporarily patched with a literal `if (process.env.UI_SCREENSHOT_BYPASS === "1")
authenticated = true;` branch (same env-only pattern as UI-SYSTEM lane commit `2aa17758`), a local
`next dev` was run against it with `UI_SCREENSHOT_BYPASS=1` in `.env.local` (gitignored, untracked),
Playwright captured all three routes at 1440 and 375px, and **both the proxy.ts patch and the env
var were reverted before this commit** (`git diff src/proxy.ts` is empty; `.env.local` restored from
its own pre-session backup). Screenshots: `fsi-app/scripts/tmp/{regulations,research,operations}-detail-{1440,375}.png`.

Per-item, re-labeled against live evidence (rule 14):

1. **Connections in masthead**, `[CONFIRMED]`. Live on all three routes: regulations shows
   "CONNECTIONS · 22 LINKED ITEMS" inside `.cl-masthead`; research "1 LINKED ITEM"; operations
   "21 LINKED ITEMS". Found and fixed live: the 3-column grid had no mobile breakpoint and hard
   clipped every card at 375px (measured, roughly 110px per column, both the kind label and title
   cut mid-word); added a `max-width: 640px` collapse to 1 column
   (`ItemConnectionsCard.tsx`); re-captured, clean at 375 on all three routes.
2. **Absence "needs..."**, `[CONFIRMED]`. Live text observed: "WHO PAYS: NEEDS PRIMARY-SOURCE
   FIGURE", "NEXT MILESTONE: NEEDS MORE DATA", "connect ↗", on regulations, research and
   operations alike.
3. **Band tag once**, `[CONFIRMED, and a real regression found and fixed]`. The band PILL itself
   does not duplicate. But decoupling the pill from the ambient band left `hasHeader` still keyed
   on the raw (tint-only) `band`, so every `ItemGroup` on a single-item page rendered an EMPTY
   pink/tinted header bar (no title, no pill) directly above its fact cards, confirmed via DOM
   query (`data-part-slot="group-header"` present, zero text content, `height: 21px`,
   `background: var(--immediate-tint)`) on all 5 groups on the regulations item under test. Fixed:
   `hasHeader = Boolean(title || pillBand)` (was `Boolean(title || band)`); re-verified live, zero
   empty headers remain. **This empty bar is almost certainly what the operator's note (4) called
   "a SCOPE wrapper is visibly present"**, see item 4.
4. **SCOPE wrapper**, `[REFUTED as a separate defect; explained by item 3]`. No literal "SCOPE
   wrapper" element exists. "SCOPE" is the FactCard `kind` vocabulary value (README 0.4: DEADLINE /
   BASELINE TARGET / NATIONAL TARGET / SCOPE / PENALTY / DEFINITION), and it renders correctly
   (ink edge, `--tag` background, per spec) on every route checked. What WAS visibly wrong,
   directly above a SCOPE-kind card in most groups, was the empty tinted header bar from item 3,
   fixed there. Flagging this as explained-and-fixed rather than a second, separate removal.
5. **Section 3px top rule**, `[CONFIRMED]` via DOM query: every `[data-section-card]` on the
   regulations item (masthead plus all 8 S-sections) has a first child 3px tall (`SectionRule`),
   `border: 1px solid rgba(0,0,0,.12)`, `border-radius: 10px`, box-shadow present. No section
   bypasses `SectionCard`.
6. **Operations Sources squeeze**, `[REFUTED]`. Measured live on `/operations/singapore-regional-
   operations-profile#sources`: the Sources `DetailSection` renders at 782px (matches the 780px
   spec exactly), each source row at 740px, identical `SourcesGrid` component every other surface
   uses. No squeeze found. The 3 sources on this fixture item happen to carry no `tier` value
   (a data fact, not a layout defect), so their rows show no T-badge, visually different from
   regulations' T1-badged rows, but not squeezed.

## Gates run this session

- `node --test` on the three changed unit files (`Absence.npmtest.mjs`, `ItemGroup.npmtest.mjs`,
  `ItemConnectionsCard.npmtest.mjs`): 20/20 pass.
- `npx tsc --noEmit`: clean.
- Full no-npm suite (`run-test-suite.sh`): 1620/1620 pass, 4 skipped (pre-existing, unrelated).
- npm-dependent suite (`run-npmtest-suites.sh`): 1529/1529 pass (one stale ImpactMeter assertion
  updated for the new Absence dash text).
- Fitness runner: 49 functions checked, 0 violations.
- Rendering guard (Playwright): PASS, 877 checks, 19 UX smoke specs including `parity-checks`.
- Full pre-push preflight (`DISCIPLINE_HOOK_TRAMPOLINE=1 sh .discipline/hooks/pre-push`): all 4
  steps pass.
