# Lane W10-Masthead, Amendment 2 (coordinator, 2026-09-22): the two STOPs answered. Read after Amendment 1; this file wins.

State: `lane/w10-masthead`, head `139cc5a6` (two commits: `05fd0854`, `139cc5a6`), worktree `C:/Users/jason/dotfiles/.worktrees/wt-landdocs-0911`, not pushed. Done and accepted: auth-frame Masthead on the right panel; CommunityMasthead and EditorialMasthead deleted, CommunityShell on the shared Masthead; "Global room room" fixed; `/admin/parts/masthead` auth variant; F49 Anton entries cleared; top bar 56. Accepted deviations, recorded as owed, not yours: Community's scoped search stays in `CommunitySearchBar.tsx` (CommandBar's search is a different endpoint and shape; an operator question); `PageMasthead.tsx` stays while other lanes' `/admin/parts` pages import it (owed to a cleanup lane).

## STOP 1, content column: FIX IT, it is not an operator decision

The escape clause in Amendment 1 applied only if the ARTBOARD does not sum to 778 at 1440. Your measurement shows the artboard's model does give 778 (a grid track absorbs its child's margin) and the IMPLEMENTATION gives 764 because `AppShell`'s frame is a flex row where the nav card's ruled 16px margin subtracts from the content's share [the lane's CONFIRMED, by a real Playwright mount]. The operator's standing ruling: "if our live site doesnt match this its not correct." Fix the frame at the cause, in `AppShell.tsx` (and `Sidebar.tsx` only if the margin must move): the frame row lays out as the artboard does (grid tracks, or an equivalent that stops the margin leaking), so the content column measures 778 at 1440 in a real mount, and 375 and 1024 do not overflow. Every page shares this frame: the real guard (both runs) is the proof no page regressed. If a page depended on the old width and now clips, fix it at its part, never an override.

## STOP 2, the `/community@1024` L10 finding: settle whose it is, then fix it at the part

Your A/B compared against "HEAD before this lane's changes". Your own first commit `05fd0854` changed six community sub-route headers (Anton to the body face), so that baseline may already carry this lane's change. Do the A/B against `origin/master` (`ddc5ccda`) in a scratch detached worktree (`git -C C:/Users/jason/dotfiles worktree add --detach <scratch> origin/master`; `npm ci` and `npm install --no-save playwright@1.61.1 --no-audit --no-fund` there; run the guard once, to a file; remove the scratch worktree after). Report the L10 line from both runs verbatim.
- If master is clean and your branch fails: it is this lane's; fix it at the part that renders the failing element.
- If master fails too: it is a master defect that CI did not see (CI passed #785 on the same content). This lane now owns the Community masthead and shell, so fix it at the part anyway if the failing element is inside `CommunityShell`, its masthead, or a part this lane touched; otherwise STOP with the element, the rule text of L10 (`layout-guard/`), and why CI and this PC differ (compare the baseline file's coverage and the viewport list).
Never edit the guard, the layout baseline or an allowlist.

## Then

The real guard twice (PASS both), the npm-glob suite, `tsc`, the FULL fitness runner, restore `coverage-report.json` if dirtied, the locked gate once, each started only when `tasklist | grep -ic node.exe` prints 3 or fewer; a child crash (exit 3221225794 or `signal 9`) is contention, wait and re-run that step once. Update the PR body in the coordinator scratchpad with the frame fix and the L10 outcome. Commit with your own session's attribution trailer. Do the work yourself; do not spawn agents; do not push.

ONE final report, six lines maximum, sent once, no interim messages: commit shas; the content column measured before and after at 1440 (and the frame change in one clause); the L10 A/B result and what you did; the guard's two results quoted; npm totals, fitness violations, gate exit code; any STOP.
