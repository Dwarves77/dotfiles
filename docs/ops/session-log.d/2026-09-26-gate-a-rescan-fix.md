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

## Next step

Push branch `lane/gate-a-rescan-fix`, dispatch `gate-a-rescan.yml` for REAL in `dry` mode on this
branch, watch it to green, append the run id + summary numbers below, open the PR.
