# P1-01 auth-db: Keep / Refactor / Trash register and build-plan section (2026-10-11)

Lane P1-01, DISPOSITION lane, read-only. Tree: origin/master `195a7c07e`. Written by the cloud session on 2026-10-11 (clock from `date -u`: 21:18 UTC). Every file in SCOPE was read whole with the Read tool; the coverage table below records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. Prior registers were read as scope-filtered extractions (every line naming an in-scope path, 148 lines across 19 registers) plus the A2-part6 register whole; A1-part1 (76k tokens), A3 (82k) and A4 (453 KB, above the Read tool's size limit) were not read whole because almost none of their rows name an in-scope file [CONFIRMED: `grep -c` per register, counts in the method note of this lane's session log]. The same method the A3 register itself used for prior audits.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks and leading-`*` lines stripped). Raw lines are `wc -l`.

## 1. Header and coverage

Module: auth-db. The authentication, authorization, organisation membership and database-client layer of fsi-app, plus `src/lib/supabase-server.ts`, which the scope names but which is the server-side read layer of the five customer surfaces (section 2 says where it goes).

Coverage (48 files, 10,503 raw lines, 6,830 code lines; `wc -l` and the awk count run 2026-10-11):

| path (under fsi-app/) | raw lines | code lines | read calls |
|---|---|---|---|
| src/lib/supabase-server.ts | 5048 | 3031 | 5 (offsets 1, 1101, 2201, 3301, 4401) |
| src/lib/supabase-server-client.ts | 27 | 24 | 1 |
| src/lib/supabase-browser.ts | 8 | 7 | 1 |
| src/lib/supabase-env.ts | 3 | 3 | 1 |
| src/lib/supabase-service.ts | 37 | 17 | 1 |
| src/lib/db/paginate.mjs | 107 | 41 | 1 |
| src/proxy.ts | 105 | 60 | 1 |
| src/lib/auth/admin.ts | 82 | 30 | 1 |
| src/lib/auth/classify-signup-result.mjs | 13 | 8 | 1 |
| src/lib/auth/platform-admin-gate.ts | 54 | 29 | 1 |
| src/lib/auth/provision-personal-workspace.ts | 94 | 73 | 1 |
| src/lib/auth/route-policy.ts | 87 | 43 | 1 |
| src/lib/auth/safe-return-path.mjs | 12 | 7 | 1 |
| src/lib/orgs/ban-check.mjs | 17 | 10 | 1 |
| src/lib/orgs/create-org.mjs | 112 | 80 | 1 |
| src/lib/api/auth.ts | 132 | 65 | 1 |
| src/lib/api/authed-fetch.ts | 136 | 56 | 1 |
| src/lib/api/community-auth.ts | 98 | 68 | 1 |
| src/lib/api/org.ts | 281 | 129 | 1 |
| src/lib/api/pause.ts | 196 | 127 | 1 |
| src/lib/api/rate-limit.ts | 104 | 65 | 1 |
| src/lib/api/route-guard.ts | 101 | 78 | 1 |
| src/lib/api/server-bootstrap.ts | 228 | 107 | 1 |
| src/lib/api/worker-auth.ts | 57 | 35 | 1 |
| src/app/api/auth/identity/route.ts | 69 | 24 | 1 |
| src/app/api/auth/linkedin/callback/route.ts | 263 | 206 | 1 |
| src/app/api/auth/linkedin/start/logic.ts | 9 | 3 | 1 |
| src/app/api/auth/linkedin/start/route.ts | 53 | 40 | 1 |
| src/app/api/orgs/route.ts | 62 | 53 | 1 |
| src/app/api/orgs/[org_id]/route.ts | 223 | 189 | 1 |
| src/app/api/orgs/[org_id]/members/route.ts | 619 | 520 | 1 |
| src/app/api/orgs/[org_id]/invitations/route.ts | 154 | 123 | 1 |
| src/app/api/orgs/[org_id]/invitations/[id]/route.ts | 61 | 48 | 1 |
| src/app/api/invitations/[token]/route.ts | 50 | 39 | 1 |
| src/app/api/invitations/[token]/accept/route.ts | 45 | 37 | 1 |
| src/app/api/invitations/[token]/decline/route.ts | 44 | 37 | 1 |
| src/app/api/invitations/mine/route.ts | 63 | 49 | 1 |
| src/app/auth/callback/route.ts | 60 | 40 | 1 |
| src/app/auth/reset-password/page.tsx | 112 | 94 | 1 |
| src/app/auth/update-password/page.tsx | 122 | 108 | 1 |
| src/app/login/page.tsx | 180 | 145 | 1 |
| src/app/signup/page.tsx | 210 | 171 | 1 |
| src/app/invitations/[token]/page.tsx | 27 | 15 | 1 |
| src/components/auth/AuthFrame.tsx | 250 | 217 | 1 |
| src/components/auth/AuthPanel.tsx | 184 | 161 | 1 |
| src/components/auth/AuthProvider.tsx | 260 | 124 | 1 |
| src/components/auth/UserMenuDropdown.tsx | 134 | 100 | 1 |
| src/components/auth/identity-loader.ts | 110 | 94 | 1 |
| TOTAL | 10503 | 6830 | 52 |

Files not read whole: none. Test files: none exist beside the scope on this tree (`git ls-files 'fsi-app/src/**/*.test.mjs' 'fsi-app/src/**/*.npmtest.mjs'` returns 0; the CLEAN cuts removed them), so every "exported for its test" export below has no importer.

Consumer evidence: `grep -rn "<symbol>"` over fsi-app/src, fsi-app/scripts and fsi-app/supabase (ts, tsx, mjs, js, sql), excluding the defining file, run per symbol by `exports-consumers.mjs` (name occurrences, so a count is an upper bound) and then by hand for every symbol claimed dead (section 4). Route handlers are reached by URL; their callers are the `fetch("<path>")` literals under src (section 7).

## 2. Module verdict

**REFACTOR AND PORT.** Every responsibility is kept. The code is not: it carries two guard families for one question, five copies of the oldest-membership query, three ways to build a Supabase client, a 5,048-line file whose comment history is 40 percent of its bytes and whose contents belong to the five surfaces, one unwired OAuth chain, and five dead exports. The security fixes of 2026-10-11 (PR 1122, PR 1123) are in the tree and are kept as behaviour.

**Current code LOC: 6,830** (awk over the 48 files, table above). **Estimated clean LOC: about 2,450 for auth-db, plus about 1,900 for the surface read layer that leaves this module.** Arithmetic (section 8 table, per planned file): core/db 115 (clients 70, paginate 45) + core/auth 610 (claims 25, guards 200, platform-admin 60, membership 90, identity and profile heal 135, route policy and proxy 90, return path 10) + features/auth API 810 (identity 25, callback 35, create org 145, org read and update 110, members 240, invitations issue and list 90, revoke 40, token lookup, accept and decline 80, mine 45) + features/auth UI 915 (AuthFrame 170, AuthPanel 110, login 100, signup 120, reset 65, update 70, AuthProvider 110, identity-loader 85, UserMenu 70, invitation page 15) = 2,450. Surface reads: dashboard 450, lists and aggregates 500, detail and themes 450, watchlist 200, operations 120, market 120, research 110, sources admin read 80 = 2,030, rounded to 1,900 after the six duplicate fallback wrappers collapse to one. Against today's 6,830 the module itself shrinks to 36 percent; with the moved reads the whole scope shrinks to 64 percent. Estimates are read-derived [HYPOTHESIS until the port lane counts them].

Core responsibilities (10), with the files that carry them today:

1. Supabase clients: browser (supabase-browser.ts), cookie-bound server (supabase-server-client.ts), memoised fail-closed service role (supabase-service.ts, supabase-env.ts), plus an anon server client with no cookies (supabase-server.ts:50-55) and an inline copy of the service construction (provision-personal-workspace.ts:52-56).
2. Request authentication: bearer JWT via `getClaims` (api/auth.ts), cookie-or-bearer (api/community-auth.ts), composed with rate limiting and the admin gate (api/route-guard.ts), worker secret (api/worker-auth.ts), per-user and per-IP limiter (api/rate-limit.ts).
3. Platform-admin gate: own-row rpc `is_platform_admin()` for the session user, service read of another user's flag, page gate with redirects (auth/platform-admin-gate.ts, auth/admin.ts).
4. Route protection: pure decision (auth/route-policy.ts) wired by the Next proxy (proxy.ts); safe return paths (auth/safe-return-path.mjs).
5. Identity bootstrap: one server resolution of user, org, role, sectors and admin bit (api/server-bootstrap.ts), served by `/api/auth/identity` and loaded client-side with bounded retry (components/auth/AuthProvider.tsx, identity-loader.ts); profile row heal (auth/provision-personal-workspace.ts).
6. Organisation membership: oldest-membership resolution, writer gate (api/org.ts), org create (orgs/create-org.mjs, api/orgs/route.ts), org read and rename (api/orgs/[org_id]/route.ts), member list, role change, ban, removal, add by email (api/orgs/[org_id]/members/route.ts, orgs/ban-check.mjs).
7. Invitations: issue and list (api/orgs/[org_id]/invitations/route.ts), revoke ([id]/route.ts), token lookup, accept, decline (api/invitations/[token]/...), my pending invitations (invitations/mine), the landing page (app/invitations/[token]/page.tsx).
8. Sign in, sign up, password reset and update, auth callback (app/login, app/signup, app/auth/*, components/auth/AuthFrame.tsx, AuthPanel.tsx, auth/classify-signup-result.mjs).
9. Account menu (components/auth/UserMenuDropdown.tsx).
10. Paginated reads (db/paginate.mjs). Not auth-db but in scope: the scrape and generation pause gates (api/pause.ts) and the surface read layer (supabase-server.ts).

Key dependencies [CONFIRMED by the import and `.from(`/`.rpc(` scans]:

- Modules imported: `@supabase/ssr`, `@supabase/supabase-js`, `next/server`, `next/headers`, `next/navigation`, `next/cache`, `react` (cache), `lucide-react`; in-repo: `@/lib/telemetry/capture-error`, `@/lib/email/send-invitation-email` (a stub, returns `delivered:false, configured:false` always), `@/lib/constants` (ALL_SECTORS, APP_NAME), `@/lib/urgency/bands`, `@/lib/format`, `@/lib/profile/profile-contract.mjs`, `@/lib/community/profile-policy.mjs`, `@/lib/sources/scrape-schedule`, `@/lib/sources/fetch-hold.mjs`, `@/stores/workspaceStore`, `@/components/shell/bootstrap-seed`, `@/components/providers/QueryProvider`, `@/components/ui/{Button,Masthead,SectionHeader}`, `@/components/onboarding/InvitationLandingPage`; supabase-server.ts additionally imports 20 surface modules (scoring, surface-of, customer-source-tier, research, item-links, detail, contracts, market, jurisdictions, dashboard, connections).
- Tables touched by auth-db proper: profiles, organizations, org_memberships, org_invitations, org_member_bans, workspace_settings (section 8 lists columns). By pause.ts: system_state, sources, integrity_flags. By supabase-server.ts: 30 tables and 7 RPCs (section 8).
- RPCs: accept_invitation, decline_invitation, lookup_invitation, revoke_invitation, create_org_for_self, is_platform_admin; Supabase Auth: getClaims, getUser, getSession, exchangeCodeForSession, signInWithPassword, signInWithOtp, signUp, resetPasswordForEmail, updateUser, signOut, onAuthStateChange, admin.getUserById.
- Env vars read: NEXT_PUBLIC_SUPABASE_URL (11 sites), NEXT_PUBLIC_SUPABASE_ANON_KEY (8), SUPABASE_SERVICE_ROLE_KEY (5), WORKER_SECRET, NEXT_PUBLIC_APP_URL, NODE_ENV, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI.
- External services: Supabase Auth and PostgREST; LinkedIn OAuth and REST (api.linkedin.com, the only raw `fetch(` to a third party in scope, callback/route.ts:121,157,158); no email provider.

## 3. Bloat, biggest first

| rank | what | lines | why it is bloat | replacement |
|---|---|---|---|---|
| 1 | supabase-server.ts comment history | about 2,000 of 5,048 raw lines are comments (5048 raw minus 3031 code), most of them dated lane narratives (PERF-2 to PERF-13, FOLD 62, lane names, live measurements) | the file explains its own archaeology to every reader; the decisions live in ADRs and the session log | one header sentence per function; history stays in docs/ |
| 2 | supabase-server.ts is five surfaces' read layer inside an "auth-db" scope | 3,031 code lines: dashboard (fetchDashboardData 2707-3006, due-next, recent changes, brief backfill, overrides), lists (784-983, 1441-1533, 2178-2270, 3030-3262), detail (3786-4234), cross-page themes (4236-4423), watchlist (4425-4985), operations (3315-3594), market (3596-3758), research (1535-1793), sources admin (264-575) | one file, one cache key constant (DASHBOARD_DATA_CACHE_KEY) and six near-identical empty-fallback wrappers (fetchSourceData 558-575, fetchDashboardData, loadResourcesWithOverridesPayload 3030-3079, loadPublicResourcesPayload 3086-3114, loadMapDataPayload 3161-3208, fetchSettingsData 3273-3313) | per-surface read modules in the surface features; one `readWithFallback(label, fn)` helper; clients and `describeSupabaseError` in core/db |
| 3 | members/route.ts | 619 raw, 520 code | five handlers each repeat: requireCommunityRoute, org_id check, getMembership, 500/403, owner-or-admin gate, target read with 500/404, last-owner count (three copies at 208-227, 329-346, 449-468), rateLimitHeaders on every response (26 sites) | one `loadMembershipContext(request, params)` and one `assertNotLastOwner(service, orgId)`; handlers become 20 to 40 lines each |
| 4 | api/org.ts oldest-membership query | five copies (25-37, 66-79, 105-118, 151-164, 251-264) plus two `cache()` wrappers that only add try/catch | the same `.from("org_memberships").select(...).eq("user_id").order("created_at").limit(1).maybeSingle()` written five times with four different error contracts | one `resolveMembership(client, userId, orgId?)` returning `{orgId, role} | null` and surfacing the error; callers pick fail-soft or fail-closed explicitly |
| 5 | two guard families | api/auth.ts (132) + api/community-auth.ts (98) + api/route-guard.ts (101) = 331 raw | `requireAuth` (bearer only) and `requireCommunityAuth` (cookie then bearer) answer the same question; `ClaimsVerifier` and the getClaims resolver are duplicated; route-guard then wraps both into three more functions | one `requireUser(request)` that accepts cookie or bearer and returns the caller's RLS-bound client; `requireAdmin` composes it with the own-row rpc |
| 6 | three client constructions | supabase-service.ts 25-37, provision-personal-workspace.ts 44-57 (its own service `createClient`), supabase-server.ts 50-55 (anon client with no cookies), proxy.ts 38-57 and auth/callback 33-48 (the cookie adapter inlined twice) | the F19 class (service key never falls back to anon) must be proven at every construction site instead of one | core/db/clients.ts with exactly three factories |
| 7 | api/pause.ts in auth-db | 196 raw, 127 code, of which 5 exports and about 75 lines are dead (section 4) | the scrape, generation and judgement-drain gates are source-pipeline policy, not auth; placed here by directory | the live exports (readScrapeState, getScrapeState, isGloballyPaused, evaluateGenerationPause, pausedResponse) move to the sources module P1-05/06 |
| 8 | LinkedIn OAuth chain | callback 263 + start 53 + logic 9 = 325 raw | no caller in the UI (section 4); needs three env vars no page references; writes `verification_tier` through the service client | TRASH as code; the feature is recorded in section 8 for P1-22/23 |
| 9 | header essays on the auth components and routes | AuthProvider.tsx 1-129 (129 of 260 lines before the component), identity/route.ts 7-40, authed-fetch.ts 3-42, AuthFrame.tsx 3-22 and 157-167, 216-224 | the same ADR-026 and PERF-10 story told in four files | one sentence each, link to the ADR |
| 10 | admin gate needs a service-role client to answer "is the caller an admin" | route-guard.ts 83-101 constructs the service client and calls `isPlatformAdmin(userId, service)` while `readOwnPlatformAdmin(userClient)` already answers for the caller (platform-admin-gate.ts 22-28) | two mechanisms for one question; every admin route receives a service client it may not need | `requireAdmin` reads the own-row rpc on the caller's client and hands out the service client only to routes that write |

## 4. Dead code

Each `[CONFIRMED]` row: the grep named ran this session over fsi-app/src, fsi-app/scripts and fsi-app/supabase (ts, tsx, mjs, js, sql) excluding the defining file, and matched nothing but what the row says.

| path:line | symbol | kind | evidence |
|---|---|---|---|
| src/lib/api/pause.ts:191 | judgementDrainHaltReason | exported function | `grep -rn judgementDrainHaltReason` outside pause.ts: 0 hits [CONFIRMED]. The drain scripts carry their own switch reader (migration 354 header names scripts/drain/switch.mjs) |
| src/lib/api/pause.ts:174 | isFleetBudgetHalted | exported function | grep outside pause.ts: 0 [CONFIRMED] |
| src/lib/api/pause.ts:158 | getJudgementDrain | exported function | grep outside pause.ts: 1 hit, a comment in supabase/migrations/354_judgement_drain_switch.sql:6 [CONFIRMED] |
| src/lib/api/pause.ts:98 | isSourcePaused | exported function | grep outside pause.ts: 0 [CONFIRMED]; it also fails OPEN (returns false on error, :108 and :111), the one gate in the file that does |
| src/lib/api/pause.ts:118 | pauseReason | exported function | grep outside pause.ts: 1 hit, a comment in supabase/migrations/051_sources_last_scanned_recovery.sql:13 [CONFIRMED] |
| src/app/api/auth/linkedin/start/route.ts, callback/route.ts, start/logic.ts | GET, GET, STATE_COOKIE, STATE_COOKIE_MAX_AGE_SECONDS, LINKEDIN_OAUTH_BASE_URL | route handlers and constants | `grep -rn -F "/api/auth/linkedin" fsi-app/src` outside the three files: 0 hits [CONFIRMED]; the OnboardingWizard comment the A1 register cites is a comment. Reachable by URL only if a user types it |
| src/lib/supabase-server.ts:1480 | ScopeFilter | exported type | re-exported by src/lib/data.ts:25,91 and read by nothing else (`grep -rn ScopeFilter`: data.ts twice, supabase-server.ts, and WatchlistSurface.tsx's unrelated `ScopeFilterValue`) [CONFIRMED]; the file's own comment at 1471-1472 says the fetcher that took it was deleted (DEAD-1d) |
| src/lib/supabase-server.ts:4508 | ReviewItem | exported interface | re-exported by data.ts:64,89; src/app/api/admin/canonical-sources/bulk-approve/route.ts:26 declares its own `interface ReviewItem` and does not import this one [CONFIRMED grep] |
| src/lib/api/auth.ts:60 | resolveUserIdFromToken (export) | export surface | called only inside auth.ts:107 [CONFIRMED]; the comment says it is exported for auth.npmtest.mjs, which no longer exists |
| src/lib/api/community-auth.ts:34 | resolveCommunityUserId (export) | export surface | called only inside community-auth.ts:61,78 [CONFIRMED] |
| src/lib/api/org.ts:245 | resolveViewerIdentityFromAuthenticatedClient (export) | export surface | called only by resolveViewerIdentityFromCookies :277 [CONFIRMED] |
| src/lib/api/org.ts:40,42,82,207 | OrgRole, OrgMembership, OrgWriterResult, ViewerIdentity (exports) | types | 0 importers outside org.ts [CONFIRMED] |
| src/lib/supabase-server.ts:877,1268,1295,758 | DUE_NEXT_READ_LIMIT, splitBriefIdsByShape, mergeBriefOverrides, buildWorkspaceItemsQuery (exports) | export surface | used only inside the file; buildWorkspaceItemsQuery is named in two migration comments (303:17, 305:68) [CONFIRMED] |
| src/lib/auth/route-policy.ts:14,18,28 | isScannerProbe, isPublicRoute, isStaticOrApiRoute (exports) | export surface | called only by decideRoute :67,71,78 [CONFIRMED] |
| src/lib/api/authed-fetch.ts:67,76,86,111 | AUTH_REQUIRED_ERROR, resolveAccessToken, unauthorizedResponse, withBearer (exports) | export surface | used only inside the file [CONFIRMED] |
| src/lib/auth/platform-admin-gate.ts:14 | IS_PLATFORM_ADMIN_RPC (export) | export surface | used only at :25 [CONFIRMED] |
| src/lib/api/worker-auth.ts:31 | `opts.allowBearer` | parameter branch | `grep -rn allowBearer fsi-app/src` outside worker-auth.ts: 0 [CONFIRMED]; its own comment says the last caller was purged 2026-07-18 |
| src/lib/supabase-server.ts:2818-2823, 2852-2857 | allSynopses, synopses | always-empty array and its mapping | declared `[]` and never pushed to [CONFIRMED read]; `DashboardData.synopses` is read by src/components/resource/SectorSynopsis.tsx:222 through the resource store, a surface CLAUDE.md shelves; the two reads beside it (intelligence_changes :2833, sector_contexts :2838) feed the same shelved component. HALF-SLICE, not dead; listed here because the synopses half can never carry data |
| src/app/signup/page.tsx:37-41 | safeInternalPath | private duplicate | duplicates sanitizeReturnPath minus the `/\\` check [CONFIRMED read]; not dead, a duplicate (section 5) |

Not dead, verified live this session: UserMenuDropdown (dynamic import, Sidebar.tsx:46,301), resolveViewerIdentityFromCookies (MarketSeriesBoard.tsx), resolveOrgMembershipFromUserId (workspace/item-collab-route.ts:57), fetchBriefResourcesByIds (portfolio/read.ts:83), isCommunityAuthError (route-guard.ts:76), evaluateGenerationPause (src/workflows/generate-brief.ts).

## 5. Duplicates and over-abstraction

| what | where | proposed single inline replacement |
|---|---|---|
| `ClaimsVerifier` interface | api/auth.ts:40-47; api/community-auth.ts:14-21 | one interface in core/auth/claims.ts with the optional jwt |
| getClaims to userId resolver | api/auth.ts:60-67; api/community-auth.ts:34-41 | one `userIdFromClaims(client, jwt?)` |
| oldest-membership query | api/org.ts:25-37, 66-79, 105-118, 151-164, 251-264; api/orgs/[org_id]/members/route.ts:17-22; api/orgs/[org_id]/route.ts:15-21; api/auth/linkedin/callback/route.ts:235-240; api/server-bootstrap.ts:158-164 (with the organizations embed) | `resolveMembership(client, userId, orgId?)` in core/auth/membership.ts; the bootstrap keeps its embed as the one variant |
| `getMembership` per route | members/route.ts:12-27 (returns `{membership, error}`); [org_id]/route.ts:10-22 (drops error) | the same `resolveMembership` |
| last-owner count | members/route.ts:208-227, 329-346, 449-468 | `assertNotLastOwner(service, orgId)`; the database already refuses it for user-session writers (migration 370 `org_membership_role_guard`), so the service-role path is the only one that needs the code check |
| owner-or-platform-admin gate + 403 copy | members/route.ts:32-48 and the inline variant at :74-79 | one helper, one message |
| rateLimitHeaders on every response | members/route.ts (26 sites), [org_id]/route.ts (12), invitations (6) | a response helper `json(body, init, userId)` or drop the headers from error responses |
| service-role client construction | supabase-service.ts:33-35; provision-personal-workspace.ts:52-56 | ensureProfile takes the shared client |
| cookie-adapter server client | supabase-server-client.ts:7-26; proxy.ts:38-57 (request-cookie variant); auth/callback/route.ts:33-48 (identical to supabase-server-client) | callback imports `createSupabaseServerClient`; proxy keeps its request-bound variant as the second factory |
| anon client without cookies | supabase-server.ts:50-55 `getSupabase()` | one factory in core/db/clients.ts, or the service client where RLS is irrelevant (every caller is server-side) |
| UUID regex | supabase-server.ts:2308, 3801, 4541-4542; invitations/[id]/route.ts:5; invitations/route.ts:6 | one `isUuid()` in core/db |
| 64-hex token regex | invitations/[token]/route.ts:5, accept/route.ts:5, decline/route.ts:5 | one constant beside the rpc-error mapper |
| rpc error-code mapping (42501 to 403, P0002 to 404, 22023 to 409) | accept/route.ts:24-39; decline/route.ts:24-38; [id]/route.ts:41-55 | one `invitationRpcError(error)` |
| return-path sanitiser | auth/safe-return-path.mjs:6-12; signup/page.tsx:37-41 | signup imports sanitizeReturnPath |
| ISO week number | components/auth/AuthFrame.tsx:35-41 (its comment says it mirrors Masthead.tsx) | import from the ui-kit (P1-17) |
| masthead date label | login/page.tsx:104; signup/page.tsx:137; AuthFrame.tsx:46-51 (same options object) | one formatted label passed down, or Masthead computes it |
| six empty-fallback read wrappers | supabase-server.ts:558-575, 2707-2741, 3030-3079, 3086-3114, 3161-3208, 3273-3313 | one `readWithFallback(label, fn, empty)` |
| citation-stats and bias-tag enrichment | supabase-server.ts:1692-1711 and 2116-2151; 1717-1729 and 2161-2175 | fetchResearchPipelineRows calls enrichCategoryRows |
| per-row `fitness-allow: F39` comments | supabase-server.ts (16 sites) | the enforcer was deleted (CLEAN-3); the comments go |

Over-abstraction: `UserRouteDeps`, `AdminRouteDeps`, `CommunityRouteDeps` (route-guard.ts:39-53) exist so tests could inject stubs; the tests are gone. `AuthedFetchDeps`, `SessionSource` (authed-fetch.ts:49-63), `EnsureProfileDeps` (provision-personal-workspace.ts:15-20) and `IdentityLoaderDeps` (identity-loader.ts:11-23) are the same pattern. Keep one injection seam per module only where the new tree's test actually uses it.

## 6. Non-essential artifacts

None in scope: no fixtures, mock data, handoff JSON or generated inventories. `BAND_ORDER` (AuthFrame.tsx:188) is live vocabulary, not sample copy. The LinkedIn chain is the only code that would ship env-gated dead paths (TRASH, section 7).

## 7. File register

Columns: path | lines a-b (total) | responsibility | verdict | clean estimate (code lines) | consumers (count and top 3, this session's grep) | note. "Routes" are reached by URL; their consumers are the fetch sites named.

| path | lines (total) | responsibility | verdict | clean est. | consumers | note |
|---|---|---|---|---|---|---|
| src/lib/supabase-env.ts | 1-3 (3) | `isServiceSupabaseConfigured()` | REFACTOR AND PORT | into clients.ts | 3: data.ts, supabase-server.ts, supabase-service.ts | checks the key only, never the URL [CONFIRMED read] |
| src/lib/supabase-browser.ts | 1-8 (8) | browser client factory | KEEP AS-IS | 7 | 17: reset-password, update-password, login, signup, AuthProvider, authed-fetch, 11 components | one factory, no fallback |
| src/lib/supabase-server-client.ts | 1-27 (27) | cookie-bound server client | KEEP AS-IS | 24 | 28: admin pages, identity route, org.ts, server-bootstrap, community-auth, invitations page | the setAll catch swallows the Server Component write case by design |
| src/lib/supabase-service.ts | 1-37 (37) | memoised fail-closed service-role client | KEEP AS-IS | 17 | 63: admin pages and routes, supabase-server, route-guard, members route | PROP-011/109 hold here [CONFIRMED read: throws, never anon] |
| src/lib/db/paginate.mjs | 1-107 (107) | fetchAllRows, assertBound, exactCount, fetchAllByIdChunks | KEEP AS-IS | 45 | 22 (fetchAllRows), 12 (fetchAllByIdChunks), 4, 3: scripts/lib/db.mjs, supabase-server, admin routes, propagation/drain.ts | the one chunking home; the register A4d calls it correct |
| src/proxy.ts | 1-105 (105) | Next proxy: scanner 404, cookie client, getClaims, decideRoute, redirects, matcher | REFACTOR AND PORT | 55 | Next runtime on every matched request | redirect-login keeps pathname only, the original query string is lost (B-0087) [CONFIRMED read :84-88] |
| src/lib/auth/route-policy.ts | 1-87 (87) | pure route decision | REFACTOR AND PORT | 35 | 1: proxy.ts | `isPublicRoute` and `isStaticOrApiRoute` use startsWith (:19, :30-33), so `/loginx`, `/privacy-evil`, `/apixyz` skip the auth redirect (B-1980) [CONFIRMED read; executed by A4d]; fix: exact match or prefix plus "/" |
| src/lib/auth/safe-return-path.mjs | 1-12 (12) | same-origin return path | REFACTOR AND PORT | 10 | 3: auth/callback, login, route-policy (comment) | tab and newline survive (B-1981) [CONFIRMED read]; strip control characters |
| src/lib/auth/classify-signup-result.mjs | 1-13 (13) | signUp outcome classifier | KEEP AS-IS | 8 | 1: signup/page.tsx | |
| src/lib/auth/platform-admin-gate.ts | 1-54 (54) | strict flag predicate, own-row rpc read, page decision | KEEP AS-IS | 29 | 6: admin.ts, server-bootstrap, signoff decide route, migration 375 (comment) | fails closed on rpc error [CONFIRMED read :50] |
| src/lib/auth/admin.ts | 1-82 (82) | `isPlatformAdmin(userId, service)` and `requirePlatformAdmin()` page gate | REFACTOR AND PORT | 30 | 19 and 26: admin pages, admin routes, members route, route-guard | merge with platform-admin-gate.ts into one file |
| src/lib/auth/provision-personal-workspace.ts | 1-94 (94) | `ensureProfile`: insert the profiles row when missing, unique-violation re-read, failure counted in error_events | REFACTOR AND PORT | 50 | 5: auth/callback, orgs/route.ts, server-bootstrap (3 code importers) | builds its own service client (:52-56) beside supabase-service.ts (A4d B-DUP-1); file name no longer matches content |
| src/lib/orgs/ban-check.mjs | 1-17 (17) | `checkOrgBan` ok, banned or error | KEEP AS-IS | 10 | 1: members route PUT | fail closed [CONFIRMED read] |
| src/lib/orgs/create-org.mjs | 1-112 (112) | input allow-list, `create_org_for_self` rpc, workspace_settings and profiles patches | KEEP AS-IS | 80 | 1: orgs/route.ts | profile jsonb read-modify-write (80-91) is non-atomic, benign for a new org (A4d) |
| src/lib/api/auth.ts | 1-132 (132) | bearer `requireAuth` returning the caller's RLS client (PR 1122) | REFACTOR AND PORT | into guards.ts | 10 (requireAuth), 3 (ClaimsVerifier), 4 (AuthContext): admin/attention, tier-override, obligations/upcoming, route-guard | merge with community-auth into one cookie-or-bearer guard |
| src/lib/api/community-auth.ts | 1-98 (98) | cookie-then-bearer `requireCommunityAuth` | REFACTOR AND PORT | into guards.ts | 4: route-guard, community/profile/verify, admin/redesign/MembersPanel (comment) | both catches now `console.warn` (PR 1123) and still fall through to 401 (B-0051) |
| src/lib/api/route-guard.ts | 1-101 (101) | requireUserRoute, requireCommunityRoute, requireAdminRoute, isRefusal | REFACTOR AND PORT | into guards.ts | 89 (isRefusal), 40 (requireAdminRoute), 37 (requireCommunityRoute), 17 (requireUserRoute) | the admin gate constructs a service client to answer a question the own-row rpc answers (section 3 rank 10) |
| src/lib/api/rate-limit.ts | 1-104 (104) | in-memory 60/min limiter, IP key, headers | REFACTOR AND PORT | 50 | 84 (rateLimitHeaders), 18 (checkRateLimit), 8 (clientKey) | header :7 says "sliding window"; the code is a fixed window reset at resetAt (:44-47) (B-1547) [CONFIRMED read]; per instance, so per-user limits do not hold across Vercel instances (header :8-9 says so) |
| src/lib/api/worker-auth.ts | 1-57 (57) | constant-time worker-secret guard | KEEP AS-IS | 30 | 8: recompute-trust, spot-check/recurring, cache/revalidate-item, worker routes | drop `allowBearer` (0 callers, section 4) |
| src/lib/api/org.ts | 1-281 (281) | org and viewer resolution, `requireOrgWriter` | REFACTOR AND PORT | 60 | 17 (resolveOrgIdFromCookies), 10 (resolveOrgIdFromUserId), 7 (requireOrgWriter), 1 each for the rest | five copies of one query (section 5); the fail-soft wrappers never distinguish "no session" from "read failed" for the caller |
| src/lib/api/server-bootstrap.ts | 1-228 (228) | one-pass identity: claims, membership with org and sector embed, sector overrides, admin bit, profile heal, IdentityLookupError | KEEP AS-IS | 90 | 5 (resolveServerBootstrap): identity route, onboarding page, workspace/new page, 1 (WithHeal) | correct error discipline [CONFIRMED read :173-177]; comment history is half the file |
| src/lib/api/pause.ts | 1-196 (196) | scrape state, generation pause split, source pause, fetch-entry 503, judgement-drain switch | REFACTOR AND PORT (to P1-05/06) | 50 | readScrapeState 3, getScrapeState 4, isGloballyPaused 6, evaluateGenerationPause 1 (generate-brief.ts), pausedResponse 4 | five dead exports (section 4); not an auth-db file |
| src/lib/api/authed-fetch.ts | 1-136 (136) | the one browser fetch for bearer routes, `authHeaders` | KEEP AS-IS | 55 | 32 (authedFetch), 10 (authHeaders): AdminDashboard, BulkImportView, AskAssistant, hooks | 9 modules still call `authHeaders()` and `fetch` themselves (B-0232) [CONFIRMED grep]; the export exists for them, so the finding is about the lint rule PROP-028, not this file |
| src/app/api/auth/identity/route.ts | 1-69 (69) | GET identity bootstrap, IP limiter, 503 on failure | KEEP AS-IS | 25 | 1: AuthProvider.tsx:180 | |
| src/app/api/auth/linkedin/start/route.ts | 1-53 (53) | LinkedIn OAuth start | TRASH | 0 | 0 UI callers [CONFIRMED grep] | feature recorded in section 8 |
| src/app/api/auth/linkedin/start/logic.ts | 1-9 (9) | cookie and host constants | TRASH | 0 | 2: the two LinkedIn routes | |
| src/app/api/auth/linkedin/callback/route.ts | 1-263 (263) | OAuth code exchange, profile import, service-role profiles update | TRASH | 0 | 0 UI callers | two dropped-error reads inside a try (:235, :243) (B-0022); the only third-party `fetch(` in scope |
| src/app/api/orgs/route.ts | 1-62 (62) | POST create organisation for self | KEEP AS-IS | 50 | 1: NoWorkspaceLanding.tsx (via `/api/orgs`) [HYPOTHESIS: the grep hit the `/api/orgs/${orgId}` family; the create call site was not isolated] | `{ data: org }` at :46 drops error, falls back to the submitted name (B-0042) |
| src/app/api/orgs/[org_id]/route.ts | 1-223 (223) | GET org with owner and member count; PATCH name and slug (owner) | REFACTOR AND PORT | 110 | 2: profile/OrganizationPanel.tsx:64,101 | `getMembership` drops error (:15), so a DB failure answers 403 "Not a member" (B-0041); ownerRow (:65) and memberCount (:76) drop error too [CONFIRMED read] |
| src/app/api/orgs/[org_id]/members/route.ts | 1-619 (619) | GET list, PATCH role, POST ban, DELETE remove, PUT add by email | REFACTOR AND PORT | 240 | 2: profile/MembersPanel.tsx:125, admin/redesign/MembersPanel.tsx:85 | GET unbounded (:81-87) (B-0082); every read checks error [CONFIRMED read]; migration 370's trigger does not cover the service-role writes this route makes, so the owner guards here are load-bearing |
| src/app/api/orgs/[org_id]/invitations/route.ts | 1-154 (154) | POST invite (RLS-enforced insert, email stub), GET list with lazy expiry | KEEP AS-IS | 90 | 3: admin/InvitationsPanel.tsx:64,87, profile/MembersPanel.tsx:126 | token never logged (PR 1122) [CONFIRMED read :86]; `sendInvitationEmail` is a stub, so delivery is always "copy the link" |
| src/app/api/orgs/[org_id]/invitations/[id]/route.ts | 1-61 (61) | DELETE revoke, URL-scope read before the rpc | KEEP AS-IS | 40 | 1: admin/InvitationsPanel.tsx:106 | PR 1122 ordering [CONFIRMED read :20-33] |
| src/app/api/invitations/[token]/route.ts | 1-50 (50) | GET lookup by token (rpc) | REFACTOR AND PORT | 25 | 1: onboarding/InvitationLandingPage.tsx:41 | share the token regex and error mapper |
| src/app/api/invitations/[token]/accept/route.ts | 1-45 (45) | POST accept (rpc; email match and ban guard live in the rpc, migrations 156, 371) | REFACTOR AND PORT | 25 | 2: InvitationLandingPage.tsx:60, NoWorkspaceLanding.tsx:115 | |
| src/app/api/invitations/[token]/decline/route.ts | 1-44 (44) | POST decline (rpc) | REFACTOR AND PORT | 25 | 2: InvitationLandingPage.tsx:76, NoWorkspaceLanding.tsx:129 | |
| src/app/api/invitations/mine/route.ts | 1-63 (63) | GET my pending invitations (service role, by the caller's email) | KEEP AS-IS | 45 | 1: NoWorkspaceLanding.tsx:78 | returns the raw token to the invitee, who needs it to accept; fail closed on the user lookup [CONFIRMED read :18-22] |
| src/app/auth/callback/route.ts | 1-60 (60) | code exchange, ensureProfile, safe redirect | REFACTOR AND PORT | 35 | Supabase redirect target; route-policy PUBLIC_ROUTES | inlines the cookie adapter (section 5) |
| src/app/auth/reset-password/page.tsx | 1-112 (112) | request a reset link | REFACTOR AND PORT | 65 | login/page.tsx:142, AuthPanel.tsx:124 | fixed `width: 380` inside AuthFrame's one-column mobile layout [HYPOTHESIS: not rendered]; two `fitness-allow` comments for a deleted enforcer |
| src/app/auth/update-password/page.tsx | 1-122 (122) | set a new password on the recovery session | REFACTOR AND PORT | 70 | reached from the callback's `next` | same width note |
| src/app/login/page.tsx | 1-180 (180) | password sign-in, magic link, forgot-password link | REFACTOR AND PORT | 100 | public route; AuthTabs | "Keep me signed in" not built (header :14-17, a documented deviation) |
| src/app/signup/page.tsx | 1-210 (210) | sign-up with confirmation, already-registered notice, signed-in guard | REFACTOR AND PORT | 120 | public route | private `safeInternalPath` duplicate (:37-41); signed-in users are sent to /login (:65), which the proxy then bounces home (two hops) [CONFIRMED read] |
| src/app/invitations/[token]/page.tsx | 1-27 (27) | server gate, mounts InvitationLandingPage | KEEP AS-IS | 15 | public URL in invitation emails and copied links | `getUser()` drops error (:20); a failure reads as anonymous and redirects to login, fail closed |
| src/components/auth/AuthFrame.tsx | 1-250 (250) | logged-out frame: identity panel, band legend, the one legal disclaimer, mobile one-column | KEEP AS-IS | 170 | 9: login, signup, reset, update, onboarding, workspace/new, two admin parts demo pages | `new Date()` in render (:44) (B-0123); header cites README and DEVIATION-LOG (B-0124); isoWeekNumber duplicate (:35-41) |
| src/components/auth/AuthPanel.tsx | 1-184 (184) | shared field style, tabs, error banner, already-registered notice, divider, check-email panel | REFACTOR AND PORT | 110 | 4: login, signup, reset, update | AUTH_INPUT_STYLE height 36 (:27), under the 44 px law (B-0125); bare `<a>` tabs |
| src/components/auth/AuthProvider.tsx | 1-260 (260) | client auth context: identity seed with bounded retry, three-valued orgId, cross-tab sync, sign-out, QueryProvider mount | KEEP AS-IS | 110 | 12 (AuthProvider), 6 (useAuth): layout.tsx, AppShell, Sidebar, DashboardMasthead | header :108 says orgId mounts null, state starts undefined :135 (B-0126); 129 lines of header |
| src/components/auth/identity-loader.ts | 1-110 (110) | bounded attempt loop, rearm on focus or visibility | KEEP AS-IS | 85 | 1: AuthProvider.tsx | pure with injected timers |
| src/components/auth/UserMenuDropdown.tsx | 1-134 (134) | account dropdown: email, workspace, Admin tag, profile, settings, sign out | REFACTOR AND PORT (to P1-18 shell) | 70 | 1: Sidebar.tsx:46 (dynamic import) | backdrop has no Esc handler or focus return (A2-part6); legacy `--color-*` tokens |
| src/lib/supabase-server.ts | 1-5048 (5048) | the five surfaces' server read layer plus client helpers | REFACTOR AND PORT (reads to the surface modules; helpers to core/db) | 100 here, about 1,900 elsewhere | 63 (getServiceSupabase re-export), 13 (fetchIntelligenceItem), 11 (WorkspaceAggregates), 7 (fetchWatchlist, describeFallbackTrigger, WatchlistItemType), 6 (fetchDashboardData, isSupabaseConfigured, OperationsFact) | the dropped-destructure pattern A4 counted 13 times is 0 on this tree [CONFIRMED: `grep -cE "const \{ data(: *[A-Za-z_]+)? \} = await"` = 0] (PR 1123); `fitness-allow: F39` at 16 sites for a deleted enforcer |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/core/db/clients.ts | supabase-env.ts 1-3; supabase-browser.ts 1-8; supabase-server-client.ts 1-27; supabase-service.ts 25-37; supabase-server.ts 43-55 (isSupabaseConfigured, getSupabase), 64-77 (describeSupabaseError); proxy.ts 38-57 (request-bound variant) | browser client, cookie server client, request-bound proxy client, memoised fail-closed service client, isConfigured predicates, error describer, isUuid | 70 |
| src/core/db/paginate.ts | db/paginate.mjs 15-107 | fetchAllRows, assertBound, exactCount, fetchAllByIdChunks | 45 |
| src/core/auth/claims.ts | api/auth.ts 38-67; api/community-auth.ts 10-41 | one ClaimsVerifier, `userIdFromClaims(client, jwt?)` | 25 |
| src/core/auth/guards.ts | api/community-auth.ts 43-98; api/auth.ts 78-132; api/route-guard.ts 1-101; api/rate-limit.ts 1-104; api/worker-auth.ts 1-57 | `requireUser(request)` cookie-or-bearer returning `{userId, client}`; `requireAdmin(request)` via the own-row rpc, service client handed out separately; `isRefusal`; fixed-window limiter with an honest header; `workerAuthGuard` without allowBearer | 200 |
| src/core/auth/platform-admin.ts | auth/platform-admin-gate.ts 1-54; auth/admin.ts 27-82 | strict predicate, own-row rpc read, `isPlatformAdmin(userId, service)`, `requirePlatformAdmin()` page gate | 60 |
| src/core/auth/membership.ts | api/org.ts 21-119; members/route.ts 12-48, 204-227; orgs/ban-check.mjs 8-17 | `resolveMembership` (oldest, with role), `requireOrgWriter`, `requireOwnerOrPlatformAdmin`, `assertNotLastOwner`, `checkOrgBan` | 90 |
| src/core/auth/identity.ts | api/server-bootstrap.ts 48-228; api/org.ts 197-204, 274-281 (cookie wrappers become thin calls) | `resolveIdentity(client)` with IdentityLookupError, `resolveServerBootstrap` cached, viewer identity | 90 |
| src/core/auth/ensure-profile.ts | auth/provision-personal-workspace.ts 38-94 | `ensureProfile(userId, email, client)` on the shared service client | 45 |
| src/core/auth/route-policy.ts | auth/route-policy.ts 1-87; proxy.ts 26-105 | decideRoute with exact or prefix-plus-slash matching; proxy wiring that preserves the query string in `redirect` | 90 |
| src/core/auth/return-path.ts | auth/safe-return-path.mjs 6-12; signup/page.tsx 37-41 | `sanitizeReturnPath` rejecting control characters | 10 |
| src/features/auth/api/identity.ts | api/auth/identity/route.ts 41-69 | GET identity | 25 |
| src/features/auth/api/callback.ts | app/auth/callback/route.ts 21-60 | code exchange, ensureProfile, redirect | 35 |
| src/features/auth/api/orgs-create.ts | api/orgs/route.ts 8-62; orgs/create-org.mjs 13-112 | parse, `create_org_for_self`, settings and profile patches | 145 |
| src/features/auth/api/org.ts | api/orgs/[org_id]/route.ts 24-223 | GET org, PATCH name and slug, errors surfaced | 110 |
| src/features/auth/api/members.ts | members/route.ts 50-619 | list (bounded), role change, ban, remove, add by email | 240 |
| src/features/auth/api/invitations.ts | invitations/route.ts 14-154 | invite with email result, list with lazy expiry | 90 |
| src/features/auth/api/invitation-revoke.ts | invitations/[id]/route.ts 11-61 | URL-scope read then rpc | 40 |
| src/features/auth/api/invitation-token.ts | invitations/[token]/route.ts 11-50, accept 11-45, decline 11-44 | lookup, accept, decline sharing one regex and one rpc-error mapper | 80 |
| src/features/auth/api/invitations-mine.ts | invitations/mine/route.ts 7-63 | my pending invitations | 45 |
| src/features/auth/ui/AuthFrame.tsx | components/auth/AuthFrame.tsx 43-250 | the frame; isoWeekNumber imported from P1-17 | 170 |
| src/features/auth/ui/AuthPanel.tsx | components/auth/AuthPanel.tsx 11-184 | fields (44 px), tabs as Links, banners, check-email | 110 |
| src/features/auth/ui/LoginPage.tsx | app/login/page.tsx 37-180 | password and magic-link sign-in | 100 |
| src/features/auth/ui/SignupPage.tsx | app/signup/page.tsx 43-210 | sign-up with already-registered notice | 120 |
| src/features/auth/ui/ResetPasswordPage.tsx | app/auth/reset-password/page.tsx 23-112 | request reset | 65 |
| src/features/auth/ui/UpdatePasswordPage.tsx | app/auth/update-password/page.tsx 18-122 | set new password | 70 |
| src/features/auth/ui/AuthProvider.tsx | components/auth/AuthProvider.tsx 130-260 | client context; header reduced to one paragraph | 110 |
| src/features/auth/ui/identity-loader.ts | components/auth/identity-loader.ts 11-110 | bounded retry loader | 85 |
| src/features/auth/ui/InvitationPage.tsx | app/invitations/[token]/page.tsx 17-27 | server gate | 15 |
| src/ui/UserMenu.tsx (P1-18 shell owns it) | components/auth/UserMenuDropdown.tsx 43-134 | account dropdown with Esc and focus return | 70 |
| classify-signup-result | auth/classify-signup-result.mjs 6-13 | folded into SignupPage or features/auth/lib | 8 |
| pause gates (P1-05/06 sources) | api/pause.ts 18-96, 136-144 | readScrapeState, getScrapeState, isGloballyPaused, evaluateGenerationPause, pausedResponse; the judgement-drain trio and the source pause are not ported | 50 |
| surface read modules (ids owed, see Interface) | supabase-server.ts 99-5048 | dashboard, lists and aggregates, detail and themes, watchlist, operations, market, research, sources admin read | about 1,900 |

### Data model (columns actually used by auth-db; "unused" means no code in this scope reads or writes it)

- `profiles` (001_schema.sql plus later ALTERs): read `id, email, is_platform_admin` (service client or the rpc), `sector_overrides, full_name, display_name, avatar_url`; written `id, email, role='member', settings={}` (ensureProfile insert), `job_title, region, updated_at` (create-org). The LinkedIn chain wrote `linkedin_verified, verification_tier, full_name, headline, linkedin_url` (TRASH). Not touched by this module: `bio, sector, timezone, workspace_role, org_id, jurisdiction_overrides` and whatever other columns later migrations added; the full profiles column inventory was not derived here (the ALTER statements take several forms) [HYPOTHESIS].
- `organizations` (006): read `id, name, slug, plan, created_at`; written `name, slug, updated_at`. Unused here: `settings`.
- `org_memberships` (006): read `id, org_id, user_id, role, created_at` plus the embeds `organizations(id, name, workspace_settings(sector_profile))` and `profiles!user_id(full_name, display_name, email, avatar_url)`; written `role` (PATCH), insert `(org_id, user_id, role)` (PUT), delete (POST ban, DELETE), and through `accept_invitation` and `create_org_for_self`. No unused columns.
- `org_invitations` (076): read `id, org_id, invited_email, proposed_role, status, created_at, expires_at, accepted_at, declined_at, revoked_at, invited_by_user_id, token`, embed `organizations(name, slug)`; written by the INSERT `(org_id, invited_email, invited_by_user_id, proposed_role)` and by the rpcs. Written only by the rpcs, never read by this module: `accepted_by_user_id, revoked_by_user_id`.
- `org_member_bans` (156): read `user_id` by `(org_id, user_id)`; upsert `(org_id, user_id, banned_by, reason)`. Unused here: `banned_at` (default).
- `workspace_settings` (006, 251): read `profile, sector_profile`; written `sector_profile, profile`. Unused here: `jurisdiction_weights, default_filters, alert_config, home_sections, default_export_format, notify_on_sector_activation, sectors_activation_signup_at`.
- RPCs: `accept_invitation(p_token)`, `decline_invitation(p_token)`, `lookup_invitation(p_token)`, `revoke_invitation(p_invitation_id)`, `create_org_for_self(p_org_name, p_org_slug)`, `is_platform_admin()`; Supabase Auth admin: `auth.admin.getUserById`.
- Views: none.
- Not auth-db, inventoried for their owners: pause.ts reads `system_state(scrape_cadence, scrape_start_date, global_processing_paused, judgement_drain)`, `sources(processing_paused)`, `integrity_flags(id by subject_ref, status)`; supabase-server.ts reads 30 tables (intelligence_items 13 sites, org_memberships 2, profiles 1, sources 5, source_bias_tags 4, item_timelines, item_changelog, item_disputes, item_supersessions, item_cross_references, intelligence_item_sections, intelligence_item_citations, intelligence_changes, sector_contexts, workspace_item_overrides, user_watchlist, org_watchlist, market_series, published_price_statistics, regions, region_dimension_coverage, regional_data_facts, state_cost_facts, theme_briefs, connection_themes, connection_theme_runs, coverage_gaps, provisional_sources) and 7 rpcs (get_workspace_due_next, get_surface_counts, get_source_citation_stats, get_research_source_coverage, get_workspace_recent_changes, get_workspace_intelligence_aggregates, and the workspace-intelligence and category families by name) [CONFIRMED: `.from(`/`.rpc(` scan, 2026-10-11].

### Interface to other modules

- Exports offered: `requireUser`, `requireAdmin`, `isRefusal`, `workerAuthGuard`, `checkRateLimit`, `clientKey`, `rateLimitHeaders`; `getServiceSupabase`, `createSupabaseServerClient`, `createSupabaseBrowserClient`, `isSupabaseConfigured`, `describeSupabaseError`, `isUuid`; `fetchAllRows`, `exactCount`, `fetchAllByIdChunks`, `assertBound`; `resolveMembership`, `requireOrgWriter`, `resolveOrgIdFromCookies`, `resolveViewerIdentityFromCookies`, `resolveServerBootstrap`, `ensureProfile`; `isPlatformAdmin`, `requirePlatformAdmin`, `readOwnPlatformAdmin`; `authedFetch`, `authHeaders`; `useAuth`, `AuthProvider`, `AuthFrame`, `AuthPanel` parts; `sanitizeReturnPath`, `decideRoute`.
- Imports needed: P1-17 ui-kit (Button, Masthead, SectionHeader, the ISO week helper, tokens); P1-18 shell (bootstrap-seed types `AuthSeed`, `IdentityStatus`, `shouldShowAdminNav`; AppShell consumes `identityStatus`, `orgId`, `retryIdentity`; Sidebar consumes `isPlatformAdmin` and mounts UserMenu); P1-02 workspace (workspaceStore `setWorkspace`, `setUserRole`, `setSectorProfile`; `profile-contract.mjs`, `REGIONS`, `ALL_SECTORS`); telemetry `captureError`, `withErrorCapture`; email `sendInvitationEmail` (today a stub).
- Consumers by module: P1-25/26 admin (requireAdminRoute 40 routes, isPlatformAdmin 19, requirePlatformAdmin 26 pages); P1-22/23 community (requireCommunityRoute 37 routes, resolveOrgIdFromUserId); P1-02 workspace (requireOrgWriter 7 routes, resolveOrgIdFromCookies 17, fetchDashboardData and the list fetchers via data.ts); P1-05/06 sources (pausedResponse 4, getScrapeState, isGloballyPaused, workerAuthGuard 8).
- **Gap for the coordinator:** the brief's module id list (P1-02 workspace, P1-03/04 intake, P1-05/06 sources, P1-17 ui-kit, P1-18 shell, P1-22/23 community, P1-25/26 admin) has no id for the five customer-surface read layers that `supabase-server.ts` carries (dashboard, lists, detail, watchlist, operations, market, research). This register assigns them to "surface read modules" and leaves the ids owed. `src/lib/data.ts` (1,148 lines, the cache wrapper over these reads) is in no Part 1 scope this lane can see [HYPOTHESIS].

### Invariants this code enforces

Already in data-invariants.md: INV-136 (bans, promotion-only accept, role transitions guarded), INV-137 (privilege columns not self-writable), INV-138 (definer hygiene, grants), INV-139 (RLS everywhere, anon SELECT only), INV-149 (workspace org scope). Appended by this lane, same commit: INV-153 (an organisation keeps at least one owner; migration 370 for user-session writers, members/route.ts for the service-role path), INV-154 (every signed-in user has a profiles row; ensureProfile at the callback and in the bootstrap heal; no auth.users trigger exists [CONFIRMED: `grep -l "handle_new_user\|ON auth.users"` over migrations finds none]), INV-155 (an invitation revoke is scoped to the URL's org before the write and the invite token never reaches a log line; PR 1122).

Properties (not data invariants) the new tree must carry as tests or lint rules: PROP-011/109 (service client never downgrades), PROP-001/160 (admin routes gated), PROP-028/127 (bearer fetch through one module), PROP-039/141 (RLS on every table); plus three this register adds to the port's acceptance: route protection matches route segments, not string prefixes; return paths reject control characters; the limiter's header names what the code does.

### Rulings the code embodies (cite)

- Org-scoped ban, not a platform ban (operator ruling 2026-07-07, members/route.ts:254-258; migration 156).
- Sign-out lives in the Account menu; Admin is its own nav row (operator rulings 2026-09-07 and 2026-09-08, UserMenuDropdown.tsx:22-29, 105-109); 44 px rows.
- Identity seeding leaves the server render tree (ADR-026 follow-up, PERF-10; identity/route.ts:7-40, AuthProvider.tsx:96-129).
- JWT verified locally with getClaims, never getUser per request (PERF-2, PERF-6, PERF-7; proxy.ts:12-25, auth.ts:12-36, server-bootstrap.ts:32-46).
- `profiles.is_platform_admin` readable by nobody but the system; the session user asks the rpc (SEC-6, migration 375; platform-admin-gate.ts:8-13).
- Viewer role reads but never writes shared workspace tables (SEC-3b, migration 370; org.ts:84-119).
- A failed identity lookup is a 503 and a retry, never "no workspace" (lane AUTH-IDENTITY 2026-09-24; identity/route.ts:50-62, server-bootstrap.ts:88-106, AuthProvider.tsx:146-157).
- The auth callback creates the profile and nothing else; a user with no membership goes to onboarding (lane AUTH-2, 2026-10-06; callback/route.ts:16-20).
- Multi-org policy: the oldest membership is the active one (org.ts:17-19).
- CLAUDE.md API security policy: every route authenticates, 60 requests per minute per user, `/api/version` the one public exception.
- The one legal disclaimer sits at the foot of the auth frame and nowhere else (operator ruling 2026-09-08, AuthFrame.tsx:216-224).
- The band legend is taught on the auth frame once (onboarding artboard 17; AuthFrame.tsx:157-167).
- No fabricated numbers on the auth frame (CLAUDE.md rule 2; AuthFrame.tsx:157-167).

### Proof that the module works in the new tree

1. Route persona matrix (INV-076): every handler in features/auth/api answered as anon, viewer, other-org member, member, owner, platform admin; expected statuses from this register's rows.
2. Unit tests, each red against a deliberately broken copy first: `decideRoute` including `/loginx`, `/privacy-evil`, `/apixyz` and a preserved query string; `sanitizeReturnPath` with tab, newline, `//`, `/\\`; `classifySignUpResult`; the limiter's fixed window at the boundary; `requireUser` with cookie, bearer, expired and malformed claims; `resolveMembership` with two memberships (oldest wins) and with a read error; `ensureProfile` race (23505 then re-read); `assertNotLastOwner`.
3. Database attacks already in the schema step: 361, 370, 371, 375 self-checks (they stay).
4. Playwright: sign up, confirm, callback lands on onboarding; sign in with a redirect; forgot password round trip; invitation accept from the landing page; the auth frame at 375 px.
5. `npm run typecheck` and `next build` (the four-step CI).

### Port order

1. core/db/clients.ts and paginate.ts (everything imports them).
2. core/auth/claims.ts, guards.ts, platform-admin.ts (every route imports them).
3. core/auth/membership.ts, ensure-profile.ts, identity.ts.
4. core/auth/route-policy.ts and the proxy, return-path.ts.
5. features/auth/api: identity, callback, orgs-create, org, members, invitations, invitation-revoke, invitation-token, invitations-mine.
6. features/auth/ui: AuthFrame, AuthPanel, Login, Signup, Reset, Update, AuthProvider, identity-loader, InvitationPage; UserMenu to P1-18.
7. Hand pause.ts's live exports to P1-05/06 and the supabase-server.ts reads to the surface modules once their ids exist.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old file(s) | new home |
|---|---|---|
| Email and password sign-in | login/page.tsx | features/auth/ui/LoginPage |
| Magic-link sign-in | login/page.tsx:71-92 | LoginPage |
| Sign-up with confirmation email and safe `next` | signup/page.tsx | SignupPage |
| Already-registered detection on sign-up | classify-signup-result.mjs, AuthPanel AuthAlreadyRegisteredNotice | SignupPage |
| Signed-in user bounced away from /login and /signup | route-policy.ts:72, signup/page.tsx:59-73 | route-policy |
| Forgot password, reset link | reset-password/page.tsx | ResetPasswordPage |
| Set a new password on the recovery session | update-password/page.tsx | UpdatePasswordPage |
| Auth callback with code exchange, profile heal, same-origin return | auth/callback/route.ts | features/auth/api/callback |
| Protected-route redirect to /login with the return path | proxy.ts, route-policy.ts | core/auth/route-policy |
| Scanner-probe 404 before any auth work | route-policy.ts:12-16, proxy.ts:32 | route-policy |
| Client identity seed: user, org, role, sectors, admin bit, with bounded retry and rearm | identity/route.ts, server-bootstrap.ts, AuthProvider.tsx, identity-loader.ts | features/auth/api/identity, core/auth/identity, ui/AuthProvider |
| Three-valued orgId so "No workspace yet" never shows while loading | AuthProvider.tsx:15-46 | ui/AuthProvider |
| Cross-tab sign-in and sign-out sync; sign-out | AuthProvider.tsx:212-245 | ui/AuthProvider |
| Platform-admin gate for pages, routes and the nav flag | admin.ts, platform-admin-gate.ts, route-guard.ts | core/auth/platform-admin, guards |
| Worker-secret guard | worker-auth.ts | guards |
| Per-user and per-IP rate limit, 60 per minute, 429 with Retry-After | rate-limit.ts | guards |
| Bearer fetch helper for browser modules | authed-fetch.ts | kept as is |
| Create an organisation for self with sectors, size band, regions, job title | orgs/route.ts, create-org.mjs | api/orgs-create |
| Org read: name, slug, plan, owner since, member count | [org_id]/route.ts GET | api/org |
| Org rename and slug change (owner) | [org_id]/route.ts PATCH | api/org |
| Member list with display names | members GET | api/members |
| Role change with the last-owner guard | members PATCH | api/members |
| Org-scoped ban with typed reason, ban-then-delete order | members POST | api/members |
| Member removal, owner cannot remove self or the last owner | members DELETE | api/members |
| Add an existing account by email with the ban check | members PUT | api/members |
| Invite by email with a role; invite URL returned; email delivery state shown honestly | invitations/route.ts POST | api/invitations |
| List invitations with lazy expiry | invitations/route.ts GET | api/invitations |
| Revoke an invitation, scoped to the URL's org | invitations/[id]/route.ts | api/invitation-revoke |
| Invitation lookup, accept, decline by token | invitations/[token]/* | api/invitation-token |
| My pending invitations by email | invitations/mine | api/invitations-mine |
| Invitation landing page gate | invitations/[token]/page.tsx | ui/InvitationPage |
| Profile row provisioning and heal | provision-personal-workspace.ts | core/auth/ensure-profile |
| Account menu: profile, settings, sign out, Admin tag | UserMenuDropdown.tsx | P1-18 UserMenu |
| Auth frame: identity panel, band legend, legal disclaimer, one-column mobile | AuthFrame.tsx | ui/AuthFrame |
| Lossless paginated reads and exact counts | paginate.mjs | core/db/paginate |
| Scrape and generation pause gates, fetch-entry 503 | pause.ts | P1-05/06 sources |
| The five surfaces' server reads (dashboard, lists, detail, watchlist, operations, market, research, sources admin) | supabase-server.ts | surface read modules (ids owed) |
| LinkedIn identity verification import (writes `verification_tier`, `linkedin_verified`) | api/auth/linkedin/* | NOT PORTED as code (unwired, no UI, three env vars). The requirement, a verification tier on a community profile, is P1-22/23's; recorded here so it is not lost |

### Defects the new code must not repeat (from the backlog rows in scope, section 9 of the backlog file carries the STATUS cells)

Prefix matching in route protection (B-1980), control characters in return paths (B-1981), a dropped-error membership read answering 403 (B-0041), an unbounded member list (B-0082), the query string lost on the login bounce (B-0087), a wall-clock read during render (B-0123), 36 px inputs (B-0125), two guard families and a duplicated verifier (B-2145), a limiter header that misdescribes the algorithm (B-1547), a service client built outside the one factory (A4d B-DUP-1), fail-open source pause (B-0668).
