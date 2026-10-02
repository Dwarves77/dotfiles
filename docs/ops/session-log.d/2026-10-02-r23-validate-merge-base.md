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

## Not run / out of scope (named, not silently dropped)

- `fsi-app/.discipline/governance/memory-gate.mjs` has the identical hand-built-range pattern (both
  `discipline.yml`'s memory-gate step and pre-push step 2b pass it a literal `--range=` string) and is
  LIKELY exposed to the same class of defect for its own diff reads. Not in this lane's write set
  (dispatch names the helper, discipline.yml's validate-commits job only, pre-push's range line, and
  runner.mjs/F51's range computation). Flagged here, not fixed here, per rule 13's "decision-ready" bar:
  the mechanism to fix it (route it through `resolveRange()` the same way) is proven out by this lane;
  a follow-up lane can apply the identical pattern to `memory-gate.mjs` without re-deriving it.
- `fsi-app/.discipline/consistency/override-check.mjs` carries the identical buggy two-dot literal in
  THREE call sites, none in this lane's write set: `.github/workflows/discipline.yml`'s
  **`consistency-backstop` job** (a DIFFERENT job from `validate-commits`; the dispatch scoped
  discipline.yml changes to "that job only"), step "Consistency runner (pull request)":
  `--range="origin/${BASE_REF}..${HEAD_SHA}"`; `fsi-app/scripts/lib/assemble-train.mjs`'s
  `runGateSet()` (`--range=origin/master..HEAD`, run against an assembled train tree); and the
  lane-briefs preflight prose (`docs/dispatches/lane-briefs/2026-09-05/wave-f-common.mjs`, a dated brief
  text file, not executable). Same defect class, same fix shape (route through `resolveRange()`),
  named rather than silently carried forward, for the coordinator to assign.
