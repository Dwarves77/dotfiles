# Lane F51b: the hotspot check fails the change that causes it, never a bystander

Coordinator brief, 2026-09-20. Executor: Sonnet (gate logic). Lane id `f51b`. Read `docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md` first (Amendment 1 wins over its body). Worktree and branch are in your dispatch message; base `origin/master`. FIRST tool call: the Skill tool `fsi-app:environmental-policy-and-innovation`.

## Why (second occurrence: the cause is removed, operator ruling 2026-09-18)

F51 check 5 (`fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs`, `runCheck5`) counts files changed in 3 or more of the last 30 first-parent commits of `origin/master` after a fixed anchor and FAILS on each.
- First occurrence, 2026-09-19: `docs/dispatches/lane-briefs/2026-09-19/README.md`; it then failed EVERY lane's push (lane G1 Amendment 2 removed the table and allowlisted the file, dated).
- Second occurrence, 2026-09-20 [CONFIRMED, lane T3's push gate, step 3d]: `fsi-app/scripts/lib/loop-run-id.mjs`, `fsi-app/scripts/lib/loop-run-id.test.mjs`, `fsi-app/scripts/turns/emit-downstream-chain-artifact.mjs`, touched by lanes M3 (#752), M3b (#755) and M4 (#759). Lane T3 touches none of them and was refused; so will every other lane until this lands.

The defect in the check's DESIGN, both times: it reads only `origin/master`, so it can never fail the PR that makes the third touch (at that PR's gate master still shows two), and once that PR merges it fails every unrelated lane and master's own CI. A gate that cannot refuse the change that causes the condition, and then refuses bystanders, is aimed at the wrong target. The three touches here were SERIAL (M3, then M3b, then M4, each rebased clean, no conflict; M4's touch was an extraction that removed duplication), which is the ordinary growth of one module under ADR-031, not the concurrent shared-append hazard plan 6.8 retired.

## The change

1. **Aim the gate at the cause.** `runCheck5` takes the lane's own changed-file set (the files in `merge-base(origin/master, HEAD)..HEAD`; read how checks 1 to 4 of this same function obtain the range and reuse that, do not invent a second way). A hotspot is a VIOLATION only when the current range touches that file: count = touches on `origin/master` in the window, plus one for this range; threshold 3 as today. So the lane that would make the third touch is refused at ITS gate, before merge, with a message that says so and names the prior commits that touched the file (`sha, subject` for each), and says what to do: restructure so the file is not the shared edit point, or ask the coordinator for a dated `HOTSPOT_ALLOWLIST` entry. A hotspot the range does NOT touch is printed as the standing number exactly as today ("F51 hotspots ...: N" and the list) and is NOT a violation.
2. **On master itself and in any run with an empty range** (a push to master, a scheduled or manual run): print the standing number, return no violations. Say in the header comment why: there is no change to refuse.
3. **Tests (attack form, rule 15)**, beside the existing check 5 tests, which stay green or are updated in place where they encoded the old bystander behaviour (say which): (a) RED: two prior touches on master plus the range touching the file; (b) GREEN: three prior touches on master, range does not touch it (the bystander case: this is T3's exact situation; build the fixture from it); (c) GREEN: empty range; (d) RED still: an allowlisted file is skipped, a non-allowlisted one in the range is not; (e) the message carries the prior commits.
4. **The three files get dated `HOTSPOT_ALLOWLIST` entries**, coordinator-decided, because the third touch has already merged and the next loop-id lane (M6) must extend the attack chain in the test file again: reason text for each, verbatim: `decidedOn: '2026-09-20', reason: 'coordinator, lane F51b: serial lanes M3 (#752), M3b (#755), M4 (#759) each extended the ADR-031 loop-id resolver and its attack chain, one after another, rebased clean, no concurrent edit; lane M6 extends the chain once more. Delete once the file has left the 30-commit window.'` Update the pinned-keys test (`HOTSPOT_ALLOWLIST names only ...`) to the new exact set.
5. Correct the header comments of check 5 to the present, keeping the dated history true. Runbook: one paragraph where F51 is documented (grep `docs/runbooks` for `F51`). Session-log file `docs/ops/session-log.d/<date>-f51b.md`.

## Out of scope: STOP, do not solve

The threshold, the window, the anchor commit; checks 1 to 4; any other allowlist; deleting the README entry (it has not left the window).

## Constraints, gates, report

Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. Never `git stash`, `git add -A`, `--no-verify`. Gates: `node --test fsi-app/.discipline/fitness/functions/F51-no-shared-append.test.mjs`; the fitness runner (must now print the hotspot standing number and report 0 violations on your tree); the invariant-coverage meta-gate; the override check; then the locked push gate once, last, as one background task (a FAIL caused by your change: fix the cause, run once more; a second FAIL on the same step is a STOP). You commit; you do not push. Report and PR body as TEXT; findings labelled CONFIRMED, HYPOTHESIS or REFUTED.
