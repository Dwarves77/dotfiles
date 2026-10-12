# P1-22 community-a: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-22, DISPOSITION lane, read-only. Tree: origin/master `0ad87a940` (read); fast-forwarded to `944f4cef3` before landing, which changes no file under components/community, app/community, app/api/community or lib/community [CONFIRMED: `git diff --stat`]. Written by a cloud session on 2026-10-12. Every file in SCOPE was read whole with the Read tool; the coverage table below records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. The prior register A2-part2-community-2026-10-11.md was read whole; its line numbers predate the CLEAN-3 header strip (PR 1131 removed the leading doc comments of 10 files in this directory and the 3 test files), so every line number below is from this session's read of `0ad87a940`, and a finding A2 carries is cited as `A2-part2:L<n>`, not re-described.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks and leading-`*` lines stripped; JSX `{/* */}` comment lines are counted as code, so code counts for the .tsx files are an upper bound). Raw lines are `wc -l`.

## 1. Header and coverage

Module: community-a. The Community surface's component layer, `fsi-app/src/components/community/` (33 files). The pages that mount it (`src/app/community/**`), its 27 API routes (`src/app/api/community/**`) and `src/lib/community/**` are P1-23 community-b's; this register reads them only by grep, as consumer evidence and to check a component's contract.

Coverage (33 files, 11,653 raw lines, 10,275 code lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/src/components/community/) | raw lines | code lines | read calls |
|---|---|---|---|
| CommunityRooms.tsx | 1758 | 1597 | 3 (offsets 1, 601, 1201) |
| GroupModals.tsx | 1212 | 1111 | 2 (offsets 1, 621) |
| CommunitySidebar.tsx | 745 | 652 | 1 |
| CommunityShell.tsx | 627 | 559 | 1 |
| ModerationQueue.tsx | 627 | 568 | 1 |
| Post.tsx | 600 | 546 | 1 |
| NotificationsList.tsx | 481 | 423 | 1 |
| GroupHeader.tsx | 478 | 423 | 1 |
| CommunitySearchResults.tsx | 429 | 394 | 1 |
| GroupCard.tsx | 420 | 357 | 1 |
| ModerationActions.tsx | 420 | 388 | 1 |
| PostComposer.tsx | 388 | 333 | 1 |
| ReportPostMenu.tsx | 363 | 324 | 1 |
| ProfileForm.tsx | 347 | 301 | 1 |
| PostList.tsx | 346 | 304 | 1 |
| api-client.ts | 287 | 221 | 1 |
| EntityDiscoveryPanel.tsx | 261 | 216 | 1 |
| CouncilMembersRail.tsx | 259 | 232 | 1 |
| EntityPicker.tsx | 250 | 211 | 1 |
| ReplyComposer.tsx | 192 | 173 | 1 |
| CommunitySearchBar.tsx | 188 | 153 | 1 |
| NotificationsBell.tsx | 143 | 114 | 1 |
| PeerOrgDirectoryTable.tsx | 142 | 135 | 1 |
| CommunityRegionTabs.tsx | 118 | 96 | 1 |
| HowPublishingWorks.tsx | 114 | 111 | 1 |
| BrowseGroupsGrid.tsx | 113 | 92 | 1 |
| types.ts | 96 | 70 | 1 |
| identity-format.ts | 58 | 26 | 1 |
| AuthorIdentityChip.tsx | 54 | 49 | 1 |
| RoleBadge.tsx | 38 | 34 | 1 |
| VerifierBadge.tsx | 38 | 30 | 1 |
| community.css | 38 | 10 | 1 |
| NoDirectMessagingNotice.tsx | 23 | 22 | 1 |
| TOTAL | 11653 | 10275 | 36 |

Files not read whole: none. Test files: none exist in the directory on this tree (`git ls-files 'fsi-app/src/components/community/*'` lists only .tsx, .ts and .css) [CONFIRMED]; `api-client.test.mjs`, `identity-format.test.mjs`, `community-sidebar-route.test.mjs` and `CommunityRooms.composition.npmtest.mjs`, which A2-part2:L65,L91,L93 cite as passing, were deleted by PR 1131 [CONFIRMED: `git show --stat f906b2102`]. Also read whole for this lane: `docs/design/ux-laws.md`, `docs/design/design-principles.md`, `docs/specs/05-community.md`, the COMMUNITY section of `fsi-app/.claude/skills/caros-ledge-platform-intent/references/five-surfaces.md` (lines 76-94), the A2-part2 register, and the 42 BACKLOG rows naming the scope.

Consumer evidence: every `export` name in the directory grepped (`grep -rlw`) over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github/workflows excluding the directory itself, then the import statements isolated with `grep -rnE "from ['\"]@/components/community/"` (21 import lines, all from `src/app/community/**` and `src/lib/community/shell-context.ts`) [CONFIRMED]. Name-only hits for `Post`, `fixtures`, `CommunityRooms`, `GroupCard`, `NotificationsBell`, `EntityPicker`, `CommunitySidebar` outside the directory are comments or unrelated words, not imports [CONFIRMED by the import grep].

## 2. Module verdict

**REFACTOR AND PORT.** Every Community feature the directory delivers is kept, except one stale card (HowPublishingWorks) whose feature no longer exists. The code is not kept as written: one 1,758-line file carries five responsibilities; five separate modal implementations, none with a focus trap; seven avatar/initials copies; three role chips; two privacy pills; nine `safeJson` copies; 33 raw `fetch(` sites with no shared client; 85 raw hex literals in fallbacks; and two direct browser-client table writes beside the API routes. Four live defects come from wiring and break features, not cosmetics (section 3 rank 2): the group-invitation accept/decline UI is mounted by no page, the Rooms composer can never post, GroupHeader and ModerationQueue are mounted without their toast callback, and three customer-visible sentences contradict ADR-041.

**Current code LOC: 10,275** (awk over the 33 files, table above). **Estimated clean LOC: about 5,450.** Arithmetic (section 8 table, per planned file): shell and navigation 1,020 (Shell 220, Home 180, Sidebar 260, RegionTabs 70, SearchBar 90, SearchResults 200) + rooms 750 (RoomsIndex 360, ThreadDisclosure 120, SignoffRail 120, VerticalGroups and create dialog 150) + groups 860 (GroupCard 150, GroupGrid 50, GroupHeader 180, MembersDialog 150, SettingsDialog 130, InviteDialog 200) + posts 830 (PostList 160, Post 260, PostComposer 200, ReplyComposer 80, ReportPostDialog 130) + entities 290 (EntityPicker 150, EntityDiscovery 140) + members rail 110 + moderation 450 (Queue 300, Actions 150) + notifications 330 (Bell 70, List 260) + profile 220 + peer-org directory 90 + shared parts 190 (AuthorIdentity 60, RoleChip 25, Avatar 50, PrivacyPill 40, NoDirectMessaging 15) + lib 325 (api 180, identity-format 25, types 80, labels 40) = 5,465, written as about 5,450. Against 10,275 that is 53 percent. Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (12), with the files that carry them today:

1. Surface chrome for /community/*: layout, community sidebar, masthead, scoped search, region tabs (CommunityShell.tsx, CommunitySidebar.tsx, CommunitySearchBar.tsx, CommunitySearchResults.tsx, CommunityRegionTabs.tsx).
2. Regional rooms index on /community: room tiles, the thread table with in-place disclosure, composer, join and leave, citing a live system item into a thread, verifier sign-off lifecycle, vertical groups and their creation (CommunityRooms.tsx).
3. Group directory and membership: browse grid, group card with join state machine, group page header with star, mute, members, invite and settings dialogs (BrowseGroupsGrid.tsx, GroupCard.tsx, GroupHeader.tsx, GroupModals.tsx).
4. Group feed: post list with cursor paging, post card with lazy replies, composer with entity binding, anonymity and the antitrust refusal render, reply composer, delete (PostList.tsx, Post.tsx, PostComposer.tsx, ReplyComposer.tsx).
5. Author identity display: identity line with name and company shown by default, the anonymous label, the verified mark (AuthorIdentityChip.tsx, identity-format.ts; VerifierBadge.tsx and RoleBadge.tsx in the legacy branch).
6. Member identity self-service: org type, role, sector, region, default anonymity, corporate-email verification (ProfileForm.tsx, api-client.ts).
7. Entity-bound posting and cross-group discovery by entity: picker, local follow list, per-entity thread digest (EntityPicker.tsx, EntityDiscoveryPanel.tsx, api-client.ts).
8. Moderation: report a post; queue with status and reason filters; dismiss, warn, remove, ban (ReportPostMenu.tsx, ModerationQueue.tsx, ModerationActions.tsx).
9. Notifications inbox: bell, unread badge, list with mark read, mark all read, load older (NotificationsBell.tsx, NotificationsList.tsx; the count hook is `src/lib/hooks/useUnreadNotificationsCount.ts`).
10. Group members rail (server component) and the no-direct-messaging statement (CouncilMembersRail.tsx, NoDirectMessagingNotice.tsx).
11. Peer-org directory: aggregate counts by org type and region and by sector (PeerOrgDirectoryTable.tsx).
12. Shared types, the client fetch wrappers and the mobile stacking rule (types.ts, api-client.ts, community.css).

Key dependencies [CONFIRMED by the import scan and the `.from(`/`.rpc(` grep]:

- Modules imported: `react`, `next/link`, `next/navigation`, `lucide-react`; in-repo `@/components/ui/{Absence, Button, CardFoot, Masthead, SectionCard, SectionHeading, RowTable, Toast}` (P1-17), `@/lib/format` (8 files), `@/lib/relative-time` (4), `@/lib/render-now`, `@/lib/supabase-browser`, `@/lib/supabase-server-client` (P1-01), `@/lib/community/{entity-binding.mjs, identity.mjs, profile-policy.mjs, rooms}` (P1-23), `@/lib/hooks/useUnreadNotificationsCount`, `@/lib/notifications/dispatch` (type only).
- Database, direct from components (three sites): `community_group_members` select `user_id, role` (CouncilMembersRail.tsx:32-36, server, RLS client) and delete own row (CommunityRooms.tsx:382-386, browser client); `community_posts` update `referenced_intelligence_item_ids` (CommunityRooms.tsx:410-413, browser client). RPC `community_identity` through `loadCommunityIdentities` (CouncilMembersRail.tsx:51; the RPC name is identity.mjs:132).
- API routes called (24 of the 27 under /api/community): posts (GET, POST), posts/[id] (DELETE), posts/[id]/replies (GET, POST), posts/[id]/signoff, signoff/[id]/decide, signoff/[id]/withdraw, groups (POST), groups/[id]/join, /star, /mute, /settings, /members (GET, DELETE), /invitations, /invite, /invite-candidates, invitations/[id]/accept, /decline, /revoke, moderation/reports (GET, POST), moderation/reports/[id], notifications (GET, POST), notifications/[id], notifications/counts, search, profile (GET, PUT), profile/verify, entities/[entityId]/threads. Not called by any component in scope: none of the 27 is unused by the directory [CONFIRMED: route list from `find src/app/api/community -name route.ts`, matched against the 33 `fetch(` literals].
- Env vars: none. External services: none. Metered model calls: none; no Browserless (`grep -rniE "anthropic|browserless|/api/ask|process\.env"` over the directory: 0) [CONFIRMED]. The FREE constraint holds for this module as it stands.

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | CommunityRooms.tsx is five features in one file | 1,597 code lines: room tiles and thread table (196-1185), sign-off rail (1219-1359), vertical groups rail and create modal (1393-1695), not-seeded state (1697-1758), a pending frame used once (1362-1389) | one component owns eight fetch handlers, two direct table writes, its own modal, its own input style and its own style constants; A2-part2:L49 counts it the largest file in the tree | RoomsIndex, ThreadDisclosure, SignoffRail, VerticalGroupsRail with CreateGroupDialog; actions move to the shared community api client; the two direct writes become route calls (P1-23 owns the routes) |
| 2 | four wiring defects that break features | CommunityShell.tsx 205-627 (about 400 lines mounted by no page); CommunityRooms.tsx 291-299; app/community/[slug]/page.tsx:206 and moderation/page.tsx:69 (P1-23 files) | (a) every page that mounts CommunityShell passes children (six pages, open tags at [slug]:202, browse:196, directory:103, discover:49, moderation:45, profile:28), so `children ?? <CommunityDefaultBody>` (Shell 163-169) never renders: the pending-invitation panel with Accept/Decline, the empty state and the memberships preview are unreachable, and `/api/community/invitations/[id]/accept|decline` has no caller anywhere else (`grep -rn "community/invitations"` outside the API: only Shell :300 and GroupModals :826 revoke) [CONFIRMED read and grep]; (b) the Rooms composer posts `{group_id, title, body}` with no `entity_ids` (Rooms 295-299) while the route refuses any post without one (posts/route.ts:299-301, the same validateEntityIds), so every Rooms post returns 400 and shows "Could not post" [CONFIRMED read of both; not executed]; (c) GroupHeader is mounted without `onToast`, so star, mute, settings, invite, revoke and leave feedback never shows and a failed star or mute reverts silently [CONFIRMED read]; ModerationQueue is mounted without `onToast`, so a failed moderation action is silent [CONFIRMED read] | one Community home that carries the invitation panel; the Rooms composer binds entities through the same EntityPicker; toast is owned inside the feature, never optional |
| 3 | five modal implementations | GroupModals.tsx ModalShell 41-153; ReportPostMenu.tsx 137-352; ModerationActions.tsx 195-320; CommunityRooms.tsx CreateGroupModal 1523-1682; NotificationsBell.tsx dropdown 115-140 | each re-implements overlay, Escape, close button and first focus; none traps focus (GroupModals 57-61 says so); three use `window.confirm` on top (Post 116-121, GroupModals 229, 819) | one Dialog and one ConfirmDialog from the ui-kit (P1-17) |
| 4 | avatar and initials, seven copies | Post.tsx 505-591 (NeutralAvatar, Avatar, makeInitials); CouncilMembersRail.tsx 203-259; CommunitySidebar.tsx 694-745; GroupModals.tsx 324-332 and 1038-1091; CommunitySearchResults.tsx 400-422; GroupHeader.tsx 83-92 | seven initials rules (two-letter first and last, first two letters, "?" or "??" fallback), three sizes, two colourings | one `Avatar({name, url, size, neutral})` in features/community/ui/parts |
| 5 | 33 raw `fetch(` sites and nine `safeJson` copies | GroupCard 414, GroupHeader 472, ModerationActions 404, ModerationQueue 621, Post 594, PostList 340, ReplyComposer 186, ReportPostMenu 357, api-client 229; four more sites call `res.json()` bare (CommunitySearchResults 83, NotificationsList 142 and 178, GroupModals 198, 732, 763) | each site repeats status check, error extraction and a generic fallback string; the bare `res.json()` sites turn a non-JSON 502 into "Network error" | api-client grows into the one typed client (`communityApi.*`, one `request()` with one error shape) |
| 6 | role, privacy and identity chips duplicated | RoleBadge.tsx; GroupHeader.tsx RoleBadge 402-431; GroupModals.tsx RolePill 416-452; CouncilMembersRail.tsx 118-133; PrivacyPill in GroupCard 343-388 and GroupHeader 355-400; the Verified chip in VerifierBadge 15-37 and AuthorIdentityChip 29-50; the author-identity type in api-client.ts 89-98, types.ts 82-93 and PostComposer.tsx 54-60 | three looks for one role, two sizes for one privacy pill, three types for one projection (the PostComposer copy lacks name, company and anonymous, which the route returns) | RoleChip, PrivacyPill, VerifiedMark, one `AuthorIdentity` type |
| 7 | header and rationale essays | CommunitySearchBar.tsx 3-25; CommunitySidebar.tsx 402-419 (the F43 essay) and 135-139, 183-187, 583-590 (perf notes); Post.tsx 28-33 and PostList.tsx 20-23 (the css import essay); EntityDiscoveryPanel.tsx 3-25; ProfileForm.tsx 3-19; CommunityRooms.tsx 3-39, 175-181, 1035-1041, 1066-1071; community.css 1-27 | rulings and lane history told in code comments, several now wrong (section 6) | one sentence per file; rulings cited in section 8 |
| 8 | style without tokens | 85 raw hex literals in the directory, almost all as `var(--x, #hex)` fallbacks, plus `#fff`/`#FFFFFF` direct (CommunityRegionTabs 107, CommunitySidebar 645, 662, 733, GroupModals 368, 1079, CommunityRooms 1671); three token families mixed (`--color-*`, `--ink-*`/`--line-*`/`--sev-*`, `--text`/`--surface`) in CommunityRooms alone; hover by `onMouseEnter` style mutation (CommunitySearchResults 289-295, 334-340; CommunitySidebar 548-553) | CLAUDE.md "semantic color tokens only"; Rooms' own header (36-38) claims no raw hex while carrying rgba borders at 839, 916, 986, 1014, 1128 [CONFIRMED read] | tokens only, from P1-17; hover by CSS |
| 9 | two notification pollers | CommunitySidebar.tsx 76-111 polls `/notifications/counts` every 60 s and never pauses; useUnreadNotificationsCount polls `/notifications` every 60 s and pauses when hidden (hook :21, :45-69) | two intervals per open Community tab, one of them running in a background tab | one notifications store polled once, visibility-paused, feeding both badge and per-group pills |
| 10 | region vocabulary in four places | types.ts CommunityRegionCode 1-9; ProfileForm.tsx REGION_LABELS 39-48; lib/community/profile-policy.mjs REGIONS (EU UK US LATAM APAC HK MEA GLOBAL); lib/community/rooms.ts RoomKey uses `MEAF` with regionCode `MEA` | two codes for one region (MEA, MEAF) and labels typed in a component | one regions module (P1-23 owns lib/community) with labels; components read it |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts, fsi-app/supabase and .github/workflows excluding the defining file, and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| CommunityShell.tsx:205-627 | CommunityDefaultBody, InvitationsPanel, InvitationRow, EmptyState, MembershipsPreview | unreachable branch (about 400 lines) | all six mounting pages pass children (section 3 rank 2a) [CONFIRMED read of the six open tags]. Not trash: the invitation accept/decline it carries is a live feature with no other home (section 8) |
| api-client.ts:242-287 | fixtures | exported const | 0 importers (`grep -rn "fixtures"` with `api-client`: only the defining file) [CONFIRMED]; its test consumers were deleted by PR 1131 |
| types.ts:96 | CommunityProfile (re-export) | export surface | the one importer, ProfileForm.tsx:23, imports from `./api-client` [CONFIRMED grep] |
| ModerationActions.tsx:243 | `confirm.phaseD ? "Fallback action"` | unreachable branch | `phaseD` is set only at :110 and :117, both `false` [CONFIRMED read] |
| ModerationActions.tsx:357-374 | palette.bgHover | unused field | read nowhere; the button uses `.color` and `.border` only (:391-392) [CONFIRMED read] |
| ModerationQueue.tsx:131 | onResolved(action, phaseD) arguments | ignored parameters | the queue's `onResolved(reportId)` returns a zero-argument closure [CONFIRMED read] |
| ReportPostMenu.tsx:39, 111-113 | trigger render prop | unused prop | the one caller, Post.tsx:371-374, passes postId and onToast only [CONFIRMED grep `trigger=`: 0] |
| CommunitySidebar.tsx:522, 545-553 | SidebarRow `active` | unused prop | no caller passes it (:289, :309, :316, :321, :634) [CONFIRMED read]; no current-group highlight exists |
| CommunitySidebar.tsx:216-231 | "Jump to a group, channel, person" input | dead control | no value, no onChange (A2-part2:L69) [CONFIRMED read] |
| CommunitySidebar.tsx:288-305 | "My topics" rows | inert rows | SidebarRow without href, cursor pointer (A2-part2:L69) [CONFIRMED read]; no topic create or edit UI exists in scope |
| Post.tsx:194-221 with VerifierBadge.tsx, RoleBadge.tsx | VerifierBadge, RoleBadge in the legacy header | reader without writer | `post.author` never carries `verifier_status` or `role` (A2-part2:L89-90); the branch runs only when `author_identity` is null, and the list route builds `author_identity` for every row (posts/route.ts:94-104) [CONFIRMED read]; whether `buildAuthorIdentityForRender` can return null was not read [HYPOTHESIS] |
| PostComposer.tsx:50-51 | CommunityPost.attribution, promoted_from_post_id | unused fields | read by no component (`grep -rn "attribution\|promoted_from_post_id" src/components/community`: the type only) [CONFIRMED]; vestiges of the promotion path ADR-041 removed |
| identity-format.ts:12, :26 | formatAuthorIdentity, ANONYMOUS_LABEL (exports) | export surface | used only inside the file [CONFIRMED grep] |
| types.ts:11, :82 | CommunityRegion, CommunityAuthorIdentity (exports) | export surface | importers are inside the directory only [CONFIRMED grep]; kept as module types, the export is not dead |
| api-client.ts:89, :100 | AuthorIdentityProjection, EntityThread | export surface | inside the directory only [CONFIRMED grep] |

Counts by token: [CONFIRMED] 14, [HYPOTHESIS] 1 (the null branch of buildAuthorIdentityForRender), [REFUTED] 0.

Not dead, verified live this session: every component file has a mount chain from a route (A2-part2 register column MOUNTED BY; the 21 import lines of section 1). NotificationsBell is mounted only inside CommunitySearchBar (:145), so the platform inbox is reachable only from /community/* pages that use CommunityShell, not from /community itself (CommunityRooms is mounted without the shell, page.tsx:494) [CONFIRMED grep].

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| modal shell | GroupModals 41-153; ReportPostMenu 137-352; ModerationActions 195-320; CommunityRooms 1523-1682 | P1-17 Dialog with focus trap, Escape, focus return |
| native confirm | Post 116-121; GroupModals 229, 819 | P1-17 ConfirmDialog (ModerationActions already has a styled confirm) |
| avatar and initials | seven sites, section 3 rank 4 | `Avatar` |
| safeJson and the fetch-error pattern | nine copies, section 3 rank 5 | `communityApi.request()` |
| role chip | RoleBadge.tsx; GroupHeader 402-431; GroupModals 416-452; CouncilMembersRail 118-133 | `RoleChip({role, size})` |
| privacy pill | GroupCard 343-388; GroupHeader 355-400 | `PrivacyPill` |
| Verified chip | VerifierBadge 15-37; AuthorIdentityChip 29-50 | `VerifiedMark` |
| author identity type | api-client 89-98; types 82-93; PostComposer 54-60 | one `AuthorIdentity` in types |
| toast | PostList 312-335 (its own fixed div, clickable `div`); ui/Toast used by BrowseGroupsGrid and CommunityShell; GroupHeader and ModerationQueue rely on an `onToast` nobody passes | one Toast owned by the Community layout, exposed by context |
| 7-day activity dot | GroupCard 58-59; GroupHeader 78-80 ("keep them in sync") | one `isRecentlyActive(lastActiveAt, now)` with a server `now` |
| star and mute toggles | GroupHeader 94-118 and 123-147 | one `toggleMemberPref(kind)` |
| report reason vocabulary | ReportPostMenu 21-28; ModerationQueue 74-81 | one REPORT_REASONS list with long and short labels |
| region labels | ProfileForm 39-48; types 1-9; profile-policy REGIONS; rooms RoomKey | one regions module (P1-23) |
| initials for group icon | GroupHeader 83-92 | `Avatar`'s rule |
| input and button style objects | ProfileForm 54-83; GroupModals 1174-1211; CommunityRooms 1684-1695 | P1-17 Input and Button |
| cursor pagination | PostList 88-113; NotificationsList 169-188 (and two different `hasMore` rules, :152-155 and :182) | one `useCursorList` |

Over-abstraction: `fetchImpl: typeof fetch = fetch` on every api-client function (api-client 40-43, 120-124, 167, 192-195, 213) exists for the deleted tests; `onSearchSubmit` round-trips EntityPicker queries through the URL so the server page widens a candidate list (PostComposer 157-161), which a small entities search endpoint would replace [HYPOTHESIS: no entity search API exists, EntityPicker 9-18 says so]; CommunityShell hides the global sidebar by injecting a global `<style>` keyed to Sidebar's Tailwind class names (`aside.h-screen.sticky`, `button[aria-label="Toggle navigation"]`, Shell 189-200), a coupling P1-18 should replace with a layout slot.

## 6. Non-essential artifacts

- `api-client.ts` 237-287: test fixtures shipped in the production module (dead, section 4).
- `HowPublishingWorks.tsx`: a mounted card ([slug]/page.tsx:264) that teaches customers the removed PROMOTE TO PUBLIC flow and says "RLS keeps it inside the room" (:9, :15) (A2-part2:L76) [CONFIRMED read].
- Customer-visible internal words: "(R8.7)" ProfileForm 189; "(spec 05 section 1)" ProfileForm 318 and PostComposer 302; placeholder `saf_premium_usd_per_kg` PostComposer 285; "when the room seed runs" CommunityRooms 1721; "Fallback action" and "(fallback applied)" ModerationActions 243 (unreachable) and 87 (reachable when the route returns `phase_d_stub`); "Welcome back, operator" and "Operator" for a member with no name (Shell 544, Sidebar 184, 354); "Onboard" link labels (Shell 493, Sidebar 203); "Bind to spine entities" EntityPicker 86 [CONFIRMED read].
- Customer-visible copy that contradicts ADR-041 (Community is not a source of information and feeds nothing outside /community): "That's what makes it reachable from Regulations, Market Intel, Research, and Operations" EntityPicker 244-245; "signed-off claims become citable" CommunityRooms 1265-1266 and 1746-1747; the EntityDiscoveryPanel header 10-12 repeats spec 05 component 2's superseded "reachable from the other four surfaces" [CONFIRMED read]. Rooms 1163-1165 states the ruling correctly.
- Stale comments: Post 42-45 and 159-162 ("never both", superseded by R8.7 identity-shown-by-default); Post 194-197; PostList 12-13 ("Reactions are stubbed"); ProfileForm 13-14; ModerationQueue 6-11; NotificationsBell 14-17 ("CommunityMasthead"); GroupCard 12-13 (says `pending`, the type is `pending-invite`); CommunitySidebar 13-17 ("badges render zero", wired since); community.css 10-12 and the `fitness-allow: F43`/`F42` markers (CommunitySidebar 418, CommunityRooms 1571) for enforcers deleted in CLEAN-3.

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's grep) | note.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| CommunityRooms.tsx | 1-1758 (1758) | /community rooms index: tiles, thread table, disclosure, composer, join and leave, cite a live item, sign-off request, withdraw, decide, vertical groups, create group, not-seeded state | REFACTOR AND PORT (split four ways) | 750 | 1: app/community/page.tsx:494 | composer can never post (no entity_ids, :295-299) [CONFIRMED read]; leave and cite write tables from the browser (:382-386, :410-413); room tiles `repeat(4,1fr)` with no narrow rule (:809) and page padding 40 (:766) (A2-part2:L65); every action error collapses to a generic notice (A2-part2:L65); "Global" in the seven rooms is correct, rooms.ts defines seven keys including GLOBAL [REFUTED A2 P-4, section 9]; ADR-041 copy at 1265, 1746 |
| GroupModals.tsx | 1-1212 (1212) | MembersModal (list, leave), SettingsModal (name, description, privacy, downgrade warning), InviteModal (candidate search, invite, pending list, revoke) | REFACTOR AND PORT | 480 | 1: GroupHeader.tsx:35 | no admin member management (role change, remove) in any Community UI; removal happens only as a moderation ban; no focus trap (:57-61) |
| CommunitySidebar.tsx | 1-745 (745) | 280 px community nav: starred, private, public, topics, browse, discover, directory; per-group unread and mention pills | REFACTOR AND PORT | 260 | 1: CommunityShell.tsx:113 | fixed 280 px with no narrow rule (A2-part2:L68-69); dead filter input; inert topic rows; second poller; sections open by default with an F43 marker awaiting an operator ruling (:402-420); chevron target about 10 px (:432-454) |
| CommunityShell.tsx | 1-627 (627) | layout, masthead, search, region tabs, body slot; unreachable default body with invitations | REFACTOR AND PORT | 220 shell + 180 home | 6: [slug], browse, directory, discover, moderation, profile pages | `new Date()` for the masthead date in render (:129) (A2-part2:L68); global-style sidebar hide (:189-200); default body unreachable (section 4) |
| ModerationQueue.tsx | 1-627 (627) | moderation report list, status and reason filters, expandable detail, actions | REFACTOR AND PORT | 300 | 1: moderation/page.tsx:69 | mounted with no onToast and default `canBan=true` (:85) [CONFIRMED read]; limit 50 with no paging (:103); group and user targets render "Reported item no longer available" (:316-318) |
| Post.tsx | 1-600 (600) | post card: identity header, body, lazy replies (20), reply box, delete, report | REFACTOR AND PORT | 260 | 1: PostList.tsx:18 | replies render the legacy name block only, no identity projection (:441-503; the replies route returns no `author_identity`, grep) [CONFIRMED]; replies capped at 20 with no "more" (:78) |
| NotificationsList.tsx | 1-481 (481) | inbox list: mark read, mark all read, load older, navigate by payload link | REFACTOR AND PORT (to the shell, P1-18) | 260 | 1: NotificationsBell.tsx:24 | serves kinds `archive` and `assignment` (:72-79), which are workspace kinds: this is the platform inbox, not a Community feature; rollback and pagination defects (A2-part2:L81) |
| GroupHeader.tsx | 1-478 (478) | group page header: privacy, counts, activity dot, role, star, mute, members, invite, settings | REFACTOR AND PORT | 180 | 1: [slug]/page.tsx:206 | mounted without onToast [CONFIRMED read]; `Date.now()` in render (:78-80) (A2-part2:L74) |
| CommunitySearchResults.tsx | 1-429 (429) | grouped results for posts, groups, people | REFACTOR AND PORT | 200 | 1: CommunityShell.tsx:157 | a post hit links to the group page, not the post (:324); people hits are not links (:374-428), which is consistent with no direct messaging and no profile page; close target about 18 px (:143-157) |
| GroupCard.tsx | 1-420 (420) | group tile: name, privacy, region, counts, activity, join state machine | REFACTOR AND PORT | 150 | 1: BrowseGroupsGrid.tsx:96 | "Request to join" is a permanently disabled button; no request route exists [CONFIRMED: route list]; "Pending acceptance" has no accept path since the invitation panel is unreachable |
| ModerationActions.tsx | 1-420 (420) | dismiss, warn, remove post, ban, reviewer notes, confirm | REFACTOR AND PORT | 150 | 1: ModerationQueue.tsx:31 | targets about 24 px with 6 px gap (A2-part2:L77) |
| PostComposer.tsx | 1-388 (388) | title, body, entity binding, anonymity, sensitivity field, antitrust refusal | REFACTOR AND PORT | 200 | 3: PostList.tsx:17, Post.tsx:21 (type), ReplyComposer.tsx:15 (type) | internal strings (section 6); the sensitivity field is free text a member must type as a database key (:279-299): a select over the guard's own field list would remove the internal word [HYPOTHESIS: the field list is in lib/community/antitrust.mjs, not read] |
| ReportPostMenu.tsx | 1-363 (363) | report button and dialog, six reasons, details | REFACTOR AND PORT | 130 | 1: Post.tsx:23 | unused `trigger` prop |
| ProfileForm.tsx | 1-347 (347) | member identity: org type, role, sector, region, default anonymity; corporate-email verify | REFACTOR AND PORT | 220 | 1: profile/page.tsx:50 | sector is free text (:244-251), not the sector taxonomy; no name or company field (they come from profiles via the identity RPC) and no LinkedIn verification affordance (section 8) |
| PostList.tsx | 1-346 (346) | group feed: load, page by cursor, composer for members, post cards | REFACTOR AND PORT | 160 | 1: [slug]/page.tsx:243 | own toast div; Retry about 21 px (A2-part2:L85) |
| api-client.ts | 1-287 (287) | typed fetch for post create, entity threads, own profile get, put, verify; fixtures | REFACTOR AND PORT (becomes the one client) | 180 | 4 in-dir: PostComposer, EntityDiscoveryPanel, ProfileForm, identity-format | getEntityThreads returns null on every failure (A2-part2:L91) |
| EntityDiscoveryPanel.tsx | 1-261 (261) | follow entities on this device, per-entity latest threads across groups | REFACTOR AND PORT | 140 | 1: discover/page.tsx:71 | failure renders "Loading" forever (:212-214) (A2-part2:L71); reply count shown with a Bell icon (:252) |
| CouncilMembersRail.tsx | 1-259 (259) | server rail: up to six members by role, "+ N more", no-DM notice | REFACTOR AND PORT | 110 | 1: [slug]/page.tsx:265 | read error renders the private-group message (:38-44) (A2-part2:L70) |
| EntityPicker.tsx | 1-250 (250) | select spine entities from a server-supplied candidate list | REFACTOR AND PORT | 150 | 2 in-dir: PostComposer, EntityDiscoveryPanel | ADR-041 copy at :244-245 |
| ReplyComposer.tsx | 1-192 (192) | reply form, 4,000 characters | REFACTOR AND PORT | 80 | 1: Post.tsx:22 | |
| CommunitySearchBar.tsx | 1-188 (188) | search form, four scopes, Cmd/Ctrl+K, hosts the bell | REFACTOR AND PORT | 90 | 1: CommunityShell.tsx:38 | scope chips under the target floor (A2-part2:L66); the CommandBar question it records (:9-24) is an open operator ruling, carried to section 8 |
| NotificationsBell.tsx | 1-143 (143) | bell, unread badge, dropdown | REFACTOR AND PORT (to P1-18) | 70 | 1: CommunitySearchBar.tsx:29 | 36 px (A2-part2:L80) |
| PeerOrgDirectoryTable.tsx | 1-142 (142) | aggregate counts by org type x region (members, verified) and by sector | KEEP AS-IS | 90 | 1: directory/page.tsx:126 | aggregate only, no per-person rows |
| CommunityRegionTabs.tsx | 1-118 (118) | region tab strip writing `?region=` | REFACTOR AND PORT | 70 | 1: CommunityShell.tsx:149 | `#fff` (:107); tabs about 44 px tall [CONFIRMED arithmetic: 14+14 padding, 3 border, 12 px text] |
| HowPublishingWorks.tsx | 1-114 (114) | static card describing promote-to-public | TRASH | 0 | 1: [slug]/page.tsx:264 | describes a removed feature (A2-part2:L76; ADR-041) |
| BrowseGroupsGrid.tsx | 1-113 (113) | GroupCard grid, join toast, empty state | REFACTOR AND PORT | 50 | 1: browse/page.tsx:228 | `minmax(300px,1fr)` cannot fit beside a 280 px sidebar at 375 px (section 9 B-1904) |
| types.ts | 1-96 (96) | shared Community types | REFACTOR AND PORT | 80 | 5: [slug], browse, discover pages, lib/community/shell-context.ts, 12 in-dir | dead re-export :96 |
| identity-format.ts | 1-58 (58) | author identity label, anonymous label, entity-binding refusal wrapper | KEEP AS-IS | 25 | 2 in-dir: AuthorIdentityChip, PostComposer | delegates to the server's validator (:55-58) |
| AuthorIdentityChip.tsx | 1-54 (54) | identity line and Verified mark | REFACTOR AND PORT (merged into AuthorIdentity) | 60 with VerifiedMark | 2 in-dir: Post, EntityDiscoveryPanel | |
| RoleBadge.tsx | 1-38 (38) | Admin and Mod chip | TRASH (merged into RoleChip) | 0 | 1: Post.tsx:25 | renders null on live data (section 4) |
| VerifierBadge.tsx | 1-38 (38) | Verified-contributor chip | TRASH (merged into VerifiedMark) | 0 | 1: Post.tsx:24 | renders null on live data (section 4) |
| community.css | 1-38 (38) | stack `.cl-comm-row` at 640 px and below | REFACTOR AND PORT (to a P1-17 responsive row) | 0 here | 3 in-dir: Post, PostList, EntityDiscoveryPanel | |
| NoDirectMessagingNotice.tsx | 1-23 (23) | the no-DM statement | KEEP AS-IS | 15 | 2 in-dir: CouncilMembersRail, GroupModals | spec 05 acceptance 5 |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/features/community/ui/CommunityLayout.tsx | CommunityShell.tsx 64-203 | layout through the P1-18 shell's surface-nav slot (no global style hack); one Toast context; narrow-width drawer for the sidebar | 220 |
| src/features/community/ui/CommunityHome.tsx | CommunityShell.tsx 205-627 | pending group invitations with Accept/Decline, empty state, memberships (tiles are links), mounted on /community above or beside the rooms index (the page decides with P1-23) | 180 |
| src/features/community/ui/CommunitySidebar.tsx | CommunitySidebar.tsx 51-692 | sections, current-group highlight, per-group pills from the shared notifications store; no dead filter input (built as a working filter or not at all); topics either editable or not shown | 260 |
| src/features/community/ui/RegionTabs.tsx | CommunityRegionTabs.tsx 30-118 | region strip | 70 |
| src/features/community/ui/SearchBar.tsx | CommunitySearchBar.tsx 39-188 | search form, scopes, Cmd/Ctrl+K | 90 |
| src/features/community/ui/SearchResults.tsx | CommunitySearchResults.tsx 60-429 | grouped hits; a post hit links to the post anchor | 200 |
| src/features/community/ui/rooms/RoomsIndex.tsx | CommunityRooms.tsx 196-1185 | tiles (wrapping grid), thread table, composer with EntityPicker, join and leave by route | 360 |
| src/features/community/ui/rooms/ThreadDisclosure.tsx | CommunityRooms.tsx 638-763 | body, cited system items, reply, cite a live item | 120 |
| src/features/community/ui/rooms/SignoffRail.tsx | CommunityRooms.tsx 1198-1359 | request, withdraw, decide; copy without "citable" | 120 |
| src/features/community/ui/rooms/VerticalGroups.tsx | CommunityRooms.tsx 1391-1695, 1697-1758 | vertical groups list, create dialog, not-seeded state in customer words | 150 |
| src/features/community/ui/groups/GroupCard.tsx | GroupCard.tsx 42-408 | tile and join state machine | 150 |
| src/features/community/ui/groups/GroupGrid.tsx | BrowseGroupsGrid.tsx 35-113 | grid and empty state | 50 |
| src/features/community/ui/groups/GroupHeader.tsx | GroupHeader.tsx 54-470 | header, star and mute through one toggle | 180 |
| src/features/community/ui/groups/MembersDialog.tsx | GroupModals.tsx 159-452 | roster, leave | 150 |
| src/features/community/ui/groups/SettingsDialog.tsx | GroupModals.tsx 454-683 | name, description, privacy with downgrade warning | 130 |
| src/features/community/ui/groups/InviteDialog.tsx | GroupModals.tsx 685-1032 | candidate search, invite, pending, revoke | 200 |
| src/features/community/ui/posts/PostList.tsx | PostList.tsx 42-338 | feed with cursor paging | 160 |
| src/features/community/ui/posts/Post.tsx | Post.tsx 50-503 | card; replies with the identity projection and paging | 260 |
| src/features/community/ui/posts/PostComposer.tsx | PostComposer.tsx 84-388 | composer; sensitivity field as a choice, not a key | 200 |
| src/features/community/ui/posts/ReplyComposer.tsx | ReplyComposer.tsx 26-184 | reply form | 80 |
| src/features/community/ui/posts/ReportPostDialog.tsx | ReportPostMenu.tsx 42-355 | report button and dialog | 130 |
| src/features/community/ui/entities/EntityPicker.tsx | EntityPicker.tsx 45-250 | entity selection; copy within ADR-041 | 150 |
| src/features/community/ui/entities/EntityDiscovery.tsx | EntityDiscoveryPanel.tsx 66-261 | follows on this device, digest with an error state | 140 |
| src/features/community/ui/MembersRail.tsx | CouncilMembersRail.tsx 22-201 | server rail with an honest error state | 110 |
| src/features/community/ui/moderation/ModerationQueue.tsx | ModerationQueue.tsx 83-614 | queue, filters, paging | 300 |
| src/features/community/ui/moderation/ModerationActions.tsx | ModerationActions.tsx 46-402 | actions with ConfirmDialog | 150 |
| src/ui/notifications/NotificationsBell.tsx (P1-18) | NotificationsBell.tsx 27-143 | platform inbox bell, 44 px | 70 |
| src/ui/notifications/NotificationsList.tsx (P1-18) | NotificationsList.tsx 23-481 | inbox list with consistent rollback and an error on load-older | 260 |
| src/features/community/ui/ProfileForm.tsx | ProfileForm.tsx 21-347 | identity declare and verify; sector from the taxonomy | 220 |
| src/features/community/ui/PeerOrgDirectory.tsx | PeerOrgDirectoryTable.tsx 1-142 | aggregate tables | 90 |
| src/features/community/ui/parts/{AuthorIdentity, RoleChip, Avatar, PrivacyPill, NoDirectMessaging}.tsx | AuthorIdentityChip 9-54, VerifierBadge 12-38, RoleBadge 6-38, GroupHeader 355-431, GroupModals 416-452, 1038-1091, Post 505-591, CouncilMembersRail 203-259, CommunitySidebar 694-745, GroupCard 343-408, NoDirectMessagingNotice 3-23 | shared Community parts | 190 |
| src/features/community/lib/api.ts | api-client.ts 1-235 plus the 29 inline fetch sites | one typed client, one error shape | 180 |
| src/features/community/lib/identity-format.ts | identity-format.ts 1-58 | label and binding refusal | 25 |
| src/features/community/lib/types.ts | types.ts 1-96; api-client.ts 89-154; PostComposer.tsx 32-61; CommunityRooms.tsx 62-139 | one type per concept | 80 |
| src/features/community/lib/labels.ts | ProfileForm.tsx 27-48; ReportPostMenu.tsx 21-28; ModerationQueue.tsx 74-81 | org-type, report-reason labels (regions from P1-23's module) | 40 |

### Data model actually used (through the routes and the three direct reads; columns named in the component types)

- `community_groups` (via routes): `id, name, slug, region, privacy, member_count, weekly_post_count, last_active_at, description`, `vertical` (vertical groups). Written: name, description, privacy (settings route), insert name, vertical, description (groups POST).
- `community_group_members`: `group_id, user_id, role, starred, muted, joined_at`; written star, mute (routes), join (route), delete own row (browser client, CommunityRooms 382-386), leave (route DELETE).
- `community_posts`: `id, group_id, parent_post_id, author_user_id, title, body, created_at, last_reply_at, reply_count, anonymous, referenced_intelligence_item_ids, signed_off_at`; written by the routes and by the browser update of `referenced_intelligence_item_ids` (CommunityRooms 410-413). Carried in the type and unused: `attribution, promoted_from_post_id`.
- `community_post_signoff_requests` (migration 153, via routes): request id, status (`pending, signed_off, declined, withdrawn`), requester.
- `community_member_profiles` (via the profile routes): `org_type, role, sector, region, verified, verified_at, verification_method, default_anonymous`.
- `community_invitations` (via routes): `id, group_id, inviter_user_id, invitee_user_id, created_at`.
- `community_reports` [HYPOTHESIS: table name not read; the shape is `id, target_kind, target_id, reporter_user_id, reason, body, status, created_at, resolved_at, resolved_by_user_id`].
- `notifications` (via routes): `id, kind, payload{title, body, link, group_id}, read_at, created_at`.
- `community_topics` (via shell-context): `id, label, group_count`; read only, no write path in scope.
- RPC `community_identity(p_ids, p_query)` returning `display_name, avatar_url` (and company, job title, region per the posts route); `entities` read by the pages for picker candidates.
- Not read anywhere in scope: profiles `verifier_status` and community `role` per author (the two badges' fields).

### Interface to other modules

- P1-23 community-b (pages, API routes, lib/community): owns every route this module calls (section 2) and the three page wiring defects (section 3 rank 2: [slug]:206 and moderation:69 pass no toast; no page renders the invitation panel). Asks of P1-23: replace the two browser-client writes with routes (leave already has `DELETE /groups/[id]/members`; cite needs a route); return `author_identity` on replies; an entity search endpoint for EntityPicker (or keep the URL round-trip); paging on moderation reports; one regions module (MEA vs MEAF).
- P1-17 ui-kit: Dialog, ConfirmDialog, Toast, Button, Input, Select, responsive row (replaces community.css), Masthead, SectionCard, SectionHeading, CardFoot, RowTable, Absence, tokens.
- P1-18 shell: a surface-nav slot so Community's sidebar replaces the global one without CSS injection; the notifications bell and list as platform chrome (they carry workspace kinds) with one poller feeding the Community per-group pills.
- P1-01 auth-db: `createSupabaseServerClient`, `createSupabaseBrowserClient`, `requireCommunityRoute` (route side); the LinkedIn verification feature recorded in auth-db.md section 8 lands here (below).
- P1-02 workspace: workspace role ("Owner" chip, CommunityRooms 1120-1134 reads workspace owner, not group owner), `/profile` links (Rooms 1140, 1274).
- Exports offered: the Community UI pages' components, `communityApi`, `AuthorIdentity`, `Avatar`, `RoleChip`, `formatAuthorIdentity`/`authorIdentityLabel`, `validateEntityBinding`.

### Invariants this code enforces

Already in data-invariants.md: INV-137 (privilege columns not self-writable, includes community member verification), INV-150 (Community counters by definer triggers). Appended by this lane, same commit: INV-213 (every Community post binds 1 to 10 well-formed spine entity ids, refused before the network and by the route with the same validator), INV-214 (an anonymous author renders as "Anonymous member" with the verified mark kept; name, company and headshot never render; the author id reaches only the author and a platform admin), INV-215 (no module outside /community imports the Community components and no Community copy claims reach into other surfaces; ADR-041), INV-216 (no UI addresses one member privately: no direct messaging, people results and member rows carry no contact action).

### Rulings the code embodies (cite)

- Community is social only; system to Community links allowed, nothing out (ADR-041, operator 2026-10-03; CommunityRooms 1163-1165; the cite-a-live-item action is the allowed inbound direction, CommunityRooms 404-432).
- External data only; benchmarks removed (ADR-042; api-client 244-247, CommunitySidebar 314-315).
- Identity shown by default, anonymity per post or per user, verified mark kept (R8.7, spec 07 Community, 2026-09-25, migration 336; identity-format 4-41, PostComposer 241-265, ProfileForm 273-288). This supersedes spec 05 section 2's "not name or company"; spec 05 still states the older rule, a contradiction for the operator's contradiction audit [CONFIRMED read of both].
- Anonymous author id withheld from everyone but the author and a platform admin (DFIX-1, SEC-5 residual; PostComposer 33, posts route).
- Every thread binds to a spine entity (spec 05 acceptance 6; identity-format 43-58; api-client 34-47).
- No direct messaging (spec 05 component 8, acceptance 5; NoDirectMessagingNotice).
- Antitrust write-time refusal with an explanation (spec 05 section 1, component 12; PostComposer 128-136, 364-385).
- Accordions closed by default (CLAUDE.md, operator 2026-09-08); the sidebar sections are open with a marker reporting the case for a ruling (CommunitySidebar 402-420): an open operator ruling.
- Artboard 12 governs Rooms layout, the operator governs system (CLAUDE.md rule 20; CommunityRooms 3-17, 1035-1041 DEVIATION-LOG).
- Vendor directory removed (operator 2026-05-24; five-surfaces.md:88-90): no vendor code exists in scope [CONFIRMED: `grep -rni vendor src/components/community` 0 hits].

### Section 8 items the coordinator named (illustrative of the class "every Community feature", rule 19)

- **Working groups.** Private groups: GroupCard, GroupHeader, GroupModals, CouncilMembersRail, CommunitySidebar "Private groups"; vertical groups: CommunityRooms VerticalGroupsRailPanel and CreateGroupModal. Rendered from `community_groups` and `community_group_members` via the groups routes and shell-context. New home: features/community/ui/groups and rooms/VerticalGroups.
- **Forums.** Public groups and the seven regional rooms: CommunityRooms (rooms from `lib/community/rooms.ts` ROOMS, threads from community_posts read by page.tsx), PostList and Post (group feed via `/api/community/posts`). New home: rooms/*, posts/*.
- **Promote-to-public.** NOT PRESENT as a feature: no promote route exists (route list, section 2), PromotePost* were deleted by PR 918 (A2-part2:L53), the only artifacts are HowPublishingWorks (TRASH) and two unused type fields. five-surfaces.md:84 and :94 still list it as shipped, and spec 05 "Current verdict" says so too; ADR-041 removed promotion. Recorded as a contradiction for the coordinator, not ported.
- **Author identity (org, role, sector, region).** Declared in ProfileForm (org type, role, sector, region, default anonymity) via `/api/community/profile`; verified via `/api/community/profile/verify` (corporate email domain on the confirmed account address, ProfileForm 315-319); displayed by AuthorIdentityChip from the route's `author_identity` (name, company, org type, role, sector, region, verified, anonymous). Replies do not carry it (Post 441-503). New home: ProfileForm, parts/AuthorIdentity.
- **LinkedIn verification.** Not in any Community component today; the code that wrote `linkedin_verified` and `verification_tier` is the unwired LinkedIn chain auth-db.md TRASHED and recorded for this lane. It lands as a second verification method beside corporate email in ProfileForm's verify section, writing `community_member_profiles.verification_method` [HYPOTHESIS: the route and column choice is P1-23's and P1-01's].
- **Region and group structure.** Region tabs (`?region=`), seven rooms keyed GLOBAL, EU, US, UK, APAC, LATAM, MEAF, group region pills, member region in identity. Sector-driven group seeding (spec 05 component 9) does not exist in scope.
- **Editorial pickup.** Absent in code (`grep -rniE "pickup" src`: no Community hit) and removed by ADR-041 (spec 05 section 4). The dispatch's "(in flight)" contradicts ADR-041 [CONFIRMED read of ADR-041 frontmatter and spec 05]; nothing ported, flagged to the coordinator.
- **Vendor directory.** Removed; no code (above).

### The proof

1. Route persona matrix for every action the UI calls, run by P1-23 (anon, non-member, member, moderator, group admin, platform admin).
2. Component tests, each red against a broken copy first: Rooms composer sends entity_ids; invitation Accept/Decline reachable from /community; toast shown on a failed star, mute and moderation action; EntityDiscovery shows an error, not "Loading", on a 500; MembersRail shows an error, not the privacy line, on a read error; NotificationsList rolls back items with the count; anonymous author renders "Anonymous member" with the verified mark and no name, company or headshot (INV-214).
3. Grep checks as lint rules: no import of features/community outside app/community (INV-215); no `fetch(` in features/community/ui (the client owns it); no raw hex; no `window.confirm`.
4. Playwright at 375 px on /community, /community/browse, /community/[slug], /community/moderation: no horizontal overflow, every target at the law-2 floor.
5. `npm run typecheck`, `lint`, `next build` (the one CI job).

### Port order

1. lib: types, labels, identity-format, api (everything imports them).
2. parts: Avatar, RoleChip, PrivacyPill, AuthorIdentity, NoDirectMessaging.
3. CommunityLayout and CommunitySidebar with the P1-18 slot; RegionTabs, SearchBar, SearchResults.
4. posts (PostList, Post, PostComposer, ReplyComposer, ReportPostDialog), entities.
5. groups (card, grid, header, three dialogs), MembersRail.
6. rooms (index, disclosure, sign-off, vertical groups) and CommunityHome with invitations.
7. moderation; ProfileForm with LinkedIn as a second method; PeerOrgDirectory.
8. Hand NotificationsBell and List to P1-18.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Community layout with its own sidebar replacing the global nav | CommunityShell, CommunitySidebar | CommunityLayout, CommunitySidebar |
| Back to the platform link, account footer with settings link | CommunitySidebar 140-156, 330-381 | CommunitySidebar |
| Starred, private, public group lists with unread and mention pills | CommunitySidebar 236-282, 604-677 | CommunitySidebar |
| My topics list (read only) | CommunitySidebar 284-306 | CommunitySidebar (editable or removed, ruling owed: no write path exists) |
| Masthead with date | CommunityShell 124-130 | CommunityLayout (server date) |
| Scoped search (all, posts, groups, people), Cmd/Ctrl+K, 2-character minimum | CommunitySearchBar, CommunityShell 132-147, CommunitySearchResults | SearchBar, SearchResults |
| Region filter tabs with counts | CommunityRegionTabs | RegionTabs |
| Pending group invitations, accept and decline | CommunityShell 239-416 (unreachable today) | CommunityHome |
| Empty state and memberships preview with "jump back in" | CommunityShell 418-627 (unreachable today) | CommunityHome |
| Seven regional rooms with item counts, themes, activity | CommunityRooms 809-904 | RoomsIndex |
| Room thread index with reply counts and last activity | CommunityRooms 540-636, 930-960 | RoomsIndex |
| Start a discussion in a room, starter prompts | CommunityRooms 962-1034, 1189-1194 | RoomsIndex (with entity binding) |
| Join and leave a room | CommunityRooms 375-402, 1042-1062 | RoomsIndex |
| Reply inline, delete own discussion | CommunityRooms 328-373, 685-720 | ThreadDisclosure |
| Cite a live system item into a thread (system to Community) | CommunityRooms 404-432, 721-760 | ThreadDisclosure |
| Verifier sign-off: request, withdraw, decide queue, signed-off chip | CommunityRooms 443-523, 1198-1359 | SignoffRail |
| Who's here roster by home region | CommunityRooms 1077-1146 | RoomsIndex rail |
| Vertical groups list and creation | CommunityRooms 245-282, 1391-1682 | VerticalGroups |
| Not-yet-seeded rooms state | CommunityRooms 1697-1758 | VerticalGroups (customer words) |
| Links to browse and moderation from the rooms rail | CommunityRooms 1494-1517 | VerticalGroups |
| Browse groups grid, join a public group, toast | BrowseGroupsGrid, GroupCard | GroupGrid, GroupCard |
| Group page header: privacy, members, weekly posts, activity, role | GroupHeader | GroupHeader |
| Star and mute a group | GroupHeader 94-147 | GroupHeader |
| Members roster and leave group | GroupModals 159-452 | MembersDialog |
| Group settings: rename, describe, change privacy with a downgrade warning | GroupModals 454-683 | SettingsDialog |
| Invite members by name search, pending list, revoke | GroupModals 685-1032 | InviteDialog |
| Group feed with cursor paging | PostList | PostList |
| Post with title, body, entity binding, anonymity, sensitivity field | PostComposer | PostComposer |
| Antitrust refusal explained in place | PostComposer 128-136, 364-385 | PostComposer |
| Post card with identity, delete by author or group admin | Post | Post |
| Replies: view, write | Post 74-112, 387-503; ReplyComposer | Post, ReplyComposer |
| Report a post with reason and details | ReportPostMenu | ReportPostDialog |
| Moderation queue with status and reason filters | ModerationQueue | ModerationQueue |
| Dismiss, warn, remove, ban with notes and confirmation | ModerationActions | ModerationActions |
| Group members rail with roles | CouncilMembersRail | MembersRail |
| No direct messaging statement | NoDirectMessagingNotice | parts/NoDirectMessaging |
| Community identity declare: org type, role, sector, region, default anonymity | ProfileForm 85-305 | ProfileForm |
| Corporate-email verification | ProfileForm 307-344, api-client 213-225 | ProfileForm |
| LinkedIn verification (auth-db.md section 8 hand-off) | none in scope; old chain TRASH in P1-01 | ProfileForm second method |
| Author identity line, anonymous label, verified mark | AuthorIdentityChip, identity-format | parts/AuthorIdentity |
| Follow entities and see their threads across groups | EntityDiscoveryPanel, api-client 120-138 | EntityDiscovery |
| Entity picker | EntityPicker | EntityPicker |
| Peer-org directory aggregates | PeerOrgDirectoryTable | PeerOrgDirectory |
| Notifications bell, inbox, mark read, mark all read, older | NotificationsBell, NotificationsList | P1-18 shell |
| Mobile stacking of rows with a fixed aside | community.css | P1-17 responsive row |
| How publishing works (promote to public) | HowPublishingWorks | NOT PORTED: the feature was removed (ADR-041) |

### Defects the new code must not repeat

An unreachable default body behind `children ??` (section 4), a composer that skips the server's required field (Rooms 295-299), optional toast callbacks nobody passes, a read error shown as a privacy statement (CouncilMembersRail 38-44), a failure rendered as loading (EntityDiscoveryPanel 212-214), optimistic rollback of the count but not the items (NotificationsList 190-210), silent pagination stop (NotificationsList 183-185), copy that contradicts ADR-041, internal ids and database keys in customer text, wall-clock reads in render (Shell 129, GroupCard 58-59, GroupHeader 78-80), five modal shells without focus traps, browser-client table writes beside routes, a fixed 280 px sidebar and a 4-column grid with no narrow rule.

## 9. Backlog STATUS cells written in this commit (42 rows)

Written into the STATUS column of docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md, counted from the edit script's map:

- CONFIRMED-P1 25: B-0128, B-0133, B-0135, B-0138, B-0139, B-0141, B-0142, B-0143, B-0144, B-1519, B-1520, B-1522, B-1523, B-1524, B-1904, B-1905, B-1906, B-1907, B-1908, B-1909, B-1910, B-1911, B-1913, B-2141, B-2142.
- REFUTED 9: B-0129, B-0130, B-0131 (A2 P-4: rooms.ts defines seven rooms including GLOBAL), B-0132, B-0134, B-0137, B-0140, B-1912, B-1914.
- CLOSED 1: B-0145 (PR 1131).
- TRASH 7: B-0136, B-0535, B-0536, B-0999, B-1521, B-1525, B-1526.

Total 42, every in-scope row. The four wiring defects of section 3 rank 2 and the ADR-041 copy sentences beyond EntityPicker and Rooms are new findings of this lane with no backlog row; they are carried by this register, not by new backlog rows.
