# 2026-09-29: Lane CHAINED-DRY-GUARD

## Task

Coordinator-directed: build the guard that makes build mode safe. Rule 16: build mode (no standing
schedules, every runtime by explicit dispatch) means a workflow_run-chained firing (not an explicit
dispatch) must run DRY. Code only, no dispatch, no push until told.

## Trigger for this lane

Live incident, same session: a hand-dispatched Source sweep (dry) chained into Ledger consume via
workflow_run. Ledger consume's own resolve step hardcodes RUN_MODE (or an equivalent) to "apply" on
every workflow_run firing, with no build-mode check. The coordinator caught the run entering its
chained apply step and cancelled it by hand. That is exactly the gap rule 16 requires closed
mechanically, not by an operator watching every dispatch.

## What was built

- `fsi-app/scripts/lib/chained-dry-guard.mjs`: the shared gate. `resolveChainedRunMode` (pure):
  workflow_dispatch/push pass their own requested mode through unchanged; workflow_run + `system_state
  .scrape_cadence == 'off'` forces `dry`, always, regardless of the requested mode. `readScrapeCadence`
  (impure, zero npm dependency: a raw `fetch` to the Supabase REST endpoint, no `@supabase/supabase-js`
  import, so the gate runs as the FIRST step after checkout, before `npm ci`) fails CLOSED to `"off"`
  on any read error, matching `src/lib/api/pause.ts`'s own fail-closed posture. A CLI wrapper prints
  `CHAINED_MODE`/`CHAINED_FORCED_DRY`/`CHAINED_TRIGGER_LABEL` lines for `>> "$GITHUB_ENV"`.
- Wired into all 8 workflow_run-triggered workflows (`downstream-chain`, `propagation-drain`,
  `population-turn`, `corpus-turn`, `ledger-consume`, `gate-a-rescan`, `brief-export`, `fetch-drain`):
  a new "Chained dry-run guard" step right after checkout, then each file's own hardcoded
  apply-equivalent (`RUN_MODE="apply"`, `mode=apply`, `GAR_MODE=apply`, ledger-consume's chained-apply
  step's `--mode apply`) now checks `$CHAINED_FORCED_DRY` first and downgrades to that family's own dry
  equivalent (`dry` for most, `plan` for ledger-consume). `downstream-chain.yml`'s own explicit
  `gh workflow run propagation-drain.yml` dispatch (lane LOOP-B-FIRING, F60) now passes `-f mode="$RUN_MODE"`
  instead of a hardcoded `apply`, so the depth-limit workaround inherits the same forced-dry decision.
  `brief-export.yml` got the guard step for completeness (every workflow_run-triggered file named in
  the task) but needed no mode-forcing edit: it is read-only by construction (`db.mjs`'s `readClient()`
  proxy throws on any write), so it has no apply path to guard.
- New fitness function `F61-chained-dry-guard-wired`: for every `.github/workflows/*.yml` with a
  `workflow_run:` trigger that can set a mode to `"apply"` (a text-based literal-string proxy, no
  YAML/shell parser dependency, same posture F50/F52/F60 already state for themselves), fails when the
  file does not call `chained-dry-guard.mjs` AND does not read `CHAINED_FORCED_DRY` -- catching both
  "never wired the gate at all" and "wired it but never consulted the answer." 0 violations against the
  real tree after this lane's own fix (the only positive test that matters: it would have caught the
  live incident above before it happened).

## Build-time bug caught and fixed in the same motion (rule 13)

The mechanical insertion (checkout line -> new guard step) initially orphaned every workflow's existing
`with: fetch-depth: 0` block (originally attached to the checkout step, needed for F52's rebase
requirement per #824) onto the new guard step instead, silently dropping `fetch-depth: 0` from checkout
in all 8 files. Caught by re-reading the diffs before committing, not by a test; fixed by moving each
`with:` block back to `actions/checkout@v4` in all 8 files, plus a misplaced trailing comment in
corpus-turn.yml. All 8 re-validated as parseable YAML after the fix.

## Follow-up (same day, coordinator-directed): the trigger enum, closed

The prior cut left one flag open: `CHAINED_TRIGGER_LABEL` existed but nothing threaded it into any
family's `harness_runs` row. Rule 13 (a flag is a commitment): closed in the same lane, same day.

Extended `TRIGGER_VALUES` in `scripts/lib/run-artifact.mjs` with a FIFTH value,
`"workflow_run_forced_dry"` (distinct from `"workflow_run"`): the real GitHub event WAS `workflow_run`,
but `chained-dry-guard.mjs` forced the run's own mode to dry. Threaded through **every** family with
ONE change, not eight: `writeRunArtifact` (the single canonical trigger-stamping site every family's
runner already calls) now checks `process.env.CHAINED_FORCED_DRY === "true"` immediately after its
existing trigger-stamp block and narrows a resolved-or-caller-supplied `"workflow_run"` down to
`"workflow_run_forced_dry"`. Every one of the 8 workflows already exports `CHAINED_FORCED_DRY` into
`$GITHUB_ENV` via the guard step landed earlier today, so every family's next real chained-and-forced
run gets the honest value for free -- no per-family emitter script touched.

F50's `familyFiredStatus` updated to accept `"workflow_run_forced_dry"` as fired-proof too (a build-mode
downgrade to dry is still proof the hop fired from its upstream, not a dispatch). `CONVENTION.md`
documents the fifth value and where it is stamped. Full test coverage: `run-artifact.test.mjs` gained 4
new tests (auto-stamped override, caller-supplied override, non-workflow_run never touched, unset/false
leaves it alone) plus the existing 5-value enum test widened from four; `F50-loop-wiring.test.mjs`
gained one attack test proving the new value counts as fired. 131 tests total across the touched files,
all pass.

## What was NOT done

- No dispatch of anything (hard rule, explicit in both the original task and this follow-up).

## Verification

- `node --test fsi-app/scripts/lib/chained-dry-guard.test.mjs` -- 12/12 pass (pure decision logic
  against every event/cadence combination; dependency-injected fetch for the DB read, no real network).
- `node --test fsi-app/.discipline/fitness/functions/F61-chained-dry-guard-wired.test.mjs` -- 8/8 pass,
  including ATTACK cases (no gate call; gate called but output ignored) and a LIVE zero-violations proof
  against the real committed `.github/workflows/` tree.
- All 8 touched workflow ymls re-validated with `python3 -c "import yaml; yaml.safe_load(...)"` after
  the fetch-depth fix.

Committed locally on `lane/chained-dry-guard`, branched off `origin/master` (post-#825). Not pushed.
