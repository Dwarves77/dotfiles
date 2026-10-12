# 2026-10-12, lane P1-20 (part1-market): the market Keep/Refactor/Trash register

Branch coord/part1-market from origin/master c831e82b5, fast-forwarded to cc4088c27 before committing (four register commits in between, docs only, no in-scope file changed; the invariant lines were renumbered after master's INV-216 in the merge with d4d89d5a7). Cloud session (no database, no operator machine, no sub-agents). Brief: docs/plans/rebuild/part1/BRIEF.md plus the coordinator's SCOPE block for P1-20, relayed through the P1-04 lane session. Worked in the git worktree .claude/worktrees/part1-market.

## Accomplished

- `docs/plans/rebuild/part1/market.md`: module verdict REFACTOR AND PORT; 4,617 code lines today (6,916 raw read for scope) to an estimated 3,310 (about 2,560 in features/market, 415 moved to P1-15 producers, 245 to the shared figures model, 90 to core/vocabulary for P1-09).
- `docs/plans/rebuild/data-invariants.md`: INV-252 to INV-262 appended after master's INV-216; the Count line updated to 227.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 39 in-scope lines (38 unique row ids; B-0046 appears in two sections) written: 34 CONFIRMED-P1, 3 REFUTED (B-0152, B-0157, B-0161: positive UX notes, not defects), 1 TRASH (B-0659 StatutoryFigure); B-0046 counted once.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract); no code.

## Coverage (every file read whole with the Read tool)

49 files under lib/market, components/market, app/market, lib/figures, components/figures and lib/vocabulary (6,645 raw lines, one Read call each), plus the market readers of lib/supabase-server.ts (2186-2394 and 3594-3777, three Read calls; the market ranges are 271 raw lines) and the market wrapper of lib/data.ts (955-1040, one Read call). 54 Read calls in all. No file in SCOPE was left unread.

Scope arithmetic: the brief said about 8,100 lines; the stated directories hold 6,645 raw lines and the readers add 305. The nearest market file outside the stated scope, `src/components/pages/MarketSignalDetailSurface.tsx` (873 lines, the market detail body), was NOT read whole; it needs an owner.

Prior registers: A2-part5 read whole (167 lines, two Read runs); A2-part6 read by its figures rows (lines 34, 48, 65-68, 102-105); A4b's lib/market rows (lines 9-40 and 112-131); A4d's figures, vocabulary and spec09 rows; A3, A1, A2-part3/4/7, B1/B1b/B2-part4, C2/C3/C3a/C3b/C3c/C4, D2 and F1 by `grep -nE` of the scope paths (each hit read, cut at 500-1,300 characters). A4 (453 KB) was not opened whole: its lib/market rows are digests that A4b's whole reads supersede (A4b:L7), and their line numbers were taken by grep.

## Findings for the coordinator

1. [CONFIRMED] Rule 18 gap: no market_series figure on any market surface shows its source's rating (SeriesProvenance.tsx:31-46 never sets sourceTier), and the published-price refresher writes source_tier null on every row (refresh-published-price-statistics.mjs:112). Recorded as INV-262, the defect not to repeat.
2. [CONFIRMED] The detail page's convergence read drops its error (app/market/[slug]/page.tsx:139, `.then(({ data: srcRow })`), the agent/run post-mortem shape.
3. [CONFIRMED] write-market-series.mjs:62 back-fills entity_id on update only if the caller selected entity_id; the four producers that pass existing rows select `id, series_key, reference_period`, so the branch never fires; backfill-market-series-entity.mjs (INV-113) is the path that does the work.
4. [CONFIRMED] series-freshness.mjs:23 falls back to the shortest named period not shorter than an off-grid cadence, which reads fresher than the source, the opposite of its own comment; no live producer reaches it today. Written into INV-258 as the corrected rule.
5. [CONFIRMED] The index page computes carbon cost per FEU from a committed DESNZ fixture (page.tsx:37, INV-183) while the detail page reads emission_factors; four factor selectors exist.
6. [HYPOTHESIS] fetchMarketSeriesBoard caps the whole table at 1,000 rows by period, not per series; with four daily ECB series the YoY window and one-year sparkline will fall out of the read as history grows.
7. [HYPOTHESIS] IndexationPanel's resolveOrgIdFromCookies makes /market a per-viewer render, against the page's PERF-10 comments; not built here.
8. Copy on customer surfaces that names lanes, ADRs, repo paths, codes and table names (section 6 of the register).
9. Gap: MarketSignalDetailSurface.tsx (873 lines) and lib/spec09/{oem-payload,reroute}.mjs have no Part 1 scope.
10. Rulings owed: the headline row's horizontal scroller against the no-horizontal-reach rule (B-1927); the series-item table shape (ADR); the sparkline and 1m / YoY cells are a DESIGN CHANGE OWED for artboard 04 (rule 20).

No metered model call, Browserless or third-party fetch exists in scope [CONFIRMED grep]; no FREE replacement is owed.

## Decisions

- StatutoryFigure.tsx is TRASH as a file (0 importers); the statutory / estimated / derived isolation is kept as three exports of one figures module.
- The producer-side files under src/lib/market (OOXML reader, CSV parser, carrier ETS envelope, upsert planner, display-row derivation) move to P1-15; series-item-map.mjs becomes a table (proposal; ADR owed).
- lib/vocabulary moves to core/vocabulary with P1-09 as owner.

## Verification

- `wc -l` and an awk code-line count (`//`, `/* */`, `{/* */}` and leading-`*` lines stripped) over the 49 files and the reader ranges.
- An export scan (142 exported symbols, `grep -rlw` over src, scripts, supabase and .github/workflows), an import-statement grep for colliding names (GAP, STATES, formatNumber, rowKey, parseCorridorCanonicalName), a per-file count for every zero-importer symbol, and `grep -rn "<Component"` mount greps for the figure components.
- `git show --stat f906b2102` for the CLEAN-3 header strip and the 12 deleted test files (1,671 lines).
- Read of migrations 268, 373, 151, 306 and 310 for the columns and the verified gate; read of envelope.mjs:195-205 for REFRESH_PERIOD_DAYS.
- A grep of the six directories for anthropic, browserless and fetch(.
- The register, invariant lines and backlog cells checked for em or en dash glyphs, the section-sign glyph and user-home paths: none in the lines this lane wrote.

## Next steps

- Coordinator: assign MarketSignalDetailSurface.tsx and lib/spec09 an owner; merge this PR.
- Port lane: section 8 port order; the source-rating read from P1-05 comes before features/market/read.ts.
