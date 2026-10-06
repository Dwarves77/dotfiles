# 2026-10-05 lane s1e-source-chain (S1-E): source resolution and tier recompute run as links in the chain

## Accomplished
- New workflow `.github/workflows/source-resolution.yml` ("Source resolution"). Triggers: `workflow_dispatch` (inputs `mode`, `chain_upstream_name`, `chain_upstream_run_id`) and `workflow_run` on `["Brief apply", "Research walker"]`. Job gate as fetch-drain (dispatch, or upstream conclusion `success`). Steps: chained dry guard, resolve params, install, `resolve-provisional-sources` then `recompute-tiers` through the shared `maintenance-step` action, cache flush after a real apply, artifact emit, landing into `harness_runs`, step-summary upload. Chain depth 1 (both producers are roots), stated in the header, so no F60 fallback.
- New harness family `source-resolution` (family.json, FAMILY.md, pending marker); governing files are the workflow and `scripts/turns/emit-source-resolution-artifact.mjs`. Meta-harness pending marker for the new descriptor.
- `emit-source-resolution-artifact.mjs` (+ test, 10 tests): per step counts (resolve: sources resolved, promoted, rejected, worklisted, verdict-placed, bias tags, rows applied; recompute: scanned, movements, promotions, demotions, override held, held by cadence, applied), trigger and github run id (stamped by `writeRunArtifact`), upstream name and run id. A count a step did not print is null.
- Loop hops `12-brief-apply-to-source-resolution.json` and `13-research-walker-to-source-resolution.json` (`enforceEdge` true, `enforceFired` false). Notes on hops 05 and 06 now say tier-opinions and recompute-tiers run as steps inside Downstream chain.
- `PRODUCER_FAMILY_BY_WORKFLOW_FILE` gained `research-walker.yml`, so a `source-resolution` row can be placed on hop 13 (two hops share one consumer family, placement is by the producer run named in `upstream_run_id`). `closure-gate.mjs` `HARNESS_FAMILY_BY_WORKFLOW` gained `source-resolution.yml` so the NEVER-RUN clock can see its dispatch evidence.
- Runbook step file `docs/runbooks/maintenance.d/61-source-resolution.md` (60 was L4-B's).

## Read and reused
- Read in full: `CLAUDE.md`, `lane-common-contract.md`, the code register (Q1, Q2, Q3, Q7), `fetch-drain.yml`, `downstream-chain.yml`, `brief-apply.yml`, `research-walker.yml`, `maintenance-step/action.yml`, `loop-manifest.mjs` and test, hops 01 to 11, `chained-dry-guard.mjs`, `loop-run-id.mjs`, `run-artifact.mjs`, `record-harness-run.mjs`, `deliver-artifact-branch.sh`, `emit-downstream-chain-artifact.mjs` and test, `recompute-tiers.mjs`, `resolve-provisional-sources.mjs` `main()`, `lib/cli.mjs`, `CONVENTION.md`, `family-registry.mjs`, F50, F51 check 1, F52 header, F61, `workflow-run-depth.mjs`, `yml-read.mjs`, `closure-gate.mjs` NEVER-RUN, runbooks 46 and 60, `trust-recompute.yml`, the recompute-trust route and logic.
- Reused, not rebuilt: the `maintenance-step` composite action (unedited), `readStepSummary` (imported from the downstream-chain emitter), `buildRunArtifactEnvelope`, `resolveHarnessRunContext`, `writeRunArtifact` trigger and run id stamping, `record-harness-run.mjs`, `deliver-artifact-branch.sh`, the chained dry guard, `mapRowsToHops`.
- ADRs: none named a threshold or token this lane changed.

## Decisions (by rule, none waiting on a human)
- Gate is the upstream conclusion `success` only (fetch-drain's), not an upstream-artifact read as downstream-chain does: both steps are whole-registry and idempotent, so there is no per-run count to gate on, and Research walker is dry-only today.
- Step two (`recompute-tiers`) stops if step one fails (default step semantics, same as downstream-chain); the artifact records the unrun step as `skipped`.
- Registries edited: `loop-manifest.mjs` (the producer table only, a derived-read table, not a hand hop entry, so F51 check 1 does not apply) and `closure-gate.mjs` (the family map only). Not edited: secrets registry (only secrets already registered), `shared-dataset-ownership.md` (no new writer: the steps are already-registered scripts, the emitter writes a file), NEVER-RUN allowlist (the new workflow is inside the grace window).
- `loop-run-id.mjs` `FAMILY_BY_WORKFLOW_NAME` has no "Research walker" key, so `config.loop_run_id` is null for a firing off Research walker. Outside the write set; recorded, not changed.

## Trust recompute: workflow vs recompute-tiers.mjs (decision-ready, nothing changed)
Facts from reading `trust-recompute.yml`, `recompute-trust/route.ts`, `logic.ts`, `recompute-tiers.mjs`.

| Aspect | `trust-recompute.yml` (POST `/api/admin/recompute-trust`) | `recompute-tiers.mjs` |
|---|---|---|
| Trust scores (`trust_score_overall`, accuracy, timeliness, reliability, citation, computed_at) | Yes, every non-paused source, plus distribution and per-tier averages in the response | No |
| Tier movement (planner and applier from `trust.ts`) | Yes, same calculator, applies | Yes, same calculator |
| Cadence hold | Yes (`getScrapeState`, fails closed to off) | Yes (`readCadence`, reads off) |
| Global processing pause (`isGloballyPaused`) | Checked, skips the whole run | Not checked (no reference in the file) |
| Dry mode | None, always applies | Dry by default, `--mode apply` to write |
| Write path | Direct `supabase.update/insert` through the service client, `tier_override IS NULL` guard | `db.mjs` guarded helpers with prior-row snapshots, same override guard |
| Needs a deployed app | Yes (curl to `APP_URL`, `WORKER_SECRET`) | No |
| Chained dry guard | No (dispatch only) | Inherited where chained (downstream-chain, source-resolution) |
| Harness family and artifact | None, nothing lands in `harness_runs` | Yes, in maintenance, downstream-chain and source-resolution |
| Summary output | HTTP response in the Actions log | `summary.json`, read into the artifact |

Both write `effective_tier` from the same planner, so a run of each over unchanged inputs is idempotent; the only thing the workflow does that the script does not is the trust-score pass and the global pause check.

Options:
1. Retire `trust-recompute.yml`. Cost: the trust-score pass then has no runtime (the route stays for admin use). Small follow-on build to keep it: a `recompute-trust-scores` maintenance step wrapping the score loop (it is a pure function of the source row, `computeTrustScore` and `computeOverallScore`), plus a global-pause read in `recompute-tiers.mjs`. Removes the duplicate tier writer and the one unrecorded runtime.
2. Give the workflow a family and an artifact. Cost: a new family (descriptor, FAMILY.md, pending marker, meta-harness marker), an emitter that parses the HTTP response (`updated`, `failed`, `distribution`, `tier_movement`), a record and landing step, and a decision on whether it chains. Keeps one duplicate tier writer alive and a second runtime that bypasses the guarded write path and snapshots.

Coordinator rules; nothing here waits on the human.

## F28 families marked
- `source-resolution` (new): `scripts/harness-runs/source-resolution/pending/2026-10-05-s1e.md`.
- `meta-harness` (new descriptor changes its derived governing files): `scripts/harness-runs/meta-harness/pending/2026-10-05-s1e.md`.
- No other family's governing file was edited (`maintenance-step/action.yml`, `downstream-chain.yml`, `brief-apply.yml`, `research-walker.mjs` untouched).

## Red then green
- `emit-source-resolution-artifact.test.mjs`: red (module not found) before the emitter existed, 10 of 10 green after. Includes an end-to-end fixture run that writes the artifact, checks trigger `workflow_run_forced_dry`, both steps' counts, upstream and github run ids, passes `validateRunArtifact`, and lands through `recordHarnessRun` with a fake client.
- `loop-manifest.test.mjs`: four new tests red (hops absent, producer table missing research-walker, notes without recompute-tiers) before the hop files and table entry, 17 of 17 green after.
- F50 (hops not yet enforced 9 to 11, no violations), F52, F60 (depth 1 for both new hops, no violations), F61, F28 run directly on the worktree: 0 violations each. F52's actionlint half is skipped locally (not on PATH), CI runs it.

## NOT done / open
- No live dispatch, no DB read, no data written (build mode, operator ruling 2026-10-04). `source-resolution.yml` shows NEVER-RUN-eligible until first dispatched; the coordinator fires it once (dry): `gh workflow run source-resolution.yml -f mode=dry`.
- `enforceFired` for hops 12 and 13 stays false until a chained row lands in `loop-fired-evidence.json`.
- The chained firing off Brief apply or Research walker was not exercised on a real event (no network); the dispatch path is the R14 proof.
- Trust-recompute duplication is recorded above for the coordinator's ruling.
- Index lines owed (coordinator, not edited here): `docs/INDEX.md` for `docs/runbooks/maintenance.d/61-source-resolution.md`, and the `MAINTENANCE-RUNBOOK.md` index entry for section 61.

## Coordinator rulings (after PR 948 opened)
- `fsi-app/scripts/lib/loop-run-id.mjs`: added `"Research walker": "research-walker"` to `FAMILY_BY_WORKFLOW_NAME` (write-set expansion granted). Proof: `loop-run-id.test.mjs` "every LOOP_HOPS producer name is a mapped key" was red in CI (17 pass, 1 fail locally), green after. No family lists `loop-run-id.mjs` as a governing file (grep of every family.json), so no pending marker. A firing off Research walker now resolves `config.loop_run_id` instead of null.
- Trust recompute: Ruled 2026-10-05: Option 1; execution by a later lane: a recompute-trust-scores maintenance step reusing the route's trust-score logic through guarded writes, a pause read in recompute-tiers, then delete trust-recompute.yml and its closure-gate entry.
