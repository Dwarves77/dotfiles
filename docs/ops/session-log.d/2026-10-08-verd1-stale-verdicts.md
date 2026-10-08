# 2026-10-08 lane verd1-stale-verdicts (VERD-1): stale verdicts are re-authored through the drain, proven on fixtures

## Accomplished
- Confirmed the premise facts first. A ledger "verdict" is an entry in a committed `scripts/turns/ledger-verdicts/ledger-verdicts-NNN.json` batch, not a database row: `portal_link_candidates` (migrations 162, 220) holds no verdict column and nothing in `supabase/migrations` carries a `superseded_by` on a verdict. The two committed batches hold 30 and 356 entries (386), all under `sha256:70ca104246d8bb95`; the live `FIRST_FETCH_CLASSIFY_PROMPT_VERSION` read through the real CLI is `sha256:1ceca92ff0dfae68`. A stale entry is already excluded per entry by `partitionVerdictsByPromptVersion` (not refused), so its candidate stays `status='candidate'`.
- `scripts/turns/run-ledger-consume.mjs` (the ledger exporter, validator and apply driver):
  - `indexVerdictVersions(batches, liveVersion)`: per URL, still OWED (only stale entries) or SUPERSEDED (a current entry exists in any batch). Derived, never written onto the old entry.
  - `--export-candidates ... --stale-verdicts`: pages the ledger by keyset, keeps only owed rows, fetches `--with-text` for kept rows alone, annotates each with `verdict_prompt_version`, `verdict_batch`, `verdict_classified_at` (identity only, never the old classification). Its cursor artifact is tagged `export_mode: "stale"`; `findLatestExportArtifact` takes a `mode` so a stale export never resumes a pending one and the reverse. A stale export always starts from the beginning because the owed set shrinks as batches land.
  - `--check-verdicts <file>` (dry, no database, runs before the credentials check): `checkVerdictsBatch` refuses an invalid file or any entry not under the live prompt_version, accepts a current entry for a stale-only URL and reports it as superseding it, allows a repeat of a current URL (later batch wins, existing rule) and counts it.
  - `loadVerdictBatchFiles`: one loader now used by the consume path, the stale export and the check (same exit-4 message texts).
  - The consume run's artifact records the supersession: `config.stale_verdicts {open, superseded}`, `metrics.stale_verdicts_open` / `stale_verdicts_superseded`, and `per_item[].supersedes_stale_verdict {prompt_version, batch, superseded_by_batch}` on an item decided by a verdict that superseded a stale one.
- `scripts/drain/kinds.mjs`: the ledger kind registers `modes.stale` (same exporter plus `--stale-verdicts`); `DEFAULT_MODE`, `kindModes`, `exportArgvFor`, `resolveKind` (exact id or unique prefix).
- `scripts/drain/plan-drain.mjs`: `--kind`, `--mode`, `--dry`; `planDrain` takes `kindId`, `mode`, `dry`; `selectStaleItems` (plan-level guard: keeps only rows whose verdict version differs from the live one the exporter reported, oldest candidate first; a stale export that does not report the live version is an export error, never a guess); `runPlanCli` is the planning half of the CLI over injected I/O; `runExporter` passes the mode and returns `current_prompt_version`. `--dry` still reads the switch first (STEP 0), takes no lease, writes no plan file.
- `.claude/commands/drain.md`: new "LEDGER KIND, STALE MODE" section (invocation, a separate run per mode, write each verdict fresh from the exported text and never from the old entry, new file only, validate with `--check-verdicts`). `fsi-app/scripts/harness-runs/judgement-drain/FAMILY.md`: "Selection modes" section.

## Red then green
- `run-ledger-consume.test.mjs` (namespace-import block appended): against the code before this lane, 16 of 151 tests failed (the new ones, each `M.<fn> is not a function` or an assertion on the missing field); after: 151 of 151 pass. The existing `partitionVerdictsByPromptVersion` stale-excluded tests are untouched and still pass, plus a restated one.
- `plan-drain.test.mjs`: before, 14 of 36 failed (13 new plus the existing `parseArgs and defaultRunId` test whose expected object gained `kind`, `mode`, `dry`); after, `plan-drain.test.mjs` + `kinds.test.mjs` + `resolve-push-batch.test.mjs` + `switch.test.mjs`: 54 of 54 pass.
- The brief's fixture test: "3 stale + 2 current rows -> the plan lists the 3, in age order, none of the current" is `selectStaleItems: 3 stale + 2 current rows` and `stale mode plan: lists only the stale rows in age order`.

## Dry run (fixture, `runPlanCli` with the CLI's argv `--kind ledger --mode stale --dry`; asserted: no lease taken, no plan file written)
```
drain: on (dry run: nothing written, no lease taken). 2 item(s) in 1 batch(es) across 1 kind(s)
  ledger-verdicts [stale]: exported 3, planned 2 in 1 batch(es), 1 not stale, would lease 2
    scripts/turns/ledger-verdicts/ledger-verdicts-001.json: 00000000-0000-4000-8000-000000000003, 00000000-0000-4000-8000-000000000001
```
The literal `node scripts/drain/plan-drain.mjs --kind ledger --mode stale --dry` cannot print a plan in this lane: with no credentials the switch read counts as off and it prints `drain: off`, by design (STEP 0). Real CLI runs of the new validator against the committed data (no database): `run-ledger-consume.mjs --check-verdicts` on `ledger-verdicts-002.json` exits 4 (REFUSED, 356 errors, every entry `sha256:70ca104246d8bb95` vs live `sha256:1ceca92ff0dfae68`); on a two-entry fixture under the live version (one re-authoring a URL from batch 001, one new URL) it exits 0: `2 entr(ies), 1 supersede a stale committed verdict, 1 for URLs with no committed verdict, 0 repeat a current verdict`. The 386 live rows were not touched.

## Read and reused
- Read in full: CLAUDE.md, lane contract, `scripts/drain/{kinds,plan-drain,resolve-push-batch,artifact}.mjs` and their tests, `.claude/commands/drain.md`, `judgement-drain` FAMILY.md and family.json, `scripts/turns/run-ledger-consume.mjs` (1809 lines) and the relevant parts of its test, `ledger-verdicts/README.md` and `schema.json`, the head of `ledger-consume.yml`, harness CONVENTION.md (the pending-marker convention is retired), migration list (latest 372).
- Reused, not rebuilt: `partitionVerdictsByPromptVersion`, `indexVerdictsByUrl`, `discoverVerdictsFiles`, `validateVerdictsFile`, `runExportCandidates` / `buildCandidateExportPayload` / `buildExportRunArtifact` (extended, not copied), `selectCandidateLedgerPage` (through the injected `selectPage`), `buildFetchDoc`, `resolveExportAfter`, the drain's `nextBatchPath`, mutation leases, `readDrainSwitch`.

## Decisions (each one a fact about the repo, not a choice the brief left open)
- No migration. The brief allowed a `superseded_by` column "if the ledger table lacks one"; the ledger table holds candidates, not verdicts, and the verdicts are committed files that are never edited in place (rule 1 of the brief). Supersession is therefore derived from the committed batches and recorded in the consume run's own artifact. If the coordinator wants a stored marker in the database, that is a different design and needs a ruling.
- "A batch verdict under a stale prompt_version is still refused (existing rule)": the existing rule excludes such an entry from use (non-fatal, counted); it does not refuse it. The refusal is new and lives in `--check-verdicts`, the pre-landing check. The consume path keeps its non-fatal exclusion (test kept), so an already-committed stale batch still loads.

## NOT done
- Nothing applied, no live row touched, no stale batch authored (the first real stale batch is Stage 9 by operator word). The literal live export (`--export-candidates --stale-verdicts` against the database) was not run: no database access in this lane; proven on fixtures with an injected `selectPage`.
- Follow-up commit (coordinator grant): the ledger README gained a stale-verdicts section (export mode, write fresh, `--check-verdicts`), and `scripts/drain/artifact.mjs` now records each kind mode in `config.kinds[]` (a plan entry with no mode reads as pending); red then green in `plan-drain.test.mjs` (1 failing before, 55 of 55 drain tests after).

## Open items
- Cost note for Stage 9: a stale export fetches page text for up to the batch size (300) rows at the 1 second politeness gap, the same as a pending export.
