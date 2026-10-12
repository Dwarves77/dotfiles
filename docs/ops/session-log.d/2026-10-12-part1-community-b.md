# 2026-10-12, lane P1-23 (part1-community-b): the Community server-half Keep/Refactor/Trash register

Branch coord/part1-community-b from origin/master 0ad87a94 in a worktree under .claude/worktrees/, fast-forwarded to 547add08 (P1-10 flywheel-b merged) before any file was written. Cloud session (no database, no operator machine, no sub-agents). Dispatch relayed verbatim from the coordinator session (session_01CWzjK7nLaiHmGzAVgtC26C) by session_01M4gJ161GGkihm9erGGPr4P. Brief: docs/plans/rebuild/part1/BRIEF.md on origin/master, read whole; exemplar auth-db.md read whole.

## Accomplished

- `docs/plans/rebuild/part1/community-b.md` (429 lines): module verdict REFACTOR AND PORT; 5,294 code lines today (7,053 raw in 55 files), about 2,680 estimated (plus 40 counted by P1-07 for dispatch and the seed-fallback flag). Community proper (api, pages, lib) 4,872 to 2,520. TRASH: app/api/listings/cursor (zero callers), lib/community/index.mjs (barrel for deleted tests), the three uncalled GET handlers (posts/[id], moderation/reports/[id], notifications/[id]) and the antitrust aggregate branch (unreachable since migration 349). Zero metered model calls, zero Browserless, zero third-party HTTP in scope.
- `docs/plans/rebuild/data-invariants.md`: INV-207 (identity and anonymity at the row), INV-208 (verification and the organisation key), INV-209 (thread entity binding), INV-210 (antitrust refusal), INV-211 (a group keeps an admin), INV-212 (moderation reviewer gate, closed reports), INV-213 (group entry), INV-214 (sign-off), INV-215 (notification privacy and fan-out, preference gap named). Count line updated to 215, and its per-range attributions corrected: master credited INV-169 to INV-194 and INV-201 to INV-206 to "lane Merge ... auth-db.md"; each range now names the lane its rows' own last column cites (P1-04, P1-05, P1-08, P1-07, P1-09, P1-10). P1-10's log says it made the same correction; master did not carry it.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of 31 in-scope ids (47 row occurrences; B-0023 to B-0037 and B-0048 appear in both tables): 27 CONFIRMED-P1, 2 REFUTED (B-0048 and B-0222: shell-context.ts now checks every read error), 2 TRASH (B-0649, B-0650, the cursor route). B-0277 and B-0878 already carried P1-07's cells and were left as they are.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract); no code changed; no live database read.

## Coverage (every file read whole with the Read tool)

55 files, 7,053 raw lines, one Read call per file: app/api/community (27), app/community (7), lib/community (13), app/api/listings (3), app/api/notices (3), lib/notifications (2). The dispatch's "about 7,800" included the community readers in lib/supabase-server.ts; there are none (`grep` for community, forum, vendor finds prose only), and lib/data.ts has none, so 7,053 is the whole scope. Registers read whole: A2-part2-community (135 lines), A1-part2-src-app-pages (211 lines); A1-part1 by its community, listings and notices rows (lines 12-22, 298-358, 388-401, 480-492); the other registers by the 94 lines naming an in-scope path.

## Method and evidence

- Consumer evidence: a symbol census (`grep -rlw` per exported name over fsi-app/src, scripts, supabase and .github/workflows, excluding the defining file and the barrel), then the import lines by hand for every dead claim; route callers from the `/api/community`, `/api/listings` and `/api/notices` literals with the method read at the call site (which is how the three uncalled GET handlers and the uncalled PATCH were found).
- Tables and policies: `.from(`/`.rpc(` reads of the 55 files; CREATE and DROP TABLE greps over the migrations for the community, notification, moderation, vendor and forum families; each RLS policy name the routes rely on confirmed to exist by `grep -l`; policy bodies not re-read.
- Tests: none exist on the tree (`git ls-files` count 0), so every proof the old registers cite is gone; the register's proof section lists what the port must rebuild.
- The four largest findings are mechanical reads: `ban_user` records nothing (no ban table in any migration), so a banned author re-joins a public group; dispatch ignores notification preferences and group mutes; the moderation table stores body, action and notes inside `reason`; the directory counts a different "verified" (sign-off verifier) and a different org type than the verify route writes, with no small-cell floor.

## Decisions

- lib/notifications (dispatch, seed-fallback flag) were disposed by P1-07 capture.md; this register agrees and does not count their clean lines, adding one item for P1-07: the preference and mute check.
- The list remainder and notices routes are planned as their own features (features/lists, features/notices) because they are not Community; their owners have no lane id (gap 6).
- computeDominanceShare: P1-10 plans to move it here; this register does not need it (gap 1).

## Blockers

None. Push and PR follow this entry; if either fails, the exact error is appended here.

## Next steps (for the coordinator)

- INDEX line for `docs/plans/rebuild/part1/community-b.md`.
- Rulings owed (register section 8, gaps 1-8): computeDominanceShare not needed; ban scope (group or platform); mute and preferences honoured by dispatch (P1-07's row changes); community topics (drop or rule a writer); directory floor k = 5 and which fields it counts; owners for the list remainder and notices; the unauthenticated /api/listings/rest against CLAUDE.md's public-route list; keep or drop `organisation_key`.
- P1-11 schema items owed: create_group_for_self, accept_group_invitation, create_thread, decide_signoff, moderate_report, community_directory_counts, community_notification_counts, community_group_bans, three moderation_reports columns.
