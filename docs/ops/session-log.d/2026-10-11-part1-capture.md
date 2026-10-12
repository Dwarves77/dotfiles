# 2026-10-12, lane P1-07 (part1-capture): the capture Keep/Refactor/Trash register

Branch coord/part1-capture from origin/master 904680db. Cloud session (no database, no live site, no operator machine). Brief from the coordinator session, relayed by cloud session dotfiles-bd: read the capture worker, worker routes, telemetry and messaging module whole, write one register with its build-plan section, change no code. Clock from `date -u`: count step 01:20 UTC, register written about 02:00 UTC (the brief's date slug is 2026-10-11, the dispatch day; this file keeps that slug).

## Accomplished

- `docs/plans/rebuild/part1/capture.md`: module verdict REFACTOR AND PORT; 1,451 code lines today, about 1,000 estimated clean (69 percent); bloat ranked (ten rows, the worker's header essay and its duplicated size guard first, Browserless in the change-detection pass third); dead code (the reconcile route with zero callers, the D3 hooks whose heartbeat table never existed and whose bias branch no caller can reach, 34 exports whose only importers were tests the CLEAN-3 cut removed), each with the grep that proved it; duplicates (eleven rows); file register (21 rows); build plan (17 planned files with source line ranges, the data model with used and unused columns, the interface by lane id, invariants, 16 rulings cited, a six-step proof, the port order, 43 features each with a new home).
- `docs/plans/rebuild/data-invariants.md`: INV-184 (a capture is the full body with every transform declared; refusals are recorded failures), INV-185 (one open fetch-queue row per source, atomic claim, bounded transient requeue), INV-186 (error_events grouping, server-side hash, service-role writes, no PII, bounded authenticated ingest); count line updated to 186 (renumbered three times as lanes landed under the open PR: from 156 to 158 at a2f9f3f1, where P1-03 had taken 156 to 161; from 162 to 164 at 04fbbac7, where P1-06 had taken 162 to 164; and from 165 to 167 to 184 to 186 by the coordinator's merge push fb3fcb33 of 03:58 UTC, which brought in P1-02, P1-04, P1-05 and P1-08). That push left this register and this log citing 165 to 167 and left the count line attributing four ranges to "lane Merge" against auth-db.md; this lane repointed its own citations and corrected all four attribution clauses from each line's last column (P1-04 169 to 174, P1-05 175 to 179, P1-08 180 to 183, P1-07 184 to 186), the three foreign ones because they were already wrong on master and sat in the line this lane had to edit.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 13 in-scope rows written: 6 TRASH (hooks.mjs rows B-0248, B-0558, B-1554, B-1555; reconcile route B-0651), 7 CONFIRMED-P1 (B-0202, B-0253, B-0277, B-0559, B-0861, B-0878, B-0886, B-2050 kept as a labelled hypothesis). No row REFUTED, no row CLOSED.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract; the new register needs its INDEX line from the coordinator), code, migrations, the live database.

## Coverage (every file read whole with the Read tool)

21 files, 2,276 raw lines, 1,451 code lines, 21 Read calls, one per file (the largest file is 614 lines). The per-file table is section 1 of the register. No file in SCOPE was left unread. `supabase/functions` holds the one tracked file.

Prior registers: E1-site-live read whole (214 lines). A1-part1, A2-part7, A3, A4, A4d, B1a-part1, B2, B2-part4, C2, C3, C3b, C4 and F1 read as the extraction of every line naming an in-scope file (107 lines by `grep -rn -E` over the registers directory). The build plan (docs/plans/complete-build-plan-2026-10-11.md, 124 lines) and the P1-01 exemplar (368 lines) read whole.

## Findings the brief did not predict

- The brief calls the worker v1.3; the file is v1.6 (header lines 2-6). The register describes v1.6.
- The brief says the worker honours the scrape hold and the kill switch. The worker reads neither (whole read: six tables, no system_state, no fleet-budget-halt), and its drain script reads neither (grep 0). Only the check-sources route honours the OFF gate (route.ts:71) and the scrape-day window (:78). Nothing schedules any of them on this tree (ci.yml and live-smoke.yml are the only workflows; CLEAN-3 f906b210 deleted the rest), so rule 16 holds by absence of a scheduler. Marked [REFUTED] for the worker and [CONFIRMED] for the route; the new tree puts both reads in the P1-08 dispatcher.
- The values check-sources writes to `monitoring_queue.last_result` (`change_detected`, `inconclusive`, `dead`) are outside the CHECK migration 004 defines, which no later migration alters, and the insert drops its error (logic.ts:148-156). Whether the live constraint equals the migration record is [HYPOTHESIS] (C4 printed columns, not constraints; the catalog file is gone). If it does, every change-flagged row is refused silently and the reconcile pass can never see a change. Handed to P1-05 as a verify-first item and written into the port's proof step 3.
- Two dropped-error reads in the worker: the atomic claim (index.ts:291, fails closed by accident) and the idempotency read (:466, fails open).
- Both D3 guard callers pass `"browserless-render"`, which the guard treats as reliable, so the bias branch has no reachable caller; all four `d3AuditEvent` callers pass no checks. The file is TRASH with its three capabilities recorded.

## Decisions

- Browserless leaves the change-detection pass; the capture worker's fetch ladder becomes a shared `core/capture/fetch-policy.ts` that both the Deno worker and the Node pass import (web-standard APIs only; unpdf stays Deno-side). The worker stays an Edge Function by runtime necessity, the one file outside src in the new tree.
- The seed-fallback integrity flag folds into the one error sink (error_events), continuing the 2026-07-13 ruling that moved anonymous renders out of integrity_flags. The admin reads it in the Errors tab; a DESIGN CHANGES OWED line is recorded in the register. The coordinator ratifies or reverses.
- The two revalidate routes merge into one `{ tags }` route; generate-brief posts tags.
- `capture_worker_fetch` and its vault secret are recommended for removal once the harness is the one invoker; that is a migration and therefore a ruling, not this lane's call. Labelled [HYPOTHESIS] that no runbook still invokes it (grep over docs/runbooks: 0; the fleet-charters directory migration 363 cites does not exist on this tree).
- Dead-code claims are [CONFIRMED] only where the named grep ran this session with absolute paths over src, scripts, supabase and .github/workflows excluding the defining file.

## Verification

- `wc -l` and the awk code-line count over the 21 files (register section 1).
- `grep -rnw` per exported symbol (66 symbols) and `grep -rn -F` per route path (6 paths), absolute paths, after a first batch with a dropped `cd` returned zero for everything and was discarded.
- `git ls-files` for test files under fsi-app/src (0) and under supabase/functions (1); `git log --diff-filter=D --name-only -- .github/workflows` for the deleted workflows (f906b210).
- Migration greps: table definitions for pending_first_fetch (065), agent_runs (057), agent_run_searches (112, 264), error_events (195), monitoring_queue and source_trust_events (004), portal_link_candidates (162), integrity_flags (048, 050), notifications (032, 235, 359); `last_result` appears in 004 only; `d3_runs` appears in no migration; `capture_worker_fetch` in 254, 256, 363, 371.
- ADR greps: ADR-016 (ceiling lines 45-46), ADR-026, ADR-027 section 8, ADR-015, ADR-023, ADR-041 located by filename.
- Glyph scan of the four written files for em dash, en dash, section sign and user-home paths before commit (result recorded in the commit).

## Blockers

None. Push and PR follow this entry; if either fails the error is appended here verbatim.
