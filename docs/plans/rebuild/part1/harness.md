# P1-08 harness: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-08, DISPOSITION lane, read-only. Tree: origin/master `904680db0`. Written by a cloud session on 2026-10-12 (clock from `date -u`). Every file in SCOPE was read whole with the Read tool; the coverage table below records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. No database was reached; every live figure below is quoted from a prior register and labelled with that register.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks and leading-`*` lines stripped; `--` lines for SQL; non-blank lines for JSON and Markdown). Raw lines are `wc -l`.

## 1. Header and coverage

Module: harness. The harness-run layer of fsi-app (the run artifact, the recorder into `harness_runs`, the chain hand-off, the loop id, the build-mode dry guard, the family registry and its 37 descriptors) plus the tooling runtimes the brief names: what survives of `scripts/lib`, `scripts/maintenance`, `scripts/gen`, `scripts/migrations`, `scripts/inventories`, `scripts/health`, and eight top-level files.

Coverage (104 files, 10,985 raw lines, 7,725 counted lines: 62 code files 10,099 raw / 6,848 code, 42 JSON or Markdown files 886 raw / 877 non-blank; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/) | raw lines | code lines | read calls |
|---|---|---|---|
| scripts/lib/absent-tolerant.mjs | 16 | 12 | 1 |
| scripts/lib/admin-phrase-scan.mjs | 46 | 34 | 1 |
| scripts/lib/batch-primitives.mjs | 187 | 131 | 1 |
| scripts/lib/canonical-key.mjs | 24 | 19 | 1 |
| scripts/lib/chained-dry-guard.mjs | 124 | 87 | 1 |
| scripts/lib/changelog.mjs | 99 | 65 | 1 |
| scripts/lib/db.mjs | 668 | 347 | 1 |
| scripts/lib/deferral.mjs | 115 | 81 | 1 |
| scripts/lib/drift-check.mjs | 91 | 71 | 1 |
| scripts/lib/emit-workflow-run-artifact.mjs | 102 | 86 | 1 |
| scripts/lib/env-file.mjs | 58 | 32 | 1 |
| scripts/lib/eurlex-cellar.mjs | 33 | 17 | 1 |
| scripts/lib/fetch-negative-probe.mjs | 127 | 99 | 1 |
| scripts/lib/flag-age.mjs | 52 | 37 | 1 |
| scripts/lib/free-pass.mjs | 48 | 24 | 1 |
| scripts/lib/gate-a-state-writer.mjs | 29 | 15 | 1 |
| scripts/lib/harness-run-number.mjs | 60 | 22 | 1 |
| scripts/lib/inconclusive-probe.mjs | 217 | 172 | 1 |
| scripts/lib/institution-key.mjs | 54 | 22 | 1 |
| scripts/lib/is-main-fixture.mjs | 5 | 4 | 1 |
| scripts/lib/is-main.mjs | 10 | 7 | 1 |
| scripts/lib/loop-run-id.mjs | 152 | 65 | 1 |
| scripts/lib/mutation-lease.mjs | 41 | 29 | 1 |
| scripts/lib/pg-conn.mjs | 77 | 62 | 1 |
| scripts/lib/quarantine-dwell.mjs | 71 | 50 | 1 |
| scripts/lib/r14-held-producer-cli.mjs | 149 | 79 | 1 |
| scripts/lib/rate-source-by-class.mjs | 72 | 33 | 1 |
| scripts/lib/record-harness-run.mjs | 277 | 189 | 1 |
| scripts/lib/revalidate.mjs | 92 | 63 | 1 |
| scripts/lib/run-artifact.mjs | 955 | 546 | 1 |
| scripts/lib/surface-registry.mjs | 147 | 121 | 1 |
| scripts/lib/table-primary-keys.mjs | 116 | 116 | 1 |
| scripts/lib/trigger-question-deps.mjs | 17 | 11 | 1 |
| scripts/lib/upstream-artifact.mjs | 307 | 254 | 1 |
| scripts/lib/verify.mjs | 68 | 54 | 1 |
| scripts/lib/walk-files.mjs | 25 | 15 | 1 |
| scripts/harness-runs/family-registry.mjs | 148 | 104 | 1 |
| scripts/harness-runs/governing-files.mjs | 29 | 15 | 1 |
| scripts/harness-runs/*/family.json (37 files) | 412 | 412 | 37 (one each) |
| scripts/migrations/build-applied-map.mjs | 244 | 195 | 1 |
| scripts/migrations/migration-compare.mjs | 167 | 131 | 1 |
| scripts/migrations/data/backfill-market-series-entity.mjs | 127 | 91 | 1 |
| scripts/inventories/generate-migrations-inventory.mjs | 208 | 130 | 1 |
| scripts/health/gate-a-probe.mjs | 19 | 17 | 1 |
| scripts/maintenance/lib/cli.mjs | 115 | 74 | 1 |
| scripts/maintenance/apply-deferrals.mjs | 173 | 129 | 1 |
| scripts/maintenance/canonical-autoverify.mjs | 744 | 438 | 1 |
| scripts/maintenance/derive-obligations.mjs | 74 | 62 | 1 |
| scripts/maintenance/enumerate-unclassified-hosts.mjs | 250 | 173 | 1 |
| scripts/maintenance/resolve-provisional-sources.mjs | 655 | 372 | 1 |
| scripts/maintenance/tag-proposals.mjs | 160 | 123 | 1 |
| scripts/maintenance/tag-ratification.mjs | 215 | 160 | 1 |
| scripts/maintenance/host-verdicts/README.md | 37 | 28 | 1 |
| scripts/maintenance/host-verdicts/host-verdicts-001.json | 13 | 13 | 1 |
| scripts/maintenance/host-verdicts/host-verdicts-379.json | 13 | 13 | 1 |
| scripts/maintenance/host-verdicts/load-host-verdicts.mjs | 94 | 78 | 1 |
| scripts/maintenance/host-verdicts/schema.json | 32 | 32 | 1 |
| scripts/gen/emission-factors-common.mjs | 220 | 132 | 1 |
| scripts/gen/fetch-desnz-factors.mjs | 791 | 631 | 1 |
| scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json | 379 | 379 | 1 |
| scripts/measure-bundles.mjs | 99 | 85 | 1 |
| scripts/holdings-audit.mjs | 239 | 199 | 1 |
| scripts/audit-skill-conformance.mjs | 156 | 119 | 1 |
| scripts/backfill-item-timelines.mjs | 160 | 114 | 1 |
| scripts/flag-fabricated-items.sql | 90 | 67 | 1 |
| scripts/d3-runs.ddl.sql | 28 | 13 | 1 |
| scripts/verify/migration-history-diff.mjs | 99 | 71 | 1 |
| scripts/proof/sync-applied-migrations.mjs | 64 | 54 | 1 |
| TOTAL | 10985 | 7725 | 104 |

Also read whole (inputs, not scope): the exemplar `docs/plans/rebuild/part1/auth-db.md` (2 calls); the harness CONVENTION, which CLEAN-3 deleted from the tree, read from `f906b210^:fsi-app/scripts/harness-runs/CONVENTION.md` (365 lines, 1 call); migration `331_harness_runs.sql` (102 lines, 1 call); the six prior registers under `docs/archive/audits/2026-10-11-complete-audit-registers/`: B2-part1-lib (86 lines, 2 calls), B1a-part3-whole-reads-harness-runs (124, 1), F1-harness-and-flywheel (301, 5), B2-part4-other-scripts (162, 4), B1b-whole-reads-maintenance (214, 3), D1-part1-github (361, 3).

What survives of `scripts/maintenance` and `scripts/gen` (the brief asked for the list): maintenance keeps 7 steps of 52 (`apply-deferrals`, `canonical-autoverify`, `derive-obligations`, `enumerate-unclassified-hosts`, `resolve-provisional-sources`, `tag-proposals`, `tag-ratification`), `lib/cli.mjs` and 5 `host-verdicts/` files; gen keeps `emission-factors-common.mjs`, `fetch-desnz-factors.mjs` and the DESNZ fixture [CONFIRMED: `git ls-files`; CLEAN-3 lane log lists why each was kept: a surviving importer].

Files not read whole: none. Test files: none exist in scope (`git ls-files` shows none; CLEAN-3 deleted them), so every "exported for its test" export has no importer. Workflows: only `.github/workflows/ci.yml` (lint, typecheck, build) and `live-smoke.yml` remain [CONFIRMED: `ls .github/workflows`]; CLEAN-3 deleted the other 26 and both composite actions.

Consumer evidence: `exports-consumers.mjs` (scratch) ran `grep -rlw <symbol>` over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github for all 312 exported symbols in scope, excluding the defining file (name occurrences, so an upper bound); then a second pass matched real import statements (`from "...lib/<name>.mjs"`) per scripts/lib module, and every DEAD claim below was checked by hand.

## 2. Module verdict

**REFACTOR AND PORT.** The harness responsibility is kept and must be smaller than any feature it records. Today it is the opposite: 1,521 code lines in eleven harness files plus 412 lines of 37 descriptors to record one row per run, two numbering authorities for one id, an on-disk artifact store that is written by 32 scripts and landed by a separate CLI, a committed ledger export that no longer exists, and a chain whose hand-off runs only as GitHub workflow steps that CLEAN-3 deleted. The surviving tooling in scope is mostly not harness at all: it belongs to sources, intake, the flywheel, the runtimes and the schema module and is handed to them below.

**Current code LOC: 6,848** (62 code files; plus 877 lines of JSON and Markdown). **Estimated clean LOC: about 460 for the harness itself, plus about 2,312 that leave this module for their owners; 2,772 in all.** Arithmetic (section 8 table): harness 460 (record 70, run frame and hand-off 150, families 80, outcome contract 40, proof readers 80, one CLI entry 40). Moved: core/db and env 342 (guarded layer 220, pg 30, env 20, absent-tolerant 12, revalidate 30, plus 30 for the merged lease helper is counted under runtimes); P1-03/04 intake 125 (canonical-key 19, eurlex-cellar 17, free-pass 24, changelog 50, gate-a writer 15); P1-05/06 sources 625 (institution key 15, rate-by-class 30, host-verdict loader 60, resolve-provisional 200, its unplaced export 60, canonical-autoverify 260); P1-09/10 flywheel 351 (tag-proposals 60, tag-ratification 90, trigger-question deps 11, carbon-intensity edge authorship 50, timeline resolver 70, plus derive-obligations folded into the flywheel call, 0); P1-12..15 runtimes 504 (apply-deferrals 70, deferral 60, quarantine dwell 45, mutation lease 29, DESNZ producer 300); P1-11 schema 405 (migration compare 120, applied map with history diff 150, migrations inventory 90, applied inventory 45); tools 60 (bundle measure). 460 + 342 + 125 + 625 + 351 + 504 + 405 + 60 = 2,872 minus the 100 counted twice in the moved figure for db (revalidate and absent-tolerant appear in both lists above) = 2,772. The harness shrinks from 1,933 counted lines (code plus descriptors) to 460, 24 percent. Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (8), with the files that carry them today:

1. Run record: one artifact per run with an eleven-key envelope, validated fail-closed, stamped with trigger, upstream run id, GitHub run id and governing hash, written to `scripts/harness-runs/<family>/<run_id>.json` (run-artifact.mjs:110-451), its id claimed atomically by `mkdir` on a `.claims/` marker (run-artifact.mjs:620-646).
2. Landing: the file is inserted into `harness_runs` by one writer that renumbers the id to the table's max+1 and renames the file to match (record-harness-run.mjs:113-180, harness-run-number.mjs:15-27); called by `deliver-artifact-branch.sh` per untracked file, by `emit-workflow-run-artifact.mjs --land`, and directly by `backfill-themes.mjs`.
3. Chain hand-off: a downstream reads its upstream's `harness_runs` row over REST and decides skip or proceed from per-consumer apply evidence and the no-op contract (upstream-artifact.mjs:18-112, run-artifact.mjs:258-281); the loop id travels from the upstream row (upstream-artifact.mjs `loop-id`, loop-run-id.mjs:48-152).
4. Build-mode hold: a chained, machine-dispatched or merge-push firing is forced dry while `system_state.scrape_cadence='off'`, failing closed (chained-dry-guard.mjs:14-66), and the run row says so (`workflow_run_forced_dry`, run-artifact.mjs:398-400).
5. Family registry: 37 `family.json` descriptors loaded at import and validated (family-registry.mjs:44-148), deriving the governing-file lists that the governing hash covers (governing-files.mjs:12-29).
6. Per-workflow and per-producer emitters: `emit-workflow-run-artifact.mjs` (the generic record of a workflow firing from its jobs' results), `r14-held-producer-cli.mjs` (the fixture/dry producer frame with its own envelope copy), and the maintenance step frame `maintenance/lib/cli.mjs` (`summary.json`, no ledger write).
7. Script infrastructure the runtimes share: the guarded DB layer for scripts (db.mjs), primary keys for pagination (table-primary-keys.mjs), env loading (env-file.mjs), the main guard (is-main.mjs), direct Postgres (pg-conn.mjs).
8. Tooling runtimes in scope (not harness): source resolution and autoverify, tag proposal and ratification, obligation derivation, deferral apply, DESNZ factor fetch and seeding helpers, migration-history reconciliation, the migrations inventory, timeline backfill, bundle measure, and four one-offs.

Key dependencies [CONFIRMED by the import and `.from(`/`.rpc(` scans]:

- Modules imported: node `fs`, `path`, `url`, `crypto`, `zlib`, `child_process` (none in scope), `util`; `@supabase/supabase-js` (lazy), `pg` (pg-conn.mjs lazy, batch-primitives.mjs static), `typescript` (drift-check.mjs lazy), `jiti` (resolve-provisional-sources.mjs, backfill-item-timelines.mjs). In-repo src: `src/lib/db/paginate.mjs`, `src/lib/sources/{classify-source-role.ts,institution.ts,host-authority.ts,tier-override-guard.mjs,bias-tag-pipeline.mjs,promote-provisional.ts,null-tier-host-worklist.mjs,vertical-fit-gate.ts,access-wall.mjs,officialness.mjs,entity-gate.mjs,snapshot-store.mjs,holdings-audit.mjs}`, `src/lib/agent/{floor-attribution.mjs,contract-version.mjs,extract-regulation-sections.ts,timeline-harvest.mjs,timeline-parse.mjs,formats/*,extract-registry.ts}`, `src/lib/connections/flag-namespaces.mjs`, `src/lib/learning/trigger-questions.mjs`, `src/lib/corrections/item-corrections.mjs`, `src/lib/vocabulary/adopted-terms.mjs`, `src/lib/contracts/{factor-tier.mjs,source-licence.mjs}`, `src/lib/propagation/author-edges.mjs`, `src/lib/market/series-registry.mjs`, `src/lib/health/gate-a-gauges.mjs`. In-repo scripts: `scripts/mint/{heal-provenance,export-census-rows}.mjs`, `scripts/connections/{propose-tags,apply-tags}.mjs`, `scripts/obligations/derive-obligations.mjs`, `scripts/producers/{lib/producer-summary,registry/load-registry}.mjs`, `supabase/migrations/_lib/applied-status.mjs`.
- Tables: `harness_runs` (insert, select by family and github_run_id), `system_state` (scrape_cadence, REST), `integrity_flags`, `sources`, `provisional_sources`, `source_bias_tags`, `canonical_source_candidates`, `intelligence_items`, `item_gate_a_state`, `item_changelog`, `item_timelines`, `emission_factors`, `market_series`, `obligations`, `holdings_quality`, `raw_fetches`, `agent_run_searches`, `section_claim_provenance`, and every table db.mjs is handed. RPCs: `acquire_mutation_lease`, `heartbeat_mutation_lease`, `release_mutation_lease`, `backfill_market_series_entity`. Views: none.
- Env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, DATABASE_URL, SUPABASE_DB_PASSWORD, CHAIN_PROOF_LOCAL, GITHUB_EVENT_NAME, GITHUB_RUN_ID, GITHUB_EVENT_WORKFLOW_RUN_ID, GITHUB_ACTIONS, CHAINED_FORCED_DRY, RUN_STEP, RUNNER_TEMP, TMPDIR, FSI_NO_ENV_FILE, DISCIPLINE_SNAP_DIR, APP_URL, WORKER_SECRET.
- External services: Supabase REST and Postgres (pooler candidates in 8 regions, pg-conn.mjs:7-10), GitHub Actions environment, gov.uk and assets.publishing.service.gov.uk (DESNZ), arbitrary candidate source URLs (canonical-autoverify polite fetch), the deployed app's `/api/revalidate`.

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | the on-disk artifact store and its plumbing | run-artifact.mjs 546 code (validate, write with stamping, `.claims/` mkdir id claim, read history, hash, ledger-export readers, two CLIs), record-harness-run.mjs 189, harness-run-number.mjs 22, plus 32 writer scripts calling `writeRunArtifact` [CONFIRMED: grep, `writers.txt`] | the table has been the record since R22 (2026-10-02); the file exists only to be landed, then renamed when the second numbering authority disagrees (record-harness-run.mjs:7-18, HARNESS-1). Tests wrote fixture runs into the real directories (F1-S6-03), and committed run ids overlap ledger ids for different runs (F1-S6-07, `mint-run-004`) | one in-process `recordRun()` insert; the id is the table's uuid; no file, no claim, no rename |
| 2 | 37 family descriptors and their registry | 412 JSON lines + family-registry.mjs 104 + governing-files.mjs 15 | a descriptor per family to feed a governing hash whose gate (F28) and export are deleted; rationales already disagree with their lists (chain-proof names about 12 governing files and lists 3; downstream-chain names the workflow and the action and lists the emitter only) [CONFIRMED: read]; one bad file throws at import for every importer (B1a-part3 row 1) | one `FAMILIES` constant: name, owning module, downstream families, apply-evidence predicate; the code version is the deploy SHA on the row |
| 3 | the chain as CLI text over workflow env | upstream-artifact.mjs 254, loop-run-id.mjs 65, chained-dry-guard.mjs 87 | the hand-off prints `CHAIN_SKIP=` lines for a workflow to export (upstream-artifact.mjs:296-299); the loop id is resolved three ways (explicit, on-disk artifact, ledger export); every workflow that called these was deleted by CLEAN-3, so on this tree the chain cannot fire [CONFIRMED: `ls .github/workflows`] | the run frame calls the downstream family in the same process after recording, passing `root_run_id` and its own row id; one mode resolver |
| 4 | three emitter frames for one record | emit-workflow-run-artifact.mjs 86, r14-held-producer-cli.mjs 79 (its own envelope copy at 131-149, adding `finished_at` the recorder then drops), maintenance/lib/cli.mjs 74 (writes `summary.json`, records nothing) | three ways to say "this ran, with this outcome"; the maintenance family's folder-to-artifact writer was deleted by CLEAN-3, so 7 surviving maintenance steps record nothing [CONFIRMED: B1b row write-run-artifact; `git ls-files`] | the run frame is the only frame; a step returns `{outputs, outcome}` |
| 5 | DESNZ fetch as a hand-rolled ZIP and OOXML parser writing a committed fixture | fetch-desnz-factors.mjs 631 code | parses the workbook correctly and refuses to guess (its strength), but its output is a rewritten JSON file in the repo (fetch-desnz-factors.mjs:772-775) that a customer page imports directly (`src/app/market/page.tsx:37`) | the producer writes `emission_factors` through the guarded path; the ZIP/OOXML reader becomes a shared lib (sbti imports `readZip` from it today) |
| 6 | canonical-autoverify comment and rule bulk | 744 raw, 438 code | rules carry cited row ids and dated incident prose inline; `factTokens` is hard-coded `[]` so the fact-token branch never runs (canonical-autoverify.mjs:647) [CONFIRMED: read]; dry fetches candidate and current URL per row (2 requests a row) | rules as a data table with one comment each; the fact-token path wired or removed |
| 7 | resolve-provisional-sources narrative and unreachable decline path | 655 raw, 372 code | about 50 header lines narrate defect D22; `rejectSourcesRow` and `SOURCES_REJECT_STATUS` are unreached by its own account (resolve-provisional-sources.mjs:427-431, 612-616) | the rule (a, b, b2, d) and the writes; history in the session log |
| 8 | the probe chain with no runtime caller | inconclusive-probe 172, fetch-negative-probe 99, surface-registry 121, drift-check 71, verify 54 = 517 code | each is reached only by a sibling probe (B2-part1 UNWIRED); their tests were deleted | the bug classes are recorded as properties (section 8); no code ported |
| 9 | one-off scripts kept as runtimes | holdings-audit 199, audit-skill-conformance 119, flag-fabricated-items.sql 67, backfill-market-series-entity 91, batch-primitives 131 | each did its job once or never; holdings-audit refuses a second write (holdings-audit.mjs:220); the conformance audit runs on import (no main guard, top-level await at :8 and :26) | TRASH; the knowledge they hold is in invariants and the source modules |
| 10 | table-primary-keys snapshot | 116 | a hand snapshot: 5 keys for dropped tables, 13 or more live tables missing (section 4) | keys read from the P1-11 generated schema |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github, excluding the defining file, and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| scripts/lib/batch-primitives.mjs:19-183 | withRetry, isGenericRetryable, isAnthropicRetryable, isPgRetryable, withRateLimit, withIdempotency, createPgPool | whole module | 0 importers [CONFIRMED: import scan]; its only importer was its deleted npmtest (B2-part1) |
| scripts/lib/admin-phrase-scan.mjs:3-46 | FORBIDDEN, ALLOWLIST, isAllowlisted, scanAdminPhrases | whole module | 0 importers [CONFIRMED]; its runner `scripts/verify/admin-phrase-scan.mjs` was deleted by CLEAN-3 |
| scripts/lib/inconclusive-probe.mjs, fetch-negative-probe.mjs, surface-registry.mjs, drift-check.mjs, verify.mjs | the probe chain (auditInconclusive, findFetchNegativeMappings, SURFACE_CLASSES, evalPredicate, assertReadBack, findRawSourceFetch and siblings) | modules | only importers are each other (inconclusive -> fetch-negative, surface-registry; surface-registry -> drift-check, verify) [CONFIRMED: import scan]; no production caller (B2-part1 UNWIRED) |
| scripts/lib/walk-files.mjs:13 | walkFiles | whole module | 0 importers [CONFIRMED]; its importers (verify audits) were deleted |
| scripts/lib/flag-age.mjs:3-52 | DWELL_BOUND_DAYS, isRd28Held, classifyOpenFlag, summarizeFlagAges | whole module | 0 importers [CONFIRMED]; `verify/flag-age-audit.mjs` deleted |
| scripts/lib/gate-a-state-writer.mjs:9,25 | readGateAStateRow, upsertGateAState | whole module | 0 importers [CONFIRMED]; `maintenance/gate-a-rescan.mjs` and `provenance-heal.mjs` deleted. The responsibility (one writer for item_gate_a_state) is live and moves (section 8) |
| scripts/lib/emit-workflow-run-artifact.mjs:20-96 | overallOutcome, buildWorkflowRunArtifact, emitWorkflowRun | whole module | 0 importers, 0 workflow invokers [CONFIRMED]; its five families (date-chain, design-audit, source-monitoring, spot-check-monthly, uptime-probes) have no workflow on this tree |
| scripts/lib/upstream-artifact.mjs:14-301 | every export and the CLI | whole module | 0 importers (all hits are comments) and its CLI invokers were deleted workflows [CONFIRMED: `grep -rn upstream-artifact`] |
| scripts/lib/chained-dry-guard.mjs:14-122 | resolveChainedRunMode, isMergeRef, readScrapeCadence, CLI | whole module | 0 importers, 0 invokers on this tree [CONFIRMED]; run-artifact.mjs reads only the `CHAINED_FORCED_DRY` env it used to set |
| scripts/lib/is-main-fixture.mjs:1-5 | (fixture) | file | spawned only by the deleted is-main.test [CONFIRMED] |
| scripts/lib/run-artifact.mjs:303-367 | HARNESS_LEDGER_EXPORT_PATH, readHarnessLedgerExport, newestLedgerRunAt, familyCurrentInLedger | ledger-export readers | the export file and its writer `export-harness-ledger.mjs` are absent [CONFIRMED: `ls`]; `readHarnessLedgerExport` therefore always returns `present:false`, so loop-run-id's ledger verification (loop-run-id.mjs:124-147) is inert |
| scripts/lib/run-artifact.mjs:754-955 | metricHeadline, formatRunListing, listFamiliesSummary, resolveRunIdArg, loadRunArtifactJSON, the `list/show/--dir` CLI | CLI | 0 importers [CONFIRMED]; the directories it lists hold 0 run files [CONFIRMED: `find scripts/harness-runs -name '*-run-*.json'` = 0] |
| scripts/lib/run-artifact.mjs:98 | isRunArtifactFilename | export | 0 importers outside the file [CONFIRMED] |
| scripts/lib/upstream-artifact.mjs:132-139 | NOOP_FAMILIES trace refs | data | all four traces point at deleted files (`docs/runbooks/POPULATION-TURN-RUNBOOK.md`, `PROPAGATION-DRAIN-RUNBOOK.md`, `scripts/harness-runs/{question-answers,theme-briefs}/FAMILY.md`) [CONFIRMED: `ls`]; `writeRunArtifact` accepts them because it checks only non-empty strings |
| scripts/harness-runs/family-registry.mjs:27,77 | PENDING_SEGMENT_RE guard | dead branch | no family lists a `pending/` path (pending markers deleted by GATE-3) [CONFIRMED: read the 37 lists]; B1a-part3 |
| scripts/harness-runs/family-registry.mjs:16,31,44 | HARNESS_RUNS_DIR, FamilyDescriptorError, validateFamilyDescriptor (exports) | export surface | 0 importers outside the file [CONFIRMED] |
| scripts/lib/db.mjs:363,364,415,426,562,583 | DEFAULT_UPDATE_CHUNK, STATEMENT_TIMEOUT_RE, DELETE_PROTECTED_TABLES, DEFAULT_DELETE_CHUNK, archiveRows, SOURCEY_ARCHIVE_REASONS (exports) | export surface | 0 importers outside db.mjs [CONFIRMED]; archiveRows is still called inside reclassifyToSource |
| scripts/lib/deferral.mjs:94,101,111 | sameBlockerReason, isValidRenewal, assertValidRenewal | exported functions | 0 importers [CONFIRMED]; the renewal rule (RD-6) has no caller |
| scripts/lib/env-file.mjs:5,11,16,25,53 | NO_ENV_FILE_VAR, DEFAULT_ENV_FILE, CREDENTIAL_VARS, envFileLoadSwitchedOff, withoutCredentials (exports) | export surface | used inside the file only; `withoutCredentials` existed for deleted tests [CONFIRMED] |
| scripts/lib/pg-conn.mjs:14,25,32,38 | isLoopbackHost, inLoopbackMode, connectOptionsFor, candidateConnStrings (exports) | export surface | used inside the file only [CONFIRMED]; `connectPg` has one importer (`scripts/source-role-cleanup.mjs`) |
| scripts/lib/changelog.mjs:1-24 | IMPACT_LEVEL_BY_SEVERITY, DEFAULT_IMPACT_LEVEL, impactLevelForSeverity, detectedByForField (exports) | export surface | used inside the file only [CONFIRMED] |
| scripts/lib/eurlex-cellar.mjs:1,4,15 | CELLAR_CELEX_PREFIX, CELLAR_ACCEPT, isCellarUrl (exports) | export surface | 0 importers [CONFIRMED]; the two importers use the builders only |
| scripts/maintenance/lib/cli.mjs:36,45,112 | REQUIRES_ARG, fanoutSkipSummary, defaultOutDir | exports | 0 importers outside; `REQUIRES_ARG` names `attach-found-sources` and `reopen-validation-holds`, both deleted, and `RUN_STEP=all` was set only by the deleted maintenance.yml [CONFIRMED] |
| scripts/maintenance/resolve-provisional-sources.mjs:66,617-627 | SOURCES_REJECT_STATUS, rejectSourcesRow | constant and dep | unreached from `main()` by the file's own account (:427-431) [CONFIRMED read]; B1b |
| scripts/maintenance/canonical-autoverify.mjs:301-305 | proveContent fact-token branch | branch | the only caller passes `factTokens: []` (:647) [CONFIRMED read] |
| scripts/maintenance/apply-deferrals.mjs:74-75 | PLAN_STEP, PLAN_FILE (exports) and 5 other exports | export surface | 0 importers outside [CONFIRMED]; plan-quarantine-disposition imports `main` only |
| scripts/gen/emission-factors-common.mjs:70-220 | naturalKey, buildRow, loadFixtureRows, validateAll, seedFactors, recordSeedFactorsSummary | exports | 0 importers [CONFIRMED]; the DESNZ and EPA seeders were deleted by CLEAN-3. Only `authorCarbonIntensityEdges` (:28) is live (imported by `scripts/entities/backfill-derivation-edges.mjs:4`) |
| scripts/gen/fetch-desnz-factors.mjs:14,24,286,474,641 | GOV_UK_PAGE_URL, DesnzStructureError, GROUP_TITLE_SELECTION_TABLE, extractFreightingGoodsRows, applyToFixture (exports) | export surface | 0 importers outside [CONFIRMED]; sbti imports `readZip` and the sheet parsers |
| scripts/migrations/build-applied-map.mjs:14-19,26,81,113 | FILE_KEY_PREFIX, fileKey, fileEntries, ROW_RULINGS, FILE_RULINGS, buildAppliedMap (exports) | export surface | 0 importers outside [CONFIRMED]; migration-history-diff imports MIG_DIR, MAP_PATH, ledgerKeys, serializeMap (a circular import with build-applied-map, which imports annotateMap back) |
| scripts/migrations/data/backfill-market-series-entity.mjs | whole file | one-off data step | 0 importers, 0 invokers (maintenance.yml deleted) [CONFIRMED]; the producer write path now stamps entity_id (B2-part4 row cites `src/lib/market/write-market-series.mjs:25`) |
| scripts/inventories/generate-migrations-inventory.mjs | whole file | CLI | 0 importers and 0 invokers on this tree (its consumer C3-migrations-reality was deleted) [CONFIRMED] |
| scripts/health/gate-a-probe.mjs:5 | runProbe | CLI | 0 invokers (uptime-probes.yml deleted) [CONFIRMED]; the decision lives in `src/lib/health/gate-a-gauges.mjs` |
| scripts/holdings-audit.mjs, audit-skill-conformance.mjs, flag-fabricated-items.sql, d3-runs.ddl.sql | whole files | one-offs | 0 importers, 0 invokers [CONFIRMED]; `d3_runs` is created by no migration (`grep -l d3_runs supabase/migrations` = 0) while `src/lib/d3/hooks.mjs:11` inserts into it from 6 route and lib callers and warns-and-skips on absence (owned outside this module) |
| scripts/maintenance/host-verdicts/schema.json | whole file | contract copy | no runtime reader [CONFIRMED]; its class enum is a second copy of `HOST_CLASS_TIER` keys (B1b) |

Not dead, verified live this session: `db.mjs` (84 importing files), `run-artifact.mjs` (35), `is-main.mjs` (63), `env-file.mjs` (63), `loop-run-id.mjs` (12, all emitters), `record-harness-run.mjs` (5), `harness-run-number.mjs` (3), `r14-held-producer-cli.mjs` (3), `rate-source-by-class.mjs` (6), `institution-key.mjs` (10), `mutation-lease.mjs` (4, incl. drain/plan-drain), `trigger-question-deps.mjs` (2), `deferral.mjs` (3), `quarantine-dwell.mjs` (1), `canonical-key.mjs` (2), `eurlex-cellar.mjs` (2), `free-pass.mjs` (1), `changelog.mjs` (1), `revalidate.mjs` (2), `absent-tolerant.mjs` (2), `pg-conn.mjs` (1), `migration-compare.mjs` (3), `sync-applied-migrations.mjs` (`parseAppliedInventory` by `supabase/migrations/_lib/applied-status.mjs`), the DESNZ fixture (`src/app/market/page.tsx:37`), `measure-bundles.mjs` (`package.json` script `perf:bundles`), `backfill-item-timelines.mjs` (named by date-chain's descriptor and by `src/lib/agent/timeline-backfill-derive.mjs`, no invoker).

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| run id numbering | `claimRunId` directory max+1 with `.claims/` markers (run-artifact.mjs:509-646) and `nextRunNumberFromHarnessRuns` table max+1 (harness-run-number.mjs:15-27), reconciled by renaming the file (record-harness-run.mjs:20-46) | the table's uuid primary key; family and started_at are columns |
| artifact envelope | `buildRunArtifactEnvelope` (run-artifact.mjs:590-618), `baseArtifactFields` (:488-496), `buildR14HeldRunArtifact` (r14-held-producer-cli.mjs:131-149) | one row shape built inside `recordRun` |
| run-mode and kill-switch reads | chained-dry-guard.mjs `readScrapeCadence` (REST, fail closed), maintenance/lib/cli.mjs exit 2 without creds, record-harness-run.mjs and upstream-artifact.mjs `isGitHubActions` fail-loud branches (:237-252, :259-266) | one `resolveRun()` in the run frame: credentials, mode, cadence, kill switch, once |
| governing version | `hashHarnessVersion` over `GOVERNING_FILES[family]` (run-artifact.mjs:702-735), stamped twice (top level and `config.governing_hash`, :426-432); `harness_version` column | the deploy SHA (`GITHUB_SHA` or the build id) on the row |
| workflow name to family | `FAMILY_BY_WORKFLOW_NAME` (loop-run-id.mjs:17-30), `APPLY_EVIDENCE` keyed by workflow name (upstream-artifact.mjs:18-47), the loop manifest (deleted) | `FAMILIES[name].downstream` with the evidence predicate beside it |
| hostOf | scripts/lib/institution-key.mjs:1, scripts/lib/pg-conn.mjs:20 (different meaning: connection-string host), scripts/_reground/free-pass-run.mjs:16, src/lib/sources/institution.ts:10, src/lib/sources/vertical-fit-gate.ts:11, src/lib/sources/identifier-variants.mjs:255 [CONFIRMED: grep, 6 definitions] | one `hostOf` in the sources module (P1-05/06); pg-conn's renamed `connHost` |
| walkFiles | scripts/lib/walk-files.mjs:13; surface-registry.mjs:58 | both TRASH |
| dwell bounds | `DWELL_BOUND_DAYS = 14` quarantine-dwell.mjs:3; `= 30` flag-age.mjs:3 (two different properties under one name) | two named constants in the runtimes module, one per invariant (INV-002 and the flag-dwell invariant) |
| page loop | tag-ratification.mjs:169-184 hand-rolls a 1,000-row range loop beside `readAll` | `readAll` |
| tag signature columns | tag-proposals.mjs:126-127 `SIG` "kept in lockstep with that file's SIG by hand" | export the column list from the proposer |
| unplaced-host loop | enumerate-unclassified-hosts.mjs `collectUnresolvedRows`, reused by resolve-provisional-sources.mjs `export-unplaced` (:284-302) | one export mode in resolve-provisional-sources; enumerate becomes its report |
| cross-step import for one pure function | enumerate-unclassified-hosts.mjs:5 and resolve-provisional-sources.mjs:19 import `existingTierForHost` from canonical-autoverify.mjs, pulling heal-provenance and export-census-rows (B1b) | `existingTierForHost` lives in the sources lib |
| cache tag names | revalidate.mjs:3-21 mirrors `src/lib/data.ts` PUBLIC_ITEMS_TAG and `src/lib/cache/revalidate-item.ts` itemTag/surfaceDetailTag by hand | import the tag functions from the one cache module |
| main guards | `isMainModule` (is-main.mjs), `IS_MAIN` by path compare (apply-deferrals.mjs:158, canonical-autoverify.mjs:729, derive-obligations.mjs:63, tag-proposals.mjs:113, tag-ratification.mjs:158), argv regex (fetch-negative-probe.mjs:101, inconclusive-probe.mjs:191), `argv[1] === fileURLToPath` (fetch-desnz-factors.mjs:778), `endsWith` (generate-migrations-inventory.mjs:191) | one CLI entry that dispatches a family by name; modules export functions only |
| service client construction | db.mjs `realWriteClient` (:105-113), harness-run-number.mjs `buildHarnessRunsClient` (:52-60), record-harness-run.mjs `runCli` (:257-260) | the P1-01 core/db service factory |
| producer summary vs run row | `writeProducerSummary` (emission-factors-common.mjs:211, fetch-desnz-factors.mjs:768,775) folded by the deleted producers emitter | the producer returns outputs to the run frame |
| migration map and diff | build-applied-map.mjs imports `annotateMap` from verify/migration-history-diff.mjs, which imports `MIG_DIR`, `MAP_PATH`, `ledgerKeys`, `serializeMap` back (a cycle) | one P1-11 module |

Over-abstraction: the `deps` injection seams in record-harness-run (`readAllFn`, `createClientFn`, `isGitHubActions`), upstream-artifact (`readRowsFactory`, `writeNoop`, `claimId`, `versionOf`), r14-held-producer-cli (six fs/claim/hash seams) and emit-workflow-run-artifact (`landFn`, `familyDir`, `now`) exist for tests that CLEAN-3 deleted. Keep one seam (the Supabase client) in the new recorder, where the new tree's test uses it.

## 6. Non-essential artifacts

- 37 `family.json` descriptors (412 lines): metadata for a gate that no longer exists; rationales are dated lane narratives.
- `scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json` (379 lines): 4 published factors and 7 null shells, with a 123-line provenance essay. It is regulatory-grade data committed in the repo and read by a customer page (`src/app/market/page.tsx:37`), which standing rule 1 forbids (facts live in Supabase). Whether the 4 rows are live in `emission_factors` was not measured [HYPOTHESIS].
- `scripts/flag-fabricated-items.sql` (90 lines): a one-shot INSERT of 16 `integrity_flags` rows from 2026-05-29; whether it ran is unrecorded (B2-part4: DEAD).
- `scripts/d3-runs.ddl.sql` (28 lines): a second run-ledger design (`d3_runs`) never applied; the one ledger is `harness_runs`.
- `scripts/maintenance/host-verdicts/README.md` (37) and `schema.json` (32): documentation and a contract copy of the loader; the README names a fixture (`host-verdicts-000.fixture.json`) deleted by CLEAN-3 [CONFIRMED: `ls`].
- `host-verdicts-001.json` and `-379.json` are not artifacts: they are session-authored rulings the loader applies (kept, section 7).

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's grep) | note. Paths under fsi-app/.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| scripts/lib/run-artifact.mjs | 1-955 (955) | envelope validate and write with stamping, id claim, history read, governing hash, ledger-export readers, CLI | REFACTOR AND PORT | 40 (outcome contract only) | 35: run-extraction, write-statutory, backfill-themes | keep `noopContractErrors` (:258-281) and the trigger vocabulary; everything else TRASH (section 4); its validation error text still tells the reader to edit ALLOWED_FAMILIES, CONVENTION.md and F28 (:141-148), all gone [CONFIRMED read] |
| scripts/lib/record-harness-run.mjs | 1-277 (277) | the one `harness_runs` insert, renumber, file reconcile, CLI exit 0/1/2 | REFACTOR AND PORT | into record.ts (70) | 5: write-statutory, backfill-themes, plan-quarantine-disposition, emit-workflow-run-artifact, deliver-artifact-branch.sh | `baseRow` maps no `finished_at` and no outcome, so every row's `finished_at` is NULL [CONFIRMED read :61-76]; `proposer_notes` dropped |
| scripts/lib/upstream-artifact.mjs | 1-307 (307) | chain hand-off gate, upstream row read over REST, no-op artifact, CLI | REFACTOR AND PORT | into run.ts (60) | 0 importers; invokers deleted | `decideChainGate` (:56-82) and `APPLY_EVIDENCE` (:18-47) are the rule worth keeping |
| scripts/lib/loop-run-id.mjs | 1-152 (152) | loop id from explicit, artifact or ledger; FAMILY_BY_WORKFLOW_NAME; resolveHarnessRunContext | REFACTOR AND PORT | 0 (root_run_id column) | 12: upstream-artifact, emit-workflow-run-artifact, emit-gate-a-rescan-artifact | the ledger check is inert (section 4) |
| scripts/lib/chained-dry-guard.mjs | 1-124 (124) | rule-16 forced dry for machine-fired runs; cadence read fails closed | REFACTOR AND PORT | into run.ts (35) | 0 importers; invokers deleted | the decision (:14-41) is the build-mode hold as code |
| scripts/lib/emit-workflow-run-artifact.mjs | 1-102 (102) | record a workflow firing from job results, `--land` | REFACTOR AND PORT | into record.ts (0 extra) | 0 | `overallOutcome` (:20-26) becomes the outcome rule |
| scripts/lib/harness-run-number.mjs | 1-60 (60) | table max+1, id format, raw client | TRASH | 0 | 3: write-statutory, plan-quarantine-disposition, record-harness-run | second numbering authority |
| scripts/lib/r14-held-producer-cli.mjs | 1-149 (149) | fixture producer frame, refusal message, envelope copy | TRASH | 0 | 3: backfill-themes, state-cost-facts-producer, carrier-ets-surcharge-producer | a held producer records outcome `refused` through the run frame |
| scripts/harness-runs/family-registry.mjs | 1-148 (148) | load and validate 37 descriptors at import | REFACTOR AND PORT | 0 (families.ts 80) | 3 code importers: governing-files, run-artifact, emit-producers-artifact | import-time throw is a single point of failure (B1a-part3) |
| scripts/harness-runs/governing-files.mjs | 1-29 (29) | derive governing-file map | TRASH | 0 | 30 (every runner) | replaced by the code SHA |
| scripts/harness-runs/*/family.json (37) | 412 total | per-family descriptor | TRASH | 0 | family-registry.mjs | section 8 maps each family |
| scripts/lib/db.mjs | 1-668 (668) | guarded script writes (cite, snapshot, chunking, halving on statement timeout), read-only client proxy, PK-ordered pagination, registerSource, reclassifyToSource | REFACTOR AND PORT (core/db, scripts side) | 220 | 84: dispatch-extraction, write-statutory, research-walker | header cites the deleted `scripts/verify/pagination-order-key-audit.mjs` (:280) [CONFIRMED read]; snapshots go to gitignored `scripts/_snapshots` (:98-102), so a CI run's reversal record is lost with the runner [HYPOTHESIS: no CI write run inspected] |
| scripts/lib/table-primary-keys.mjs | 1-116 (116) | PK map for readAll ordering | REFACTOR AND PORT (P1-11 generated) | 0 | 1: db.mjs | 114 entries; stale keys for case_studies, case_study_endorsements, taxonomy_nodes (dropped 335), promotion_policy (341), user_list_order (343); missing obligation_objects, entity_relations, entity_aliases, item_assignments, item_correction_evidence, item_corrections, item_notes, portfolio_members, portfolios, source_reliability_ledger, signposts, research_assessments, inference_records [CONFIRMED: migration grep] |
| scripts/lib/env-file.mjs | 1-58 (58) | guarded `.env.local` load, credential list | KEEP AS-IS | 20 | 63 | |
| scripts/lib/is-main.mjs | 1-10 (10) | CLI main guard | TRASH | 0 | 63 | the one CLI entry replaces per-file guards |
| scripts/lib/is-main-fixture.mjs | 1-5 (5) | test fixture | TRASH | 0 | 0 | |
| scripts/lib/pg-conn.mjs | 1-77 (77) | direct Postgres candidates incl. loopback mode | REFACTOR AND PORT (core/db) | 30 | 1: source-role-cleanup.mjs | 8-region pooler guessing (:7-10, :57) and `rejectUnauthorized:false` (:33) [CONFIRMED read] |
| scripts/lib/absent-tolerant.mjs | 1-16 (16) | read tolerant of an unapplied migration | KEEP AS-IS (P1-09/10) | 12 | 2: raise-term-needs, term-recurrence | |
| scripts/lib/revalidate.mjs | 1-92 (92) | POST tags to /api/revalidate | REFACTOR AND PORT (cache) | 30 | 2: apply-record-briefs, apply-mint-batch | tag names duplicated (section 5) |
| scripts/lib/mutation-lease.mjs | 1-41 (41) | per-item lease rpc wrappers | KEEP AS-IS (P1-12..15) | 29 | 4: plan-drain, _reground/lease, id-stamp | no test (B2-part1 UNPROVEN) |
| scripts/lib/deferral.mjs | 1-115 (115) | deferral payload validity, renewal rule | KEEP AS-IS (P1-12..15) | 60 | 3: plan-quarantine-disposition, apply-deferrals, quarantine-dwell | renewal half has no caller (section 4) |
| scripts/lib/quarantine-dwell.mjs | 1-71 (71) | dwell classification of quarantined items | KEEP AS-IS (P1-12..15) | 45 | 1: plan-quarantine-disposition | |
| scripts/lib/flag-age.mjs | 1-52 (52) | open-flag dwell classification | TRASH | 0 | 0 | the property is recorded (section 8) |
| scripts/lib/canonical-key.mjs | 1-24 (24) | JS mirror of migration 255 key derivation | KEEP AS-IS (P1-03/04) | 19 | 2: heal-provenance, export-census-rows | |
| scripts/lib/eurlex-cellar.mjs | 1-33 (33) | Cellar URLs, robot-gate detect | KEEP AS-IS (P1-03/04) | 17 | 2: heal-provenance, export-census-rows | `cellarEndpointForOj` labelled [HYPOTHESIS] in its own comment (:26-29) |
| scripts/lib/free-pass.mjs | 1-48 (48) | free re-attribution decision | KEEP AS-IS (P1-03/04) | 24 | 1: _reground/free-pass-run | |
| scripts/lib/changelog.mjs | 1-99 (99) | item_changelog row per brief or timeline change | KEEP AS-IS (P1-03/04) | 50 | 1: apply-record-briefs | |
| scripts/lib/gate-a-state-writer.mjs | 1-29 (29) | item_gate_a_state read and upsert | REFACTOR AND PORT (P1-03/04) | 15 | 0 | merges into the intake Gate A writer |
| scripts/lib/institution-key.mjs | 1-54 (54) | host, shared-portal institution key, sameInstitution | REFACTOR AND PORT (P1-05/06) | 15 | 10: canonical-autoverify, inaccessible-triage, db.mjs | merge with src institution.ts |
| scripts/lib/rate-source-by-class.mjs | 1-72 (72) | rate a candidate source through the class table and verdicts | KEEP AS-IS (P1-05/06) | 30 | 6: research-walker, neso producer, state-cost producer | rule 18 |
| scripts/lib/trigger-question-deps.mjs | 1-17 (17) | deps for trigger-question writes | KEEP AS-IS (P1-09/10) | 11 | 2: run-propagation-drain, run-population-flywheel | |
| scripts/lib/admin-phrase-scan.mjs | 1-46 (46) | human-gate phrase lint | TRASH | 0 | 0 | property recorded |
| scripts/lib/batch-primitives.mjs | 1-187 (187) | retry, rate limit, idempotency, pg pool | TRASH | 0 | 0 | B-0351, B-0708 |
| scripts/lib/drift-check.mjs | 1-91 (91) | AST drift predicates | TRASH | 0 | 1 (probe) | |
| scripts/lib/fetch-negative-probe.mjs | 1-127 (127) | fetch-failure lexicon probe | TRASH | 0 | 1 (probe) | |
| scripts/lib/inconclusive-probe.mjs | 1-217 (217) | bug-class detector forms 1-4 | TRASH | 0 | 0 | |
| scripts/lib/surface-registry.mjs | 1-147 (147) | surface classes and content-fetch audit | TRASH | 0 | 2 (probes) | |
| scripts/lib/verify.mjs | 1-68 (68) | read-back assertion primitives | TRASH | 0 | 1 (probe) | |
| scripts/lib/walk-files.mjs | 1-25 (25) | recursive walker | TRASH | 0 | 0 | |
| scripts/maintenance/lib/cli.mjs | 1-115 (115) | step frame: args, env, creds exit 2, summary.json | REFACTOR AND PORT (run frame) | 0 | 6 surviving steps + others (B1b: 62 files then) | `process.exit` inside makes a step un-awaitable (B1b) |
| scripts/maintenance/apply-deferrals.mjs | 1-173 (173) | insert one disposition_deferred flag per valid row | REFACTOR AND PORT (P1-12..15) | 70 | 1: plan-quarantine-disposition | no existence check: a re-run inserts a second open flag per item (:140-146) [CONFIRMED read] |
| scripts/maintenance/canonical-autoverify.mjs | 1-744 (744) | rule every pending canonical candidate: reach, page class, content proof, authority | REFACTOR AND PORT (P1-05/06) | 260 | 2: enumerate-unclassified-hosts, resolve-provisional-sources (one function) | approve is two writes and a repoint with no transaction (:695-711) [CONFIRMED read] |
| scripts/maintenance/derive-obligations.mjs | 1-74 (74) | step wrapper over obligations/derive-obligations.mjs | TRASH (wrapper) | 0 | 1: run-population-flywheel | the flywheel calls the derivation directly |
| scripts/maintenance/enumerate-unclassified-hosts.mjs | 1-250 (250) | list hosts no rule places | REFACTOR AND PORT (P1-05/06) | 60 | 2: resolve-provisional-sources, host-authority.ts (comment) | reads whole agent_run_searches and intelligence_items per run (:246-247) |
| scripts/maintenance/resolve-provisional-sources.mjs | 1-655 (655) | promote or worklist provisional sources by rules a, b, b2, d | REFACTOR AND PORT (P1-05/06) | 200 | 4: research-walker, drain/kinds, promote route (comment), host-verdicts README | writes provisional_sources, sources, source_bias_tags, integrity_flags (B1b) |
| scripts/maintenance/tag-proposals.mjs | 1-160 (160) | step over proposeTags | REFACTOR AND PORT (P1-09/10) | 60 | 1: run-population-flywheel | CITE still says "for operator ratification" (:16) [CONFIRMED read] |
| scripts/maintenance/tag-ratification.mjs | 1-215 (215) | decide every open tag flag by rule | REFACTOR AND PORT (P1-09/10) | 90 | 2: run-population-flywheel, apply-tags | |
| scripts/maintenance/host-verdicts/load-host-verdicts.mjs | 1-94 (94) | load committed verdict batches | KEEP AS-IS (P1-05/06) | 60 | 6: rate-source-by-class, resolve-provisional-sources, research-walker | |
| scripts/maintenance/host-verdicts/host-verdicts-001.json | 1-13 (13) | verdict: carbonintensity.org.uk class gov | KEEP AS-IS (data) | 13 | loader | evidence says the About page was not fetched (B1b) |
| scripts/maintenance/host-verdicts/host-verdicts-379.json | 1-13 (13) | verdict: ukpowernetworks.opendatasoft.com class company | KEEP AS-IS (data) | 13 | loader | numbered by lane, not sequence |
| scripts/maintenance/host-verdicts/README.md | 1-37 (37) | procedure | TRASH | 0 | drain/kinds.mjs names the directory | one paragraph moves into the loader |
| scripts/maintenance/host-verdicts/schema.json | 1-32 (32) | contract copy | TRASH | 0 | 0 | |
| scripts/gen/emission-factors-common.mjs | 1-220 (220) | seeding helpers and carbon-intensity edge authorship | REFACTOR AND PORT (P1-09/10, authorship only) | 50 | 1: backfill-derivation-edges (authorship) | seeders deleted; mid-file import at :111 |
| scripts/gen/fetch-desnz-factors.mjs | 1-791 (791) | DESNZ workbook fetch and parse into the fixture | REFACTOR AND PORT (P1-12..15 producer) | 300 | 1: sbti-target-dashboard-producer (readZip) | writes a committed file instead of the table |
| scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json | 1-379 (379) | 4 factors, 7 shells, provenance | TRASH | 0 | 1: src/app/market/page.tsx:37 | rule 1; section 6 |
| scripts/migrations/migration-compare.mjs | 1-167 (167) | stored-vs-file SQL comparison | KEEP AS-IS (P1-11) | 120 | 3: build-applied-map, migration-history-diff, _lib/applied-status | |
| scripts/migrations/build-applied-map.mjs | 1-244 (244) | APPLIED-MAP.json from reconciliation and rulings | REFACTOR AND PORT (P1-11) | 150 (with the diff) | 1: migration-history-diff (cycle) | 46 ROW_RULINGS, 10 FILE_RULINGS [CONFIRMED: node import] |
| scripts/verify/migration-history-diff.mjs | 1-99 (99) | diff record per code-differs entry | REFACTOR AND PORT (P1-11, merged) | 0 | 1: build-applied-map | |
| scripts/proof/sync-applied-migrations.mjs | 1-64 (64) | applied-migrations inventory build and parse | KEEP AS-IS (P1-11) | 45 | 1: _lib/applied-status | DEFAULT_OUT is fsi-app/docs/inventories/applied-migrations.json (exists) |
| scripts/migrations/data/backfill-market-series-entity.mjs | 1-127 (127) | one-off entity stamp for migration 373 | TRASH | 0 | 0 | whether it ran is unmeasured [HYPOTHESIS] |
| scripts/inventories/generate-migrations-inventory.mjs | 1-208 (208) | migrations.md table from subject lines | REFACTOR AND PORT (P1-11) | 90 | 0 | resolver for the inventory-equals-files property |
| scripts/health/gate-a-probe.mjs | 1-19 (19) | CLI over decideGateAProbe | TRASH | 0 | 0 | the health runtime calls the src function |
| scripts/measure-bundles.mjs | 1-99 (99) | per-route bundle inventory | REFACTOR AND PORT (tools) | 60 | package.json perf:bundles | named by the perf doctrine; derive ROUTES from the app directory |
| scripts/holdings-audit.mjs | 1-239 (239) | one-time holdings_quality classification | TRASH | 0 | 0 | reads the whole grounding pool into memory (:47) |
| scripts/audit-skill-conformance.mjs | 1-156 (156) | brief conformance flags | TRASH | 0 | 0 | runs on import; N+1 full_brief reads (:62-63); writes to absent `scripts/_diag` |
| scripts/backfill-item-timelines.mjs | 1-160 (160) | stored timeline sections into item_timelines | REFACTOR AND PORT (P1-09/10 resolver) | 70 | 0 invokers | resolver for INV on timelines |
| scripts/flag-fabricated-items.sql | 1-90 (90) | one-shot flag insert | TRASH | 0 | 0 | |
| scripts/d3-runs.ddl.sql | 1-28 (28) | second ledger DDL, never applied | TRASH | 0 | 0 | |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/core/harness/record.ts | record-harness-run.mjs 59-180; emit-workflow-run-artifact.mjs 20-26 | `recordRun(row)`: one insert into `harness_runs` returning the id; `outcomeOf(results)` | 70 |
| src/core/harness/run.ts | chained-dry-guard.mjs 14-66; upstream-artifact.mjs 56-112; run-artifact.mjs 380-416 (stamping); maintenance/lib/cli.mjs 70-108 | `runFamily(name, input)`: resolve credentials, mode (forced dry while scrape_cadence is off for any machine-fired run), kill switches; start; call the family function; record outcome (success, noop, refused, failed) with outputs; then, on success with apply evidence, call each downstream family in process with `root_run_id` and `upstream_run_id`; a skipped downstream is recorded as `noop` with its reason | 150 |
| src/core/harness/families.ts | 37 family.json; loop-run-id.mjs 17-30; upstream-artifact.mjs 18-47 | `FAMILIES`: name, owning module id, function, downstream names, apply-evidence predicate | 80 |
| src/core/harness/outcome.ts | run-artifact.mjs 27-68, 241-281 | outcome and trigger vocabularies; the no-op contract (a noop row carries no write count above zero) | 40 |
| src/core/harness/proofs.ts | (new; reads what record.ts writes) | the six operator proofs as queries (below) | 80 |
| scripts/run.ts | is-main.mjs; env-file.mjs; every per-file CLI | the one CLI: `run <family> [--mode] [--input]` | 40 |
| src/core/db/script-writes.ts (with P1-01 core/db) | db.mjs 41-668; table-primary-keys.mjs (replaced by P1-11 generated keys) | read-only client proxy, PK-ordered pagination, guarded update/insert/delete/upsert with cite and reversal record, registerSource, reclassifyToSource | 220 |
| src/core/db/pg.ts | pg-conn.mjs 14-77 | direct Postgres for the two schema tools; explicit URL only | 30 |
| src/core/env.ts | env-file.mjs 1-58 | env load | 20 |
| src/core/cache/revalidate-tags.ts | revalidate.mjs 31-71 | POST tags; tag names imported from the cache module | 30 |
| P1-03/04 intake | canonical-key.mjs 3-24; eurlex-cellar.mjs 1-33; free-pass.mjs 23-48; changelog.mjs 51-99; gate-a-state-writer.mjs 9-29 | key derivation, Cellar URLs, free re-attribution, changelog writer, Gate A state writer | 125 |
| P1-05/06 sources | institution-key.mjs 1-54; rate-source-by-class.mjs 29-72; load-host-verdicts.mjs 1-94; resolve-provisional-sources.mjs 89-645; enumerate-unclassified-hosts.mjs 30-224; canonical-autoverify.mjs 39-727 | one hostOf and institution key; rate by class; verdict loader; resolve provisional with its unplaced export; canonical autoverify | 625 |
| P1-09/10 flywheel | tag-proposals.mjs 24-111; tag-ratification.mjs 35-156; trigger-question-deps.mjs 9-17; absent-tolerant.mjs 1-16; emission-factors-common.mjs 28-68; backfill-item-timelines.mjs 67-152; derive-obligations.mjs 24-61 (folded) | tag propose and ratify, question deps, carbon-intensity edge authorship, timeline resolver | 351 |
| P1-12..15 runtimes | apply-deferrals.mjs 23-156; deferral.mjs 30-115; quarantine-dwell.mjs 17-71; mutation-lease.mjs 4-41; fetch-desnz-factors.mjs 34-711 | deferral apply with a per-item existence check; dwell; leases; DESNZ producer writing emission_factors | 504 |
| P1-11 schema | migration-compare.mjs 1-167; build-applied-map.mjs 21-215; migration-history-diff.mjs 16-79; sync-applied-migrations.mjs 12-47; generate-migrations-inventory.mjs 30-188 | migration history map and diff (no cycle), applied inventory, migrations inventory | 405 |
| tools/measure-bundles.ts | measure-bundles.mjs 1-99 | bundle inventory with routes from the app directory | 60 |

### Every family in the old code and its place in the one recorder

Emitter kinds today [CONFIRMED: grep of writers, read of the 37 descriptors]: (A) runner writes its own artifact through `writeRunArtifact`; (B) per-family `emit-*-artifact.mjs` or `*/artifact.mjs`; (C) the generic `emit-workflow-run-artifact.mjs`; (D) `r14-held-producer-cli.mjs`; (E) none on this tree. Landing was a separate step (`deliver-artifact-branch.sh` or `--land`) in every case except backfill-themes.

| family | old emitter | kind | runtime on this tree | in the new tree |
|---|---|---|---|---|
| brief-apply | scripts/turns/apply-record-briefs.mjs | A | script only (workflow deleted) | P1-03/04 family `brief-apply`, downstream `gate-a-rescan`, `source-resolution` |
| brief-export | scripts/turns/emit-brief-export-artifact.mjs | B | script only | P1-03/04 `brief-export` |
| carrier-ets-proxy | carrier-ets-surcharge-producer.mjs | D | fixture CLI | P1-12..15 producer, outcome `refused` while R14 holds |
| chain-proof | (emitter deleted) | E | none | not a production family: the CI chain proof records into the stack's own ledger (P1 proof) |
| change-detection | scripts/turns/run-change-detection.mjs | A | script only | P1-12..15 `change-detection` |
| corpus-turn | emit-corpus-turn-artifact.mjs (deleted by CLEAN-3b, PR 1132) | E | none | P1-09/10 `corpus-turn`, downstream `downstream-chain`, `theme-briefs` |
| date-chain | emit-workflow-run-artifact.mjs | C | none | P1-09/10 `date-chain` (timeline resolver + forward-event dispatch) |
| design-audit | emit-workflow-run-artifact.mjs | C | none (ci.yml no longer runs it) | not a family: a CI check |
| downstream-chain | scripts/turns/emit-downstream-chain-artifact.mjs | B | script only | P1-09/10 `downstream-chain`, downstream `propagation` |
| fetch-drain | scripts/turns/run-fetch-drain.mjs | A | script only | P1-12..15 `fetch-drain` |
| forward-events | scripts/forward-events/run-extraction.mjs | A | script only | P1-09/10 `forward-events` |
| gate-a-rescan | scripts/turns/emit-gate-a-rescan-artifact.mjs | B | script only (rescan script deleted) | P1-03/04 `gate-a-rescan` |
| inaccessible-triage | scripts/sources/inaccessible-triage.mjs | A | script only | P1-05/06 `inaccessible-triage` |
| judgement-drain | scripts/drain/artifact.mjs | B | `npm run drain:plan` | P1-12..15 `judgement-drain` (switch off) |
| ledger-consume | scripts/turns/run-ledger-consume.mjs | A | script only | P1-03/04 `ledger-consume`, downstream `mint`, `corpus-turn` |
| live-smoke | scripts/turns/emit-live-smoke-artifact.mjs | B | live-smoke.yml (the only live harness path) | `live-smoke` (P5 proof) |
| maintenance | (folder writer deleted) | E | none | dissolved: each step becomes the family of its owning module |
| meta-harness | (no runner) | E | none | TRASH: the harness is code, versioned by SHA |
| mint | scripts/mint/run-mint-batch.mjs | A | script only | P1-03/04 `mint`, downstream `brief-export`, `gate-a-rescan`, `downstream-chain`, `question-answers` |
| needs-search | scripts/turns/needs-search/artifact.mjs | B | script only | P1-05/06 `needs-search` |
| producers | scripts/producers/emit-producers-artifact.mjs | B | script only | P1-12..15 one family per producer, downstream `propagation` |
| propagation | scripts/turns/run-propagation-drain.mjs | A | script only | P1-09/10 `propagation`, downstream `question-answers` |
| quarantine-disposition | scripts/plan-quarantine-disposition.mjs | A | script only | P1-12..15 `quarantine-disposition` |
| question-answers | scripts/turns/question-answers/artifact.mjs | B | script only | P1-09/10 `question-answers` |
| research-assessment | research-assessment-producer.mjs | A | script only | P1-12..15 `research-assessment` |
| research-walker | scripts/research/research-walker.mjs | A | script only | P1-05/06 `research-walker`, downstream `source-resolution` |
| screen | scripts/mint/screen-worklist.mjs | A | script only | folded into `mint` (one family per runtime) |
| source-monitoring | emit-workflow-run-artifact.mjs | C | none | P1-05/06 `source-monitoring` |
| source-resolution | scripts/turns/emit-source-resolution-artifact.mjs | B | script only | P1-05/06 `source-resolution` |
| source-sweep | run-source-sweep.mjs, research-sweep.mjs | A | script only | P1-03/04 `source-sweep`, downstream `fetch-drain`, `ledger-consume` |
| spot-check-monthly | emit-workflow-run-artifact.mjs | C | none | P1-05/06 `spot-check` |
| state-cost | state-cost-facts-producer.mjs | D | fixture CLI | P1-12..15 producer, `refused` while R14 holds |
| statutory | scripts/propagation/write-statutory.mjs | A | script only | P1-09/10 `statutory` |
| structured-actions | scripts/turns/dry-run-structured-actions.mjs | A | script only | P1-03/04 `structured-actions` |
| theme-backfill | scripts/research/backfill-themes.mjs | A (lands itself) | script only | one-off: TRASH after it runs once |
| theme-briefs | scripts/turns/theme-briefs/artifact.mjs | B | script only | P1-09/10 `theme-briefs` |
| uptime-probes | emit-workflow-run-artifact.mjs | C | none | `uptime-probes` (calls decideGateAProbe) |

Count: 37 families; 21 kind A, 9 kind B, 5 kind C, 2 kind D, and 9 with no writer on this tree (the five C families, chain-proof, corpus-turn, maintenance, meta-harness; the C ones have a writer but nothing invokes it) [CONFIRMED: grep and `ls`]. Every row lands through one `recordRun` in the new tree.

### Data model (the one ledger; P1-11 owns the migration)

Today `harness_runs` (migration 331): `run_id` text pk, `harness_family`, `harness_version`, `started_at`, `finished_at`, `trigger`, `github_run_id`, `upstream_run_id`, `config`, `inputs_ref`, `per_item`, `metrics`, `defects_found`, `full_trace_refs` (jsonb), `source_branch`, `source_artifact_path`, `created_at`; RLS on, no policy, anon and authenticated revoked [CONFIRMED read]. Written by record-harness-run.mjs only. Never written: `finished_at` (baseRow omits it), `source_branch` and `source_artifact_path` (the one-time import script is deleted) [CONFIRMED read and `ls`]. Read by: upstream-artifact.mjs (REST, `run_id,harness_family,trigger,github_run_id,started_at,config,metrics`) and harness-run-number.mjs (`run_id`). 305 rows on 2026-10-11 across 23 families, 159 of them live-smoke; of 146 non-live-smoke rows in the 280-row export, 2 were apply and one did work (F1 register, disclosed DB read; not re-measured).

Proposed (one table, inputs, outputs, outcome): `id uuid pk`, `family text not null` (checked against FAMILIES), `root_run_id uuid not null` (the loop id; equals `id` for a chain head), `upstream_run_id uuid null references harness_runs(id)`, `trigger text` (dispatch, chained, push, schedule, manual), `mode text` (dry, apply), `forced_dry boolean`, `outcome text not null` (success, noop, refused, failed), `reason text`, `inputs jsonb`, `outputs jsonb` (counts and the ids touched), `error text`, `code_sha text`, `github_run_id text`, `started_at`, `finished_at not null`. `harness_version`, `per_item`, `defects_found`, `full_trace_refs`, `source_branch`, `source_artifact_path` are not carried. The parallel ledgers `brief_apply_runs` (migration 322, written by scripts/turns/io-preflight.mjs and apply-record-briefs.mjs) and the unapplied `d3_runs` collapse into this one [HYPOTHESIS: ruling owed by P1-11 and P1-03/04].

### Interface to other modules

- Exports offered: `runFamily`, `recordRun`, `FAMILIES`, `outcomeOf`, the proof queries; the scripts write layer (`readClient`, `readAll`, `readAllByIds`, `guardedUpdate`, `guardedUpdateByIds`, `guardedInsert`, `guardedInsertMany`, `guardedUpsert`, `guardedDelete`, `registerSource`, `reclassifyToSource`), `connectPg`, `loadEnv`, `revalidateTags`.
- Imports needed: P1-01 core/db service client factory; P1-11 generated schema (primary keys, the new ledger table); `system_state` reads (P1-05/06 owns the pause readers per P1-01).
- Consumers by module id: P1-03/04 intake (mint, ledger-consume, source-sweep, brief-apply, brief-export, gate-a-rescan, structured-actions run as families; they own canonical-key, eurlex-cellar, free-pass, changelog, the Gate A writer); P1-09/10 flywheel (downstream-chain, propagation, question-answers, theme-briefs, corpus-turn, forward-events, date-chain, statutory; tag propose and ratify, edge authorship, timeline resolver); P1-12..15 runtimes (fetch-drain, change-detection, judgement-drain, quarantine-disposition, producers, research-assessment; leases, deferrals, the DESNZ producer); P1-05/06 sources (research-walker, source-resolution, source-monitoring, inaccessible-triage, needs-search, spot-check; resolve-provisional, autoverify, verdicts, rate-by-class); P1-11 schema (the ledger migration, generated keys, migration-history tools).
- Gap for the coordinator: the brief names P1-12..15 as one range; this register assigns producers, drains and quarantine to it without a finer id. `scripts/turns/*`, `scripts/mint/*`, `scripts/drain/*` and `scripts/producers/*` (the runtimes themselves) are outside this scope; their emitters are mapped above but not read.

### Invariants this code enforces

Already in data-invariants.md: INV-002 (deferral within 14 days, apply must dedupe), INV-005 (canonical candidates ruled), INV-021 and INV-114 (quarantine disposition planned), INV-051 (machine-fired runs dry while cadence is off), INV-058 (run id unique), INV-059 (loop id trust), INV-060 (artifact validates and stamps), INV-098 (every family has dispatch evidence), INV-099 (loop evidence matches real rows), INV-140 (harness_runs unreadable by anon and authenticated). INV-058, INV-059 and INV-060 describe the file mechanism this plan removes; their property survives in INV-162 to INV-164. Appended by this lane, same commit: INV-162 (every runtime firing lands exactly one ledger row with inputs, outputs and outcome, a no-op, refusal, forced-dry or failure included), INV-163 (a runtime that succeeds with apply evidence triggers its declared downstream in the same run, and the downstream row carries the upstream id and the root run id), INV-164 (the ledger table is the only run record: no run writes a committed artifact file, and no test or fixture writes the real ledger), INV-165 (a customer surface reads published figures from Supabase, never from a committed fixture under scripts/).

Properties (not data invariants) the new tree must carry as checks: a held producer cannot write (R14), the run frame fails loud in CI when credentials are missing and self-skips locally (rule 15), every recurring worker checks its kill switch before work (rule 11), no human-gate phrase in an admin surface (the admin-phrase-scan rule), a fetch failure never resolves to a negative verdict and a classifier's uncertainty never defaults to a substantive value (the probe chain's bug classes, recorded here instead of ported).

### Rulings the code embodies (cite)

- Rule 17, nothing runs alone (CLAUDE.md, operator 2026-09-04): every runtime records its outcome and triggers its downstream; record-harness-run.mjs:240-243 fails the CI step when it cannot record.
- Rule 16, build mode holds the cadence off: chained-dry-guard.mjs:14-30; a push to master is machine-triggered (coordinator ruling 2026-10-06, lane G6-DRAIN, chained-dry-guard.mjs:32-42).
- Rule 15, fail loud and self-skip only without credentials and outside CI (record-harness-run.mjs:186-196, upstream-artifact.mjs:259-266).
- R22 (2026-10-02): artifacts land only in `harness_runs`; operator ruling 2026-09-27 "yes supabase but do not reinvent processes" (migration 331 header).
- GATE-3 (2026-10-08): the ledger records that a run happened; markers were deleted (CONVENTION.md).
- GATE-9 / AUD-AT-5: the no-op contract and the forged-row refusal in the hand-off (run-artifact.mjs:246-281, upstream-artifact.mjs:57-61, 98-104).
- HARNESS-1 (2026-10-10): one value in two places, the ledger id and the file name (record-harness-run.mjs:7-18), the defect this plan removes by removing the file.
- Operator 2026-09-06: a machine-verifiable replacement source is ruled without a human, and a wall is not a dead link (canonical-autoverify.mjs:591-598, 103-115).
- D13 (defect-fix-plan 2026-09-12): accessibility never rejects a source (resolve-provisional-sources.mjs:72-80); S8-E5 (2026-10-08): a host verdict outranks the residue name rule (:82-85); rule 18, rate the source (rate-source-by-class.mjs:37-39).
- Operator 2026-09-03: tag proposals are decided by rule (tag-ratification.mjs:17-19).
- R14: held producers have no write path (r14-held-producer-cli.mjs:15-21).
- RD-6 (operator 2026-07-13): a renewal must name a new blocker (deferral.mjs:82-108).
- Canonical transport mode `ocean` (migration 263) in the DESNZ fixture rows.
- The operator on this lane (brief): "Don't forget the harness", "as long as the harness is not creating bloat".

### Proof that the module works in the new tree (the six operator proofs read from the ledger)

1. P1 chain proof green: the CI chain proof runs every family in hop order against the local stack's own `harness_runs`; green means one `root_run_id` with a `success` row for every family on the chain and no `failed` row.
2. P2 ten real minted pages: `select outputs->'minted_item_ids' from harness_runs where family='mint' and mode='apply' and outcome='success'` yields ten ids, each opened by URL.
3. P3 their ledger rows with non-zero flywheel outcomes: rows sharing those runs' `root_run_id` in the flywheel families with an output count above zero.
4. P4 one real source change: a `change-detection` row, `mode='apply'`, `outputs->>'changes_detected' >= 1`, with the item it touched.
5. P5 data audits green on the deploy: the `live-smoke` (or audit) row whose `code_sha` is the deployed SHA has `outcome='success'`.
6. P6 the five falsification tests: CI checks, not ledger rows; the ledger adds nothing here and the register does not claim it.
Unit tests, each red against a broken copy first: `recordRun` writes exactly one row for success, noop, refused, failed and a thrown function; the mode resolver forces dry for a chained run when the cadence is off and fails closed when the read errors; the hand-off refuses a forged upstream row and a no-op that reports writes; a downstream is called once, with the upstream id; no file is written under scripts/.

### Port order

1. P1-11 lands the ledger migration and generated keys.
2. src/core/harness (outcome, families, record, run, proofs) and scripts/run.ts.
3. The script write layer, pg and env into core/db.
4. The live family first: live-smoke moves to `runFamily` (it is the only harness path that runs today).
5. Each owning module ports its runtimes onto `runFamily` in chain order (source-sweep, fetch-drain, ledger-consume, mint, the flywheel families, propagation, question-answers), deleting its emitter in the same change.
6. The tooling runtimes move to their modules (sources, flywheel, runtimes, schema, tools).
7. Delete scripts/harness-runs, scripts/lib harness files and the TRASH rows.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| A run record per firing, dry and no-op included | run-artifact.mjs, record-harness-run.mjs, upstream-artifact.mjs noop | core/harness/record |
| Trigger and forced-dry stamping | run-artifact.mjs 380-403 | run frame |
| Build-mode forced dry for machine-fired runs, fail closed | chained-dry-guard.mjs | run frame |
| Upstream hand-off with apply evidence and the no-op contract | upstream-artifact.mjs, run-artifact.mjs | run frame, families |
| Loop id carried along a chain | loop-run-id.mjs, upstream-artifact.mjs loop-id | `root_run_id` |
| Which code version a run used | governing hash | `code_sha` |
| Unique, collision-free run ids | claimRunId, harness-run-number | uuid |
| Workflow outcome from job results | emit-workflow-run-artifact.mjs | `outcomeOf` |
| Held producers record their refusals | r14-held-producer-cli.mjs | outcome `refused` |
| Family list and their governing files | family-registry, family.json x37 | families.ts |
| List and show a family's runs | run-artifact.mjs CLI | a SQL query in proofs.ts |
| CI fails when it cannot record; local self-skip | record-harness-run.mjs runCli | run frame |
| Step frame: mode, arg, summary | maintenance/lib/cli.mjs | run frame |
| Guarded script writes with cite and reversal record | db.mjs | core/db script-writes |
| Read client that refuses writes | db.mjs readClient | core/db |
| Lossless PK-ordered pagination | db.mjs readAll, table-primary-keys | core/db with P1-11 keys |
| Statement-timeout halving on large updates | db.mjs guardedUpdateByIds | core/db |
| Delete-protected append-only tables | db.mjs DELETE_PROTECTED_TABLES | core/db |
| Source registration and reclassify-then-archive | db.mjs registerSource, reclassifyToSource | core/db, P1-05/06 |
| Direct Postgres for schema tools | pg-conn.mjs | core/db/pg |
| Env load and credential list | env-file.mjs | core/env |
| Revalidate cache tags after writes | revalidate.mjs | core/cache |
| Mutation leases | mutation-lease.mjs | P1-12..15 |
| Deferral validity and renewal rule | deferral.mjs | P1-12..15 |
| Quarantine dwell classification | quarantine-dwell.mjs | P1-12..15 |
| Deferral apply (with dedupe added) | apply-deferrals.mjs | P1-12..15 |
| Canonical key derivation | canonical-key.mjs | P1-03/04 |
| Cellar URLs and robot gate | eurlex-cellar.mjs | P1-03/04 |
| Free re-attribution | free-pass.mjs | P1-03/04 |
| Item changelog writer | changelog.mjs | P1-03/04 |
| Gate A state writer | gate-a-state-writer.mjs | P1-03/04 |
| Institution key and shared portals | institution-key.mjs | P1-05/06 |
| Rate a source by class and verdict | rate-source-by-class.mjs, load-host-verdicts.mjs, host-verdicts-*.json | P1-05/06 |
| Provisional source resolution and the unplaced export | resolve-provisional-sources.mjs, enumerate-unclassified-hosts.mjs | P1-05/06 |
| Canonical candidate autoverify | canonical-autoverify.mjs | P1-05/06 |
| Tag proposal and rule ratification | tag-proposals.mjs, tag-ratification.mjs | P1-09/10 |
| Obligation derivation step | derive-obligations.mjs | P1-09/10 (direct call) |
| Trigger-question deps | trigger-question-deps.mjs | P1-09/10 |
| Migration-tolerant reads | absent-tolerant.mjs | P1-09/10 |
| Carbon-intensity edge authorship | emission-factors-common.mjs 28-68 | P1-09/10 |
| Timeline backfill from stored briefs | backfill-item-timelines.mjs | P1-09/10 resolver |
| DESNZ factor fetch and parse | fetch-desnz-factors.mjs | P1-12..15 producer, writing the table |
| Migration compare, applied map, diff, applied inventory | migration-compare, build-applied-map, migration-history-diff, sync-applied-migrations | P1-11 |
| Migrations inventory page | generate-migrations-inventory.mjs | P1-11 |
| Bundle measurement | measure-bundles.mjs | tools |
| Gate A honesty probe | gate-a-probe.mjs | uptime-probes family calling src gate-a-gauges |
| Emission-factor seeding from fixtures | emission-factors-common seedFactors (seeders deleted) | NOT PORTED as code: factors enter through the producer |
| Holdings classification run | holdings-audit.mjs | NOT PORTED: one-off; classification lives in src/lib/sources/holdings-audit.mjs |
| Brief conformance flags | audit-skill-conformance.mjs | NOT PORTED: the write-time contract (system-prompt and record-briefs schema) is the check |
| Fabricated-item flags of 2026-05-29 | flag-fabricated-items.sql | NOT PORTED: data, in the database if it ran |
| d3 heartbeat ledger | d3-runs.ddl.sql | NOT PORTED: the one ledger; `src/lib/d3/hooks.mjs` should call `recordRun` (owner outside this module) |
| market_series entity stamp backfill | backfill-market-series-entity.mjs | NOT PORTED: the write path stamps it |
| Batch retry, rate limit, idempotency, pg pool | batch-primitives.mjs | NOT PORTED: no caller |
| Human-gate phrase lint, bug-class probes, open-flag dwell report | admin-phrase-scan, probe chain, flag-age.mjs | NOT PORTED as code: recorded as properties above |

### Defects the new code must not repeat (from the backlog rows in scope; section 9 of the backlog file carries the STATUS cells)

Two numbering authorities for one run id and a file renamed to agree (B-0353 context, F1-S6-07), a recorder that drops `finished_at`, a descriptor list whose rationale disagrees with it (section 3), a registry that throws at import (B-0310), a primary-key snapshot that goes stale (B-0384 to B-0387, B-1132), an apply step with no existence check (B-0065), a dead decline path kept for later (B-0696), a CITE that names a retired human step (B-1061), per-file main guards in five forms (B-2201 to B-2203), six hostOf definitions (B-2204, B-2205), committed fact data read by a page (section 6).
