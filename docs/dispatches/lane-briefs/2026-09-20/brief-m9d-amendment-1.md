# Lane M9d, Amendment 1 (coordinator, 2026-09-20). Read after `brief-m9d.md`; where they disagree this file wins.

A new file, not an edit of `brief-m9d.md` (F51 check 5 does not exempt `docs/dispatches/lane-briefs/`). Executor: Sonnet (the lane edits a workflow).

## A. The contract you read first

Read `docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md` (there is no `brief-m-common.md` here); its Amendment 1 wins over its body. Lanes M9a and M9b merged long ago; base is `origin/master`. Session-log file: `docs/ops/session-log.d/<date>-m9d.md`.

## B. Premises of the brief, checked on master `cc038a47` (2026-09-20)

- [REFUTED] "`data-producers.yml`": the workflow is `.github/workflows/producers.yml`, `name: Data producers`. It has `contents: write`, `pull-requests: write`, `issues: write` already, and NO commit or PR step today.
- [REFUTED] "`ALLOWED_FAMILIES` lists eleven families ... register in `run-artifact.mjs`, `governing-files.mjs`, `CONVENTION.md`, `PENDING-RUN.md`": all derived or retired since plan 6.8. Items 1 and 4 of the brief become: `fsi-app/scripts/harness-runs/producers/family.json` (family, registered, registered_by, governing_files, rationale) plus `FAMILY.md` (the text the brief wanted in CONVENTION.md) plus `pending/<date>-m9d.md`. Nothing else registers a family. Governing files: `../.github/workflows/producers.yml`, `scripts/producers/market/author-market-series-delta.mjs`, `scripts/producers/regional/run-envelope-producer.mjs`, the emitter and the helper below.
- [REFUTED] "the three market producers and the envelope runner": `producers.yml` runs eleven gated producer steps (three regional through `scripts/producers/regional/run-envelope-producer.mjs`; EU oil bulletin, ecb-fx, eia-v2, refresh-published-price-statistics; DESNZ and EPA under `scripts/gen/`; build-oil-bulletin-rows; ratify-series-items).
- [CONFIRMED] no producer writes a summary: all report by `console.log` only. `assertEdgesAuthored` (`author-market-series-delta.mjs` lines 173 to 181) throws AFTER the write has committed; callers at `ecb-fx-producer.mjs:516`, `eia-v2-petroleum-spot-producer.mjs:412`, `eu-weekly-oil-bulletin.mjs:162`.

## C. The design (replaces items 2 and 3 of the brief)

One artifact per WORKFLOW RUN, written by one emitter, the shape lane M3 gave downstream-chain. Not one `writeRunArtifact` call per producer: eleven call sites would be eleven copies of the same block and eleven run ids per firing.

1. `fsi-app/scripts/producers/lib/producer-summary.mjs`: `writeProducerSummary({ producer, status, rows_changed, edges_authored, reason = null, counts = {} })`. Writes `<PRODUCER_SUMMARY_DIR>/<producer>.json` when that env var is set; a no-op returning null when it is not (a local run is unchanged). Pure path and shape logic unit-tested.
2. Every script that `producers.yml` can run with `--apply` calls it once on its exit path: `status: "ok"` with the counts it already computes, and `status: "failed"` with the reason BEFORE the non-zero exit when `assertEdgesAuthored` throws (M5's assertion itself stays as is; wrap the call site, do not change the function). A producer that has no notion of edges records `edges_authored: null`, never 0.
3. Gate against recurrence (test, attack form): parse `producers.yml`, collect every `node scripts/....mjs` invoked with `--apply`, and assert each file imports `producer-summary.mjs`. Prove it bites with a fixture yml naming a script that does not.
4. `fsi-app/scripts/producers/emit-producers-artifact.mjs`, modelled on `scripts/turns/emit-downstream-chain-artifact.mjs` (read it; reuse `writeRunArtifact`, `claimRunId`, `hashHarnessVersion`): reads the summary dir, writes `producers-run-NNN.json`. `config`: mode, `run_producer` (the selector input), `loop_run_id: null` with the comment that the producers are their own loop head (ADR-031). `per_item`: one row per summary found. The artifact's overall status is failed if any summary is failed. Writes on every firing, zero summaries included.
5. `producers.yml`: set `PRODUCER_SUMMARY_DIR` at job level; after the last producer step, with `if: always()`, run the emitter, then the commit-and-deliver step copied from `downstream-chain.yml` lines 365 to 388 (`fsi-app/scripts/turns/deliver-artifact-branch.sh`). No other change to the workflow: no schedule (rule 16), no new input, step gating untouched.
6. Loop manifest: the hop `data-producers-to-propagation-drain` gets `family` handling only if its entry names a family for the PRODUCER side; read the entry (line 146 on) and the F50 rule before touching it. If F50 needs the producer family recorded somewhere the manifest has no field for, STOP and say what field is missing. `enforceFired` is never yours.

## D. Step 0 and standing constraints

If any file you edit is on a governed path (`fsi-app/.discipline/governance/skill-map.mjs`; today `fsi-app/scripts/turns/` and `fsi-app/src/lib/intake/`), your FIRST tool call is the Skill tool `fsi-app:environmental-policy-and-innovation`. Load it anyway: it costs one call and a mid-lane denial costs a cycle. Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. Never `git stash`, `git add -A`, `--no-verify`. You run NO producer, in any mode: the first real artifact is the coordinator's bounded ecb-fx dispatch.

## E. Report

As `brief-common-local.md` says, returned as TEXT with the PR body; the push gate once, last, as one background task. You commit; you do not push.
