# Lane W10-CommandBar: one bar, no toggle (coordinator, 2026-09-21)

Model: Sonnet. Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-l34-detail-admin-primitives`. Branch: `lane/w10-commandbar`, cut from `origin/master` (at or past `b1dd38e4`). Read, in this order: `docs/dispatches/lane-common-contract.md`; `docs/design/ux-laws.md` and `docs/design/design-principles.md` (DP-1, DP-2); the bundle `docs/design/handoff-2026-09-07/README.md` (the Command bar line near line 45, and "Undrawn cases, rulings 2026-09-20", ruling 2 and ruling 3) and the artboards that draw the bar. The bundle is the standard. STOP on anything not covered. Files are disjoint from lane W10-FactCard-b, which runs in parallel: do not touch `FactCard.tsx`, `fact-card-model.ts`, `RegionDimensionMatrix.tsx`, the detail surfaces, or `src/app/admin/`.

## The ruling (bundle README, ruling 2 of 2026-09-20, verbatim)

"One bar, no toggle. Typing searches (GET /api/search, results inline below the bar as you type); Enter opens the results page; the Ask button (or ⌘↵) sends the same text to the assistant scoped to the page. Search is not dropped — the toggle is." It supersedes the 2026-09-09 CMDSEARCH ruling that added the two-tab mode toggle. Bar spec (README line 45): 40px tall, the search glyph, placeholder "Search or ask across N items…" (the words "or ask" are restored everywhere, page-scoped placeholders included), the ⌘K hint, the dark Ask button. <!-- glyph:verbatim -->

## Premises checked by the coordinator on `b1dd38e4`

- [CONFIRMED] `src/components/ui/CommandBar.tsx` carries `type CommandBarMode = "search" | "ask"` and a `mode` state with two tabs; `commandBarKeyboard.ts` holds the keyboard logic; both have `.npmtest.mjs` suites. Neither file, nor `TopBar.tsx`, is an F51 hotspot today.
- [CONFIRMED] `GET /api/search` exists (`src/app/api/search/route.ts`, `logic.ts`). NO results page exists (`src/app/search/` is absent): "Enter opens the results page" needs one.
- [CONFIRMED] consumers found by grep: `TopBar.tsx`, `DashboardMasthead.tsx`, `DetailShell.tsx`, `AskAssistant.tsx`, `AdminDashboard.tsx`, and the `community`, `map`, `regulations` pages. Enumerate them yourself with a fresh grep before editing (sweep discipline: enumerate first).

## Build

1. Remove the mode and the toggle. One input. Typing (2+ characters, the existing debounce and stale-request cancel) calls `GET /api/search` through `authedFetch` (F40) and shows results inline below the bar; the WAI-ARIA combobox pattern already followed stays. A page-local `onFilter` consumer keeps working exactly as today.
2. Keys, in `commandBarKeyboard.ts` with its tests: Enter with an active option follows that option's href; Enter with no active option opens `/search?q=<text>`; ⌘↵ or Ctrl+Enter, or the Ask button, dispatches the existing `open-ask-assistant` event with the same text, scoped to the current page; Escape dismisses; ⌘K focuses. When the assistant is unavailable (the existing gate), the Ask button is disabled with its reason and SEARCH STILL WORKS: the input is never disabled.
3. `/search` results page: same frame and masthead as the other list surfaces, rows on the existing list row part (no new row component, F45 and F42), reads the same `/api/search` logic server-side or through `authedFetch`, honest empty state, closed by default (F43), a row title carrying `data-guard-title`, registered for the 375 and 1280 measurement where F35 and the rendering guard require it. If `/api/search` cannot page beyond its bounded read, show what it returns and say so in the report; do not raise a `.limit()` above 1,000 (F38).
4. Auth frame (ruling 3): `/login`, `/signup`, `/onboarding` carry no command bar. Verify; fix only if one leaks.
5. The part root carries `data-part="command-bar"`.
6. Tests: the toggle is gone (no element with the old tab roles); typing calls search once per debounced value; Enter, ⌘↵ and the Ask button each do what item 2 says; the placeholder contains "or ask" for the default and for every page-scoped override (enumerate the overrides by grep).
7. Session-log addendum file for this lane with a "UX compliance" block, written where the lane contract says (never `docs/ops/session-log.md`).

## Gates

- Playwright is NOT installed on this PC by operator ruling ("We do not need to install extra software use GitHub"). Prove everything else locally: the npm suites you touch, `tsc`, the FULL fitness runner. The Rendering guard is judged on GitHub after the push; a red result there is a review result you will be asked to fix. If your worktree has no node_modules, `npm ci` inside your worktree's `fsi-app` only; install nothing else.
- First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `frontend-design`, and `remediation-discipline` if the write gate asks.
- Never `git stash` (clean master: `git worktree add --detach <scratch path> origin/master`). Never `git add -A`, never `--no-verify`. Never run `repin.mjs`, `reseed-f45.mjs`, `repin-skills.mjs`, `resolve-conflicts.mjs`. Commit trailer exactly: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. Skill-ack files copy the exact heading shape of an existing one.
- F49: no part literal in a `page.tsx`. F36: any date formatting in a client component pins `timeZone`. F51 check 5: if your own range would make a file's third touch in the window, restructure or STOP, never allowlist.
- `coverage-scan.mjs` rewrites the tracked `fsi-app/.discipline/governance/coverage-report.json`; restore it with `git checkout --` before the gate.
- Run the FULL fitness runner (`node .discipline/fitness/runner.mjs`, all functions) to 0 violations, then the locked push gate once, last, as one background task. A FAIL from your own change is fixed at the cause and the gate runs once more; a second FAIL on the same step is a STOP. You do not push. Past about 400k tokens, stop and report.
- No workaround of any kind.

## Report

ONE final report, five lines maximum, no interim messages: commit sha(s); fitness violations (number) and push gate result; the consumer count you enumerated and migrated; the results page path; anything you STOPped on, with the measurement. Also write a PR body file `pr-w10-commandbar.md` into `C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/` (that exact path; it is the coordinator's scratchpad, `C--Users-jason`, not your own), ending with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
