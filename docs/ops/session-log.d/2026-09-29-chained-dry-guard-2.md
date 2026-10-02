# 2026-09-29: Lane CHAINED-DRY-GUARD-2

## Task

Coordinator follow-up after the PR #831 proof-chain dispatch (rule 8 lifted for exactly one proof
run). Two findings from the coordinator's independent read of the proof chain:

1. [CONFIRMED, runs 36612225468 and 36612325034] Propagation drain, dispatched by downstream-chain.yml
   via `gh workflow run`, logged `event=workflow_dispatch resolved mode=apply forcedDry=false`. It ran
   dry ONLY because the dispatch input happened to carry `mode=dry`, not because the guard forced it. A
   machine dispatch from inside a chain is not an operator's explicit dispatch (rule 16); the guard must
   treat it as chained. Fix requested: when `event=workflow_dispatch` and the dispatch carries an
   upstream marker (`chain_upstream_run_id`), force dry under build mode exactly like `workflow_run`.
2. [CONFIRMED, run 36610847827 log] No hop landed a `harness_runs` row: `record-harness-run.mjs` hit a
   duplicate primary key on `source-sweep-run-021` and the step passed as best-effort. Owned by lane
   HARNESS-RUN-NUMBER; not touched here per instruction.

## Fix

`scripts/lib/chained-dry-guard.mjs`: `resolveChainedRunMode` gains an optional `chained` parameter.
`isChainFired = eventName === "workflow_run" || (eventName === "workflow_dispatch" && chained === true)`
drives the force-dry decision instead of a bare `eventName === "workflow_run"` check. A plain hand
`workflow_dispatch` (chained defaulting false) is completely unchanged. `parseArgs`/CLI gain
`--chained <true|false>` (loose boolean: only the literal string `"true"` is true, matching how GitHub
Actions expressions render).

`propagation-drain.yml`: the guard-step call now passes
`--chained "${{ inputs.chain_upstream_run_id != '' }}"` (the marker downstream-chain.yml's own F60
explicit-dispatch fallback already sets; `inputs` is empty/undefined on any non-workflow_dispatch event,
so this expression is safe to evaluate on every trigger). Defense-in-depth added at the SECOND point too:
the `workflow_dispatch` branch's `RUN_MODE="${{ inputs.mode }}"` now also checks
`CHAINED_FORCED_DRY` immediately after, so a bug in the CALLER's own dry-forcing (downstream-chain.yml)
cannot silently reach apply here either, not just relying on the guard step having spoken correctly.

No other workflow needed this: propagation-drain.yml is the only file in the repo currently reachable
via a machine-fired `gh workflow run` call from another workflow (downstream-chain.yml's F60 fallback,
lane LOOP-B-FIRING); downstream-chain.yml itself is only ever reached by a genuine `workflow_run` event
or a genuine hand dispatch.

## Tests (touched only, not run against the full pre-push per instruction)

- `node --test fsi-app/scripts/lib/chained-dry-guard.test.mjs`: 19 -> 28 tests (9 new: a plain
  workflow_dispatch is unchanged; the exact coordinator-specified ATTACK case, `chained:true` + apply
  + cadence off resolves dry; a chained dispatch under a live cadence passes its mode through labelled;
  `chained:true` has no effect on a `workflow_run` event; a RED sweep over apply/dry/plan requested
  values under `chained:true` + cadence off; 3 `parseArgs` `--chained` cases).
- `node --test fsi-app/.discipline/fitness/functions/F61-chained-dry-guard-wired.test.mjs`: 8 -> 9 tests
  (1 new: a static content check that `propagation-drain.yml`'s guard call actually wires `--chained`,
  complementing the pure-function proof with a proof the real file carries the fix).
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/propagation-drain.yml'))"`: valid.
- No em-dash/section-sign glyphs in any added line (checked against the house-style gate's own rule).

Full pre-push NOT run; push NOT made. Report says "ready for pre-push," per instruction, pending
release.
