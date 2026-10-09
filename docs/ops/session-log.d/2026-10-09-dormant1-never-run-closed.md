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
| chain-proof | family registered; by design (ADR-045) its job holds no production write credential, so no ledger row | live run 37786107972 (2026-10-08, conclusion failure; a failed run is a run) | none; the gate's live-run evidence is its proof (coordinator ruling) |
| data-audit-lane | now yes (record job) | live run 2026-08-11 (58 days, inside the 90 day window until 2026-11-09); GitHub state `disabled_manually` | none: disabled, dormant by the platform record |
| date-chain | now yes (record job) (its own comment: "emits no harness-run artifact") | live run 37587214784 2026-10-07 | none |
| layout-baseline-renewal | now yes (record job) | live run 37781121359 2026-10-08 | none |
| uptime-probes | now yes (record job) | live run 37610904324 2026-10-07 | none |
| design-audit | now yes (record job) | live run 37872901746 2026-10-09 (pull_request) | none |
| source-monitoring | now yes (record job) | newest live run 2026-06-28, 101 days, OUTSIDE the window; GitHub state `disabled_manually` | none: not enabled (ruling 3), dormant by the platform record |
| spot-check-monthly | now yes (record job) | newest live run 2026-06-01 (conclusion failure), 128 days, OUTSIDE the window; GitHub state `disabled_manually` | none: not enabled (ruling 3), dormant by the platform record |

Dispatch attempts, both `gh workflow run <file> --ref master`: HTTP 422 "Cannot trigger a 'workflow_dispatch' on a disabled workflow" (source-monitoring 267499648, spot-check-monthly 271738975). `data-audit-lane` (294408642) is also `disabled_manually`. No run was created. Coordinator ruling 3 (2026-10-09): do not enable them; build mode holds them off (standing rule 16).

## Read and reused

`closure-gate.mjs` (NEVER-RUN section, `gatherNeverRunTargets`, `HARNESS_FAMILY_BY_WORKFLOW`), `closure-gate.test.mjs`, `scripts/lib/run-artifact.mjs` `newestLedgerRunAt`, `harness-ledger-export.json` (201 rows, 22 families), `scripts/harness-runs/CONVENTION.md` and `family-registry.mjs` (a family is a directory with a `family.json`), `scripts/turns/deliver-artifact-branch.sh` and `record-harness-run.mjs` (how a run lands), the 18 workflow files' `on:` blocks and landing steps. Reused: the ledger export and its reader, the existing family rows, the existing gate core (extended, no second gate), `gh api` as the live source.

## Decisions

- A run found live counts only if it executed (completed with a conclusion other than skipped or cancelled, or in progress). A failed run is a run.
- The live lookup is a refinement of the ledger, not a replacement: a target the ledger dates inside the window costs no API call.
- Nine workflows were not "never run": they were run and recorded, and the gate could not see the rows. That was a map defect, not a dispatch gap.

## Second pass (coordinator grants 2026-10-09)

- Grant 1: `.github/workflows/discipline.yml`, job `test-discipline-engine`: `permissions: contents: read, actions: read`; `GITHUB_TOKEN` and `GITHUB_REPOSITORY` on the closure gate step AND on the "Run discipline test suite" step (closure-gate.test.mjs's LIVE tests are in the suite and make the same live lookup; the first CI run failed there). The shape test (`scripts/proof/chain-proof-workflow.test.mjs`) reads only chain-proof.yml; it was not touched and discipline.yml is outside it, so no test change was needed.
- Grant 3: closure-gate reads GitHub's workflow `state` (`fetchWorkflowState`, `gh api repos/<repo>/actions/workflows/<file>`). A target with no in-window evidence whose state starts with `disabled` is reported as `dormantByPlatform` (printed as a note by the gate, the message names the state) and does not fail; unknown state (no token) and any other state excuse nothing. Six new tests incl. an attack on look-alike states.
- Grant 2: seven workflows now carry a final `record-harness-run` job (`if: always()`, needs every other job, holds the two secrets alone, runs `scripts/lib/emit-workflow-run-artifact.mjs --family F --workflow W.yml --results "<needs results>" --land`): data-audit-lane, date-chain, layout-baseline-renewal, uptime-probes, source-monitoring, spot-check-monthly, design-audit. Seven registered families (`scripts/harness-runs/<family>/family.json`), mapped in `HARNESS_FAMILY_BY_WORKFLOW`. `emit-workflow-run-artifact.mjs` reuses `buildRunArtifactEnvelope`, `writeRunArtifact`, `resolveHarnessRunContext` and `record-harness-run.mjs`'s `runCli`; one script, not seven. `emit-workflow-run-artifact.test.mjs`: 20 tests incl. a per-workflow attack (drop `always()`, drop `--land`, drop the job, add `|| echo`).
- design-audit decision: it is a pull_request job, so its record job runs only on `workflow_dispatch` (a pull request job must not hold the production service credential; fork PRs have no secrets and landing would fail loud). A pull_request firing therefore leaves no row; its evidence is the live run.
- chain-proof: no recording step by design (ADR-045); its proof is the live-run evidence, recorded in the `HARNESS_FAMILY_BY_WORKFLOW` comment. Its fire 4 (run 37786107972) is a known replay stop fixed by MIG-CI; fire 5 is the executor's.
- Verified locally with `GITHUB_TOKEN=$(gh auth token)`: closure-gate tests 69 of 69, family-registry, governing-files, F52 and the new emitter tests green (193 pass, 0 fail across the five files). Without a token the LIVE NEVER-RUN test is red by design (the CI step now supplies one).

## NOT done

- The first record job firing of each of the seven workflows has not happened (they land on the next dispatch; the lane cannot dispatch the disabled ones and does not need to dispatch the others). [WORK: owed] the executor's next ledger export after the first dispatches shows the seven families; the gate does not depend on it because live-run evidence and the platform state cover them meanwhile.
- No run id exists for this lane to export. [NOT-WORK: no dispatch was made; the workflows with in-window evidence need none and the three disabled ones are held off by ruling 3]
- source-monitoring, spot-check-monthly and data-audit-lane stay disabled on GitHub. [NOT-WORK: build mode holds them off, standing rule 16, coordinator ruling 3]
- chain-proof recording into harness_runs. [NOT-WORK: no production write credential by design, ADR-045; live-run evidence is the proof, coordinator ruling 2]
- chain-proof run 37786107972 concluded failure. [NOT-WORK: known replay stop, fixed by MIG-CI; fire 5 is the executor's, coordinator ruling 4]
- design-audit pull_request firings leave no harness_runs row. [NOT-WORK: a pull_request job must not hold the production credential; dispatch firings do land]
