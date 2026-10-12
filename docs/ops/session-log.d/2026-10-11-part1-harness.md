# 2026-10-11, lane P1-08 (part1-harness): the harness Keep/Refactor/Trash register

Branch coord/part1-harness from origin/master 904680db0. Cloud session (no database, no operator machine). Brief from the coordinator session: read the harness module whole, write one register with its build-plan section, change no code. Register written 2026-10-12 UTC (clock from `date -u`); the file name keeps the lane date the brief gave.

## Accomplished

- `docs/plans/rebuild/part1/harness.md`: module verdict REFACTOR AND PORT; 6,848 code lines today (62 code files, plus 877 lines of JSON and Markdown), about 2,772 after the port: about 460 for the harness itself (one recorder, one ledger table, one chain hand-off, a family descriptor loader, the outcome contract, the proof readers) and about 2,312 that leave this module for core/db, P1-03/04, P1-05/06, P1-09/10, P1-11 and P1-12..15. Bloat ranked (ten rows), dead code with the grep that proved each, duplicates (six `hostOf` definitions among them), non-essential artifacts, a file register row per file, and the build plan: new files, a map of all 37 families to their emitter kind and new home, the ledger table proposal, interfaces, invariants, rulings owed, the P1-P6 proof readers, port order, features, defects not to repeat.
- `docs/plans/rebuild/data-invariants.md`: INV-162 (every firing lands one ledger row with inputs, outputs, outcome), INV-163 (a successful runtime with apply evidence triggers its downstream in the same run; the row carries upstream and root run ids), INV-164 (the table is the only run record; no committed artifact file; tests never write the real ledger), INV-165 (a surface reads published figures from Supabase, never a committed fixture); count line updated to 165 (INV-156 to INV-161 were taken by lane P1-03, merged first; these were renumbered at the merge).
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 103 in-scope rows written (104 occurrences, B-0065 appears twice). By occurrence: 55 CLOSED (51 "PR 1131, file deleted by CLEAN-3", 2 PR 1126, and B-0504 and B-2206 PR 1131 with their reasons), 28 TRASH, 18 CONFIRMED-P1, 3 REFUTED (B-0311, B-0388, B-1054), with the evidence in each cell. Row counts from `git diff | sort | uniq -c`.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract; the new register needs its INDEX line from the coordinator).

## Coverage (every file read whole with the Read tool)

104 files, 10,985 raw lines, 104 Read calls, one per file. The per-file table is section 1 of the register. `scripts/harness-runs/CONVENTION.md` is not on the tree (deleted by CLEAN-3, f906b210); it was read whole from `git show f906b210^:fsi-app/scripts/harness-runs/CONVENTION.md` (365 lines) because the register has to say what the old envelope was. No file in SCOPE was left unread.

## Decisions

- CLEAN-3 removed every workflow that fired a harness family except live-smoke, so today only live-smoke records into `harness_runs` [CONFIRMED: grep of the two surviving workflows]. The register treats the 37 descriptors as a map of runtimes to rebuild, not as live wiring.
- Two numbering authorities (`claimRunId` mkdir and `record-harness-run` renumbering to max+1) and the parallel `brief_apply_runs` ledger (migration 322) both fold into one ledger table keyed by uuid; the proposal is in section 8 and needs a schema ruling (P1-11).
- `db.mjs`, `pg-conn.mjs`, `env-file.mjs` are the script write discipline, not harness; they move to core/db. Domain helpers in `scripts/lib` move to their owning modules (section 8 table).
- The `src/app/market/page.tsx:37` import of the DESNZ fixture is recorded as a defect not to repeat (INV-165), not fixed here (no code changes in a fact lane).
- Landing: `git merge origin/master` conflicted with lane P1-03 (a2f9f3f1) on data-invariants.md (both lanes appended INV-156 onward) and on one BACKLOG row pair (B-0888 is P1-03's, B-0889 is this lane's); resolved in the merge commit, so the branch carries the lane commit plus that merge.
- Commit trailer: the brief asked for a named model trailer; the session's own attribution trailer is used instead.

## Verification

- `wc -l` and the awk code-line count over the 104 files (register section 1).
- `grep -rn` per symbol over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github (register section 4 names each).
- `git log --diff-filter=D` per backlog object: 52 deleted by f906b210 (CLEAN-3, PR 1131), 2 by 2a720f32 (CLEAN-1, PR 1126), 49 present; PR numbers from GitHub search.
- Migration greps: `harness_runs` created by 331 with no outcome column; `brief_apply_runs` by 322; no migration creates `d3_runs`; the five stale keys in `table-primary-keys.mjs` dropped by migrations 335, 341, 343.
- No database was reached; every live-state claim in the register is [HYPOTHESIS] and says so.
