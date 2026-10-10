## 2026-10-10, lane HYDRA-1 (hydra1-home-hydration-mismatch): the hydration leg now hydrates the real home route across a server/client environment matrix; the live #418 is NOT reproduced and its cause is not identified

Defect under investigation: live smoke run 38027370806 (deployment d50531aa3) reported `console-error` "Minified React error #418 (args HTML)" then "Cannot read properties of null (reading 'parentNode')" on `/`.

### UX compliance

No `.tsx` or `.css` under `fsi-app/src` was edited. No surface changed, so no row component, viewport measure or design principle is affected. `docs/design/ux-laws.md` and `docs/design/design-principles.md` were not loaded for that reason.

### What the evidence says about the live failure

- [CONFIRMED: the run's `live-smoke-report` artifact, read by piping `gh api .../zip`] both findings are on `/` at viewport 375 only; `/` at 1440 and every other page at both widths are clean. `/` is the first page visited in each viewport's fresh browser context (storage state loaded, cold cache).
- [CONFIRMED: `gh run view --log-failed` of runs 38027094212 (22c411142), 38028074948 (08aa6f17b), 38027025920 (70b1ebf9a)] none of the three carries a `console-error` on `/`. The error is intermittent (1 of the 4 recent runs that visited `/`), so the brief's premise that the previous deployment was clean is true of that one run and says nothing about a code difference. The diff d50531aa3 against 22c411142 is data and a log, so [CONFIRMED: `git diff --name-only 22c411142 d50531aa3`] the only files differing are the ledger export JSON and one session log, so no app code differs.
- [CONFIRMED: `node_modules/react-dom/cjs/react-dom-client.development.js` 19.2.3, `throwOnHydrationMismatch`] the argument `HTML` is the structural branch (an element or Suspense boundary missing, extra or of another type); a text difference reports `text`. Every text-only cause the brief lists (clock, locale, zone, bucketed relative time) would therefore have reported `text`.
- [HYPOTHESIS, unverified] the `parentNode` error is the late streaming script for a still-pending Suspense boundary finding its node gone because React regenerated the tree after the #418. Consistent with the order of the two messages; not observed directly.

### What was ruled out (all by execution, on the real components)

- [CONFIRMED: shipped matrix, `hydration-smoke.npmtest.mjs` test 1] the real home route tree (`DashboardMasthead` + `DashboardBrief` with the watchlist rail, bias tags, record grade, theme rows, updated and new change rows) in three states (populated, empty, failed read) hydrates with zero recoverable errors when the SSR pass is en-US/UTC/1280 and the client is (en-US, UTC, 375, +90 s), (de-DE, Pacific/Kiritimati, 375, +90 s) and (ja-JP, America/Los_Angeles, 1440, +25 h).
- [CONFIRMED: one-off probe, not shipped] mutating `useWorkspaceStore` (org, role, sectors) before `hydrateRoot` also leaves the home tree clean, matching zustand 5's `getInitialState` server snapshot in `node_modules/zustand/react.js`.
- [CONFIRMED: code read] `useWorkspaceBootstrap` supplies `getServerSnapshot`; `RelativeTime` renders a UTC-pinned label first and swaps after mount; `Masthead` week number reads UTC fields from the server's `nowIso`; no component in the home subtree reads `window`, `localStorage`, `matchMedia`, `Math.random` or an unpinned `toLocale*` during render.
- [CONFIRMED: one-off probe, not shipped, approximates but is not Next's Flight transport] with a pending watchlist promise and the client promise unresolved when the boundary arrives, React logs the boundary-level "server could not finish this Suspense boundary" recoverable error, not #418. [HYPOTHESIS] whether this relates to the live signature: unverified, and the signatures differ.

### Accomplished

1. `fsi-app/.discipline/rendering/smoke/hydration-smoke.mjs`: the hydration leg is now a two-page, two-context matrix. The SSR pass runs in the server environment (en-US, UTC, 1280); each case then hydrates in a client context with its own locale, IANA zone, viewport width and clock skew. Cases: three RED controls (`ClockReader`, the pre-HYDRATION-59 shape; `TimeStringReader`, `new Date().toLocaleTimeString()`; `LocaleDateReader`, a fixed instant through an unpinned `toLocaleString()` at zero skew, which isolates the environment axis) and the GREEN cases (`Masthead`, and the real home route in populated, empty and failed states). It exports `HYDRATION_RUNS` and `runHydrationRuns`.
2. `fsi-app/.discipline/rendering/hydration-smoke.npmtest.mjs` (new): four tests in a real chromium: the shipped matrix is clean and covers all three home states; `toLocaleTimeString` declared clean is reported red; the locale-only component declared clean is red while the same component in the server's own environment is clean; a clean component declared red is reported as "RED control did not reproduce".
3. Scratch used and deleted: four throwaway runner scripts under `fsi-app/scripts/tmp/` and one scratchpad copy (removed). `npm ci --ignore-scripts` was run in the worktree's `fsi-app/` (gitignored `node_modules`; no junction).

### Read and reused

Read: COMMON, root `CLAUDE.md`, `app/page.tsx`, `render-now.ts`, `DashboardMasthead`, `DashboardBrief`, `DashboardWatchlist`, `RelativeTime` and its formatter, `Masthead`, `CommandBar` (state and effects), `AuthProvider`, `AppShell` (head), `layout.tsx`, `useWorkspaceBootstrap`, `workspaceStore`, `brief-rows.ts`, `list-row-fields.ts`, `live-smoke.mjs` (visit and context set-up), the existing `hydration-smoke.mjs`, `dashboard-brief-smoke.mjs` (fixture shapes), `harness.mjs` (`bundleEntry`, page set-up), `rd-82-title-words.npmtest.mjs` (test template). Reused: `bundleEntry`, the `next/navigation` stub, the existing hydration slot registration in `run-rendering-guard.mjs` (unchanged), the `render-now` pattern, the dashboard-brief fixture shapes. No new module; one new test file.

### Red then green (`node --test .discipline/rendering/hydration-smoke.npmtest.mjs`)

| Run | Result |
|---|---|
| Against master's `hydration-smoke.mjs` (no matrix, no `HYDRATION_RUNS`, no `runHydrationRuns`) | 0 pass, 4 fail |
| Against this branch | 4 pass, 0 fail (about 10 s) |

Fixture dry run of the shipped leg: 10 checks (RED controls fired, home and masthead clean).

### Decisions

- No application file was changed. The write set allows the component "found"; none was found, and a speculative edit to production code on an unreproduced, intermittent signal would trade a known state for an unknown one. The leg's own scope was widened because the old leg's blind spots (one skew, one locale, one component) are confirmed by reading it.
- The RED controls are permanent members of the matrix, so a regression in the detector fails the rendering guard loudly instead of passing vacuously.

### NOT done

- The cause of the live #418 on `/` at 375 is not identified and is not fixed. [WORK: owed] Staged next step (decision-ready, needs a lane with a write set outside this one): `live-smoke.mjs` truncates console text and a minified #418 carries no component stack, so the live signal cannot name a node. Two measurements would: (a) repeat the 375 visit of `/` against one deployment ten or more times in fresh contexts to get the failure rate and whether it needs a cold first visit; (b) on a failure, record the server HTML (a plain `page.request.get('/')`) and `document.documentElement.outerHTML` after hydration and diff their element structure. The first confirmed structural difference names the component.
- The streaming of the un-awaited watchlist promise (`getWatchlist()` handed to `<Suspense>` + `use()`) is the one mechanism unique to `/`; moving that read into the page's existing `Promise.all` would remove the pending boundary at no wall-clock cost. [WORK: owed] Not applied: it is [HYPOTHESIS] that it is related, it edits `page.tsx`, `DashboardBrief.tsx` and `DashboardWatchlist.tsx` outside the lane's evidence, and it changes the first-paint contract the page comment documents.
- A faithful streaming leg (Fizz stream plus a Flight-shaped client promise, delivered in chunks) was probed and not shipped, because the probe is not Next's transport and its signature differs from the live one. [NOT-WORK: scope statement, a leg that does not reproduce the signature would be a second unproven detector]
- The wiring audit may count `HYDRATION_RUNS` and `runHydrationRuns` as test-only exports. [NOT-WORK: CI is the gate (COMMON rule 9); the fitness runner is not run locally]

### Open items

- Does `/` at 375 fail again on the next live-smoke runs? A recurrence with the measurements above names the node. [WORK: owed]
