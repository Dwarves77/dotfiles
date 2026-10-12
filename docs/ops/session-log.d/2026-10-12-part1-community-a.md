# 2026-10-12, lane P1-22 (part1-community-a): the community-a Keep/Refactor/Trash register

Branch coord/part1-community-a from origin/master 0ad87a940, fast-forwarded to 944f4cef3 before writing the invariants (no file under components/community, app/community, app/api/community or lib/community changed in between, `git diff --stat`). Cloud session (no database, no sub-agents). Brief from the coordinator session, relayed through a second session: read src/components/community whole, write one register with its build-plan section, change no code.

## Accomplished

- `docs/plans/rebuild/part1/community-a.md`: module verdict REFACTOR AND PORT into src/features/community (ui, lib) with the notifications inbox moving to the P1-18 shell; 10,275 code lines today (11,653 raw, 33 files), about 5,450 estimated (53 percent); bloat ranked (10 rows, led by CommunityRooms.tsx at 1,597 code lines and the four wiring defects); dead code (15 rows); duplicates (15 rows); file register (33 rows: 3 KEEP AS-IS, 27 REFACTOR AND PORT, 3 TRASH); build plan (34 planned file rows with source line ranges, data model, interface by lane id, rulings, proof, port order, 45 features each with a new home or a stated reason).
- `docs/plans/rebuild/data-invariants.md`: INV-223 to INV-226 appended after master's INV-212; the Count line updated to 216.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 42 in-scope rows written: 25 CONFIRMED-P1, 9 REFUTED, 7 TRASH, 1 CLOSED (PR 1131).
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract).

## Coverage (every file read whole with the Read tool)

33 files, 11,653 raw lines, 36 Read calls (CommunityRooms.tsx in three runs, GroupModals.tsx in two). No file in SCOPE was left unread. Also read whole: the A2-part2 community register, docs/specs/05-community.md, ux-laws.md, design-principles.md, the COMMUNITY section of the platform-intent five-surfaces reference, the auth-db.md exemplar and the brief.

## Findings for the coordinator

1. [CONFIRMED read] The group-invitation Accept/Decline UI is mounted by no page: all six pages that use CommunityShell pass children, so its default body never renders, and nothing else calls /api/community/invitations/[id]/accept or /decline. A member invited to a private group has no way to accept.
2. [CONFIRMED read, not executed] The regional rooms composer on /community sends no entity_ids and the posts route refuses that with 400, so no room post can succeed.
3. [CONFIRMED read] GroupHeader ([slug]/page.tsx:206) and ModerationQueue (moderation/page.tsx:69) are mounted without onToast, so their success and failure messages never show. Items 1 to 3 sit partly in P1-23's page files.
4. [CONFIRMED read] Customer copy contradicts ADR-041 in three places (EntityPicker 244-245; CommunityRooms 1265-1266 and 1746-1747).
5. Doc contradictions owed to the contradiction audit: five-surfaces.md:84,94 and spec 05 still list promote-to-public as shipped (no code exists; ADR-041 removed promotion); spec 05 section 2 says no name or company, R8.7 shows both by default; the dispatch calls editorial pickup "in flight", ADR-041 removed it and no code exists.
6. A2 P-4 (B-0131) refuted: the seven rooms include Global (lib/community/rooms.ts).
7. Open operator rulings carried in the register: community sidebar sections open by default (the F43 marker); whether CommandBar grows a scope extension for Community search; whether "My topics" gets a write path or is removed; LinkedIn as a second verification method (P1-01 hand-off), route and column with P1-23.

## Decisions

- HowPublishingWorks, RoleBadge and VerifierBadge are TRASH (the first describes a removed feature; the two badges merge into RoleChip and VerifiedMark and render nothing on live data today).
- NotificationsBell and NotificationsList move to P1-18: they carry workspace kinds (archive, assignment), so the inbox is platform chrome.

## Verification

- `wc -l` and an awk code-line count over the 33 files.
- An export scan (60 exported names, `grep -rlw` over src, scripts, supabase, .github/workflows), then an import-statement grep (21 import lines, all from src/app/community/** and lib/community/shell-context.ts).
- `git show --stat f906b2102` (CLEAN-3, PR 1131: headers stripped in 10 files, 4 test files deleted); the PR number found by a GitHub search.
- `find src/app/api/community -name route.ts` against the 33 `fetch(` literals; reads of posts/route.ts 45-115 and 296-301, entity-binding.mjs, rooms.ts ROOMS, the six CommunityShell mount sites, the replies route grep.
- A grep of the directory for anthropic, browserless, /api/ask and process.env: none.
- The register's text checked for em or en dash glyphs, the section-sign glyph and user-home paths: none.

## UX compliance

No .tsx or .css was changed. The register's section 8 states, per planned screen, the 375 px and law-2 target requirements the port must meet (proof item 4).
