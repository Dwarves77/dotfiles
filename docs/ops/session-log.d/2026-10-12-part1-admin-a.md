# 2026-10-12, lane P1-25 (part1-admin-a): the admin-a Keep/Refactor/Trash register

Branch coord/part1-admin-a from origin/master 0ad87a94. Cloud session (no database, no operator machine, no sub-agents, no browser). Brief from the coordinator session, relayed through session_017roa4G2MvGYnw8ejDsgHpu (lane P1-02): read components/admin, components/ledger and components/account whole, write one register with its build-plan section, change no code. Clock from `date -u`: register written about 06:30 UTC on 2026-10-12.

## Accomplished

- `docs/plans/rebuild/part1/admin-a.md`: module verdict REFACTOR AND PORT; 9,454 code lines today (11,270 raw) to about 5,200 (55 percent) plus about 540 moved (VirtualizedRowList and the account form primitives to P1-17, the typed-confirm dialog to P1-17, the pending-invitations list to P1-02); bloat ranked (12 rows, led by the ten hand-written fetch loaders and the 1,023-line console); dead code (12 rows); duplicates (17 rows); non-essential artifacts (the four fixture galleries and the placeholder copy); file register (41 rows: 10 KEEP AS-IS, 23 REFACTOR AND PORT, 8 TRASH); build plan (every panel with what it shows and what it writes and its class under the no-human-gates rule; the five metered or Browserless call sites this scope reaches with their free replacements; 34 planned files with source line ranges; the data model with unused columns; the interface by lane id; six invariants; 16 rulings cited; the proof; the port order; 44 features each with a new home).
- `docs/plans/rebuild/data-invariants.md`: INV-281 to INV-286 appended after master's INV-226 (they were INV-201 to INV-206 before the merge; three lanes landed first); the Count line updated to 232.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 33 in-scope rows written: 25 CONFIRMED-P1, 4 REFUTED (B-0113, B-0114, B-0116: the A2 cells are compliance notes mechanically filed as defects; B-1889: the CSS read shows the cell wraps and ellipsises), 1 CLOSED (B-0115, the header CLEAN-3 stripped), 3 TRASH (B-1517 and B-1898 on the duplicate MembersPanel, B-1896 on a parts page).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract); no code.

## Coverage (every file read whole with the Read tool)

41 files, 11,270 raw lines, 41 Read calls, one per file (the largest, AdminDashboard.tsx at 1,023 lines, fit in one call). No file in SCOPE was left unread. Prior registers: A2-part1-admin read whole; the rows naming an in-scope path in nine other registers read by grep extraction (41 rows). The exemplar auth-db.md, sources-b.md's rulings, intake-b.md's cycle section, workspace.md's members-panel rulings and the lane brief were read before writing; ux-laws.md and design-principles.md read whole before writing about any .tsx.

## Findings for the coordinator

1. [CONFIRMED] No panel in scope approves intake. The staged list, the research pipeline and the issues rail observe; bulk import's auto-approve or queue decision is the route's rule; run-intake is a dispatch. Three strings still assert a human gate ("Results are staged for review", "Review them in Staged updates", "Publishing surfaces the item"); they are copy, not code, and go with their files' rewrite. INV-067's phrase scan was the soft enforcer and is TRASH in P1-08; PROP-076 and PROP-087 carry the property.
2. [CONFIRMED] Five call sites in scope reach a metered model or Browserless through their routes: the regulatory scan (Sonnet plus web_search), the brief-flag regenerate (Sonnet through /api/agent/run), the bulk-import verification toggle (Browserless plus Haiku), run-intake apply (Sonnet through generateBriefWorkflow, which P1-04 already ports as record-only), and the month-to-date spend line (agent_runs cost). The first three and the spend line are NOT PORTED; the register names each replacement.
3. [CONFIRMED] Two member panels exist for one route (admin/redesign/MembersPanel.tsx and profile/MembersPanel.tsx); P1-02 rules "one panel, two mounts". This register trashes the admin copy and moves its better typed-confirm dialog (Esc, initial focus, focus return) to P1-17's Dialog. InvitationsPanel duplicates the invite form too; only its pending list and revoke are unique and move to P1-02's panel.
4. [CONFIRMED] The five tests beside this scope (OrganizationsTable, AdminIssuesRail, corrections model and loaders, AccountPrimitives) were deleted by CLEAN-3 (f906b2102); the A2-part1 "PROVEN BY" cells describe the tree before the cut. The proof section rewrites them red-first.
5. [CONFIRMED] Thirteen size and overflow findings at 375 px remain CSS reads; the rendering guard's UX smoke on the ported console turns them into measurements. The targets that fail the law-2 floor by read: issues-rail rows (28 px), filter chips (about 26 px), Remove and Ban (about 19 px), the role chip (about 16 px), Revoke and Copy (about 24 px), Clear (about 21 px), sibling tokens (about 18 px), the segmented control (24 px minimum height), the toggle (32 by 18 px).
6. Rulings owed: (1) the thirteen `app/admin/parts/*` fixture pages and three fixture modules are in P1-26's and the surfaces' scopes; this register trashes the four galleries and asks for one ruling across all of them. (2) Three routes the plan needs and the tree lacks are owed to P1-26: an all-corrections list, a drafts read for the pipeline view, and `ingest_rejections_untriaged` on the attention RPC. (3) P1-26's register was not on origin when this was written; the ownership of `src/app/admin/**`, `src/app/api/admin/**`, `lib/hooks/useAdminAttention.ts` and `lib/admin/member-display-name.ts` assumed here is a hypothesis.

## Decisions

- The spend line is not shown on the admin masthead in the new tree (P1-03 left the choice to this lane): the masthead shows the harness run count and the open attention total; the agent_runs history stays in the database.
- TierOpinionDisagreementsView stays as the one operator tier path (tier_override with a reason, then dismissal); its Defer, which writes nothing, is TRASH. SourceTierAuditPanel's base_tier commit is TRASH per P1-06; the register records it as an interface fact, the file is P1-06's.
- The corrections screen ports nearly as it stands (10 files, 1,115 code lines to about 1,000); its all-corrections read moves behind a route instead of a browser Supabase client.
- VirtualizedRowList and AccountPrimitives are in this scope by directory only and are handed to P1-17 (KEEP AS-IS and REFACTOR AND PORT respectively).

## Verification

- `wc -l` and an awk code-line count over the 41 files (11,270 raw, 9,454 code).
- An import-path grep per file over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github/workflows, then by hand for the four colliding basenames (MembersPanel, types, PartsPageHeading, AdminTableView).
- `test -f` on the 23 route files behind every `/api/...` literal in scope (all present); a grep of each route's `.update(`, `.insert(`, `.rpc(` and `fetch(` statements for what each panel writes; a grep of those routes and their libraries for anthropic, spendSearch, HAIKU, generate-brief and browserless.
- `git log --diff-filter=D --name-only` over the three directories (the five deleted tests); `git log -S "load-item-targets.ts"` on types.ts (B-0115 closed by CLEAN-3).
- The register, the invariants file and this log checked for em or en dash glyphs, the section-sign glyph and user-home paths: none.

## UX compliance

No .tsx or .css was written or changed by this lane. ux-laws.md and design-principles.md were read whole before the register's UX claims; every target-size and overflow claim is labelled as a CSS read, not a measurement, and the register's proof section names the rendering guard's UX smoke as the measurement.

## Landing

- PR 1157 opened against master (https://github.com/Dwarves77/dotfiles/pull/1157), head cdf8b896a; the merge of origin/master (cad0a5dc2) conflicted in data-invariants.md and the backlog file; both resolved by taking master's file and re-applying this lane's lines (INV-201..206 renumbered to INV-281..232; the 33 cells re-applied with zero clashes).
- The brief asked for the PR URL and the 10-line summary to be sent to the coordinator session "Continue previous session [d70cf3]" by SendMessage. ListAgents listed no reachable agent, and SendMessage answered: `No agent named 'Continue previous session [d70cf3]' is reachable. Use ListAgents to see everyone you can message.` The bare name was tried too. The PR body carries the report.
