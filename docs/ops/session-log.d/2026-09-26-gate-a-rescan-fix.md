# Lane GATE-A-RESCAN-FIX, 2026-09-26

Dispatch: fix lane GATE-A-RESCAN. Operator: "You HAVE to test what you're building."

## What was accomplished

Root-caused and fixed the three defects found in GitHub Actions run 36217491293
(`.github/workflows/gate-a-rescan.yml`, `workflow_dispatch` mode=dry limit=50):

1. **Pagination order-key bug (the fatal).** `scripts/lib/db.mjs`'s `readAllByIds` handed
   `readAll` no `orderBy`, so `readAll`'s own default (`orderBy = "id"`) applied regardless of the
   caller's `idColumn`. `item_gate_a_state` (migration 224) has NO `id` column at all, its primary
   key is `intelligence_item_id`, so `gate-a-rescan.mjs`'s `readGateAStates` crashed every page with
   `column item_gate_a_state.id does not exist` [CONFIRMED against the live schema, `information_schema.columns`
   for `item_gate_a_state`: `intelligence_item_id, scanned_hash, orphan_count, orphans, gate_a_version,
   scanned_at` -- no `id`].
   - Class fix: `readAllByIds` now defaults `orderBy` to `idColumn` (always a real column, since it is
     the exact one the `.in()` filter already targets), instead of blindly inheriting `readAll`'s "id"
     default.
   - Found and fixed a SIBLING instance in the same file: `gate-a-rescan.mjs`'s
     `countDistinctGateAVersions` called `readAll("item_gate_a_state", "gate_a_version")` with no
     `orderBy` -- apply-mode-only, so the 2026-09-26 dry-mode incident never reached it. Fixed with an
     explicit `orderBy: "intelligence_item_id"`.
   - Found and fixed a THIRD instance via the new static audit: `scripts/connections/generate-theme-brief.mjs`'s
     `readAll("theme_briefs", ...)` -- `theme_briefs` (migration 266) has no `id` column either, PK is
     `theme_id` [CONFIRMED against live schema]. Fixed with `orderBy: "theme_id"`.
   - Added `scripts/verify/pagination-order-key-audit.test.mjs`: a static, no-DB, no-npm-dependency
     test that statically resolves every literal-table `readAllByIds`/`readAll` call site's order
     column and asserts it exists in the committed schema snapshot
     (`scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json`, lane TOOL-GAP-2/#809 --
     reused, not a new snapshot). Confirmed RED against the pre-fix shape, GREEN on the whole live
     tree post-fix.

2. **Masked `tee` failures.** Every `run:` step across `.github/workflows/*.yml` that pipes a script
   into `tee` had no `set -o pipefail`, so a bash pipeline's exit status (its LAST command's, `tee`,
   which always exits 0) masked the piped command's own failure -- exactly how the fatal crash in (1)
   still reported the step SUCCESS. Grepped every `.github/workflows/*.yml` for `| tee`: 5 files, 7
   affected steps (`gate-a-rescan.yml` x2, `brief-apply.yml` x2, `brief-export.yml` x2,
   `date-chain.yml` x3 -- `maintenance.yml`'s one `| tee` hit was a comment, not code, confirmed no
   fix needed there). Added `set -o pipefail` to all 7. Added F52 check (f) (`workflow-file-validity`)
   that fails a `run:` step piping into `tee` with no `set -o pipefail` earlier in the same step, with
   RED/GREEN attack tests (including a negative case: pipefail set in an EARLIER, different step must
   not suppress the finding). `LIVE: fitnessFunction.check() over the real committed tree returns zero
   violations` passes post-fix.

3. **False-success harness artifact.** `scripts/turns/emit-gate-a-rescan-artifact.mjs`'s
   `buildArtifact` treated a missing `rescanSummary` (never written because `scripts/maintenance/lib/cli.mjs`'s
   `runCli` throws BEFORE calling `writeSummary` on an uncaught exception) identically to a genuine
   zero-item no-op: zero `defects_found`, `proposer_notes` claiming "This dispatch was a no-op." That
   is exactly why the crashed run still committed a harness artifact and opened a PR reporting success.
   `gate-a-rescan.yml` now captures the rescan step's own outcome (`id: rescan`, `steps.rescan.outcome`)
   and passes it through `GAR_RESCAN_STEP_OUTCOME`; the emitter records a defect and an honest "did NOT
   complete cleanly" note whenever the step's outcome was not `success` and no `summary.json` exists.
   Also handles the never-supplied-at-all case (an older caller) by flagging as unresolved rather than
   assuming success. New tests cover all four combinations (crash / real no-op / success-outcome-but-
   null-summary contradiction / outcome not supplied at all).

## Consumers checked

- `readAllByIds`/`readAll` (`scripts/lib/db.mjs`): grepped every call site in `scripts/` and `src/`
  (35 `readAllByIds` calls, dozens of `readAll` calls); queried `information_schema.columns` (SELECT-only,
  R14-compliant) for every table named with a non-`"id"` `idColumn` or used via `fetchRowsIn`'s generic
  `keyColumn` path. Only `item_gate_a_state` and `theme_briefs` lack an `id` column among current call
  sites; both fixed.
- `gate-a-rescan.yml`'s own workflow test (`scripts/maintenance/gate-a-rescan-workflow.test.mjs`) --
  still green post-edit, including its own "F52 checks a-e report zero violations for this file" test.
- `emit-gate-a-rescan-artifact.mjs`'s existing test file -- extended, all pre-existing cases still pass.

## ADRs / decisions checked

`grep -ril "item_gate_a_state\|readAllByIds\|pipefail" docs/decisions/` -- no ADR names this identifier;
nothing to reverse.

## Gate outputs

- `bash .discipline/run-test-suite.sh`: 1667 tests, 1663 pass, 0 fail, 4 skip (exit 0).
- `node .discipline/fitness/runner.mjs`: 49 functions checked, 0 violations (after staging the new
  test file so `git ls-files`-based execution-wiring saw it -- the ORPHANED-PROOF gap resolved once
  tracked).
- Wiring preflight (`DISCIPLINE_HOOK_TRAMPOLINE=1 sh .discipline/hooks/pre-push`): see next addendum
  in this file for the final green run, appended after the real dry dispatch.

## Real dry dispatch (the actual test, per the operator's "you HAVE to test what you're building")

First attempt, run [36220173437](https://github.com/Dwarves77/dotfiles/actions/runs/36220173437):
`gate-a-rescan.mjs` step SUCCEEDED for the first time ever (bug 1 confirmed fixed, no more "column
item_gate_a_state.id does not exist"), but the "Commit this run's harness artifact and open a PR" step
then failed with `CONFLICT (add/add)` on every touched file during its `git rebase --autostash
origin/master`. Root-caused live: `actions/checkout@v4`'s default depth-1 shallow clone truncates a
DISPATCHED-ON-A-BRANCH ref to a single rootless commit with no known parent, so the rebase-onto-master
step (designed assuming the dispatched ref IS at/near master) finds no common ancestor. Fixed by adding
`fetch-depth: 0` to the checkout step (commit `afce6364`) -- a genuine class-4 defect this real-dispatch
test surfaced (any `workflow_dispatch` naming a non-master ref, per the workflow's own documented "a
hand-named ticket" use, would hit this), not an artifact of testing on a branch.

Second attempt, run **[36221025936](https://github.com/Dwarves77/dotfiles/actions/runs/36221025936)**
(`.github/workflows/gate-a-rescan.yml`, `workflow_dispatch`, `mode=dry`, `limit=50`, branch
`lane/gate-a-rescan-fix`): **conclusion: success. Every step passed.**

Landed artifact `fsi-app/scripts/harness-runs/gate-a-rescan/gate-a-rescan-run-001.json`
(`harness_version sha256:d0e14202b952f5ae`), fast-forward-merged onto this branch from the run's own
`gate-a-rescan/36221025936` branch (PR auto-creation was refused by a repository setting, the script's
own documented fallback -- the branch itself is pushed and diffable at
https://github.com/Dwarves77/dotfiles/compare/master...gate-a-rescan/36221025936?expand=1):

- `metrics`: `candidates: 1518, stale: 916, selected: 50, touched: 0, distinct_versions_remaining: null`
- `defects_found`: `[]` (empty -- a clean run, honestly recorded, not a false no-op and not a false
  success on a crash)
- `per_item`: 50 rows, each `outcome: "rescanned"` with a real `gate_a_version` before/after verdict
  (e.g. `2026-07-30.1 -> 2026-09-04.1; orphan_count 0 -> 0`) -- `touched: 0` because dry mode never
  writes, exactly as designed.
- `proposer_notes`: the honest "auto-emitted ... recorded their outcomes" note (not the crash-path
  wording, since this run genuinely succeeded).

This is the proof run the F28 pending-run marker was waiting on: fast-forward-merged its commit onto
this branch, then deleted both the marker this lane added AND a pre-existing stale one
(`2026-09-21-m6b.md`, lane M6b's own "delete this file the moment that artifact lands" note, which this
run's `gate-a-rescan-run-001.json` also satisfies) -- F28 now passes GREEN with zero pending files
remaining for this family.

## Final gate outputs (post real-dispatch, post F28 cleanup)

- `node .discipline/fitness/runner.mjs`: 49 functions checked, 0 violations.
- `node --test .discipline/fitness/functions/F28-harness-run-integrity.test.mjs`: 32 tests, 32 pass,
  including "F28 passes GREEN against the live tree."
- Wiring preflight (`DISCIPLINE_HOOK_TRAMPOLINE=1 sh .discipline/hooks/pre-push`): all 4 steps green
  (memory gate, canonical test suite, invariant-coverage meta-gate, skill-gate wiring, fitness runner,
  npm-dependent suites, behavioral goldens, `tsc --noEmit`).

## Open items

- The run's own PR could not auto-open (repository setting refuses PR creation from that automation
  account/token in this context) -- its branch `gate-a-rescan/36221025936` is pushed and diffable, but
  nobody opened a PR for it; either open one by hand or let a future coordinator pass do it. Not this
  lane's write set to change the repository setting itself.
- `docs/decisions/`: no ADR names `item_gate_a_state`, `readAllByIds`, or `pipefail`; nothing to
  reconcile.
