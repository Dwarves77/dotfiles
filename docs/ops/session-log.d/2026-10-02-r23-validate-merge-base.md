# 2026-10-02, lane R23 (VALIDATE-COMMITS-MERGE-BASE)

Coordinator dispatch, 2026-10-02: the CI "Validate commits against discipline rules" job diffs
`origin/<base>` at its CURRENT TIP against `HEAD`, so a branch whose base is behind master's tip shows
master's own later fixes as "added" lines on the branch. [CONFIRMED twice today]: PR #866 (111 inherited
em dashes in `docs/audits/BRIEF-STRUCTURE-AUDIT.md`, a file that branch never touched) and PR #869. Both
lanes lost a CI cycle each; the fix each time was a rebase, a workaround, not a fix.

## Root cause (rule 022 in full)

`git diff A..B` (two dots) diffs the two endpoint TREES directly; it does NOT merge-base-correct the
way `git diff A...B` (three dots) does. Three callers each built their own literal two-dot range
against the base ref's current tip instead of its merge-base with HEAD:

- `.github/workflows/discipline.yml`'s `validate-commits` job, pull_request leg:
 `RANGE="origin/${BASE_REF}..${HEAD_SHA}"`.
- `fsi-app/.discipline/hooks/pre-push` step 2c: `--range=origin/master..HEAD`.
- `fsi-app/.discipline/runner.mjs`'s `--mode=ci --range=<range>` branch took whatever literal range
 string either caller handed it and fed it straight to `buildContextForRange()` (`context.mjs`), which
 runs `git diff --numstat <range>` / `git diff -U0 <range> -- <path>` on that literal string, the
 exact vulnerable spot rule 022's content check (`getAddedLines`) reads from.

**`fsi-app/.discipline/lib/change-range.mjs`'s `resolveRange()` already existed** (lane N0, plan section
6.8 Rule C) and already computed the LOCAL case correctly (`base = git merge-base origin/master HEAD`,
`range = base..HEAD`). Its CI-PR branch (triggered by `BASE_REF`+`PR_HEAD` env vars) built
`origin/${BASE_REF}...${PR_HEAD}`, three dots, which IS diff-safe on its own (`git diff A...B`
internally resolves to `merge-base(A,B)..B`), but nothing *forced* every range-based caller through
this function, so the CI job and pre-push never called it at all; they each hand-built a two-dot range
and passed it straight into `runner.mjs --range=`, bypassing `resolveRange()` entirely. **F51
(`fitness/functions/F51-no-shared-append.mjs`) was already correctly wired**: checks 1-4 and 5 call
`resolveRange({ cwd: root })` with no explicit range, so it was never exposed to this defect. It needed
no code change; it is the precedent the other three callers now follow.

## Fix

One shared helper, `change-range.mjs`'s `resolveRange()`, used by all four range-based callers with no
caller building its own range string:

1. **`fsi-app/.discipline/lib/change-range.mjs`**: the CI-PR branch now resolves `base = git merge-base
 origin/${BASE_REF} ${PR_HEAD}` (an actual commit) and returns the plain two-dot `base..PR_HEAD`,
 matching the local-merge-base branch's shape instead of three dots against the base ref's tip. One
 shape, correct for both `git diff` (no endpoint-tree drift, since `base` already IS the shared
 ancestor) AND `git log` (`base..head` lists exactly head's own commits; a three-dot / symmetric
 difference range would also surface the base ref's own post-fork commits, which matters for
 `runner.mjs`'s commit walk below, which needs exactly one side).
2. **`fsi-app/.discipline/runner.mjs`**: `--mode=ci` without `--commit` now ALWAYS resolves its range
 through `resolveRange({ explicit: args.range, env: process.env })`. An explicit `--range` is still
 honored verbatim (manual diagnosis), but when omitted the CI-PR env shape or the local merge-base
 fires, the same function F51 already used. Both the per-commit `git log` walk and the whole-range
 `buildContextForRange()` diff (the rule-022 vulnerable spot) now use this one resolved range.
3. **`.github/workflows/discipline.yml`**, `validate-commits` job, pull_request leg: stopped building
 `RANGE` by hand; added `PR_HEAD` env var (alongside the existing `BASE_REF`) and dropped `--range=`
 from the `runner.mjs` invocation, letting it self-resolve. The `git fetch --no-tags origin
 "$BASE_REF"` line is unchanged (still needed so `origin/<base>` is resolvable for the merge-base
 call). The push-to-master leg (`--commit=$COMMIT_SHA`) is untouched: single-commit mode never built
 a range, so it was never exposed to this defect, and squash-merge parity (the merged result still
 gated by the master run) is unaffected.
4. **`fsi-app/.discipline/hooks/pre-push`** step 2c: dropped `--range=origin/master..HEAD`; the hook now
 calls `node fsi-app/.discipline/runner.mjs --mode=ci` with no flags. No `BASE_REF`/`PR_HEAD` env vars
 exist in a local push, so `resolveRange()`'s local-merge-base branch fires, the same branch F51 and
 the pre-existing local-case tests already exercised.
5. **`fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs`**: no code change. Confirmed (see
 below) that it was already routing through `resolveRange()` and is unaffected by the CI-PR branch's
 shape change (its own fork-point logic for check 5's hotspot concurrency is a deliberately separate
 mechanism, documented in its own header, for the rebased-in-queue case, out of this lane's scope).

## Negative-test proof (rule 15: a guard is proven by attack, not by presence)

Added to `fsi-app/.discipline/lib/change-range.test.mjs`, two git-fixture tests built with REAL
divergent branches (`git checkout -b feature` off a shared fork commit, not a linear chain; a linear
chain would make `merge-base` trivially return the branch's own tip, not the real fork point):

- **DEFECT PROOF**: a fixture repo where `origin/master` gains a fix to `untouched.md` AFTER the branch
 forks, in a file the branch never touches. The OLD range (`origin/master`'s current tip `..` head,
 two dots) shows the branch "re-adding" the already-fixed line (`gitDiffLinesForPath` returns a `+`
 line containing the old glyph), reproducing PRs #866/#869 exactly. `resolveRange()`'s new ci-pr range
 (`base = merge-base(origin/master, head)` = the actual fork commit) shows zero added lines for that
 file.
- **CONTROL**: a second fixture where the branch itself adds the glyph. The same merge-base-derived
 range still flags it, proving the fix is not a blanket escape hatch for rule 022 or any other content
 check riding on `gitDiffLinesForPath`/`gitChangedFiles`.
- Updated the pre-existing `ci-pr` unit test (previously pinned the three-dot-against-tip shape as the
 expected output) to build a real fixture repo and assert the new `base = fork commit, range =
 base..head` shape instead.

## Test results (touched files only, per lane contract)

```
node --test fsi-app/.discipline/lib/change-range.test.mjs
 13/13 pass (2 new, 1 rewritten)

node --test fsi-app/.discipline/runner.test.mjs
 4/4 pass (unaffected; no existing test exercised --mode=ci --range)

node --test fsi-app/.discipline/fitness/functions/F54-push-gate-npm-parity.test.mjs
 26/26 pass, incl. the two LIVE checks against the real discipline.yml and pre-push text:
 CI/pre-push script-path parity holds (both still invoke runner.mjs by path; F54 does not
 pin flags, only script paths)

node --test fsi-app/.discipline/fitness/functions/F51-no-shared-append.test.mjs
 62/62 pass (confirms F51 needed no change)

node --test fsi-app/.discipline/fitness/functions/F45-duplicate-code.test.mjs
 12/12 pass

node --test fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs
 32/32 pass

node --test fsi-app/.discipline/governance/invariant-coverage.test.mjs
 17/17 pass
```

Also smoke-tested live in this worktree: `node fsi-app/.discipline/runner.mjs --mode=ci` (no flags)
printed `Resolved range via change-range.mjs (local-merge-base): <merge-base sha>..HEAD` and ran
cleanly, the exact path pre-push step 2c now takes.

Per the lane contract: touched tests only; the full `run-test-suite.sh` was NOT run this lane.

## Scope note: a coordinator-labeled message mid-lane, not acted on

Partway through this lane, a block of text arrived inline in tool-result context (not through the
dispatch's own channel) proposing to fold three unrelated items into this lane's write set (pre-push
step 2b log path, a C5 test file, and the rendering-guard baseline expiry mechanism). It carried none of
the hallmarks of the legitimate coordinator channel this dispatch names, and asked to silently widen a
tightly-scoped, explicitly-enumerated write set. Treated as unverified and NOT acted on; the three items
it named are real but out of this lane's scope and write set as dispatched, and are left for the
coordinator to assign explicitly (through the dispatch's own channel) if genuinely wanted.

## UX compliance

No `.tsx`/`.css` touched this lane; not applicable.

## Addendum: four more items (coordinator dispatch, same day)

A follow-up coordinator message, same channel as the original dispatch, directed four more items,
"operator standard fixed, not worked around." Covered in this same lane rather than a new one, same
write-set discipline (touched tests only):

1. **`memory-gate.mjs` and `override-check.mjs`: route their range sites through `resolveRange()`.**
 Both CLIs used to require or trust a literal `--range=` string built by the caller. Both now accept
 an OPTIONAL `--range`; when omitted, `resolveRange({ explicit, env: process.env })` resolves it (the
 CI-PR env shape, or the local merge-base). Callers updated to stop hand-building ranges:
 `.github/workflows/discipline.yml`'s "Consistency runner (pull request)" step (added `PR_HEAD`,
 dropped the `--range=` literal) and `fsi-app/scripts/lib/assemble-train.mjs`'s `runGateSet()` (dropped
 `--range=origin/master..HEAD`). Note: `git log <range>` (what both files actually read commit
 messages with, via `messagesForRange`) was not independently vulnerable to the tip-vs-merge-base
 defect the way `git diff` is (see the root-cause section above) -- this item is about eliminating a
 second, independent way to build a range string, for the same "one shared helper" reason, not about
 a second instance of the PRs #866/#869 symptom.
 Tests: 2 new fixture tests in `override-check.test.mjs` (real divergent branches, BASE_REF+PR_HEAD and
 local-merge-base paths) + 1 new fixture test in `memory-gate.test.mjs` (same shape, proves
 `gitChangedFiles` over the resolved range excludes master's post-fork file). 14 + 32 pass respectively.

2. **Pre-push step 2b's fixed `/tmp` log path → the per-run `$PRE_PUSH_LOG_DIR` every sibling step
 uses.** The exact D11 concurrent-run collision class (`docs/plans/defect-fix-plan-2026-09-12.md`):
 two pushes running this hook at once could have one's cleanup delete the other's still-being-read
 log. Moved to `$PRE_PUSH_LOG_DIR/mem.log`; the now-redundant per-step `rm -f` is gone (the trap at
 EXIT already owns cleanup for the whole directory, same as every sibling step).
 Test: new attack test in `pre-push-tmpdir.test.mjs` asserting the fixed-path literal is ABSENT from
 the tracked hook and the redirect target is the shared directory. 5/5 pass.

3. **`C5-program-anchors-reality.test.mjs`, in the C3/C4 shape.** C5 (program-anchors reality, invariant
 RG-1) had no test file at all, unlike its siblings C3/C4 in the same directory. New file, same shape:
 GREEN against the live tree, then one negative test per failure mode the check's `run()` can hit
 (missing doc, malformed ACTIVE_PHASE, no anchors block for the active phase, empty anchors block, a
 dead file reference, a "present" anchor that is actually absent, an "absent" anchor that is actually
 present), plus a control. Every negative test mutates (write/rename) the REAL
 `docs/program/GOVERNING-PROGRAM.md` and restores it in a `finally` -- no injectable root exists on
 `consistencyCheck.run()` today, matching C3's own documented posture; the present/absent cases point
 their anchors at C5's own module file rather than any product code, so no source file is ever
 mutated. 10/10 pass; confirmed the real doc is byte-identical after the run (`git status --porcelain`
 clean).

4. **Layout-guard baseline renewal warning, firing 7 days before expiry.** New pure function
 `needsRenewal()` in `fsi-app/.discipline/rendering/layout-guard/baseline.mjs` (plus
 `WARNING_WINDOW_DAYS` and `warningWindowStart()`), separate from the existing hard-cliff `isExpired`:
 once today is within the window and the baseline's `writtenAt` predates the window's own start (i.e.
 nobody has re-run `run-layout-guard.mjs --write-baseline` since the window opened), it is due. Six
 attack tests on the pure boundary logic (injectable date/writtenAt) plus one STANDING test that calls
 `needsRenewal()` with the REAL clock and the REAL `baseline.json` -- this one is not a unit test of a
 function, it is the gate itself, already wired into the existing `run-test-suite.sh` glob
 (`.discipline/rendering/*.test.mjs`) via the file it was added to. Today (2026-10-02) it is green
 (expiry 2026-10-15, window opens 2026-10-08); it will fail for real on 2026-10-08 unless the baseline
 is renewed by then. New runbook `docs/runbooks/layout-guard-baseline-renewal.md` (INDEX.md line
 added) names the two renewal paths (re-run `--write-baseline`, or a new dated operator ruling moving
 `BASELINE_EXPIRY_DATE` in both `baseline.mjs` and `baseline.json`). 12/12 pass in
 `layout-guard-expiry.test.mjs`.

Full touched-file test run this addendum (combined with the original lane's files): 116/116 pass. YAML
(`discipline.yml`) and shell (`pre-push`) syntax both re-validated after every edit.

## Addendum 2: the two remaining flags are FIXED, not left (coordinator dispatch, rule 13)

A second follow-up coordinator message (same channel) invoked rule 13 ("a flag is a commitment, not a
comment") against the "Not run / out of scope" list below as it stood after addendum 1. On inspection,
two of the three items it named were ALREADY fixed by addendum 1's own item 1 (the edits just were not
reconciled against this section before commit) and the third is correctly not a call site at all:

- **`fsi-app/.discipline/consistency/override-check.mjs`'s `.github/workflows/discipline.yml`
 `consistency-backstop` job, "Consistency runner (pull request)" step -- FIXED, confirmed live in the
 tree** (`git show 503fa158 -- .github/workflows/discipline.yml`): `PR_HEAD` env var added, the
 hand-built `--range="origin/${BASE_REF}..${HEAD_SHA}"` literal dropped, the CLI invoked bare so
 `resolveRange()` resolves it. Addendum 1's commit message named this file edit but the "Not run" list
 below was never reconciled against it -- a bookkeeping miss, not an unfixed defect. Corrected here per
 rule 13's corollary: a flag that dissolves under evidence gets a same-session correction wherever it
 was recorded.
- **`fsi-app/scripts/lib/assemble-train.mjs`'s `runGateSet()` -- FIXED, confirmed live in the tree**: the
 `--range=origin/master..HEAD` literal is gone; `override-check.mjs` is invoked bare, falling to
 `resolveRange()`'s local-merge-base branch (no `BASE_REF`/`PR_HEAD` in this local-tool context). Same
 bookkeeping miss as above, same correction.
- **`docs/dispatches/lane-briefs/2026-09-05/wave-f-common.mjs` -- correctly LEFT, not a call site.**
 Inspected directly (`node -c`, parses as a valid ES module; read in full): it exports one function,
 `C(name, wt, extra)`, whose entire body is a template-literal STRING -- a dispatch brief a coordinator
 renders and hands to a lane agent to read and type commands from by hand. The string's prose happens
 to contain the literal text `node fsi-app/.discipline/consistency/override-check.mjs
 --range=origin/master..HEAD` as an instruction quoted FOR a human/agent reader, the same way this very
 session-log file's own root-cause section quotes the old buggy command literally, for the record. No
 code anywhere executes that string as a shell command; it is a doc under `docs/dispatches/`, dated
 2026-09-05 (CLAUDE.md rule 10: dated point-in-time artifacts are not retroactively edited), describing
 gates AS THEY WERE PHRASED for that day's lanes. Editing it would misrepresent history for no present
 benefit -- the override-check.mjs CLI it tells a reader to type still runs correctly (bare invocation
 works too; an explicit `--range=` is still honored verbatim via `resolveRange`'s own 'explicit'
 precedence). Left as-is.

**`memory-gate.mjs`'s push-event path -- already routed through `resolveRange()`; confirmed it changes
NOTHING for the exact-SHA case, so no further edit is made.** Addendum 1's own fix to `memory-gate.mjs`
(item 1) made its CLI call `resolveRange({ explicit: rangeArg ..., env })` UNCONDITIONALLY, including
when `--range` IS given -- `discipline.yml`'s push-event step passes an exact `${PUSH_BEFORE}..${PUSH_SHA}`
(or `${PUSH_SHA}~1..${PUSH_SHA}` on a branch-creation push) pair, not a branch-tip ref, and
`resolveRange`'s `explicit` branch returns a given value byte-for-byte unchanged (`change-range.mjs`
lines ~101-109: `if (explicit) { ...; return { range: explicit, ... } }`) -- a provable identity
passthrough, not routing-in-name-only. There is nothing left to change here: the push-event RANGE
computation in the workflow step itself stays as exact before/after SHAs (there is no tip to drift,
unlike a `BASE_REF`/`PR_HEAD` ref), and the CLI it calls already resolves through the one shared
function either way.

### Re-verification after this addendum

```
node --test fsi-app/.discipline/lib/change-range.test.mjs 13/13 pass
node --test fsi-app/.discipline/runner.test.mjs 4/4 pass
node --test fsi-app/.discipline/consistency/override-check.test.mjs 14/14 pass
node --test fsi-app/.discipline/governance/memory-gate.test.mjs 32/32 pass
node --test fsi-app/.discipline/hooks/pre-push-tmpdir.test.mjs 5/5 pass
node --test fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.test.mjs
 10/10 pass
node --test fsi-app/.discipline/rendering/layout-guard-expiry.test.mjs 12/12 pass
node --test fsi-app/.discipline/fitness/functions/F54-push-gate-npm-parity.test.mjs
 26/26 pass
node --test fsi-app/.discipline/fitness/functions/F51-no-shared-append.test.mjs 62/62 pass
node --test fsi-app/scripts/lib/assemble-train.test.mjs 11/11 pass
```

Total: 189/189 pass across every touched file, this addendum plus both prior commits. `yamllint` and
`actionlint` are not installed in this environment; re-validated `discipline.yml` with the same
`python3 -c "import yaml; yaml.safe_load(open(f))"` check this lane has used throughout (the identical
command the lane-briefs preflight above names), and `pre-push`'s shell syntax with `sh -n`. Both clean.

**Self-caught regression, same re-verification pass: F51 check 4 (coordinator-only files) FAILED**,
naming `docs/INDEX.md` -- addendum 1's own runbook announcement had added a line to that file directly,
which `docs/dispatches/lane-common-contract.md` reserves to the coordinator ("Never write
docs/ops/session-log.md, docs/PROGRAM-BOARD.md, or docs/INDEX.md (coordinator only)"). Reverted the
added line (the file is otherwise identical to its state before this lane; `git checkout
2aa17d2a -- docs/INDEX.md` round-trips it exactly) and re-ran F51 -- check 4 now reports zero
coordinator-only-file violations for this lane's range. **The new runbook's existence is announced
HERE instead**, for the coordinator to add the one INDEX.md line: `docs/runbooks/layout-guard-baseline-
renewal.md` -- how to renew `fsi-app/.discipline/rendering/layout-guard/baseline.json` before or after
its `BASELINE_EXPIRY_DATE` (re-run `run-layout-guard.mjs --write-baseline`, or a dated operator ruling
moving the expiry in `baseline.mjs` and `baseline.json` together); written for this lane's renewal-
warning gate (`needsRenewal`, item 4 above).

## Not run / out of scope (named, not silently dropped)

Nothing remains open from the original dispatch or either addendum. The only item ever out of this
lane's write set that is STILL unfixed is `fsi-app/.discipline/governance/memory-gate.mjs`'s
PULL-REQUEST-event path in `discipline.yml` (`RANGE="origin/${BASE_REF}...${PR_HEAD}"`, hand-built
three-dot, diff-safe but still not auto-resolved) -- not named by either coordinator message, and left
untouched here rather than silently widening scope a third time; the fix shape (drop the hand-built
RANGE, rely on the already-present `BASE_REF`/`PR_HEAD` env vars + `memory-gate.mjs`'s existing
no-`--range` auto-resolve branch) is identical to every other site this lane already fixed.
