# Handoff addendum, 2026-09-19 (morning): read after HANDOFF-2026-09-18

Written by the local coordinator session on the operator's machine at its end. Read
[HANDOFF-2026-09-18.md](./HANDOFF-2026-09-18.md) FIRST: the operator's rulings, the standing constraints, the
tooling and its traps are there and all still bind. This file only adds what happened after it, and replaces
its sections 2 (state) and 3 (next steps).

## 0. First five minutes (unchanged in kind)

1. Is a runner alive? Look at the coordinator scratchpad's `push-queue.lock` folder (path in section 7 of the
   2026-09-18 handoff) and its `pid` file, and at the process table. At write time a push queue was running
   (lane T1, then W10-A). Never start a second runner. One lock folder, the ORIGINAL scratchpad.
2. Read the tail of `push-queue.log` and `merge-train.log` there. Take every clock time from the log or from
   `date`, never from memory (I estimated times twice and had to correct both in place).
3. `gh pr list --state open` and compare with section 2 below. A session with no access to the machine reads
   the state from GitHub and touches no lane branch (section 0a of the 2026-09-18 handoff).

## 1. One new ruling, verbatim

Operator, 2026-09-18, late evening: **"Do not do work arounds. Fix the problem so it NEVER happens again"**.

Said after I hand-resolved the merge train's conflict stops one after another and reported each as handled.
What it binds: on the SECOND occurrence of the same stop, count it from the logs, name the cause, and put the
removal into the one build plan with a gate proven by attack. A helper script that makes a recurring failure
tolerable (`repin.mjs`, `reseed-f45.mjs`, `repin-skills.mjs`, `resolve-conflicts.mjs`, the session-log union
resolver) is a workaround. Work already caught by the cause is still finished by hand, and is called that,
never presented as the fix. The instance is plan section 6.8, below.

## 2. State at write time (2026-09-19 about 10:30 EDT, from `date` and the logs)

**Merged since the 2026-09-18 handoff** [CONFIRMED on GitHub; required checks verified on the merged heads
through the check-runs API for #721 and #722]: L36 #712, P10 #715, M9c #717 (migration 329, applied live
2026-09-18), docs follow-ups #718, M8 #719, M9b #720, M9a #721 (F50, RD-74), M1 #722 (fetch-drain runner and
workflow), plan section 6.8 #733. By the cloud session: L35h #727, L37 #726, D2 #728, L38 #729 (F45 now
6,132), its briefs and contract change #730, D28b #731, #732, P7 #734 (plan 6.7 closed), its pause note #735.
The merge train list is fully merged.

**The cloud session is paused** (its note: the 2026-09-19 coordinator entry in `docs/ops/session-log.md`,
PR #735). Read that paragraph: it records what the cloud could not do (the head-of-loop hop proof was refused
with 403 because the Claude GitHub App has no `actions: write`; it gives the exact `gh workflow run` command)
and its ordered next steps.

**Three lanes are not merged:**

| Lane | Worktree, branch | State |
|---|---|---|
| T1 | `wt-hashsep-0911`, `lane/t1-hermetic-no-credential-test-2026-09-18`, commit `0fe9a799` | PUSHED, PR #736, open at write time; merge on green. Makes `check-vocabulary-drift.test.mjs` hermetic: the script read `fsi-app/.env.local` from disk, so the no-credential test failed in the one worktree that has an env file (`wt-session-d`) and nowhere else. Proven both ways on one disk state |
| W10-A | `wt-landdocs-0911`, `lane/w10-a-f49-impact-meter-2026-09-18`, commits ending `6f5b942f` | NOT pushed. The queue stopped on it as expected (five bookkeeping conflicts); resolved by hand (`resolve-w10a.mjs`, durable copy beside the ledger): skill categories 46 and 47 both kept, manifest F48/F50/F49, invariants RD-72/RD-74/RD-73 with the marker baseline at 58, skill pin re-measured, F45 measured 6,121 on the combined tree. 223 tests pass, skill-contract check clean, worktree clean. CORRECTION 2026-09-19 10:45 EDT: the refusal described next is [REFUTED]; it was my measurement error. I ran the gate from INSIDE `fsi-app/`; the gate passes its pathspecs to `git diff` relative to the current directory, so from there the per-lane file's diff came back empty. Run from the repo root (where the push hook and CI run it) it prints "UX compliance gate OK". W10-A was not refused by anything; it and M2 went into the push queue at 10:45 (M2 first; T1 #736 merged at 10:35 and unblocked it). The latent defect is real and belongs to lane N0: the gate's git calls should not depend on the caller's directory. This is the second time in two days I measured from inside `fsi-app/` and reported a wrong result (the first was a false "zero uses" count); run repo-wide measurements from the repo root. What I first wrote, kept for the record: ONE OPEN REFUSAL [first labelled CONFIRMED, cause NOT established]: `node fsi-app/.discipline/governance/memory-gate.mjs --range=origin/master..HEAD` reports the UX compliance gate failing, although the lane's own `docs/ops/session-log.d/2026-09-18-w10a.md` carries `### UX compliance (W10-A)` and `git diff origin/master..HEAD` on that file shows the added line. Diagnose that before pushing (start with how the CLI builds its diff lines for the per-lane file on this tree, D28b #731); do not weaken the gate. Its line is still in `push-queue.txt` as pending: the queue will retry it on its next run |
| M2 | `wt-session-d`, `lane/m2-ledger-consume-apply-2026-09-18`, commits `9dd0a698` + `03925ac6` | rebased, F28 and ledger-consume tests 161 pass, NOT pushed, deliberately held OUT of `push-queue.txt` until T1 merges (its worktree is the one with the env file, so its gate fails until T1 is on master). Then add the line `wt-session-d|pr-m2.md|m2` and run the queue |

Every one of the six lanes that were in flight on 2026-09-18 was rewritten by the coordinator into ONE commit
whose session-log entry is its own file `docs/ops/session-log.d/2026-09-18-<lane>.md`. The pre-rewrite tips
are kept as local branches `backup/<slug>-pre-own-sessionlog` in each worktree.

## 3. The incident you must know about: my queue dropped a whole lane

`push-queue.sh` carried a rule: when a rebasing commit's ONLY conflict is a harness `PENDING-RUN.md` marker,
run `git rebase --skip` (written for many-commit lanes whose last commit was a re-pin). After the rewrite above
every lane is one commit, so the rule skipped ALL of lane M2 and left its branch at master's tip; the log said
"rebase done". Nothing was pushed, only because an unrelated test failed in that worktree (the defect T1
fixes). I searched both logs (2026-09-13 to 2026-09-19): the rule fired exactly once, so no earlier lane lost
work. The rule is removed; a conflict always stops the queue; the queue also refuses to continue when a rebase
leaves a lane with zero commits ahead of master. M2 was restored from its commit id.

Second trap of the same family, seen on M1 and M2: git auto-merges a lane's OWN marker pin BELOW master's
newer pins, outside any conflict hunk, leaving two current hash lines; F28 reads the first (stale) one and goes
red after `repin.mjs` reports success. Check after every marker resolution:
`grep -c "^\*\*harness_version at write time:\*\*" fsi-app/scripts/harness-runs/*/PENDING-RUN.md` must print 1
for each file, then run the F28 test. Both traps disappear with lanes N3 and N4 of plan 6.8.

## 4. Next steps, in order

1. Finish the three lanes in section 2 (T1 merge, W10-A, then M2). Add their PR numbers to
   `merge-train.txt` and run `merge-train.sh`, or merge each on green by hand.
2. Dispatch plan 6.8's lanes. The briefs for N0 (one home for the change range) and N2 (a harness family is a
   directory with a descriptor) are written and are in the repo beside this file's PR:
   `docs/dispatches/lane-briefs/2026-09-19/` (`brief-n0.md`, `brief-n2.md`, and the common brief they bind to).
   N0 and N2 touch nothing the three unmerged lanes touch and can start now, each in a free worktree on a new
   branch cut from `origin/master` (the branch names are in the briefs). N1 waits for W10-A (both edit the
   fitness manifest). N3 and N4 wait for N0. N5 waits for W10-A. N6 (gate F51, RD-75) is last, and its
   acceptance is the replay of the 2026-09-18 lane set in any order with zero conflicts. Briefs N1, N3, N4,
   N5, N6 are NOT written yet; section 6.8's table is their specification. Next free ids: fitness F51,
   invariant RD-75, migration 330, skill category 48.
3. Then the 2026-09-18 handoff's remaining sequence: M3 (after M2), M4, M6, M9d (after N2, the cloud note says
   why), M7 (not briefed), the coordinator hop proofs, `enforceFired` in the loop manifest, proof run 6.2.
   Only then the data (6.3). System before data still binds.
4. Owed, unchanged: the coordinator tooling lives in a temp folder and changes behaviour silently (section 3
   is what that costs); landing it in the repo with tests is lane P6 and belongs with 6.8. The merge watcher
   gives up when GitHub reports `mergeable=UNKNOWN` (it did on #733; merged by hand once CLEAN).

## 5. Learned this session (add to the 2026-09-18 list)

- A publish script's safety check that fails OPEN is not a check: my glyph gate used a grep mode this shell's
  locale does not support, grep errored, the `if` read that as "no match". Read every line of a tool's output;
  use `node` for Unicode tests here.
- Branch protection is NOT strict here (read from the API): a PR that is only behind master merges. The PRs
  that lost the race to the cloud session's merges lost it because they CONFLICTED on the shared session log,
  and a conflicting PR gets no required checks at all.
- A renumbered migration leaves its old inventory row behind after a rebase (consistency check C3 caught it on
  M9c). After reassigning a shared id, grep the inventory for the old number.
- One Claude Code session was running on the machine at write time (checked in the process table). The cloud
  session's pause note expects a NEW local session; when it starts, this one must be closed, not left idle
  beside it.
