# P1-23 community-b: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-23, DISPOSITION lane, read-only. Tree: origin/master `547add086` (P1-10 flywheel-b merged). Written by the cloud session on 2026-10-12 (clock from `date -u`: 04:17 UTC). Every file in SCOPE was read whole with the Read tool; the coverage table records each read. Every claim carries `[CONFIRMED]` (read or executed this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. Registers read whole: A2-part2-community, A1-part2-src-app-pages; A1-part1 by its community, listings and notices rows (lines 12-22, 298-358, 388-401, 480-492); every other register by the 94 lines that name an in-scope path (A2-part3, A2-part6, A2-part7, A3, A4, A4d, C2, C3, C3a, C3b, C3c, C4, D2, E1, F1) [CONFIRMED: `grep -c` per register].

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks and leading-`*` lines stripped; JSX `{/* */}` comments are counted as code). Raw lines are `wc -l`.

## 1. Header and coverage

Module: community-b. The Community surface's server half: the 27 route handlers under `app/api/community`, the seven `/community` pages, `lib/community` (identity, anonymity, verification key, antitrust guard, rooms, shell context), and three directories the scope names that are not Community at all: `app/api/listings` (the intelligence list remainder routes), `app/api/notices` (the recalculation-notice feed) and `lib/notifications` (the inbox writer and the seed-fallback integrity flag). The client half (`src/components/community/**`, 33 files, A2-part2) is P1-22 community-a's [HYPOTHESIS: the coordinator's dispatch names P1-22 without its file list; A2-part2 is the only register of those files].

The scope's "community readers in lib/supabase-server.ts" do not exist: `grep -n "community\|forum\|vendor" fsi-app/src/lib/supabase-server.ts` returns no table read, only prose (lines 508, 677, 1614, 1832, 1901, 2160, 3507, 3616) [CONFIRMED]. `lib/data.ts` has none either (`grep -n communit` = 0) [CONFIRMED]. The one surface read Community makes into the intelligence layer is `getListingsOnly()` from `app/community/page.tsx:4,216`, which P1-01 auth-db.md section 8 assigns to the surface read modules. No supabase-server.ts lines are therefore counted here.

Coverage (55 files, 7,053 raw lines, 5,294 code lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/src/) | raw lines | code lines | read calls |
|---|---|---|---|
| app/api/community/entities/[entityId]/threads/route.ts | 123 | 104 | 1 |
| app/api/community/groups/route.ts | 130 | 108 | 1 |
| app/api/community/groups/[id]/invitations/route.ts | 94 | 75 | 1 |
| app/api/community/groups/[id]/invite-candidates/route.ts | 92 | 75 | 1 |
| app/api/community/groups/[id]/invite/route.ts | 128 | 102 | 1 |
| app/api/community/groups/[id]/join/route.ts | 97 | 71 | 1 |
| app/api/community/groups/[id]/members/route.ts | 150 | 117 | 1 |
| app/api/community/groups/[id]/mute/route.ts | 3 | 2 | 1 |
| app/api/community/groups/[id]/settings/route.ts | 132 | 114 | 1 |
| app/api/community/groups/[id]/star/route.ts | 3 | 2 | 1 |
| app/api/community/invitations/[id]/accept/route.ts | 90 | 69 | 1 |
| app/api/community/invitations/[id]/decline/route.ts | 58 | 50 | 1 |
| app/api/community/invitations/[id]/revoke/route.ts | 86 | 66 | 1 |
| app/api/community/moderation/reports/route.ts | 278 | 225 | 1 |
| app/api/community/moderation/reports/[id]/route.ts | 415 | 338 | 1 |
| app/api/community/notifications/route.ts | 118 | 92 | 1 |
| app/api/community/notifications/[id]/route.ts | 96 | 81 | 1 |
| app/api/community/notifications/counts/route.ts | 62 | 51 | 1 |
| app/api/community/posts/route.ts | 408 | 325 | 1 |
| app/api/community/posts/[id]/route.ts | 261 | 225 | 1 |
| app/api/community/posts/[id]/replies/route.ts | 266 | 225 | 1 |
| app/api/community/posts/[id]/signoff/route.ts | 81 | 66 | 1 |
| app/api/community/profile/route.ts | 67 | 51 | 1 |
| app/api/community/profile/verify/route.ts | 99 | 85 | 1 |
| app/api/community/search/route.ts | 177 | 140 | 1 |
| app/api/community/signoff/[id]/decide/route.ts | 201 | 170 | 1 |
| app/api/community/signoff/[id]/withdraw/route.ts | 69 | 57 | 1 |
| app/community/page.tsx | 508 | 419 | 1 |
| app/community/[slug]/page.tsx | 273 | 193 | 1 |
| app/community/browse/page.tsx | 239 | 159 | 1 |
| app/community/directory/page.tsx | 134 | 99 | 1 |
| app/community/discover/page.tsx | 75 | 61 | 1 |
| app/community/moderation/page.tsx | 73 | 49 | 1 |
| app/community/profile/page.tsx | 54 | 42 | 1 |
| lib/community/antitrust.mjs | 181 | 115 | 1 |
| lib/community/entity-binding.mjs | 35 | 26 | 1 |
| lib/community/group-member-prefs.mjs | 17 | 11 | 1 |
| lib/community/identity.mjs | 281 | 123 | 1 |
| lib/community/index.mjs | 25 | 22 | 1 |
| lib/community/member-pref-route.mjs | 60 | 46 | 1 |
| lib/community/organisation-key.mjs | 95 | 55 | 1 |
| lib/community/organisation-salt.ts | 20 | 15 | 1 |
| lib/community/profile-policy.mjs | 109 | 72 | 1 |
| lib/community/rooms.ts | 140 | 95 | 1 |
| lib/community/search-merge.ts | 11 | 11 | 1 |
| lib/community/shell-context.ts | 172 | 151 | 1 |
| lib/community/viewer.ts | 24 | 22 | 1 |
| app/api/listings/cursor/route.ts | 144 | 63 | 1 |
| app/api/listings/rest/logic.ts | 47 | 34 | 1 |
| app/api/listings/rest/route.ts | 147 | 69 | 1 |
| app/api/notices/logic.ts | 34 | 21 | 1 |
| app/api/notices/resolve-watched-entities.ts | 84 | 54 | 1 |
| app/api/notices/route.ts | 96 | 45 | 1 |
| lib/notifications/dispatch.ts | 55 | 41 | 1 |
| lib/notifications/seed-fallback-flag.ts | 136 | 95 | 1 |
| TOTAL | 7053 | 5294 | 55 |

Files not read whole: none. Test files: none exist on this tree (`git ls-files 'fsi-app/src/**/*.npmtest.mjs' 'fsi-app/src/**/*.test.mjs'` returns 0 [CONFIRMED]), so the A1/A3 rows that cite community-identity-routes.npmtest (15), reviewer-gate.npmtest (11), signoff-decide-route.npmtest (5), antitrust.test (22), identity.test (33) and the rest describe proofs that were removed by the CLEAN cuts; nothing in scope is proven by an executing test today.

Consumer evidence: a symbol census (`grep -rlw <symbol>` over fsi-app/src, scripts, supabase and .github/workflows, ts tsx mjs js sql, excluding the defining file and the barrel), then the import lines by hand for every symbol claimed dead; route callers are the `/api/community/...`, `/api/listings/...` and `/api/notices` literals under src with the HTTP method read from the call site.

## 2. Module verdict

**REFACTOR AND PORT.** Every Community responsibility is kept and the security rules of 2026-10-08 (SEC-5, SEC-6, DFIX-1, ROUTES-1) are kept as behaviour. The code is not: 27 handlers repeat the same guard, UUID check (17 copies), JSON parse and group-role pre-read; three copies of the post row shape and its select string; a moderation pair that stores a report's body, action and notes inside the `reason` text column because the table has no columns for them; a "ban" that only deletes a membership row, so the banned author re-joins a public group with one click; a notification writer that ignores the recipient's preferences and group mutes; seven pages that each re-implement the sign-in check and the shell frame; and 18 reads that drop their error. Three directories in scope are not Community: the list remainder route (one live route, one dead), the notices feed and the notifications writer (already disposed by P1-07 capture.md, this register agrees).

**Current code LOC: 5,294** (awk over the 55 files, table above). **Estimated clean LOC: about 2,680** (plus 40 counted by P1-07 for dispatch and the seed-fallback flag). Arithmetic (section 8 table, per planned file): features/community/lib 660 (identity 90, antitrust 30, entity-binding 20, profile policy 60, org key 50, rooms 70, rooms view model 150, shell context 100, http helpers 40, post shape 50) + features/community/api 1,395 (groups 70, settings 55, join 40, members 70, prefs 30, group invitations 120, invitation respond 90, posts 130, post 60, replies 80, entity threads 50, sign-off 120, moderation 200, notifications 100, profile 90, search 90) + features/community/pages 465 (rooms 110, group 100, browse 80, directory 60, discover 35, moderation 25, profile 25, page frame 30) + list remainder 70 + notices 90 = 2,680. Community proper (api, pages, lib) goes from 4,872 to 2,520 code lines (52 percent). Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Responsibilities (12), with the files that carry them today:

1. Request guard for every community route: cookie-or-bearer user, per-user limiter (`requireCommunityRoute`, P1-01's; called at 36 sites) [CONFIRMED grep].
2. Groups: create a member-owned vertical group with its owner admin row (groups/route.ts), rename, describe, change privacy (settings), self-join a public group (join), roster and leave with the last-admin guard (members), star and mute (star, mute, member-pref-route.mjs, group-member-prefs.mjs).
3. Group invitations: list pending, candidate search, invite, accept, decline, revoke (groups/[id]/invitations, invite-candidates, invite; invitations/[id]/accept, decline, revoke).
4. Threads and replies: list and create top-level threads bound to spine entities, edit and delete a post, list and write replies one level deep, threads by entity across groups (posts/*, entities/[entityId]/threads, entity-binding.mjs).
5. Identity and anonymity: cross-organisation identity through the `community_identity` rpc, own row through `my_profile`, per-user default and per-post anonymity, the anonymous author id withheld from everyone but the author and a platform admin (identity.mjs, viewer.ts; every read route).
6. Member profile and corporate-email verification: declare org type, role, sector, region, default anonymity; verify a corporate domain into `verified` and a pseudonymous `organisation_key` (profile/route.ts, profile/verify/route.ts, profile-policy.mjs, organisation-key.mjs, organisation-salt.ts).
7. Antitrust write-time guard: a post that declares a commercially sensitive field is refused (antitrust.mjs via posts/route.ts:309).
8. Verifier sign-off: request, decide (active verifier or platform admin), withdraw, stamp the post signed off (posts/[id]/signoff, signoff/[id]/decide, withdraw).
9. Moderation: file a report, list reports, act on one (dismiss, remove post, warn, mute stub, ban) behind the reviewer gate (moderation/reports, moderation/reports/[id]).
10. Notifications inbox: list with cursor and unread count, mark one, mark all, per-group counts; the writer (community/notifications/*, lib/notifications/dispatch.ts).
11. Community search: posts, groups, people (search/route.ts, search-merge.ts).
12. Pages: regional rooms home with verified ledger items placed by jurisdiction, group page, public directory by region, peer-org directory (counts only), entity discovery, moderation queue, profile (app/community/*, rooms.ts, shell-context.ts).

Not Community, in scope: the Operations and Regulations list remainder (listings/rest), a dead keyset cursor route (listings/cursor), the org-watchlist recalculation-notice feed (notices/*), the seed-fallback integrity flag (seed-fallback-flag.ts).

Key dependencies [CONFIRMED by the import and `.from(`/`.rpc(` scans]:

- Modules imported: `next/server`, `next/navigation`, `@supabase/supabase-js`, `node:crypto` (createHmac, hkdfSync, createHash); in-repo from P1-01: `@/lib/api/route-guard` (requireCommunityRoute, requireUserRoute, isRefusal), `@/lib/api/rate-limit` (rateLimitHeaders, checkRateLimit, clientKey), `@/lib/supabase-service`, `@/lib/supabase-server-client`, `@/lib/auth/admin` (isPlatformAdmin), `@/lib/auth/platform-admin-gate` (readOwnPlatformAdmin), `@/lib/api/org` (resolveOrgIdFromUserId), `@/lib/db/paginate.mjs` (assertBound, fetchAllRows); from flywheel-b (P1-10): `@/lib/propagation/aggregate-safeguards.mjs` (computeDominanceShare), `@/lib/propagation/methods/superseded-notices.ts`, `@/lib/entities/entity-id.mjs` and `entity-id-shape.mjs` (entityKindOf); from the surface layer: `@/lib/data` (getListingsOnly, getPublicListingsOnly, getResourcesOnly), `@/lib/supabase-server` (describeFallbackTrigger), `@/lib/list-pagination`, `@/lib/domains`; from the UI (P1-22, P1-17): CommunityShell, CommunityRooms, GroupHeader, PostList, HowPublishingWorks, CouncilMembersRail, BrowseGroupsGrid, PeerOrgDirectoryTable, EntityDiscoveryPanel, ModerationQueue, ProfileForm, Masthead, SectionHeader, SystemErrorBanner; `@/lib/constants` (ALL_SECTORS, VERTICALS), `@/lib/urgency/bands`, `@/lib/format`, `@/lib/render-now`, `@/lib/telemetry/capture-error` (withErrorCapture, notices only).
- Tables: community_groups, community_group_members, community_group_invitations, community_posts, community_thread_entities, community_member_profiles, community_post_signoff_requests, community_topics and community_topic_groups (read only), moderation_reports, notifications, profiles, org_memberships, entities, org_watchlist, intelligence_items, entity_refs, sources, integrity_flags (section 8 lists columns).
- RPCs: community_identity, my_profile, community_region_counts, user_is_group_admin, is_platform_admin (through readOwnPlatformAdmin); the list routes reach get_workspace_intelligence_listings_public and the org-scoped list rpcs through lib/data.
- Env vars read: COMMUNITY_ORG_SALT, WORKER_SECRET (salt fallback, organisation-salt.ts:7-19), NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (dispatch.ts:28-29, seed-fallback-flag.ts:64-65).
- External services: none. No `fetch(` to a third party, no model call, no Browserless in scope [CONFIRMED: `grep -n "fetch(\|anthropic\|browserless" ` over the 55 files returns no call]. The FREE rule of the complete build plan holds already.

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | Per-route boilerplate across the 27 handlers | 17 UUID_RE copies, 12 JSON parse blocks, 18 `community_group_members` touch points of which 9 are the same caller-role pre-read, 50 `rateLimitHeaders(` calls, 36 guard calls [CONFIRMED grep counts] | every handler re-states the same five steps and four of them drop the pre-read error | one `features/community/api/_http.ts`: `withCommunity(handler)` (guard, limiter headers), `uuidParam`, `readJson`, `groupRole(client, groupId, userId)` that surfaces its error |
| 2 | Moderation pair | 563 code lines (225 + 338) | `encodeReason` / `decodeReason` / `appendActionSentinel` / `decodeReasonAndAction` (reports/route.ts:20-39, [id]/route.ts:27-66) exist only because `moderation_reports` has no body, action or notes column; side effects run before the status update (:269-363); `mute_user` is a stub (:301-316); `ban_user` deletes a membership row with no ban record (:317-339); GET [id] has no caller | three columns (body, action_taken, action_notes) and a `community_group_bans` table (P1-11 schema), one `moderate_report(report_id, action, notes)` rpc that closes the report and applies the side effect in one transaction; drop the GET [id] handler |
| 3 | /community home page | 419 code lines | the page builds every view model inline: sign-off selection per post (:295-310), author naming (:329-382), room classification and item ranking (:394-451), its own domain-to-route and domain-to-label maps (:61-85) that duplicate lib/domains.ts, a hand-rolled band mapper (:52-58) | `features/community/lib/rooms-view.ts` (pure, testable) and a 110-line page; surface routing from lib/domains |
| 4 | Three copies of the post shape | `PostRow` interface and the 3-line select string in posts/route.ts:32-48, 176-182, 345-349; posts/[id]/route.ts:19-33, 72-83, 201-205; replies/route.ts:21-35, 99-105, 209-213; `shapePost` three times (posts:64-112, [id]:48-70, replies:40-69) | the three shapes already disagree: only posts/route.ts returns `author_identity`, so a reply and a single post have no identity block (A2-part2:L89-90 shows the badges reading fields no route returns) | one `post-shape.ts` with one select and one `shapePost` that always returns the same block |
| 5 | Comment essays | identity.mjs 281 raw vs 123 code; listings/cursor 144 vs 63; listings/rest 147 vs 69; notices/route.ts 96 vs 45; seed-fallback-flag 136 vs 95; [slug]/page.tsx 273 vs 193 | lane histories (PERF-3, PERF-12, UILISTS, RECONCILE, DFIX-1, SEC-5) told in the file; rest/route.ts:20-30 records that it reversed the cursor route and left it in place "for a later lane to reconcile or remove" | one header sentence per file; history stays in docs/ |
| 6 | Seven pages, seven sign-in and shell preambles | [slug] 1-129, browse 59-185, directory 33-40, discover 24-33, moderation 33-42, profile 19-25, home 135-139 | each calls `supabase.auth.getUser()` (a network round trip, 7 sites) where P1-01's rule is local `getClaims`; six `console.log("[perf] ...")` lines ship to production ([slug] :83, :120, :156; browse :97, :153, :182) | one `communityPage(loader)` frame: claims, redirect with return path, shell context, timing through the telemetry sink |
| 7 | Antitrust guard with an unreachable branch | antitrust.mjs 115 code lines | the only caller passes `isAggregate: false` (posts/route.ts:309; `grep -rn isAggregate` finds no other) [CONFIRMED], so kAnonymity, dominanceCap, threeMonthLag and the import of computeDominanceShare are reached by nothing; the aggregate instruments they served were dropped (migration 349 drops community_benchmark_*; A3:L269) | a 30-line guard: the sensitive-field vocabulary and the refusal; kAnonymity kept as the small-cell floor for the directory (section 8) |
| 8 | Dead cursor route | listings/cursor/route.ts 63 code | zero fetch callers (`grep -rn "api/listings"`: comments only, RegulationsLedger.tsx:47, workspace/bootstrap/route.ts:58) [CONFIRMED]; A1-part1:L389 UNWIRED | TRASH |
| 9 | Two identity paths in one route | posts/route.ts:114-146 reads `community_member_profiles` beside the `community_identity` rpc and merges them in `buildAuthorIdentityForRender` (identity.mjs:89-104) while every other route uses `authorBlockForPost` (identity.mjs:223-231) | two projections of the same author, one pre-SEC-5 and one post | one projection fed by the rpc plus the member-profile fields the rpc lacks (org type, sector) |
| 10 | Directory reads every profile on every render | directory/page.tsx:53-73 | service-role `fetchAllRows` over all of `profiles` per page view, to print counts | a `community_directory_counts()` SQL aggregate with the k floor applied in SQL (P1-11) |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, scripts, supabase and .github/workflows, excluding the defining file, and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| src/app/api/listings/cursor/route.ts:67 | GET | route handler | `grep -rn "api/listings/cursor"` outside the route: two comments (RegulationsLedger.tsx:47, workspace/bootstrap/route.ts:58), no fetch [CONFIRMED]; A1-part1:L389 UNWIRED, B-0649, B-0650 |
| src/app/api/community/posts/[id]/route.ts:85 | GET | route handler | the only callers of `/api/community/posts/${id}` send `method: "DELETE"` (Post.tsx:125, CommunityRooms.tsx:333) [CONFIRMED grep with method] |
| src/app/api/community/posts/[id]/route.ts:118 | PATCH | route handler | no `PATCH` to a posts path anywhere in components (`grep -rn PATCH components/community`: GroupHeader star and mute, GroupModals settings only) [CONFIRMED]. Edit-own-post is a feature with an API and no UI: HALF-SLICE, kept in the plan (section 8) |
| src/app/api/community/moderation/reports/[id]/route.ts:71 | GET | route handler | the only caller (ModerationActions.tsx:60) posts [CONFIRMED] |
| src/app/api/community/notifications/[id]/route.ts:5 | GET | route handler | the only caller (NotificationsList.tsx:223) posts `mark_read` [CONFIRMED] |
| src/app/api/community/notifications/[id]/route.ts:67 | `mark_unread` action | branch | no caller sends it (`grep -rn mark_unread src/components src/lib/hooks` = 0) [CONFIRMED] |
| src/lib/community/index.mjs:1-25 | the barrel | module | importers: posts/route.ts:11, profile/route.ts:4, profile/verify/route.ts:10 (3), each importable from the leaf module; its comment (:22-24) says it exists for `node --test` files, none of which exist [CONFIRMED] |
| src/lib/community/antitrust.mjs:45, 66, 109 | kAnonymity, dominanceCap, threeMonthLag (exports) and the aggregate branch :147-180 | export surface and unreachable branch | used only inside the file, reached only when `isAggregate` is true, which no caller passes [CONFIRMED] |
| src/lib/community/profile-policy.mjs:13 | MEMBER_WRITE_FORBIDDEN_COLUMNS | constant | referenced only by the barrel re-export (index.mjs:19); not used even inside the file, sanitizeMemberWrite is an allowlist [CONFIRMED] |
| src/lib/community/rooms.ts:76, 83 | ROOM_ORDER, roomByKey | exports | 0 importers [CONFIRMED]; A3:L174 agrees |
| src/lib/community/identity.mjs:33, 132-135, 144, 157, 170 | projectAuthorIdentity, COMMUNITY_IDENTITY_RPC, MY_PROFILE_RPC, IDENTITY_IDS_PER_CALL, idWithheldForAnonymity, authorIdForViewer (exports) | export surface | every external hit is a comment (identity-format.ts:8, api-client.ts:84, threads route :86, posts routes :63 and :47) [CONFIRMED]; used inside the file. effectiveAnonymous stays live (community/page.tsx:333, posts/route.ts:84) |
| src/lib/community/organisation-key.mjs:8, 34 | FREE_MAIL_DOMAINS, isFreeMailDomain (exports) | export surface | used inside the file only [CONFIRMED] |
| src/lib/community/organisation-salt.ts:3, 5 | ORG_SALT_HKDF_INFO, OrganisationSaltSource (exports) | export surface | used inside the file only [CONFIRMED]; A3:L172 agrees |
| src/lib/community/entity-binding.mjs:4 | MAX_ENTITY_IDS (export) | export surface | external hits are comments (identity-format.ts:50, posts/route.ts:29) [CONFIRMED] |
| src/app/api/notices/resolve-watched-entities.ts:1, 13, 28 | EntityResolveQueryBuilder, WatchedItem, groupWatchedItemIds (exports) | export surface | used inside the file only; they existed for a deleted test [CONFIRMED] |
| src/app/api/listings/rest/logic.ts:1 | REMAINDER_PAGE_SIZE (export) | export surface | used inside the file only [CONFIRMED] |
| src/lib/community/shell-context.ts:62-65, 125-129 | community_topics read | read without writer | no code writes `community_topics` (`grep -rln community_topics src scripts`: shell-context.ts, CommunitySidebar.tsx, EntityDiscoveryPanel.tsx, all readers or comments) [CONFIRMED]; migration 368:64-65 lists the two topic tables as UNSURE; A3:L101. HALF-SLICE, not dead: the sidebar renders the (always empty) list |
| src/app/api/community/notifications/counts/route.ts:37, 45 | mention counts | branch with no writer | no dispatcher sends `kind: "mention"` (`grep -rn 'kind: "mention"'` = 0) [CONFIRMED]; the DB CHECK allows it (359:167). HALF-SLICE: @mentions were never built |

Vendor directory remnants: none in code. The vendor family was created by migration 007 and dropped by 181; the forum layer by 192; the placeholder layer (case studies, taxonomy) by 335; `linked_vendor_ids` and `linked_forum_thread_ids` by 368 [CONFIRMED: `grep -l "DROP TABLE" ` per migration; `grep -rn -i vendor` over the 55 files = 0]. What remains of the retired designs: the `promote` value in `notifications_kind_check` (359:167, dispatch.ts:4-5 says the drop is owed), `notification_preferences` (032) whose toggles no writer consults (section 8), `community_posts.referenced_intelligence_item_ids` (104), written from the browser by CommunityRooms.tsx:412 and read by community/page.tsx:225, and HowPublishingWorks.tsx telling customers to PROMOTE TO PUBLIC (A2-part2:L76, P1-22's file).

Not dead, verified live this session: all 27 route files have a caller (the 33 literal call sites listed in section 7); `buildAuthorIdentityForRender` and `resolveEffectiveAnonymous` (posts/route.ts:9, :330); `REGIONS` (ProfileForm.tsx:25, NoWorkspaceLanding.tsx:11, create-org.mjs:2); `ORG_TYPES` (ProfileForm.tsx:24); `validateEntityIds` (api-client.ts:1, identity-format.ts:2); `COMMUNITY_REGIONS` (browse/page.tsx:4); `isRoomMember` and `RoomKey` (CommunityRooms.tsx:45-46); `NotificationKind` (NotificationsList.tsx); `recordSeedFallbackFlag` and `SeedFallbackTrigger` (data.ts, supabase-server.ts).

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| UUID regex | 17 files under app/api/community and lib/community (member-pref-route.mjs:6 and 16 routes) [CONFIRMED `grep -rl "const UUID_RE"`] | P1-01's `isUuid()` in core/db |
| caller's role in a group | invitations:34, invite-candidates:28, invite:44, members DELETE:103, settings:84-99, revoke:49, moderation reports POST:245, member-pref-route:37 | `groupRole(client, groupId, userId)` returning `{role} | null` or throwing on error |
| JSON body parse with 400 | 12 handlers | `readJson(request)` |
| PostRow + select string + shapePost | posts/route.ts, posts/[id]/route.ts, replies/route.ts (section 3 rank 4) | `post-shape.ts` |
| SignoffRow + SELECT_COLS | posts/[id]/signoff:8-21, signoff/[id]/decide:15-28, withdraw:8-21 | one type and one column list beside the sign-off handlers |
| region vocabulary | profile-policy.mjs:4 `REGIONS` (codes); shell-context.ts:5-14 `COMMUNITY_REGIONS` (codes plus labels); rooms.ts:23-72 (room keys that fold HK into APAC and rename MEA to MEAF); NoWorkspaceLanding.tsx:397-406 labels (workspace.md:166) | one `{code, label}` table in profile-policy; rooms keep their fold as a mapping over it |
| org type vocabulary | identity.mjs:1-11 ORG_TYPES; directory page uses `profiles.affiliation_type` instead (directory/page.tsx:20, :80) | ORG_TYPES only, read from community_member_profiles.org_type |
| "verified" | community_member_profiles.verified (corporate email, verify route) vs profiles.verifier_status = 'active' (sign-off verifier; decide route :111-121, community page :500, directory :85) | two named concepts in the port: `emailVerified` and `isVerifier`; the directory counts the one its label says |
| identity reads | community_identity rpc (all read routes) and a direct `community_member_profiles` read in posts/route.ts:133-137 | section 3 rank 9 |
| service-role client construction | dispatch.ts:26-37 builds its own `createClient` beside supabase-service.ts (A4d:L56 B-DUP-1) | P1-07 capture.md section 8 already folds it into the shared client; agreed |
| entity candidate read | [slug]/page.tsx:143-154 and discover/page.tsx:35-46, byte-equivalent | one `loadEntityCandidates(client, query)`; escape the ilike wildcards (both pass `%${entityQuery}%` unescaped) |
| oldest-membership rule | shell-context.ts:148-153 reads `org_memberships ... limit(1)` with no order, so the employer shown is not the oldest membership the rest of the app treats as active (P1-01 auth-db.md section 8 ruling, org.ts:17-19) | P1-01's `resolveMembership` |
| length limits | group name 120 at create (groups/route.ts:7) vs 80 at rename (settings:8); description 1,000 vs 600 | one constant pair in the group module; the database CHECK decides (owed to P1-11 if absent) |
| relative-route and surface label maps | community/page.tsx:61-85 beside lib/domains.ts | lib/domains plus one surface-route helper |

Over-abstraction: `createMemberPrefTogglePatchHandler` (member-pref-route.mjs) is a factory for two three-line route files; one `prefs` handler taking the field from the path is simpler. `EntityResolveClient`, `EntityResolveQueryBuilder` (resolve-watched-entities.ts:1-10) and the casts at notices/route.ts:71, :80 exist for injected test clients that no longer exist. `loadGroupPageData` and `loadBrowsePageData` exist only to host `Date.now()` for perf logs (their own comments, [slug]:28-37, browse:49-58).

## 6. Non-essential artifacts

None in scope: no fixtures, mock data or generated inventories. The FREE_MAIL_DOMAINS list (organisation-key.mjs:8-23) and the room jurisdiction token lists (rooms.ts:23-72) are live vocabulary. The perf `console.log` lines (section 3 rank 6) and the RECOMMENDED_ACTIONS copy in seed-fallback-flag.ts:16-32 are operational noise that the port drops.

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's grep) | note. Route consumers are the fetch sites with the method used. Dropped-error findings cite the BACKLOG row (section 9 of the backlog file carries the STATUS cell written by this lane).

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| app/api/community/entities/[entityId]/threads/route.ts | 1-123 (123) | GET threads bound to an entity across groups, RLS via community_thread_entities (293), cursor, anonymous author id withheld | REFACTOR AND PORT | 50 | 1: api-client.ts getEntityThreads (EntityDiscoveryPanel) | identity rpc failure only warns (:91), then every author reads as anonymous (fail closed by idWithheldForAnonymity); RLS not attacked (B-0832) |
| app/api/community/groups/route.ts | 1-130 (130) | POST create vertical group: RLS insert with slug retry (23505, 3 tries), service-role owner-admin row, rollback delete | REFACTOR AND PORT | 70 | 1: CommunityRooms.tsx (create modal) | rollback delete result unchecked :119 (B-0029); two writes on two clients, not one transaction: a `create_group_for_self` rpc (P1-11) |
| app/api/community/groups/[id]/invitations/route.ts | 1-94 (94) | GET pending invitations (admin or moderator), invitee names via community_identity, can_revoke | REFACTOR AND PORT | 40 | 1: GroupModals.tsx | role read drops error :34, a DB failure answers 403 (B-0023) |
| app/api/community/groups/[id]/invite-candidates/route.ts | 1-92 (92) | GET admin-only name search excluding members, pending invitees and self (max 12) | REFACTOR AND PORT | 40 | 1: GroupModals.tsx | drops error :28 and both exclusion reads :51-62 (B-0024): a failed exclusion read offers existing members as candidates |
| app/api/community/groups/[id]/invite/route.ts | 1-128 (128) | POST admin-only invitation (RLS insert), 409 duplicate, 404 unknown user, invite notification | REFACTOR AND PORT | 40 | 1: GroupModals.tsx | role read drops error :44 (B-0025); notification failure logged, not fatal (:107-122) |
| app/api/community/groups/[id]/join/route.ts | 1-97 (97) | POST self-join of a public group: RLS read, privacy check, service-role member insert, clear pending invitation | REFACTOR AND PORT | 40 | 2: GroupCard.tsx, CommunityRooms.tsx | no UUID check (:15, any string reaches the query); existing-member read drops error :45; invitation clear unchecked :86-91 (B-0026, B-0077); a banned author re-joins here (no ban record exists, row moderation [id]) |
| app/api/community/groups/[id]/members/route.ts | 1-150 (150) | GET roster (RLS: admins and moderators see all, a member sees only self), DELETE leave with the last-admin guard (409) | REFACTOR AND PORT | 70 | 1: GroupModals.tsx (DELETE; GET for the members modal) | existing read drops error :103; the admin count drops its error :120 and a null count reads as 0, so it refuses to leave (fails closed) (B-0027) |
| app/api/community/groups/[id]/mute/route.ts | 1-3 (3) | PATCH muted via the factory | REFACTOR AND PORT | into prefs 30 | 1: GroupHeader.tsx | the muted flag changes nothing: dispatch never reads it (row dispatch.ts) |
| app/api/community/groups/[id]/settings/route.ts | 1-132 (132) | PATCH name, description, privacy (owner, admin or moderator) | REFACTOR AND PORT | 55 | 1: GroupModals.tsx | both pre-reads drop errors :84-99 (B-0028), so a DB failure answers 404 "Group not found"; an RLS-refused update returns `ok: true, group: null` (:117-131) |
| app/api/community/groups/[id]/star/route.ts | 1-3 (3) | PATCH starred via the factory | REFACTOR AND PORT | into prefs | 1: GroupHeader.tsx | |
| app/api/community/invitations/[id]/accept/route.ts | 1-90 (90) | POST invitee accepts: RLS status update, service-role member insert, roll back on failure | REFACTOR AND PORT | 30 (with an rpc) | 1: CommunityShell.tsx:300 (dynamic action) | rollback unchecked :79-82 (B-0030); two writes, two clients: an `accept_group_invitation` rpc (P1-11), the same shape as P1-01's org `accept_invitation` |
| app/api/community/invitations/[id]/decline/route.ts | 1-58 (58) | POST invitee declines | REFACTOR AND PORT | 25 | 1: CommunityShell.tsx:300 | read drops error :23, a DB failure answers 404 (B-0031) |
| app/api/community/invitations/[id]/revoke/route.ts | 1-86 (86) | POST inviter or group admin revokes; service-role write because no RLS policy covers the inviter | REFACTOR AND PORT | 35 | 1: GroupModals.tsx | reads drop errors :28 and :49 (B-0032); the role read fails closed to 403 |
| app/api/community/moderation/reports/route.ts | 1-278 (278) | GET reports (RLS: own reports, groups the caller moderates, all for a platform admin), posts hydrated in one bounded `.in()`; POST file a report (members only) | REFACTOR AND PORT | into moderation 200 | 3: ModerationQueue.tsx, ReportPostMenu.tsx, ModerationActions.tsx | body packed into `reason` (:20-39); the group filter runs after `.limit()` (:74-81, :173-179), so a group-scoped page is short while more exist (B-1884, now [CONFIRMED read]); membership read drops error :245 (B-0034) |
| app/api/community/moderation/reports/[id]/route.ts | 1-415 (415) | GET one report (no caller); POST act: RLS read, reviewer gate (`user_is_group_admin` or platform admin, before any side effect; ROUTES-1), 409 on a closed report, side effects, close with an `||action=` suffix in `reason` | REFACTOR AND PORT | into moderation | 1: ModerationActions.tsx (POST) | post reads drop errors :124, :220 (B-0033); side effects run before the close (:269-363) and the close `.eq("status","open")` has no select (:351-360), so a raced second action re-runs the side effect and reports ok; `ban_user` deletes the membership only (:324-328): no ban table exists (`grep -l "community_group_bans\|community_bans"` over migrations = 0) [CONFIRMED], so the user re-joins a public group through join; `mute_user` sends a warning (Phase D stub) |
| app/api/community/notifications/route.ts | 1-118 (118) | GET list (limit 100, before cursor, unread_only) with exact count and unread head count; POST mark_all_read | REFACTOR AND PORT | into notifications 100 | 3: NotificationsList.tsx, useUnreadNotificationsCount.ts (polled every 60 s from TopBar on every route, E1 finding 1) | the anonymous 401 on /privacy is the TopBar's, not this route's (A2-part7:L23) |
| app/api/community/notifications/[id]/route.ts | 1-96 (96) | GET one (no caller); POST mark_read or mark_unread | REFACTOR AND PORT | into notifications | 1: NotificationsList.tsx (POST mark_read) | no UUID check (:12-18): a malformed id reaches Postgres and returns 500 [HYPOTHESIS: 22P02 on a uuid column]; GET and mark_unread are dead (section 4) |
| app/api/community/notifications/counts/route.ts | 1-62 (62) | GET per-group unread and mention counts | REFACTOR AND PORT | into notifications | 1: CommunitySidebar.tsx:80 | reads every unread row with no limit (:17-21) [CONFIRMED read]; past the PostgREST row cap the counts are short (B-1885, the cap value is a HYPOTHESIS); mention counts have no writer (section 4); port: a grouped count in SQL |
| app/api/community/posts/route.ts | 1-408 (408) | GET threads of a group (limit 50, cursor) with identity and member-profile projection; POST thread: validation, antitrust refusal, 1-10 spine entities, resolved anonymity, RLS insert, entity links with compensating delete | REFACTOR AND PORT | 130 | 4: CommunityRooms.tsx, PostList.tsx, api-client.ts, Post.tsx | member-profile read drops error :133; own default_anonymous read drops error :325 and falls back to "named" (the stored flag is then false, but the read path still withholds the name through the rpc's per-user flag, identity.mjs:144-146) [CONFIRMED read]; compensating delete unchecked :385 (B-0035, B-0078) |
| app/api/community/posts/[id]/route.ts | 1-261 (261) | GET one post (no caller), PATCH author edit (no caller), DELETE (author or group admin by RLS) | REFACTOR AND PORT | 60 | 2: Post.tsx, CommunityRooms.tsx (DELETE) | DELETE is a hard delete (no soft-delete column); PATCH kept as the edit feature with no UI |
| app/api/community/posts/[id]/replies/route.ts | 1-266 (266) | GET replies oldest first, POST reply one level deep, reply notification to the parent author | REFACTOR AND PORT | 80 | 3: Post.tsx, ReplyComposer.tsx, CommunityRooms.tsx | the `before` parameter filters `.gt` (:118), it is an after-cursor under a before name; a reply stores `anonymous=false` (no flag sent, :202-208) and relies on the rpc's per-user flag at read |
| app/api/community/posts/[id]/signoff/route.ts | 1-81 (81) | POST open a sign-off request (RLS signoff_insert, one open per post) | REFACTOR AND PORT | into sign-off 120 | 1: CommunityRooms.tsx | |
| app/api/community/profile/route.ts | 1-67 (67) | GET own member profile, PUT upsert of org type, role, sector, region, default anonymity (allowlist) | KEEP AS-IS | 45 | 1: api-client.ts (ProfileForm) | the page that hosts it has no inbound link (A1-part2:L159 UNWIRED) |
| app/api/community/profile/verify/route.ts | 1-99 (99) | POST corporate-email verification: email from claims, free-mail refused, HMAC organisation_key, service-role write of the four verification columns; the key is never returned | REFACTOR AND PORT | 45 | 1: api-client.ts | getClaims error dropped (:19): a claims failure reads as "no email on file" (400); any confirmed corporate address verifies, the domain owner is not asked (by design: "a corporate domain on the account IS the verification", organisation-key.mjs:56-57) |
| app/api/community/search/route.ts | 1-177 (177) | GET posts (title, body), groups (name, description), people (rpc), one ilike per column, unioned (CF-SEC-15) | KEEP AS-IS | 90 | 1: CommunitySearchResults.tsx | group-name read drops error :115 (shows "Unknown group") |
| app/api/community/signoff/[id]/decide/route.ts | 1-201 (201) | POST verifier decision (signed_off, declined): role pre-read, RLS update of a pending request, service-role stamp of the post | REFACTOR AND PORT | into sign-off | 1: CommunityRooms.tsx | verifier_status read drops error :111 (fails closed to 403 unless admin); follow-up read drops error :154 (B-0036); decision and stamp are two writes on two clients; never exercised live (B-0079, HYPOTHESIS kept) |
| app/api/community/signoff/[id]/withdraw/route.ts | 1-69 (69) | POST requester withdraws a pending request (RLS signoff_withdraw_own, 154) | KEEP AS-IS | into sign-off | 1: CommunityRooms.tsx | |
| app/community/page.tsx | 1-508 (508) | /community: regional rooms, room threads with sign-off state, vertical groups, verified ledger items placed in rooms, same-org presence roster | REFACTOR AND PORT | 110 + 150 in rooms-view | sidebar and 7 other src files (A1-part2:L158) | membership, posts and roster errors dropped in one Promise.all (:211-242), sign-off read drops error (:275) (B-0092); `padding: "20px 40px 0"` (:482) and CommunityRooms' fixed 4-column grid at 375 px (A2-part2:L65, HYPOTHESIS, not rendered); reads `getListingsOnly()` (system to Community, the allowed direction) |
| app/community/[slug]/page.tsx | 1-273 (273) | group page: RLS group read (notFound for a private non-member), shell, membership, default anonymity, 60 entity candidates | REFACTOR AND PORT | 100 | 5 src files (A1-part2:L153) | group read drops error :62 and membership read drops error :114, both end in notFound (a DB failure shows 404); three perf logs; the grid comment (:231-233) promises a collapse under 880 px that an inline style cannot do [CONFIRMED read: no media query in scope or in a class]; B-0852 RLS not attacked |
| app/community/browse/page.tsx | 1-239 (239) | public groups by region with the caller's member and pending-invite state | REFACTOR AND PORT | 80 | 3 src files | groups read drops error :83 (renders "No public groups"); membership and invite reads drop errors :152-158; three perf logs; region defaults to EU |
| app/community/directory/page.tsx | 1-134 (134) | peer-org directory: counts by org type and region, by sector | REFACTOR AND PORT | 60 | 1: CommunitySidebar.tsx | reads all of `profiles` with the service role per render (:60-69); counts `profiles.affiliation_type` and `verifier_status`, not the community member profile the verify route writes (HALF-SLICE); no small-cell floor, so a cell of one names one member's type, region and sector to every signed-in user [HYPOTHESIS: re-identification risk depends on member counts, not measured]; a read failure renders "0 members counted" (:70-75) |
| app/community/discover/page.tsx | 1-75 (75) | entity discovery candidates and the client panel | REFACTOR AND PORT | 35 | 1: CommunitySidebar.tsx | duplicate entity read (section 5) |
| app/community/moderation/page.tsx | 1-73 (73) | moderation queue page | KEEP AS-IS | 25 | 1: CommunityRooms.tsx | |
| app/community/profile/page.tsx | 1-54 (54) | profile form page | KEEP AS-IS | 25 | 0 inbound links (A1-part2:L159 UNWIRED) | the port links it from the Community shell |
| lib/community/antitrust.mjs | 1-181 (181) | sensitive-field vocabulary and the write-time refusal; k-anonymity, dominance cap, three-month lag | REFACTOR AND PORT | 30 | 1: posts/route.ts (via the barrel) | aggregate branch unreachable (section 4); P1-10 flywheel-b.md moves computeDominanceShare here, this register does not need it (section 8 gap 1) |
| lib/community/entity-binding.mjs | 1-35 (35) | validateEntityIds: 1-10 well-formed `cl:<kind>:<16 hex>` ids | KEEP AS-IS | 20 | 3: posts/route.ts, api-client.ts, identity-format.ts | client and server share it |
| lib/community/group-member-prefs.mjs | 1-17 (17) | boolean body validator for star and mute | REFACTOR AND PORT | into prefs | 1: member-pref-route.mjs | |
| lib/community/identity.mjs | 1-281 (281) | R8.7 projection, per-user and per-post anonymity, anonymous author id rule, identity rpc loader (chunks of 200), my_profile loader | REFACTOR AND PORT | 90 (with viewer.ts) | 12 importers: posts, replies, post, threads, search, members, invitations, invite-candidates routes, community page, CouncilMembersRail, viewer.ts | 158 comment lines; two projections (section 3 rank 9); the loader never throws and returns the error string (:243-267), callers warn and render fail-closed |
| lib/community/index.mjs | 1-25 (25) | barrel | TRASH | 0 | 3 routes (section 4) | |
| lib/community/member-pref-route.mjs | 1-60 (60) | PATCH factory for star and mute on the caller's own member row | REFACTOR AND PORT | into prefs | 2: mute, star routes | UNPROVEN (B-0855) |
| lib/community/organisation-key.mjs | 1-95 (95) | free-mail list, domain parse, corporate check, HMAC-SHA256 organisation key | KEEP AS-IS | 35 | 1: verify route (via barrel) | |
| lib/community/organisation-salt.ts | 1-20 (20) | salt: COMMUNITY_ORG_SALT (16+ chars) or HKDF from WORKER_SECRET | KEEP AS-IS | 15 | 1: verify route | rotating WORKER_SECRET without COMMUNITY_ORG_SALT changes every future key, so keys derived before and after stop matching [HYPOTHESIS: no rotation procedure found]; the port requires COMMUNITY_ORG_SALT and drops the fallback, or records the rotation rule |
| lib/community/profile-policy.mjs | 1-109 (109) | REGIONS, sanitizeMemberWrite (allowlist), projectOwnProfile | REFACTOR AND PORT | 60 (with ORG_TYPES and labels) | 4: profile route, ProfileForm, NoWorkspaceLanding, create-org.mjs | MEMBER_WRITE_FORBIDDEN_COLUMNS dead |
| lib/community/rooms.ts | 1-140 (140) | seven regional rooms, slugs, jurisdiction tokens, classifier, membership predicate | REFACTOR AND PORT | 70 | 2: community page, CommunityRooms.tsx | `normJur` (:88-94) cuts any token with a dash at index 1 or 2, so "in-..." or "id-..." slugs also fold to ISO prefixes; ROOM_ORDER and roomByKey dead |
| lib/community/search-merge.ts | 1-11 (11) | unionByRecency | KEEP AS-IS | into search | 1: search route | |
| lib/community/shell-context.ts | 1-172 (172) | memberships, pending invitations, owned topics, region counts, footer identity, admin bit; throws on any read failure | REFACTOR AND PORT | 100 | 6 pages | every read checks its error (:71-74, :147, :154) [CONFIRMED read], so B-0048 and B-0222 are REFUTED on this tree; the employer read has no order (:148-153), not the oldest membership (section 5); `getUser`-level user is passed in by each page |
| lib/community/viewer.ts | 1-24 (24) | the viewer and its lazily read admin bit | REFACTOR AND PORT | into identity | 4 routes | UNPROVEN (B-0856) |
| app/api/listings/cursor/route.ts | 1-144 (144) | GET keyset regulations page (PERF-12) | TRASH | 0 | 0 callers | B-0649, B-0650 |
| app/api/listings/rest/logic.ts | 1-47 (47) | fetchRemainderPaged: 1,000-row pages until short page, cap or error | KEEP AS-IS | 30 | 1: rest route | the 1,000-row page is the PostgREST cap the walk exists to defeat (A1-part1:L76) |
| app/api/listings/rest/route.ts | 1-147 (147) | GET remainder for Operations (org-scoped through cookies) and Regulations (public rpc), trimmed rows, weak ETag, private max-age 300; IP limiter, no user guard | REFACTOR AND PORT | 40 | 3: RegulationsLedger.tsx:100, OperationsLedger.tsx:227, MarketIntelLedger.tsx:99 (a `void`ed function that never runs, :104) | unauthenticated by design (A1-part1 guard sweep lists it with the eight IP-limited routes); CLAUDE.md's public-route exception list names only /api/version, so the exception is undocumented [CONFIRMED read of fsi-app/.claude/CLAUDE.md "Public route exception"]; owner: the list surfaces (id owed, section 8) |
| app/api/notices/logic.ts | 1-34 (34) | since-param resolution (30-day default), entity labels and hrefs | KEEP AS-IS | 20 | 1: notices route | href points at `/entities/<id>` (:32), and no such route exists: `ls src/app` has no entities directory and next.config has no `entities` rewrite [CONFIRMED]; every notice link 404s, the port links to the item or drops the href |
| app/api/notices/resolve-watched-entities.ts | 1-84 (84) | org_watchlist rows to entity ids (instrument_entity_id, entity_refs, sources.organisation_entity_id) | REFACTOR AND PORT | 40 | 1: notices route | every read error is swallowed with no log (:58, :66, :76) |
| app/api/notices/route.ts | 1-96 (96) | GET org-watchlist recalculation notices since a date | REFACTOR AND PORT | 30 | 1: NoticesRail.tsx:75 (authedFetch) | `.catch(() => null)` on the org read (:56) turns a DB failure into "no org" and an empty feed; label read drops error :86 (B-0037); empty live (B-1886, HYPOTHESIS kept; P1-10 flywheel-b.md agrees) |
| lib/notifications/dispatch.ts | 1-55 (55) | insert one notifications row with the service role; never throws | REFACTOR AND PORT (P1-07 capture.md section 7 row; agreed) | 25 (counted by P1-07) | 6: invite, replies, moderation [id] routes; workspace/overrides route, item-collab-route.ts; NotificationsList.tsx (type) | ignores `notification_preferences` (032: on_mention, on_reply_in_my_threads, on_invite) and `community_group_members.muted` [CONFIRMED: dispatch inserts unconditionally :46-50; 032 has no trigger on notifications, its comment :124-128 says enforcement is application-level]; HALF-SLICE for P1-07 to close in the port (section 8 interface) |
| lib/notifications/seed-fallback-flag.ts | 1-136 (136) | seed-fallback integrity flag | REFACTOR AND PORT (into P1-07's error sink; agreed) | 15 (counted by P1-07) | 2: data.ts, supabase-server.ts | not a notification; B-0277 and B-0878 carry P1-07's STATUS already |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/features/community/lib/identity.ts | identity.mjs 1-281; viewer.ts 1-24 | ORG_TYPES; the one author projection (name, company, role, sector, region, verified, anonymous) fed by the community_identity rpc and the member-profile fields; per-post and per-user anonymity; `authorIdForRow`; `communityViewer`; the identity and my_profile loaders | 90 |
| src/features/community/lib/antitrust.ts | antitrust.mjs 13-23, 36-53, 131-145 | SENSITIVE_FIELDS, `refuseSensitivePost(field)`, `kAnonymity` (used by the directory floor) | 30 |
| src/features/community/lib/entity-binding.ts | entity-binding.mjs 1-35 | validateEntityIds, shared by client and server | 20 |
| src/features/community/lib/profile-policy.ts | profile-policy.mjs 1-109; shell-context.ts 5-14 | `{code,label}` regions, sanitizeMemberWrite, projectOwnProfile | 60 |
| src/features/community/lib/org-key.ts | organisation-key.mjs 1-95; organisation-salt.ts 1-20 | free-mail list, corporate-domain check, HMAC key, salt resolution | 50 |
| src/features/community/lib/rooms.ts | rooms.ts 1-140 | rooms, slugs, jurisdiction classifier (exact token, then ISO subdivision) | 70 |
| src/features/community/lib/rooms-view.ts | community/page.tsx 44-120, 246-451 | room view models: sign-off selection, author naming, ledger items per room, themes, roster presence | 150 |
| src/features/community/lib/shell-context.ts | shell-context.ts 16-172 | shell context; employer through P1-01 resolveMembership | 100 |
| src/features/community/api/_http.ts | 17 UUID_RE copies; 12 JSON blocks; 9 role pre-reads; member-pref-route.mjs 16-60 | `withCommunity`, `uuidParam`, `readJson`, `groupRole` (surfaces errors) | 40 |
| src/features/community/lib/post-shape.ts | posts/route.ts 32-112; posts/[id]/route.ts 19-83; replies/route.ts 21-69 | one select, one PostRow, one `shapePost` | 50 |
| src/features/community/api/groups.ts | groups/route.ts 7-130 | create vertical group through a `create_group_for_self` rpc (owner admin row in the same transaction) | 70 |
| src/features/community/api/group-settings.ts | settings/route.ts 8-132 | rename, describe, privacy; RLS-refused update is a 403, not `ok` | 55 |
| src/features/community/api/group-join.ts | join/route.ts 7-97 | public self-join; refuses a banned user; clears pending invitations with the error read | 40 |
| src/features/community/api/group-members.ts | members/route.ts 15-150 | roster, leave with the last-admin guard | 70 |
| src/features/community/api/group-prefs.ts | member-pref-route.mjs; group-member-prefs.mjs; star, mute routes | star and mute | 30 |
| src/features/community/api/group-invitations.ts | groups/[id]/invitations 17-94, invite-candidates 12-92, invite 9-128 | list, candidates, invite with notification | 120 |
| src/features/community/api/invitation-respond.ts | invitations/[id]/accept 10-90, decline 8-58, revoke 10-86 | accept through `accept_group_invitation` rpc, decline, revoke | 90 |
| src/features/community/api/posts.ts | posts/route.ts 148-408 | list threads, create thread (guard, binding, anonymity, insert and links in one `create_thread` rpc) | 130 |
| src/features/community/api/post.ts | posts/[id]/route.ts 118-261 | author edit, delete | 60 |
| src/features/community/api/replies.ts | replies/route.ts 71-266 | list (an honest `after` cursor), reply, notify parent author | 80 |
| src/features/community/api/entity-threads.ts | entities/[entityId]/threads/route.ts 11-123 | threads by spine entity | 50 |
| src/features/community/api/signoff.ts | posts/[id]/signoff 23-81; signoff/[id]/decide 31-201; withdraw 23-69 | request, decide (decision and stamp in one rpc), withdraw | 120 |
| src/features/community/api/moderation.ts | moderation/reports/route.ts 9-278; [id]/route.ts 12-415 | file, list (group filter in the query), act through `moderate_report` rpc (body, action, notes columns; ban record) | 200 |
| src/features/community/api/notifications.ts | notifications/route.ts, [id]/route.ts 42-96, counts/route.ts | list, mark one, mark all, grouped counts in SQL | 100 |
| src/features/community/api/profile.ts | profile/route.ts 1-67; profile/verify/route.ts 12-99 | own profile, corporate-email verification | 90 |
| src/features/community/api/search.ts | search/route.ts 29-177 | posts, groups, people | 90 |
| src/features/community/pages/frame.ts | the seven page preambles | claims, redirect with return path, shell context, timing to the sink | 30 |
| src/features/community/pages/RoomsPage.tsx | community/page.tsx 134-508 | rooms home | 110 |
| src/features/community/pages/GroupPage.tsx | [slug]/page.tsx 38-273 | group page; errors are errors, not 404 | 100 |
| src/features/community/pages/BrowsePage.tsx | browse/page.tsx 59-239 | public directory by region | 80 |
| src/features/community/pages/DirectoryPage.tsx | directory/page.tsx 32-134 | peer-org counts from a SQL aggregate with the k floor | 60 |
| src/features/community/pages/DiscoverPage.tsx | discover/page.tsx 19-75 | entity discovery | 35 |
| src/features/community/pages/ModerationPage.tsx | moderation/page.tsx 28-73 | moderation queue | 25 |
| src/features/community/pages/ProfilePage.tsx | profile/page.tsx 18-54 | profile; linked from the shell | 25 |
| src/features/lists/api/remainder.ts (list surfaces; id owed) | listings/rest/route.ts 77-147; logic.ts 1-47 | remainder for Operations and Regulations with the paged walk | 70 |
| src/features/notices/api.ts (consumer of P1-10's superseded-notices) | notices/route.ts 48-96; logic.ts 1-34; resolve-watched-entities.ts 28-84 | org-watchlist notices; errors logged, not swallowed | 90 |
| P1-07 core/notifications/dispatch.ts and the error sink | dispatch.ts; seed-fallback-flag.ts | as capture.md section 8 plans; plus the preference and mute check (interface below) | (P1-07) |

### Data model (columns actually used by this module; "unused" means no code in scope reads or writes it)

- `community_groups` (028, 155): read `id, name, slug, region, privacy, owner_user_id, description, vertical, member_count, weekly_post_count, last_active_at, created_at`; written `name, slug, region='GLOBAL', privacy='public', owner_user_id, vertical, description` (create), `name, description, privacy` (settings), delete (rollback). Unused here: none found [HYPOTHESIS: the full column list of 028 was not diffed].
- `community_group_members` (029): read `group_id, user_id, role, starred, muted, joined_at` and the group embed; written insert `(group_id, user_id, role)` with the service role (create, join, accept), update `starred | muted`, delete (leave, ban). `muted` is written and never read by any writer of notifications.
- `community_group_invitations` (029): read `id, group_id, invitee_user_id, inviter_user_id, status, created_at`; written insert, `status` to accepted, declined, revoked, pending (rollback).
- `community_posts` (030, 104, 153, 336; 348 dropped promoted_at, promoted_to_item_id, promotion_state, stance, origin_class): read `id, group_id, parent_post_id, author_user_id, title, body, created_at, last_reply_at, reply_count, attribution, promoted_from_post_id, anonymous, referenced_intelligence_item_ids, signed_off_at, signed_off_by`; written insert, `title, body` (edit), delete, `signed_off_at, signed_off_by` (service role). `attribution` and `promoted_from_post_id` are selected and returned and never written by any code in src (`grep -rn "attribution\|promoted_from_post_id" src` outside the posts routes: a type in PostComposer.tsx:50-51 and unrelated admin words) [CONFIRMED]; they are promotion-era columns the 348 drop left.
- `community_thread_entities` (293): read `thread_id, entity_id, entity_kind, created_at`; insert `(thread_id, entity_id)`.
- `community_member_profiles` (293, 336): read `user_id, org_type, role, sector, region, verified, verified_at, verification_method, default_anonymous`; written by the member `(org_type, role, sector, region, default_anonymous)`, by the service role `(verified, verified_at, verification_method, organisation_key)`. `organisation_key` is written and never read by any code (its consumer, the aggregate instruments, was dropped by 349) [CONFIRMED: `grep -rn organisation_key src` hits only verify/route.ts and the policy modules].
- `community_post_signoff_requests` (153, 154): `id, post_id, requested_by, status, verifier_id, primary_doc_url, decision_note, created_at, decided_at`, all read and written.
- `moderation_reports` (032): read and written `id, target_kind, target_id, reporter_user_id, reason, status, created_at, resolved_at, resolved_by_user_id`; `reason` carries body, action and notes (section 3 rank 2). Only `target_kind='post'` is ever written (reports/route.ts:261); the `group` branch of the filter (:177) has no writer.
- `notifications` (032, 359): read `id, kind, payload, read_at, created_at`; written insert `(user_id, kind, payload)` with the service role, update `read_at`. Kinds written: reply, invite, moderation (this scope), archive, assignment (workspace). `mention` and `promote` are allowed and never written.
- `notification_preferences` (032): never read by any writer (section 7, dispatch row); read and written by profile/NotificationPreferences.tsx and OnboardingWizard (P1-02).
- `community_topics`, `community_topic_groups` (031): read only (shell-context), no writer (section 4).
- `profiles`: read `full_name, avatar_url` (own row, shell), `verifier_status` (decide), the own row through `my_profile`, same-org `id, full_name, display_name, jurisdiction_overrides, workspace_role, verifier_status, org_id` (community page roster), every row's `affiliation_type, region, sector_overrides, verifier_status` with the service role (directory).
- `org_memberships`: `organizations(name)` (shell employer). `entities`: `entity_id, kind, canonical_name, status`. `org_watchlist`, `intelligence_items(id, instrument_entity_id)`, `entity_refs(entity_id, ref_table, ref_id)`, `sources(id, organisation_entity_id)` (notices). `integrity_flags` (seed-fallback, P1-07).
- RPCs: `community_identity(p_ids, p_query)` and `my_profile()` (372), `community_region_counts(p_privacy?)` (042), `user_is_group_admin(_group_id, _user_id)` (046; admin or moderator, C4:977), `is_platform_admin()` (375). Owed to P1-11: `create_group_for_self`, `accept_group_invitation`, `create_thread`, `decide_signoff`, `moderate_report`, `community_directory_counts`, `community_notification_counts`, and the `community_group_bans` table plus three `moderation_reports` columns.

### Every route with its guard and its RLS reliance

All 27 community route files guard with P1-01's `requireCommunityRoute` (cookie then bearer, 60 per minute per user) directly or through the prefs factory [CONFIRMED read]; listings routes use an IP limiter and no user guard; notices uses `requireUserRoute` (bearer) and the service role.

| route | methods (called) | client for writes | RLS relied on (policy names from the routes' comments and the migrations that define them) |
|---|---|---|---|
| groups | POST | caller, then service role for the owner row | community_groups_insert (028, 155: owner_user_id = auth.uid()); members INSERT is admin-only, hence the service role |
| groups/[id]/settings | PATCH | caller | community_groups_update (029, 046) |
| groups/[id]/join | POST | service role after a privacy read on the caller's client | community_groups SELECT hides private groups from non-members |
| groups/[id]/members | GET, DELETE | caller | members SELECT: self or admin/moderator; community_group_members_delete (029, 046) |
| groups/[id]/star, mute | PATCH | caller | members UPDATE self-only, starred and muted only (029:136) |
| groups/[id]/invitations | GET | caller | invitations SELECT for invitee, inviter, admin |
| groups/[id]/invite-candidates | GET | caller (rpc) | community_identity definer (372) |
| groups/[id]/invite | POST | caller | community_group_invitations_insert (admin, inviter = auth.uid()) |
| invitations/[id]/accept | POST | caller update, service-role member insert | invitee update pending to accepted |
| invitations/[id]/decline | POST | caller | invitee update |
| invitations/[id]/revoke | POST | service role after an inviter or admin check | none covers the inviter, the route authorises |
| posts | GET, POST | caller | posts SELECT by group visibility; community_posts_insert (030, 190, 293: members only); community_thread_entities_insert (293: post author) |
| posts/[id] | DELETE (GET, PATCH uncalled) | caller | community_posts_delete (030, 381: author or group admin/moderator) |
| posts/[id]/replies | GET, POST | caller | as posts |
| posts/[id]/signoff | POST | caller | signoff_insert (153, 381: member, requested_by = caller; one open per post by a partial unique index) |
| signoff/[id]/decide | POST | caller, then service-role stamp | signoff_decide (153, 375: active verifier or platform admin) |
| signoff/[id]/withdraw | POST | caller | signoff_withdraw_own (154) |
| entities/[entityId]/threads | GET | read only | community_thread_entities SELECT inherits the thread's visibility (293) |
| moderation/reports | GET, POST | caller | moderation_reports_select (032, 182, 183: reporter, group admin/moderator, platform admin); moderation_reports_insert (032, 381) |
| moderation/reports/[id] | POST (GET uncalled) | caller for delete and close; service role for notifications | reviewer gate in code before side effects (user_is_group_admin or platform admin); posts and members DELETE policies for the side effects |
| notifications, [id], counts | GET, POST | caller | notifications_select_self, notifications_update_self_read (032, 370, 381) |
| profile | GET, PUT | caller | community_member_profiles_upsert_own, _update_own (293, 336, 381); column grants keep the verification columns out (INV-137) |
| profile/verify | POST | service role | none: the route is the only writer of the verification columns |
| search | GET | read only | RLS on posts and groups; community_identity for people |

Policy existence was checked by `grep -l <policy name>` over migrations this session [CONFIRMED]; policy bodies were not re-read, and no RLS attack runs on this tree (the A1 tests are gone) [HYPOTHESIS: each policy does what the route comment says; B-0832, B-0852 stay open as attacks owed].

### Interface to other modules

- Exports offered: `communityViewer`, `authorIdForRow`, the identity loaders (to P1-22 CouncilMembersRail); `validateEntityIds`, ORG_TYPES, REGIONS with labels (to P1-22 PostComposer, ProfileForm, and P1-02 NoWorkspaceLanding, P1-01 create-org); `isRoomMember`, `RoomKey` (P1-22 CommunityRooms); the route contracts every P1-22 component calls (section 7 consumers).
- Imports needed: P1-01 auth-db (`requireUser` replacing requireCommunityRoute, `isUuid`, `rateLimitHeaders`, `getServiceSupabase`, `createSupabaseServerClient`, `readOwnPlatformAdmin`, `isPlatformAdmin`, `resolveMembership`, `fetchAllRows`, `assertBound`); P1-02 workspace (`getListingsOnly` through the surface read module, org_watchlist for notices); P1-07 capture (`dispatchNotification`, the error sink for page timings and the seed fallback; the email seam `sendInvitationEmail` is not used by group invitations today, a group invite is in-app only); P1-10 flywheel-b (`fetchSupersededNotices`, `entityKindOf`; computeDominanceShare NOT needed, gap 1); P1-11 schema (the rpcs, table and columns listed under Data model); P1-17 ui-kit (Masthead, SectionHeader, SystemErrorBanner); P1-22 community-a (every component the pages mount).
- Consumers by module: P1-22 (all 27 routes); P1-18 shell (TopBar polls `/api/community/notifications` on every route, A2-part7:L23; the port mounts the poll only for a signed-in user); the list surfaces (`/api/listings/rest`); the watchlist and detail surfaces (`/api/notices` via NoticesRail).
- LinkedIn verification: P1-01 auth-db.md section 8 trashed the unwired OAuth chain and recorded the requirement here; the operator ruling says LinkedIn verification lives in Community. In the port it is a second `verification_method` beside `corporate-email` on `community_member_profiles`, written only by the service role (INV-214 covers both methods); not built in Part 2 until the operator schedules it (workspace.md:404 records the deferral).

### Invariants this code enforces

Already in data-invariants.md: INV-137 (community member verification and post sign-off are privilege columns the owner cannot write), INV-150 (community counters by definer triggers, RLS without recursion). Appended by this lane, same commit: INV-213 (identity and anonymity at the row), INV-214 (verification and the organisation key), INV-215 (thread entity binding), INV-216 (antitrust refusal), INV-217 (a group keeps an admin; the creator is its admin), INV-218 (the moderation reviewer gate and closed reports), INV-219 (group entry by public join or the invitee's own acceptance), INV-220 (sign-off decisions), INV-221 (notification privacy and fan-out, with the preference gap named).

Properties the port must carry as tests: the anonymous-author-id rule on every read route (was community-identity-routes.npmtest, 15 cases); the reviewer gate before any side effect (was reviewer-gate.npmtest, 11 cases); the sign-off admin bit from the rpc only (was signoff-decide-route.npmtest, 5); no cross-organisation read of `profiles` from a member session; the identity rpc failure fails closed.

### Rulings the code embodies (cite)

- Community is a core surface, co-equal with the four intelligence pages, and never feeds other pages; system to Community only (dispatch ruling; community/page.tsx reads the verified ledger, nothing in scope writes outward). Tension: CommunityRooms.tsx:412 lets a browser write `referenced_intelligence_item_ids` on a post (a citation pointing outward, P1-22's file) and EntityPicker copy says threads become reachable from the four pages (A2-part2:L72) [HYPOTHESIS: no surface outside Community reads community rows; `grep -rn community_ src/lib/supabase-server.ts src/lib/data.ts` = 0 supports it].
- Community is social only (ADR-041, migration 348; dispatch.ts:3-4): no promotion of posts into intelligence; HowPublishingWorks still says otherwise (P1-22).
- R8.7 (spec 07, 2026-09-25, migration 336): identity shown by default; per-post and per-user anonymity; the verified marker survives anonymity (identity.mjs:48-49).
- SEC-5 (migration 372): no member session reads another organisation's `profiles` row; identity through `community_identity`, own row through `my_profile` (identity.mjs:106-114).
- SEC-6 (migration 375): the admin bit only from `is_platform_admin()` (decide :109-118, shell-context :137-146).
- DFIX-1 (2026-10-08): an anonymous author's id reaches only the author and a platform admin; an unresolved identity is anonymous (identity.mjs:148-187).
- ROUTES-1 (R069): the moderation reviewer gate runs before any side effect and fails closed ([id]/route.ts:228-245, 382-394).
- CF-SEC-15 (lane R21): no composed `.or()` filter with user text (search/route.ts:53-54).
- Spec 05: antitrust write-time guard (section 1, component 12); entity-bound posting (section 5 component 2, acceptance 6); peer-org directory, aggregate and pseudonymous (component 3); no direct messaging (acceptance 5, P1-22's notice).
- Browse is public groups only; a private group is entered by invitation only (browse/page.tsx:15-23, join :35-42).
- Rule 16 does not touch this module (no scrape cadence reads).

### Proof that the module works in the new tree

1. Route persona matrix (INV-076): every community handler as anonymous, non-member, member, moderator, group admin, verifier, platform admin, and a member of another organisation; expected statuses from section 7.
2. RLS attacks scripted and wired into a lane (CLAUDE.md rule 15): a member session reading another organisation's profile row; a non-member reading a private group, its posts and its thread-entity rows (B-0832, B-0852); a member writing `verified` or `organisation_key`; a reporter acting on their own report; an inviter-only update of an invitation; a banned user re-joining.
3. Unit tests, each red against a deliberately broken copy first: `authorIdForRow` across post flag, user flag, missing identity, author, admin; `validateEntityIds`; `refuseSensitivePost`; `deriveOrganisationKey` (free mail, missing salt, stable output); `sanitizeMemberWrite` drops the verification columns; `roomForJurisdiction` over the token lists and ISO subdivisions; the rooms view model's sign-off choice.
4. Database: the new rpcs each carry a rolled-back self-check (last admin, last owner analogue, ban then join, decision and stamp atomic, moderation close once).
5. Playwright at 375 px and 1440 px: /community, a group page, browse, directory, profile; post, reply, report, act, sign-off round trip.
6. `npm run typecheck` and `next build`.

### Port order

1. P1-11 schema items (rpcs, ban table, moderation columns, directory and counts aggregates).
2. features/community/lib (identity, profile policy, org key, entity binding, antitrust, rooms, post shape, _http).
3. API in dependency order: profile, groups and members, invitations, posts and replies and entity threads, sign-off, moderation, notifications, search.
4. Pages through the frame: rooms, group, browse, directory, discover, moderation, profile.
5. Hand the list remainder to the list surfaces and the notices route to its owner; delete the cursor route, the barrel and the three uncalled GET handlers with the port.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Regional rooms (7) with live verified ledger items, themes and threads per room | community/page.tsx, rooms.ts | RoomsPage, rooms-view |
| Join or leave a room, "you're here" hint by home jurisdiction | join, members DELETE, rooms.ts:113-140 | group-join, group-members |
| Presence roster of same-organisation members by home jurisdiction | community/page.tsx:384-434 | rooms-view |
| Member-created vertical groups, cross-regional | groups/route.ts, community/page.tsx:180-207 | groups.ts |
| Group settings: rename, description, public or private | settings | group-settings |
| Star and mute a group | star, mute | group-prefs (mute takes effect in dispatch) |
| Group roster with roles; leave with last-admin guard | members | group-members |
| Invite by name search; list, revoke, accept, decline invitations | invitations, invite-candidates, invite, invitations/[id]/* | group-invitations, invitation-respond |
| Public group directory by region with member and invite state | browse/page.tsx | BrowsePage |
| Threads bound to 1-10 spine entities; replies one level deep | posts, replies, entity-binding | posts, replies |
| Threads by entity across every group; follow entities | entities/[entityId]/threads, discover | entity-threads, DiscoverPage |
| Edit own post (API only, no UI today) | posts/[id] PATCH | post.ts; UI owed by P1-22 |
| Delete own post or moderate a post | posts/[id] DELETE | post.ts |
| Identity shown by default; per-post and per-user anonymity; verified marker kept | identity.mjs, posts routes | identity.ts |
| Member profile: org type, role, sector, region, default anonymity | profile route, ProfilePage | profile.ts |
| Corporate-email verification with a pseudonymous organisation key | profile/verify, organisation-key, organisation-salt | profile.ts, org-key.ts |
| LinkedIn verification (requirement only; code trashed by P1-01) | api/auth/linkedin/* | Community verification method, operator-scheduled |
| Antitrust refusal of commercially sensitive fields | antitrust.mjs, posts POST | antitrust.ts |
| Aggregated benchmark disclosure (k >= 5, 25 percent cap, 3-month lag) | antitrust.mjs aggregate branch; tables dropped by 349 | NOT PORTED as code: the instruments were removed (migration 349); the rule is kept as INV-216's wording so a future aggregate path inherits it |
| Verifier sign-off: request, decide, withdraw, citable stamp | posts/[id]/signoff, signoff/[id]/* | signoff.ts |
| Report a post with a reason and details | moderation/reports POST | moderation.ts |
| Moderation queue scoped by role; dismiss, remove, warn, mute (stub), ban | moderation/reports GET, [id] POST | moderation.ts (mute and ban real, with the schema items) |
| Notifications: list, unread count, mark one, mark all, per-group counts | notifications/* | notifications.ts |
| Notifications on reply, invite, moderation | dispatch.ts call sites | P1-07 dispatch |
| @mentions (kind allowed, never written) | counts route mention branch | NOT BUILT; recorded so it is not mistaken for a feature |
| Community search: posts, groups, people | search, search-merge | search.ts |
| Peer-org directory, counts only | directory/page.tsx | DirectoryPage on a SQL aggregate with the k floor |
| Owned topics in the sidebar (no writer) | shell-context topics read | dropped from the shell unless a writer is ruled (gap 4) |
| Shell context: memberships, invitations, region counts, footer identity, admin bit | shell-context.ts | shell-context.ts |
| Regulations and Operations list remainder after first paint | listings/rest | features/lists (list surfaces) |
| Keyset regulations cursor | listings/cursor | NOT PORTED (dead; the remainder walk replaced it) |
| Recalculation notices for the team watchlist | notices/* | features/notices |
| Seed-fallback integrity flag | seed-fallback-flag.ts | P1-07 error sink |

### Gaps and decisions for the coordinator

1. P1-10 flywheel-b.md moves `computeDominanceShare` (12 lines) to P1-22/23. This register finds no reachable caller (the aggregate branch is dead) and plans no dominance cap; the 12 lines are not needed unless an aggregate path is ruled back in.
2. Ban semantics: today `ban_user` removes the membership and records nothing; the port adds a `community_group_bans` table checked by join and accept, mirroring the org-scoped ban of migration 156 (P1-01 ruling 2026-07-07). A ruling decides whether a community ban is group-scoped (the old code's intent) or platform-wide.
3. Mute: `community_group_members.muted` and `notification_preferences` are honoured by nothing; the port makes dispatch consult both (except invite, which 032 says cannot be disabled). This changes P1-07's dispatch row.
4. Community topics: read, never written; drop the sidebar list or rule a writer.
5. Directory: counts `profiles.affiliation_type` and `verifier_status`; the port counts `community_member_profiles.org_type` and email verification and suppresses cells below k = 5. A ruling confirms the floor value.
6. The list remainder and notices routes are not Community; their owners have no lane id in the brief's list (P1-01 recorded the same gap for the surface read layer).
7. `/api/listings/rest` is unauthenticated and absent from CLAUDE.md's public-route list; the port either documents the exception (public list data, IP limited) or guards it.
8. `organisation_key` is written and never read since migration 349; keep (verification identity, future aggregate pools) or drop the column.

### Defects the new code must not repeat (from the in-scope backlog rows; the backlog file carries the STATUS cells)

Dropped-error reads that turn a database failure into 403 or 404 (B-0023, B-0024, B-0025, B-0027, B-0028, B-0031, B-0032, B-0033, B-0034, B-0036, B-0037, B-0092), unchecked compensating writes (B-0026, B-0029, B-0030, B-0035, B-0077, B-0078), a filter applied after the limit (B-1884), an unbounded count read (B-1885), RLS assumed and never attacked (B-0832, B-0852), handlers with no test (B-0855, B-0856), a dead route left in place (B-0649, B-0650), plus this register's: a ban that records nothing, side effects before the close, a mute that does nothing, two meanings of "verified", a directory without a small-cell floor, `getUser` per page and perf logs in production.
