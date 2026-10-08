# 2026-10-08, lane AUDWIRE-1 (audwire1-orphan-audit): the UI-orphan audit fails the data-audit lane, and the B-3 fields are enumerated by it

## Accomplished

- `fsi-app/scripts/verify/ui-orphan-audit.mjs`: marker changed from `// data-audit: label=ui-orphan hard=false` to `hard=true`. The script already carried a marker on master, so `run-data-audit-lane.mjs` already derived and spawned it; what was missing was that a live orphan could not fail the lane (soft). No edit to `run-data-audit-lane.mjs` was needed: its `deriveAudits()` reads the marker. Registration line: `// data-audit: label=ui-orphan hard=true` (line 1 of the audit).
- The audit's body moved from top-level await into exported `runAudit(deps)` behind `isMainModule`, every dependency injectable (connect, schema reads, UI and writer-corpus reads, allowlist, artifact writer, clock). Pure exports added: `buildWriterIndex`, `buildRegister`, `renderRegister`, `writeRegisterFile`, `ARTIFACT_PATH`. Behaviour kept: exit 0 pass, 1 orphan or stale allowlist entry, 2 no connection (self-skip) or engine error.
- The B-3 register: one row per (component, bound column) for every in-scope UI-selected field: component (the UI file), prop (the select-list entry), bound column (table.column), producer present (yes or no) and basis (`column-writer`, `opaque-table-write`, `allowlisted`, `none`; `none` is a finding). Artifact path: `fsi-app/.discipline/out/ui-orphan-register.md` (gitignored, the out directory the fitness firings use; moved here from `scripts/tmp/` on the coordinator's grant, see Follow-up), written on every completed run. The producer=no rows are also printed to the job log. The register takes its verdict from the existing `findUiOrphanFields`, called with no allowlist and no opaque tables, so the register and the finding list cannot disagree (a test asserts it).
- `fsi-app/scripts/verify/ui-orphan-audit.test.mjs` (15 tests, fixtures only): attack rows per failure class (a field bound to a column with no producer is producer=no and exits 1; the same field with a code, SQL or RPC producer is producer=yes and exits 0; allowlisted and opaque-write classes; stale allowlist; no credentials exits 2 with nothing written; engine error exits 2 and closes the connection; artifact write failure leaves the verdict alone), plus a registration test that `deriveAudits()` returns `ui-orphan` as hard.
- `fsi-app/.discipline/governance/invariants.d/RD-95-ui-orphan-field.mjs`: RD-95 (anchor: the category 9 producer-consumer orphan heading), enforced by the audit and both selftests. Confirmed free: master ends at RD-93; origin branch `lane/mighist1-recover` and PR 1013 hold RD-94; no other origin branch holds an RD number above 93.

## Read and reused

- Read in full: CLAUDE.md, `docs/dispatches/lane-common-contract.md`, the lane COMMON and brief, `ui-orphan-audit.mjs`, `lib/ui-orphan-scan.mjs`, `lib/ui-orphan-scan.test.mjs` (head), `ui-orphan-allowlist.json`, `run-data-audit-lane.mjs`, its test, `loop-fired-evidence-audit.mjs` and test (template for the injected-deps `runAudit`), `lib/pg-conn.mjs`, `lib/is-main.mjs`, `lib/walk-files.mjs`, `execution-wiring.mjs` (surface 4), `invariant-coverage.mjs` resolver, `invariants.d/README.md`, RD-9, RD-31, RD-90, RD-93, `.github/workflows/data-audit-lane.yml`.
- Reused instead of built: `findUiOrphanFields`, `scanUiSelects`, the writer extractors, `staleUiOrphanAllowlistEntries`, `scopedColumns`, the information-schema reads, `connectPg`, `walkFiles`, `isMainModule`, `loadLocalEnvFile`, the data-audit marker derivation, the invariants directory loader.

## Confirmed

- `node --test` on the audit test, `ui-orphan-scan.test.mjs`, `run-data-audit-lane.test.mjs`, `execution-wiring.test.mjs`, `invariants.test.mjs`, `invariant-coverage.test.mjs`: 64 pass, 0 fail.
- `node fsi-app/.discipline/governance/invariant-coverage.mjs`: meta-gate PASS (153 invariants, 63 doctrines).
- Coverage scan summary (the F23 input, run in process): orphaned_proofs 0, unmapped_writes 0, unmapped_model 0, unmapped_routing 0; `coverage-report.json` unchanged.
- CLI with all database env removed: `node scripts/verify/ui-orphan-audit.mjs` printed the no-connection message and exited 2.
- Fixture dry run of the real file readers with a stubbed connection, empty schema and stubbed artifact writer: 509 UI-facing files, 1100 select-list entries, 2309 writer-corpus files, 723 writer-column keys, 62 opaque-write tables scanned; the empty schema puts every entry out of scope, so this proves the readers run and says nothing about live orphans.

## NOT done

- No live field list. There is no live access in this lane (COMMON rule 5), so the original 17 fields (the last recorded live run found 16) are NOT enumerated here. The live field list is produced by the next data-audit run (`node scripts/verify/run-data-audit-lane.mjs`, or the Actions dispatch of "Data-audit lane"), as the printed producer=no block in its log and as the register file on the machine that ran it.
- The prop column is the selected column name: `scanUiSelects`/`parseSelectList` drop `alias:column` aliases and are outside this lane's write set (alias loss stays as recorded, coordinator grant).

## Open items

- Consequence of hard=true, INTENDED (coordinator): on the next dispatched lane run, any live orphan (for example `state_cost_facts`, a ruled build item with no producer yet) fails the lane and opens the data-audit block row, which halts generation preflight until fixed or waived. The first hard red on dispatch is the intended behaviour. The lane is `workflow_dispatch` only in build mode, so nothing fires until it is dispatched.
- RD-95 was self-assigned; re-number if it collides with a concurrently registered id.

## Follow-up (coordinator grant: persist the register)

- `.github/workflows/data-audit-lane.yml`: one `actions/upload-artifact@v4` step after the lane run (`if: always()`, name `ui-orphan-register`, path `fsi-app/.discipline/out/ui-orphan-register.md`, `if-no-files-found: ignore`, `retention-days: 7`, within F68's ceiling and clear of its forbidden paths).
- `ARTIFACT_PATH` in the audit is now `.discipline/out/ui-orphan-register.md` (relative to fsi-app); RD-95 text and residual updated to match. The directory is already gitignored (`fsi-app/.gitignore`).
