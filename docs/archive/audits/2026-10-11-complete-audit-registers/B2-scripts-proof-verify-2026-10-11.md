# B2 register index: fsi-app/scripts/proof, verify, lib and every subdirectory not in B1 (2026-10-11)

Lane audit2-b2-scripts-proof-verify, FACT lane, read-only. Registers (393 rows, one per tracked file in scope):
- B2-part1-lib-2026-10-11.md (76 rows)
- B2-part2-proof-2026-10-11.md (67 rows)
- B2-part3-verify-2026-10-11.md (97 rows)
- B2-part4-other-scripts-2026-10-11.md (153 rows): _reground, _ruling, _worklists, classification, connections, coordinator, drain, entities, forward-events, gen, health, inventories, migrations, propagation, remediation, review, sources, spec09, and top-level files

Scope: non-test code in scope is far over 12,000 lines (about 39,000 code lines; 393 tracked files, 171 test files, 40,268 lines of _worklists data), so the register is split by directory, each with its own table.

## Summary

STATUS (all 393 rows): DEAD 1, HALF-SLICE 8, LIVE 342, STALE 12, UNPROVEN 22, UNWIRED 8.
STATUS (222 non-test rows): DEAD 1, HALF-SLICE 8, LIVE 171, STALE 12, UNPROVEN 22, UNWIRED 8. Test files (171) are all LIVE: every one is run by a discovered runner and was executed here.
CLASS (all rows): CAPABILITY 63, LEARNING 55, NONE 23, SELF-MAINT 252. CLASS (non-test rows): CAPABILITY 36, LEARNING 28, NONE 22, SELF-MAINT 136.
PRIOR (all rows): AGREES 228, DISAGREES 26, FIXED-SINCE 8, NOT COVERED 131.

Tests executed: 157 test/selftest/npmtest files run one by one, credentials unset, FSI_NO_ENV_FILE=1: 2384 tests, 2378 pass, 3 skipped (build-applied-map.test, inaccessible-triage.test, migration-history-diff.test), 2 fail (lib/pg-conn.npmtest.mjs, environment-dependent). verify/run-goldens.mjs: exit 0, 'GOLDENS GREEN', 14 goldens.
Real credentialed run: live-smoke.yml 38125333024 (2026-10-11) step 'Run the read-only live-data audits' = node scripts/verify/run-data-audit-lane.mjs --read-only (live-smoke.yml:150). 27 audits ran (holdings-audit and skill-conformance skipped as writers): PASS 9 (admin-phrase-scan, defect-signature-scan, loop-fired-evidence, no-generic-source, pause-flag-guard-proof, prov-guard-adversarial, schema-drift, source-link, surface-acceptance); FAIL 14 (candidate-dwell, check-vocabulary-drift, claims-tier, deferral-hygiene, flag-age, ledger-onepass, migration-history, one-tier-per-host, orphan-source, quarantine-disposition, section-markers, substrate-agreement, ui-orphan, harness-family-schedule-walker [soft]); ERROR exit 2 4 (derivation-edges-rls-adversarial, harness-runs-rls-adversarial, layer-c-insert-gate-proof, spec09-org-rls-adversarial). 17 hard failures/errors, 1 soft. Log: scratchpad b2/livesmoke-38125333024.log.

## DISAGREES with prior audits (26)

- lib/drift-check.mjs: census 1b lists it dead; reached from lib/surface-registry.mjs:25, npmtest passes: UNWIRED, not DEAD
- lib/fetch-negative-probe.mjs: census 1b lists it dead; imported by lib/inconclusive-probe.mjs:35; CLI scan runs (34 candidate-corrupt, 36 review across 17 files): UNWIRED, not DEAD
- lib/surface-registry.mjs: dead-code-census-2026-10-08 section 1b lists it dead; npmtest is in ci.yml and passes, importers are lib/fetch-negative-probe.mjs:36 and lib/inconclusive-probe.mjs:34 (neither has a production caller): UNWIRED, not DEAD
- lib/verify.mjs: census 1b lists it dead; reached from lib/surface-registry.mjs:26, selftest passes: UNWIRED, not DEAD
- verify/admin-phrase-scan.mjs: aud-sys-2b Table C line 167 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: PASS (soft)
- verify/candidate-dwell-audit.mjs: aud-sys-2b Table C line 176 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: FAIL (3692 candidates, 3366 past bound unnamed)
- verify/check-vocabulary-drift.mjs: aud-sys-2b Table C line 179 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: FAIL (3 drifts, notifications.kind adds 'assignment')
- verify/claims-tier-audit.mjs: a4bc:347 'consistently exit 2 without credentials': exits 1 with a stack trace
- verify/defect-signature-scan.mjs: aud-sys-2b Table C line 185 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: PASS (soft, 0 items in 24h window)
- verify/derivation-edges-rls-adversarial-audit.mjs: aud-sys-2b Table C line 187 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: ERROR exit 2 (audit's own SQL: inconsistent types deduced for parameter $1)
- verify/harness-family-schedule-walker-audit.mjs: aud-sys-2b Table C line 201 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: FAIL soft (gh not on PATH, EVIDENCE_UNAVAILABLE)
- verify/harness-runs-rls-adversarial-audit.mjs: aud-sys-2b Table C line 203 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: ERROR exit 2 (SAVEPOINT can only be used in transaction blocks)
- verify/layer-c-insert-gate-proof.mjs: aud-sys-2b Table C line 206 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: ERROR exit 2 (need SUPABASE_DB_URL or DATABASE_URL; job supplies SUPABASE_DB_PASSWORD only)
- verify/ledger-onepass-audit.mjs: a4bc:347: exits 1 with a stack trace without credentials
- verify/loop-fired-evidence-audit.mjs: aud-sys-2b Table C line 217 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: PASS (2 entries vs 304 harness_runs rows)
- verify/migration-history-audit.mjs: aud-sys-2b Table C line 218 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: FAIL (LEDGER_ROW_NOT_IN_MAP 20261011082745 = migration 385)
- verify/no-generic-source-audit.mjs: a4bc:347: exits 1 ('supabaseUrl is required') without credentials
- verify/one-tier-per-host-audit.mjs: a4bc:347: exits 1 with a stack trace without credentials
- verify/population-report.mjs: a4bc:347: exits 1 with a stack trace without credentials
- verify/run-data-audit-lane.mjs: REG-1 header and live-smoke.yml:141 call data-audit-lane.yml retired; the workflow file still exists (last run 31510612089 2026-08-11); header says 34 audits, derivation yields 29
- verify/section-marker-audit.mjs: aud-sys-2b Table C line 244 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: FAIL (4 of 1518)
- verify/spec09-org-rls-adversarial-audit.mjs: aud-sys-2b Table C line 247 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: ERROR exit 2 (SKIP: fewer than two live organizations have a member)
- verify/substrate-agreement-audit.mjs: a4bc:347: exits 1 with a stack trace without credentials
- verify/surface-acceptance.mjs: aud-sys-2b Table C line 250 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: PASS (pass 7, fail 0, skip 12)
- verify/ui-orphan-audit.mjs: aud-sys-2b Table C line 255 says LAST FIRED "never fired in the lane"; live-smoke.yml 38125333024 (2026-10-11) ran it: FAIL
- verify/verification-audit-report.mjs: a4bc:347: exits 1 with a stack trace without credentials

## Unverified (12), each a [HYPOTHESIS] or a file with no executable form

- audit-skill-conformance.mjs: [HYPOTHESIS: non-read-only lane run would ENOENT at writeFileSync; skipped by --read-only lane (live-smoke 38125333024 ran 27 audits without it); no test]
- entities/backfill-derivation-edges.mjs: [HYPOTHESIS: retirement condition never observed]
- verify/fixtures/eager-pg-import.mjs: [HYPOTHESIS: read whole, not executed, no caller found by git grep (0)]
- _worklists/statutory-fueleu-annex-iv-2026-09-05.BROWSER-WORKLIST.md: no executed evidence
- coordinator/lane-gate-cloud.sh: no executed evidence
- d3-runs.ddl.sql: no executed evidence
- flag-fabricated-items.sql: no executed evidence
- forward-events/DRY-RUN-REPORT.md: no executed evidence
- gen/migration-258-behaviour.sql: no executed evidence
- gen/migration-268-behaviour.sql: no executed evidence
- sources/README.md: no executed evidence
- spec09/SOURCES.md: no executed evidence

## The ten rows that matter most

1. proof/apply-schema-dump.mjs: chain-proof.yml has failed 10 of 10 runs; newest 38125001309 (2026-10-11) dies in this script's step with 8 fatal 'default privilege entry the dump never declared' errors, so schema-diff.mjs (the oracle gate) is never reached.
2. verify/run-data-audit-lane.mjs: the only credentialed run of the data audits, live-smoke.yml 38125333024 (2026-10-11), ran 27 audits: 9 PASS, 14 FAIL, 4 ERROR; 17 hard failures/errors; header says 34 audits, derivation yields 29; data-audit-lane.yml (disabled_manually) still references it at line 70.
3. verify/derivation-edges-rls-adversarial-audit.mjs: exit 2 on its own SQL ('inconsistent types deduced for parameter $1', lines 82 and 97 use VALUES ('derived_values', $1, $1, 'input')); the RLS attack never executes.
4. verify/harness-runs-rls-adversarial-audit.mjs: exit 2 'SAVEPOINT can only be used in transaction blocks'; the shared probe() in verify/lib/rls-adversarial-probe.mjs issues its own ROLLBACK inside the outer BEGIN, so the attack never completes.
5. verify/layer-c-insert-gate-proof.mjs: reads only SUPABASE_DB_URL / DATABASE_URL (line 26); the live-smoke job supplies SUPABASE_DB_PASSWORD only, so the migration-240 gate proof cannot run in that job (exit 2).
6. verify/substrate-agreement-audit.mjs: line 23 drops `error` from sb.rpc('validate_item_provenance'); an RPC failure becomes `continue`, so the audit would PASS if every RPC failed (the CLAUDE.md error-swallow shape).
7. verify/surface-acceptance.mjs: live mode passes aggregates:[] links:[] linkNodes:[] (line 403); 12 of 19 checks SKIP in the real run (pass 7, fail 0, skip 12), checks 9 and 10 cannot fail.
8. _reground/free-pass-run.mjs (and target-match-probe, id-stamp, lease, executor-ground, tombstone-delete): call process.loadEnvFile('.env.local') directly; F48-env-file-load-guarded exempts the reground tree, so FSI_NO_ENV_FILE=1 does not stop them from reaching the live database (incident below).
9. d3-runs.ddl.sql: DDL for d3_runs never applied (0 hits in db-catalog.json); src/lib/d3/hooks.mjs:24-30 inserts into it and warn-skips on absence: writer present, table absent.
10. propagation/write-statutory.mjs: first statutory_computations writer; workflow step propagation-drain.yml:447 skips when scripts/propagation/fixtures/fueleu-annex-iv-rows.json is absent (it is absent), so the writer is a designed no-op today.

## Prior findings still open

- a4c F-03 (2026-09-30) STILL-OPEN: fsi-app/scripts/flag-fabricated-items.sql:1 (90 lines, tracked, no executor; git grep finds no caller).
- a4c F-04 STILL-OPEN: fsi-app/scripts/d3-runs.ddl.sql:1 (28 lines, never applied; consumer fsi-app/src/lib/d3/hooks.mjs:24-30).
- a4c F-07 STILL-OPEN (narrowed by ADR-042 to three): near-identical main() skeletons at fsi-app/scripts/spec09/oem-roadmap-producer.mjs:154, grid-queue-producer.mjs:117, reroute-producer.mjs:144.
- a4c F-09 STILL-OPEN: fsi-app/scripts/_ruling/null-tier-host-ruling.mjs:22 says 'Emits SQL + a reversibility CSV'; the file only exports the RULING array.
- a4cc F-12 STILL-OPEN: fsi-app/scripts/propagation/seed-derived-values.test.mjs:3-6 header says NOT wired into run-test-suite.sh (test-discovery now runs it; header is stale).
- a4b F45-1 STILL-OPEN: SIG column string + paged corpus loader duplicated at fsi-app/scripts/connections/apply-tags.mjs:578-584 and fsi-app/scripts/connections/discover-for-items.mjs:135-142.
- a4b R015-1 STILL-OPEN: harness_runs inserts bypass the guarded layer by design: fsi-app/scripts/lib/record-harness-run.mjs:9 and fsi-app/scripts/lib/harness-run-number.mjs:69 ('exempt from rule 015').
- a4bc:347 claim ('audits consistently exit 2 without credentials') is false and the underlying defect STILL-OPEN: 13 scripts exit 1 with an uncaught throw instead of the exit-2 self-skip: verify/claims-tier-audit.mjs, ledger-onepass-audit.mjs, no-generic-source-audit.mjs (supabaseUrl is required), one-tier-per-host-audit.mjs, substrate-agreement-audit.mjs, population-report.mjs, verification-audit-report.mjs, and top-level audit-skill-conformance.mjs, backfill-item-timelines.mjs, plan-quarantine-disposition.mjs, regen-quarantined.mjs, forward-events/dispatch-extraction.mjs, remediation/refetch-capped-worklist.mjs (db.mjs:131 'load env ... before use').
- dead-code-census-2026-10-08 category 7 #1 STILL-OPEN: fsi-app/scripts/coordinator/lane-gate-cloud.sh:1 has no workflow, package.json, runbook or script reference.
- dead-code-census F25 allowlist #17 STILL-OPEN: fsi-app/scripts/lib/batch-primitives.mjs:1 (only its npmtest imports it); #15 fsi-app/scripts/lib/inconclusive-probe.mjs:1 (run only by its npmtest and the probe chain).
- aud-sys-1 PS-01 STILL-OPEN: chain-proof red, now 10 of 10, at fsi-app/scripts/proof/apply-schema-dump.mjs (workflow step chain-proof.yml:175).
- aud-sys-2b (2026-10-11): data-audit-lane.yml disabled_manually, last run 31510612089 (2026-08-11), still present at .github/workflows/data-audit-lane.yml:70 although verify/run-data-audit-lane.mjs header (lines 3-4) and live-smoke.yml:150 call it retired.
- First seen this pass (no prior): lib/db.mjs:302 cites scripts/verify/pagination-order-key-audit.mjs, which does not exist (only the .test.mjs); lib/run-artifact.mjs:160-163 tells the caller to add a family to ALLOWED_FAMILIES, which is now derived from FAMILIES (lines 29-43); lib/table-primary-keys.mjs:21 cites table-primary-keys-freshness.test.mjs, which does not exist; connections/ratify-flag-to-census.mjs and classification/apply-classifications.mjs keep a typed-token human ratify path (lines 63 and 105) while apply-tags.mjs deleted its equivalent in G6-GATES.

## Prior findings FIXED-SINCE

- a4c F-01/F-02 (_plans, _diag tracked): git ls-files shows 0 tracked, gitignored (.gitignore:66,68). a4c F-05 holdings-audit.mjs unguarded main: isMainModule now. a4c F-06 seed-derived-values raw upsert: writes via the registerDerivedValue RPC (ADR-043). a4c F-08 backfill-entities/backfill-lineage-edges ad hoc guard: isMainModule (lane R20 F44/F67). a4cc F-10/F-11 emission-factors-desnz/-epa no guard: guard present. a4cc F-13/F-14 _archive: gone.
- dead-code-census 2026-10-08: lib/decision-anchors, exclusion-audit, liveness, funded-pass-lock deleted by DEAD-1 (PR 1007); scripts/_archive, _diag, _plans, community absent from the tree.
- goldens-wiring-truth-2026-08-09 (goldens run by nothing): ci.yml:312 now runs verify/run-goldens.mjs; this pass ran it, 'GOLDENS GREEN', all 14 goldens PASS. mechanical-checkers-2026-09-30 A9 (609 of 643 findings unlabeled): verify/audit-finding-status.mjs strict run exits 0 now.
- REG-1 (PR 1114, 2026-10-11) deleted 20 verify scripts (canonical-key-uniqueness, column-existence-parity, dead-column-audit, duplicate-table-audit, export-loop-fired-evidence, format-structure, id-redirect-target-audit, mode-tag-coverage-audit, mutation-lease.golden, no-names, remediate-orphan-sources, rls-credential-parity, routing, source-vs-item, staged-transit-audit, surface-visibility-audit, unregistered-span-host-audit, vocab-sync-audit, wave-acceptance-audit, funded-pass-lock-golden); PIPE-1 (PR 1113) deleted migration-number-collision.mjs. Findings of a4b/a4bc/goldens-wiring-truth about those files are closed by deletion.

## Cross-cutting facts from execution

- INCIDENT (disclosed): this lane's brief says no database access. While running the no-credential CLIs with credentials unset and FSI_NO_ENV_FILE=1, _reground/free-pass-run.mjs (48.7 s, exit 0) and _reground/target-match-probe.mjs (44.9 s, exit 0) loaded fsi-app/.env.local through process.loadEnvFile and ran READ-ONLY queries against the live database (dry/read-only code paths; no guarded writes; verified by node -e process.loadEnvFile('.env.local') -> credentials loaded). The scratch output scripts/tmp/free-pass-dryrun.json (gitignored) was deleted. The cause is a repo fact: F48-env-file-load-guarded exempts the reground tree.
- gen/fetch-desnz-factors.mjs (no --xlsx) performed a real HTTP fetch of the gov.uk DESNZ workbook in dry mode, exit 0, all 7 targets resolved.
- ci.yml:322-329 and :895-902 list scripts/lib/type-consumer-probe.selftest.mjs and scripts/lib/error-drop-probe.selftest.mjs; neither file exists (moved to _archive in #507, then deleted). node --test with two or more arguments ignores a missing literal path and exits 0 (CI run 38123530940 log: tests 45, pass 45), so two named proofs execute nothing.
- lib/pg-conn.npmtest.mjs exits 1 locally (pass 4, fail 2: 'password alone (no URL, no .temp link)' and 'malformed REST URL derives nothing'): pg-conn derives ROOT from its own location, and fsi-app/supabase/.temp/{project-ref,pooler-url} exists in this checkout. The test depends on the checkout, not only on its inputs. lib/assemble-train.test.mjs timed out at 180 s under parallel load; alone: 11/11 pass in 76 s.
- lib/assemble-train.mjs (package.json:14) folds artifact branches that nothing creates any more (deliver-artifact-branch.sh now lands into harness_runs with no git push); 33 remote branches matching its prefixes remain (git ls-remote).
- verify/_baselines/facts-on-suspended.json, verify/lib/fixtures/duplicate-table-schema-snapshot.json (204 KB): registry.mjs:245 says the duplicate-table audit's fixture was deleted; the snapshot survives and is read by lib/db.mjs:304, lib/table-primary-keys.mjs and verify/pagination-order-key-audit.test.mjs:46.
- verify/attacks/routes-attacked.mjs takes its expected-open list from docs/audits/aud-at2-route-guard-register-2026-10-08.md (a dated snapshot; route drift since then is not detected).
- verify/population-report.mjs and verification-audit-report.mjs read intelligence_items and section_claim_provenance with unpaginated sb.from(...).select(...) (PostgREST 1000-row cap; claims are about 34,025 in the live run).
- audit-skill-conformance.mjs:99 writes scripts/_diag/_conformance.json with no mkdir; fsi-app/scripts/_diag does not exist, so a non-read-only run would ENOENT after computing (skipped by --read-only in the live run; [HYPOTHESIS], not executed).
- lib/db.mjs and similar modules print MODULE_TYPELESS_PACKAGE_JSON on every run (package.json has no type field and .ts imports use native stripping).
- Header drift: lib/batch-primitives.npmtest.mjs, drift-check.npmtest.mjs and surface-registry.npmtest.mjs name old test files; lib/run-artifact.mjs claimRunId JSDoc is displaced above buildRunArtifactEnvelope.

## READ COVERAGE

Whole-file reads: every non-test code, SQL and shell file in scope (222 non-test rows minus the items below) was read completely. Not read in full, named:
- All test files except three: executed (results in every PROVEN BY cell) but read by header, imports and every test title only; read whole: proof/applied-map.test.mjs, proof/apply-pending-migrations.test.mjs, proof/apply-schema-dump.test.mjs. lib/*.selftest.mjs and lib/*.npmtest.mjs were read whole.
- forward-events/DRY-RUN-REPORT.md (46,295 characters): first 5,000 and last about 6,000 characters only.
- Data files, structure parsed and checked, not read line by line: proof/attacks/attacks.json (4,038 lines; 44 attacks parsed, every script and sql-block reference exists), proof/steps/chain-steps.json (954 lines; 22 steps, 16 hops, run-chain-steps.mjs --plan exit 0), verify/lib/fixtures/duplicate-table-schema-snapshot.json (8,268 lines), verify/_baselines/facts-on-suspended.json, verify/fixtures/route-attack-expected-open.json, verify/harness-family-walk-allowlist.json, verify/ui-orphan-allowlist.json, spec09/*.example.json, spec09/fixtures/*.csv, gen/fixtures/**, propagation/fixtures/**, and everything under _worklists/ (40,268 lines, chiefly provenance-heal-34041907817.summary.json at 1.9 MB).
- Each row's CALLED BY / RUN BY comes from git grep of the file name and path (callers.tsv, xref.json); a caller that is a registry or allowlist mention (F25-module-liveness, coverage-scan, skill-map, doctrine-register) is shown as a mention, not as a runner.

| directory | files | test files | data/doc files | code files read whole | tests | data/doc |
| --- | --- | --- | --- | --- | --- | --- |
| (top level) | 12 | 3 | 0 | 9 | executed (see PROVEN BY); header + test titles read | see list below |
| _reground | 6 | 0 | 0 | 6 | executed (see PROVEN BY); header + test titles read | see list below |
| _ruling | 1 | 0 | 0 | 1 | executed (see PROVEN BY); header + test titles read | see list below |
| _worklists | 8 | 1 | 7 | 0 | executed (see PROVEN BY); header + test titles read | see list below |
| classification | 4 | 2 | 0 | 2 | executed (see PROVEN BY); header + test titles read | see list below |
| connections | 17 | 9 | 0 | 8 | executed (see PROVEN BY); header + test titles read | see list below |
| coordinator | 1 | 0 | 0 | 1 | executed (see PROVEN BY); header + test titles read | see list below |
| drain | 9 | 4 | 0 | 5 | executed (see PROVEN BY); header + test titles read | see list below |
| entities | 9 | 4 | 0 | 5 | executed (see PROVEN BY); header + test titles read | see list below |
| forward-events | 4 | 1 | 1 | 2 | executed (see PROVEN BY); header + test titles read | see list below |
| gen | 15 | 4 | 3 | 8 | executed (see PROVEN BY); header + test titles read | see list below |
| health | 1 | 0 | 0 | 1 | executed (see PROVEN BY); header + test titles read | see list below |
| inventories | 2 | 1 | 0 | 1 | executed (see PROVEN BY); header + test titles read | see list below |
| lib | 76 | 38 | 0 | 38 | executed (see PROVEN BY); header + test titles read | see list below |
| migrations | 6 | 3 | 0 | 3 | executed (see PROVEN BY); header + test titles read | see list below |
| proof | 67 | 36 | 2 | 29 | executed (see PROVEN BY); header + test titles read | see list below |
| propagation | 10 | 4 | 2 | 4 | executed (see PROVEN BY); header + test titles read | see list below |
| remediation | 2 | 1 | 0 | 1 | executed (see PROVEN BY); header + test titles read | see list below |
| review | 18 | 9 | 0 | 9 | executed (see PROVEN BY); header + test titles read | see list below |
| sources | 5 | 2 | 1 | 2 | executed (see PROVEN BY); header + test titles read | see list below |
| spec09 | 23 | 8 | 6 | 9 | executed (see PROVEN BY); header + test titles read | see list below |
| verify | 97 | 41 | 5 | 51 | executed (see PROVEN BY); header + test titles read | see list below |

## Method notes

- NO-CRED RUN cells: each CLI was run with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_PASSWORD, SUPABASE_DB_URL and DATABASE_URL unset and FSI_NO_ENV_FILE=1; no run used --apply. Exit 2 is the repo's cannot-verify convention (rule 15); exit 1 with an uncaught throw is recorded as a deviation.
- LAST REAL RUN cites a CI run id for audits and proof stack workflows; library modules show the CI run that exercises their tests; one-off scripts with no run record say so.
- Prior-audit sources read: mechanical-checkers-2026-09-30, goldens-wiring-truth-2026-08-09, app-audit-a4b/a4bc/a4c/a4cc (2026-09-30), dead-code-census-2026-10-08, whole-build-audit-2026-10-11 aud-sys-1 and aud-sys-2b (Table C, 96 verify rows at lines 160-260), db-1-schema-traceability-2026-10-11.
