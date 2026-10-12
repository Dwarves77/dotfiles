# 2026-10-12, lane P1-16 (part1-obligations): the obligations Keep/Refactor/Trash register

Branch coord/part1-obligations from origin/master 09093a20c. Cloud session (no database, no operator machine). Brief from the coordinator session: read the obligations and forward-events module whole, write one register with its build-plan section, change no code. Clock from `date -u`: started 03:53 UTC, register written 04:03 UTC.

## Accomplished

- `docs/plans/rebuild/part1/obligations.md`: module verdict REFACTOR AND PORT; 2,445 code lines today (plus 339 non-blank lines of the markdown report, TRASH), about 2,150 clean (extract 700, read-and-extract 120, derive 480, reads 405, api 125, jobs 290, kinds 15); bloat ranked (twelve rows); dead code (one dead function with comment-only callers, the register's client-side re-filter family, 60 export surfaces whose tests CLEAN-3 deleted, one unused constant, one no-op expression, one unread rule field, two silent drops), each with the grep that proved it; duplicates (seventeen rows); file register (15 rows); build plan (23 planned files with source line ranges, the twelve derivation rules the code embodies, the data model with the unused columns named, who reads the two tables by surface, what triggers extraction and derivation today, zero LLM call sites, the interface by module id with six gaps for the coordinator, six invariants, fifteen rulings cited, the proof, the port order, 32 features each with a new home).
- `docs/plans/rebuild/data-invariants.md`: INV-217 (verbatim span, section span also in a FACT claim, reference-date refusal), INV-218 (kind never guessed, confidence by source kind, every drop recorded), INV-219 (register row copies the event, precision pair, binding_position in the fixed order or NULL), INV-220 (compliance_deadline is the earliest future compliance_deadline event, never nulled), INV-221 (customer reads join verified live items, database count, next-due order, default kinds and scope), INV-222 (obligation object only from a candidate verbatim in its capture, versioned, not_assessed, idempotent); count line updated to 206.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 19 in-scope row occurrences written (15 distinct ids; B-0038, B-0039, B-0049 and B-0058 appear twice): 17 CONFIRMED-P1, 2 TRASH (B-1113 and B-2026, both the dry-run report), 0 REFUTED, 0 CLOSED (no in-scope fix landed between the audit tree 0d0766347 and this base; CLEAN-3 touched these files in comment lines only [CONFIRMED: `git show --stat f906b2102` and the pre-cut line counts in register section 1]).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract; the new register needs its INDEX line from the coordinator), PROGRAM-BOARD, any code.

## Coverage (every file read whole with the Read tool)

15 files, 4,725 raw lines, 16 Read calls: `extract-forward-events.mjs` in two calls (offsets 1 and 731), every other file in one call. Table in section 1 of the register. No file in SCOPE was left unread.

Prior registers: B2-part4 (162 lines) read whole in three Read calls. B1-scripts-runtimes read whole for lines 1 to 216 (the narrative, the executed evidence, the disagreements, the ten rows, the prior-findings tables and the 39-row harness-family table) in three Read calls; its 155-row scripts table and tests table (lines 217 to 528) read as a `grep -nE` extraction of every row naming an in-scope path (6 rows), disclosed in the register header, because that table re-bills roughly 60k tokens for six rows (CLAUDE.md rule 11; P1-01 and P1-04 made the same disclosure). The other registers (A2-part1, A3, A4, A4a, B1a-part3, B1b, B1c, B2-part1, C3, C3c, F1) read as `grep -rn` extractions of every line naming an in-scope path (50 lines), plus A4a lines 95 to 105 and 225 to 240 and B1c lines 7 to 38 and 76 to 77 whole.

## Decisions

- The module is REFACTOR AND PORT with a small code reduction (88 percent) because the extractor's grammar, rules and refusals are dense domain logic; the real cut is the comment history (602 lines in one file) and the report. Stated plainly in section 2 rather than inflating the estimate.
- `derive-obligation-objects.mjs` is kept (REFACTOR AND PORT) although it has no producer: spec 01 section 3.2 names the object grain the core build, the table and the DB guard exist, and the deterministic seeds for candidates exist FREE. The missing producer is the first gap for the coordinator, not a reason to trash the writer.
- `DRY-RUN-REPORT.md` is TRASH (CLAUDE.md rule 5: machine evidence under scripts/); its hand-check method is kept as the shape of the extractor's golden proof.
- The two public routes (no requireAuth) are recorded as a ruling to settle, not changed: upcoming/route.ts states the posture (RLS governs), the API security policy says every route authenticates, and no doctrine line records the exception.
- One `insertForwardEvents` writer is planned in this module for the three callers that insert today with three dedupe postures (flywheel-steps.mjs, mint-enrichment.ts, dispatch-extraction.mjs); counted here, assignable to P1-14 if the coordinator prefers.
- The Dashboard interface was traced to migration 315: `get_workspace_due_next` reads `intelligence_items.compliance_deadline` and `item_timelines`, not `item_forward_events`, so P1-24 depends on this module only through the compliance_deadline sync.
- Commit trailer: the session's attribution instruction names the model that ran the lane; the commit carries that line.

## Verification

- `wc -l` and the awk code-line count over the 15 files (register section 1); pre-CLEAN-3 line counts by `git show f906b2102^:<path> | wc -l` for every file, so the 2026-10-11 registers' line citations can be read against this tree.
- `grep -rnw <symbol>` per exported symbol (95) over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github/workflows, excluding the four scope directories; by hand for every symbol called dead (register section 4), distinguishing comment mentions from imports.
- `.from(`, `readAll(`, `readAllByIds(`, `guardedInsertMany(`, `guardedUpdate(` scan over the scope for the table list; `process.env` scan for env vars; `anthropic|claude|browserless|openai|fetch\(` scan for metered calls (0 code hits).
- `.github/workflows/` listed (ci.yml, live-smoke.yml only): the maintenance, downstream-chain, corpus-turn and date-chain workflows the prior registers cite are deleted, so the derive step and the backfill are operator CLIs on this tree.
- Byte check of the no-op `.replace('ç', 'ç')` (`sed -n 70p | od -c`: the same two bytes twice).
- `git show --stat f906b2102` over the scope: 11 test files and 4 fixtures deleted, 489 header lines cut from the extractor; the awk code-line count of every scope file is identical before and after the cut (for example extract-forward-events 854 to 854, derive-obligations 203 to 203) and the cut added no non-comment line, so the 2026-10-11 findings carry over unchanged.
- Glyph check (no em dash, en dash or section sign) and user-home path check over the register and the invariants file: clean.
- Not run: any test (none exist beside the scope), any database query (no credentials in this lane).

## Landing

- PR https://github.com/Dwarves77/dotfiles/pull/1149 opened 04:13 UTC against master; the one CI run (ci job 114660057080, run 38202927782) completed success at 04:15:49 UTC on head 3567fd6c8; recorded in the PR body line 7; not re-fired, not merged.
- Coordinator notification: `ListAgents` listed no reachable session on this machine, and `SendMessage` to "Continue previous session [d70cf3]" returned `No agent named 'Continue previous session [d70cf3]' is reachable.` The PR URL and the ten-line report are in the PR body and in this lane's final session message for the coordinator to read there.
