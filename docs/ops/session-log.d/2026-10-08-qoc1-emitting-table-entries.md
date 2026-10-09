# 2026-10-08 QOC-1 emitting-table-entries (lane qoc1-emitting-table-entries)

## Accomplished
- EMITTING_TABLE_EVENT_MAP in `fsi-app/src/lib/learning/questions-on-change.mjs` is now built once at module load from `fsi-app/src/lib/learning/emitting-tables/<table_name>.json` (one file per table, 10 files, sorted by filename), via the exported `buildEmittingTableEventMap(dir)`. Same exported name, frozen, same shape: no consumer changed.
- A malformed file, a `table_name` that differs from the filename, an unknown field, an unknown `describe` name all throw naming the file. A duplicate `table_name` is impossible by construction (filenames are unique and must equal `table_name`).
- Contract line added to the migrations bullet of `docs/dispatches/lane-common-contract.md`.

## Read and reused
- Read: `questions-on-change.mjs` (map, header, consumers), its test file, the contract's migrations bullet. Importer grep over `src/` and `scripts/`: the only non-test importer is `scripts/turns/run-propagation-drain.mjs` (Node script); `drain.ts` and `signpost-watch.ts` mention the module in comments only. No client component, edge route or browser bundle imports it, so the fs-based form is safe.
- Reused: the S8-E0 entry-directory precedent; the existing pin tests (every emitting table is mapped, no stale entry) are unchanged and green.

## Decisions
- The two identity entries carried a function (`describe: describeIdentityChange`), which JSON cannot hold. The file carries `"describe": "identity"`, resolved through a small named-describer table in the module. A new table that needs a new describer adds a name there.

## Evidence
- Red: the new tests against master's module fail with `does not provide an export named 'EMITTING_TABLES_DIR'`. Green: `node --test src/lib/learning/questions-on-change.test.mjs` 31 pass, 0 fail (24 existing + 7 new). The new test deep-equals the built map to master's old literal (copied from git).
- `scripts/turns/run-propagation-drain.test.mjs`: one failure, the loop_run_id resolution test (expected red until LOOPID-1 merges); not touched.

## NOT done
- No migration, no live access, no change to any other file.
