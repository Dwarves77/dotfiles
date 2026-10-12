# 2026-10-12, lane P1-15 (part1-producers): the producers Keep/Refactor/Trash register

Branch coord/part1-producers from origin/master 09093a20c (P1-04 intake-b merged), merged again with origin/master before the push. Cloud session (no database, no operator machine, no sub-agents), spawned by the cloud coordinator relay on behalf of the coordinator session on the operator's machine. Brief: docs/plans/rebuild/part1/BRIEF.md (read from coord/part1-brief ee6f3b91, PR 1142 still open at the time) plus the P1-15 scope block: scripts/producers, scripts/drain, src/lib/learning, scripts/research, scripts/spec09, src/lib/spec09.

## Accomplished

- `docs/plans/rebuild/part1/producers.md`: module verdict REFACTOR AND PORT; 7,845 code lines today (10,741 raw, 86 files), about 4,950 estimated clean (63 percent) with the arithmetic by planned file; TRASH: resolve-push-batch.mjs, emit-producers-artifact.mjs (folded), run-fixture-import.mjs, backfill-themes.mjs and its fixtures (the one LLM call site in scope), propose-series-items.mjs, build-oil-bulletin-rows.mjs, the three DRAFT rows-file examples, the two fixture CSVs, the two fixtures with invented figures on real organisations (rewritten); every feature has a row in the section 8 table with its new home or its free replacement.
- `docs/plans/rebuild/data-invariants.md`: INV-243 to INV-251 appended after INV-222 (written as INV-175 to INV-183 on the branch, renumbered at the two merges with origin/master, 944f4cef3 and 252db80a7, which carried INV-175 to INV-222 from sibling lanes) (series_key namespace ownership; regional_data_facts current-state; licence gate first and absolute; signpost firing and scoring order; one open question per item, surface and product question; drain leases, modes, stale selection and one batch per merge; assessment idempotence and supersede; spec09 labelling and refusals; source by registry identity and grounding before rating); Count line updated to 221.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 40 in-scope rows written: 35 CONFIRMED-P1, 4 TRASH (B-0323, B-0702, B-1118, B-1119), 1 CLOSED (B-1071 by CLEAN-3 f906b2102). No REFUTED. B-0326, B-0575 and B-2007 keep a labelled [HYPOTHESIS] half inside their cell.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract; the part1 line at INDEX.md:96 already points at the directory). No code changed. No live database read. No live site touched.

## Coverage (every file read whole)

86 files, 10,741 raw lines, 7,845 code lines (awk: blank, `//`, `/* */` and leading-`*` lines stripped), 90 read runs (one per file; two for the four files over 400 lines: sbti, ukpn, research-assessment, research-walker). Files were printed line-numbered from line one to the end with `cat -n`, which this cloud session's harness preferred over the Read tool; every run is recorded in the register's coverage table. Scope enumerated with `git ls-files` over the six directories; the counts (38, 5, 16, 6, 15, 6) exceed the brief's (30, 5, 4, 6, 9, 6) because JSON data files and fixtures sit beside the sources. No test files exist beside the scope (CLEAN-3 removed them).

## Method and evidence

- Consumer evidence: an import-path census (files importing an in-scope module by a quoted path ending in its basename) over fsi-app/src, scripts, supabase, .github/workflows, package.json and .claude, and an export census (343 exported symbols, word-matched outside the defining file; 159 with zero references, listed in section 4 by kind). A first basename-only census was discarded as over-counting short names (label, constants, indexation); the register uses the path census.
- Dispatch evidence: `git show --stat f906b2102 -- .github/workflows` lists every workflow CLEAN-3 deleted; only ci.yml and live-smoke.yml remain and neither names an in-scope path. Harness family directories hold one committed artifact each (producers, research-walker, judgement-drain, research-assessment, carrier-ets-proxy, state-cost, theme-backfill).
- Call sites: `grep -n` for `fetch(`, `fetchImpl(`, `fetchFn(` (18 sites), external URL literals, `HAIKU_MODEL`, `streamMessagesText`, `apiKey`, `browserless` (0) over the 56 in-scope .mjs files.
- Tables: `.from(` and `readAll(` scans of the scope and of src for the readers; column lists from the CREATE TABLE and ADD COLUMN lines of migrations 106, 151, 152, 267, 268, 296, 297, 311, 332, 344, 346, 353, 373, 374, 378, 379.
- Prior work: B1c and B1a-part2 read whole; B1 by its header and its 42 in-scope lines; B1b register C (lines 161-200) whole; A3, A4, A4a, A4c, A4d, F1 and B2-part4 by their lines naming an in-scope path (55 lines). docs/specs/09-domain-extensions.md read whole; specs 02, 03, 04 and 07 by their section headings and the lines naming producers, series or horizons; the analysis-construction-spec skill by its reference index.
- Closing commits: `git log -S` on the quoted header phrases (B-1071 closed by f906b2102; B-0323's phrase was never in the tracked history of its file, so the row is dispositioned by the file's own TRASH verdict).
- The biggest findings are mechanical: (1) every dispatcher of this module is gone, so 17 producers, the drain's apply side and the learning loop's two runtimes have no caller but the operator's drain command; (2) the six `applyWorkflow` targets in kinds.mjs name deleted files; (3) six of seventeen producers cannot reach their write path on this tree (two R14 holds, one licence block, one ruling hold, one empty rule set, one fixture-only script); (4) the six Weekly Oil Bulletin Market items were grounded on a hand-embedded WebFetch summary presented as captured text, a live data defect handed to P1-07 and P1-14; (5) `computePayloadPenalty` (spec 09 section 1.1) has no panel caller.

## Decisions

- Held producers (carrier ETS, state cost facts, NESO, EEA HDV, SBTi) are REFACTOR AND PORT with `enabled: false` or a licence block in their spec, never TRASH: each hold is a cited ruling and the apply branch is complete. The fixture-harness CLI shape (`runR14HeldFixtureCli`) is not ported; a held producer's fixture run is its test.
- backfill-themes is TRASH as code. Its feature (theme classification of null-theme research findings) is kept with a FREE replacement: a rule-based classifier in the shape of scripts/mint/screen-rules.mjs plus a seventh judgement-drain kind for the residue, the same ADR-044 decision 1 mechanism the other six kinds use.
- resolve-push-batch is TRASH; its one rule (one batch per merge for a kind that names its file) is INV-248 and a P1-08 dispatcher check.
- The B-1572 dedup collision is ported as today's behaviour (one open question per item, surface and product question) and recorded as a ruling owed, not silently changed.
- Fixtures with invented figures attributed to real companies are rewritten with synthetic names in the new tree (CLAUDE.md rule 2); recorded real responses (the OpenAlex work, the works envelope) stay.

## Gaps for the coordinator (register section 8, Interface)

Dispatch ownership (P1-08) for everything in scope; the drain exporters and apply scripts under scripts/turns and scripts/maintenance (P1-12/13) must port before the drain; the B-1572 ruling; the oil-bulletin capture defect (P1-07, P1-14); the payload-penalty panel wiring (P1-19/20); the SBTi licence permission (operator); the first real EEA run to fill the zero-emission rules.

## Not done

No PR merge (the coordinator merges). No INDEX line (coordinator-only). No live measurement of the ratified map, the harness ledger or any table count (no database in this session); every such number is cited to the register that measured it.
