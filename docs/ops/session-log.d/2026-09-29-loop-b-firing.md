# 2026-09-29: Lane LOOP-B-FIRING (coordinator follow-up)

Continues `2026-09-28-loop-b-firing.md`. The coordinator confirmed the prior `[HYPOTHESIS]` against
GitHub's own docs and directed a class fix. This entry covers that follow-up.

## Confirmation

Fetched docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/
events-that-trigger-workflows (workflow_run section), quoted verbatim: "You can't use workflow_run to
chain together more than three levels of workflows. For example, if you attempt to trigger five
workflows (named B to F) to run sequentially after an initial workflow A has run (that is: A -> B ->
C -> D -> E -> F), workflows E and F will not be run." This repo's own chain (source-sweep(0) ->
ledger-consume(1) -> population-turn/corpus-turn(2) -> downstream-chain(3) -> propagation-drain(4))
matches that shape exactly: downstream-chain is "D" (the last level that fires); propagation-drain via
that edge is "E" (never fires when reached by chaining). The prior session's finding is relabeled
`[CONFIRMED]` with this citation, in `docs/ops/session-log.d/2026-09-28-loop-b-firing.md` and in
loop-hops 07's own note.

## Depth computed for every hop in the loop manifest

New pure module `fsi-app/.discipline/fitness/lib/workflow-run-depth.mjs`: `computeWorkflowRunDepths`
(root = 0, a workflow_run-triggered workflow = 1 + the worst-case depth among its own producers),
`hopDepth`, `readWorkflowRunGraph` (reads the real `.github/workflows/*.yml` files), and
`hasExplicitDispatchFallback` (textual scan for `gh workflow run <consumer file>`). Unit-tested
against GitHub's own A-F example verbatim (12 tests) plus this repo's real shape.

Run against the real 11-hop loop manifest: **exactly one hop exceeds depth 3**:
`downstream-chain-to-propagation-drain` (depth 4). Every other hop is at or under the limit:
`sweep-to-fetch-drain` (1), `sweep-to-ledger-consume` (1), `ledger-consume-to-population-turn` (2),
`ledger-consume-to-corpus-turn` (2), `population-turn-to-downstream-chain` (3),
`corpus-turn-to-downstream-chain` (3), `data-producers-to-propagation-drain` (1, "Data producers" is a
chain root, never itself workflow_run-triggered), `population-turn-to-brief-export` (3),
`brief-apply-to-gate-a-rescan` (1, "Brief apply" is a chain root), `population-turn-to-gate-a-rescan`
(3).

## Fix landed (local only; no dispatch, no push)

- `downstream-chain.yml`: `permissions.actions: write` added; new final step "Explicitly dispatch
  propagation-drain.yml (workflow_run chain-depth workaround, F60)" calls `gh workflow run
  propagation-drain.yml --ref ${{ github.ref_name }} -f mode=apply -f batch=500 -f
  chain_upstream_name="Downstream chain" -f chain_upstream_run_id="${{ github.run_id }}"`, gated on
  `success() && github.event_name == 'workflow_run'` (only needed when downstream-chain was itself
  reached by chaining; a hand-dispatched downstream-chain run is already depth 0 and its own native
  `workflow_run` edge into propagation-drain lands at depth 1, fine, no workaround needed there).
- `propagation-drain.yml`: two new paired `workflow_dispatch` inputs, `chain_upstream_name` /
  `chain_upstream_run_id` (internal, never hand-set). The resolve step's `workflow_dispatch` branch
  rebuilds `RUN_TRIGGER_CONTEXT` from them when present, in the same `{name, run_id, conclusion:
  "success"}` shape the native `workflow_run` branch already builds it, so `loop_run_id` resolution
  (`resolveLoopRunIdFromUpstream`, keyed on the upstream NAME) is unaffected either way.
- `run-propagation-drain.mjs`: new `--trigger <workflow_run|workflow_dispatch>` CLI flag carrying the
  REAL `github.event_name` (now always passed by `propagation-drain.yml`), overriding the prior
  presence-of-`triggerContext` inference in `resolveArtifactTrigger`, necessary because the F60
  fallback run's real event is `workflow_dispatch` even though it carries a rebuilt `trigger_context`.
  Backward-compatible: omitting `--trigger` falls back to the old inference (a local hand run with no
  flag still records `trigger: "workflow_dispatch"` when `triggerContext` is null, `"workflow_run"`
  when populated, unchanged).
- New fitness function `F60-workflow-run-chain-depth`: computes every `workflow_run` hop's real depth
  from the live `.github/workflows` graph and fails when a hop past depth 3 has no
  `gh workflow run <consumer>` fallback in its producer's yml. 0 violations against this fix (1 hop
  past the limit, 1 hop with the required fallback present).

`enforceFired` on hop 07 stays `false`: its real GitHub event will always be `workflow_dispatch` on the
fallback path, never `workflow_run`, by construction, so F50's own `trigger:"workflow_run"` artifact
proof is structurally unreachable for this hop; F60's static edge-plus-fallback check is the right
proof for it, not F50's.

## Verification

- `node --test scripts/turns/run-propagation-drain.test.mjs` (27/27, +7 new: `--trigger` CLI parsing
  ×4, `resolveArtifactTrigger` explicit-override ×3).
- `node --test .discipline/fitness/lib/workflow-run-depth.test.mjs` (12/12, new).
- `node --test .discipline/fitness/functions/F60-workflow-run-chain-depth.test.mjs` (3/3, new,
  including a LIVE zero-violations proof against the real committed tree).
- `node --test .discipline/fitness/functions/F50-loop-wiring.test.mjs` (unaffected, still green).
- F28 (harness-run-integrity), F50 (loop-wiring), F60 (workflow-run-chain-depth): all clean.
- Real local dry run against live Supabase (SELECT/RPC-only, R14-compliant), landing
  `propagation-run-011.json` (supersedes `-010`, whose `harness_version` this change moved past):
  `trigger: "workflow_dispatch"`, queue depth 776, 0 writes, unchanged envelope from run-010 (this
  change is code, not data).
- `.github/workflows/{downstream-chain,propagation-drain}.yml` both parse as valid YAML
  (`python3 -c "import yaml; yaml.safe_load(...)"`); `actionlint` not on PATH, skipped per instruction
  ("if actionlint is on the PATH, do not install it").

## Not done / deferred

No workflow dispatched, nothing pushed (hard rule, CI-parity fix still pending). The fix is locally
proven wired (F60 clean) but NOT proven to fire on GitHub; the next real test is a hand-dispatch of
`population-turn.yml` (or a natural chain) once dispatch is authorized, confirming downstream-chain's
new explicit-dispatch step actually fires and a resulting `propagation-run-01X` artifact records
`trigger: "workflow_dispatch"` with a non-null `config.trigger_context` naming "Downstream chain".

Committed locally on `lane/loop-b-firing`. Not pushed.
