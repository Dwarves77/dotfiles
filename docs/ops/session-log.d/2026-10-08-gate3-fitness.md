## 2026-10-08, lane GATE-3 (gate3-fitness): fitness functions and governance gates, remove, repair, replace

Branch `lane/gate3-fitness`, cut from origin/master 93498aa7. Not pushed: see "Blocked".

### Accomplished (each item confirmed by running its test, red then green where behaviour was added)

1. F51: check 5 (hotspot concurrency), HOTSPOT_ALLOWLIST, the 30-commit window, the fork-point classifier,
   ENTRY_DIRS and `underEntryDir` deleted. Checks 1 to 4 kept. F51 test: 36 tests green before the final
   comment edits (the replay test takes about 330 s on this Windows machine; CI measured 8 to 10 s).
2. F28: the pending-marker range rule and tree-state rule deleted. New currency rule: a family is current when
   the ledger export holds a row whose `governing_hash` equals the live governing-file hash. A family not
   current fails only when its newest row is older than 30 days (90 in BUILD_MODE); no ledger row at all is a
   notice in BUILD_MODE and fails outside it 30 days past `registered`. Schema check (a) and LAST-PROPOSER-PASS
   (d) kept. Live run in this tree: export absent, 32 families, 0 current, 32 notices, 0 violations.
3. `governing_hash` added to the run artifact: `writeRunArtifact` stamps it (top level, mirrored into
   `config.governing_hash` because `record-harness-run.mjs` lands `config` verbatim and `harness_runs` has no
   column for it), `validateRunArtifact` checks its shape, `buildRunArtifactEnvelope` carries it when given,
   the exporter's row shape carries `governing_hash` (config value, else the `harness_version` column).
   Shared readers (`readHarnessLedgerExport`, `newestLedgerRunAt`, `familyCurrentInLedger`) live in
   `run-artifact.mjs` so F28 and the closure gate read the export one way.
4. 136 pending marker files deleted (the brief said 134; origin/master held 136), the pending convention
   removed from CONVENTION.md and replaced by "Is a family current?".
5. Closure gate NEVER-RUN: clock is the newest `harness_runs` row date per workflow family (per step for
   maintenance) from the ledger export; overdue means no row inside 30 days (90 in BUILD_MODE). The train
   counter use and NEVER_RUN_ALLOWLIST are deleted. STALE-NEXT, WRITER-READER, LANE-CONTRACT kept.
   Found and fixed in the same motion: `buildIntroducingCommitIndex` ended its loop on the empty first element
   of the split (`!chunk` then `break`), so no maintenance step ever had an introduction date and none was ever
   gated. Confirmed by running the live gatherer: before the fix the maintenance steps came back undated (the first
   12 of 62 inspected, the rest by reading the loop); after it 62 of 62 are dated. After the fix the live gate is still PASS.
6. F39: a `.in()` list is bounded when it is `.slice(0, N)` with N <= 500, a copy or spread of a
   SCREAMING_SNAKE constant, or inside a `fetchAllByIdChunks(...)` or `readAllByIds(...)` call. The argument is now
   read with balanced parens so `rows.map((r) => r.id).slice(0, 200)` is classified whole. 134 marker lines
   existed in src and scripts; 15 were removed (list below); 119 remain because the list is bounded by a scope
   or a validation the lexical rule cannot see.
7. F40: `guardedRoutes()` hoisted out of `check()` into a lazily read per-pass set. Measured on this machine,
   611 files, 0 violations before and after: 71,798 ms before, 1,274 ms after.
8. Deleted with their tests: F17, F26, F37, F54, F57, F58, F60, F62, F63 (18 files). Invariants updated
   (enforcedBy only): RD-12 (kept section-grounding.test.mjs), RD-79 (kept no-npm-sandbox.test.mjs), RD-84
   (kept the rendering guard), RD-86 (kept nothing, see Blocked), RD-90 (kept tint.test.mjs and
   timeline-dot-styles.test.mjs). Retired with a reason (`exempt`): RD-62 (F37, no owning test), RD-91 (F63,
   superseded by migration-history-audit, lane MIG-HIST-1, not yet on master).
9. Skill acks: 26 ack files deleted; `checkDrift` no longer requires an ack in a range.
10. `.discipline/out/` ignore line added to `fsi-app/.gitignore`.

Removed F39 markers (15 lines, 11 files): admin/inferences/page.tsx, components/admin/corrections/load-all.mjs,
load-item-targets.mjs, lib/corrections/admin-api/logic.mjs, lib/corrections/suppressed-render.mjs,
lib/dashboard/surface-coverage.ts, lib/intake/census-writer.mjs, lib/learning/prediction-scoring.mjs (4),
lib/learning/questions-on-change.mjs (2), lib/supabase-server.ts (1, the PROVISIONAL_REVIEW_STATUSES spread),
lib/vocabulary/adopted-entities.mjs.

### Read and reused

CLAUDE.md, lane-common-contract, gate evaluation B (sections 2 to 7, 10 to 12), every file in the write set,
run-artifact.mjs / export-harness-ledger.mjs / record-harness-run.mjs / family-registry.mjs /
governing-files.mjs, build-mode.mjs, invariant-coverage.mjs. Reused: `hashHarnessVersion` and
`GOVERNING_FILES` (the hash F28 already re-derived), the exporter's snapshot pattern, `BUILD_MODE`,
`closingParen`-style scanning is new but local to F39.

### Decisions

- The ledger clock reads the export's `capturedAt` when present (deterministic from committed files), else the wall clock.
- A target with no ledger row but undated evidence (tracked artifact, runbook run record) is not overdue.
- `[...runtimeIds]` is still treated as bounded by F39's existing array-literal rule. Closing it would newly fail
  `src/app/api/admin/sources/bulk-import/route.ts` line 379 (`.in("url", [...wellFormedUrls])`), outside the write set.

### Blocked (NEEDS WRITE-SET EXPANSION, nothing outside the set was touched)

- Orphans left by the deletions, found by running F25 on this tree: `fitness/lib/workflow-run-depth.mjs` (+ test,
  F60), `governance/generated-files.mjs` (+ test, F51 check 5; the brief says keep it), `src/lib/perf/perf-budget.mjs` (F37).
- Item 4 (F23 WRITE_RPCS, git ls-files enumeration) lives in `governance/coverage-scan.mjs`.
- Item 10 (runner writes `fitness-firings.json`) lives in `fitness/runner.mjs`.
- Item 7 remainder: `checkRangeAcks` and `parseSkillAck` still exported until `skill-drift-gate.test.mjs` is edited.

### UX compliance

Not a UI change (the 15 `.ts`/`.tsx`/`.mjs` edits under `src` remove comment lines only).
