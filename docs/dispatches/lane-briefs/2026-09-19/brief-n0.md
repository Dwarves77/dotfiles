# Lane N0: one home for "what changed in this range" (plan section 6.8, Rule C)

Read first, in this order: `brief-m-common.md` (beside this file; it binds you), then on your branch
`docs/plans/complete-system-build-plan-2026-09-04.md` section 6.8 (why this lane exists), then
`docs/dispatches/lane-common-contract.md`.

Lane id: `n0`. Branch: `lane/n0-change-range-2026-09-18` (already checked out for you in the worktree you are
given; it is cut from current `origin/master`). Model: Sonnet. You execute exactly this brief. Anything it does
not cover, or any instruction here that turns out to be wrong against the code, is a STOP: report it, do not
solve it.

## The problem, measured

Two gates each derive "which files changed on this branch" privately:

- `fsi-app/.discipline/governance/memory-gate.mjs`: CLI requires `--range=<a>..<b>`; git drivers
  `gitChangedFiles(range)`, `gitDiffLinesForPath(range, path)`, `gitMemoryDiffLines(range, files)` (about lines
  182 to 232 on master).
- `fsi-app/.discipline/fitness/functions/F45-duplicate-code.mjs`: `changedFiles()` (about lines 113 to 118):
  `git merge-base origin/master HEAD`, then `git diff --name-only <base> HEAD` plus
  `git status --porcelain --untracked-files=all`.

Lanes N3, N4 and N6 (later) need the same thing. Rule C of section 6.8: one module serves every gate.

## What you build

1. NEW `fsi-app/.discipline/lib/change-range.mjs`. `node:` builtins only (it is loaded by the no-npm test glob).
   Exports, all pure except the ones named `git*`:
   - `resolveRange({ explicit, env = process.env, cwd })` returns `{ range, base, head, source }` where
     `source` is one of `'explicit'`, `'ci-pr'`, `'local-merge-base'`. Order: (a) `explicit` (a string
     `a..b` or `a...b`) wins; (b) when `env.BASE_REF` and `env.PR_HEAD` are both non-empty, the range is
     `origin/${BASE_REF}...${PR_HEAD}` (this is exactly what `.github/workflows/discipline.yml` builds for the
     memory gate today; read that step and match it); (c) otherwise `git merge-base origin/master HEAD` to
     `HEAD`. When the merge-base cannot be computed, return `{ range: null, source: 'unavailable', reason }`;
     never throw, never guess a range.
   - `gitChangedFiles(range, { cwd })`: `git diff --name-only <range>`, repo-relative forward-slash paths.
   - `gitDiffLinesForPath(range, path, { cwd })`: the diff text lines for one path.
   - `gitWorkingTreeFiles({ cwd })`: paths from `git status --porcelain --untracked-files=all` (what F45 adds
     to its committed range today so a lane sees its uncommitted work attributed).
   - `gitFileAtBase(base, path, { cwd })`: the file's content at `base`, or `null` when absent there.
   - `gitAddedFiles(range, { cwd })`: only paths ADDED in the range (`--diff-filter=A`). N3, N4 and N6 need
     this to ask "did this range add an acknowledgment file".
   Every git call goes through ONE private helper that uses `execFileSync('git', [...args])` with an argument
   array (never a shell string), `encoding: 'utf8'`, and a bounded `maxBuffer`.
2. Move both callers onto it, behaviour unchanged:
   - `memory-gate.mjs` imports `gitChangedFiles` and `gitDiffLinesForPath` from the module and deletes its
     private copies. Its CLI contract (`--range=` required, `--warn-only`) does not change. Its exported pure
     functions do not change.
   - `F45-duplicate-code.mjs`'s `changedFiles()` becomes a call to `resolveRange` + `gitChangedFiles` +
     `gitWorkingTreeFiles`, same result set as today. Do NOT touch `DUPLICATED_LINES_CEILING`, the clone
     detector or the failure messages: lane N4 owns those.
3. NEW `fsi-app/.discipline/lib/change-range.test.mjs` (the suite's glob `fsi-app/.discipline/lib/*.test.mjs`
   already covers it; do NOT edit `run-test-suite.sh`). Build a throwaway git repo in `os.tmpdir()` inside the
   test (set `user.name`/`user.email` with `git -c` on each commit command or `--local` inside the temp repo
   ONLY; never touch this repo's config; the 2026-09-11 fixture-identity leak is why). Cover: explicit wins;
   the CI env shape; local merge-base; unavailable (no `origin/master`) returns `source: 'unavailable'` and
   does not throw; added-only filter excludes a modified file; a path with a space survives; `gitFileAtBase`
   returns `null` for a file added in the range.

## Write set (exact; anything else is a STOP)

- `fsi-app/.discipline/lib/change-range.mjs` (new)
- `fsi-app/.discipline/lib/change-range.test.mjs` (new)
- `fsi-app/.discipline/governance/memory-gate.mjs`
- `fsi-app/.discipline/fitness/functions/F45-duplicate-code.mjs`
- `docs/ops/session-log.d/2026-09-18-n0.md` (new)

No new fitness function, no new invariant id, no migration, no skill edit. If F45's measured count moves
because you removed the duplicate git plumbing, that is expected to go DOWN or stay; if it would go UP, STOP.
If it goes down, re-seed `DUPLICATED_LINES_CEILING` down in the same commit to the MEASURED value (F45 tells
you the number) and say so in the report.

## Acceptance (paste the evidence for each in your report)

- `node --test fsi-app/.discipline/lib/change-range.test.mjs`: all pass.
- `node --test fsi-app/.discipline/governance/memory-gate.test.mjs fsi-app/.discipline/fitness/functions/F45-duplicate-code.test.mjs`:
  same pass counts as on master before your change (record both numbers), zero fail, and you did not edit
  either test file.
- `grep -n "execFileSync\|execSync" fsi-app/.discipline/governance/memory-gate.mjs fsi-app/.discipline/fitness/functions/F45-duplicate-code.mjs`:
  no private git plumbing left in either (a remaining hit must be explained).
- `node fsi-app/.discipline/governance/memory-gate.mjs --range=origin/master..HEAD` prints OK on your branch.
- The push gate through the wrapper, once, last, as `brief-m-common.md` says.

## Amendment 1 (cloud coordinator, 2026-09-19; appended, not rewritten)

The local coordinator session is paused and this lane runs in a cloud container. Four changes bind you:

1. **Common brief.** Read `docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md` instead of
   `brief-m-common.md` (that file lives only on the operator's machine). Where it names a scratchpad
   `lane-gate.sh`, the gate is the repo copy:
   `LANE_GATE_SP=<the scratchpad folder your dispatch names> bash fsi-app/scripts/coordinator/lane-gate-cloud.sh <your worktree root>`
   run ONCE, last, as one background task.
2. **Session-log file** is dated the day of the work: `docs/ops/session-log.d/2026-09-19-n0.md`, heading
   `## 2026-09-19, lane N0: <one line>`. The write-set line naming `2026-09-18-n0.md` is superseded.
3. **The F45 ceiling line is forbidden** (operator, 2026-09-19). You do not edit
   `DUPLICATED_LINES_CEILING` in `F45-duplicate-code.mjs`, up or down, whatever the measurement says. The
   write-set paragraph's sentence "re-seed DUPLICATED_LINES_CEILING down in the same commit" is withdrawn.
   If `node --test fsi-app/.discipline/fitness/functions/F45-duplicate-code.test.mjs` reports the measured
   count differs from the ceiling after your change, STOP before the gate and report both numbers; the
   coordinator re-seeds. Everything else in that file that the brief assigns you (`changedFiles()`) stands.
4. **The memory gate's git calls must not depend on the caller's directory** (operator, 2026-09-19). Run
   from inside `fsi-app/`, `node .discipline/governance/memory-gate.mjs --range=origin/master..HEAD`
   passes its pathspecs to `git diff` relative to the current folder, so the per-lane session-log file's
   diff comes back empty and the UX compliance half reports a false failure (that is what refused lane
   W10-A on 2026-09-19 before the cause was found; `docs/ops/HANDOFF-2026-09-19-addendum.md` section 2).
   In `change-range.mjs`, every git call runs with `cwd` set to the repository top level, resolved once
   inside the module (from the module's own path, or `git rev-parse --show-toplevel` run from it), never
   from `process.cwd()`; every returned path is repo-relative. Add to the acceptance: (a) a test in
   `change-range.test.mjs` that calls `gitChangedFiles` and `gitDiffLinesForPath` with a subdirectory as
   the process cwd and gets the same result as from the root; (b) the real gate run from the repo root AND
   from `fsi-app/` on your branch, both pasted in the report, same verdict.
