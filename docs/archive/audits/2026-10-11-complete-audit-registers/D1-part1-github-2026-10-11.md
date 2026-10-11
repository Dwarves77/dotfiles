# D1 part 1: .github/workflows and .github/actions

Lane audit2-d1-enforcement, FACT lane, read-only, repo head 0d0766347 (master), node v24.15.0, Windows Git Bash, 2026-10-11. Part 1 of 4 (D1-part1 github, D1-part2 engine/registry/hooks/rules/consistency/.claude/lib, D1-part3 fitness, D1-part4 governance). Row schema: the charter's, plus EVER-FAILED-TRUTHFULLY on rows that carry a retained failure run. No fixes, no proposals, no deletions. The global summary (counts, DISAGREES, Unverified, ten rows, prior findings still open, coverage) is at the top of D1-part1.

## Summary (global)

Rows: 491. Counts per STATUS: LIVE 405, HALF-SLICE 6, DEAD 1, UNPROVEN 27, UNWIRED 38, STALE 14. Counts per CLASS: CAPABILITY 14, LEARNING 22, SELF-MAINTENANCE 448, NONE 7.

| part | rows | LIVE | HALF-SLICE | DEAD | UNPROVEN | UNWIRED | STALE | CAPABILITY | LEARNING | SELF-MAINTENANCE | NONE |
|---|---|---|---|---|---|---|---|---|---|---|---|
| part1 .github | 32 | 24 | 2 | 1 | 2 | 1 | 2 | 14 | 5 | 11 | 2 |
| part2 engine/registry/hooks/rules/consistency/.claude/lib | 167 | 151 | 2 | 0 | 9 | 2 | 3 | 0 | 0 | 164 | 3 |
| part3 fitness | 48 | 46 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 47 | 1 |
| part4 governance | 244 | 184 | 1 | 0 | 16 | 35 | 8 | 0 | 17 | 226 | 1 |

Scope measure: non-test, non-JSON, non-fixture lines: .github 9,789; registry + install-hooks 631; fitness 11,366; governance 10,445; rules 1,529; hooks 1,251; consistency 1,054; .claude 609; lib 1,875; dispatch 409; build 73; rendering 26,216. Explicit scope is about 36,700 lines, over 12,000, so the register is split in four parts. UNWIRED counts include the 13 exempt-with-reason invariants and the 22 exempt doctrines (no mechanism by design), the dispatch/ CLIs, source-monitoring.yml and A-layer-c-insert-gate. Class note: every row of this lane is an enforcement or runtime object; a gate protects the product and does not itself make output better, so enforcement rows are SELF-MAINTENANCE; workflow runtimes carry CAPABILITY or LEARNING by their flywheel role.

### Ten rows that matter

1. wf:live-smoke.yml: the post-merge check ran 3 real times since REG-1 (38125333024, 38123761366, 38123212546) and failed all 3 on one step, "Run the read-only live-data audits"; run 38125333024 prints "hard failures/errors: 17 | soft: 1".
2. reg:A-claims-tier, reg:A-flag-age, reg:A-candidate-dwell, reg:A-deferral-hygiene, reg:A-one-tier-per-host, reg:A-quarantine-disposition, reg:A-orphan-source, reg:A-substrate-agreement, reg:A-ledger-onepass, reg:A-section-markers, reg:A-check-vocabulary-drift, reg:A-migration-history, reg:A-ui-orphan: 13 audits print FAIL on production data (claims-tier 812 violations, flag-age 1202 open / 497 past bound, candidate-dwell 3366 past bound unnamed); docs/audits/data-audit-lane-diagnosis-2026-08-11.md records the same audits driven to zero on 2026-08-11.
3. reg:A-layer-c-insert-gate, reg:A-derivation-edges-rls, reg:A-harness-runs-rls, reg:A-spec09-org-rls: 4 audits end in ERROR in the same lane run: missing SUPABASE_DB_URL, "inconsistent types deduced for parameter $1", "SAVEPOINT can only be used in transaction blocks", and a SKIP that the lane counts as ERROR.
4. layerC:block-next-run: audit-gate.ts halts generation while an open data-audit-lane block row exists; the writer (reflectBlockState) is skipped under --read-only and the only non-read-only caller, data-audit-lane.yml, is disabled_manually.
5. gov:closure-gate.mjs and hook:pre-push#step-3h: with no GITHUB_TOKEN the gate exits 1 on this machine (8 workflows NEVER-RUN, including ci.yml); with a token it exits 0; closure-gate.test.mjs fails 4 of 70 locally for the same reason; CI sets the token.
6. fit:F50 and hop:* (16 rows): all 16 hops carry enforceFired false; loop-fired-evidence.json holds 2 entries; the exporter that wrote it was deleted by REG-1; the committed ledger export holds rows that mapRowsToHops places on 12 hops.
7. eng:registry.mjs#runsIn-truth: 5 registry audit rows are labelled runsIn "schema"; ci.yml references none of their scripts (grep -c = 0); they run only against production in live-smoke.
8. wf:chain-proof.yml: 10 runs, 0 successes; the header names RED as the expected state.
9. wf:maintenance.yml#option:acquire-primaries: offered in the dispatch options, guarded by no step; the script and step were deleted.
10. fit:F52 (facet C, formerly F68): the upload-artifact reader returns 0 steps for the "- uses: actions/upload-artifact" form (fixture run), while aud-at4 B8-16b is recorded CLOSED PR 1039.

### DISAGREES with prior audits

- D-1 fit:F52 facet C (F68): aud-at4 B8-16b "[CLOSED: PR 1039]" (as quoted in AUD-SYS-2A:58) vs fixture run: dash form -> 0 steps. [CONFIRMED: node import of evaluateArtifactBudget / extractUploadArtifactSteps]
- D-2 docs/audits/mechanical-checkers-2026-09-30.md "Consistency Layers (C3/C4/C5): Skipped ... require database access to Supabase" vs D1 run of the consistency runner without credentials: "Consistency summary: 3 check(s), 0 drift record(s)". [CONFIRMED]
- D-3 docs/audits/data-audit-lane-diagnosis-2026-08-11.md RESOLUTION "Run #67 was the first fully green run ... Every audit now tells the truth about the corpus" (state then) vs live-smoke 38125333024 (state now): the same audit family prints 13 hard FAILs and 4 ERRORs on production data. [CONFIRMED: log]
- D-4 AUD-SYS-2A / AUD-SYS-2B (2026-10-11 04:xx, pre-REG-1 and pre-PR 1113): 52 fitness / 157 invariants / 8 required contexts / 35 workflows vs tree now 44 fitness rows / 137 invariants / 5 required contexts (inputs, static, schema, app, master) / 28 workflows. [CONFIRMED: runner summary, invariants import, gh api branches/master/protection, ls]
- D-5 AUD-SYS-2B "the two live-DB goldens ... self-SKIP in CI"; tree now: funded-pass-lock-golden.mjs, mutation-lease.golden.mjs and export-loop-fired-evidence.mjs no longer exist under fsi-app/scripts/verify. [CONFIRMED: ls]
- D-6 docs/audits/rulesx1-honest-operations-2026-10-09.md X9 (OUT-OF-REPO-BOUNDARY.md and two others classed docs-only) vs isDocsOnlyPath now false for all three. [CONFIRMED: node import]
- D-7 registry self-description: registry rows say runsIn "schema" for 5 audits that no CI job runs (see Ten rows 7). [CONFIRMED: grep]

### Unverified (HYPOTHESIS or not executed)

- U-1 Prior audits listed above as NOT READ WHOLE (about 700 KB): their findings about this scope are not individually dispositioned here. [HYPOTHESIS: coverage gap of this lane, not a finding about the tree]
- U-2 governance/invariants.d: 65 of 137 files not read beyond id / skill / enforced-or-exempt (text, anchor, residual prose unread). [HYPOTHESIS: no claim made about those texts]
- U-3 fitness/rendering/** (about 26,000 non-test lines) and fixtures/rd-master-022: not read. Rendering tests that fall under fsi-app/.discipline were executed (see test table); the rendering guard itself runs in the CI app job and was not run by D1.
- U-4 Per-run EVER-FAILED for 17 of the 20 CI-run-bearing fitness functions rests on the 18 failureRun ids the registry cites (all read); failures outside those runs and the 7 HTTP-410 / 4 log-not-found runs AUD-SYS-2A names were not re-scanned. [HYPOTHESIS for any "never failed" reading]
- U-5 The 28 hook / workflow rows marked "NEVER in CI (operator machine)" have no retained execution evidence of the hook itself beyond test files; hooks leave no log on success.
- U-6 workflow WHAT / FOR cells come from the whole read of each file and the run history; per-workflow "ever failed" causes (uptime-probes 48, producers 7, population-turn 16, maintenance 14, source-sweep 6, ledger-consume 3, source-monitoring 2) were not read run by run. [HYPOTHESIS]
- U-7 Whether an open data_integrity block row exists in integrity_flags today (Layer C) and every DB figure in .claude/skills/ledger/SKILL.md line 89: no DB access in this lane.
- U-8 The semantic strength of attack tests cited by the 116 registry rows with an attackTest: D1 verified existence, name text (the runner REGISTRY audit), execution (test-discovery --check-unrun) and local pass; it did not mutate any enforcer to see the test fail. [HYPOTHESIS: attack strength]
- U-9 actionlint did not run locally (not on PATH); F52 facet A-H passed, actionlint runs only in CI.
- U-10 F51 check 4 was skipped locally (master is a coordinator branch); it was exercised only through the cited CI run 38108660600.
- U-12 hop mapping: D1 fed mapRowsToHops the ledger-export rows with harness_family = row.family and github_run_id / upstream_run_id read from row.config; the export rows carry no top-level run-id fields, so the 12-of-16 figure is an approximation. [HYPOTHESIS]
- U-11 build/run-build-proof.sh callers and the .claude/commands/*.md usage: not traced.

### Other findings of this lane, no prior audit names them

- [CONFIRMED: node ...closure-gate.mjs without GITHUB_TOKEN] hook:pre-push#step-3h, gov:closure-gate.mjs.
- [CONFIRMED: grep] gov:secrets-registry.mjs lists ANTHROPIC_API_KEY as a permitted workflow secret, no workflow references it (referenced 8, registered 9); its TOPOLOGY names 3 APP_URL consumers, 9 or more reference it.
- [CONFIRMED: node cross-check] wf:maintenance.yml option acquire-primaries has no guard; the comment at maintenance.yml:285 says the review-digests script "may not exist yet", it exists (fsi-app/scripts/review/build-review-digests.mjs).
- [CONFIRMED: node --test] shared-writer-registry.test.mjs is red locally because it reads gitignored files (PF-13).
- [CONFIRMED: ls] gov:coverage-report.json is a tracked, stale, unread file.
- [CONFIRMED: read] F15 LEGACY_ALLOWLIST (5 entries), F36 PRE_EXISTING_ALLOWLIST (14) and producer-consumer-orphan TERMINAL_SINK_ALLOWLIST (2) carry a phase name or no review date; no gate compares them to a clock (closure-gate NEVER_RUN_DORMANT, the one dated list, is empty).

## Execution log (commands D1 ran)

| command | outcome |
|---|---|
| node fsi-app/.discipline/fitness/runner.mjs --firings-out=<scratch> | exit 0; "Fitness summary: 44 function(s) checked, 0 violation(s)"; "Enforcement registry: 124 rows (fitness 44, invariant 38, audit 30, golden 12)"; 85 s |
| node fsi-app/.discipline/runner.mjs --mode=ci --range=HEAD~3..HEAD | exit 0; "Summary: 4 pass, 0 fail, 5 skip (of 9 rules)" |
| node fsi-app/.discipline/consistency/runner.mjs ; consistency/override-check.mjs | exit 0; "3 check(s), 0 drift record(s)"; "consistency runner clean" |
| node fsi-app/.discipline/lib/test-discovery.mjs --check-unrun | exit 0; 1009 checked, all executed |
| node fsi-app/.discipline/governance/invariant-coverage.mjs | exit 0; ALL 137 invariants + 63 doctrines wired |
| node fsi-app/.discipline/governance/closure-gate.mjs (no token) | exit 1; 8 NEVER-RUN (chain-proof, ci, data-audit-lane, date-chain, layout-baseline-renewal, source-monitoring, spot-check-monthly, uptime-probes) |
| GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=Dwarves77/dotfiles node ...closure-gate.mjs | exit 0; PASS with two notes |
| node ...skill-contract-map.mjs --check ; secrets-reference-audit.mjs ; check-pretooluse-wired.mjs ; producer-consumer-orphan.mjs ; skill-map.mjs --list ; memory-gate.mjs --range=HEAD~3..HEAD ; docs-only-range.mjs --range=HEAD~3..HEAD ; job-inputs.mjs --range=HEAD~3..HEAD ; orphan-modules.mjs --all | all exit 0 (docs-only: false; job-inputs: every job runs because ci.yml is in the range) |
| runCoverageScan() import (CLI not run: it writes a tracked file) | governed_files 1317, covered 1274, exempt 43, gaps 0 (committed coverage-report.json says 1250/1204/46) |
| node fsi-app/scripts/verify/run-goldens.mjs (credentials unset) | exit 0; passed 14, failed 0, skipped 0 |
| each of the 30 registry audit-kind scripts with credentials unset (fsi-app/scripts/verify/*.mjs, incl. attacks/rls-persona-matrix.mjs and routes-attacked.mjs) | 2 exit 0 (admin-phrase-scan; audit-finding-status, which prints session-log findings marked "[no disposition]"), 22 exit 2 (self-skip / no credentials), 6 exit 1 (one-tier-per-host, claims-tier, ledger-onepass, substrate-agreement, no-generic-source: uncaught throw on missing env, where siblings exit 2; harness-family-schedule-walker: soft FAIL) |
| node --test over every tracked *.test.mjs / *.npmtest.mjs under .claude, fsi-app/.discipline, .github (credentials unset, no-npm sandbox) | 151 files; failures: fsi-app/.discipline/governance/closure-gate.test.mjs rc=1; fsi-app/.discipline/governance/pretooluse-skill-gate.test.mjs rc=1; fsi-app/.discipline/shared-writer-registry.test.mjs rc=1 |
| gh run list / gh run view / gh api for ci.yml, live-smoke.yml and all 28 workflows | see the workflow rows |

### Test files executed (rc per file; a file absent from this list is covered by the CI run only)

| file | rc |
|---|---|
| .claude/hooks/vault-sync-collision.test.mjs | 0 |
| .claude/hooks/vault-sync.test.mjs | 0 (rerun alone 47s; loop run was 124 = 300 s timeout) |
| fsi-app/.discipline/assistant-spend-gate.test.mjs | 0 |
| fsi-app/.discipline/check-vocabulary.test.mjs | 0 |
| fsi-app/.discipline/consistency/checks/C3-migrations-reality.test.mjs | 0 (rerun alone 146s; loop run was 124 = 300 s timeout) |
| fsi-app/.discipline/consistency/checks/C3-race-shape.test.mjs | 0 |
| fsi-app/.discipline/consistency/checks/C4-worktrees-reality.test.mjs | 0 |
| fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.test.mjs | 0 |
| fsi-app/.discipline/consistency/override-check-cli.test.mjs | 0 |
| fsi-app/.discipline/consistency/override-check.test.mjs | 0 |
| fsi-app/.discipline/dispatch/audit.test.mjs | 0 |
| fsi-app/.discipline/dispatch/start.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F13-single-mint-chokepoint.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F14-producer-consumer-orphan.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F15-spend-chokepoint.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F16-transport-hold-gate.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F18-one-url-canonicalizer.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F19-no-service-anon-downgrade.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F20-pause-flag-one-writer.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F21-single-grounding-entry.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F22-source-role-at-birth.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F23-governed-surface-coverage.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F24-db-object-migration-home.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F25-module-liveness.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F27-producer-seam-proof.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F28-currency-boundaries.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F30-entity-spine.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F31-derived-values-gate.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F32-statutory-purity.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F33-surface-acceptance.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F34-bundle-safe-module-evaluation.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F35-row-ux-coverage.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F36-date-format-timezone-pin.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F39-unbounded-in-filter.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F40-authed-api-fetch.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F41-dead-media-query-class.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F43-default-open-disclosure.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F45-duplicate-code.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F45-origin-base.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F46-external-host-home.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F48-env-file-load-guarded.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F49-parts-not-pages.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F50-loop-wiring.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F51-no-shared-append.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F59-dep-path-resolved.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F6-migrations-numeric-ordering.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F64-rls-admin-gate-class.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F66-clock-fragility.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F67-unguarded-main-invocation.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F69-model-id-literal.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F70-definer-hygiene.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F71-community-boundary.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F8-client-server-tier-boundary.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F9-build-compiles.test.mjs | 0 |
| fsi-app/.discipline/fitness/functions/F9-real-project.test.mjs | 0 |
| fsi-app/.discipline/fitness/lib/libs.test.mjs | 0 |
| fsi-app/.discipline/fitness/lib/selftest-spawn.test.mjs | 0 |
| fsi-app/.discipline/fitness/manifest.test.mjs | 0 |
| fsi-app/.discipline/fitness/runner.test.mjs | 0 |
| fsi-app/.discipline/format-locale-sweep.test.mjs | 0 |
| fsi-app/.discipline/glob-portability.test.mjs | 0 |
| fsi-app/.discipline/governance/agent-transcript.test.mjs | 0 |
| fsi-app/.discipline/governance/check-pretooluse-wired.test.mjs | 0 |
| fsi-app/.discipline/governance/closure-gate-git-dates.test.mjs | 0 |
| fsi-app/.discipline/governance/closure-gate.test.mjs | 1 |
| fsi-app/.discipline/governance/docs-only-range.test.mjs | 0 |
| fsi-app/.discipline/governance/doctrine-contradiction.test.mjs | 0 |
| fsi-app/.discipline/governance/execution-wiring.test.mjs | 0 |
| fsi-app/.discipline/governance/invariant-coverage.test.mjs | 0 |
| fsi-app/.discipline/governance/invariants.test.mjs | 0 |
| fsi-app/.discipline/governance/job-inputs.test.mjs | 0 |
| fsi-app/.discipline/governance/landing-step-no-swallow.test.mjs | 0 |
| fsi-app/.discipline/governance/loop-manifest.test.mjs | 0 |
| fsi-app/.discipline/governance/memory-gate.test.mjs | 0 |
| fsi-app/.discipline/governance/orphan-modules.test.mjs | 0 |
| fsi-app/.discipline/governance/pretooluse-honest-forms.test.mjs | 0 |
| fsi-app/.discipline/governance/pretooluse-skill-gate.test.mjs | 1 |
| fsi-app/.discipline/governance/rename-source-class.test.mjs | 0 |
| fsi-app/.discipline/governance/secrets-reference-audit.test.mjs | 0 |
| fsi-app/.discipline/governance/self-skip-loudness.test.mjs | 0 |
| fsi-app/.discipline/governance/skill-token.test.mjs | 0 |
| fsi-app/.discipline/governance/source-lexer.test.mjs | 0 |
| fsi-app/.discipline/governance/workflow-no-hydrate-guard.test.mjs | 0 |
| fsi-app/.discipline/governance/workflow-pr-concurrency.test.mjs | 0 |
| fsi-app/.discipline/governance/worktree-isolation-hooks.test.mjs | 0 |
| fsi-app/.discipline/governance/worktree-isolation.test.mjs | 0 |
| fsi-app/.discipline/hooks/pre-push-honest-forms.test.mjs | 0 |
| fsi-app/.discipline/hooks/pre-push-step-attacks.test.mjs | 0 |
| fsi-app/.discipline/hooks/pre-push-tmpdir.test.mjs | 0 |
| fsi-app/.discipline/hooks/tree-clean.test.mjs | 0 |
| fsi-app/.discipline/hooks/worktree-node-modules.test.mjs | 0 |
| fsi-app/.discipline/install-hooks.test.mjs | 0 |
| fsi-app/.discipline/lib/baseline.test.mjs | 0 |
| fsi-app/.discipline/lib/change-range.test.mjs | 0 |
| fsi-app/.discipline/lib/context.range.test.mjs | 0 |
| fsi-app/.discipline/lib/context.test.mjs | 0 |
| fsi-app/.discipline/lib/gate-firings.test.mjs | 0 |
| fsi-app/.discipline/lib/no-npm-sandbox.test.mjs | 0 |
| fsi-app/.discipline/lib/read-migration-sql.test.mjs | 0 |
| fsi-app/.discipline/lib/resolve-dep.test.mjs | 0 |
| fsi-app/.discipline/lib/session-context.test.mjs | 0 |
| fsi-app/.discipline/lib/test-discovery.test.mjs | 0 |
| fsi-app/.discipline/notification-preferences-save-path.test.mjs | 0 |
| fsi-app/.discipline/registry.test.mjs | 0 |
| fsi-app/.discipline/relationship-check-literals.test.mjs | 0 |
| fsi-app/.discipline/rendering/action-card-assert.test.mjs | 0 |
| fsi-app/.discipline/rendering/assertions.test.mjs | 0 |
| fsi-app/.discipline/rendering/audit/generated-on.test.mjs | 0 |
| fsi-app/.discipline/rendering/audit/mobile-390-specs.test.mjs | 0 |
| fsi-app/.discipline/rendering/audit/mounts-resolve.test.mjs | 0 |
| fsi-app/.discipline/rendering/audit/normalise.test.mjs | 0 |
| fsi-app/.discipline/rendering/exemptions-375.test.mjs | 0 |
| fsi-app/.discipline/rendering/exemptions-law2-desktop.test.mjs | 0 |
| fsi-app/.discipline/rendering/fixtures-dash/fixtures.test.mjs | 0 |
| fsi-app/.discipline/rendering/hydration-smoke.npmtest.mjs | 0 |
| fsi-app/.discipline/rendering/layout-guard-expiry.test.mjs | 0 |
| fsi-app/.discipline/rendering/layout-guard/layout-guard.npmtest.mjs | 0 |
| fsi-app/.discipline/rendering/live/live-assertions.test.mjs | 0 |
| fsi-app/.discipline/rendering/live/live-candidates.test.mjs | 0 |
| fsi-app/.discipline/rendering/live/live-content.test.mjs | 0 |
| fsi-app/.discipline/rendering/live/live-hydration.test.mjs | 0 |
| fsi-app/.discipline/rendering/live/live-preflight.test.mjs | 0 |
| fsi-app/.discipline/rendering/live/live-smoke-content.test.mjs | 0 |
| fsi-app/.discipline/rendering/overflow-rule.test.mjs | 0 |
| fsi-app/.discipline/rendering/panel21c-accept.test.mjs | 0 |
| fsi-app/.discipline/rendering/rd-80-real-fonts.npmtest.mjs | 0 |
| fsi-app/.discipline/rendering/rd-82-title-words.npmtest.mjs | 0 |
| fsi-app/.discipline/rendering/run-rendering-guard.test.mjs | 0 |
| fsi-app/.discipline/rendering/smoke/guard-assert-containers.test.mjs | 0 |
| fsi-app/.discipline/rendering/smoke/harness.npmtest.mjs | 0 |
| fsi-app/.discipline/rendering/smoke/smoke.test.mjs | 0 |
| fsi-app/.discipline/rendering/ux-assert.test.mjs | 0 |
| fsi-app/.discipline/rules/012-hardcoded-user-path.test.mjs | 0 |
| fsi-app/.discipline/rules/015-row-mutation-guarded-path.test.mjs | 0 |
| fsi-app/.discipline/rules/017-generation-config-no-raw-env.test.mjs | 0 |
| fsi-app/.discipline/rules/018-new-surface-five-model.test.mjs | 0 |
| fsi-app/.discipline/rules/019-source-reclassify-not-archive.test.mjs | 0 |
| fsi-app/.discipline/rules/021-cached-shape-key.test.mjs | 0 |
| fsi-app/.discipline/rules/022-no-dash-glyphs.test.mjs | 0 |
| fsi-app/.discipline/rules/023-source-not-diffed-as-text.test.mjs | 0 |
| fsi-app/.discipline/rules/024-wip-commit-skips-ci.test.mjs | 0 |
| fsi-app/.discipline/rules/fork-log-archived.test.mjs | 0 |
| fsi-app/.discipline/runner-ci-forms.test.mjs | 0 |
| fsi-app/.discipline/runner.test.mjs | 0 |
| fsi-app/.discipline/shared-writer-registry.test.mjs | 1 |
| fsi-app/.discipline/skill-drift-gate.test.mjs | 0 |
| fsi-app/.discipline/skill-slim.test.mjs | 0 |
| fsi-app/.discipline/vocab-drift-guard.test.mjs | 0 |

## Prior findings still open

| ID | prior source | claim | file:line | state now | token |
|---|---|---|---|---|---|
| PF-1 | AUD-SYS-2A:58 / aud-at4 B8-16b | F68 reads zero steps for the "- uses: actions/upload-artifact" form | fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.mjs:737 | STILL-OPEN (now facet C of F52); no workflow uses the dash form today (git grep -n -- "- uses: actions/upload-artifact" -> none) | [CONFIRMED: fixture run] |
| PF-2 | AUD-SYS-2A:47 [WORK: reg1b-one-registry-spine] | ten RD numbers carry two invariant ids | fsi-app/.discipline/governance/invariants.d/ (RD-9, RD-13, RD-14, RD-31, RD-49, RD-67, RD-69, RD-88, RD-89, RD-90) | STILL-OPEN | [CONFIRMED: ls invariants.d \| sed \| uniq -d] |
| PF-3 | AUD-SYS-2A:74; rulesx1 X1 (2026-10-09) | the heavy gates run on pull_request only; a master push runs engine range, memory gate, consistency, HARD detector, optional build; branch protection strict false | .github/workflows/ci.yml:107 (static job), :49 (push trigger); gh api branches/master/protection strict false | STILL-OPEN (the master job is the only push-time job) | [CONFIRMED: gh api; ci.yml job list] |
| PF-4 | AUD-SYS-2A:75 | F28 passes while reporting families with a run owed and families with no ledger row (NOTICE only) | fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.mjs | STILL-OPEN: "families current 14, run owed 9, no ledger row 16" printed on 2026-10-11 | [CONFIRMED: fitness runner output] |
| PF-5 | rulesx1 X13 | F25 expiry oracle is the highest waveN tag in git log subjects (frozen counter); F39 facet A reuses it | fsi-app/.discipline/fitness/functions/F25-module-liveness.mjs:412; F39-unbounded-in-filter.mjs:47,286 | STILL-OPEN | [CONFIRMED: grep + read] |
| PF-6 | AUD-SYS-2A:54 | invariants whose named enforcers were deleted still describe them: RD-12, RD-55, RD-76, RD-79, RD-84, RD-90 | fsi-app/.discipline/governance/invariants.d/RD-12-size-cap-doctrine.mjs etc. (residual text) | STILL-OPEN (rows inv:* marked STALE) | [CONFIRMED: residual text read] |
| PF-7 | AUD-SYS-2A:11 | rules 018 and 023 have no retained real firing | fsi-app/.discipline/rules/018-new-surface-five-model.mjs, 023-source-not-diffed-as-text.mjs | STILL-OPEN (not re-scanned by D1) | [HYPOTHESIS: depends on AUD-SYS-2A scan of 200 runs] |
| PF-8 | AUD-SYS-3 (2026-10-11) | Live smoke red on every master deploy | .github/workflows/live-smoke.yml:144-150 | STILL-OPEN (new cause: the REG-1 audits step) | [CONFIRMED: runs 38125333024, 38123761366, 38123212546] |
| PF-9 | AUD-SYS-2B | artifacts uploaded by 27 workflow files that nothing downloads | .github/workflows/*.yml (upload-artifact) | STILL-OPEN | [CONFIRMED: git grep "download-artifact\|gh run download" -> none in .github, fsi-app/scripts, fsi-app/.discipline] |
| PF-10 | rulesx1 X6 / S7 | memory-gate evidence is a string shape (dated heading plus an Accomplished line of 20+ characters) | fsi-app/.discipline/governance/memory-gate.mjs:87-103 | STILL-OPEN as a string-shape test (S7 grandfathering fixed since: GRANDFATHER_BEFORE 2026-10-09) | [CONFIRMED: read] |
| PF-11 | rulesx1 X12 | C3 migrations-reality race test is slow and fails under load | fsi-app/.discipline/consistency/checks/C3-migrations-reality.test.mjs:177 (timeout 300000) | STILL-OPEN: 146 s alone, 300 s timeout in the loop when other work ran | [CONFIRMED: rerun rc 0 in 146 s; loop rc 124] |
| PF-12 | data-audit-lane-diagnosis-2026-08-11 (b) | audits that crash instead of self-skipping without credentials | fsi-app/scripts/verify/{one-tier-per-host,claims-tier,ledger-onepass,substrate-agreement}-audit.mjs, no-generic-source-audit.mjs | STILL-OPEN in a changed form: 5 audits exit 1 with a stack ("db.mjs: load env ... before use" / "supabaseUrl is required") where siblings exit 2 | [CONFIRMED: ran each with credentials unset] |
| PF-13 | CLAUDE.md rule 15 / doctrine | shared-writer-registry.test.mjs scans the filesystem (readdirSync), so gitignored scratch breaks it locally while CI passes | fsi-app/.discipline/shared-writer-registry.test.mjs:129 | STILL-OPEN as a local-vs-CI divergence; failing files were fsi-app/scripts/tmp/audit2/_c2work/meta.mjs (another lane scratch) and scripts/us-state-code-audit-2026-05-12.mjs (gitignored) | [CONFIRMED: node --test rc 1 with those two names; git check-ignore on the second file] |
| PF-14 | ci.yml 38130505681 | a new verify script with no registry row | fsi-app/scripts/verify/audit-walk.mjs (PR coord/e1b-audit-walk) | OPEN at head 29052e252: registry.test.mjs LIVE test red, a gate working on a real defect | [CONFIRMED: gh run view 38130505681 --log-failed] |
| PF-15 | this audit (new, listed for the register) | hooks/pre-push step 3h and run-test-suite closure tests fail on a machine with no GITHUB_TOKEN | fsi-app/.discipline/hooks/pre-push:501-519 | OPEN | [CONFIRMED: closure-gate.mjs exit 1 without a token] |

### Prior audits: read status

| audit | read |
|---|---|
| docs/audits/whole-build-audit-2026-10-11/aud-sys-2a-enforcement-2026-10-11.md (260 KB) | summary and the fitness/rules/invariant tables parsed by script (prior2a.json), summary lines 1-88 read whole; the 157 invariant row texts NOT read whole |
| docs/audits/whole-build-audit-2026-10-11/aud-sys-2b-enforcement-2026-10-11.md (146 KB) | Summary section (lines 1-67) read whole; Tables A, B, C (workflow jobs, hooks, 96 verify scripts) NOT read row by row |
| docs/audits/whole-build-audit-2026-10-11/aud-sys-3-failure-ledger-2026-10-11.md (117 KB) | lines 1-60 read whole; the 121-row table NOT read |
| docs/audits/goldens-wiring-truth-2026-08-09.md | READ WHOLE |
| docs/audits/blind-ci-window-audit-2026-07-08.md | READ WHOLE (class closed by PR 256: test discovery is by construction; D1 test-discovery --check-unrun -> 1009 checked) |
| docs/audits/mechanical-checkers-2026-09-30.md | READ WHOLE |
| docs/audits/data-audit-lane-diagnosis-2026-08-11.md | READ WHOLE |
| docs/audits/rulesx1-honest-operations-2026-10-09.md | READ WHOLE |
| docs/audits/aud-at3/at4/at5-gates-attacked-2026-10-08.md (80 + 81 + 37 KB), gate-evaluation-2026-10-08.md (78 KB), app-audit-a6-discipline-tests / a6b-discipline-full-2026-09-30.md (31 + 85 KB), full-read-2026-08-31/L15-disc-A.md and L16-disc-B.md (30 + 38 KB), stage-audit-2026-09-18/s6-gates-harness.md (22 KB), verify1-register-unknowns-2026-10-08.md (33 KB), layout-guard-2026-09-08.md (42 KB), rendering-guard-local-vs-ci-2026-09-12.md (15 KB), spend-authority-disarm-case-file, audit-consolidated-2026-09-30.md, app-audit-a4-scripts-workflows-2026-09-30.md, docs/runbooks/audit-catalogue.md sections 3+ | NOT READ WHOLE. Their claims reach this register only through quotation in AUD-SYS-2A/2B and RULES-X-1. A claim marked "aud-at4" above is the AUD-SYS-2A citation of it, not a reading of aud-at4. |

### FIXED-SINCE (prior claim no longer true on this tree)

- RETIRED_INVARIANTS empty with RD-62/RD-86/RD-91 exempt-but-retired (AUD-SYS-2A:76): FIXED-SINCE PR 1114 (RETIRED map of 49 ids in registry.mjs; the three invariant files are gone).
- Invariant removal undetected (INVCOV, AT4): FIXED, auditRemovedInvariants in invariant-coverage.mjs:207.
- 8 required contexts (AUD-SYS-2B): FIXED-SINCE PR 1113 / 1114, now inputs, static, schema, app, master.
- 609 of 643 audit findings unlabelled (mechanical-checkers-2026-09-30): FIXED-SINCE, audit-finding-status --strict in CI -> "858 finding-shaped lines across 170 audit file(s); 0 unlabeled".
- rulesx1 S4 (skill gate vs git merge-tree --write-tree), S7 (memory gate vs old logs), X3 (NEVER_RUN_DORMANT 18 entries -> empty), X9 (docs-only classification of read docs): FIXED-SINCE (GATE-FIX-1, ENGINE-FIX-1, DORMANT-1, CIFIX-2) [CONFIRMED by reading the current code and node import].
- 20 audits never fired in the lane (AUD-SYS-2B): FIXED-SINCE for the registered ones; they fired in live-smoke 38125333024 (candidate-dwell, migration-history, ui-orphan, section-markers, check-vocabulary-drift among them).
- blind-ci-window (2026-07-08): the class (hand test list) is closed; test-discovery --check-unrun -> every tracked test-shaped file is executed.

## Coverage: files read whole, files not

### part1 (.github)

| path | size | read | note |
|---|---|---|---|
| .github/workflows/*.yml (28 files) | 9,789 lines across .github with actions | READ WHOLE (maintenance.yml 1241 lines in 2 pages) | brief-apply, brief-export, chain-proof, change-detection, ci, corpus-turn, data-audit-lane, date-chain, downstream-chain, fetch-drain, gate-a-rescan, layout-baseline-renewal, ledger-consume, live-smoke, maintenance, needs-search, population-turn, producers, propagation-drain, question-answers, research-assessment, research-walker, source-monitoring, source-resolution, source-sweep, spot-check-monthly, theme-briefs, uptime-probes |
| .github/actions/local-stack/action.yml |  | READ WHOLE |  |
| .github/actions/maintenance-step/action.yml |  | READ WHOLE |  |

### part2

| path | read |
|---|---|
| fsi-app/.discipline/registry.mjs (348), runner.mjs, manifest.mjs, install-hooks.mjs, run-test-suite.sh, INSTALL.md, README.md | READ WHOLE (README.md partly: it carries a STALE-CONTENT NOTICE) |
| fsi-app/.discipline/rules/*.mjs (9 rules + tests) | rules READ WHOLE; 9 test files EXECUTED rc=0 |
| fsi-app/.discipline/hooks/ (commit-msg, pre-commit, pre-merge-commit, post-commit, post-checkout, reference-transaction, pre-push 538, lib/*.sh x6) | READ WHOLE |
| fsi-app/.discipline/consistency/ (runner, manifest, override-check, checks C3/C4/C5, lib x2, README) | READ WHOLE |
| fsi-app/.discipline/lib/ (context 714, baseline, change-range, firing-log, gate-firings, mask-source, no-npm-sandbox, read-migration-sql, resolve-dep, result, run-explicit-tests, session-context, test-discovery, fixtures x2) | READ WHOLE (non-test) |
| fsi-app/.discipline/dispatch/ (audit, start, README), build/run-build-proof.sh, fixtures/check-vocabulary | READ WHOLE; fixtures/rd-master-022 NOT read |
| .claude/ (settings.json, hooks x3 + 2 test files, commands x5, skills/ledger/SKILL.md) | READ WHOLE except the two vault-sync test files (executed, not read) |
| fsi-app/.discipline/rendering/** (about 26,000 non-test lines) and lib/ test files | NOT READ IN FULL: not in the brief parenthetical list; their tests were EXECUTED where in the loop (rc listed in testresults) |

### part3

| path | read |
|---|---|
| fitness/runner.mjs, manifest.mjs, README.md, surface-acceptance-register.json | READ WHOLE |
| fitness/lib/*.mjs (9 files) | READ WHOLE |
| fitness/functions/F*.mjs: F2, F6, F8, F9, F10, F13, F14, F15, F16, F18, F19, F20, F21, F22, F23, F24, F25 (1433 lines), F27, F28, F30, F31, F32, F33, F34, F35, F36, F39, F40, F41, F43, F45, F46, F48, F49, F50, F51, F52 (929), F59, F64, F66, F67, F69, F70, F71 (44 files) | READ WHOLE |
| fitness/functions/*.test.mjs (43) and lib tests | EXECUTED (rc in testresults), NOT READ |

### part4

| path | read |
|---|---|
| governance/*.mjs, OUT-OF-REPO-BOUNDARY.md, db-catalog-refresh.sql (37 non-test files) | READ WHOLE (closure-gate 833, pretooluse-skill-gate 1212, doctrine-register 631, invariant-coverage 482, docs-only-range 424, producer-consumer-orphan 352, job-inputs 347, skill-map 327, coverage-scan 303, memory-gate 281, skill-contract-map 266, check-pretooluse-wired 238, loop-manifest 228, exemptions 221, worktree-isolation 196, orphan-modules 190, wire-pretooluse-settings 183, execution-wiring 178, skill-token 157, invariants 157, db-object-reference 155, source-lexer 152, pretooluse-scope 103, doctrine-contradiction 94, worktree-isolation-hook 82, secrets-reference-audit 76, secrets-registry 75, pretooluse-entry 40, agent-transcript 35, pretooluse-user-shim 30, build-mode 22) |
| governance/loop-hops.d/*.json (16) | READ WHOLE |
| governance/invariants.d/README.md and 72 of the 137 invariant files (AC-2 through RD-65-authed-api-fetch, alphabetical order of the directory) | READ WHOLE |
| governance/invariants.d/ remaining 65 files (RD-66-dead-media-query-class through SC-* and SF-*, the numeric RD-67 to RD-98 files) | NOT READ IN FULL: id, skill, enforced/exempt and derived enforcedBy taken by importing invariants.mjs; the text, anchor and residual prose of these 65 files was not read |
| governance/*.test.mjs (about 40 files) | EXECUTED (rc in the test table), NOT READ |
| governance/db-catalog.json, harness-ledger-export.json, loop-fired-evidence.json, coverage-report.json | loaded and queried by script, NOT READ line by line (data files) |

## Part 1 rows (rows 32; STATUS LIVE 24, HALF-SLICE 2, DEAD 1, UNPROVEN 2, UNWIRED 1, STALE 2; CLASS CAPABILITY 14, LEARNING 5, SELF-MAINTENANCE 11, NONE 2)

| ID | WHAT | FOR | CALLED BY | CONSUMED BY | PROVEN BY | LAST REAL RUN | EVER-FAILED-TRUTHFULLY | CLASS | PRIOR | STATUS | TOKEN |
|---|---|---|---|---|---|---|---|---|---|---|---|
| wf:ci.yml | The one CI pipeline: jobs inputs (classifier job-inputs.mjs), static (PR only: engine, memory gate, consistency, audit-finding-status, test suite, test-discovery, invariant-coverage, closure gate, skill-contract, orphan-modules, npm ci, ESLint, fitness runner, actionlint, npmtest, goldens, HARD detector discrimination, DS23/DS24/F9 attacks), schema (local Supabase stack: replay, RLS persona matrix, view/function/route attacks), app (Playwright container: next build, rendering guard, design audit soft), master (push only: engine range, memory gate, consistency, HARD detector, optional build) | NONE named; runtime stage = merge gate for every PR (branch protection requires contexts inputs, static, schema, app, master) | GitHub events pull_request / push master / workflow_dispatch (ci.yml:49) | branch protection master (gh api branches/master/protection: contexts inputs, static, schema, app, master; strict false; enforce_admins true); firing artifacts uploaded ci.yml:395-415 | F52 (workflow validity) + actionlint step ci.yml:285 + the runs themselves; the master job does NOT run the fitness runner, test suite, closure gate or invariant-coverage (they run on pull_request only) | PR 38124942168 success (inputs 18s, static 286s, app 671s, schema 373s); master push 38124930467 success (master job 72s); PR 38130505681 FAILURE (static, step "Run discipline test suite") | ci.yml 22 runs, 2 failures; 38130505681 failed on a real defect: registry.test.mjs LIVE "every tracked verify script is a row enforcer ..." named fsi-app/scripts/verify/audit-walk.mjs (PR coord/e1b-audit-walk added a verify script with no registry row) | SELF-MAINTENANCE | AUD-SYS-2B Table A listed the eight pre-consolidation workflows (discipline.yml etc.) required; superseded by PR 1113/1114 (ci.yml). FIXED-SINCE (PR 1113) | LIVE | [CONFIRMED: gh run view 38124942168 --json jobs -> inputs/static/schema/app success, master skipped; gh api branches/master/protection -> contexts [inputs, static, schema, app, master]] |
| wf:live-smoke.yml | Post-deploy smoke: signs in as the smoke account, runs live assertions, and since REG-1 (#1114) runs node scripts/verify/run-data-audit-lane.mjs --read-only (the registry rows of kind audit with runsIn "post-merge smoke") | runtime stage = post-merge production check (RD-80/RD-82 live checks) | deployment_status (Production only; non-Production runs are skipped) / workflow_dispatch (live-smoke.yml) | nothing automated reads the failure; harness ledger family live-smoke (128 manual + 6 dispatch rows in the ledger export) | the runs; live-preflight/assertion tests in rendering/live/*.test.mjs (rc=0 in D1 test run) | real runs since REG-1: 38125333024 FAIL (0d076634, 405s), 38123761366 FAIL (52489e63, 524s), 38123212546 FAIL (4b73586f, 295s); last success 38121041111 (5c3b3e7a, predates the audits step) | yes, truthful: 70 failed of 681 runs; the 3 latest fail on real live-data drift (claims-tier 812 violations, flag-age 1202 open/497 past bound, candidate-dwell 3366 unnamed past bound, deferral-hygiene 30) plus 4 harness ERRORs | SELF-MAINTENANCE | AUD-SYS-3 (2026-10-11): "Live smoke red on every master deploy: 33 TEST-CODE runs", no prior names the class. AGREES, and the red is now the audits step | LIVE | [CONFIRMED: gh run view 38125333024 --log -> "hard failures/errors: 17 \| soft (informational): 1", only the step "Run the read-only live-data audits" failed] |
| wf:chain-proof.yml | Dispatch-only proof that the chain works end to end against a local stack seeded from a schema-only production dump; header states the expected state is RED | runtime stage = chain proof (ADR-045, PROOF-1) | workflow_dispatch only (chain-proof.yml) | workflow artifact only (counts and hashed ids); no ledger row by design (no production write credential) | its own runs: 10 runs, all failure | 38125001309 FAILURE 2026-10-11 (workflow_dispatch) | all 10 failed; truthfulness per run not attributed in D1 (header declares RED as the expected state) [HYPOTHESIS: failure causes not read per run] | SELF-MAINTENANCE | closure-gate.mjs:549-554 says evidence is the live Actions run; no audit names it. NOT COVERED | UNPROVEN | [CONFIRMED: gh api actions/workflows/chain-proof.yml/runs -> total 10, conclusion failure x10, never success] |
| wf:data-audit-lane.yml | Dispatch-only runner of the data-audit lane (run-data-audit-lane.mjs WITHOUT --read-only) plus a record-harness-run job; GitHub state disabled_manually | runtime stage = live-data audits (superseded for registry rows by live-smoke --read-only) | workflow_dispatch only; disabled_manually | harness ledger family data-audit-lane (no row in the committed export) | run history: 67 runs, 54 failed | 31510612089 success 2026-08-11 (workflow_dispatch); 31503550041 failure same day | yes: run 31468085014 (schedule 2026-08-11, 18 hard failures/errors) is cited by 9 registry audit rows; the 9 audits printed FAIL on real drift (see registry rows) | SELF-MAINTENANCE | AUD-SYS-2A:71 "28 invariants cite an audit: token, execution-wired through this dispatch-only lane, last run 2026-08-11": AGREES for this workflow, FIXED-SINCE for the audit rows (REG-1 #1114 moved the registry audits to live-smoke --read-only) | STALE | [CONFIRMED: gh api actions/workflows -> state disabled_manually; live-smoke.yml header calls the lane "retired" while this file still exists] |
| wf:source-monitoring.yml | Scheduled source change check (check-sources, triage-inaccessible, record-harness-run); every cron commented; GitHub state disabled_manually | runtime stage = source monitoring; build mode holds it off (CLAUDE.md rule 16) | workflow_dispatch only | sources.last_checked; harness family source-monitoring | 532 runs historically | 28329345565 success schedule 2026-06-28 | yes: 2 failures (latest 26122986148 2026-05-19), causes not read [HYPOTHESIS] | CAPABILITY | wiring-census-2026-08-11.md:149,166 (daily running) per AUD-SYS-2B: DISAGREES (cron commented) | UNWIRED | [CONFIRMED: gh api -> disabled_manually, last run 2026-06-28; closure-gate with token prints "source-monitoring.yml is disabled_manually ... dormant by the platform record"] |
| wf:spot-check-monthly.yml | Monthly Haiku spot-check of a 20-source sample; every cron commented; disabled_manually | runtime stage = classifier drift calibration | workflow_dispatch only | harness family spot-check-monthly (no row) | one run ever | 26744289747 FAILURE schedule 2026-06-01 | the single run failed; cause not read [HYPOTHESIS] | SELF-MAINTENANCE | NOT COVERED | UNPROVEN | [CONFIRMED: gh api -> total 1, failure, disabled_manually] |
| wf:uptime-probes.yml | Uptime and honesty probes (jobs surfaces, spend, record-harness-run); schedule disarmed 2026-09-04 | runtime stage = production health probes | workflow_dispatch only | harness family uptime-probes | 487 runs | 37610904324 success workflow_dispatch 2026-10-07 | yes: 48 failures, latest 37608346612 2026-10-07; causes not read [HYPOTHESIS] | SELF-MAINTENANCE | wiring-census-2026-08-11.md:149,166 "daily 09:00 UTC running" (per AUD-SYS-2B): DISAGREES, cron commented | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/uptime-probes.yml/runs (D1 scratch wf-runs.tsv) -> total 487, 48 failures, last success 2026-10-07; grep "^  schedule:" returns 0] |
| wf:source-sweep.yml | Source sweep: discovers candidates from sources; root of the chain (sweep -> ledger-consume, fetch-drain) | runtime stage = discovery (flywheel input) | workflow_dispatch only (chain root) | ledger-consume.yml and fetch-drain.yml via workflow_run; ledger rows source-sweep (13) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058406627 success workflow_dispatch 2026-10-10 | yes: 6 failures, latest 33572948074 2026-09-01 | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/source-sweep.yml/runs (D1 scratch wf-runs.tsv) -> total 30, last success 2026-10-10] |
| wf:ledger-consume.yml | Consumes the ledger verdicts (portal candidates) after a sweep; push of drain batches also fires it | runtime stage = candidate consumption | workflow_run of Source sweep; push (committed ledger-verdicts batches); workflow_dispatch | population-turn.yml, corpus-turn.yml (workflow_run); ledger family ledger-consume (16 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058463491 success workflow_run 2026-10-10 | yes: 3 failures, latest 37034093326 2026-10-02 | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/ledger-consume.yml/runs (D1 scratch wf-runs.tsv) -> total 25, last success workflow_run 2026-10-10] |
| wf:population-turn.yml | Population turn: mint plus flywheel steps; carries a rule-13 "FLAGGED, NOT FIXED" note at lines 657-668 that the scripts/turns/brief-export/pending queue no longer reaches origin | runtime stage = mint + question generation | workflow_run of Ledger consume; workflow_dispatch | brief-export, gate-a-rescan, downstream-chain, question-answers (workflow_run); family mint (4 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058506216 success workflow_run 2026-10-10 | yes: 16 failures, latest 37034090765 2026-10-02 | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | HALF-SLICE | [CONFIRMED: sed -n 657,668p population-turn.yml reads the FLAGGED NOT FIXED note; rule 13 says a flag is a commitment] |
| wf:corpus-turn.yml | Corpus turn: corpus census / forward events / analyze-corpus (re-cluster); fires on workflow_run, dispatch and push of turn/** | runtime stage = corpus analysis | workflow_run of Ledger consume; workflow_dispatch; push turn/** | downstream-chain, theme-briefs (workflow_run); family corpus-turn (7 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058506235 success workflow_run 2026-10-10 | yes: 2 failures, latest 33566259450 2026-09-01 | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/corpus-turn.yml/runs (D1 scratch wf-runs.tsv) -> total 17, last success workflow_run 2026-10-10] |
| wf:downstream-chain.yml | Downstream chain: tier-opinions, recompute-tiers, analyze-corpus etc. steps run through the maintenance-step action; final step explicitly `gh workflow run`s propagation-drain.yml (lines 411-444) because GitHub drops a fourth workflow_run level | runtime stage = downstream recompute (trust/tier) and propagation hand-off | workflow_run of Population turn / Corpus turn; workflow_dispatch | propagation-drain.yml by explicit dispatch; family downstream-chain (14 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058579793 success workflow_run 2026-10-10 | never failed in 20 runs | LEARNING | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/downstream-chain.yml/runs (D1 scratch wf-runs.tsv) -> total 20, 0 failures, last success workflow_run 2026-10-10] |
| wf:propagation-drain.yml | Propagation drain (decision propagation of the flywheel); its workflow_run listener for "Downstream chain" is dead for a chained firing (depth 4) and is replaced by downstream-chain.yml dispatching it explicitly | runtime stage = decision propagation (spec 08) | workflow_run of Data producers; explicit gh workflow run from downstream-chain.yml:411-444; workflow_dispatch | question-answers.yml (workflow_run); family propagation (19 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058734295 success workflow_dispatch 2026-10-10 | yes: 2 failures, latest 36534640498 2026-09-29 (the shallow-checkout rebase failure that F52g now gates) | LEARNING | loop-hops.d/07 note (2026-09-29) names the depth-4 limit; AGREES, fix landed in downstream-chain.yml | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/propagation-drain.yml/runs (D1 scratch wf-runs.tsv) -> total 33, last success 2026-10-10 workflow_dispatch] |
| wf:brief-export.yml | Exports the list of briefs to write; the exported part file reaches nothing (no branch push since R22, not in the artifact upload), per the workflow own comment lines 399-405 | runtime stage = brief export | workflow_run of Population turn; workflow_dispatch | NONE for the part file (comment lines 399-405); family brief-export (7 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058579521 success workflow_run 2026-10-10 | yes: 2 failures, latest 37034091779 2026-10-02 | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | HALF-SLICE | [CONFIRMED: reading .github/workflows/brief-export.yml lines 399-405; upload-artifact path excludes the part file] |
| wf:brief-apply.yml | Applies written briefs (push of committed batches or dispatch) | runtime stage = brief apply | push (batch files); workflow_dispatch | gate-a-rescan, source-resolution (workflow_run); family brief-apply (1 row) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 37609680004 success workflow_dispatch 2026-10-07 | never failed in 36 runs | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/brief-apply.yml/runs (D1 scratch wf-runs.tsv) -> total 36, 0 failures] |
| wf:gate-a-rescan.yml | Gate A rescan of verified items after apply/mint | runtime stage = provenance gate rescan | workflow_run of Brief apply / Population turn; workflow_dispatch | family gate-a-rescan (12 rows); integrity flags | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058579492 success workflow_run 2026-10-10 | yes: 2 failures, latest 36220173437 2026-09-26 (the tee-without-pipefail class F52f gates) | SELF-MAINTENANCE | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/gate-a-rescan.yml/runs (D1 scratch wf-runs.tsv) -> total 17, last success 2026-10-10] |
| wf:fetch-drain.yml | Drains the first-fetch queue after a sweep | runtime stage = fetch | workflow_run of Source sweep; workflow_dispatch | family fetch-drain (6 rows); loop-fired-evidence entry sweep-to-fetch-drain | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058463484 success workflow_run 2026-10-10 | never failed in 7 runs | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/fetch-drain.yml/runs (D1 scratch wf-runs.tsv) -> total 7, 0 failures] |
| wf:theme-briefs.yml | Theme briefs export/apply after corpus re-cluster | runtime stage = theme briefs (CHAIN-4) | workflow_run of Corpus turn; push; workflow_dispatch | family theme-briefs (2 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058579779 success workflow_run 2026-10-10 | never failed in 3 runs | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/theme-briefs.yml/runs (D1 scratch wf-runs.tsv) -> total 3, 0 failures] |
| wf:question-answers.yml | Answers open questions (export on chained firing, apply on push/dispatch) | runtime stage = question answering (CHAIN-4) | workflow_run of Population turn / Propagation drain; push; workflow_dispatch | family question-answers (3 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 38058579505 success workflow_run 2026-10-10 | never failed in 4 runs | LEARNING | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/question-answers.yml/runs (D1 scratch wf-runs.tsv) -> total 4, 0 failures] |
| wf:source-resolution.yml | Resolves provisional sources then recomputes tiers | runtime stage = source resolution (S1-E) | workflow_run of Brief apply / Research walker; push (host verdicts); workflow_dispatch | family source-resolution (8 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 37875532084 success push 2026-10-09 | never failed in 8 runs | LEARNING | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/source-resolution.yml/runs (D1 scratch wf-runs.tsv) -> total 8, 0 failures] |
| wf:research-walker.yml | Research walker: registers and rates publishers | runtime stage = research source discovery | workflow_dispatch (chain root) | source-resolution.yml (workflow_run); family research-walker (3 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 37609688488 success workflow_dispatch 2026-10-07 | never failed in 4 runs | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/research-walker.yml/runs (D1 scratch wf-runs.tsv) -> total 4, 0 failures] |
| wf:research-assessment.yml | Research assessment pass | runtime stage = research horizon assessment | workflow_dispatch | family research-assessment (2 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 37587205996 success workflow_dispatch 2026-10-07 | never failed in 2 runs | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/research-assessment.yml/runs (D1 scratch wf-runs.tsv) -> total 2, 0 failures] |
| wf:needs-search.yml | Needs-search batch (push of committed batch or dispatch) | runtime stage = seek-more search | push; workflow_dispatch | family needs-search (1 row, trigger push) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 37710098281 success push 2026-10-08 | never failed in 1 run | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/needs-search.yml/runs (D1 scratch wf-runs.tsv) -> total 1, success] |
| wf:change-detection.yml | Change detection (reconcile and drain; detects nothing while scrape cadence is off, CLAUDE.md rule 16) | runtime stage = change detection | workflow_dispatch | family change-detection (6 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 37587211265 success workflow_dispatch 2026-10-07 | never failed in 6 runs | LEARNING | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/change-detection.yml/runs (D1 scratch wf-runs.tsv) -> total 6, 0 failures] |
| wf:date-chain.yml | Date chain backfill (+ record-harness-run) | runtime stage = timeline/date backfill | workflow_dispatch | family date-chain (no ledger row in the committed export; closure gate without a token reports NEVER-RUN) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 37587214784 success workflow_dispatch 2026-10-07 | never failed in 6 runs | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/date-chain.yml/runs (D1 scratch wf-runs.tsv) -> total 6, 0 failures; closure-gate.mjs (no token) -> "x workflow:date-chain.yml: NEVER-RUN"] |
| wf:producers.yml | Data producers (EIA, ECB FX, others; eia-v2-petroleum-spot reads secrets.EIA_API_KEY) | runtime stage = external data producers | workflow_dispatch | propagation-drain.yml (workflow_run); family producers (2 rows) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 37610399829 success workflow_dispatch 2026-10-07 | yes: 7 failures, latest 35533637184 2026-09-20 (the runner.temp job-level env defect F52b gates, GitHub run 35533637184) | CAPABILITY | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/producers.yml/runs (D1 scratch wf-runs.tsv) -> total 27, last success 2026-10-07] |
| wf:maintenance.yml | Maintenance: 63 dispatchable steps, each `if: env.RUN_STEP == <id>` (or an `all` dry fan-out) through the maintenance-step composite action; 1241 lines | runtime stage = corrective maintenance runs | workflow_dispatch only | family maintenance (10 rows); closure gate NEVER-RUN targets maintenance:<step> (63) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)"; D1 option/guard cross-check: 63 options, 62 have a RUN_STEP guard | 37712218216 success workflow_dispatch 2026-10-08 | yes: 14 failures, latest 37589880469 2026-10-07 | SELF-MAINTENANCE | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: node cross-check of options list vs `RUN_STEP == '<id>'` guards -> options 63, with 0 guards [acquire-primaries]; guard names not in options []] |
| wf:maintenance.yml#option:acquire-primaries | The `acquire-primaries` entry in the maintenance step options list: no step guards it (the step and scripts/maintenance/acquire-primaries.mjs were deleted, lines 772-777 say so) | NONE | maintenance.yml:39 options list | NONE (dispatching it runs setup and no step) | NONE | NEVER | n/a | NONE | NOT COVERED | DEAD | [CONFIRMED: node cross-check -> "options with 0 RUN_STEP guards: [ 'acquire-primaries' ]"; ls fsi-app/scripts/maintenance has no acquire-primaries.mjs] |
| wf:layout-baseline-renewal.yml | Renews the layout-guard baseline (+ record-harness-run) | runtime stage = rendering guard baseline renewal | workflow_dispatch | rendering/layout-guard baseline file; family layout-baseline-renewal (no row in the committed export) | workflow read whole; scripts it names resolve (wfscan: all exist except brief-export inline scripts/tmp/select-record-stub-ids.mjs, created inline); F52 facets A/C pass in node fsi-app/.discipline/fitness/runner.mjs -> "Fitness summary: 44 function(s) checked, 0 violation(s)" | 37781121359 success workflow_dispatch 2026-10-08 | never failed in 2 runs | SELF-MAINTENANCE | AUD-SYS-2B Table A (2026-10-11, pre PR 1113/1114 consolidation): NOT COVERED by name | LIVE | [CONFIRMED: gh api repos/Dwarves77/dotfiles/actions/workflows/layout-baseline-renewal.yml/runs (D1 scratch wf-runs.tsv) -> total 2, 0 failures; header cites discipline.yml (3 occurrences), a workflow that no longer exists] |
| act:local-stack | Composite action: start a local Supabase stack, preflight it (used by the schema job and chain-proof) | NONE named | ci.yml:465 (schema job), chain-proof.yml | schema job steps | ci.yml schema step "Attack the stack steps themselves" (ci.yml:472) + F52 facet A (action.yml has runs.using) | ci.yml schema job in 38124942168 success (373s) | n/a | SELF-MAINTENANCE | AUD-SYS-2B: local-stack replay overlap noted [HYPOTHESIS there] | LIVE | [CONFIRMED: gh run view 38124942168 --json jobs -> schema success; file read whole] |
| act:maintenance-step | Composite action that runs one fsi-app/scripts/maintenance/<step>.mjs with mode/out_root and writes summary.json under out_root/<step> | NONE named | maintenance.yml, downstream-chain.yml (tier-opinions, recompute-tiers) | maintenance run artifacts | F52 facet A; maintenance.yml runs | 37712218216 (maintenance) success | n/a | SELF-MAINTENANCE | NOT COVERED | LIVE | [CONFIRMED: file read whole; callers grep: git grep -n "maintenance-step" -- .github] |
| doc:stale-discipline.yml-citations | Comments and test strings that cite .github/workflows/discipline.yml (the workflow was replaced by ci.yml): 27 files, in scope: ci.yml(1), live-smoke.yml(4), layout-baseline-renewal.yml(3), F25(8), F52(3), memory-gate(5), docs-only-range(2), pre-push(7), run-test-suite.sh(2), no-npm-sandbox(1), test-discovery(1), run-npmtest-suites.sh(1), change-range(1), job-inputs(1), OUT-OF-REPO-BOUNDARY.md(2), invariants.d RD-77/79/80/89, README | NONE | NONE | readers of the headers | NONE (no gate reads comment truth) | n/a | n/a | NONE | NOT COVERED | STALE | [CONFIRMED: git grep -c "discipline\.yml" -- .github .claude fsi-app/.discipline -> 27 files; ls .github/workflows has no discipline.yml] |
