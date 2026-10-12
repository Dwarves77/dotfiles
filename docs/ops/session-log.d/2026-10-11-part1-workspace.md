# 2026-10-12, lane P1-02 (part1-workspace): the workspace Keep/Refactor/Trash register

Branch coord/part1-workspace from origin/master 904680db (P1-01 merged; 195a7c07e is an ancestor). Cloud session (no database, no operator machine, no sub-agents). Brief from the coordinator session on the operator's machine, relayed by cloud session dotfiles-bd: read the workspace, profile, onboarding and settings module of fsi-app whole and write its Keep/Refactor/Trash register plus build-plan section as one PR. Clock from `date -u` at the first count: 2026-10-12 00:51 UTC (the file is dated to the lane's brief, 2026-10-11, per the LANDING line).

## Accomplished

- `docs/plans/rebuild/part1/workspace.md` (408 lines): module verdict REFACTOR AND PORT; 8,071 code lines today (10,174 raw), about 4,900 estimated for the workspace module plus about 510 for the three files that leave it (sourceStore and types/source to P1-05/06, types/resource to core/types); TRASH as code: SavedSearchesSection, DataSummary, navigationStore and the nav types, with their features recorded in section 8. Sections 1 to 8 match the P1-01 exemplar's shape.
- `docs/plans/rebuild/data-invariants.md`: INV-156 (team archive gated, attributed, org-scoped fan-out; personal archive ungated; personal layer wins), INV-157 (attribution columns from the session, first applier kept), INV-158 (owner or assignee is a member and never a viewer, fail closed), INV-159 (jsonb settings patched key-wise; the settingsStore writer violates it and is unreachable). Count line updated to 159.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 42 in-scope row occurrences written (39 ids; B-0043, B-0044 and B-0045 appear twice in that file): 33 CONFIRMED-P1, 2 CLOSED (B-0086 by CLEAN-3 f906b210, B-0290 by DATA-3a 580d8ff6), 1 REFUTED (B-0174 describes correct behaviour), 3 TRASH (B-0187 and B-0550 SavedSearchesSection, B-1588 navigationStore).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract, as P1-01 recorded; the new register needs its INDEX line from the coordinator). No code changed. No live database read.

## Coverage (every file read whole with the Read tool)

47 files, 10,174 raw lines, 8,071 code lines (awk: blank, `//`, `/* */` and leading-`*` lines stripped), 47 Read calls, one per file. The coverage table in the register's section 1 lists each file. Scope expanded with `git ls-files` over the 14 directories the brief names; it matched the relaying session's count of 47 files and 10,174 lines exactly [CONFIRMED]. Test files beside the scope: 0 on this tree (CLEAN-3).

## Method and evidence

- Consumer evidence: two censuses over fsi-app/src, scripts, supabase and .discipline. Import-line census (files importing each scope module by `@/` or relative path) for section 7; symbol census (`grep -rlw <symbol>` excluding the defining file) for section 4, each dead-code row re-checked by hand. Route callers by `grep -rn -F '/api/workspace/'` (12 fetch sites in 6 files outside scope).
- Tables and env: `.from("` and `.rpc("` scan (68 table sites, 1 rpc), `process.env` scan (3 sites). Table column lists from a single-pass multi-line scan of the 352 migration files (CREATE TABLE and ALTER TABLE ADD COLUMN); policy counts from `CREATE POLICY ... ON <table>` matches.
- Prior work: A2-part6 (127 lines), A2-part7 (108) and A1-part2 (212) read whole; A3 and A4 (plus A4d) by their rows naming an in-scope path, located by grep. A4 at 465 KB and A3 at 174 KB were not read whole, per the brief.
- Backlog rows: `grep "| fsi-app/<scope path>"` per scope directory (42 occurrences). Closing commits found with `git log --diff-filter=D` and `git log -S`.
- The biggest finding is mechanical, not a pattern match: `settingsStore.loadFromWorkspace` has 0 callers outside the store, so the store's `orgId` is never set, `debouncedSave` never runs and `BriefingScheduleSection` (which reads that `orgId`) never loads or saves. The A2-part6 register reached "write-only" by noting that nothing reads the saved keys; this read names why the writes never happen either. It is a `[CONFIRMED]` by census, not a render.
- A second finding for P1-01 jointly: `profiles.sector_overrides` has no writer anywhere in src or scripts (11 hits, all reads or comments) while the identity seed reads it as the per-user sector list; onboarding and settings write `workspace_settings.sector_profile`. Recorded as a gap for the coordinator in section 8.

## Decisions

- Files in scope by directory but owned by other modules (sourceStore.ts, types/source.ts, types/resource.ts) are dispositioned here with their owner named, following the P1-01 precedent for supabase-server.ts.
- Features whose code is TRASH keep a row in the feature table with the ruling they need (saved views need a workspace-scoped table; the data summary's question moves to the Coverage page, marked HYPOTHESIS).
- The LinkedIn import is recorded as IN FLIGHT, NOT DROPPED (operator, DEVIATION-LOG 2026-09-07), with its destination columns named (migration 007), in both this register and P1-01's.

## Blockers

None. Push and PR follow this entry; if either fails, the exact error is appended here.

## Next steps (for the coordinator)

- INDEX line for `docs/plans/rebuild/part1/workspace.md`.
- Rulings owed: the owner of components/pages/SettingsPage.tsx, src/lib/tags, src/lib/portfolio and src/lib/hooks (gaps 1 to 3 in section 8); the single sector source (`workspace_settings.sector_profile` versus `profiles.sector_overrides`, gap 4); whether saved views and the data summary return.
