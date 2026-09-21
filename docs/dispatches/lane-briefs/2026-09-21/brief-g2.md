# Lane G2: the local push gate runs what CI's Fitness job runs (coordinator, 2026-09-21)

Model: Sonnet (gate logic). Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-p5a-nonreg`. Branch: `lane/g2-push-gate-npm-parity`, cut from `origin/master` (at or past `c3199c05`). Read `docs/dispatches/lane-common-contract.md` first. STOP on anything not covered. Invariant id assigned: RD-79 (F53 and RD-78 are reserved for lane M7c; do not take them).

## Why (measured, 2026-09-21)

Operator ruling, verbatim: "This is a constant. sTOP pushing when it will fail Discipline engine / Fitness functions". PR #769 passed the locked push gate locally and FAILED "Fitness functions" on GitHub (run 35636629376) in the step "App unit tests requiring npm deps (*.npmtest.mjs)": three tests that assert component source text broke on a markup change. [CONFIRMED by grep] `fsi-app/.discipline/hooks/pre-push` contains no npm test step at all, while `.github/workflows/discipline.yml` line 361 runs `fsi-app/**/*.npmtest.mjs` by glob. The gate and CI disagree about what "green" means; every UI lane is exposed. Second occurrence of the class (2026-09-20: F52's first `actionlint` run failed in CI on a job never run locally).

## Build

1. The pre-push hook gains a step that runs the npm suites with the SAME discovery and the SAME command as the CI step (one home: if the CI step's command is inline in the yml, move it into a script under `fsi-app/scripts/` or `.discipline/` that BOTH the workflow step and the hook call, so they cannot drift; the workflow edit obeys F52). When `fsi-app/node_modules` is absent or empty the step FAILS with one clear line naming the fix (`npm ci` in that worktree's `fsi-app`); it never skips silently and never installs by itself. Step label in the hook's own numbering style.
2. **Parity proof, by attack (RD-79).** A test that reads `discipline.yml`'s required job "Fitness functions" and the hook, and FAILS when the workflow job has a test-running step whose shared script the hook does not also call. Attack fixtures: a workflow with an extra test step the hook lacks (must fail); the matching pair (must pass). Steps that cannot run on a lane's PC by operator ruling are named in ONE small dated, reason-bearing table inside the test: today exactly the Rendering guard's Playwright job ("We do not need to install extra software use GitHub") and `actionlint` if it is not on the PATH. Nothing else goes in that table; an entry without a date and a reason fails the test.
3. Register RD-79 as one file under `fsi-app/.discipline/governance/invariants.d/`, enforcer = the parity test, execution-wired (the test must be run by the canonical suite; F23 and execution-wiring must see it).
4. Runtime cost: measure the new step's wall time on this PC once and put the number in your report. If it exceeds ten minutes, do NOT trim the suite: report the number and STOP for a ruling.
5. `docs/dispatches/lane-common-contract.md` is coordinator-owned: do not edit it. Put the one sentence lanes need ("the push gate now runs the npm suites; a worktree needs `npm ci` first") in your `docs/ops/session-log.d/` file under "Owed to the contract".

## Standing lines

- First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `remediation-discipline`.
- Never `git stash` (clean master: `git worktree add --detach <scratch path> origin/master`). Never `git add -A`, never `--no-verify`. Never run `repin.mjs`, `reseed-f45.mjs`, `repin-skills.mjs`, `resolve-conflicts.mjs`. Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. Skill-ack files copy the exact heading shape of an existing one.
- F51 check 5: count touches with `git log --first-parent -30 --format=%H origin/master` and per-commit `git diff-tree --name-only -r`; a non-entry-directory file already at two is a STOP with the measurement. F27: a new first-party import in a runner owes a composition proof. F25: a new script with no production caller fails; yours is called by the workflow and the hook.
- Run every npm suite yourself with the new shared command, the FULL fitness runner (all functions) to 0 violations, restore `coverage-report.json` if dirtied, then the locked push gate once, last, as one background task (now longer; silence is normal). A FAIL from your change is fixed at the cause and the gate runs once more; a second FAIL on the same step is a STOP. You do not push. No workaround of any kind.

## Report

ONE final report, five lines maximum, sent once, no interim messages: commit sha; the new step's measured wall time and the npm totals; fitness violations and push gate result; the parity table's entries; any STOP with its measurement. Write the PR body `pr-g2.md` into `C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/` (the coordinator's scratchpad, `C--Users-jason`, not your own), with `## UX compliance` reading "Not a UI change.", ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
