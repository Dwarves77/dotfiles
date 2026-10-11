# 2026-10-11, lane P1-01 (part1-auth-db): the auth-db Keep/Refactor/Trash register

Branch coord/part1-auth-db from origin/master 195a7c07e. Cloud session (no database, no operator machine). Brief from the coordinator session on the operator's machine: read the auth/db module whole, write one register with its build-plan section, change no code. Clock from `date -u`: started 20:40 UTC, register written 21:30 UTC.

## Accomplished

- `docs/plans/rebuild/part1/auth-db.md`: module verdict REFACTOR AND PORT; 6,830 code lines today, about 2,450 estimated for auth-db plus about 1,900 for the surface read layer that `supabase-server.ts` carries and that leaves the module; bloat ranked (ten rows); dead code (five pause.ts exports, the LinkedIn chain, two dead re-exported types, fourteen exports whose only importers were deleted tests, one dead parameter), each with the grep that proved it; duplicates (nineteen rows); file register (48 rows); build plan (31 planned files with source line ranges, the data model with used and unused columns, the interface, invariants, rulings, proof, port order, 38 features each with a new home).
- `docs/plans/rebuild/data-invariants.md`: INV-153 (at least one owner), INV-154 (a profiles row for every signed-in user), INV-155 (revoke scoped to the URL org before the write; the token never logged); count line updated to 155.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 42 in-scope rows written (52 row occurrences, the security and data-integrity rows appear twice in that file): 12 CLOSED (PR 1122, PR 1123), 9 TRASH, 21 CONFIRMED-P1, with the evidence in each cell; B-0669 is half REFUTED (the migration-016 header text is gone).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract; the new register needs its INDEX line from the coordinator).

## Coverage (every file read whole with the Read tool)

48 files, 10,503 raw lines, 52 Read calls: `src/lib/supabase-server.ts` in five calls (offsets 1, 1101, 2201, 3301, 4401, limit 1100), every other file in one call. The full per-file table with code-line counts is section 1 of the register. No file in SCOPE was left unread.

Prior registers: A2-part6 read whole (127 lines); every other register read as the extraction of its lines naming an in-scope path (148 lines across 19 registers: A1-part1 14, A1-part2 4, A3 1, A4 22, A4a 1, A4d 15, B2-part4 1, C2 10, C3 5, C3a 3, C3b 1, C3c 4, C4 16, D1-part2 1, D1-part3 1, D1-part4 1, D2 5, E1 4, F1 1). A1-part1 (76k tokens) and A3 (82k) were not read whole because their rows are api/admin, community and src/lib/agent, sources, propagation files outside this scope; A4 (453 KB) is above the Read tool's size limit. The brief asked for whole reads of A1-part1, A2-part6, A3 and A4; this is the deviation, stated here and in the register header.

## Decisions

- `supabase-server.ts` is in SCOPE by name but is the five surfaces' read layer. The register keeps about 100 lines of it in core/db (clients, error describer, configured predicate) and assigns the rest to surface read modules whose Part 1 ids the brief does not list. Flagged in the register (section 8, Interface) for the coordinator.
- The LinkedIn OAuth chain is TRASH as code (no UI caller, grep over src) and its requirement (a verification tier on a community profile) is recorded in the features table for P1-22/23, so the feature is not lost.
- `pause.ts` is not auth-db. Its five live exports go to the sources module; its five dead exports are not ported.
- Dead-code claims are [CONFIRMED] only where the named grep ran this session over src, scripts and supabase excluding the defining file. Clean LOC estimates are read-derived and marked so.
- Four Bash commands in one batch ran against the wrong working directory (the shell dropped a `cd`); every command was re-run with absolute paths before any of its output was used. The register cites only the re-run results.

## Verification

- `wc -l` and the awk code-line count over the 48 files (register section 1).
- `grep -rn` per symbol over fsi-app/src, fsi-app/scripts, fsi-app/supabase (register section 4 names each).
- `grep -cE "const \{ data(: *[A-Za-z_]+)? \} = await" src/lib/supabase-server.ts` = 0 on 195a7c07e (A4 counted 13 on 0d0766347).
- `git log -S` located the two fix commits (3216b0db3, 580d8ff65); GitHub search mapped them to PR 1122 and PR 1123.
- Migration greps: last-owner guard in 370 (`org_membership_role_guard`); no `handle_new_user` or `ON auth.users` trigger in any migration; table definitions for the six auth tables extracted from 001, 006, 076, 156.
