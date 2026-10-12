# 2026-10-12, lane P1-26 (part1-admin-b): the admin-b Keep/Refactor/Trash register

Branch coord/part1-admin-b from origin/master 0ad87a94. Cloud session (no database, no operator machine, no sub-agents). Brief from the coordinator session, relayed through cloud session session_017roa4G2MvGYnw8ejDsgHpu (lane P1-02): read the platform-admin API, the admin pages, lib/admin, test-support and the admin readers of supabase-server.ts whole, write one register with its build-plan section, change no code. Clock from `date -u`: last verification grep at 04:21 UTC, register written after it, 2026-10-12.

## Accomplished

- `docs/plans/rebuild/part1/admin-b.md`: module verdict REFACTOR AND PORT; 7,608 code lines today (9,424 raw: 79 files plus the 312-line admin read block of supabase-server.ts), about 3,560 estimated (47 percent), with recompute-trust's two tier writers (46 lines) moving to P1-05's trust module; bloat ranked (eleven rows, led by the seven metered routes and two metered forwarders, about 1,580 code lines); dead code (13 rows); duplicates (19 rows); file register (80 rows: 21 KEEP AS-IS, 48 REFACTOR AND PORT, 11 TRASH); build plan with the route register by role (every route with its guard, reads, writes, role and free replacement), 31 planned files with source line ranges, the data model with unused columns, the interface by lane id, four gaps for the coordinator, invariants, rulings cited, proof, port order, 42 features each with a new home or a NOT PORTED reason.
- `docs/plans/rebuild/data-invariants.md`: INV-227 to INV-232 appended after master's INV-226; the Count line updated to 232 with the lane clause.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 57 in-scope rows written (71 row lines: 14 rows appear twice, in the "65 rows marked SECURITY or DATA-INTEGRITY" section and in the main table; both copies carry the same cell): 47 CONFIRMED-P1, 8 TRASH (routes or a handler this register trashes), 2 CLOSED (B-0072 the deleted npmtest, B-0998 the stripped header; both by the CLEAN-3 commit f906b2102, which carries no PR number), 0 REFUTED.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract); no code.

## Coverage (every file read whole with the Read tool)

79 files and one block, 9,424 raw lines, 80 Read calls (one per file; supabase-server.ts lines 255-585 in one call at offset 255). No file in SCOPE was left unread. The brief's count of 19 files under app/admin is 31 on this tree (12 are part.json descriptors); the brief's "~10,200 lines" is 9,424.

Prior registers, per the brief's "(admin rows)" qualifier: A2-part1-admin read whole (147 lines, its scope is src/components/admin, P1-25's files); A1-part1-src-app-api as its admin rows (`grep -n "api/admin\|lib/admin"`: 185 lines, read whole through the Read tool in two pages, the second page filtered of the 65 API-CHECKS lines that match only on "admin-gate=n/a"); A1-part2-src-app-pages as its admin rows (5 lines); 16 other registers as their scope-path rows (89 lines: A4d 16, A3 14, C2 9, C3 8, A1-part1 8, C4 7, MEM-1 6, D2 6, C3a 4, A4a 4, A4 4, A1-part2 4, C3b 3, B2-part4 3, F1 2, D1-part3 1, B1b 1, B1a-part3 1). Rulings and interface read from auth-db.md (whole), intake-b.md, sources-a.md and harness.md (their admin lines), runtimes-b.md's session log (the newest exemplar). ux-laws.md and design-principles.md read whole before writing the .tsx rows.

## Findings for the coordinator

1. [CONFIRMED] Seven routes under /api/admin make a metered call and two forward to the metered /api/agent/run; every call site is named in the register (file:line) with its free replacement. fsi-app/.claude/CLAUDE.md's "Permitted live Claude API calls" table lists five of them; the register's port order asks for that table to shrink with the routes.
2. [CONFIRMED] Three routes have no caller on this tree: recompute-trust (its workflow was retired 2026-10-07 and CLEAN-3 deleted the remaining workflows; `.github/workflows` holds ci.yml and live-smoke.yml), spot-check/recurring (spot-check-monthly.yml no longer exists; only scripts/harness-runs/spot-check-monthly/family.json names it, a family P1-08 should retire), and sources/[id]/bias-tags (no literal anywhere outside the route; the feature is kept, the UI mount is owed to P1-25). The users POST handler has no caller either.
3. [CONFIRMED] integrity-flags/route.ts holds six platform categories; migration 050 added a seventh (workflow_gap). A `?category=workflow_gap` filter is silently ignored and the counts strip never shows the category. Recorded as INV-230 (violated today).
4. [CONFIRMED] commit-tier-change writes no source_trust_events row while tier-override does; four audit inserts on the decision routes are unchecked. Recorded as INV-228.
5. [CONFIRMED] bulk-import validates a `type` column against a ten-value enum and a `language` column, then writes neither (the provisional insert carries name, url, description, discovered_via, provisional_tier, status). Half-slice, kept for the port.
6. [CONFIRMED] mapSourceRow in supabase-server.ts fabricates a trust score of 50 (components 20, 10, 10, 10), an accuracy of 0.5 and an accessibility of 1.0 for a row with none; the dashboard renders them as measurements. The port keeps nulls.
7. Gaps: lib/corrections/admin-api/handlers.ts (the corrections API's body) and src/components/sources/* (nine of these routes' callers) are in no Part 1 register this lane can see; the brief's ruling names P1-04 for the deterministic classifier while intake-b.md:233-234 places the axis classifiers in P1-05's tree (one ruling on the home is owed).
8. Two backlog rows closed by CLEAN-3 (the stripped header of B-0998, the deleted test file of B-0072) have no PR number because f906b2102 was committed without one; the cells say so.

## Decisions

- The decision routes (canonical decide, bulk-approve, provisional promote) port as one `decideSourceCandidate`; the four model recommenders are not ported, the deterministic classifier (P1-05's host-authority, name rules, source role, institution-class bias tags) answers at read time, nothing cached.
- Both regeneration forwarders port as one queue insert into corpus_turn_requests (by item or by source), the turn runtime re-grounds; scan ports as a dispatch of the sweep and harvest turns.
- The parts galleries, their two fetch-patching scaffolds and the twelve descriptors move to src/ui with P1-17 as a static list (no request-time fs read).
- test-support/fake-supabase.mjs is TRASH (0 importers; it models none of the paged or single-row calls).

## Verification

- `wc -l` and the awk code-line count over the 79 files and the supabase-server block (the awk script is in the register's legend).
- An export scan (80 exported symbols, `git grep -l -w` over fsi-app/src, fsi-app/scripts, fsi-app/supabase, fsi-app/.discipline and .github/workflows, excluding the defining file), then a caller scan of every `/api/admin/...` literal outside the route directory (100 call-site lines) and an import scan of the scope.
- `grep` for `anthropic`, `messages.create`, `spendSearch`, `browserlessRender`, `/api/agent/run`, `recommendSourceTier` and `verifyCandidate(` over the scope for the metered call sites; `grep` for the data-only destructure, the bare awaited write and the count-only destructure patterns; `.from("` and `.rpc("` and `process.env.` scans.
- `ls .github/workflows`; `git log --diff-filter=D` for the deleted test files; `git log -S` for the stripped headers (both end at f906b2102); `grep -l workflow_gap supabase/migrations`; `grep -ln admin_action_cooldowns` and `bulk_imports` in migrations; `git ls-files` for test files under src (0).
- The register's text checked for em or en dash glyphs, the section-sign glyph and user-home paths: none.

## Not done

- No database read: every row-count claim (the 1000-row cap on pending candidates, scan's title set, the member list) stays [HYPOTHESIS].
- No page rendered: the 375 px notes on the admin pages and galleries are from the CSS read, labelled [HYPOTHESIS] in the register; no .tsx or .css was changed, so no UX compliance block is owed.
- The callers' body shapes in src/components/sources (whether any still sends the legacy `tier` field) were not read; that register is another lane's.

## Landing

- PR 1159 (https://github.com/Dwarves77/dotfiles/pull/1159), branch coord/part1-admin-b, one register commit f21f8e2b6 plus the merge of origin/master (master had moved to INV-226 and other lanes' backlog cells; both conflicts resolved by keeping master's lines, renumbering this lane's invariants to INV-227 to INV-232 and re-applying the 57 cells).
- Coordinator delivery: the brief asked for the PR URL and the 10-line report to be sent to the session "Continue previous session [d70cf3]" by SendMessage. `ListAgents` in this cloud container returned "No reachable agents", and `SendMessage` returned the exact error `No agent named 'Continue previous session [d70cf3]' is reachable.` The PR body carries the same 10-line report; the relaying session (lane P1-02) or the coordinator reads it there.
