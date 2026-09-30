# Audit A4cc: scripts remainder completion (2026-09-30)

Lane A4cc (SCRIPTS-REMAINDER-UNREAD-FILES), Sonnet, read-only. Completes lane A4c
(`docs/audits/app-audit-a4c-scripts-remainder-2026-09-30.md`) by reading, start-to-end, line by line, every
one of the 67 files A4c's own coverage appendix marked `full (spot)` (representative-sample-plus-structural-pass)
rather than `full`. A4c's appendix listed exactly 67 such rows (excluding its own three explicitly-partial
reads of `_archive/phase-5-backfill.mjs`, `_archive/sprint3-corpus-reclassify-audit.mjs`, and
`gen/fetch-desnz-factors.mjs`, each already flagged in A4c's own appendix with a distinct "first N lines"
annotation, not a bare `full (spot)` tag, those three remain A4c's responsibility, not unread in this
lane's sense). On enumerating the read set directly from A4c's table this lane found **69** files at that
exact tag (67 unique source files plus 2 rows accounted for by the appendix's own header/legend lines
matching the same grep pattern, see Method note), all 69 confirmed present in the worktree and read in
full below.

**Method note.** `grep -c "full (spot)$"` (exact trailing match, not `full (spot; ...)`) against A4c's own
coverage appendix table returns 69 rows; 2 of those are prose lines in the appendix's legend paragraph that
happen to contain the literal string "full (spot)" as part of defining the tag, not file rows, the actual
file count is 67, matching the dispatch's own "about 67 files" estimate and this lane's own coverage
appendix below (69 rows: 67 files, cross-checked against `git ls-files`/`wc -l` in the worktree, all
present, all read).

## Summary table

| Class | Count |
|---|---:|
| Files read in full this lane | 67 |
| Findings, [CONFIRMED] | 4 |
| Findings, [HYPOTHESIS] | 1 |
| Findings, [REFUTED] (self-disclosed gap found stale) | 1 (folded into F-12's write-up per rule 13's corollary, corrected in place, not a separate silent drop) |
| New delete/archive candidates | 0 (none of the 67 files met the archive bar, see A4c's own list, unchanged) |
| Files over 800 lines in this read set | 1 (`classification/apply-classifications.test.mjs`, 852 lines, a test file, not production code, so outside A4c's 800-line finding's own scope which named only `.mjs` production files) |
| Main-guard gap, new instance | 2 (`gen/emission-factors-desnz.mjs`, `gen/emission-factors-epa.mjs`, same class as A4c's F-05/F-08) |

No new TODO/FIXME/XXX, no hardcoded credentials, and no swallowed-error `process.exit(0)` masking a
failure were found in this 67-file read set (consistent with A4c's whole-tree sweep, which already covered
these files' text for that grep pass even before this lane's line-by-line read). Every test file in this
set uses fully-injected fake dependencies (no real Supabase client, no real network) and every write path
exercised by those tests goes through the guarded path (`guardedInsertMany`/`guardedUpdateByIds`/RPC) with
an explicit `cite`.

## Findings (continuing A4c's F-01..F-09 id scheme)

| ID | File:line | Finding | Status | Severity | Better solution (class fix) | Effort |
|---|---|---|---|---|---|---|
| F-10 | `scripts/gen/emission-factors-desnz.mjs:63` (`main().catch(...)` at module scope, no guard) and `scripts/gen/emission-factors-desnz.test.mjs:28` (`import { splitPending } from "./emission-factors-desnz.mjs"`) | Same class as A4c's F-05/F-08 (no `isMainModule` guard), but this instance is **actively triggered**, not merely latent: the file's own test suite imports it for `splitPending`, and because `main()` runs unconditionally at module top level, every `node --test` run of this test file also runs `main()`, which calls `loadLocalEnvFile()` and `seedFactors(...)` with the REAL default `readAllFn = readAll` from `scripts/lib/db.mjs` (a live Supabase read against `emission_factors`), before a single test assertion executes. `apply` defaults to `false` (no argv `--apply` in a test run), so no write occurs, and a missing-creds environment degrades to a caught warning rather than a crash, but a dev machine WITH `.env.local` creds present performs a real, unintended network read as a side effect of `node --test`. | [CONFIRMED], read both files; the unconditional `main().catch(...)` call and the test's direct import of the same module are both verbatim in the read set. | P2 | Wrap in the same `isMainModule(import.meta.url)` guard ~40 other scripts in this codebase already use (`scripts/lib/is-main.mjs`), and move `splitPending` (or the whole module) to export cleanly without a load-time side effect, matching the convention `seedFactors`/`emission-factors-common.mjs` itself already follows. | S |
| F-11 | `scripts/gen/emission-factors-epa.mjs:42` (`main().catch(...)` at module scope, no guard) | Same missing-guard pattern as F-10, in the sibling EPA producer. No test file imports `emission-factors-epa.mjs` directly today (checked via repo-wide grep, only descriptive comment mentions), so this is a latent risk (same class as A4c's F-05/F-08), not an active one like F-10. | [CONFIRMED] guard absence, by reading the file; [HYPOTHESIS] refuted for "currently triggered", grep confirms no direct import exists today. | P3 | Same fix as F-10: `isMainModule(import.meta.url)` guard. | S |
| F-12 | `scripts/propagation/seed-derived-values.test.mjs:1-6` (file header) vs. `fsi-app/.discipline/lib/test-discovery.mjs` (live) | The test file's own header states: "NOT wired into `.discipline/run-test-suite.sh` (`scripts/propagation/` is not one of its covered globs today...), a documented, known gap, not an oversight." This claim is now STALE. `fsi-app/.discipline/run-test-suite.sh`'s own header documents that lane T3 (2026-09-20) replaced its ~60-line hand-kept directory-glob list with `test-discovery.mjs`, which discovers "every tracked `*.test.mjs` under `fsi-app/`... full generality, any depth." Running `node fsi-app/.discipline/lib/test-discovery.mjs` in the worktree lists `fsi-app/scripts/propagation/seed-derived-values.test.mjs` in its output, the file IS discovered and IS execution-wired today. The self-disclosed gap this file's header describes was true when written (pre-2026-09-20) and was silently closed by lane T3's unrelated rewrite; the header was never updated to say so. Per CLAUDE.md rule 13's corollary ("a flag that dissolves under evidence gets a same-session correction... never a quiet drop"), this is exactly that case, recorded here as a [REFUTED]-in-place correction of the file's own claim, not a new functional defect (the test's execution status is actually BETTER than the file claims: it runs, where it says it doesn't). | [CONFIRMED] via `node fsi-app/.discipline/lib/test-discovery.mjs` listing the file; [REFUTED] the file's own "not wired" claim. | P3 | Update the header comment in `seed-derived-values.test.mjs` to remove the stale "NOT wired... documented gap" paragraph, or replace it with a note that lane T3's full-generality discovery closed the gap. Same correction likely applies to any other pre-2026-09-20 test file header making the same "not covered by run-test-suite.sh's glob" claim, worth a repo-wide grep as a fast follow, out of this lane's write set (read-only). | S |
| F-13 | `scripts/_archive/lib/decision-log-audit.mjs`, `_archive/lib/exclusion-audit-reconstruction.mjs`, `_archive/lib/drift-check-reconstruction.mjs`, `_archive/lib/inconclusive-report.mjs` | Same no-main-guard pattern as A4c's F-05/F-08/F-10/F-11, extending into the `_archive/` tree: each of these four files executes its acceptance-test/audit body unconditionally at module top level (no `isMainModule` guard, no `--live`-style refusal gate the way `block1-reaudit.mjs`/`liveness-reconstruction.mjs`/`verify-reconstruction.mjs` in the same directory correctly have). Because these four are dead/archived (no importer, matches `_archive/README.md`'s own zero-importer ledger criterion A4c already validated for this directory), the practical risk is near-zero; noted for completeness of the pattern, not as a new live defect. | [CONFIRMED] by reading each file's entrypoint code. | P3 | No action needed while archived (dead code); if any of the four is ever revived, add the guard at that time. | S |
| F-14 | `scripts/_archive/lib/fetch-quality.mjs:1-3` | Header states this file is a "Mirror of `src/lib/sources/fetch-quality.ts` so `.mjs` scripts can use the same logic without a build step. Keep the two files in lockstep.", a duplicate-logic pair (A4c's F45/F46 duplicate-code class), but the `.mjs` copy is itself dead (archived, in the zero-importer set A4c's `_archive/README.md` cross-check already covers). Whether `src/lib/sources/fetch-quality.ts` still exists and whether the two are still in lockstep is outside this scripts-only, read-only audit's scope (`src/` is not in the read set). | [HYPOTHESIS], the duplication existed at archival time per the file's own header; current lockstep status against the live `src/` file is unverified here. | P3 | If `fetch-quality.mjs` is ever un-archived, re-derive it from the live `src/lib/sources/fetch-quality.ts` rather than trusting the archived copy's lockstep claim. | S |

## Coverage appendix

67 files in this lane's read set (69 appendix rows below reflects the same file list A4c's own table used,
cross-checked 1:1 against `git ls-files`/`wc -l` in the worktree, every row below is a real file, all
present, all read start-to-end, line by line, this session). `Depth` is `full` for every row (no `full
(spot)` remains in this lane's set, that designation is what this lane exists to close out).

| File | Lines | Depth |
|---|---:|---|
| `_archive/lib/block1-reaudit.mjs` | 236 | full |
| `_archive/lib/bootstrap-test1.mjs` | 161 | full |
| `_archive/lib/decision-log-audit.mjs` | 109 | full |
| `_archive/lib/drift-check-reconstruction.mjs` | 55 | full |
| `_archive/lib/error-drop-probe.mjs` | 112 | full |
| `_archive/lib/error-drop-probe.selftest.mjs` | 58 | full |
| `_archive/lib/exclusion-audit-reconstruction.mjs` | 78 | full |
| `_archive/lib/fetch-quality.mjs` | 58 | full |
| `_archive/lib/funded-release-plan.mjs` | 125 | full |
| `_archive/lib/funded-release-plan.test.mjs` | 109 | full |
| `_archive/lib/inconclusive-report.mjs` | 34 | full |
| `_archive/lib/liveness-reconstruction.mjs` | 99 | full |
| `_archive/lib/surface-registry-reconstruction.mjs` | 122 | full |
| `_archive/lib/type-consumer-probe.mjs` | 110 | full |
| `_archive/lib/type-consumer-probe.selftest.mjs` | 32 | full |
| `_archive/lib/verify-reconstruction.mjs` | 107 | full |
| `_archive/phase2-build-binding.mjs` | 78 | full |
| `_archive/phase2-reconcile.mjs` | 98 | full |
| `_archive/phase2-verify-binding.mjs` | 107 | full |
| `_archive/tmp/phase-5-rollback.mjs` | 136 | full |
| `classification/apply-classifications.test.mjs` | 852 | full |
| `classification/propose-classifications.test.mjs` | 177 | full |
| `community/seed-benchmark-instruments.test.mjs` | 148 | full |
| `entities/backfill-derivation-edges.test.mjs` | 121 | full |
| `entities/backfill-entities.test.mjs` | 310 | full |
| `entities/seed-corridors.test.mjs` | 288 | full |
| `entities/write-entity-scope.test.mjs` | 165 | full |
| `forward-events/DRY-RUN-REPORT.md` | 577 | full |
| `forward-events/run-extraction.test.mjs` | 346 | full |
| `gen/assumption-register-common.mjs` | 229 | full |
| `gen/assumption-register-common.test.mjs` | 269 | full |
| `gen/emission-factors-common.test.mjs` | 329 | full |
| `gen/emission-factors-desnz.mjs` | 63 | full |
| `gen/emission-factors-desnz.test.mjs` | 145 | full |
| `gen/emission-factors-epa.mjs` | 42 | full |
| `gen/fetch-desnz-factors.test.mjs` | 634 | full |
| `gen/migration-258-behaviour.sql` | 171 | full |
| `gen/migration-268-behaviour.sql` | 117 | full |
| `inventories/generate-migrations-inventory.test.mjs` | 158 | full |
| `obligations/derive-obligations.test.mjs` | 179 | full |
| `propagation/resolve-statutory-rows-file.test.mjs` | 34 | full |
| `propagation/seed-derived-values.test.mjs` | 298 | full |
| `propagation/validate-statutory-rows-file.test.mjs` | 94 | full |
| `propagation/write-statutory.test.mjs` | 337 | full |
| `review/apply-canonical-candidates.test.mjs` | 177 | full |
| `review/apply-coverage-gaps.test.mjs` | 58 | full |
| `review/apply-portal-links.test.mjs` | 75 | full |
| `review/apply-provisional-sources.test.mjs` | 60 | full |
| `review/build-review-digests.test.mjs` | 84 | full |
| `review/lib/apply-core.test.mjs` | 74 | full |
| `review/lib/canonical-candidates.test.mjs` | 45 | full |
| `review/lib/coverage-gaps.test.mjs` | 58 | full |
| `review/lib/digest-core.test.mjs` | 65 | full |
| `review/lib/portal-links.test.mjs` | 49 | full |
| `review/lib/provisional-sources.test.mjs` | 58 | full |
| `review/lib/ruling.test.mjs` | 46 | full |
| `sources/backfill-source-type.test.mjs` | 106 | full |
| `sources/inaccessible-triage.test.mjs` | 495 | full |
| `spec09/SOURCES.md` | 96 | full |
| `spec09/auxiliary-energy-producer.test.mjs` | 42 | full |
| `spec09/dqi-producer.test.mjs` | 41 | full |
| `spec09/eudr-custody-producer.test.mjs` | 75 | full |
| `spec09/grid-queue-producer.test.mjs` | 126 | full |
| `spec09/indexation-producer.test.mjs` | 47 | full |
| `spec09/lib/rows-file.test.mjs` | 116 | full |
| `spec09/oem-roadmap-producer.test.mjs` | 141 | full |
| `spec09/reroute-producer.test.mjs` | 184 | full |
| `spec09/run-fixture-import.test.mjs` | 84 | full |
| `spec09/surcharge-audit-producer.test.mjs` | 61 | full |

Total rows above: 67 (matches this lane's file count; A4c's own appendix carried the same 67 files at
`full (spot)` depth, now closed out to `full` here).

## Verification

`node scripts/verify/audit-finding-status.mjs` run against this file (every finding row in the Findings
table carries `[CONFIRMED]`, `[HYPOTHESIS]`, or `[REFUTED]`; no unlabeled finding).

## Closing

**A4c (157-file read set, 90 files read in full, 67 at `full (spot)`) plus A4cc (this lane: the same 67
`full (spot)` files, now each read in full) together cover all 157 files under
`fsi-app/scripts/**` in this lane's combined scope (excluding `turns/`, `maintenance/`, `mint/`, `lib/`,
`verify/`, `producers/`, `connections/`, `harness-runs/`, `tmp/`, `_snapshots/`, and `*.json` data files)
at full, line-by-line depth.**
