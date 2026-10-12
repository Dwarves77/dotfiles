# 2026-10-12, lane P1-21 (part1-research-ops): the research-ops Keep/Refactor/Trash register

Branch coord/part1-research-ops from origin/master 0ad87a940, fast-forwarded to 944f4cef3 (P1-10 and P1-12 merged) before writing the invariants; no in-scope file changed in between. Cloud session (no database, no browser render, no sub-agents). Brief from the coordinator session, relayed through a second session: read CLAUDE.md and docs/plans/rebuild/part1/BRIEF.md whole, follow the auth-db.md exemplar, scope Research and Operations (lib/research, components/research, app/research, lib/operations, components/operations, app/operations, lib/regional, operations-matrix and operations-ask-context, and the research and operations readers in supabase-server.ts and data.ts).

## Accomplished

- `docs/plans/rebuild/part1/research-ops.md`: module verdict REFACTOR AND PORT; 6,069 code lines today (9,033 raw) to about 4,300 clean (features/research 1,645, features/operations 2,455, core/themes 190). Sections 1 to 8 in the exemplar's shape; every feature has a row in section 8.
- `docs/plans/rebuild/data-invariants.md`: INV-213 to INV-219 appended after master's INV-212; the Count line updated to 219 and the lane named in it.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 31 in-scope rows written: 27 CONFIRMED-P1 (B-1932 among them, its ask half REFUTED: /api/ask does read the Operations tables), 1 REFUTED (B-0171: overflowWrap is the 375 px protection, not a defect), 3 CLOSED: PR 1131 (B-0282, B-1039, B-1040: deleted or stripped by CLEAN-3).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract), any code.

## Coverage (every file read whole with the Read tool)

47 files plus 6 line ranges, 9,033 raw lines, 52 Read calls; no file in SCOPE left unread. The named `src/lib/agent/operations-matrix*` is `src/lib/agent/formats/operations-matrix.ts` (read whole). The supabase-server.ts ranges 1535-1793, 2180-2279 and 3315-3599 and the data.ts range 890-1059 were read whole; the rest of those two files is other lanes' (auth-db.md sections 7-8).

Prior registers: A2-part4's research rows and A2-part5's operations rows read whole, with both registers' summary and prior-findings sections; every other register's rows for in-scope paths by grep (A1-part2, A2-part3, A2-part6, A2-part7, A3, A4, A4a, A4c, A4d, B1, B1c, B2-part4, C2, C3, C3a, C3c, C4, D2, F1). A4-src-lib-2 only by grep (its in-scope rows, cut to 260 characters, plus A4c's amended rows in full). Specs 03 and 04 read whole; ux-laws.md and design-principles.md read whole before writing about any .tsx.

## Findings for the coordinator

1. [CONFIRMED] `fetchResearchPipelineRows` (supabase-server.ts 1535-1747, 148 code lines) has no caller; TRASH.
2. [CONFIRMED] Four live logic defects carried from A4c and re-read on this tree: R1 anchors on any dated event (assess.mjs:165-166), the TRL 6-7 row is unreachable (:20-21), the last-mile "zero-emission" pattern is unreachable (taxonomy.mjs:65, :74), the labour chain can produce "USD/year per productive hour" (labour-chain.ts:93-96, :194-201). The port fixes each with a red-first test.
3. [CONFIRMED] Computed and never shown: per-fact freshness (supabase-server.ts:3488-3493), coverage notes, the matrix omit note (operations-matrix.ts:204-284), the stored credibility evidence score. Read and dropped: sources.fetch_status on every Operations profile render.
4. [CONFIRMED] No metered model call and no Browserless call in scope. Two controls hand off to the metered assistant (ResearchLedger.tsx:371-376 and the list mastheads' ask prompt); the register replaces the first with a link to the legend and leaves the assistant to its owner.
5. Gaps: the cross-page theme view (theme-brief.mjs, theme-brief-text.mjs) has no Part 1 id and is consumed by the shell, the dashboard and every detail page, ported to src/core/themes and held here; the assistant route still has no owner id; two src-imports-scripts edges (authority-score.mjs, theme-briefs/schema.mjs) need their owners (P1-15 [HYPOTHESIS], P1-09).
6. DESIGN CHANGES OWED (rule 20): the matrix's 40 px cells with zero spacing sit under ux-laws law 2's floor [HYPOTHESIS: from the styles, not rendered]; the 40 px row height is an operator spec, so the divergence goes to Claude Design rather than being changed silently.

## Decisions

- The regional parsers and envelope builders port into src/features/operations/ingest, owned here and imported by P1-15's producer runtimes, so the parsing cannot fall between lanes.
- The four credibility-chip files collapse into one component mounted per assessment with the stored scores; the no-data legend becomes a sentence.
- operations-ask-context is held in this module until the assistant route has an owner id.

## UX compliance (register only, no .tsx written)

No interface was built or changed by this lane. The register records the law-2 checks it could make from the styles (credibility chip 44 px met; theme pills 36 px with 8 px gap met; matrix panel links 28 px; RelatedRegionCard rows 24 px with 8 px gap met; matrix cells 40 px with no clearance not met; empty-state text buttons with no padding not met) and leaves rendering at 375, 768, 1024 and 1280 to the port's proof (section 8 item 2).

## Verification

- `wc -l` and an awk code-line count over the 53 read units (the awk strips `//`, `/* */` and leading-`*` lines, not JSX comment lines; stated in the register).
- An export scan (137 exported symbols, `grep -rlw` over src, scripts, supabase and .github/workflows), then an import-statement grep for every symbol claimed dead; `grep` for `.from(`/`.rpc(` over the scope; `grep` for anthropic, browserless, fetch( and process.env over the scope.
- `git ls-files` for test files (0), `git log --diff-filter=D` for the regional fixtures (f906b2102, CLEAN-3, PR 1131).
- The register's text checked for em or en dash glyphs, the section-sign glyph and user-home paths: none.

## Not done

- No live database query (state counts in comments, theme NULL rate and the 75-row facts count stay unverified).
- No browser render (the law-2 and 375 px items are styles-derived).
