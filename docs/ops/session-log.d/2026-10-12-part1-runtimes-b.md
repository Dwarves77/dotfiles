# 2026-10-12, lane P1-13 (part1-runtimes-b): the runtimes-b Keep/Refactor/Trash register

Branch coord/part1-runtimes-b from origin/master a0749713, fast-forwarded to 5e29268fe before writing the invariants (no in-scope file changed in between). Cloud session (no database, no operator machine, no sub-agents). Brief from the coordinator session, relayed through a second session: read the second half of fsi-app/scripts/turns whole, write one register with its build-plan section, change no code. Clock from `date -u`: register written about 04:00 UTC on 2026-10-12.

## Accomplished

- `docs/plans/rebuild/part1/runtimes-b.md`: module verdict REFACTOR AND PORT into ONE turn runtime (`src/core/turn/run-turn.ts`, entered by `scripts/turn.mjs`, stages sweep, change, capture, intake, connect, propagate, briefs, each run through P1-08's `runFamily`); 5,341 code lines today (7,896 raw), about 3,010 estimated (56 percent) plus about 70 moved to P1-07 and 50 to the test tree; bloat ranked (ten rows, led by run-ledger-consume.mjs at 1,212 code lines); dead code (23 rows); duplicates (17 rows); file register (12 rows: 1 KEEP AS-IS, 9 REFACTOR AND PORT, 2 TRASH); build plan (the one runtime and what folds into it, every LLM and network call site with its free replacement, 12 planned files with source line ranges, the data model with unused columns, the interface by lane id, invariants, rulings cited and owed, proof, port order, 44 features each with a new home).
- `docs/plans/rebuild/data-invariants.md`: INV-187 to INV-192 appended after master's INV-186; the Count line updated to 192.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 11 in-scope rows written: 10 CONFIRMED-P1, 1 REFUTED (B-1619: fetch-drain.yml no longer exists).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract).

## Coverage (every file read whole with the Read tool)

12 files, 7,896 raw lines, 17 Read calls (run-ledger-consume.mjs and run-population-flywheel.mjs in three runs, run-source-sweep.mjs in two, because of the Read tool's token cap). No file in SCOPE was left unread.

Scope: the brief said files 22 to 41 of 41; the tree has 53. I took 22 to 53 and told the coordinator; the coordinator ruled that P1-12 has 1 to 41 and this lane 42 to 53 (research-sweep.mjs through theme-briefs/schema.mjs). Files 22 to 41 were not read by this lane.

Prior registers: B1a-part1 and B1a-part2 read whole. B1-scripts-runtimes (529 lines, about 121,000 tokens) read as its prose sections (lines 1-171) whole plus the 36 lines of its registers naming an in-scope path; the other 140 script rows were not opened (CLAUDE.md rule 11). The brief asked for it whole; this is the gap.

## Findings for the coordinator

1. [CONFIRMED] Every resume and gate mechanism in scope reads a local family directory that CLEAN-1 emptied and gitignored: the flywheel slice gate and backlog, the sitemap cursor, the ledger export cursor, the propagation replay. On any checkout the gate passes vacuously and the others restart or read nothing. Recorded as INV-188 (violated today).
2. [CONFIRMED] Six of the seven runtimes have no invoker since CLEAN-3; the seventh (run-ledger-consume) is reached only as the judgement drain's export. Rule 17's chain was the workflow graph.
3. [CONFIRMED] ledger-verdicts holds no batch file since CLEAN-1, so ledger-consume apply is always disarmed.
4. Metered paths not ported: `--allow-api` (Haiku), `--record-only false` (paid grounding, [HYPOTHESIS] on the branch inside runIntakeCycle), and change detection's HTTP call to check-sources (Browserless).
5. Reconciliation owed: P1-08 assigns these families to several owning modules; the register keeps them as families under `runFamily` and asks for one ruling on where the stage code lives. P1-12's register was not on origin when this was written, so the list of P1-12 files that fold into the turn runtime is this lane's view.

## Decisions

- theme-briefs/schema.mjs is the one KEEP AS-IS (moved to src/core; a src module already imports it from scripts).
- theme-briefs/README.md and artifact.mjs are TRASH; fixture-deps.mjs moves to the test tree.
- The legacy minted-id resolver is not ported (no artifact it served survives on disk); ruling owed if harness_runs still holds pre-item_id slices.

## Verification

- `wc -l` and an awk code-line count over the 12 files.
- An export scan (160 exported symbols, `git grep -l -w` over src, scripts, supabase, .github, .claude), then an import-statement grep for module importers and a basename grep for invokers.
- `git show --stat f906b2102` (CLEAN-3: header comments stripped, 8 test files and 11 workflows deleted); `git log --diff-filter=D` and `git check-ignore -v` for CLEAN-1's removal of run artifacts and verdict batches; `ls` of harness-runs/mint and ledger-verdicts.
- A grep of the flywheel's child scripts and in-process step modules, the propagation libraries, portal-harvest, first-fetch-classify, the check-sources route and capture-worker for anthropic, spendMessage, messages.create, browserless and Claude model ids.
- The register's text checked for em or en dash glyphs, the section-sign glyph and user-home paths: none.
