## 2026-10-11, lane CLEAN-2 (coord/clean2-historical-docs): historical docs removed

### Accomplished

- Deleted the historical docs the product does not read, outright (operator ruling 2026-10-11: no archive, no backup; HISTORY-1 purges the paths from git history after merge). Tree lines `git ls-files -z | xargs -0 cat | wc -l`: BEFORE 1,057,253 (measured at branch creation, origin/master 2a720f327), AFTER __AFTER__.
- Waited for PR 1126 (CLEAN-1): it merged during the wait; branch cut from origin/master after that, rule 18 merge of origin/master (fef8056e9, INDEX conflict resolved by taking the rewritten INDEX plus master's line 3 wording).
- Rewrote docs/INDEX.md: one line per surviving living doc (356 link lines to 113), every link target resolves.
- Local tier run on the merged tree: fitness runner 44 functions 0 violations; run-test-suite.sh 12,366 pass, 1 fail (rule 13 cold-scan timing, below); test-discovery --check-unrun OK; invariant-coverage meta-gate PASS; closure-gate PASS (with GITHUB_TOKEN); audit-finding-status --strict exit 0; runner.mjs --mode=ci all PASS.

### Top paths removed (line counts are `cat | wc -l` before minus after)

- docs/dispatches/ except lane-common-contract.md: 7,390 (185 files before)
- docs/audits/ except 2026-10-11-complete-audit/ and aud-at2-route-guard-register-2026-10-08.md: 50,807 (includes docs/audits/layout-guard-2026-09-08.md and docs/audits/dead-code-manifest-2026-08-11.txt)
- docs/plans/ except complete-build-plan-2026-10-11.md: 28,771 (includes docs/plans/mobile-evidence/)
- docs/ops/ except session-log.md and session-log.d/ files dated 2026-10-01 onward plus README.md: 51,975 (session-log.md cut from 24,693 lines to 397, 344 entries to 13; 105 session-log.d files dated before 2026-10-01 removed; HANDOFF-*, chrome-audit-2026-07/, full-system-audit-2026-07-11/, wave-alpha-closeout-2026-07-11/, dispatch-ledger.jsonl and the rest of the directory)
- docs/census/: 258
- docs/design/ except ux-laws.md, design-principles.md, handoff-2026-09-06/, handoff-2026-09-07/: 22,227 (audit-2026-09-06/, decision-package-2026-07-06.md, parts-brief-2026-09-18.md, parts-inventory.md)
- docs/inventories/components.md, discipline.md: 263
- docs/doctrine/ (2 files): 206
- docs/tech-debt-log.md: 428; docs/data-audit-dispositions.md: 47
- fsi-app/docs/ except inventories/ and program/GOVERNING-PROGRAM.md: 16,820
- fsi-app/STATUS.md: 223; fsi-app/.claude/PLUGIN-NOTES.md: 43
- docs/ratifications/ and docs/archive/ (other than the 41 registers): already absent after CLEAN-1.

### Consumers handled

Rule 2a (evidence-only consumer, deleted or its stale assertion removed):
- fsi-app/scripts/maintenance/w1-dispositions.mjs and w1-dispositions.test.mjs: its only input was docs/plans/unwired-disposition-2026-08-31.md (REGISTER_DOC_PATH, w1-dispositions.mjs:36); the register is ruled closed (R-C) and the step only printed a worklist. Also removed: the maintenance.yml step "w1-dispositions" (was lines 211 to 217) and its entry in the workflow_dispatch options (line 39), the runbook chapter docs/runbooks/maintenance.d/03-w1-dispositions.md and its index line in docs/runbooks/MAINTENANCE-RUNBOOK.md:126, the comment mention in fsi-app/scripts/maintenance/lib/cli.mjs:10.
- fsi-app/.discipline/fitness/functions/F51-no-shared-append.test.mjs:389 (test "AMENDMENT 2 ATTACK (a)" read docs/dispatches/lane-briefs/2026-09-19/README.md) and its orphaned comment block; the then-unused readFileSync import on line 8.
- fsi-app/scripts/verify/capture-length-scan.test.mjs:44 and :48: two allowlist entries naming deleted files (the stale-entry assertion at :86 requires every entry to be tracked).
- fsi-app/scripts/verify/no-personal-identifiers.test.mjs:80: the allowlist entry for fsi-app/STATUS.md (stale-entry check).
- .claude/commands/done.md:7: the line telling a session to update docs/tech-debt-log.md.
- Rule 2b (live reader made or confirmed empty-tolerant): docs/audits/dead-code-manifest-2026-08-11.txt was read by fsi-app/.discipline/fitness/functions/F25-module-liveness.mjs:1370 (readManifest: existsSync, else empty set) and fsi-app/.discipline/governance/orphan-modules.mjs:60 (try/catch, else empty set). Both already tolerate absence; the manifest named 495 paths of which 3 exist; with it deleted the fitness runner reports F25 PASS and 0 violations. No code edit.
- Rule 2c: none needed (no deleted file was an imported fixture).

### Kept exceptions, each with the grep that justified it

- docs/dispatches/lane-common-contract.md: fsi-app/.discipline/governance/closure-gate.mjs:745 (readRepo), :425; fsi-app/scripts/verify/audit-finding-status.mjs:322; audit-finding-status.test.mjs:201; CLAUDE.md loading priority.
- docs/audits/aud-at2-route-guard-register-2026-10-08.md: fsi-app/scripts/verify/attacks/routes-attacked.mjs:51 (REGISTER_PATH) read at :289; routes-attacked.test.mjs:46,55,67,91,258,325; fsi-app/.discipline/governance/job-inputs.mjs:98.
- docs/inventories/migrations.md: fsi-app/scripts/proof/replay-migrations.mjs:68; scripts/inventories/generate-migrations-inventory.mjs:35; .discipline/consistency/checks/C3-migrations-reality.mjs; supabase/migrations/371_definer_hygiene.test.mjs:380; scripts/migrations/build-applied-map.test.mjs:219.
- docs/inventories/worktrees.md: .discipline/consistency/checks/C4-worktrees-reality.mjs:115 (readInventory; reports drift when missing).
- docs/inventories/out-of-band-objects.md: supabase/migrations/381_write_policies_name_their_role.test.mjs:211.
- fsi-app/docs/inventories/ (applied-migrations.json, db-check-constraints.json, shared-dataset-ownership.md): replay-migrations.mjs:69, supabase/migrations/_lib/applied-status.mjs:59, .discipline/check-vocabulary.test.mjs:57, supabase/migrations/384_schema_drift_reconcile_production_only.test.mjs:87.
- fsi-app/docs/program/GOVERNING-PROGRAM.md (the brief said delete all of fsi-app/docs except inventories; this one is read): .discipline/consistency/checks/C5-program-anchors-reality.mjs:33 (PROGRAM_DOC, drift if missing) and C5-program-anchors-reality.test.mjs:30.
- docs/ops/session-log.d/README.md: named by the memory gate's refusal message (memory-gate.mjs:74,176) and memory-gate.test.mjs:72.
- docs/design/handoff-2026-09-06/ and handoff-2026-09-07/: kept by the brief (rendering guard, design audit, capture scripts; see the CLEAN-1 log). Restored once after I deleted them by a wrong pattern in my own keep rule (0[67] does not match 09); the final tree matches origin/master for both directories.
- docs/ops/session-log.md: the memory gate reads presence of a changed file in a range (memory-gate.mjs:71 MEMORY_RE), not history; read whole before trimming. The SessionStart and PreCompact hooks read the last entries (.claude/hooks/session-start-vault.mjs:77, pre-compact-snapshot.mjs:62) and tolerate any length.

### Read and reused

- COMMON.md rules 2, 3, 11, 12, 15, 17, 18, 19 and clean1.md METHOD (reused verbatim); fsi-app/.discipline/governance/memory-gate.mjs whole (282 lines, 1 read call); consumer greps over fsi-app/src, scripts, .discipline, .github, .claude, fsi-app/.claude, supabase.

### Decisions

- Every deleted-path name for HISTORY-1 is in the "Top paths removed" list above.
- Local lint: fsi-app/node_modules is absent in the worktree (no junction allowed), so the four edited .mjs files were linted through the main checkout's eslint with --stdin-filename; one unused import was found and fixed; the whole-tree `eslint .` was not run for that reason.

### NOT done / Open items

- CLAUDE.md (root) still has table rows and a self-annealing pointer naming removed directories (docs/dispatches, docs/audits, docs/plans, docs/doctrine, docs/census, docs/tech-debt-log.md) and the brief said not to edit it. [WORK: owed]
- .claude/skills/ledger/SKILL.md cites docs/doctrine/worktree-isolation.md and fsi-app/.claude/CLAUDE.md cites docs/design/icm-dev-process-notes.md and docs/PERF-PLAYBOOK.md in prose; they are not readers, and neither file was in the write set. [WORK: owed]
- Several hundred code comments, harness family.json rationale strings and fullTraceRefs entries still cite removed docs (history text; run-artifact.mjs:184 only requires a non-empty string). [NOT-WORK: comments and rationale strings are history, not consumers]
- The F25 and orphan-modules readers of the deleted dead-code manifest remain as empty-tolerant dead reads. [NOT-WORK: removing them changes gate code outside this lane's scope and both tolerate absence]
- Local run-test-suite.sh fails "rule 13: the gate stays under 300 ms on the real tree" (cold scan 1,155 ms on this Windows host); the test measures a scan of the tree, which this lane made smaller. [NOT-WORK: host timing, CI runs Linux]
- audit-finding-status prints one undispositioned line (docs/ops/session-log.d/2026-10-11-data3a-lib-readers.md:65, another lane's file) and exits 0. [NOT-WORK: another lane's file, not a gate failure]
