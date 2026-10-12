# 2026-10-11, lane P1-04 (part1-intake-b): the intake-b Keep/Refactor/Trash register

Branch coord/part1-intake-b from origin/master 904680db0. Cloud session (no database, no operator machine). Brief from the coordinator session on the operator's machine: read the intake, contracts, classification and re-ground module whole, write one register with its build-plan section, change no code. Clock from `date -u`: started 2026-10-12 01:10 UTC (the file name keeps the brief's 2026-10-11 date).

## Accomplished

- `docs/plans/rebuild/part1/intake-b.md`: module verdict REFACTOR AND PORT; 5,295 code lines today, about 3,340 clean (features/intake 1,855, core/contracts 1,075, source axes 410); bloat ranked (ten rows); dead code (whole files intake-url-corpus.mjs and source-link-invariant.mjs, the routing and anomaly pair, 14 vocabulary exports, the factor-tier resolver family, the four SQL generators with no executing guard, test-only export surfaces), each with the grep that proved it; duplicates (fifteen rows); file register (36 rows); build plan (23 planned files with source line ranges, data model with the columns used and the five payload fields with no column, the interface by module id, four LLM call sites and their FREE replacements, invariants, rulings embodied, five rulings to settle, proof, port order, 66 features each with a new home).
- `docs/plans/rebuild/data-invariants.md`: INV-156 (mint chokepoint fail-closed, full dedup corpus), INV-157 (staged new_item entity gate, input strip, checked stamps), INV-158 (one claim per slot, verbatim FACT spans, stub brief from claim text), INV-159 (substantive-update participation), INV-160 (number envelope zero-fill and propagation), INV-161 (emission-factor selection and the fail-closed licence gate); count line updated to 161.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 51 in-scope rows written (55 row occurrences; the four data-integrity rows appear twice): 45 CONFIRMED-P1, 5 TRASH, 1 REFUTED (B-1031: the 200 ceiling is enforced at run-ledger-consume.mjs:130-132), 0 CLOSED (no in-scope fix landed between the audit tree 0d0766347 and this base; CLEAN-3 and ANON-1 touched these files in comments and one string only).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract; the new register needs its INDEX line from the coordinator), PROGRAM-BOARD.

## Coverage (every file read whole with the Read tool)

36 files, 8,216 raw lines, 37 Read calls: `record-facts.mjs` in two calls (offsets 1 and 826, the first stopped at the 25,000-token cap), every other file in one call. Table in section 1 of the register. No file in SCOPE was left unread.

Prior registers: B2-part4 (162 lines, three Read calls) and B1b (215 lines, one call) read whole as the brief requires. A4a read as its evidence block (lines 60-75) and its disagreement and unverified lists (98-122). The other registers read as `grep -nE` extractions of lines naming an in-scope path; A4 (453 KB) was not opened, its in-scope findings reached this lane through the backlog rows that cite it.

## Decisions

- `src/lib/classification` classifies SOURCES (Axes 3/4/5), not item_type, format_type and surface as the brief describes; `src/lib/contracts` holds data contracts (envelope, vocabularies, factor tiers, licences, verbatim), not the four per-surface analysis contracts. Both recorded in the register (section 8, Gaps for the coordinator). The source-axis code is assigned to P1-05's home; the four-surface assessment today exists only inside the metered classifier's prompt (first-fetch-classify.ts:39), so ruling 4 asks where it lives once that call is not ported.
- LLM call sites: portal-harvest.ts firstFetchClassify (replaced by the session verdict source that already feeds classifyGate), run-intake-cycle.ts generateBriefWorkflow (record-only by default, brief grade through the injected-ledger seam), tombstone-delete.mjs corpus_census.haiku_verdict (replaced by the deterministic content gate already in the file). executor-ground.mjs is the FREE seam: `injected ?? callSonnet(...)` in groundBriefImpl, read this session.
- The classification scripts and the quarantine tools have no invoker on this tree (CLEAN-3 deleted maintenance.yml and the wrappers); recorded as operator-dispatched CLIs, consistent with build mode (rule 16).
- Commit trailer: the brief names a Co-Authored-By line for a different model; this commit carries the line for the model that ran the lane (the session's attribution instruction), so the record stays accurate.

## Verification

- `wc -l` and the awk code-line count over the 36 files (register section 1).
- Import resolution over all 36 files: every relative and `@/` specifier resolves (0 missing).
- `grep -rlw` per exported symbol (237) over fsi-app/src, scripts, supabase; by hand for every symbol called dead (register section 4).
- `git show f906b210` and `2c710d14` over the scope: non-test source files changed in comment lines and one string only.
- Executed with node (pure functions, no database): `buildResearchRecordPayload` returns two claims each for evidence_agreement_signal and source_authority_signal; the licence register has 28 entries (17, 2, 9); `normaliseMode("inland-waterway")` returns `inland_waterway`; `buildRecordPayload` sets `item.due_date` to the matched phrase.
- Migration grep: `binding_position`, `due_date`, `date_precision` exist on `obligations` (290), not on `intelligence_items`; `apply-mint-batch.mjs` `buildIntelligenceItemRow` (204-222) does not carry them.
- `supabase/config.toml:29` max_rows = 1000 (local); production value not read (no database in this lane).
