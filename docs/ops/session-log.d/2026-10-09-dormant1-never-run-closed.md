# 2026-10-09 lane DORMANT-1 (dormant1-never-run-closed): the NEVER_RUN_DORMANT list is empty; what is still owed is stated below

Operator, 2026-10-09: "We do not do workarounds we fix the problem fix it." The 18 entries in `NEVER_RUN_DORMANT` (GATE-8 added 3, PR 1041 added 14, DAUDIT-2 added 1) were an exemption for workflows nobody had run.

## Accomplished (confirmed)

- `fsi-app/.discipline/governance/closure-gate.mjs`: `NEVER_RUN_DORMANT` is `Object.freeze({})` with a comment that an entry is a defect. `checkNeverRun` takes the newer of the ledger's newest row and a live run (`liveRunAt`) as the evidence. New exports: `liveRunEvidence` (pure: a run that executed counts, a skipped, cancelled or queued one does not) and `fetchLiveRun` (`gh api repos/<repo>/actions/workflows/<file>/runs?per_page=1`, only when `GITHUB_TOKEN` is present, any API failure is no evidence). `gatherNeverRunTargets` asks the API only for a workflow the ledger cannot date inside the window.
- `HARNESS_FAMILY_BY_WORKFLOW` is now exported and carries nine workflows that already record a family and already had ledger rows but were not in the map (so the gate could not see them): brief-apply, brief-export, fetch-drain, gate-a-rescan, needs-search, question-answers, research-assessment, research-walker, theme-briefs. `corpus-turn.yml` was mapped to `forward-events` (no ledger row); it lands `corpus-turn` rows, so it is mapped to that.
- `closure-gate.test.mjs`: 7 tests added. Red on the old code (`git stash` of the module): 7 failed, 50 passed. Green on the new code: all 7 pass; the 4 failures left are the live-tree tests, for the reason in "NOT done".

## Per-workflow table (the 18 formerly exempt)

| Workflow | Records a harness family? | Evidence now | Dispatch needed |
|---|---|---|---|
| brief-apply | yes (brief-apply) | ledger rows, newest 2026-10-07 (gh run 37609680004) | none |
| brief-export | yes | ledger rows, newest 2026-10-07 (37613719629) | none |
| corpus-turn | yes (corpus-turn) | ledger rows, newest 2026-10-07 (37613594069) | none |
| fetch-drain | yes | ledger rows, newest 2026-10-07 (37613485508) | none |
| gate-a-rescan | yes | ledger rows, newest 2026-10-07 (37613719684) | none |
| needs-search | yes | ledger row 2026-10-08 (37710098281) | none |
| question-answers | yes | ledger row 2026-10-07 (37587202314) | none |
| research-assessment | yes | ledger rows, newest 2026-10-07 (37587205996) | none |
| research-walker | yes | ledger rows, newest 2026-10-07 (37609688488) | none |
| theme-briefs | yes | ledger row 2026-10-07 (37587198862) | none |
| chain-proof | family registered, step present, but the job holds no production write credential so nothing lands in `harness_runs` | live run 37786107972 (2026-10-08, conclusion failure; a failed run is a run) | recording needs a decision, below |
| data-audit-lane | no | live run 2026-08-11 (58 days, inside the 90 day window until 2026-11-09) | none now |
| date-chain | no (its own comment: "emits no harness-run artifact") | live run 37587214784 2026-10-07 | none |
| layout-baseline-renewal | no | live run 37781121359 2026-10-08 | none |
| uptime-probes | no | live run 37610904324 2026-10-07 | none |
| design-audit | no | live run 37872901746 2026-10-09 (pull_request) | none |
| source-monitoring | no | newest live run 2026-06-28, 101 days, OUTSIDE the window | dispatch (`job=check-sources`, `mode=dry`), BLOCKED: workflow is `disabled_manually` |
| spot-check-monthly | no | newest live run 2026-06-01 (conclusion failure), 128 days, OUTSIDE the window | dispatch (no inputs), BLOCKED: workflow is `disabled_manually` |

Dispatch attempts, both `gh workflow run <file> --ref master`: HTTP 422 "Cannot trigger a 'workflow_dispatch' on a disabled workflow" (source-monitoring 267499648, spot-check-monthly 271738975). `data-audit-lane` (294408642) is also `disabled_manually`. No run was created.

## Read and reused

`closure-gate.mjs` (NEVER-RUN section, `gatherNeverRunTargets`, `HARNESS_FAMILY_BY_WORKFLOW`), `closure-gate.test.mjs`, `scripts/lib/run-artifact.mjs` `newestLedgerRunAt`, `harness-ledger-export.json` (201 rows, 22 families), `scripts/harness-runs/CONVENTION.md` and `family-registry.mjs` (a family is a directory with a `family.json`), `scripts/turns/deliver-artifact-branch.sh` and `record-harness-run.mjs` (how a run lands), the 18 workflow files' `on:` blocks and landing steps. Reused: the ledger export and its reader, the existing family rows, the existing gate core (extended, no second gate), `gh api` as the live source.

## Decisions

- A run found live counts only if it executed (completed with a conclusion other than skipped or cancelled, or in progress). A failed run is a run.
- The live lookup is a refinement of the ledger, not a replacement: a target the ledger dates inside the window costs no API call.
- Nine workflows were not "never run": they were run and recorded, and the gate could not see the rows. That was a map defect, not a dispatch gap.

## NOT done (each needs a grant, nothing was touched outside the write set)

1. NEEDS WRITE-SET EXPANSION `.github/workflows/discipline.yml`: the "closure gate" step needs `env: GITHUB_TOKEN: ${{ github.token }}` and the job needs `permissions: actions: read` for `fetchLiveRun` to work in CI. Without it the gate in CI sees only the export, and seven workflows with no ledger family (data-audit-lane, date-chain, layout-baseline-renewal, uptime-probes, design-audit, source-monitoring, spot-check-monthly) plus chain-proof fail the gate. Locally with `GITHUB_TOKEN=$(gh auth token)` the live NEVER-RUN test fails on exactly two: source-monitoring and spot-check-monthly (out of window).
2. Two workflows cannot be dispatched because an operator disabled them in the repository (`gh workflow list --all`: Source monitoring, Spot-check monthly recurring, Data-audit lane are `disabled_manually`). Enabling is a repository setting change and was not done. Decision owed: enable, dispatch once (both exit at the kill switch: the spot-check route returns 503 at `pausedResponse` before any Haiku call while `scrape_cadence='off'`), and leave enabled or disable again. The live run then holds 90 days.
3. Recording steps: eight workflows execute without landing a `harness_runs` row (the table above, "no"). A recording step needs a registered family (`scripts/harness-runs/<family>/family.json`) and an artifact emitter, both outside the write set; chain-proof additionally cannot land because its job holds no production write credential. Not added. Until it is, their evidence is the live Actions run, not the ledger.
4. The ledger export refresh is the executor's. No run id of this lane exists to export (no dispatch succeeded).
5. chain-proof's newest run (37786107972) concluded failure; not investigated (not this lane's write set).
