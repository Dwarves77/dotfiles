# 2026-10-12, lane P1-24 (part1-dash-search): the dash-search Keep/Refactor/Trash register

Branch coord/part1-dash-search from origin/master 0ad87a940. Cloud session (no database, no operator machine, no sub-agents). Brief from the coordinator session, relayed through session_017roa4G2MvGYnw8ejDsgHpu (lane P1-02): read the dashboard, watchlist, portfolio, search and Assistant code whole, write one register with its build-plan section, change no code. Clock from `date -u`: register written about 04:25 UTC on 2026-10-12.

## Accomplished

- `docs/plans/rebuild/part1/dash-search.md`: module verdict REFACTOR AND PORT; 6,219 code lines today (9,296 raw) across 41 files and five reader ranges of `src/lib/supabase-server.ts`, about 3,850 estimated for the module (62 percent) with about 450 moving to the list, map, settings and obligations lanes; bloat ranked (ten rows, led by the metered Assistant route and `data.ts`); dead code (24 rows, `urgencyScore` and `fetchCoverageGaps` among them); duplicates (16 rows); file register (46 rows: 20 KEEP AS-IS, 25 REFACTOR AND PORT, 1 TRASH); build plan (31 planned files with source line ranges, the data model with the unused columns and the seven unread payload fields, the interface by lane id with five gaps for the coordinator, eight invariants, rulings cited, the proof, the port order, 49 features each with a new home, two of them deliberately not ported as code).
- `docs/plans/rebuild/data-invariants.md`: INV-273 to INV-280 appended after master's INV-226 (numbered INV-201 to INV-208 before the merge; master had moved); the Count line updated to 234.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 38 in-scope row lines written (36 distinct rows; B-0005 and B-0006 appear twice each): 28 CONFIRMED-P1, 3 REFUTED (B-1915, B-1916, B-1920), 5 CLOSED (B-0005, B-0006, B-0099 by PR 1122; B-0080 and B-0083 by PR 1131, which deleted their test files), 0 TRASH.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract); no code.

## Coverage (every file read whole with the Read tool)

41 files, 7,234 raw lines, 42 Read calls (data.ts in two runs), plus five ranges of supabase-server.ts (877-1382, 1383-1543, 2380-3124 in two runs, 4399-4995, 4996-5048: 2,062 raw lines, 6 Read calls). No file in SCOPE was left unread.

Prior registers: A2-part5, A2-part6 and A2-part7 read whole. A1-part1, A1-part2, A2-part3, A3, A4, A4c and A4d read as scope-filtered extractions by basename (`grep -nE` with the 31 in-scope basenames): 31, 18, 26, 2, 50, 9 and 43 lines (the path-prefixed grep the exemplar used matched 1, 3, 0, 2, 10, 0 and 16 lines because those registers cite files without the `src/` prefix). A1-part1 was not read whole (494 lines, 172 KB, above the Read cap); this is the gap the brief asked to be named.

Backlog: 38 row lines matched the 36 in-scope ids (B-0005 and B-0006 are duplicated in the file and received the same cell each time).

## Findings for the coordinator

1. [CONFIRMED] `/api/ask` makes one metered call today (`spendStreamRaw` with `SONNET_MODEL`, api/ask/route.ts:508-519), behind an exact-string `ASSISTANT_ENABLED === "true"` gate. Per the ruling (free retrieval, no model) the port keeps the retrieval, the suppressed-claim redaction, the Operations facts and the citation stats, and drops the prompts, the call, the prose validation and the gate. The register names the call site and its replacement.
2. [CONFIRMED] The dashboard read issues eleven reads for a page that renders eleven rows and four counts; seven payload fields are never read by the sole consumer (`grep -oE 'data\.[a-zA-Z_]+' src/app/page.tsx`), and the store setters that would take them have no caller. The LIMIT-50 priority slice is used only as a corpus pool and a count fallback.
3. [CONFIRMED] `urgencyScore` (the sector-multiplier composite the brief names) has no caller: `grep -rn 'urgencyScore('` outside scoring.ts returns nothing; the word hits are a field of the shelved synopsis shape. Bands come from the stored priority. Whether the rebuild ports the composite is a product ruling (register gap 4).
4. [CONFIRMED] `getCoverageGaps` in data.ts, `fetchCoverageGaps` and the `coverage_gaps` table have no live reader (the map imports the other `getCoverageGaps` from lib/coverage-gaps.ts). Closes B-0249 and B-0251 by deletion.
5. [CONFIRMED] Three refuted hypotheses: the dashboard watchlist promise cannot reject because `getWatchlist` catches everything (B-1915, B-1920); the "Detection pass" date is the rows' own newest change date over the rule-16 window, so an old date is the true value (B-1916).
6. Gaps owed ids: `row-fields.ts` (one owner with `list-row-fields.ts`), the coverage lib behind the coverage routes, `fetchThemeChips` and `theme-brief.mjs`, and the sectioned form of the skill core the free Assistant shows as passages.
7. [HYPOTHESIS] The 375 px findings on the three masthead wrappers (B-1935, B-1951) and the Assistant panel width (B-1903) are confirmed by reading and arithmetic, not rendered; the rendering guard measures them in the new tree.

## Decisions

- `data.ts` is split by owner: this module keeps `getAppData`, the watchlist, aggregate and surface-count getters (about 150 lines) and one `cachedRead` helper; the public list, slug, map, settings, research-coverage and obligation-register getters leave with their lanes.
- `mapWorkspaceItemRows` and `fetchPublicWorkspaceResources` (read in range 877-1382) are the lists' shared mapper and are not ported by this module.
- `fetchCoverageGaps` is the one TRASH row; the Coverage surface replaced the widget.
- The surface-coverage corpus-scan fallback is not ported; the rpc is applied and the port fails honestly.

## Verification

- `wc -l` and an awk code-line count over the 41 files and the five ranges (`codelines.awk`: `//` lines, `/* */` blocks and leading-`*` lines stripped).
- An export scan (`exports.sh`: every `export` symbol per file, `git grep -l -w` over src, scripts, supabase and .github/workflows excluding the defining file and .md/.json), then a by-hand grep for every symbol claimed dead and for the real importers of the reader-range exports.
- A `.from("` and `.rpc("` scan over the scope files and the ranges; a grep for `anthropic|spendStream|messages.create|browserless|SONNET_MODEL|HAIKU|claude-` (one hit family, api/ask); a `process.env.` scan (four variables).
- `git log -S` on the `auth.userClient` line of search/route.ts (3216b0db3, SEC-10, PR 1122 per its session log) and `git log --diff-filter=D` on the three deleted test files (f906b2102, CLEAN-3, PR 1131).
- Migration headers read for 159 (SECURITY INVOKER, LIMIT clamp 1..30), 315 (SECURITY DEFINER, limit clamp), 148 and 361 (count rpcs), 232 and 319 (feed), 233, 236, 270 (watch CHECKs), 370 (`user_can_write_in_org`), 362 (portfolio caps, `name_key`), 061, 068, 088.
- The register's text checked for em or en dash glyphs, the section-sign glyph and user-home paths: none.

## Landing

- PR 1158, https://github.com/Dwarves77/dotfiles/pull/1158, branch coord/part1-dash-search, head 9193ef97f (the register commit 10268223d plus the merge of origin/master cad0a5dc2). CI run 38204326877 in progress at the time of writing; watched by this session.
- Delivery to the coordinator session: `ListAgents` from this cloud container lists no reachable session ("No reachable agents - no other Claude session is running on this machine right now"); `SendMessage` to "Continue previous session [d70cf3]" returned `No agent named 'Continue previous session [d70cf3]' is reachable.` The coordinator runs on the operator's machine, which this container cannot address. The PR body carries the 10-line report; this file carries the same report; the relaying session (session_017roa4G2MvGYnw8ejDsgHpu, lane P1-02) was not messaged either, for the same reason.
