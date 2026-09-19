# Lane M4: the brief chain wired at mint (plan section 6.1, row M4)

Read `brief-m-common.md` first. Worktree and branch: named in your dispatch message (cut from master AFTER
lane M3 has merged). Lane id `m4`.

## Why

`docs/audits/stage-audit-2026-09-18/s3-evaluate.md` rows 1 and 14 and README hop "Mint to brief chain":
mint leaves a stub `full_brief` at record grade and nothing upgrades it; `brief-export.yml` and
`brief-apply.yml` are `workflow_dispatch` only, with authoring lanes (people and sub-agents) between them.
W9's goal was "wired at mint". The authoring step stays human-driven by design (no LLM in runtimes; briefs
are authored by session lanes); everything around it must fire by itself, and a stub must never be silent.

## What lands

1. Read in full: `brief-export.yml`, `brief-apply.yml`, `scripts/turns/record-briefs/` (README, schema.mjs,
   the export and apply drivers), `scripts/maintenance/population-report.mjs`, the brief-apply harness family
   in CONVENTION.md, `docs/plans/brief-chain-build-plan-2026-09-11.md` Part 3 (runtime execution) and Part 7,
   `docs/ops/HANDOFF-2026-09-11.md` rule 4 ("Do not build a workflow that applies to production on
   push/merge with no human dispatch"), and `loop-manifest.mjs`.
2. `brief-export.yml` gains `workflow_run: workflows: ["Population turn"], types: [completed]`: on upstream
   success it exports the run's minted ids (read from the newest mint artifact's per_item list, or from
   `upstream_run_id`; say which the artifact supports) and commits the export as a batch skeleton
   `scripts/turns/record-briefs/batches/record-briefs-<loop_run_id>.json` with every entry marked
   `status: "owed"` on a branch `brief-lane/<loop_run_id>` (the branch is where an authoring lane starts).
   Dispatch with `ids` and `limit` stays. Exports the upstream run id into the runner env.
3. `brief-apply.yml` gains a `push` trigger with a path filter on `scripts/turns/record-briefs/batches/**`
   on `master` that runs mode `dry` for the batch files changed by the push (and only those), writing the
   dry artifact; mode `apply` stays `workflow_dispatch` only, with the IO budget and the overwrite flag as
   today (handoff rule 4). A step exports `GITHUB_EVENT_WORKFLOW_RUN_ID` where applicable.
4. "Briefs owed" in the population report: one line per item type, `record-grade items with a stub
   full_brief`, by age bucket (under 7 days, 7 to 30, over 30), read from the columns the report already
   selects (if it needs a new SELECT, keep it aggregate and indexed; never a text-length scan). The line is
   also written into the mint artifact's outcome by the population flywheel (M3's shared enrichment path
   reports it) so a mint run itself says how many briefs it owes.
5. Loop manifest: set `enforceEdge: true` on `population-turn-to-brief-export`; F50 green; quote the hops
   line before and after.
6. Golden (attack form) on the two ymls' triggers and the path filter; unit tests on the export skeleton
   builder and the owed-line aggregation (fake client). Record-briefs README section "The chain, automatic
   and human halves"; session-log entry.

## Acceptance (section 0)

Reachable: the `workflow_run` and `push` edges (quote). Run: the proof run yields a brief-export artifact
from `workflow_run`; a batch merge yields a dry artifact from `push`. Populated: the owed line goes down when
a batch applies (the coordinator's apply). Visible: the population report line. Gated: F50, your golden and
tests. Documented: the README section.

## Stop conditions

The mint artifact carries no per-item id list the export can read; the batch skeleton shape is not
representable with the existing validator (say which field); the path-filtered push trigger would run apply
under any input (it must not).
