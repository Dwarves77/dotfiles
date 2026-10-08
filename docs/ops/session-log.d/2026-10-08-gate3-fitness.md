## 2026-10-08, lane GATE-3 (gate3-fitness): fitness functions and governance gates, remove, repair, replace

Branch `lane/gate3-fitness`, cut from origin/master 93498aa7; second pass after the coordinator's rulings (see "Rulings applied").

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
9. Skill acks: 26 ack files deleted; the range-ack requirement is removed from `skill-contract-map.mjs`.
10. `.discipline/out/` ignore line added to `fsi-app/.gitignore`.

Removed F39 markers (15 lines, 11 files; 119 stay): admin/inferences/page.tsx, components/admin/corrections/load-all.mjs,
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

### Rulings applied (coordinator, same day)

1. Orphans deleted: `fitness/lib/workflow-run-depth.mjs` + test, `governance/generated-files.mjs` + test,
   `src/lib/perf/perf-budget.mjs`. Grep found no importer of any of them outside comments (perf-budget.mjs is
   named only in comments in `obligations/read-register.mjs`). RD-86 is retired with a reason, its last
   enforcer being the deleted depth test.
2. Item 4 done in `governance/coverage-scan.mjs`: `.rpc(` is a write only when the name is in `WRITE_RPCS`
   (the brief's list plus the lease and lock names the repo actually calls: `heartbeat_mutation_lease`,
   `release_mutation_lease`, `heartbeat_funded_pass_lock`, `release_funded_pass_lock`); files are enumerated
   with `git ls-files`, so gitignored scratch is never scanned. A call whose rpc name is not a string literal
   is not counted (it cannot be classified). `coverage-report.json` regenerated with its generator: 1238
   governed files, 0 gaps. Tests are in `F23-governed-surface-coverage.test.mjs` (no separate coverage-scan
   test file exists).
3. Item 10 done in `fitness/runner.mjs`: every run writes `fitness-firings.json`
   (`[{gate, verdict, file, line, evidence}]`, evidence cut to 200 characters, an empty array when nothing
   fired) to `fsi-app/.discipline/out/`, or to `--firings-out=<path>`; a write failure warns and never changes
   the verdict.
4. `skill-contract-map.mjs`: `checkRangeAcks`, `parseSkillAck`, the skill-acks directory constant and the
   change-range import are gone; `skill-drift-gate.test.mjs` lost the three git-fixture proofs and the
   parseSkillAck test.
5. Invariant `residual` texts of RD-12, RD-62, RD-79, RD-84, RD-86, RD-90, RD-91 each gained one factual
   sentence naming the deleted gate.
6. F39: a spread is bounded only when its source is a SCREAMING_SNAKE constant. Tightening it exposed one
   real unbounded site, `.in("url", [...wellFormedUrls])` in `bulk-import/route.ts`, which now reads through
   `fetchAllByIdChunks` (manyPerId, fail-closed on a lookup error as before). tsc and eslint clean on the file.
   The supabase-server.ts marker at the `[...byId.keys()]` call stays (its bound is the earlier `.limit()`).
7. True positive of my own reading: the closure gate's maintenance-step introduction index never dated any
   step (the split loop broke on its empty first element). Fixed in the same change; see item 5 above.

### Read and reused (second pass)

`fetchAllByIdChunks` (`src/lib/db/paginate.mjs`) for the bulk-import lookup; `git ls-files` enumeration as
`closure-gate.mjs` already uses it; the lane's own F39 `closingParen` scanner.

### UX compliance

Not a UI change (the 15 `.ts`/`.tsx`/`.mjs` edits under `src` remove comment lines only).
