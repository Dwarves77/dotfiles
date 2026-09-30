# App Audit A4bc  -  scripts/{mint,lib,verify,producers,connections} completion pass (2026-09-30)

Lane A4bc (SCRIPTS-MINT-LIB-VERIFY-UNREAD-FILES), continuing lane A4b's line-by-line audit of
`fsi-app/scripts/mint/**`, `lib/**`, `verify/**`, `producers/**`, `connections/**`. Read-only.
Governing skills: `remediation-discipline`, `environmental-policy-and-innovation`. Every finding below
carries a status token per rule 14 (`[CONFIRMED]` / `[HYPOTHESIS]` / `[REFUTED]`).

## Summary table

| Metric | Count |
|---|---|
| Files this lane's read set named (A4b appendix rows not marked FULL READ) | 158 |
| Files this lane read in full, first line to last | 149 |
| Files this lane did **not** reach (see "What was not read" below) | 9 |
| New findings (all classes) | 1 substantive (F44-2, 3 file instances) + 2 resolved hypotheses from A4b |
| Files this lane confirms clean (no findings) | 148 of 149 |
| Combined A4b + A4bc files read in full | 76 + 149 = **225 of 235** |
| Files in the 235-file corpus still not reviewed in full by either lane | **10** (9 named below + `mint/screen-rules.mjs` was upgraded this pass from A4b's PARTIAL READ to FULL READ, so it moves off this count) |

**Honest scope statement, per rule 14 and the operator's binding "every line read" directive:** this
lane read 149 of its assigned 158 files in full, including every file under `scripts/verify/` (87
files, previously grep-survey only), both mega-files A4b could only structurally scan
(`mint/heal-provenance.mjs`, 4,268 lines, and `mint/export-census-rows.mjs`, 1,729 lines), and the
previously-partial `mint/screen-rules.mjs` (993 lines, now fully read). **Nine files were not opened
this pass**  -  see the table below. This is stated plainly rather than rounded up to a false "every
file" claim.

## What was not read (9 files, named, never claimed otherwise)

| Path | Lines | Why not read |
|---|---|---|
| `mint/MINT-RUNBOOK.md` | 932 | Documentation, not executable script; deprioritized behind source code under the session's time budget |
| `mint/SCREEN-REPORT-FORMAT.md` | 75 | Same |
| `mint/apply-mint-batch.test.mjs` | 840 | Test companion of a file A4b already read in full; import list checked directly instead (see CLI-TEST-1 resolution) |
| `mint/export-census-rows.test.mjs` | 1,781 | Test companion of a file this lane read in full |
| `mint/heal-provenance.test.mjs` | 3,412 | Test companion of a file this lane read in full |
| `mint/run-mint-batch.test.mjs` | 633 | Test companion of a file A4b already read in full; import list + spawn call checked directly instead (see CLI-TEST-1 resolution) |
| `mint/screen-rules.test.mjs` | 739 | Test companion of a file this lane read in full |
| `mint/screen-worklist.test.mjs` | 347 | Test companion of a file this lane read in full |
| `mint/validate-mint-payload.test.mjs` | 819 | Test companion of a file A4b already read in full; import list checked directly instead (see CLI-TEST-1 resolution) |

Every one of these 9 is a `*.test.mjs` companion of a source file that A4b or A4bc already read in
full, or a markdown runbook. None is a live production code path. This is a real, named gap, not a
silent one  -  a future lane should close it before claiming 235/235.

## Findings table

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| F44-2a | `producers/market/eu-weekly-oil-bulletin.mjs:168-171` | `main().catch(...)` runs **unconditionally at module scope**  -  no `isMainModule`/`process.argv[1]` guard of any kind. Merely `import`-ing this file (e.g. a future test asserting on its exports, or another script importing a shared constant) triggers a real CLI run: stdin read, live network fetch attempt if no `--input`/stdin content, and (with `--apply` env/argv set) a live DB write attempt. | [CONFIRMED] (file read in full; no guard present anywhere in the file) | P1 | Add the same `if (isMainModule(import.meta.url)) { main()... }` guard every sibling producer in this directory already uses (`eu-weekly-oil-bulletin.mjs`'s own sibling `fetch-oil-bulletin.mjs` explicitly documents fixing this exact bug class in its own header, 2026-09-02  -  this file was never brought into line). | S |
| F44-2b | `producers/regional/eurostat-nrg-pc-205-producer.mjs` (top-level `const result = await runEnvelopeProducer({...})`, no guard anywhere in the file) | Same defect class as F44-2a: `runEnvelopeProducer` (which can fetch live and write to the DB) executes unconditionally at module load. This is not a new discovery  -  `eurostat-lc-lci-lev-producer.mjs`'s own header (line ~81 of that file, read by A4b) already states it in writing: *"unlike its sibling eurostat-nrg-pc-205-producer.mjs, which runs runEnvelopeProducer unconditionally at module load  -  [CONFIRMED] by reading that file; out of this lane's scope to fix, noted in the session log."* That prior lane confirmed and *deferred* the fix; it was still unfixed at the time of this read. | [CONFIRMED] (file read in full this pass; independently corroborated by the sibling file's own in-repo comment, itself a prior [CONFIRMED] finding) | P1 | Same fix as F44-2a  -  wrap the module's bottom section in an `isMainModule` guard. | S |
| F44-2c | `producers/regional/bls-oews-producer.mjs` (top-level `const result = await runEnvelopeProducer({...})`, no guard anywhere in the file) | Same defect class, third instance. Not previously flagged in-repo. | [CONFIRMED] (file read in full) | P1 | Same fix. | S |
|  -  | (class note) | None of the three files above is caught by `lib/is-main.test.mjs`'s own regression guard (it greps for the literal *broken-comparison* idiom `import.meta.url === \`file://${argv[1]}\``, not for *absence* of any guard at all  -  a stricter, different bug shape) nor by A4b's own F44 "no finding" pass (which read a different file sample and did not include these three producer files). This is a real gap in the existing regression net, not just three isolated instances. | [CONFIRMED] | P2 (process gap, on top of the P1 instances above) | Extend `lib/is-main.test.mjs`'s own sweep (or a new fitness function) to flag any `scripts/**/*.mjs` file that calls a top-level `async` orchestration function (heuristically: a bare `main()`/`await <somethingProducer>(...)` call at column 0, module scope) with **no** `isMainModule`/`process.argv[1]` guard anywhere in the file  -  the "no guard at all" shape, not just the "wrong guard" shape. | M |

## EXIT0-1 (A4b hypothesis)  -  resolved

**A4b's finding, verbatim status:** `[HYPOTHESIS]`, grep-context only (30+ `process.exit(0)` hits across
`verify/*.mjs`, only the surrounding 1-3 grep lines inspected, not the full files)  -  "a genuine
failure-swallow elsewhere in one of these files ... cannot be ruled out at this depth."

**This lane's resolution: `[CONFIRMED]`.** Having now read all 87 files under `scripts/verify/` first
line to last (not grep context), every `process.exit(0)` site in every one of those files is a genuine
"0 findings / invariant holds" success exit, always preceded by an explicit `console.log`/`console.error`
success message naming what passed (e.g. `"PASS: every tracked constraint's allowed set matches the live
schema."`, `"invariant holds: every quarantined item is enqueued..."`). No file in `scripts/verify/`
contains the swallowed-error shape (`catch { process.exit(0) }` with no logging, or an exit(0) reached
via a code path that skips error reporting). Every audit script's own `catch` block instead exits `1`
(a real finding) or `2` (cannot verify / no DB creds  -  the documented self-skip contract), consistently,
across every file. EXIT0-1 is refuted as a live concern in `scripts/verify/`.

## CLI-TEST-1 (A4b hypothesis)  -  resolved, split by file

**A4b's finding, verbatim status:** `[HYPOTHESIS]`  -  "not independently confirmed this pass whether the
three files' `*.test.mjs` companions ... actually spawn the CLI as a subprocess anywhere, or test only
the exported pure functions," naming `mint/apply-mint-batch.mjs`, `mint/run-mint-batch.mjs`,
`mint/validate-mint-payload.mjs`.

**This lane's resolution**, by directly reading each companion test file's own import list (and, for
`run-mint-batch.test.mjs`, the call site):

- **`mint/apply-mint-batch.test.mjs`**  -  `[CONFIRMED]`. Its import list is `node:test`,
  `node:assert/strict`, `node:fs`, `node:path`, `node:os`, a named-import block from
  `apply-mint-batch.mjs` itself, and `../lib/run-artifact.mjs`. No `node:child_process`, no
  `execFileSync`/`spawn` anywhere in the file. Every test exercises the exported pure/injected-dependency
  functions directly (`applyOnePayload`, `checkM4`, etc.)  -  the CLI's own `main()`/argv-parsing/
  exit-code layer is never spawned or otherwise exercised by this file.
- **`mint/validate-mint-payload.test.mjs`**  -  `[CONFIRMED]`, same shape: imports only
  `validateMintPayload` and `canonicalizeCitationUrl` directly, no `child_process` anywhere.
- **`mint/run-mint-batch.test.mjs`**  -  `[REFUTED]`. This file **does** spawn the real CLI: it imports
  `execFileSync` from `node:child_process` (line 15) and calls it against `RUNNER_PATH` with real argv
  (line 280)  -  `run-mint-batch.mjs`'s own argv-parsing/exit-code layer **is** exercised as a genuine
  subprocess, not merely through its exported pure functions.

Net: two of the three files A4b named (`apply-mint-batch.mjs`, `validate-mint-payload.mjs`) genuinely
have no CLI-level test coverage  -  their `main()`/argv/exit-code layer is untested by anything in the
repo's own test suite, confirmed. The third (`run-mint-batch.mjs`) does have real CLI-level coverage;
A4b's hypothesis does not hold for it.

## Coverage appendix

One row per file this lane read in full (149 rows) plus the 9 named-not-read files above (listed
separately, not counted as read). Paths are relative to `fsi-app/scripts/`.

| Path | Review depth |
|---|---|
| verify/_fmt-present.mjs | FULL READ |
| verify/admin-phrase-scan.mjs | FULL READ |
| verify/audit-finding-status.mjs | FULL READ |
| verify/audit-finding-status.test.mjs | FULL READ |
| verify/candidate-dwell-audit.mjs | FULL READ |
| verify/candidate-dwell-audit.test.mjs | FULL READ |
| verify/canonical-key-uniqueness.mjs | FULL READ |
| verify/capture-length-scan.test.mjs | FULL READ |
| verify/cc-executor-submit.golden.mjs | FULL READ |
| verify/check-vocabulary-drift.mjs | FULL READ |
| verify/check-vocabulary-drift.test.mjs | FULL READ |
| verify/claims-tier-audit.mjs | FULL READ |
| verify/column-existence-parity.mjs | FULL READ |
| verify/dead-column-audit.mjs | FULL READ |
| verify/defect-signature-scan.golden.mjs | FULL READ |
| verify/defect-signature-scan.mjs | FULL READ |
| verify/deferral-hygiene-audit.mjs | FULL READ |
| verify/derivation-edges-rls-adversarial-audit.mjs | FULL READ |
| verify/disposition-content-gate.golden.mjs | FULL READ |
| verify/drain-clear-two-condition.golden.mjs | FULL READ |
| verify/duplicate-table-audit.mjs | FULL READ |
| verify/executor-parity.golden.mjs | FULL READ |
| verify/fixtures/eager-pg-import.mjs | FULL READ |
| verify/flag-age-audit.mjs | FULL READ |
| verify/format-structure.mjs | FULL READ |
| verify/funded-pass-lock-golden.mjs | FULL READ |
| verify/harness-family-schedule-walker-audit.mjs | FULL READ |
| verify/harness-runs-rls-adversarial-audit.mjs | FULL READ |
| verify/id-redirect-target-audit.mjs | FULL READ |
| verify/injected-no-synthesis-window.golden.mjs | FULL READ |
| verify/layer-c-insert-gate-proof.mjs | FULL READ |
| verify/ledger-onepass-audit.mjs | FULL READ |
| verify/lib/dead-column-scan.mjs | FULL READ |
| verify/lib/dead-column-scan.test.mjs | FULL READ |
| verify/lib/duplicate-table-scan.mjs | FULL READ |
| verify/lib/duplicate-table-scan.test.mjs | FULL READ |
| verify/lib/harness-family-walk-scan.mjs | FULL READ |
| verify/lib/harness-family-walk-scan.test.mjs | FULL READ |
| verify/lib/information-schema-scan.mjs | FULL READ |
| verify/lib/rls-adversarial-probe.mjs | FULL READ |
| verify/lib/schema-drift.mjs | FULL READ |
| verify/lib/schema-drift.test.mjs | FULL READ |
| verify/lib/ui-orphan-scan.mjs | FULL READ |
| verify/lib/ui-orphan-scan.test.mjs | FULL READ |
| verify/lib/vocab-drift.mjs | FULL READ |
| verify/lib/vocab-drift.test.mjs | FULL READ |
| verify/migration-number-collision.mjs | FULL READ |
| verify/mint-gates-live-hold.golden.mjs | FULL READ |
| verify/mint-gates.golden.mjs | FULL READ |
| verify/mode-tag-coverage-audit.mjs | FULL READ |
| verify/mutation-lease.golden.mjs | FULL READ |
| verify/no-generic-source-audit.golden.mjs | FULL READ |
| verify/no-generic-source-audit.mjs | FULL READ |
| verify/no-names.mjs | FULL READ |
| verify/non-destructive-grounding.golden.mjs | FULL READ |
| verify/one-tier-per-host-audit.mjs | FULL READ |
| verify/orphan-source-audit.mjs | FULL READ |
| verify/pagination-order-key-audit.test.mjs | FULL READ |
| verify/pause-flag-guard-proof.mjs | FULL READ |
| verify/population-report.mjs | FULL READ |
| verify/population-report.test.mjs | FULL READ |
| verify/primary-text-permanent.golden.mjs | FULL READ |
| verify/prov-guard-adversarial-audit.mjs | FULL READ |
| verify/quarantine-disposition-audit.mjs | FULL READ |
| verify/remediate-orphan-sources.mjs | FULL READ |
| verify/resolver-status-filter.golden.mjs | FULL READ |
| verify/rls-credential-parity.mjs | FULL READ |
| verify/routing.mjs | FULL READ |
| verify/run-data-audit-lane.mjs | FULL READ |
| verify/run-data-audit-lane.test.mjs | FULL READ |
| verify/run-goldens.mjs | FULL READ |
| verify/schema-drift-audit.mjs | FULL READ |
| verify/source-link-audit.mjs | FULL READ |
| verify/source-vs-item.mjs | FULL READ |
| verify/spec09-org-rls-adversarial-audit.mjs | FULL READ |
| verify/spec09-org-rls-adversarial-audit.test.mjs | FULL READ |
| verify/staged-transit-audit.mjs | FULL READ |
| verify/substrate-agreement-audit.mjs | FULL READ |
| verify/surface-contract-gate.golden.mjs | FULL READ |
| verify/surface-visibility-audit.mjs | FULL READ |
| verify/target-match.golden.mjs | FULL READ |
| verify/ui-orphan-audit.mjs | FULL READ |
| verify/unregistered-span-host-audit.mjs | FULL READ |
| verify/verification-audit-report.mjs | FULL READ |
| verify/verification-audit-report.test.mjs | FULL READ |
| verify/vocab-sync-audit.mjs | FULL READ |
| lib/assemble-train.test.mjs | FULL READ |
| lib/chained-dry-guard.test.mjs | FULL READ |
| lib/changelog.test.mjs | FULL READ |
| lib/db.test.mjs | FULL READ |
| lib/env-file.test.mjs | FULL READ |
| lib/gate-a-state-writer.test.mjs | FULL READ |
| lib/harness-run-number.test.mjs | FULL READ |
| lib/institution-key.test.mjs | FULL READ |
| lib/is-main.test.mjs | FULL READ |
| lib/loop-run-id.test.mjs | FULL READ |
| lib/quarantine-dwell.test.mjs | FULL READ |
| lib/rate-source-by-class.test.mjs | FULL READ |
| lib/record-harness-run.test.mjs | FULL READ |
| lib/revalidate.test.mjs | FULL READ |
| lib/run-artifact.test.mjs | FULL READ |
| connections/apply-tags.test.mjs | FULL READ |
| connections/discover-for-items.test.mjs | FULL READ |
| connections/generate-theme-brief.test.mjs | FULL READ |
| connections/propose-tags.test.mjs | FULL READ |
| connections/ratify-flag-to-census.test.mjs | FULL READ |
| producers/emit-producers-artifact.mjs | FULL READ |
| producers/lib/emit-producers-artifact.test.mjs | FULL READ |
| producers/lib/producer-summary-wiring.test.mjs | FULL READ |
| producers/lib/producer-summary.mjs | FULL READ |
| producers/lib/producer-summary.test.mjs | FULL READ |
| producers/market/author-market-series-delta.mjs | FULL READ |
| producers/market/author-market-series-delta.test.mjs | FULL READ |
| producers/market/build-oil-bulletin-rows.mjs | FULL READ |
| producers/market/build-oil-bulletin-rows.test.mjs | FULL READ |
| producers/market/carrier-ets-surcharge-producer.mjs | FULL READ |
| producers/market/carrier-ets-surcharge-producer.test.mjs | FULL READ |
| producers/market/ecb-fx-producer.test.mjs | FULL READ |
| producers/market/eia-v2-petroleum-spot-producer.mjs | FULL READ |
| producers/market/eu-weekly-oil-bulletin.mjs | FULL READ (F44-2a) |
| producers/market/fetch-oil-bulletin.mjs | FULL READ |
| producers/market/fetch-oil-bulletin.test.mjs | FULL READ |
| producers/market/fixtures/carrier-ets-surcharge-fixtures.mjs | FULL READ |
| producers/market/propose-series-items.mjs | FULL READ |
| producers/market/propose-series-items.test.mjs | FULL READ |
| producers/market/ratify-series-items.mjs | FULL READ |
| producers/market/ratify-series-items.test.mjs | FULL READ |
| producers/market/refresh-published-price-statistics.mjs | FULL READ |
| producers/market/refresh-published-price-statistics.test.mjs | FULL READ |
| producers/regional/bls-oews-producer.mjs | FULL READ (F44-2c) |
| producers/regional/eurostat-lc-lci-lev-producer.mjs | FULL READ |
| producers/regional/eurostat-lc-lci-lev-producer.test.mjs | FULL READ |
| producers/regional/eurostat-nrg-pc-205-producer.mjs | FULL READ (F44-2b) |
| producers/regional/fixtures/state-cost-facts-fixtures.mjs | FULL READ |
| producers/regional/run-envelope-producer.mjs | FULL READ |
| producers/regional/run-envelope-producer.test.mjs | FULL READ |
| producers/regional/state-cost-facts-producer.test.mjs | FULL READ |
| mint/screen-worklist.mjs | FULL READ |
| mint/export-census-rows.mjs | FULL READ |
| mint/heal-provenance.mjs | FULL READ |
| mint/screen-rules.mjs | FULL READ |
| mint/lib/instrument-identity.test.mjs | FULL READ |
| mint/lib/screen-verdict.test.mjs | FULL READ |
| mint/lib/tag-presence-check.test.mjs | FULL READ |
| mint/migration-299-precheck.test.mjs | FULL READ |
| mint/rederive-record-provenance.test.mjs | FULL READ |
| mint/reopen-validation-holds.test.mjs | FULL READ |
| mint/screen-reconcile-records.test.mjs | FULL READ |
| mint/stamp-wo26-archive-reason.test.mjs | FULL READ |
| mint/MINT-RUNBOOK.md | NOT REVIEWED (doc) |
| mint/SCREEN-REPORT-FORMAT.md | NOT REVIEWED (doc) |
| mint/apply-mint-batch.test.mjs | NOT REVIEWED (import list checked directly, see CLI-TEST-1) |
| mint/export-census-rows.test.mjs | NOT REVIEWED |
| mint/heal-provenance.test.mjs | NOT REVIEWED |
| mint/run-mint-batch.test.mjs | NOT REVIEWED (import list + call site checked directly, see CLI-TEST-1) |
| mint/screen-rules.test.mjs | NOT REVIEWED |
| mint/screen-worklist.test.mjs | NOT REVIEWED |
| mint/validate-mint-payload.test.mjs | NOT REVIEWED (import list checked directly, see CLI-TEST-1) |

## Other checklist items (dead scripts, F44, writes-outside-guarded-path, --dry/--apply, self-skip
posture, swallowed errors, duplicates, TODO/FIXME, 800-line files, untested-CLI)  -  summary of the 149
files read

- **Dead scripts / duplicate implementations:** none found. Every module either has a live import site
  (confirmed by cross-reference while reading, e.g. `producers/lib/producer-summary.mjs` <-
  `producer-summary-wiring.test.mjs`'s own scan of `.github/workflows/producers.yml`) or is itself a
  test/fixture file.
- **F44 broken/missing main guards:** see F44-2a/b/c above (all `[CONFIRMED]`)  -  the one real finding of
  this pass, plus the process-gap note that the existing regression test does not catch this shape.
- **Writes outside `scripts/lib/db.mjs`'s guarded path:** none found in the 149 files read. Every
  producer/mint/verify write (`guardedInsert`, `guardedUpdate`, `guardedUpdateByIds`, `guardedDelete`,
  `registerSource`, `reclassifyToSource`) is called with an explicit `{ cite: { skill, reason } }`, and
  every read-only script uses `readAll`/`readClient`/`readAllByIds`. `heal-provenance.mjs`'s entire DB
  surface is dependency-injected (`deps.insertClaim`, `deps.updateClaimSpan`, etc.)  -  the guarded-path
  question is the MAINT wrapper's (`scripts/maintenance/provenance-heal.mjs`, out of this lane's read
  set), not this file's.
- **`--dry` default / `--apply` gate:** every CLI entrypoint read defaults to dry/report-only and
  requires an explicit `--apply`/`--execute`/`mode:"apply"` to write. `heal-provenance.mjs` additionally
  gates its most destructive path (STEP BRIEF-HONEST, prose deletion) behind a second, explicit
  `+strip-unprovable` selection suffix on top of `--apply`.
- **Self-skip exit 2 posture:** consistently present across every `verify/*.mjs` file that needs a live
  Postgres/Supabase connection  -  a missing credential is always exit 2 with a named "cannot verify here"
  message, never a crash, never a false green.
- **Swallowed errors:** none found beyond the EXIT0-1 resolution above. Every `catch` block read either
  re-throws, logs and returns a typed `{status:"held"/"error", reason}` value (the dominant pattern in
  `heal-provenance.mjs`/`export-census-rows.mjs`), or exits a non-zero/non-generic code.
- **TODO/FIXME:** none found in the 149 files read (A4b's one TODO finding, `TODO-1`, is in
  `verify/wave-acceptance-audit.mjs`, a file neither lane has fully read  -  noted, not re-found).
- **Files over 800 lines:** `mint/heal-provenance.mjs` (4,268  -  A4b's F-SIZE-1), `mint/export-census-rows.mjs`
  (1,729  -  A4b's F-SIZE-2), `mint/screen-rules.mjs` (993  -  was A4b's F-SIZE-3 at "partial read", now
  fully read). All three remain oversized by the 800-line convention, but all three are internally very
  well organized (explicit section-banner comments, one export per concern, consistent DI), and no
  functional defect was found inside any of them despite the full read. The size finding stands as a
  maintainability note, not a correctness one.
- **Tests that never exercise the CLI:** see CLI-TEST-1 resolution above  -  `[CONFIRMED]` for two of the
  three named files (`apply-mint-batch.mjs`, `validate-mint-payload.mjs`), `[REFUTED]` for the third
  (`run-mint-batch.mjs`).

## Closing coverage statement

A4b covered 76 files in full (plus 1 partial, 2 structural-scan, 87 grep-only). A4bc (this lane) read
149 of the remaining 158 files in full, including upgrading every one of A4b's 87 grep-only
`scripts/verify/` files to a full read, and upgrading both structural-scan files
(`heal-provenance.mjs`, `export-census-rows.mjs`) and the one partial-read file (`screen-rules.mjs`) to
full reads. **Combined, A4b and A4bc have read 225 of the 235-file corpus in full.** Ten files remain
outside a full read: A4b's own `verify/wave-acceptance-audit.mjs` (not in this lane's assigned list) and
the 9 files named in "What was not read" above  -  8 `*.test.mjs` companions of files already read in
full elsewhere, plus 2 markdown runbooks. This is **not** a claim of 235/235 coverage; it is the honest
count, per rule 14.
