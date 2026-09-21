## 2026-09-21, W10 lane w10-commandbar: one bar, no toggle (undrawn-cases ruling 2)

Removed the CMDSEARCH lane's 2026-09-09 Search/Ask mode toggle from `src/components/ui/CommandBar.tsx`
per undrawn-cases ruling 2 of 2026-09-20 ("One bar, no toggle ... Search is not dropped, the toggle
is"). One input, always search-capable, always ask-capable:

- Typing (2+ chars, existing debounce/stale-request cancel) calls `GET /api/search` through
  `authedFetch` (F40) unconditionally and shows results inline below the bar, unchanged WAI-ARIA
  combobox pattern. `onSearch` (the page-local instant-filter callback) fires on every keystroke,
  unchanged.
- Enter with an active dropdown option follows that option's href, unchanged.
- Enter with no active option opens `/search?q=<text>` (new pure builder `searchResultsHref`,
  `commandBarKeyboard.ts`) instead of silently doing nothing.
- Cmd+Enter / Ctrl+Enter, or the always-visible "Ask" button, dispatches the unchanged
  `open-ask-assistant` event. New pure decision `resolveEnterKeyAction(metaOrCtrl, activeIndex)` in
  `commandBarKeyboard.ts` resolves the three-way Enter split (ask, then navigate-active, then
  open-results).
- Escape dismisses; Cmd+K focuses, both unchanged.
- The Ask button disables with a reason (`title`) while `ASSISTANT_ENABLED` is off; the INPUT is
  never disabled, search always works even while Ask is down. The placeholder is always the
  search-or-ask copy, never an "assistant unavailable" message.
- The placeholder default is restored to `Search or ask across N items...`; every page-scoped
  placeholder override already carried "or ask" except
  `src/components/operations/OperationsCalculatorPageView.tsx`'s (was ask-only), fixed to
  `Search or ask about this estimate, e.g. "..."`.
- The part root (`<form>`) carries `data-part="command-bar"`.

### Consumers enumerated (fresh grep, per lane-common-contract section "Prior art")

`grep -rn "<CommandBar" src --include="*.tsx"` found CommandBar mounted in exactly one place,
`src/components/ui/Masthead.tsx:212`; every other surface reaches it by passing a `commandBar` prop
to `<Masthead/>`. `grep -rln "commandBar={" src/app src/components` found 13 files (see the Presence
report below for the full route mapping). All 13 keep working unchanged, the prop shape
(`itemCount`, `onSearch`, `scope`, `placeholder`) did not change; only `CommandBar.tsx`'s internals
and the always-restored placeholder wording changed. One new consumer added this lane:
`src/components/search/SearchResultsView.tsx` (the new `/search` results page's own masthead).

### `/search` results page (new route, ruling 2: "Enter opens the results page")

Premise `[CONFIRMED]` by the coordinator on `b1dd38e4`: `GET /api/search` (`src/app/api/search/
route.ts` + `logic.ts`) already existed; `src/app/search/` did not.

Built as a server/view split, same convention as `OperationsItemsView.tsx` and the other `*View.tsx`
components in this app:

- `src/app/search/page.tsx`, async SERVER component. Reads `?q=`, calls `runSearch` (the existing
  pure retrieval core in `src/app/api/search/logic.ts`) directly against a cookie-scoped Supabase
  client, server-side, not a second client round trip through the API route. `force-dynamic`
  (per-user auth, per-query-string, same reasoning as `src/app/watchlist/page.tsx`). Contains ZERO
  literal part styles (F49 parts-not-pages): all markup delegates to `SearchResultsView`.
  BOUNDED (F38/F39): `runSearch`'s own `MAX_RESULTS` (20) ceiling is unchanged and never raised; at
  cap, an honest "Showing the top 20 matches" `StateNote` renders instead of a second unbounded read.
  CLOSED BY DEFAULT (F43): no accordion, nothing opens itself.
- `src/components/search/SearchResultsView.tsx`, the presentational client component (pure props:
  `q`, `results`, `maxResults`, `dateLabel`, `nowIso`). Split out from `page.tsx` specifically so the
  rendering guard's smoke harness (a client-bundle-only sandbox, no Next.js request context) can
  mount it: `page.tsx`'s `createSupabaseServerClient()` reads `next/headers` cookies, which the
  smoke bundle cannot construct.
- Same frame and masthead as every other list surface (README section 0.3): `<Masthead/>` (carrying
  its own `<CommandBar/>`) + `<PageFrame/>`, one `<SectionCard/>` holding rows on the existing shared
  `ListRow`/`ListRowColumnHeader` parts, no new row component (F45/F42). Honest empty states for
  "no query yet" and "no results for this query" (`<StateNote/>`), distinguished from each other.
  Row title carries `data-guard-title` (inherited from `ListRow`, unchanged).
- Registered for the 375/1280 measurement: `.discipline/rendering/smoke/search-results-smoke.mjs`
  (new, built on `ux-harness.mjs`'s `runUxSpec`, four states: no-query, empty, one-row, extreme;
  extreme is `MAX_RESULTS` rows of long unbroken titles, proving both the "showing the top N" banner
  and row-title wrap at 375px), registered in `ux-smoke-specs.mjs`'s `UX_SMOKE_SPECS`, and a matching
  `F35-row-ux-coverage.mjs` `ROW_COMPONENTS` entry for `src/components/search/SearchResultsView.tsx`.

### Files disjoint from lane W10-FactCard-b

Did not touch `FactCard.tsx`, `fact-card-model.ts`, `RegionDimensionMatrix.tsx`, any detail surface,
or `src/app/admin/`. Confirmed by this lane's own `git status` staging list (11 files, all
CommandBar/search-page/masthead-audit-spec scoped).

### Presence report: CommandBar (coordinator amendment)

Every route where the `commandBar` prop is passed truthy (i.e. the part actually renders), found by
`grep -rn "commandBar={" src/app src/components` and then mapping each carrying component to the
route(s) that mount it (`grep -rln "<Component>" src/app`):

- `/` : `src/components/dashboard/DashboardMasthead.tsx:87`
- `/admin`, `/admin/factors` : `src/components/admin/AdminDashboard.tsx:470`
- `/regulations`, `/market`, `/research`, `/operations` : `src/components/list-surface/ListSurfaceShell.tsx:422` (one shared shell, four list routes)
- `/watchlist` : `src/components/watchlist/WatchlistSurface.tsx:258`
- `/regulations/register` : `src/components/regulations/ObligationRegisterPageView.tsx:151`
- `/operations/calculator` : `src/components/operations/OperationsCalculatorPageView.tsx:55`
- `/regulations/[slug]`, `/market/[slug]`, `/research/[slug]`, `/operations/[slug]` : `src/components/detail/DetailShell.tsx:199` (one shared shell, four detail routes)
- `/settings` : `src/components/pages/SettingsPage.tsx:185`
- `/profile` : `src/components/profile/UserProfilePage.tsx:294` and `:323`
- `/map` : `src/app/map/page.tsx:83`
- `/community` : `src/app/community/page.tsx:519`
- `/search` (new this lane) : `src/components/search/SearchResultsView.tsx:51`

**Auth frame, absent by design (ruling 3), verified this lane:**
`grep -n "Masthead\|CommandBar" src/app/login/page.tsx src/app/signup/page.tsx src/app/onboarding/page.tsx src/app/workspace/new/page.tsx src/app/invitations/*/page.tsx`
returned no matches in any of the five files. None of `/login`, `/signup`, `/onboarding`,
`/workspace/new`, `/invitations/[token]` render `Masthead` or `CommandBar`. Confirmed, not just
asserted from the brief.

**Equivalent search/ask bar rendered WITHOUT the part:**
`grep -rln "open-ask-assistant" src --include="*.tsx" | grep -v "CommandBar.tsx\|AskAssistant.tsx"`
returned one hit, `src/components/research/ResearchLedger.tsx`. Read in context (line ~324-331): this
is a "Why unscored" `StateNote` action link on the Awareness band card that dispatches the SAME
`open-ask-assistant` CustomEvent the masthead CommandBar dispatches, with a canned question. It is an
alternate TRIGGER for the one Ask surface (reusing the existing event contract, logged in
DEVIATION-LOG.md per that file's own comment), not a second search/ask INPUT or bar. No hand-rolled
duplicate bar found.

**Owed:** the part's `/admin/parts` presence index is lane W10-FactCard-b's build (in progress per
the coordinator); this lane's presence report above is the raw material for its CommandBar row, not
a substitute for that page.

### UX compliance (w10-commandbar)

**Screen/block 1, CommandBar (shared part, all 13+ routes above).**
- Primary goal: find an item (search) or get a scoped answer (ask) from wherever the reader already
  is, without navigating away first.
- Path: focus the bar (click, or Cmd+K), type, then either (a) glance the inline dropdown and
  click/Enter a result, (b) press Enter with no result highlighted to see everything on `/search`,
  or (c) press Cmd+Enter/Ctrl+Enter or click Ask to ask the assistant the same text.
- One primary action: the dark "Ask" button is the bar's single visually-dominant control; typing and
  Enter are the implicit/keyboard paths, not a second competing button.
- Feedback state: typing shows a skeleton row set (`SkeletonListRow`) while `searching`, then results
  or an honest "No results for ..." `StateNote`; Ask is disabled with a `title` reason when the
  assistant is unavailable, so the reader knows before clicking, never after a failed request.

**Screen/block 2, `/search` results page (new).**
- Primary goal: see everything the workspace has for a query, past what fits in the bar's own inline
  dropdown.
- Path: arrive via Enter (no active option) from any CommandBar, or a direct link, then read the
  results list, same row anatomy as every other list surface, then click a row to open the item.
- One primary action: click a result row (the whole row is the click target, per the shared `ListRow`
  contract, unchanged here). No secondary controls compete with it.
- Feedback state: "no query yet" (type-a-search prompt), "no results" (named query, zero matches), and
  an at-cap `StateNote` ("Showing the top 20 matches") are each their own distinct honest state; a
  loading skeleton is not needed since results are server-resolved before first paint (no client fetch
  on this page).

### Gates

- `node --test src/components/ui/commandBarKeyboard.npmtest.mjs`: 23/23 pass.
- `node --test src/components/ui/CommandBar.npmtest.mjs`: 31/31 pass (one regex range widened after
  a real first-run failure against the new `onSubmit` handler's longer inline comment; fixed in the
  same commit, not left red).
- `npx tsc --noEmit`: clean.
- `bash .discipline/run-test-suite.sh`: `tests 1435 / pass 1431 / fail 0 / skipped 4` (npm-deps
  suite) plus `tests 6305 / pass 6304 / fail 0 / skipped 1` (no-npm suite); `audit-finding-status.mjs`
  prints its standing pre-existing unlabeled-finding backlog (`|| true`, report-only, not this lane's
  debt; none of the 640 lines are in a file this lane touched).
- `node .discipline/fitness/runner.mjs`: `46 function(s) checked, 0 violation(s)` (F35, F45, F49
  each individually confirmed PASS in the full run).
- Push gate output: see the lane's final report.
