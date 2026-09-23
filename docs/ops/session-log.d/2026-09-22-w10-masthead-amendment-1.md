# 2026-09-22, Lane W10-Masthead, amendment 1 (replacement agent, finishing the lane)

## Accomplished

1. **Auth frame (ruling 1).** The left identity panel in `AuthFrame.tsx` is untouched. The right
   panel now renders the shared `Masthead` (eyebrow, Anton title, dek) above the form, using each
   page's own existing text, no invented copy:
   - `src/app/login/page.tsx`: `Masthead` title "Sign in".
   - `src/app/signup/page.tsx`: `Masthead` title "Create account".
   - `src/components/onboarding/OnboardingWizard.tsx`: the four page-local Anton `h1`+dek pairs
     (step 2 "Where do you move freight?", step 3 "Which sectors do you watch?", step 4 "How should
     we brief you?", step 5/done "You're set up") are replaced by the shared `Masthead`
     (`size="detail"`), same title/dek text as before, no page-local Anton styling left.

2. **Community (ruling 2).** `CommunityMasthead.tsx` and `EditorialMasthead.tsx` are deleted (both
   had exactly one remaining importer, each other/`CommunityMasthead`, once `CommunityShell.tsx` was
   repointed). `CommunityShell.tsx` now calls the shared `Masthead` directly
   (`title="Community"`, `dek="Regional working groups, public forums. Connect with peers across
   the industry"`, the same text `EditorialMasthead` carried). The scoped posts/groups/people search
   control is extracted, unchanged, into `src/components/community/CommunitySearchBar.tsx`.
   **Not** migrated onto the shared `CommandBar` part. Investigated and named per the ruling's own
   escape clause: `CommandBar`'s search is hard-wired to `GET /api/search` over `intelligence_items`
   (item_type/domain/priority/jurisdictions, through the shared `ListRow`); Community's search hits
   `GET /api/community/search` over posts/groups/people with a visible four-way scope toggle, a
   different endpoint and result shape CommandBar does not expose. Forcing it through CommandBar
   would either drop the scope toggle or grow CommandBar an endpoint/shape switch used by exactly one
   caller. Flagged for an operator ruling on whether CommandBar should grow that extension point;
   `CommunitySearchBar.tsx`'s own header carries the same reasoning.

   `PageMasthead.tsx` is **not** deleted, despite ruling 2's text and ruling 4's "grep returns
   nothing" expectation: six `/admin/parts/*` sign-off pages (`fact-card`, `item-group`, `page`,
   `section-header`, `section-index`, `action-card`), each built by other, already-merged lanes and
   outside this lane's write set, import `PageMasthead` directly as their own page header (not
   customer-facing, not part of the masthead migration). Deleting it would break six shipped fixture
   pages. This is a named deviation, not a silent one: ruling 2's own conditional ("deleted when
   their last importer is gone") is not satisfied for `PageMasthead`, so it stays.

   Fixed, same file, same pass (ruling 2's "if it is in these files"): the "Global room room"
   duplicate word. Root cause: `rooms.ts`'s `RoomDef.name` already carries the word "room" for every
   region ("Global room", "EU room", "United States room", and so on), and five call sites in
   `CommunityRooms.tsx` appended a second literal `" room"`. All five fixed to use `roomName` (or
   `${roomName}`) directly, not `${roomName} room`.

3. **Content column (ruling 3), measured, not fixed; STOP with the arithmetic.** Measured with a
   real Playwright mount of the `page-frame-1440` harness (the real AppShell frame wrapping a real
   detail surface), not a source read: `.cl-page-frame` grid at 1440 is `764px 300px` (rail 300, gap
   28, padding `20px 40px 40px`). Root cause, traced to the pixel: `Sidebar.tsx`'s `<aside>` carries
   `margin: "20px 0 16px 16px"` (a dated, operator-ruled 2026-09-07 margin, so the nav card's own top
   margin lines up with the content column's 20px top padding). `AppShell.tsx`'s frame row is `flex`,
   not `grid`. In flex, a fixed-width item's own margin adds to its footprint, so the nav's 16px
   left margin subtracts 16px from the sibling `flex:1` content column (1440 minus 252 minus 16
   (margin) minus 40 minus 40 minus 28 minus 300 equals 764). The artboard's own model is a CSS
   **grid** (`grid-template-columns:252px 1fr`, per `AppShell.tsx`'s own header comment), where a
   grid item's margin is absorbed inside its own fixed track and does **not** subtract from the
   sibling `1fr` track, so the artboard's math (1440 minus 252 minus 40 minus 40 minus 28 minus 300
   equals 780, close to README's stated 778) does not carry the 16px penalty this app's flex
   implementation adds. This is exactly the "artboard does not sum to 778 once you replay this app's
   own margin-in-flex behaviour" case ruling 3 names as a STOP: fixing it means either moving the
   frame row back to grid (which `AppShell.tsx`'s own comment says was deliberately avoided for
   `align-self: stretch` reasons tied to a design-audit harness quirk) or restructuring the nav's
   margin into a fixed-width wrapper (which would need the `align-self: stretch` to move down a
   level and risks the same regression the flex choice was made to avoid). Both are a real code
   change to shared, sensitive, already-ruled-on layout code, not something to improvise under this
   lane's scope. **STOPPED. Needs an operator ruling**: move the frame row to grid (reintroducing
   the stretch fix at the new nesting level), or accept 764 as the ratified number and correct
   README section 0.3 and the FRAME_SPEC comment's "778" from 780 to 764.

4. **Fixture (ruling 5).** `/admin/parts/masthead` gained a third state: the auth-frame variant
   (`size="detail"`, 380px column, no command bar, title "Sign in", the real text `/login` renders
   today).

5. **Presence report (ruling 4).** `Masthead` renders on: `/` (dashboard, `DashboardMasthead.tsx`
   composes `Masthead`), `/regulations` and `/market`, `/research`, `/operations` (via
   `ListSurfaceShell.tsx:417`), the four `[slug]` detail routes (via `DetailShell.tsx:203`),
   `/community` (`CommunityShell.tsx:125`), `/map` (`MapPageView.tsx`/`map/page.tsx:72`), `/admin`
   (`AdminDashboard.tsx:459`), `/admin/factors` (`admin/factors/page.tsx:112`), `/account` and
   `/profile` (`UserProfilePage.tsx:289,312`), `/settings` (`SettingsPage.tsx:167`),
   `/regulations/register` (`ObligationRegisterPageView.tsx:140`), `/search`
   (`SearchResultsView.tsx:46`), `/watchlist` (`WatchlistSurface.tsx:248`), the operations calculator
   (`OperationsCalculatorPageView.tsx:44`), `/login` (`login/page.tsx:101`), `/signup`
   (`signup/page.tsx:122`), `/onboarding` (`OnboardingWizard.tsx:334,479,585,616`).
   **No Masthead, with reason:** `/privacy`, a standalone public legal document (own `<main>`,
   `<h1>`, no `AppShell`/`PageFrame`, not a masthead-bearing app surface; out of scope to wire one
   on). `/invitations/[token]` (`InvitationLandingPage.tsx`), a signed-in single-purpose
   accept/decline page inside the normal `AppShell`, currently has no masthead of any kind (not a
   page-local retype to migrate, a genuine gap); **flagged, not fixed**, outside this lane's build
   scope (the ruling built the Masthead part and migrated existing masthead call sites; it did not
   ask this lane to newly wire Masthead onto every route that never had one).
   `grep -rn "PageMasthead\|EditorialMasthead" src` at the end returns the six admin/parts importers
   named above (item 2), and nothing else.

## STOP / open items

- Content column 764 vs the README's 778 (item 3 above): needs an operator ruling before any code
  change to `AppShell.tsx`/`Sidebar.tsx`.
- `layout-guard L10 /community@1024`: `"GLOBAL"` region tab renders as an unlisted "card" and the
  manifest's `"Global room"` card is reported missing at 1024 only (not 1440, which the dated
  baseline already covers). **[CONFIRMED pre-existing, not a regression of this lane's work]**. A/B
  tested directly: reverted `CommunityShell.tsx`/`CommunityMasthead.tsx` to the pre-lane `HEAD`
  (`05fd0854`) in the worktree, reran the same isolated `runLayoutGuardFor({route:"/community",
  width:1024})` probe, got the byte-identical two findings, then restored this lane's files. Root
  cause not chased further (`CommunityRegionTabs.tsx`/the room-tile card shape are outside this
  lane's write set); this is the rendering guard's one open FAIL, named per the gate's own "a second
  FAIL on the same step with a named test is a STOP" rule (two identical runs, same finding).
- CommandBar/Community search scope gap (item 2): flagged for an operator ruling, not built around.

## UX compliance

- **`/login`, `/signup`**: primary goal, authenticate. Path: enter credentials (or request a magic
  link), submit, redirect. One primary action (Sign in / Create account submit button); "Continue
  with a magic link" is the secondary, visually subordinate action already in place. Async feedback
  unchanged (pre-existing loading/disabled states, error banner). The added `Masthead` is a static
  label above the form; it introduces no new interactive control and no new async state.
- **`/onboarding`**: primary goal per step unchanged (scope workspace, pick sectors, set the
  briefing cadence, confirm done). The added `Masthead` replaces a page-local Anton heading 1:1, same
  text, same position, no change to the step's own primary/secondary actions or async states.
- **`/community`**: primary goal, find or start a discussion. Path: read the masthead, search or
  pick a region tab, read/act on a thread. One dominant action per region view (Start a discussion /
  post), search is a secondary, always-available control. No async-state change: `CommunitySearchBar`
  is the same component, same submit handler, same toast-on-short-query feedback, only relocated out
  of the old `CommunityMasthead` file.

## Gates run

- `npx tsc --noEmit`: clean.
- `bash .discipline/run-test-suite.sh`: 6351 tests, 6350 pass, 0 fail (one run had 2 transient
  ENOENT failures from an uncommitted-but-unstaged file deletion racing a tracked-file scan; fixed by
  staging the deletion, rerun green).
- `node .discipline/fitness/runner.mjs`: 47 functions checked, 0 violations.
- `node .discipline/rendering/run-rendering-guard.mjs`: run twice, both times 2 FAILUREs, both times
  the same pre-existing `/community@1024` L10 finding (see STOP above). Not a PASS; STOPPED per the
  gate's own two-identical-FAILs rule rather than attempting an out-of-write-set fix under time
  pressure.
- Locked push gate (`lane-prepush-check.sh`): not run. The rendering guard did not clear, and the
  gate order says the locked gate runs after a clean guard.
