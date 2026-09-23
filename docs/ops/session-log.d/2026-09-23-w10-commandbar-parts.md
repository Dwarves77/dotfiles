# Lane W10-CommandBar-parts session log (2026-09-23)

Brief: `docs/dispatches/lane-briefs/2026-09-22/brief-w10-remaining-parts.md`, section "3. W10-CommandBar
parts page" plus its COMMON BLOCK. Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-landdocs-0911`,
branch `lane/w10-commandbar-parts`, cut from `origin/master` at `316a79d4`.

Skills loaded: `fsi-app:environmental-policy-and-innovation` (COMMON BLOCK first call; not otherwise
relevant to this UI-only lane), `frontend-design` (COMMON BLOCK, UI work), `remediation-discipline`
(COMMON BLOCK; also directly applicable, see F45 fix below), `caros-ledge-platform-intent` (gated the
governed-file writes; see Value Delivery Check below).

## What was built

1. **`src/app/admin/parts/command-bar/page.tsx`**, the CommandBar sign-off page. Five sections, all
   rendering the real `CommandBar` part (`src/components/ui/CommandBar.tsx`) unmodified:
   - at 1440 (desktop, 40px tall bar, ⌘K hint visible)
   - at 375 (mobile spec, 44px tall bar, ⌘K hint hidden per CommandBar's own media query)
   - inline results state: real dropdown, real frozen rows
   - Ask-disabled state: the button carries the disabled attribute + a title naming the reason
   - 16 page-scoped placeholder variants, enumerated by `grep -rn "placeholder" src --include="*.tsx"`
     against every `commandBar={{placeholder}}` / `searchPlaceholder` / `<DetailMasthead
     placeholder=...>` call site (excluding the one false positive found, a market-signal notes
     `<textarea>` unrelated to CommandBar). One row per distinct string; the two UserProfilePage.tsx
     call sites sharing one string are listed once, both files named.
2. **`src/components/ui/__fixtures__/search-results-fixture.ts`**, frozen from one read-only SELECT
   against the live search path (mirrors `src/app/api/search/logic.ts::runSearch`: the
   `search_intelligence_items` RPC, migration 159, then the same re-fetch shape), project
   `kwrsbpiseruzbfwjpvsp`, 2026-09-23, query `"carbon"`, 5 rows. Exact query text and a second frozen
   SELECT (`SEARCH_FIXTURE_VERIFIED_COUNT = 1440`, the live verified-item count used for the default
   placeholder demos) are in the file's own header, ids included. SELECT only, no write.
3. **`src/app/admin/parts/command-bar/CommandBarPartsDemo.tsx`**, fixture-only client scaffolding
   (not a shared part) that intercepts, at module-load time (not inside a `useEffect`, to win the race
   against `useWorkspaceBootstrap`'s page-wide singleton, see the file's own header), the two network
   calls CommandBar makes internally: `/api/workspace/bootstrap` (mocked to `assistantEnabled: false`
   for the whole page, this IS the Ask-disabled section, honestly page-wide rather than faked
   per-instance) and `/api/search?q=carbon` (mocked to the frozen rows above; every other query on this
   page resolves to an empty result set, never a live network call). `CommandBarInlineResultsDemo`
   additionally drives the real input via the native value setter + a real `input` event (the same
   mechanism this repo's own Playwright smoke specs use) to open the dropdown deterministically.
4. **`src/components/admin/PartsPageHeading.tsx`**, extracted shared heading component; see the F45
   fix below.
5. Added a `command-bar` entry to `src/app/admin/parts/page.tsx`'s `PARTS` index.

## Part defect found and fixed

None in `CommandBar.tsx` itself. One found in the FIXTURE PAGE PATTERN, not the part: my new
`command-bar/page.tsx` retyped the exact heading block `masthead/page.tsx` already had (F45
duplicate-code flagged +18 duplicated lines vs this branch's merge-base, naming the clone pair
directly). Fix: extracted `PartsPageHeading` (a title-only wrapper, no CommandBar/Masthead markup in
it) and refactored BOTH `command-bar/page.tsx` and `masthead/page.tsx` to use it. Re-ran the fitness
runner: 0 violations. This is a class fix, not an instance patch (2 confirmed instances, F45's own
class-over-instance framing), consistent with remediation-discipline's Section 5 migration pattern.

Noted, not fixed: `CommandBar.tsx` hardcodes `id="cl-command-bar-input"` (a page-singleton id by
production design, `TopBar.tsx`'s mobile search-focus affordance depends on exactly one CommandBar per
real page). This fixture page mounts ~20 instances, so the DOM carries duplicate ids, an HTML-validity
nit, not a functional defect on this route (no `layout.tsx` wraps `/admin/parts/*` with `TopBar`,
confirmed by `find`). The already-merged `/admin/parts/masthead` page has the identical shape (3
CommandBars via 3 Mastheads) and its own lane did not flag it. Consistent with that precedent, and
because `CommandBarInlineResultsDemo` scopes its own query via a container ref rather than
`document.getElementById` (avoiding any functional cross-talk), this was left as-is rather than
changing CommandBar's id scheme, which would risk TopBar's real production behavior for a fixture-page
cosmetic concern outside this lane's write set.

## Consumers checked

- `grep -rn "SearchResultRow" fsi-app/src`: only `src/app/api/search/logic.ts` (the type's home) and
  `src/components/ui/CommandBar.tsx` (its one production consumer); my fixture's `import type` adds a
  third, type-only, reference, no runtime coupling.
- `grep -rn "cl-command-bar-input" fsi-app/src`: `CommandBar.tsx` (defines it), `TopBar.tsx` (reads it,
  see the noted-not-fixed item above), unchanged by this lane.
- `grep -rn "PartsPageHeading" fsi-app/src`: the two files this lane wired it into, after the edit.
- ADRs: `grep -ril "search_intelligence_items\|command.bar\|assistantEnabled" docs/decisions/`, no
  matching ADR found; nothing to reconcile against.

## Gates run (verbatim summary lines)

- `tasklist | grep -ic node.exe` checked before every gate below per the coordinator's correction:
  3 each time, no contention wait needed.
- `npx tsc --noEmit`: clean, exit 0 (run twice, before and after the F45 fix).
- `bash .discipline/run-test-suite.sh`: **tests 1518, suites 36, pass 1514, fail 0, cancelled 0,
  skipped 4, todo 0**, script exit 0. (This node/npm's reporter prints `ℹ tests`/`ℹ pass`/`ℹ fail`, not
  `# tests`/`# pass`/`# fail` as the COMMON BLOCK's grep pattern names, same numbers, different
  reporter prefix; noted honestly rather than silently reformatted.) The script's own
  `audit-finding-status` step reports 607 unlabeled findings across 122 pre-existing `docs/audits/*.md`
  files this lane never touched (`git status` confirms no changes under `docs/audits/`), pre-existing
  repo debt, not a gate failure (script exit 0).
- `node .discipline/fitness/runner.mjs`: **47 functions checked, 1 violation** before the F45 fix
  (duplicated heading block, named above), **0 violations** after.
- `node .discipline/rendering/run-rendering-guard.mjs`: run TWICE per the coordinator's correction.
  Both runs: **14 fixtures / 846 checks, 14 SM smoke specs / 294 checks, 18 UX smoke specs / 348 ux
  checks, layout guard 36 route×width measurements / 0 findings, `=== rendering guard PASS ===`.**
  Neither run mounted the new command-bar page (it is not a `ROW_COMPONENTS`/F35 entry, a fixture
  sign-off page, not a shared row/ledger part, so no new UX smoke spec was owed).

## Value Delivery Check

=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery.

This is a platform-admin sign-off fixture page (`/admin/parts/command-bar`) proving the already-shipped
`CommandBar` part (lane W10-CommandBar, #769) renders correctly across its states. No customer-facing
route changed; `CommandBar.tsx` itself is unmodified. The customer-facing value gap on Market Intel,
Research, Operations, Community expansion, and Onboarding completion is unaffected by this dispatch.

Dual-posture: platform-admin tooling, not scoped to current-vs-expansion cohort either way.

## UX compliance

**`/admin/parts/command-bar`.** Primary goal: platform-admin fixture sign-off, visually verify the
CommandBar part's states without touching a customer route. Path: one page load, static/mocked fixture
data (no live DB read at request time), no interaction required to see every state. One primary action:
none (read-only sign-off page). Feedback state: n/a for the idle/placeholder/ask-disabled sections
(presentational); the inline-results section fires a real (mocked) fetch on mount and the real
CommandBar debounce/skeleton states apply exactly as they do in production, no separate feedback
mechanism was added. Law 2 (touch targets): unchanged, CommandBar's own 44px close button and 40/44px
bar height are untouched by this lane.

## Open items

- The "no fetch to a raw URL" fitness check for browser modules (F40) was not re-verified explicitly by
  name against `CommandBarPartsDemo.tsx`'s `window.fetch` patch; `npx tsc --noEmit` and the full fitness
  runner (47 functions, 0 violations) both passed clean, which covers F40 since it is one of the 47, but
  this is noted for the coordinator rather than silently assumed.
- `useWorkspaceBootstrap`'s singleton-persists-across-navigation caveat (named in
  `CommandBarPartsDemo.tsx`'s own header) means the Ask-disabled demo is reliable only on a fresh
  navigation to this page; not fixed further, disclosed instead.
