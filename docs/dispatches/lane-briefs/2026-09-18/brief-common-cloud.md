# Common contract for cloud lanes (coordinator session 2026-09-18, remote container)

You are a lane on Caro's Ledge (repo Dwarves77/dotfiles), running in a cloud container with no access to the operator's machine and no database. Your worktree, branch and base are named in your brief. Work ONLY inside that worktree. Never run git in /home/user/dotfiles itself or in any other worktree. Dependencies are installed (fsi-app/node_modules) and the repo's git hook trampolines are installed and shared.

Read first, in full, from your worktree: CLAUDE.md (repo root) and docs/dispatches/lane-common-contract.md. Then the files your brief names. The plan is the brief: do exactly what the brief says and nothing more.

Rules that bind you:
- A problem this brief does not cover: STOP, write your report with what you found, and do not work around it or widen scope. The coordinator solves it and re-dispatches.
- Refuting a premise of this brief with evidence is not deviation. Do the requested change where it still stands, and report the refutation with file and line.
- Never allowlist, exempt, weaken, or re-seed upward any gate. A ratchet number is re-seeded DOWN only, to the number the gate itself prints, in the same commit as the change that moved it. Two FAILs on one gate step means STOP and report.
- No `--no-verify`, no `git stash`, no `git add -A` (stage explicit paths). Never stage an .env file.
- No database access exists here. Do not try.
- No em dash, en dash or section sign in anything you write (pre-commit rule 022). Never write a length function over the capture text column as code, anywhere, even in prose (a whole-tree scanner refuses the literal).
- Every claim in your report carries [CONFIRMED] (you ran it or read it this session, method named) or [HYPOTHESIS].
- Run a fix on the real failing case BEFORE writing or changing its tests; run the regression test RED before the fix and GREEN after, and paste both.

Commit: one commit unless a second is clearly separable. Subject `Lane <X>: <what>`, body says what and why, trailer exactly:
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
The pre-commit hook runs on commit. If it refuses, read why; fix only if the cause is in your own change, otherwise STOP and report the exact message.

Session log (corrected 2026-09-19 00:35 UTC; the four lanes before this correction appended to the shared file and every one conflicted on it): write your entry as your OWN file docs/ops/session-log.d/2026-09-19-<lane>.md (read docs/ops/session-log.d/README.md and the existing 2026-09-13-l18.md first; the memory gate accepts it; never touch the shared docs/ops/session-log.md). Its content starts with the heading `## <today's date from the date command>, lane <X>: <one line>` in the shape of the entries above it (lane model, worktree, branch, base sha; **Result [CONFIRMED by <method>]**; **Findings**; **Next**), ending with a `### UX compliance (<X>)` block reading: Not a UI change; no customer surface touched by this branch.

Rebase, then push through the gate:
1. Before the FIRST push of your branch: `git fetch origin && git rebase origin/master`. If your branch is already on origin (a second push after a review or a conflict), never rebase it and never force-push: `git fetch origin && git merge origin/master` instead, and resolve as below. A conflict in docs/ops/session-log.md (only possible if you wrote there against this rule): keep both sides (master's entries first, yours last), `git add docs/ops/session-log.md`, `GIT_EDITOR=true git rebase --continue`. A conflict in any other file: `git rebase --abort`, STOP, report the file list.
2. Run the gate exactly once, as ONE background Bash task (run_in_background true, timeout 600000) and wait for its completion notification. Never poll it, never sleep-loop, never run the suite another way in parallel:
   `LANE_GATE_SP=<the scratchpad folder your dispatch names> bash fsi-app/scripts/coordinator/lane-gate-cloud.sh <your worktree root>`
   (corrected 2026-09-19: the wrapper is the repo copy; the session scratchpad path the first version named died with its container)
   It waits for the container's one gate lock, refuses if your branch is behind origin/master (exit 4: rebase and run it once more, that does not count as a FAIL), then pushes your branch through the repo's pre-push hook. The push happens only if every gate step passes.
3. Paste every `[discipline pre-push] step ...` line and the `gate exit:` line from its output into your report. If it fails: read the log it names. If the failure is in your change, fix it, commit, and run the wrapper once more (the second and last run). Otherwise STOP and report the exact failing step and message.
4. Do NOT open a pull request. The coordinator does.

Report (your final message), in this order: Result; Files changed (path: what); Verification (commands and outputs, RED before and GREEN after where the brief asks); Gate (the step lines and exit line); Refutations and findings (what the brief got wrong or did not cover, each labeled); Blockers.
