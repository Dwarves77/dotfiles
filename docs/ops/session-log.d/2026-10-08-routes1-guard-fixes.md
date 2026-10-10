# 2026-10-08, lane ROUTES-1 (routes1-guard-fixes): the route-guard register's findings, fixed at the cause

Source: `fsi-app/scripts/tmp/aud-at2-route-guard-register-2026-10-08.md` (AUD-AT-2, base dfb215db). Start condition met: PR 1003 MERGED (merge commit 5c57faa2) before the worktree was cut from origin/master cd88250a.

## Accomplished (one table per item)

### 1. F2 comment-proof (register AT2-6)

| route / file | before | after | test |
|---|---|---|---|
| `.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.mjs`, `admin/recompute-trust`, `admin/spot-check/recurring` | F2 passed both because the literal `x-worker-secret` sat in a header comment (route.ts:25 and :9); the real guard was never looked for | F2 strips comments (the existing `stripComments` of `.discipline/governance/coverage-scan.mjs`, which leaves `://` URLs intact) and an allowlisted worker route passes only if code contains `workerAuthGuard(`, the one idiom all 8 worker routes use (read in full: recompute-trust:48, spot-check/recurring:251, cache/revalidate-item:21, health/spend:94, health/surfaces:59, revalidate:36, worker/check-sources:37, worker/reconcile:28). The admin check (`isPlatformAdmin` or `requireAdminRoute`) also reads comment-stripped code. | `F2-admin-routes-isPlatformAdmin.test.mjs`: 18 tests. Negative: line-comment-only mention FAILS, block-comment-only FAILS, import-without-call FAILS, comment-only `requireAdminRoute` FAILS. Attack on the real tree: both real worker routes FAIL once `workerAuthGuard(` is renamed with their comments kept; every enumerated real route PASSES as committed. |
| F2 scope (`agent/run`, `coverage/entries`) | `enumerate()` was `api/admin/**/route.ts` only; the two routes that carry the admin gate outside that glob were unchecked | the mechanism F2 already had for named paths: a literal-path list `EXTRA_ADMIN_GATED_ROUTES` (same style as `WORKER_SECRET_ALLOWLIST`) spread into the `globFiles` call. 40 files in scope (38 + 2). `agent/run` passes through `requireAdminRoute`, `coverage/entries` through the inline `isPlatformAdmin`. | tests: enumerate includes both paths; the enumerate-shape test widened to the three path families. |

### 2. `/auth/reset-password` public (register AT2-12)

| route / file | before | after | test |
|---|---|---|---|
| `src/lib/auth/route-policy.ts` (the file that holds `PUBLIC_ROUTES`; `src/proxy.ts` only imports it) | `decideRoute({pathname:"/auth/reset-password", authenticated:false})` = `redirect-login`; the login page (login/page.tsx:142) and AuthPanel link to it | `/auth/reset-password` added to `PUBLIC_ROUTES`; `/auth/update-password` stays gated (it needs the recovery session the callback establishes) | `route-policy.test.mjs`: 3 new tests (anonymous GET is `allow`; update-password still redirects; an authenticated viewer is not bounced). |

### 3. Moderation `reports/[id]` POST (register R069)

| route | before | after | test |
|---|---|---|---|
| `src/app/api/community/moderation/reports/[id]/route.ts` POST | No reviewer check on the path. The report read is RLS-scoped, but `moderation_reports_select` (migration 182:25-31) includes `reporter_user_id = auth.uid()`, so a reporter reads their own open report, reaches the warn, mute and ban branches, and a notification is sent with the service role (`dispatchNotification`, notifications/dispatch.ts:51) before the RLS-gated UPDATE of the report. No rpc body is involved (the route calls no rpc). | `actorMayReview` (route.ts, private helper): `rpc("user_is_group_admin", {_group_id, _user_id})` for the report's group (post's group, or `target_id` for a group report), else `isPlatformAdmin` on the service client; 403 "Moderator or platform admin access required" before any side effect and before the 409 closed-report check; fails closed on an rpc error or an unknown group. The existing reads, the RLS-gated delete and update, and the 409 for reviewers are unchanged. | `reports/reviewer-gate.npmtest.mjs` (the file sits beside the `[id]` directory, not in it, because `node --test` reads a bracketed path as a glob and ran 0 tests): 11 tests. |

### 4. The 9 unguarded GETs (register AT2-3)

None needed a new session guard. Each response and its reader:

| route | response contains | client / reader | disposition |
|---|---|---|---|
| `api/version` GET (`route.ts:15`) | commit, ref, repo, env from Vercel env vars | no DB; read by audit tooling and CI | public by design (documented exception, fsi-app/.claude/CLAUDE.md "Public route exception") |
| `api/auth/identity` GET (`route.ts:42-43`) | the caller's bootstrap (empty identity with no session); heals a missing profile for a session user | cookie-bound anon-key client; `resolveServerBootstrapWithHeal` (server-bootstrap.ts), service-role INSERT only for the session user's own id | public by design (session is optional, resolution is the session's own) |
| `api/auth/linkedin/start` GET (`route.ts:54-72`) | a 302 to LinkedIn plus the OAuth state cookie | no DB | public by design (it begins the flow) |
| `api/detail/relevance` GET (`route.ts:37-41`) | `{relevance}` for one item | item: `fetchIntelligenceItem` (service role, filtered `provenance_status = 'verified'`, supabase-server.ts:4181-4184); relevance: `getViewerRelevanceForItem` resolves the org from the cookie session only (viewer-relevance.ts:34-35), returns `null` with no session, so no org-scoped read happens without a session; read by `components/shell/RelevanceBadgeClient.tsx:33` | stays open (verified public-surface item data; the org-scoped read is keyed by the caller's own session) |
| `api/listings/cursor` GET (`route.ts:79`) | regulations listing page | `getPublicListingsOnly`, the `get_workspace_intelligence_listings_public` RPC; response `Cache-Control: public` | stays open (public RPC only) |
| `api/listings/rest` GET (`route.ts:97`, `:102`) | regulations: public RPC page; operations: the caller's org listing | regulations through `getPublicListingsOnly`; operations through `getResourcesOnly`, which resolves the org from the cookie (data.ts:323) and returns an empty payload with the `null_orgId` sentinel when there is none (supabase-server.ts:3261-3262) | stays open (no org-scoped data without a session) |
| `api/obligations/register` GET (`route.ts:77`) | obligation register rows, facets | cookie-bound anon-key client, no service role; RLS is the boundary. Read by the Operations register view. | stays open per the brief's rule (anon client, no service role). What RLS returns to an anonymous caller was not read here: [HYPOTHESIS], not attacked. |
| `api/obligations/upcoming` GET (`route.ts:57`, `:75-77`) | upcoming forward events, default jurisdiction filter from the session's org profile | cookie-bound anon-key client, no service role; org from the cookie, soft-fails to no filter | stays open per the same rule; RLS content [HYPOTHESIS], not attacked. |
| `auth/callback` GET (`route.ts:47-50`) | a redirect | the code exchange is the authentication; `ensureProfile` inserts for the exchanged user | public by design (PUBLIC_ROUTES) |

### 5. Rate limiter (register AT2-7d)

The existing limiter (`src/lib/api/rate-limit.ts`, `checkRateLimit`) has ONE tier: 60 requests a minute in a sliding window, keyed by a string (the user id for every guarded neighbour: route-guard.ts:311, :325). Two neighbours read per kind: requireUserRoute and requireCommunityRoute (both call it with the user id).

| route method | before | after | test |
|---|---|---|---|
| the 8 worker-secret methods: `admin/recompute-trust` POST, `admin/spot-check/recurring` POST, `cache/revalidate-item` POST, `health/spend` GET, `health/surfaces` GET, `revalidate` POST, `worker/check-sources` POST, `worker/reconcile` POST | secret check only, no limiter | `checkRateLimit("worker:/api/<route>")` straight after `workerAuthGuard`: 60/min, one bucket per route (the one shared-secret holder is the principal, so the route is the key); an unauthorised call spends no slot | `src/app/api/limiter-coverage.npmtest.mjs`: representative route `cache/revalidate-item` (61st authorised call is 429 with Retry-After), bucket per route (`revalidate` unaffected), 70 refused calls spend no slot; the other 7 by a source-order check (guard first, limiter second, own bucket name). |
| `api/auth/linkedin/callback` GET | session check, no limiter | `checkRateLimit(user.id)` after the session check and before the token call to LinkedIn: the neighbours' tier and key | same file: 61st call by one user is 429 with no request to LinkedIn; another user's bucket is separate. |
| `api/version` GET | none | EXEMPT: a public GET of constant build metadata, no DB, no input; a limiter would only spend a bucket on a probe | none |

| the 8 anonymous methods: `auth/identity` GET, `auth/linkedin/start` GET, `detail/relevance` GET, `listings/cursor` GET, `listings/rest` GET, `obligations/register` GET, `obligations/upcoming` GET, `auth/callback` GET | none | `checkRateLimit(clientKey(request))` as the handler's first act (coordinator grant, 2026-10-08): `clientKey` (new, `src/lib/api/rate-limit.ts`, beside `checkRateLimit`) is `ip:<first x-forwarded-for entry, trimmed>`, else the one shared `anon:unknown` bucket (fail closed, never skip; on Vercel the header is always present). Same 60/min tier. `auth/identity` gained a `request` parameter to read the header. | `src/lib/api/rate-limit.npmtest.mjs` (4: forwarded header keys per address, trimmed; absent or empty header is the shared bucket; per-address exhaustion; shared bucket limited, not skipped). `limiter-coverage.npmtest.mjs`: representative route `auth/linkedin/start` (61st request from one address is 429, another address untouched; no header shares one bucket and is limited) and a source check on all 8 that the limiter runs before the first await. |

Tiers present: one limit (60/min) with three key kinds (user id, worker route, client address); one representative route is tested per key kind.

### 6. `fsi-app/.claude/CLAUDE.md`

One line: "except `/api/auth/callback`" now reads "except `/auth/callback`" (the file is `src/app/auth/callback/route.ts`; no route.ts exists under `src/app/api/auth/callback`).

### 7. Register rows

- Closed by SEC-3b, PR 1003 (merge 5c57faa2, helper `requireOrgWriter` in `src/lib/api/org.ts`), 13 of the 15 rows that wrote shared or org-wide rows on membership only: R121 and R122 (watchlist POST, DELETE, team scope), R136 and R137 (workspace/overrides POST, DELETE), R141 and R142 (portfolios/[id]/members POST, DELETE), R144 and R145 (portfolios/[id] PATCH, DELETE), R147 (portfolios POST), R148 and R149 (tags/[id]/items PUT, DELETE), R151 and R152 (tags POST, DELETE). Source: SEC-3b session log lines 51-53.
- The two left: R069 `community/moderation/reports/[id]` POST, CLOSED here (item 3). R118 `telemetry/error` POST: left unchanged, by coordinator ruling (2026-10-08). It is covered by the two controls it already has: the session gate and the per-user 60/min limiter, both in `requireUserRoute` (route-guard.ts:304-314), plus the 32 KB body cap. Recorded as covered, no further work.

## Read and reused

Read in full before writing: CLAUDE.md (root), `docs/dispatches/lane-common-contract.md`, the AUD-AT-2 register, `src/lib/api/route-guard.ts`, `rate-limit.ts`, `worker-auth.ts` (guard section), `community-auth.ts` (types), `src/lib/auth/route-policy.ts` and its test, F2 and its test, each of the 8 worker routes at its guard, the moderation route, the 9 unguarded routes (code lines), `viewer-relevance.ts`, the `resolveOrgIdFromCookies` section of `org.ts`, `getResourcesOnly` in `data.ts`, migration 182 (moderation_reports policies) and 046 (`user_is_group_admin`), the SEC-3b log, and the merged `viewer-read-only-routes.npmtest.mjs` (copied as the stub pattern).
Reused, not built: `checkRateLimit` (the only limiter), `workerAuthGuard`, `user_is_group_admin` and `isPlatformAdmin`, the coverage-scan `stripComments` (the repo has two other copies in F30 and F35; a third was not made), F2's own literal-path mechanism, the jiti-alias stub pattern of SEC-3b's route tests.

## Decisions

- F2 requires the CALL `workerAuthGuard(`, not a header read: every worker route uses it, and a direct header compare would be a second implementation of the secret check.
- The admin half of F2 is comment-stripped too (same flaw, same file, one change).
- The `PUBLIC_ROUTES` list lives in `route-policy.ts`; that is the "proxy/middleware file" edited.
- Worker limiter key `worker:/api/<route>`: the only unsettled detail for non-user callers; the tier (60/min) is the neighbours'. Anonymous callers: `clientKey(request)` per the coordinator grant.
- Test for the moderation route placed outside the bracketed directory (glob).

## What is NOT done

- Nothing from the brief's seven items is outstanding. The register's ATTACKED lens for the 19 route methods and 7 pages marked HYPOTHESIS was not run (out of scope). [WORK: TESTS-2]

## Verification run

- `node --test` on the touched files: `route-policy.test.mjs` 15/15, `F2-admin-routes-isPlatformAdmin.test.mjs` 18/18, `reviewer-gate.npmtest.mjs` 11/11, `limiter-coverage.npmtest.mjs` 22/22, `rate-limit.npmtest.mjs` 4/4; existing tests beside the touched routes (`recompute-trust/route.npmtest.mjs`, `health/spend/route.npmtest.mjs`, `worker/check-sources/route.npmtest.mjs`, `recompute-trust-scores.npmtest.mjs`) unchanged and green.
- Red against the old code (route files restored from HEAD, test files kept): route-policy 1 new test failed; F2 7 of 18 failed; moderation 9 of 11 failed; limiter and clientKey tests 14 of 26 failed (workers and linkedin callback 10 of 12 on the first pass).
- One extra command outside the brief's list: `node fsi-app/.discipline/fitness/runner.mjs --function=F2` (F2 only, 40 files, 0 violations), to confirm the widened scope on the real tree.
