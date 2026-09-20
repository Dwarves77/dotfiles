# Lane M4, Amendment 1 (coordinator, 2026-09-20). Read after `brief-m4.md`; where they disagree this file wins.

A new file, not an edit of `brief-m4.md`: F51 check 5 does not exempt `docs/dispatches/lane-briefs/` [CONFIRMED by reading `F51-no-shared-append.mjs` lines 388 to 465], so a brief file is never edited a third time.

## A. The contract you read first

`brief-m-common.md` does not exist on this machine's tree under that name: read `docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md`; its Amendment 1 (the post-6.8 regime) wins over its body. Consequences for this brief's text: "the brief-apply harness family in CONVENTION.md" is now `fsi-app/scripts/harness-runs/brief-apply/FAMILY.md` and `family.json`; your session-log entry is the file `docs/ops/session-log.d/<date>-m4.md`; no re-pin, no re-seed, no list edits.

## B. Step 0: the skill gate (lane G1, #754)

Your FIRST tool call is the Skill tool, `fsi-app:environmental-policy-and-innovation` (if unknown, `environmental-policy-and-innovation`). `fsi-app/scripts/turns/` and `fsi-app/src/lib/intake/` are governed paths and the gate judges your own transcript. A denial after a successful load: STOP with the deny text.

## C. The export run writes a harness artifact, with the loop id (premise corrected)

[CONFIRMED by grep of `brief-export.yml` on master `cc038a47`] the export workflow writes NO harness artifact today (no `writeRunArtifact` call anywhere in its path), and the loop manifest files its hop under family `brief-apply` "for now". Plan 6.2 requires "an artifact at every hop carrying that run id and `trigger: workflow_run`" and names brief-export. So:

1. New family `brief-export`, registered by descriptor only: `fsi-app/scripts/harness-runs/brief-export/family.json` (fields: family, registered, registered_by, governing_files, rationale; governing files: `../.github/workflows/brief-export.yml` and the export driver you touch) plus `FAMILY.md` plus `pending/<date>-m4.md`. No edit to any derived list.
2. One emitter, `fsi-app/scripts/turns/emit-brief-export-artifact.mjs`, modelled on `emit-downstream-chain-artifact.mjs` (read it; reuse `writeRunArtifact`, `claimRunId`, `hashHarnessVersion`; no copy of the writer). `config`: mode, selection, limit, `upstream_name`, `upstream_run_id`, `loop_run_id`, `batch_path`, `branch`. `per_item`: one row per exported id. It writes on every firing, including a no-op ("record it every batch, even when zero").
3. `config.loop_run_id` comes from `resolveLoopRunIdFromUpstream` in `fsi-app/scripts/lib/loop-run-id.mjs` (lane M3b), with `upstreamName: "Population turn"`. If that export is not on your base, STOP: M3b has not merged. Do not write a second name map.
4. The batch skeleton's file name uses the resolved loop id when non-null, else `run-<github run id>`; never an invented id.
5. Loop manifest: the hop `population-turn-to-brief-export` moves to `family: 'brief-export'`, `enforceEdge: true`; its `note` rewritten to the present. `enforceFired` stays false (the coordinator flips it after the proof run). Extend the six-hop attack chain in `loop-run-id.test.mjs` with brief-export.

## D. One thing to verify before you build on it, else STOP

`brief-export.yml` line 200 runs `node scripts/tmp/select-record-stub-ids.mjs`; `fsi-app/scripts/tmp/` is gitignored scratch by standing rule 5. Read how that file comes to exist in the runner (written by a prior step, or tracked despite the ignore). If the workflow depends on an untracked file, that is a defect in a governing path: report it with the evidence and STOP on item 2 of the brief body; do not move or rewrite it on your own.

## E. Standing constraints restated (handoff 2026-09-18, 1C)

Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. Never `git stash`, `git add -A`, `--no-verify`. SELECT-only against the database; never an expression over a large text column (the "briefs owed" line must come from stored columns or an indexed aggregate: if a stub `full_brief` can only be recognised by measuring the text, STOP and say which column would need to exist). No production apply on push or merge (handoff rule 4): the `push` trigger runs `dry` only, and your golden attacks exactly that.

## F. Report

As `brief-common-local.md` says, returned as TEXT with the PR body, the push gate run once, last, as one background task. You commit; you do not push.
