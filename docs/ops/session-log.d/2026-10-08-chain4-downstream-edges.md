# Lane CHAIN-4 (chain4-downstream-edges), 2026-10-08

Brief: remaining-build-register items 13 (Question answers and the propagation drain not chained) and 17 (Theme briefs not chained; Research reader selects only the exact-id brief row). The three stale premises in the brief were the coordinator's: the 2026-10-06 register was not re-verified against master before briefing. They were found by reading master, and the coordinator ruled on each (below).

## Accomplished (each confirmed by a test run in this worktree)

- Hops 14, 15, 16 added to `loop-hops.d` (F50 reads the directory, so no registry edit):

| Hop | Producer | Consumer | Family | Depth | Chained action |
|---|---|---|---|---|---|
| 14 propagation-drain-to-question-answers | Propagation drain | Question answers | question-answers | at most 2 (Data producers is depth 0, the drain depth 1; a drain started by Downstream chain's gh workflow run is its own root) | export |
| 15 population-turn-to-question-answers | Population turn | Question answers | question-answers | 3 (source-sweep 0, ledger-consume 1, population-turn 2) | export |
| 16 corpus-turn-to-theme-briefs | Corpus turn | Theme briefs | theme-briefs | 3 (source-sweep 0, ledger-consume 1, corpus-turn 2) | export |

- `question-answers.yml`: `on.workflow_run.workflows: ["Population turn", "Propagation drain"]`. `theme-briefs.yml`: `["Corpus turn"]`. Both: a chained firing has no inputs and no batch file, so `RUN_ACTION` is `export` (read only); push and dispatch keep `apply`. A new "Resolve the chained firing" step exports `GITHUB_EVENT_WORKFLOW_RUN_ID` (the repo convention that `writeRunArtifact` stamps as `upstream_run_id`) and skips on a non-success upstream conclusion; a "Read the upstream loop run id" step (CHAIN-2 shape, `upstream-artifact.mjs loop-id`) exports `QA_LOOP_RUN_ID` / `TB_LOOP_RUN_ID`; a "Record a NO-OP run" step lands a row of the workflow's own family when the chain skipped (rule 17). The chained-dry-guard call is unchanged (F61 passes).
- `propagation-drain.yml` is NOT edited (coordinator ruling A).
- Granted write-set expansions, each red then green:
  - `scripts/lib/loop-run-id.mjs`: `"Propagation drain": "propagation"` in `FAMILY_BY_WORKFLOW_NAME`. Red: the existing "every LOOP_HOPS producer name is a mapped key" test failed on hop 14 as soon as the hop file existed, plus the new direct test. Green after the mapping.
  - `scripts/lib/upstream-artifact.mjs`: `NOOP_FAMILIES` gains `question-answers` and `theme-briefs` (trace is the family's own FAMILY.md; neither has a runbook). Red: the new schema test and the new CLI noop test; green after.
  - `scripts/turns/question-answers/artifact.mjs`, `scripts/turns/theme-briefs/artifact.mjs`: `config.loop_run_id` from `QA_LOOP_RUN_ID` / `TB_LOOP_RUN_ID` (trimmed, null when absent or blank). Before this neither family recorded a loop id at all, even on a root run. Red: both new tests failed (`config.loop_run_id` undefined); green after.
  - `scripts/lib/chain-handoff-wiring.test.mjs`: both workflows join `LOOP_ID_CONSUMERS` (the CHAIN-2 loops, including the executed-under-bash read-step test) and get a CHAIN-4 block: edge list, export-only action, chain gate executed under bash for a failed and a successful upstream, NO-OP step order, F61 markers. 56 of 56 pass; against the master versions of the two workflows 12 of them fail.
  - `scripts/proof/steps/chain-steps.json` and `manifest.test.mjs`: three steps (`question-answers-after-propagation`, `question-answers-after-population`, `theme-briefs-after-corpus`), each modelled on the hop-13 step, run the read only export with the guard and `loop_var`, and assert one `harness_runs` row of its family with `config->>'action' = 'export'` (the manifest adds the upstream-linked and loop-carried assertions itself). The manifest test moves from 13 to 16 hops. Red: three manifest tests failed once hops 14 to 16 existed (hard-coded 13, hops uncovered); green after. `run-chain-steps.test.mjs` and `prepare.test.mjs` do not pin the hop count (66 of 66 pass across `scripts/proof/steps`).
- Research reader (build item 3), `[REFUTED]`: the Research reader already resolves the brief by theme, not by exact brief id. `selectThemeBriefForItem` (`src/lib/research/theme-brief.mjs:92`) calls `resolveBriefForTheme` (`src/lib/connections/brief-staleness.mjs`: exact theme id, then member overlap, then lineage; an overlap or lineage match is always served stale), and `fetchCrossPageForItem` / `fetchThemeChips` (`src/lib/supabase-server.ts:4580` and `:4628`) read every brief plus the latest theme lineage and pass them in. That landed in S3-C (939, 941) and 947. The two exact-id readers that remain are correct as exact-id and untouched: `src/lib/agent/canonical-pipeline.ts:759` (brief generation) and `src/app/api/admin/themes/route.ts` (admin join). Verified by reading the code and by test, not against live rows. Two regression tests added to `src/lib/research/theme-brief.npmtest.mjs` (34 of 34 pass): an exact-id miss still finds the overlap brief on all three reader entry points (the card, the detail view and the list/dashboard chips, which had no overlap coverage before), and a below-threshold or another-live-theme's brief is not borrowed. Red evidence: forcing `resolveBriefForTheme` to exact-only through an in-memory module loader hook (no file edited) fails the new test, plus the two existing drift tests.
- F60 was retired in GATE-3 (RD-86 is exempt; `fitness/lib/workflow-run-depth.mjs` is deleted), so there is no F60 registry to update and the depth column above is computed by hand from the workflow graph. F61 has no list (text based) and F50 reads `loop-hops.d`, so the "F50/F60/F61 registries" needed no edit beyond the three hop files.

## Read and reused

COMMON.md, the brief, `docs/dispatches/lane-common-contract.md`, the CHAIN-1 and CHAIN-2 session logs and the L4-B log, register rows 13 and 17, the chain-fire reports. In full: `question-answers.yml`, `propagation-drain.yml`, `theme-briefs.yml`, `upstream-artifact.mjs`, `chain-handoff-wiring.test.mjs`, `F61`, `brief-staleness.mjs`, `theme-brief.mjs`, the hop files 03, 07, 12 and 13, `loop-manifest.mjs`, `manifest.mjs` (validateManifest). Reused: the CHAIN-1 gate shape, the CHAIN-2 `loop-id` subcommand and read-step shape, `NOOP_FAMILIES` / `buildNoopArtifact`, `FAMILY_BY_WORKFLOW_NAME`, `GITHUB_EVENT_WORKFLOW_RUN_ID` stamping, `mapRowsToHops` + `producerFamilyOf` (hops 14 and 15 share family question-answers and are placed by their producer family: propagation and mint), `resolveBriefForTheme`, the hop-13 proof step. Nothing new was constructed where a mechanism existed.

## Decisions

- No dispatch fallback for hop 14 and no edit to `propagation-drain.yml` (coordinator accepted the deviation from ruling B). Reason, confirmed from the workflow graph: the drain is depth 1 when reached natively, and a drain started by `gh workflow run` is a fresh root, so a native edge off it never exceeds depth 2; a fallback would fire question-answers twice per drain. `[HYPOTHESIS]`, kept in hop 14's note: that a run started by `gh workflow run` counts as a fresh chain root (hop 07's own fallback rests on the same reading); the next chain fire settles it.
- Theme briefs chains off Corpus turn, not Downstream chain: Downstream chain also runs analyze-corpus for its ticket scope, but it is itself depth 3, so an edge off it would be level 4 and silently dropped.
- A chained firing is `export`, never `apply`: an apply needs a committed batch file, which a chain does not have.

## Fixture fire of the new hops (mapRowsToHops over fixture rows)

```
hops loaded: 16
propagation-drain-to-question-answers <- question-answers-run-001 upstream 900
population-turn-to-question-answers <- question-answers-run-002 upstream 800
corpus-turn-to-theme-briefs <- theme-briefs-run-001 upstream 700
unmapped: question-answers-run-003 (no producer row has github_run_id 12345), and a fixture propagation row with a made-up upstream; a plain question-answers dispatch row is ignored
```

The two export drivers also ran against their committed fixture corpora with `--fixture` (no database, no artifact): question-answers exported 2 of 4 open questions, theme-briefs exported 3 of 3 themes needing a brief.

## NOT done / open

- Not proven live: nothing ran in GitHub Actions or against the database (common terms rule 5). Post-merge dry proof for the coordinator's executor: dispatch Source sweep dry, wait for the cascade, then expect a `question-answers` row (trigger `workflow_run_forced_dry`, `upstream_run_id` = the Population turn `github_run_id`), a `theme-briefs` row (upstream = the Corpus turn run), and a `question-answers` row off the Propagation drain (hop 14, which would settle the dispatch-root hypothesis). Each should carry the sweep's `loop_run_id`. `export-loop-fired-evidence.mjs` then maps 16 hops.
- Stale prose left alone (outside the write set): `docs/runbooks/maintenance.d/60-question-answers.md` and `fsi-app/scripts/harness-runs/question-answers/FAMILY.md` still say "not chained"; the PROGRAM-BOARD lines for register items 13 and 17 are the coordinator's.
- Concurrency: both workflows keep `cancel-in-progress: false`; a pending chained export replaced by a newer pending one records no row for the replaced run (GitHub cancels it before it starts).
