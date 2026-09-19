# Lane T2: one guarded env-file loader; F48 refuses a bare load (class fix for T1's defect, second occurrence)

Read first, in this order: `docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md` (binds you; the gate
is the repo wrapper named below), then `docs/ops/HANDOFF-2026-09-19-addendum.md` section 2 (M2's row: the
defect and the operator's ruling), then `docs/dispatches/lane-common-contract.md`.

Lane id: `t2`. Worktree `.worktrees/wt-t2`, branch `lane/t2-env-file-loader-2026-09-19`, cut from master
`25418482`. Model: Sonnet. You execute exactly this brief. Anything it does not cover is a STOP: report it.

## State you inherit (uncommitted in the worktree, written by the coordinator; do not redo it)

- `fsi-app/scripts/lib/env-file.mjs` (the one home: `loadLocalEnvFile()`, `withoutCredentials()`,
  `FSI_NO_ENV_FILE`, `CREDENTIAL_VARS`) and `env-file.test.mjs` (8 of 8 pass).
- 90 files moved onto it: every live script under `fsi-app/scripts/**` (the archived, reground and scratch
  trees and `supabase/seed` are historical and out of scope, by F48's scope since L41); the four
  credential-absent tests (`ecb-fx-producer.test.mjs`, `refresh-published-price-statistics.test.mjs`,
  `check-vocabulary-drift.test.mjs`, `src/__tests__/market-ecb-fx-parser.test.mjs`) build their child env
  with `withoutCredentials()`; T1's `CHECK_VOCAB_DRIFT_NO_ENV_FILE` retired; the two pure-math selftests
  under `src/lib` no longer load an env file they never used; RD-72's text and residual and the manifest
  comment updated.
- `F48-env-file-load-guarded.mjs` rewritten with three checks (a, b, c; header explains) and its test
  (9 tests). 8 pass; the LIVE test fails on two files, which is the first item below.
- A throwaway FAKE env file exists at `fsi-app/.env.local` (gitignored, fake values, never stage it). It is
  the proof fixture: with it present, master's `ecb-fx-producer.test.mjs` fails 1 of 6 (reproduced by the
  coordinator at 16:06 UTC).

## What you do, in order

1. **Scope check (b) to spawning tests.** `fsi-app/src/lib/data-public-surface-slugs.test.mjs` (lines 149,
   170, 177, 188) sets and deletes `process.env.SUPABASE_SERVICE_ROLE_KEY` in-process to unit-test a pure
   function; no child is spawned, so no env file can hand anything back. That is a false positive of check
   (b), not a defect. Change `findUnswitchedCredentialStrips` so it returns `[]` when the file has no
   non-comment line matching `SPAWN_RE` (the same precondition check (c) already applies), update the
   header's (b) sentence to say "in a test that spawns a child process", and add a GREEN test: a strip in a
   file with no spawn is not flagged. Do not weaken anything else.
2. `fsi-app/src/__tests__/market-eia-v2-petroleum-spot-parser.test.mjs` line 243: read the test. If it
   spawns the producer and relies on the inherited environment for a credentials refusal, or strips a
   credential by hand, move it onto `withoutCredentials()` (import from `../../scripts/lib/env-file.mjs`)
   exactly as `market-ecb-fx-parser.test.mjs` was. If the flag is anything else, STOP and report the line.
3. `node --test fsi-app/.discipline/fitness/functions/F48-env-file-load-guarded.test.mjs`: 10 of 10.
4. **Execution wiring** (CLAUDE.md rule 15). `fsi-app/.discipline/run-test-suite.sh` lists `scripts/lib`
   tests by NAME, not by glob (its header says why). Add `fsi-app/scripts/lib/env-file.test.mjs` beside its
   siblings in that list. Then `node --test fsi-app/.discipline/glob-portability.test.mjs` must pass (the
   module imports only `node:` builtins).
5. **Proof, both disk states, paste every count.** With the fake env file PRESENT:
   `node --test fsi-app/scripts/lib/env-file.test.mjs fsi-app/scripts/producers/market/ecb-fx-producer.test.mjs fsi-app/scripts/producers/market/refresh-published-price-statistics.test.mjs fsi-app/scripts/verify/check-vocabulary-drift.test.mjs fsi-app/src/__tests__/market-ecb-fx-parser.test.mjs fsi-app/src/__tests__/market-eia-v2-petroleum-spot-parser.test.mjs`
   must be all pass (this is the case that failed on master). Then `rm fsi-app/.env.local`, confirm with
   `ls fsi-app/.env.local` that it is gone, run the same command: all pass. The file must NOT exist when you
   commit or run the gate.
6. **Fast checks before the gate**, from the worktree root, each pasted verbatim:
   `node fsi-app/.discipline/fitness/runner.mjs 2>&1 | tail -3` (0 violations);
   `node --test fsi-app/.discipline/fitness/functions/F45-duplicate-code.test.mjs` (if it reports the
   measured count differs from the ceiling, STOP and report both numbers; you never edit the ceiling line);
   `node --test fsi-app/.discipline/fitness/functions/F25-module-liveness.test.mjs`;
   `for f in $(git diff --name-only | grep '\.mjs$'); do node --check "$f" || echo "SYNTAX $f"; done`;
   every `*.test.mjs` that sits beside a script you find changed (`git diff --name-only`) whose test spawns
   or imports it: run it (`grep -l` the script's basename across `fsi-app/scripts/**/*.test.mjs`), all pass.
7. Docs, two files: (a) `docs/dispatches/lane-common-contract.md`, "Wiring preflight" list, add ONE bullet
   after the em-dash bullet: "A script loads the local env file only through `fsi-app/scripts/lib/env-file.mjs`
   (`loadLocalEnvFile()`), never with a bare `process.loadEnvFile`; a test that asserts credential-absent
   behaviour on a spawned child builds its environment with `withoutCredentials()` from the same module
   (F48, lane T2, 2026-09-19: a per-script load defeated that test class twice in two days in the one
   worktree with an env file)." (b) your own `docs/ops/session-log.d/2026-09-19-t2.md`, heading
   `## 2026-09-19, lane T2: one guarded env-file loader; F48 refuses a bare load`, first person, in the
   shape of `2026-09-18-t1.md`: what happened (the second occurrence, M2 refused at 10:40:37 EDT per the
   addendum), the fix (one home, one switch, the three F48 checks, the count of files moved, the seed and
   archive trees left out and why), the proof in both disk states with the counts, what F48 cannot see
   (its residual), ending with `### UX compliance (T2)`: Not a UI change; no customer surface touched by
   this branch.
8. Commit ONE commit: stage explicit paths (`git add` the files `git status --short` lists, never `.env.local`,
   never `-A`); subject `Lane T2: one guarded env-file loader; F48 refuses a bare load`; body: what and why,
   the proof counts; last line exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`;
   `git -c user.name="Claude (lane T2)" -c user.email="noreply@anthropic.com" commit -F <msgfile>`.
   The pre-commit hook runs (rule 022: no em dash, en dash or section sign in anything you wrote).
9. `git fetch origin && git rebase origin/master`; a conflict in any file: `git rebase --abort`, STOP, report.
10. The gate, ONCE, last, as ONE background task (timeout 600000), wait for its notification, never poll:
    `LANE_GATE_SP=/tmp/claude-0/-home-user-dotfiles/7efbea10-26eb-533d-9d20-a02a9ab8d3f9/scratchpad/coord bash /home/user/dotfiles/.worktrees/wt-t2/fsi-app/scripts/coordinator/lane-gate-cloud.sh /home/user/dotfiles/.worktrees/wt-t2`
    Exit 4 (behind master): rebase, run once more, not a FAIL. A FAIL whose cause is in this change: fix,
    commit, run once more (second and last). Anything else: STOP and report the step and message.
    Do NOT open a pull request.

## Write set beyond the inherited state

`F48-env-file-load-guarded.mjs` and its test (step 1), the eia parser test (step 2), `run-test-suite.sh`
(step 4, one line), the two docs in step 7. Nothing else. No id allocation; no ceiling edit; no skill edit.

## Report (your final message; it is all the coordinator sees)

Result; Files changed (path: what); Verification (steps 3 to 6 with commands and outputs verbatim, both
disk states of step 5 with their counts, confirmation the fake env file is gone); Gate (every
`[discipline pre-push] step` line, the `gate exit:` line, the pushed head sha); Refutations and findings
(each labeled [CONFIRMED] or [HYPOTHESIS]); Blockers.

## Amendment 1 (coordinator, 2026-09-19 16:18 UTC by the date command, after the lane's STOP at step 2; first stamped 16:40 from memory, corrected in place)

The lane's finding stands [CONFIRMED by its direct call of `fitnessFunction.check` on the file]: line 243 of
`market-eia-v2-petroleum-spot-parser.test.mjs` is a pure unit assertion on `decideApply()`'s return value.
Nothing is wrong with that test; check (c) was file-scoped (any creds assertion in a file that spawns
anywhere), the same shape as the check (b) false positive step 1 fixed. Step 2 is replaced:

2. **Scope check (c) to assertions on a spawned child's result.** In `findAmbientCredentialAssertions`, a
   line counts only when it is an assertion mentioning creds or credential AND its text references a
   child-result field: `.stderr`, `.stdout` or `.status`. (A refusal a child makes is visible only there;
   an assertion on a plain object is a unit test of a pure function.) Keep the spawn precondition. Update
   the header's (c) sentence to say so. Tests: keep the RED test as is (`assert.match(res.stderr, /DB creds/)`
   with a spawn and no helper is still flagged); add a GREEN test: a file that spawns a child in one test
   and asserts `assert.match(d.reason, /DB creds/)` on a plain object in another is not flagged. The eia
   parser test file is NOT edited. The write set gains nothing beyond the F48 function and its test.

Then continue with steps 3 to 10 exactly as written (step 3's count becomes 11 of 11).

## Amendment 2 (coordinator, 2026-09-19 16:24 UTC by the date command, after the lane's STOP at step 6; first stamped 16:26, ahead of the clock, corrected in place)

The lane's isolation stands [CONFIRMED by its runner comparison]: the nine F28 violations come from the
90-file move, because `scripts/turns/run-*.mjs`, `scripts/verify/inaccessible-triage.mjs` and the maintenance
scripts are governing files of nine harness families, so their live hash moved and each family's stored
`PENDING-RUN.md` pin went stale. That is cause B of plan section 6.8, which lane N3 removes. Until N3 lands
the convention still requires the pin, so this lane finishes by hand, and calls it that in its session-log
entry, never a fix.

Step 6 gains, before its runner check: **re-stamp the nine markers.** From `fsi-app/`, print every family's
live hash with
`node -e 'Promise.all([import("./scripts/lib/run-artifact.mjs"), import("./scripts/harness-runs/governing-files.mjs")]).then(([m, g]) => { for (const f of Object.keys(g.GOVERNING_FILES)) console.log(f, m.hashHarnessVersion(g.GOVERNING_FILES[f])); })'`
and, for each family F28 names (inaccessible-triage, maintenance, fetch-drain, source-sweep, ledger-consume,
change-detection, propagation, corpus-turn, brief-apply), edit its `scripts/harness-runs/<family>/PENDING-RUN.md`
the way `fsi-app/scripts/harness-runs/CONVENTION.md` and the lane contract describe: exactly ONE current
`**harness_version at write time:** \`sha256:<16 hex>\`` line carrying the new hash, the previous one reworded
as superseded (lane T2, 2026-09-19, env-file loader move), no other change. Check
`grep -c "^\*\*harness_version at write time:\*\*" fsi-app/scripts/harness-runs/*/PENDING-RUN.md` prints 1
per file, then `node --test fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs` and
the runner (0 violations). The nine marker files join the write set. Do this LAST among edits, after the
docs of step 7, since the docs are not governing files but any later edit to a governing file would move
the hash again.

Two more rules, restated: the lane contract forbids `git stash` (a shared stash stack; the contract names
it); the comparison the lane ran was restored cleanly this time and is not repeated, by anyone, for any
reason. And step 6's last sub-step (the tests beside every changed script) is still owed before the gate.
Then steps 7 to 10 as written.
