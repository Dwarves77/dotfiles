# 2026-10-12, lane P1-19 (part1-regulations): the regulations Keep/Refactor/Trash register

Branch coord/part1-regulations from origin/master c831e82b5 (the lane brief as a file). Cloud session (no database, no operator machine, no sub-agents). Brief: docs/plans/rebuild/part1/BRIEF.md plus the P1-19 SCOPE block from the coordinator session, relayed by the P1-04 lane session. Clock from `date -u` at this write: 2026-10-12 04:28 UTC.

## Accomplished

- `docs/plans/rebuild/part1/regulations.md`: module verdict REFACTOR AND PORT; 8,879 code lines today (8,196 in the 70 scope files plus 683 in the supabase-server.ts and data.ts read-layer slices the ruling assigns here), about 5,430 estimated for P1-19 plus about 780 that moves to P1-17, P1-02, P1-03, the Market and the Research surfaces. TRASH as code: AffectedLanesCard (ADR-042), regulation-item-types.ts (third classification copy), the five gallery fixtures under lib/detail, the dead parser half of extract-regulation-sections.ts, the dead detail variant of the upcoming strip, the dead viewer branch of the detail loader. Sections 1 to 8 match the P1-01 exemplar's shape, plus a section 9 for the backlog cells.
- `docs/plans/rebuild/data-invariants.md`: INV-227 (one canonical detail surface; uuid URLs redirect only to a URL that renders), INV-228 (suppressed claims absent from every customer render, per request), INV-229 (the drawn rating is the registry rating; no ambiguous or GAP rating), INV-230 (customer inference admission rules). Count line updated to 230 (renumbered after master's INV-226 at the second merge).
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: STATUS cells for the 44 in-scope ids that had none (46 row occurrences; B-0047 and B-0055 appear twice): 29 CONFIRMED-P1, 10 REFUTED, 5 TRASH (the register's section 9 lists the refuted ones). B-1001 and B-1531 already carried P1-03 cells and were left alone.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract). No code changed. No live database read.

## Coverage (every file read whole with the Read tool)

70 files, 11,894 raw lines, 8,196 code lines (awk: blank, `//`, `/* */`, `{/* */}` and leading-`*` lines stripped), 70 Read calls, one per file. Plus supabase-server.ts 3140-3274 and 3776-4445 (3 Read calls) and data.ts 440-640, 860-929, 1050-1148 (3 Read calls). The scope list was expanded with `find` over the directories the SCOPE block names, plus the five lib/agent parsers (intake-a.md section 8 and the coordinator's ruling) and the regulations and detail readers in supabase-server.ts (auth-db.md sections 7 and 8). Test files beside the scope: 0 on this tree (CLEAN-3 f906b2102).

## Method and evidence

- Consumer evidence: an import-line scan per scope module (by `@/` alias or a relative path ending in the basename) across fsi-app/src, scripts, supabase and .github/workflows, then per exported symbol the importers that name it and a `grep -rlw` upper bound; every dead-code row re-checked by hand. Client routes by their `/api/...` literals.
- Tables: `.from("` and `.rpc("` scans over the scope files and the slices. Env: `process.env` scan (0 in scope). Metered calls: a case-insensitive scan for anthropic, browserless, messages.create, spend-client, haiku, sonnet (0 in scope).
- Prior work: A2-part4 read whole (149 lines); A2-part5's summary and its 15 detail and map rows read whole; A3, A4, A4a, A4d, A1-part1 and A1-part2 by their 140 lines naming an in-scope path. Backlog rows by `grep -E "\| fsi-app/src/(<scope paths>)"` (48 lines).
- The four findings that change the port most, each read rather than inferred: (1) the detail item read maps no `recommended_actions`, legal instrument or last-verified date (supabase-server.ts:3996-4083), so the band action strip, the "Instrument" and "Reviewed" fields and the owner card's "Last update" never show real data, and migration 334's writer shape `{action_text, ...}` is not the reader's `{action, priority}`; (2) at Full-brief depth the whole full_brief renders through GfmSection, which strips only the claim-ledger block, so the raw Sources markdown and five structured sections render twice, against RegulationDetailSurface's own header rule; (3) eight of the fifteen stored fact-document sections have no structured render; (4) one item id is resolved up to six times per detail render, two of them on every request.
- The map is keyed to the legacy jurisdiction slug and a title regex while its filter and links speak ISO; its Coverage-gap links write `?region-filter=` which nothing reads; its tile attribution is switched off.

## Decisions

- The detail architecture (components/detail, lib/detail, the loader and the item read) is ported under P1-19 because the SCOPE block assigns it here; the Market, Research and Operations lanes consume it.
- The reader half of the lib/agent parsers (sources table, record sections) goes to core/detail; the writer half (section 14 timeline, recommended actions) stays with P1-03, which conflicts with intake-a.md section 8's single core/brief/regulation-sections row; named as gap 1 for the coordinator.
- Components in the regulations folder whose only consumers are other surfaces (PriorityDropdown, the upcoming strip, format-fixed-date, ThemeBriefCard in detail) are dispositioned here with their receiving owner named.

## UX compliance (observations for the port; no .tsx changed in this lane)

- /regulations: goal "see what binds me, soonest first"; path list then row; one primary action per row (open); feedback: the remainder fetch has a loading note but no error state (B-0180).
- /regulations/[slug]: goal "what must I do, by when, and does it reach me"; path masthead, binding banner, Summary; primary action Export brief; feedback: obligation events, relevance and notes have loading states, the obligation-event fetch has no error state (B-0047); targets under the floor: 36 px row-menu items, 33 px owner select.
- /regulations/register: goal "every dated obligation, next due first"; facets in the rail; Load more is the one primary action; feedback complete (CoverageState for not-filtered-in, no data, error), except a failed server seed reads as "no obligations".
- /map: goal "where do my immediate items bind"; filters then register; feedback: the coverage card shows an error for an empty list.

## Blockers

None. Push and PR follow this entry; if either fails, the exact error is appended here.

## Next steps (for the coordinator)

- INDEX line for `docs/plans/rebuild/part1/regulations.md`.
- Rulings owed: strike one of the two parser rows (this register's core/detail rows or intake-a.md's core/brief/regulation-sections row); whether /api/detail/relevance stays public for anonymous detail readers; the ids of the Market and Research surface lanes; a design change for the five unrendered fact-document sections (rule 20).

## Addendum, 2026-10-12: second merge and the report

Master gained P1-22 (INV-223 to INV-226) between the first merge and the PR, so the PR conflicted and CI did not start; merged again (fb5965a0b) and renumbered this lane to INV-227 to INV-230. SendMessage to the coordinator failed ("No agent named 'Continue previous session [d70cf3]' is reachable"; ListAgents lists no peers), so the 10-line report is the PR body of #1155.
