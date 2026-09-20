# Lane M6, Amendment 1 (coordinator, 2026-09-20). Read after `brief-m6.md`; where they disagree this file wins.

A new file, not an edit of `brief-m6.md` (F51 check 5 does not exempt `docs/dispatches/lane-briefs/`).

## A. The contract you read first

Read `docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md` (there is no `brief-m-common.md` here); its Amendment 1 wins over its body. "CONVENTION.md's rule on distinct shapes" now lives per family in `fsi-app/scripts/harness-runs/<family>/FAMILY.md`. Your session-log entry is the file `docs/ops/session-log.d/<date>-m6.md`. Base: `origin/master` AFTER lanes M3b and M4 have merged; if `resolveLoopRunIdFromUpstream` is not exported by `fsi-app/scripts/lib/loop-run-id.mjs` on your base, STOP.

## B. Step 0: the skill gate (lane G1, #754)

Your FIRST tool call is the Skill tool, `fsi-app:environmental-policy-and-innovation` (if unknown, `environmental-policy-and-innovation`). A denial after a successful load: STOP with the deny text.

## C. The gate-a artifact: its own family, with the loop id

Decided, so you do not choose: family `gate-a-rescan`, registered by descriptor only (`family.json`, `FAMILY.md`, `pending/<date>-m6.md`; governing files: `../.github/workflows/gate-a-rescan.yml` and the re-scan script). Its shape differs from brief-apply's (per-item scan verdicts, not brief writes), which is the FAMILY rule's test for a distinct family. One emitter modelled on `emit-downstream-chain-artifact.mjs`, through `writeRunArtifact`; `config.loop_run_id` from `resolveLoopRunIdFromUpstream` with the upstream name the event gives (`Brief apply` or `Population turn`; both are keys of `FAMILY_BY_WORKFLOW_NAME`). The attach-found-sources step's result is a `per_item` section of the SAME artifact, not a second family. Both gate-a hops in the loop manifest: `family: 'gate-a-rescan'`, `enforceEdge: true`, `consumerPending` cleared, `enforceFired` left false. Extend the attack chain in `loop-run-id.test.mjs` with this hop.

## D. The chained run is bounded small; slices are the coordinator's, later

Operator ruling 1 (system before data): before proof run 6.2 passes, a run is a bounded proof of ONE hop, never a pass over the corpus. So: on `workflow_run` the limit is a named constant in the yml, `CHAINED_LIMIT: 50`, and the scope is "items touched by the upstream run first, then version-mismatched items, up to the limit". On `workflow_dispatch` the `limit` input keeps the brief's default 500 and ceiling 2,000, enforced in the script (refuse above the ceiling; pure function, tested), not only in the yml. The same for the chained attach-found-sources step (limit 50).

## E. Item 3 of the brief is SPLIT: you build, you do not wire the failing lane

[CONFIRMED by grep] `run-data-audit-lane.mjs` does not name `quarantine-disposition-audit.mjs` today, and `assertValidDeferral` exists (`fsi-app/scripts/lib/deferral.mjs` line 107). The brief's own text says wiring the verifier fail-closed turns the lane red until 53 items are dispositioned, and dispositioning them is a database write over corpus items: data work, which ruling 1 forbids before 6.2. No allowlist, no report-only mode (a gate that cannot fail is not a gate). Therefore in THIS lane:
- build `fsi-app/scripts/maintenance/apply-deferrals.mjs` exactly as item 3 says (dry then apply, reviewed JSON in, `assertValidDeferral` per row, pure validation unit-tested); you do not run it;
- do NOT add the verifier to the data-audit lane. That one-line wiring plus its red-then-green proof is lane M6b, dispatched by the coordinator in 6.3 straight after the deferrals are applied. Say so in your session-log file under "Owed", naming M6b.

## F. Standing constraints restated (handoff 2026-09-18, 1C)

Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. Never `git stash`, `git add -A`, `--no-verify`. SELECT-only against the database from your session; never an expression over a large text column. No schedule, no cron, no paid call in the workflow. A new workflow file is Sonnet work; read `downstream-chain.yml` for the resolve-step, skip-with-reason and deliver-artifact idioms and reuse them.

## G. Report

As `brief-common-local.md` says, returned as TEXT with the PR body, the push gate run once, last, as one background task. You commit; you do not push.
