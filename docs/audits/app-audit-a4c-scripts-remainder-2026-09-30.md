# Audit A4c: scripts remainder register (2026-09-30)

Lane A4c (SCRIPTS-REMAINDER), Sonnet, read-only. Read set: every file under `fsi-app/scripts/**`
EXCEPT `turns/`, `maintenance/`, `mint/`, `lib/`, `verify/`, `producers/`, `connections/` (A4/A4b),
and `harness-runs/**`, `tmp/`, `_snapshots/` (excluded per dispatch). Covers `_archive/`, `_diag/`,
`_plans/`, `_reground/`, `_ruling/`, `_worklists/`, `classification/`, `community/`, `coordinator/`,
`entities/`, `forward-events/`, `gen/`, `inventories/`, `obligations/`, `propagation/`,
`remediation/`, `review/`, `sources/`, `spec09/`, and every top-level script file ,  **157 files,
24,863 lines**.

**Method note on depth.** Every file in the read set was opened. Production/write-path `.mjs` files
(~90 files, including every file in classification/, entities/, propagation/, forward-events/,
review/, spec09/, sources/, obligations/, community/, remediation/, coordinator/, the top-level
scripts, and a representative sample of `_archive/`) were read in full, line by line, with findings
recorded as they were found. A whole-tree grep sweep for `TODO|FIXME|XXX`, empty catch blocks,
`process.exit(0)` near error paths, and hardcoded-credential patterns was run against the **entire**
157-file set (zero hits on TODO/FIXME and zero hardcoded credentials anywhere in the read set ,  see
Decision-ready build items). `*.test.mjs`/`*.npmtest.mjs` siblings of an already-fully-read production
file, and the `_archive/lib/*` files whose zero-importer claim is independently backed by
`_archive/README.md`'s own documented evidence gate (see Coverage appendix), received a full read on a
sample and a structural pass (header, main guard, test assertions) on the remainder ,  this is
disclosed per-row in the Coverage appendix, not hidden.

## Summary table

| Class | Count |
|---|---|
| Findings, [CONFIRMED] | 9 |
| Findings, [HYPOTHESIS] | 1 |
| Findings, [REFUTED] | 0 |
| Files recommended for archive/delete | 2 (+ systemic gitignore gap covering thousands more, out of this lane's write set) |
| Files over 800 lines | 2 (`classification/apply-classifications.mjs` 1071, `gen/fetch-desnz-factors.mjs` 901) |
| Files missing a main-module guard convention | 2 |
| Files with a write bypassing the guarded db.mjs path | 1 |
| Duplicate-code clusters (F45/F46) | 1 (mitigated by design) |

No TODO/FIXME/XXX, no hardcoded API keys/passwords/tokens, and no swallowed-error `process.exit(0)`
masking a failure were found anywhere in the 157-file read set. Every write-capable script in the
non-archived portion of the read set defaults to dry-run/report-only and requires an explicit
`--apply`/`--execute` flag to write, and every write observed routes through
`scripts/lib/db.mjs`'s guarded path (cite + snapshot + read-back) with exactly one exception (F-06).

## Per-class findings

| ID | File:line | Finding | Status | Severity | Better solution (class fix) | Effort |
|---|---|---|---|---|---|---|
| F-01 | `scripts/_plans/` (11 files, e.g. `_plans/funded-releases-2026-07-06T16-43-20-646Z.json`, `_plans/t1-run.log`) | `scripts/_plans/` is git-tracked (confirmed via `git ls-files scripts/_plans`), despite `fsi-app/.claude/CLAUDE.md` rule 5 naming it in full as sanctioned **gitignored** scratch ("gitignored scratch (`fsi-app/scripts/tmp/`, `_snapshots/`, `_plans/`) if regenerable"). `.gitignore` has no entry for `_plans/`, `_diag/`, `tmp/`, or `_snapshots/` at all. | [CONFIRMED] ,  `grep -n "_plans" fsi-app/.gitignore` returns nothing; `git ls-files scripts/_plans` lists 11 tracked run-log/JSON artifacts. | P2 | Add `fsi-app/scripts/_plans/`, `_diag/`, `tmp/`, `_snapshots/` to `.gitignore`; `git rm --cached` the accumulated dated run-output that rule 5 says should never have been committed (or move genuinely worth-keeping items to `docs/archive/logs/` per the same rule). | S |
| F-02 | `scripts/_diag/` (19 tracked files incl. `_conformance.json`, `_redo.log`, three `_spotcheck_*.md` run outputs, `_test-one/*.json`) | Same class as F-01: `_diag/` is not in rule 5's sanctioned-scratch list and is not gitignored, but is git-tracked machine evidence (regeneration dry-run/apply logs, per-item conformance dumps). Rule 5: "machine evidence never lands in docs/ top level... gitignored scratch... if regenerable." `_diag/` output is regenerable (each file is the printed/JSON output of a script also in this read set) and is not scratch-ignored. | [CONFIRMED] via `git ls-files scripts/_diag` (19 rows) and `.gitignore` grep (no match). | P2 | Same as F-01: gitignore `_diag/`, untrack the accumulated logs. | S |
| F-03 | `scripts/flag-fabricated-items.sql` | A one-off, dated (2026-05-29) SQL INSERT script for a single historical B-audit remediation still sits in the main `scripts/` tree rather than `_archive/`. It has zero non-historical-doc references (`grep -rl flag-fabricated-items` finds only two audit docs mentioning it descriptively, matching `_archive/README.md`'s own "stale prose mention does not block archival" criterion) and is superseded by the guarded-write / integrity_flags tooling this lane's other files use. | [CONFIRMED] file exists at top level; zero live references beyond descriptive doc mentions (checked via repo-wide grep). | P3 | `git mv scripts/flag-fabricated-items.sql scripts/_archive/` with a one-line `_archive/README.md` ledger entry, matching the existing archival convention exactly. | S |
| F-04 | `scripts/d3-runs.ddl.sql` | Standalone DDL for a `d3_runs` table described by its own header as "DEFINED, NOT APPLIED ,  no deploy target yet." No `supabase/migrations/*.sql` file creates this table (checked: `find supabase/migrations -iname "*d3_runs*"` ,  no hits); `src/lib/d3/hooks.mjs` (outside this lane's scope) already reads/writes against `d3_runs` and is documented to degrade to "NEVER → UNKNOWN" when the table is absent, so this is an intentional, honestly-reported gap rather than a defect ,  the DDL is orphaned relative to the migration mechanism but the consuming code already fails closed. | [CONFIRMED] no migration applies this DDL; [HYPOTHESIS] whether `d3_runs` should ever be promoted to a real migration is a product decision outside this audit's scope, not investigated further here. | P3 | When/if D3 self-liveness is deployed, fold this DDL into a numbered `supabase/migrations/*.sql` file (two-track policy, rule 3) rather than leaving it as a standalone `.sql` file in `scripts/`. | S |
| F-05 | `scripts/holdings-audit.mjs:257` | `main().catch(...)` runs unconditionally at module scope with no `isMainModule`/`IS_MAIN` guard ,  the only write-capable top-level script in the read set that doesn't follow the repo's own established safe-import convention (`scripts/lib/is-main.mjs`, used by ~40 other files in this same read set, explicitly to make a module "SAFELY IMPORTABLE... without kicking off a real Supabase sweep," per `backfill-item-timelines.mjs`'s own header). No test file imports this module today, so it is not currently *broken*, but it is inconsistent with the class-wide convention and would silently run a live audit against the DB the moment any future test tried to import it. | [CONFIRMED] ,  `grep -n "process.argv\[1\]\|isMainModule\|IS_MAIN" scripts/holdings-audit.mjs` shows no guard before `main().catch(...)`. | P3 | Wrap in the same `isMainModule(import.meta.url)` guard every sibling script uses. | S |
| F-06 | `scripts/propagation/seed-derived-values.mjs:286-308` | The `estimated_values` table write (`sb.from("estimated_values").upsert(...)`) goes through a **raw** `createClient()` instance built directly in `main()` (line ~407-408), not through `scripts/lib/db.mjs`'s `guardedInsert`/`guardedUpdate`/`guardedInsertMany` ,  the guarded path rule-015 requires everywhere else in this read set (cite + prior-state snapshot + reversibility). The file's own header (lines 119-125) documents this as deliberate ("there is no `register_estimated_value` RPC... a plain upsert... is the documented, transaction-safe write here"), but it is still a write with no cite object, no snapshot, and no reversibility record ,  the exact three things rule-015 exists to guarantee, and every other writer in this 157-file set (including this same file's sibling `derived_values` write via `registerDerivedValue`) gets them. | [CONFIRMED] by reading the write call and confirming `sb` is the raw `createClient()` from `main()`, never `scripts/lib/db.mjs`'s exports (which this file does import and use correctly for `guardedInsertMany` elsewhere, e.g. `resolveRegionEntityId`). | P2 | Add a `guardedUpsert` helper to `scripts/lib/db.mjs` (snapshot pre-image via a `select` on the conflict target, cite, then upsert) so `estimated_values` writes get the same audit trail as every other guarded write; migrate this call site to it. | M |
| F-07 | `scripts/spec09/{indexation,surcharge-audit,dqi,auxiliary-energy}-producer.mjs` | Four CSV-upload producer scripts (spec 09 section 1.2-section 1.5) are near-identical: each repeats the same ~35-line shape (check `csvText`, check `orgId`, `parseCsvUpload`, map rows with `org_id`, conditionally `guardedInsertMany`, build an identical `summary` object). This is the textbook F45/F46 duplicate-code shape. Partially, deliberately mitigated: each file inlines its own table-name string literal at the `guardedInsertMany` call site specifically so a static "closure-gate WRITER-READER check" (documented identically in all four files) can grep it ,  a shared helper would need to preserve that per-call-site literal. `eudr-custody-producer.mjs` (two tables) and `gen/emission-factors-{desnz,epa}.mjs` already extracted their shared core into `emission-factors-common.mjs`/`rows-file.mjs`-style modules; these four did not receive the equivalent treatment. | [CONFIRMED] by diffing the four files' `main()` bodies ,  structurally identical apart from the table name, gap message, and CITE reason string. | P3 | Extract a `runCsvUploadProducer({ table, gapMessage, deps })` helper in `scripts/spec09/lib/` that still emits the write call with an inlined literal at the CALLER's own site (pass a small per-table write-closure in, not a generic table-name parameter) so the closure-gate contract survives; the four thin wrappers keep only their own CITE + gap text. | M |
| F-08 | `scripts/entities/backfill-entities.mjs:274` and `scripts/entities/backfill-lineage-edges.mjs` (no guard at all) | `backfill-entities.mjs`'s main-guard is `process.argv[1] && process.argv[1].endsWith("backfill-entities.mjs")` ,  a weaker, ad hoc form of the same check every `isMainModule`-using sibling performs, vulnerable in principle to a false match from any other file also named `backfill-entities.mjs` on `argv[1]`'s path. `backfill-lineage-edges.mjs` has no main-guard at all (`main().catch(...)` runs unconditionally at module scope, same shape as F-05), and additionally uses a raw `createClient()` for its reads (writes correctly route through `scripts/lib/db.mjs`'s guarded functions). | [CONFIRMED] by reading both files' end-of-file entrypoint code. | P3 | Standardize both on `isMainModule(import.meta.url)` from `scripts/lib/is-main.mjs`, matching the convention `seed-corridors.mjs`/`write-entity-scope.mjs`/`derive-obligations.mjs` (same `entities/`-adjacent lane) already follow. | S |
| F-09 | `scripts/_ruling/null-tier-host-ruling.mjs` | The file's own header states "Emits SQL + a reversibility CSV," but the file itself only exports two frozen data structures (`RULING` array, `BY_HOST` map) ,  there is no SQL-emission or CSV-emission code anywhere in the file. The module IS live (imported by `src/lib/sources/host-authority-ruling-conformance.test.mjs`), so this is a doc/header-vs-implementation drift, not a dead-code issue. | [CONFIRMED] by reading the full 93-line file (no emit logic present) against its own header claim. | P3 | Correct the header comment to describe what the file actually does (a pure ruling-data export consumed by a conformance test), or note where the SQL/CSV emission actually happened (a one-off, already-run script not committed) ,  either way, the header should not claim behavior the file doesn't have. | S |

## Decision-ready build items

- **Delete/archive list** (evidence that nothing invokes each file, per file):
  - `scripts/flag-fabricated-items.sql` → `scripts/_archive/` (F-03). Evidence: `grep -rl "flag-fabricated-items" --include="*.mjs" --include="*.md" --include="*.yml" .` (repo root) returns only two audit docs quoting it historically (`docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md`, `fsi-app/docs/sprint4-governing-state.md`); no script, workflow, or `package.json` entry references it.
  - No other file in this 157-file read set met the archive bar (zero live inbound references AND superseded/completed). `scripts/_archive/` itself already documents 26 correctly-archived files with their own zero-importer evidence (`_archive/README.md`'s two ledgers), independently spot-checked here against three of them (`phase-5-backfill.mjs`, `sprint3-corpus-reclassify-audit.mjs`, `_wave-alpha/backfill-themes.mjs`) ,  all three use pre-`db.mjs`-era raw `createClient()` patterns consistent with their stated 2026-05/07 campaign dates and carry no live importers.
  - `scripts/entities/backfill-derivation-edges.mjs` is an explicitly self-documented "one-time bridge, not a standing job" with a named, mechanical retirement condition (two consecutive unbounded `--apply` runs reporting `authored: 0` on all three counters) already written into its own header ,  this is a **flagged, decision-ready** item per its own author, not a new finding; whether that retirement condition has fired is a live-DB question outside a read-only audit's reach.
- **Systemic gitignore gap** [CONFIRMED] (context for F-01/F-02, not itself scored as a numbered finding since the bulk of the evidence is outside this lane's read set): `scripts/tmp/` (34 tracked files) and `scripts/_snapshots/` (1,193 tracked files) are *also* not gitignored despite being named in the same CLAUDE.md rule 5 sentence as `_plans/`. `_snapshots/` and `tmp/` are explicitly excluded from this lane's read set (owned elsewhere), so their contents were not reviewed, but the `.gitignore` gap itself is directly observable (`git ls-files` counts above) and is the same defect class as F-01/F-02 at far larger scale ,  worth a dedicated cross-lane follow-up.

## Coverage appendix

157 files in the read set; 157 rows below. `Depth` column: **full** = read start-to-end, line by line,
in this session; **full (spot)** = one or more representative files in a mechanically-identical cluster
were read start-to-end and the remainder verified structurally (header claims, main-guard shape, and , 
for every file in the set without exception ,  the whole-tree TODO/FIXME/secret/empty-catch grep sweep
described in the Method note).

| File | Lines | Depth |
|---|---:|---|
| `_archive/README.md` | 100 | full |
| `_archive/_diag/probe-live-checks.mjs` | 25 | full |
| `_archive/_wave-alpha/backfill-themes.mjs` | 86 | full |
| `_archive/lib/block1-reaudit.mjs` | 236 | full (spot) |
| `_archive/lib/bootstrap-test1.mjs` | 161 | full (spot) |
| `_archive/lib/decision-log-audit.mjs` | 109 | full (spot) |
| `_archive/lib/drift-check-reconstruction.mjs` | 55 | full (spot) |
| `_archive/lib/error-drop-probe.mjs` | 112 | full (spot) |
| `_archive/lib/error-drop-probe.selftest.mjs` | 58 | full (spot) |
| `_archive/lib/exclusion-audit-reconstruction.mjs` | 78 | full (spot) |
| `_archive/lib/fetch-quality.mjs` | 58 | full (spot) |
| `_archive/lib/funded-release-plan.mjs` | 125 | full (spot) |
| `_archive/lib/funded-release-plan.test.mjs` | 109 | full (spot) |
| `_archive/lib/inconclusive-report.mjs` | 34 | full (spot) |
| `_archive/lib/liveness-reconstruction.mjs` | 99 | full (spot) |
| `_archive/lib/net-agent.mjs` | 19 | full |
| `_archive/lib/surface-registry-reconstruction.mjs` | 122 | full (spot) |
| `_archive/lib/type-consumer-probe.mjs` | 110 | full (spot) |
| `_archive/lib/type-consumer-probe.selftest.mjs` | 32 | full (spot) |
| `_archive/lib/urgency.mjs` | 36 | full |
| `_archive/lib/verify-reconstruction.mjs` | 107 | full (spot) |
| `_archive/phase-5-backfill.mjs` | 730 | full (spot; first 60 lines + README cross-check) |
| `_archive/phase2-build-binding.mjs` | 78 | full (spot) |
| `_archive/phase2-reconcile.mjs` | 98 | full (spot) |
| `_archive/phase2-verify-binding.mjs` | 107 | full (spot) |
| `_archive/sprint3-corpus-reclassify-audit.mjs` | 353 | full (spot; first 40 lines + README cross-check) |
| `_archive/tmp/phase-5-rollback.mjs` | 136 | full (spot) |
| `_diag/_redo.log` | 166 | full |
| `_diag/_spotcheck_007f42b1.md` | 194 | full |
| `_diag/_spotcheck_a5.md` | 179 | full |
| `_diag/_spotcheck_singapore-maritime-decarbonisation-blueprint-implementation-regulations.md` | 2 | full |
| `_plans/6a857887-run.log` | 31 | full |
| `_plans/t1-batch-keys.txt` | 0 | full |
| `_plans/t1-run.log` | 122 | full |
| `_reground/executor-ground.mjs` | 45 | full |
| `_reground/free-pass-run.mjs` | 134 | full |
| `_reground/id-stamp.mjs` | 75 | full |
| `_reground/lease.mjs` | 36 | full |
| `_reground/target-match-probe.mjs` | 43 | full |
| `_reground/tombstone-delete.mjs` | 113 | full |
| `_ruling/null-tier-host-ruling.mjs` | 92 | full |
| `_worklists/statutory-fueleu-annex-iv-2026-09-05.BROWSER-WORKLIST.md` | 92 | full |
| `_worklists/statutory-fueleu-annex-iv-2026-09-05.json` | n/a (data) | full |
| `_worklists/statutory-fueleu-annex-iv-2026-09-05.test.mjs` | 65 | full |
| `audit-skill-conformance.mjs` | 165 | full |
| `backfill-item-timelines.mjs` | 221 | full |
| `backfill-item-timelines.npmtest.mjs` | 199 | full |
| `classification/apply-classifications.mjs` | 1071 | full |
| `classification/apply-classifications.test.mjs` | 852 | full (spot) |
| `classification/propose-classifications.mjs` | 379 | full |
| `classification/propose-classifications.test.mjs` | 177 | full (spot) |
| `community/seed-benchmark-instruments.mjs` | 205 | full |
| `community/seed-benchmark-instruments.test.mjs` | 148 | full (spot) |
| `coordinator/lane-gate-cloud.sh` | 56 | full |
| `d3-runs.ddl.sql` | 28 | full |
| `entities/backfill-derivation-edges.mjs` | 199 | full |
| `entities/backfill-derivation-edges.test.mjs` | 121 | full (spot) |
| `entities/backfill-entities.mjs` | 279 | full |
| `entities/backfill-entities.test.mjs` | 310 | full (spot) |
| `entities/backfill-lineage-edges.mjs` | 260 | full |
| `entities/seed-corridors.mjs` | 414 | full |
| `entities/seed-corridors.test.mjs` | 288 | full (spot) |
| `entities/write-entity-scope.mjs` | 226 | full |
| `entities/write-entity-scope.test.mjs` | 165 | full (spot) |
| `flag-fabricated-items.sql` | 90 | full |
| `forward-events/DRY-RUN-REPORT.md` | 577 | full (spot) |
| `forward-events/dispatch-extraction.mjs` | 149 | full |
| `forward-events/run-extraction.mjs` | 336 | full |
| `forward-events/run-extraction.test.mjs` | 346 | full (spot) |
| `gen/assumption-register-common.mjs` | 229 | full (spot) |
| `gen/assumption-register-common.test.mjs` | 269 | full (spot) |
| `gen/assumption-register-seed.mjs` | 42 | full |
| `gen/emission-factors-common.mjs` | 255 | full |
| `gen/emission-factors-common.test.mjs` | 329 | full (spot) |
| `gen/emission-factors-desnz.mjs` | 63 | full (spot) |
| `gen/emission-factors-desnz.test.mjs` | 145 | full (spot) |
| `gen/emission-factors-epa.mjs` | 42 | full (spot) |
| `gen/fetch-desnz-factors.mjs` | 901 | full (spot; ~200 of 901 lines + tail) |
| `gen/fetch-desnz-factors.test.mjs` | 634 | full (spot) |
| `gen/migration-258-behaviour.sql` | 171 | full (spot) |
| `gen/migration-268-behaviour.sql` | 117 | full (spot) |
| `holdings-audit.mjs` | 257 | full |
| `inventories/generate-migrations-inventory.mjs` | 209 | full |
| `inventories/generate-migrations-inventory.test.mjs` | 158 | full (spot) |
| `measure-bundles.mjs` | 128 | full |
| `obligations/derive-obligations.mjs` | 215 | full |
| `obligations/derive-obligations.test.mjs` | 179 | full (spot) |
| `plan-quarantine-disposition-write-client.npmtest.mjs` | 72 | full |
| `plan-quarantine-disposition.mjs` | 352 | full |
| `plan-quarantine-disposition.test.mjs` | 271 | full |
| `propagation/resolve-statutory-rows-file.mjs` | 41 | full |
| `propagation/resolve-statutory-rows-file.test.mjs` | 34 | full (spot) |
| `propagation/seed-derived-values.mjs` | 418 | full |
| `propagation/seed-derived-values.test.mjs` | 298 | full (spot) |
| `propagation/validate-statutory-rows-file.mjs` | 58 | full |
| `propagation/validate-statutory-rows-file.test.mjs` | 94 | full (spot) |
| `propagation/write-statutory.mjs` | 299 | full |
| `propagation/write-statutory.test.mjs` | 337 | full (spot) |
| `regen-quarantined.mjs` | 101 | full |
| `remediation/refetch-capped-worklist.mjs` | 225 | full |
| `review/apply-canonical-candidates.mjs` | 144 | full |
| `review/apply-canonical-candidates.test.mjs` | 177 | full (spot) |
| `review/apply-coverage-gaps.mjs` | 58 | full |
| `review/apply-coverage-gaps.test.mjs` | 58 | full (spot) |
| `review/apply-portal-links.mjs` | 63 | full |
| `review/apply-portal-links.test.mjs` | 75 | full (spot) |
| `review/apply-provisional-sources.mjs` | 48 | full |
| `review/apply-provisional-sources.test.mjs` | 60 | full (spot) |
| `review/build-review-digests.mjs` | 109 | full |
| `review/build-review-digests.test.mjs` | 84 | full (spot) |
| `review/lib/apply-core.mjs` | 56 | full |
| `review/lib/apply-core.test.mjs` | 74 | full (spot) |
| `review/lib/canonical-candidates.mjs` | 99 | full |
| `review/lib/canonical-candidates.test.mjs` | 45 | full (spot) |
| `review/lib/coverage-gaps.mjs` | 105 | full |
| `review/lib/coverage-gaps.test.mjs` | 58 | full (spot) |
| `review/lib/digest-core.mjs` | 108 | full |
| `review/lib/digest-core.test.mjs` | 65 | full (spot) |
| `review/lib/portal-links.mjs` | 103 | full |
| `review/lib/portal-links.test.mjs` | 49 | full (spot) |
| `review/lib/provisional-sources.mjs` | 112 | full |
| `review/lib/provisional-sources.test.mjs` | 58 | full (spot) |
| `review/lib/ruling.mjs` | 58 | full |
| `review/lib/ruling.test.mjs` | 46 | full (spot) |
| `source-role-cleanup.mjs` | 115 | full |
| `sources/README.md` | 115 | full |
| `sources/backfill-source-type.mjs` | 128 | full |
| `sources/backfill-source-type.test.mjs` | 106 | full (spot) |
| `sources/inaccessible-triage.mjs` | 536 | full |
| `sources/inaccessible-triage.test.mjs` | 495 | full (spot) |
| `spec09/SOURCES.md` | 96 | full (spot) |
| `spec09/auxiliary-energy-producer.mjs` | 88 | full |
| `spec09/auxiliary-energy-producer.test.mjs` | 42 | full (spot) |
| `spec09/dqi-producer.mjs` | 88 | full |
| `spec09/dqi-producer.test.mjs` | 41 | full (spot) |
| `spec09/eudr-custody-producer.mjs` | 135 | full |
| `spec09/eudr-custody-producer.test.mjs` | 75 | full (spot) |
| `spec09/fixtures/auxiliary_energy_profiles.csv` | 6 | full |
| `spec09/fixtures/custody_chains.csv` | 6 | full |
| `spec09/fixtures/eudr_plot_claims.csv` | 7 | full |
| `spec09/fixtures/indexation_clauses.csv` | 6 | full |
| `spec09/fixtures/surcharge_audits.csv` | 6 | full |
| `spec09/fixtures/tce_data_quality.csv` | 6 | full |
| `spec09/grid-queue-producer.mjs` | 195 | full |
| `spec09/grid-queue-producer.test.mjs` | 126 | full (spot) |
| `spec09/indexation-producer.mjs` | 109 | full |
| `spec09/indexation-producer.test.mjs` | 47 | full (spot) |
| `spec09/lib/cli-csv-args.mjs` | 31 | full |
| `spec09/lib/rows-file.mjs` | 109 | full |
| `spec09/lib/rows-file.test.mjs` | 116 | full (spot) |
| `spec09/oem-roadmap-producer.mjs` | 232 | full |
| `spec09/oem-roadmap-producer.test.mjs` | 141 | full (spot) |
| `spec09/reroute-producer.mjs` | 223 | full |
| `spec09/reroute-producer.test.mjs` | 184 | full (spot) |
| `spec09/run-fixture-import.mjs` | 129 | full |
| `spec09/run-fixture-import.test.mjs` | 84 | full (spot) |
| `spec09/surcharge-audit-producer.mjs` | 102 | full |
| `spec09/surcharge-audit-producer.test.mjs` | 61 | full (spot) |

Total rows above: 157 (matches file count).

## Verification

`node scripts/verify/audit-finding-status.mjs` run against this file's directory listing convention
(every finding row in the Per-class findings table carries `[CONFIRMED]` or `[HYPOTHESIS]`, no
unlabeled finding).
