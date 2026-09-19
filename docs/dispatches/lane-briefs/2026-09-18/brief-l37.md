# Lane L37: the 53 byte-identical snapshot files out of the index

Model: Haiku. Worktree /home/user/dotfiles/.worktrees/wt-l37, branch lane/l37-snapshots-out-of-index-2026-09-18, based on origin/master a93a2271 (#712 merged). Read brief-common-cloud.md first (pasted above in your prompt).

## Why
docs/audits/system-health-audit-2026-09-17.md line 67 [CONFIRMED by the coordinator, blob hashes at origin/master]: byte-identical tracked files, 24 groups, 53 files, all under fsi-app/scripts/_snapshots/, a folder .gitignore line 64 already ignores (CLAUDE.md standing rule 5: machine evidence is gitignored scratch). Disposition in the audit: remove from the index. Build plan section 6.7 (PR #718) row L37: "the 53 byte-identical scripts/_snapshots files out of the index; depends on: none".

## Scope, exactly
1. The file /tmp/claude-0/-home-user-dotfiles/d3ee595d-427a-5f48-a385-a337a6990473/scratchpad/l37-files.txt lists the 53 paths, relative to fsi-app/scripts/_snapshots/. Copy it into your worktree as fsi-app/scripts/tmp/l37-files.txt only if you need a local copy (that folder is gitignored scratch); do not commit it.
2. Measure BEFORE, from the worktree root, and paste both numbers:
   `git ls-tree -r HEAD | grep '_snapshots/' | awk '{print $3}' | sort | uniq -d | wc -l` (expected 24, the duplicate blob groups)
   `git ls-tree -r HEAD --name-only | grep -c '_snapshots/'` (expected 1245)
3. Remove exactly those 53 paths from the index, never from disk:
   `git rm --cached -q -- $(sed 's#^#fsi-app/scripts/_snapshots/#' /tmp/claude-0/-home-user-dotfiles/d3ee595d-427a-5f48-a385-a337a6990473/scratchpad/l37-files.txt)`
   Then confirm `git diff --cached --name-only | wc -l` prints 53 and `git diff --cached --name-status | grep -v '^D' ` prints nothing.
4. Confirm the ignore rule covers them: `git check-ignore -q fsi-app/scripts/_snapshots/$(head -1 /tmp/claude-0/-home-user-dotfiles/d3ee595d-427a-5f48-a385-a337a6990473/scratchpad/l37-files.txt) && echo ignored`. If it prints nothing, STOP and report.
5. docs/audits/system-health-audit-2026-09-17.md line 67: append to the end of that line, in place: ` DONE (lane L37, 2026-09-18): the 53 files are out of the index; the other tracked files under that folder are workflow-committed inputs (brief-export.yml, population-turn.yml) and were not touched.` Do not change anything else in that file.
6. Session-log entry per the common contract, heading `## 2026-09-18, W9 lane L37: the 53 byte-identical snapshot files out of the index`. In Findings, state that the one code comment naming a population snapshot path (fsi-app/scripts/lib/institution-key.mjs line 61 cites population-33678399902/census-rows.held.json) cites a file that is NOT among the 53 (the removed one in that directory is census-rows.screened-out.json), so no citation goes stale [CONFIRMED by grep].
7. Measure AFTER the commit and paste: the first command in step 2 now prints 0; the second prints 1192.
8. Commit (explicit paths: the 53 removals are already staged; add the audit file and the session log by path). Subject: `Lane L37: the 53 byte-identical snapshot files out of the index`. Body: the before and after numbers, and that git history keeps every blob (recoverable with git show 1b8432a0:<path>), so pulling this commit removes only the working copies of duplicate scratch.
9. Rebase, gate, push per the common contract. Report.

## Not in scope (do not touch)
- Any other file under fsi-app/scripts/_snapshots/ (1,192 remain tracked on purpose: brief-export.yml force-adds export parts there and population-turn.yml requires a committed rows_file there; the coordinator owns that contradiction, not this lane).
- .gitignore, any code, any comment, any workflow.
- No new fitness function, no ratchet number moves (F45 windows are code, not data files).

## Amendment 1 (coordinator, 2026-09-19 about 00:20 UTC, after the pre-push suite on the rebased branch)

[REFUTED, corrected in place] "Not in scope: any code" and the premise that no code reads any of the 53. `fsi-app/src/lib/connections/tag-yield.fixture.test.mjs` line 44 resolves `scripts/_snapshots/population-33749140151/census-rows.apply-ready.json` and reads it at import as its record-grade data source. The coordinator's consumer census (`git grep _snapshots` over src and scripts) was piped through `head -20` and that file was below the cut: a truncated measurement reported as complete. The lane's own gate passed because `git rm --cached` leaves the file on disk; the rebase onto master then removed it from the working tree and the suite failed with ENOENT. Resolution: that one file stays tracked, 52 come out; the audit note and session-log entry name the consumer; the home of committed inputs under a gitignored folder (test inputs and workflow inputs alike) is a plan item for the coordinator.
