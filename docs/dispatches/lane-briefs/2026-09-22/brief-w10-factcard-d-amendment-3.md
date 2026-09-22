# Lane W10-FactCard-d, Amendment 3 (coordinator, 2026-09-22): the rebase conflict resolves by DROPPING the lane's allowlist entries. Read after Amendment 2; this file wins where they differ.

The STOP [CONFIRMED]: `git rebase origin/master` conflicts in `fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs` at `HOTSPOT_ALLOWLIST`. Cause: lane F51c (merged, `09a1fd2d`) made check 5 measure concurrent editing and DELETED the seven dated entries for serial work, including the FactCard ones. This lane's commits `255ba4e8` and `a33d87a7` added two entries (`fact-card-model.ts`, `fact-card-model.test.mjs`) and updated the pin test; both are now unnecessary and wrong.

In `C:/Users/jason/dotfiles/.worktrees/wt-w10-factcard`, branch `lane/w10-factcard-d` at `b0e035da`, tree clean:
1. `git fetch origin`, `git rebase origin/master`. At the F51 conflict: resolve by taking `origin/master`'s version of `HOTSPOT_ALLOWLIST` exactly (keep NONE of this lane's entries), `git add` that file, `git rebase --continue`. If the pin test `F51-no-shared-append.test.mjs` conflicts, likewise take master's version. Any OTHER conflicting file is a STOP with its name and the conflict markers.
2. After the rebase: `git diff origin/master --stat -- fsi-app/.discipline/fitness/` must print nothing (this lane no longer touches F51 or its test). If it prints something, remove the lane's change to those files in a fixup and re-check.
3. Run the F51 test file and F51 on the live tree: 0 violations expected (serial FactCard lanes are no longer hotspots by construction). If check 5 refuses a FactCard file, STOP with the exact message: that means F51c's definition is wrong, which the coordinator owns.
4. Continue with Amendment 2 items 1 (the temporary cherry-pick of `a12c1c38`) to 4 unchanged.

Same report shape as Amendment 2, plus one line: the two shas after the rebase (the lane's commits) and confirmation that item 2's diff is empty.
