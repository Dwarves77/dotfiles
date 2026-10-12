# 2026-10-12, lane P1-18 (part1-shell-list): the shell and list-surface Keep/Refactor/Trash register

Branch coord/part1-shell-list from origin/master c831e82b5 (the lane brief as a file). Cloud session (no database, no operator machine, no sub-agents), working in a git worktree under .claude/worktrees/. Dispatch from the coordinator session, relayed verbatim by the P1-04 lane session: read the app shell and the one list surface whole and write the register plus build-plan section as one PR. Clock from `date -u` before writing this entry: 2026-10-12 04:27 UTC.

## Accomplished

- `docs/plans/rebuild/part1/shell-list.md` (430 lines): module verdict REFACTOR AND PORT; 6,947 code lines today (10,284 raw, 53 files plus seven slices of supabase-server.ts), about 2,730 estimated for shell-list plus about 1,290 that moves to other modules (detail components, GfmSection and MoreBelowDisclosure to P1-17, the market detail body and two rail cards to the market surface, the obligations rail card to P1-19, SettingsPage to P1-02) and 1,108 code lines TRASH (the never-mounted SectorSynopsis, IntelligenceBrief, IntelligenceMetadataStrip and its metadata route; the legacy PageMasthead). Sections 1 to 8 match the P1-01 exemplar's shape; section 8 adds the list-variant collapse table the dispatch asked for.
- `docs/plans/rebuild/data-invariants.md`: INV-223 (a failed read is never an honest empty or a zero), INV-224 (one URL vocabulary for list state), INV-225 (detail href only from canonicalSurfaceForItem), INV-226 (lossless keyset pagination), INV-227 (live facet counts), INV-228 (one render instant). Count line updated to 228 after renumbering on the merge of origin/master (master had reached INV-222).
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of 43 in-scope rows written: 33 CONFIRMED-P1, 2 REFUTED (B-0190: the header it describes is gone on this tree; B-0194: APP_TAGLINE is plain copy), 8 TRASH (B-0184, B-0191, B-0662, B-0663, B-0664, B-1000, B-1949, B-1950). The 44th in-scope row, B-0861, already carried P1-07's CONFIRMED-P1 cell and was left as written.
- On the merge of origin/master (252db80a7): P1-17 ui-kit had landed with a Dialog primitive and hands the CommandBar to this module; the Sheet row now composes on that Dialog (55 to 30 lines, clean total 2,760 to 2,730), the CommandBar is listed as arriving from P1-17, and globals.css and theme.css are dropped from the gaps (P1-17 owns them). The six invariants were renumbered INV-195..INV-200 to INV-223..INV-228 after master's INV-222. Five BACKLOG conflict blocks (neighbouring rows written by P1-10 and P1-16) were resolved row by row, keeping each side's written cell; no row carried two different cells.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract); no code; no live database.

## Coverage (every file read whole with the Read tool)

53 files and seven supabase-server.ts slices, 10,284 raw lines, 6,947 code lines (awk: blank, `//`, `/* */`, `{/* */}` and leading-`*` lines stripped), 60 Read calls. The register's section 1 lists each. The list readers are the ranges P1-01 assigned to lists, widened to whole functions, plus fetchThemeChips. Test files beside the scope: 0 on this tree.

## Method and evidence

- Design: docs/design/ux-laws.md and docs/design/design-principles.md read whole before any `.tsx` row was written.
- Registers: A2-part3, A2-part5, A2-part7 and A1-part2 read whole (11 Read calls). The other 37 registers by scope filter: `grep -rn -E "<scope path pattern>"` over the register directory, 165 matching lines in 19 registers, read in full; A4-src-lib-2 (453 KB) only through that filter.
- Consumer census: an import-path script per file (`@/` path, relative basename, dynamic import) over fsi-app/src, scripts, supabase, .discipline and .github; a symbol census per exported symbol (`grep -rlw`, defining file excluded). Zero-hit symbols re-checked by hand for internal use; route callers by `grep -rn "<route path>"`.
- The mechanical findings worth the coordinator's attention: (1) the bootstrap bundle ships `adminAttention` and nothing reads it while Sidebar polls the same answer separately; (2) the list payload wrappers in supabase-server.ts ignore the `failed` flag the duenext lane added and report every empty result as `rpc_error`, and the public listing read has no failed flag at all; (3) the Settings page's Dashboard defaults keys have zero readers and its Freight sectors card writes an in-memory store only, which refutes P1-02's "second writer of sector_profile"; (4) nothing parses the map's ISO-list `?region=` link while the list reads `region` as a jurisdiction token; (5) MarketSignalDetailSurface's "Do now" list reads `recommendedActions`, which no mapper fills.
- No metered model call and no Browserless call site exists in scope (grep over every scope path).

## Decisions

- Files in scope by directory but owned elsewhere are dispositioned here with their new owner named (the P1-01 precedent): detail components to the P1-19..24 shared detail module, GfmSection and MoreBelowDisclosure to P1-17, MarketSignalDetailSurface to the market surface, SettingsPage to P1-02 (answering P1-02's gap 1), the surface-specific rail cards to their surfaces.
- The privacy page copy is legal text and is not proposed for edit; its processor list is recorded as a ruling owed.
- The lib/hooks ownership gap P1-02 raised is answered: the six hooks are shell data and port into ui/shell.

## Blockers

None so far. Push, PR and the one CI run follow; any failure is appended here with the exact error.

## Next steps (for the coordinator)

- INDEX line for `docs/plans/rebuild/part1/shell-list.md`.
- Section 8 gaps: the market and research surface ids; VirtualizedRowList (one importer, ListSurfaceShell) to this module; AskAssistant's owner; lib/data.ts; the per-route loading files, globals.css and theme.css; the privacy processor ruling.
