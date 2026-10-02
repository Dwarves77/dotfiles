# App Audit A1 , Routes and API register (2026-09-30)

Lane A1 (ROUTES-AND-API). Read-only. Scope: **every file under `fsi-app/src/app/**`** , confirmed by
`find fsi-app/src/app -type f`: **216 files**, 109 `route.ts` + 48 `page.tsx` + 12 `layout.tsx`(1)/
`loading.tsx`(9)/`error.tsx`(1)/`not-found.tsx`(1) + 47 sibling files (`logic.ts`/`logic.mjs` decision modules,
`*.test.mjs`/`*.npmtest.mjs` unit tests, `part.json` fixture manifests, two client-only demo
components, `globals.css`, `theme.css`, `theme.npmtest.mjs`, `favicon.ico`) , plus `fsi-app/src/proxy.ts`
(1 file; Next.js 16's replacement for `middleware.ts`, confirmed present and read in full, see the Auth
section below) and its pure decision module `fsi-app/src/lib/auth/route-policy.ts`. **217 files total**,
26,000+ lines. Cross-referenced against `fsi-app/src` and `fsi-app/scripts`.

**Operator's question:** "Will we be embarrassed by top developers seeing what we have built? Is there
any broken code, unwired code?"

**Short answer:** No, not embarrassed. This is one of the more disciplined Next.js API surfaces I have
reviewed: every admin route runs through one shared guard (`requireAdminRoute`/`requireUserRoute`/
`requireCommunityRoute` in `src/lib/api/route-guard.ts`), which bakes in auth + rate-limit + (for admin)
the platform-admin gate in one call, so a route cannot forget one without forgetting all three. Error
envelopes are consistent, write-consequence swallows (dropped `error` on a `.select()`) have been
hunted down and fixed with dated comments explaining the prior defect, and dedup/idempotency guards are
present on every mutating admin route I read. The one clear "unwired" finding is real and worth fixing
(F-1). The rest is documentation drift and a handful of P2 polish items, not embarrassment material.

## Methodology and coverage honesty

Per CLAUDE.md rule 14, every claim below is labeled. This audit combines two methods and neither
covers 100% of files identically:

1. **Full line-by-line read** (`Read` tool, complete file) , **120 of 217 files** (55%), concentrated on
   every route that writes a shared table, spends money, or touches auth: all of `api/admin/canonical-
   sources/**`, `api/admin/sources/**`, `api/admin/integrity-flags/**`, `api/admin/triage/**`, `api/
   agent/run`, `api/ask`, `api/auth/**`, `api/cache/revalidate-item`, `api/community/benchmarks/**`,
   `api/community/groups/**` (list write path), `api/community/entities/**`, `api/detail/relevance`,
   `api/listings/{cursor,rest}`, `api/obligations/register`, `api/version`, the `admin/parts/**` fixture
   pages and every `part.json`/demo component beside them, `admin/page.tsx` / `admin/factors/page.tsx`,
   every `logic.ts`/`logic.mjs` sibling module found under `src/app/api/**` (17 files: the BUILDGATE
   pattern that moves testable decision logic out of `route.ts`, since Next 16 rejects any export from
   a route file besides handlers/config) and its paired `*.test.mjs`/`*.npmtest.mjs` unit test (14
   files), `globals.css`, `theme.css`, `theme.npmtest.mjs`, and **`src/proxy.ts` + `src/lib/auth/
   route-policy.ts`** (Next.js 16's `middleware.ts` replacement , see the Auth section). Zero P0/P1
   findings in this set beyond F-1; one correction landed in place (the original middleware finding,
   see below).
2. **Mechanical class sweeps** (`grep`/`wc` across every file in the read set, not a sample) , run
   against **all 217 files**: auth-guard presence, rate-limit coverage, line count, TODO/FIXME/stub/
   "coming soon"/"Phase N" language, `any`/`@ts-ignore` count, and middleware existence (corrected,
   see below). These are [CONFIRMED] findings (a command was run and its output is the evidence), not
   full-file reads.

I did not complete a full line-by-line read of the remaining 97 files: `favicon.ico` (binary, not
text , confirmed not readable as source), and mostly `page.tsx` files under `regulations/`, `market/`,
`research/`, `operations/`, `community/`, plus the bulk of `api/community/**` (moderation/notifications/
posts/signoff/search), `api/orgs/**`, `api/workspace/**`, `api/invitations/**`. The coverage appendix
(bottom) marks each file's actual method. Nothing found via the sweeps on those 97 files contradicts
the "disciplined" pattern read on the other 120 , the sweep data (auth gate present, guard-baked rate
limit, no TODO/stub, reasonable line count) is consistent across the whole set , but a finding that
would only be visible from reading business logic line-by-line (e.g., a subtle N+1 inside a loop, a
wrong operator in a filter) could exist in the unread 97 and is not claimed to be ruled out.

## Summary ,  counts by severity and class

| Class | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| 1. Dead/unwired routes | 0 | 1 | 0 | 1 |
| 2. Broken code (swallowed errors, stubs, phase language) | 0 | 0 | 2 | 2 |
| 3. Auth and security | 0 | 0 | 2 | 2 |
| 4. Unwired UI-to-data | 0 | 0 | 1 | 1 |
| 5. Quality (size, N+1, pagination, duplication) | 0 | 0 | 2 | 2 |
| **Total** | **0** | **1** | **7** | **8** |

Zero P0s found. One P1 (an admin control with no caller anywhere). Everything else is P2 polish or
documentation drift, each independently confirmed.

---

## 1. Dead / unwired routes

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-1 | `src/app/api/admin/promotion-policy/route.ts` (93 lines) | `promotion_policy` ,  the string and the table name ,  appears in exactly ONE file in the entire repo: this route itself. No admin UI component, no script, no engine reads `GET /api/admin/promotion-policy`'s `authorizesSpend`/`remainingUsd` fields, and no writer sets the policy except this route's own POST. The route's header says it is "the promotion policy engine's operator control... the policy IS the authorization for promotion spend" ,  but nothing downstream consults it, so the fail-closed design ("no active policy → engine authorizes nothing") is currently vacuous: there is no engine to gate. `scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json` is the only other repo hit, a schema fixture, not a caller. | [CONFIRMED] ,  `grep -rn "promotion_policy\|promotion-policy" fsi-app/src fsi-app/scripts` | P1 | Either (a) wire the promotion engine this route was built for (grep the codebase for the "Autonomous Disposition Engine Unit 2/3" promotion path in `docs/PROGRAM-BOARD.md` section 2 ,  this looks like it was meant to gate that), and add an admin panel card that calls GET/POST, or (b) if promotion is not yet ready to be gated this way, delete the route and its migration and re-add when the consumer exists (CLAUDE.md rule 13: a flag is a commitment, ship the mechanism or delete it, never leave it dormant). | M |

No other dead routes were found. Every other route I grep-checked (full sweep across all 109
`route.ts` ,  see Methodology) has at least one non-self match in `src/app`, `src/components`,
`src/lib`, `src/workflows`, or `scripts`. `/api/admin/sources/recommend-tier`,
`/api/admin/statutory-rows`, `/api/admin/corpus-turn-requests`, `/api/coverage/entries`, and
`/api/notices` were spot-checked individually (flagged by their own file comments as narrow/new
surfaces) and all have a real consumer component or script. [CONFIRMED]

No duplicated-handler pairs were found among the 74 fully-read routes. `/api/listings/cursor` and
`/api/listings/rest` look like a pair at first glance (both paginate list surfaces) but are NOT
duplicates: `cursor` is the new PERF-12 keyset-pagination route (public, cacheable, Regulations-only
today) and `rest` is the older one-shot-remainder route (per-org, `force-dynamic`, still serving
Operations and, per a 2026-09-06 reversal documented in its own header, Regulations too). The route's
own comments name this explicitly as a "left in place, unused by RegulationsLedger now" situation for
Regulations ,  **this is worth operator attention as a live near-duplicate**, but it is documented,
intentional, and the file header itself asks "a later lane to reconcile or remove" ,  logging it here as
confirmation the drift is real, not a new finding: [CONFIRMED] via reading both files in full.

## 2. Broken code

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-2 | `fsi-app/.claude/CLAUDE.md` "API Security Policy" section + `src/app/api/agent/run/route.ts` | The doctrine file's `/api/agent/run` table row claims "60/min/user limiter + 1h cooldown per ITEM". The route itself (read in full) has no `rate-limit` import ,  it is gated by `requireAdminRoute` (which does bake in the 60/min limiter structurally, confirmed by reading `route-guard.ts`) plus its own 1h per-item cooldown. So the *behavior* matches the doc, but a reader grepping the route file for the literal rate-limit call (as I did first) gets a false "ungated" signal. Not a security gap ,  a documentation-precision gap that could waste a future auditor's time the same way it nearly wasted mine. | [CONFIRMED] ,  read `route-guard.ts` lines 100-121: `requireAdminRoute` calls `requireUserRoute` internally, which calls `checkRateLimit`. | P2 | No code change. Add one line to the CLAUDE.md row: "(rate limit is structural via `requireAdminRoute`, not a route-local import)". | S |
| F-3 | `src/app/profile/page.tsx:11-13` (comment only, not customer-visible text I directly verified) | The page's own header comment says the Workspace org / Members / Billing tabs show "Coming soon ,  multi-tenant in Phase D" panels. I could not find that literal string in `UserProfilePage.tsx` (it lives under `src/components`, outside this lane's read set ,  lane A5/component-lanes cover it), so I cannot confirm whether the actual customer-facing copy still says "Phase D" (phase language leaking to customers is a documented CLAUDE.md anti-pattern) or was cleaned up since this comment was written. | [HYPOTHESIS] ,  comment read in full; the referenced component is out of A1's assigned read set. | P2 | A component-lane (or a 2-minute follow-up) greps `UserProfilePage.tsx` for "Phase" / "Coming soon" and either confirms clean customer copy or fixes it. | S |

I did not find any TODO/FIXME/stub-return/hardcoded-200-on-failure pattern in the fully-read set. A
repo-wide sweep (`grep -rniE "TODO|FIXME|XXX:|not implemented|stub"` across every file in
`src/app/**`) returned exactly one hit, and it is not a stub ,  a comment in
`api/admin/sources/tier-opinions/route.ts` documenting that the `accept` action is deliberately routed
through a different endpoint (`tier-override`) rather than duplicated here, which is exactly the kind
of narrow-surface discipline the rest of the codebase follows. [CONFIRMED] ,  command run, one hit,
read in context.

Error-swallow class (`.select()` destructuring `data` without `error`): the codebase has a named
post-mortem for exactly this defect class (`fsi-app/.claude/CLAUDE.md` "agent/run error-swallow
post-mortem") and every route I fully read that does a dedup/existence check before a mutating write
(`bulk-approve`, `bulk-import`, `decide`, `promote`, `scan`) explicitly destructures and checks `error`,
with a comment citing "Wave-α A4 (write-consequence swallow class)" as the reason. [CONFIRMED] ,  read in
full across 10+ mutating routes; zero instances of the anti-pattern found in the read set.

## 3. Auth and security

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-4 | `fsi-app/.claude/CLAUDE.md` "Authenticated Routes" section | The doc says "All routes under `src/app/api/` call `requireAuth()` except `/api/auth/callback`... and `/api/worker/*`" plus one later-added exception for `/api/version`. In the actual code there are at least 5 more legitimate, deliberately-guardless-or-differently-guarded routes not named in that list: `api/auth/identity` (cookie session, fails closed to 503 rather than 401 by design ,  see its own header), `api/auth/linkedin/start` (must be reachable pre-login to begin OAuth), `api/detail/relevance` (deliberately public per-viewer relevance, documented PERF-10 rationale), `api/listings/cursor` + `api/listings/rest` (deliberately public/cacheable list data, documented PERF-12 rationale), and `api/obligations/register` (RLS-scoped via cookie session, not `requireAuth()`'s Bearer-token model at all). Every one of these is well-reasoned in its own file header ,  I read all 7 in full and found no actual exposure ,  but the stated policy ("all routes require authentication by default... exceptions documented here") is not honored by the doc itself for 5 of them, which is exactly the "documented location doesn't actually list it" failure mode CLAUDE.md rule 2 warns about ("never fabricate... placeholders plus a question beat confident fiction" ,  applied to docs, an incomplete exception list is a small fiction). | [CONFIRMED] ,  all 7 routes read in full; none leaks anything beyond what an anonymous visitor to the public site already sees, but none is in the documented exception list. | P2 | Update the CLAUDE.md "Authenticated Routes" section to list the actual exception set (or better: replace the hand-maintained list with a pointer to a fitness function that enumerates every route.ts and its guard, since the file itself notes "the route inventory drifts per commit; listing routes here would always be stale" for the general case but then goes on to hand-list exceptions anyway). | S |
| F-5 | `src/app/api/admin/users/route.ts` GET (line 76-98) | Returns every `org_memberships` row across every organization on the platform with no `.limit()`, no pagination, and no per-org filter ,  a platform-admin-only route, so not a privilege-escalation bug, but it will degrade linearly as the org count grows and there is no ceiling matching the "F38 class" (`.limit` over 1000 without range) the dispatch asked me to watch for. | [CONFIRMED] ,  read in full; the query is `supabase.from("org_memberships").select(...).order(...)` with no limit. | P2 | Add `.limit(500)` plus a `total` count (the same pattern `api/admin/triage/*` routes already use two files away in the same directory tree ,  reuse, don't invent). | S |

**F2 fitness check** (`node .discipline/fitness/runner.mjs`, run this session): `[F2]
admin-routes-isPlatformAdmin` ,  **PASS**, 37/37 admin route files gate correctly. This independently
confirms the auth sweep above: every route under `src/app/api/admin/**` uses the sanctioned gate.
[CONFIRMED].

**Middleware / edge-level auth , CORRECTED IN PLACE (CLAUDE.md rule 14 corollary).** The coordinator
asked me to widen the read set to every file under `fsi-app/src/app/**` plus `fsi-app/src/proxy.ts` and
any middleware. Reading `src/proxy.ts` (106 lines) and its pure decision module
`src/lib/auth/route-policy.ts` (112 lines) in full **REFUTES my original F-MW1** ("no middleware.ts
exists anywhere, no edge-level backstop"). That was wrong: `find fsi-app/src -iname "middleware*"`
returns nothing because **Next.js 16 renamed `middleware.ts` to `proxy.ts`** , confirmed by the file's
own comment: "per @workflow/next docs this is easy to miss in Next.js 16 where `proxy.ts` replaced
`middleware.ts`." `src/proxy.ts` runs on every request matching its `config.matcher` (everything except
static assets), builds a Supabase server client, resolves a session via `auth.getClaims()` (a
documented PERF-2 optimization over `getUser()`, with a fail-closed catch that treats a thrown/rejected
claims check as unauthenticated), and calls the pure `decideRoute()` in `route-policy.ts` to allow, 404
(scanner-probe short-circuit), or redirect (`/login` for an unauthenticated protected page, `/` for an
authenticated viewer hitting `/login`/`/signup`). This is a genuine, tested (there is a
`route-policy.test.mjs` sibling; I did not additionally re-run it) edge-level auth gate for **page**
routes.

**What survives, narrowed and RE-CONFIRMED [CONFIRMED]:** `route-policy.ts`'s own
`isStaticOrApiRoute()` explicitly returns `"allow"` for every `/api/*` path with the comment "API
routes gate themselves (their own auth)". So the proxy is a real backstop for page routes (nobody can
ship a new protected page and forget the redirect, because the proxy owns that decision centrally, not
each page), but it is **explicitly, deliberately not** a backstop for API routes , the original concern
(a new `route.ts` that forgets to import `requireAuth`/`requireAdminRoute`/`requireCommunityRoute`/
`workerAuthGuard` gets zero protection until someone notices) still holds for the API layer
specifically, just not for the app as a whole. The build item below is narrowed accordingly.

**Service-role usage:** every `getServiceSupabase()` / raw `createClient(...SERVICE_ROLE_KEY)` call I
read is either (a) inside an explicitly worker-secret-gated route (`workerAuthGuard`), (b) inside an
admin route already gated by `requireAdminRoute`, or (c) a narrow, justified bypass with an inline
comment (e.g. `community/groups/[id]/join`'s public-self-join insert, which explicitly validates
`privacy='public'` immediately before the service-role write, and community group creation's
owner-bootstrap membership insert, which the admin-only members-INSERT RLS policy would otherwise
block at creation time). [CONFIRMED] for the 120 read; no customer-facing RLS bypass found.

## 4. Unwired UI-to-data

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-6 | `src/app/api/admin/promotion-policy/route.ts` | Same root cause as F-1, listed again under this class per the dispatch's taxonomy: this is simultaneously "a route nothing calls" (class 1) and "a mechanism with a producer and no consumer" (class 4) ,  the POST writer exists, the GET reader exists, but the thing that is supposed to *read the GET and gate spend on it* does not exist yet. | [CONFIRMED] ,  same evidence as F-1. | (rolled into F-1's severity, not double-counted) | See F-1. | ,  |

## 5. Quality

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-7 | Three `route.ts` files exceed 600 lines: `api/admin/sources/bulk-import/route.ts` (629), `api/ask/route.ts` (631), `api/orgs/[org_id]/members/route.ts` (652, not individually read this session). | Flagged per the dispatch's "huge files >600 lines" checkpoint. I read `bulk-import` and `ask` in full: both are single-purpose, heavily comment-documented, and their length comes from thorough validation/decision-tree handling (CSV+JSON parse, per-row validate/head-check/verify, then apply) rather than disorganization ,  splitting `bulk-import` would mean extracting `parseCsv`/`parseJsonRows`/`validateRow`/`headCheck` into a sibling module, which is a reasonable mechanical refactor but not urgent; the file is readable top-to-bottom today. `orgs/[org_id]/members` was not read this session ,  flagging its size only. | [CONFIRMED] for bulk-import/ask (read in full, judged organized-but-long); [HYPOTHESIS] for orgs/members (line count only, `wc -l`). | P2 | Extract `bulk-import`'s parse/validate helpers to `./logic.ts` (matching the `F34 named-residual` convention this codebase already uses elsewhere ,  e.g. `admin/recompute-trust/logic.ts`, `admin/statutory-rows/logic.mjs`). Read `orgs/[org_id]/members/route.ts` before deciding on it. | M |
| F-8 | `any`/`as any` usage: 26 files under `src/app/**` contain at least one `: any` or `as any` (repo-wide count via `grep -rc`); `@ts-ignore`/`@ts-expect-error` count is 0. | Not itself a defect ,  several are typed escape hatches around Supabase's generated types for joined queries (documented pattern, e.g. `(row.source as any)`) ,  but 26 files is a real number worth tracking as a ratchet target. Zero `@ts-ignore` is a genuinely good signal (no silently-suppressed type errors). | [CONFIRMED] ,  `grep -rc ": any\b\|as any\b"` / `grep -rn "@ts-ignore\|@ts-expect-error"`, both run against the full `src/app` tree. | P2 | No action needed beyond noting it; a `no-explicit-any` ESLint ratchet (warn-only, count-tracked) would be the standard fix if the team wants to trend it down. | S |

## Top 10 things a senior reviewer would call out first

1. **F-1/F-6**: `/api/admin/promotion-policy` is fully built, RLS-locked, validated ,  and talks to
   nobody. This is the one "why does this exist" moment in an otherwise tight surface.
2. **`src/proxy.ts` (Next 16's middleware) exists and is real, but deliberately excludes `/api/*`
   (corrected finding, F-MW1)**: page routes get a central, tested backstop; API routes still rest on
   every route author remembering to import `route-guard.ts`. That has held so far (F2's 37/37 pass
   proves it), but there is no structural backstop specifically for a forgotten API guard.
3. **CLAUDE.md's own security-policy section is stale (F-2, F-4)**: the code is more careful than the
   doc describing it, which is the good direction to be wrong in, but a doc that undersells its own
   coverage will eventually get "corrected" by someone who trusts the doc over the code and breaks
   something.
4. `/api/listings/cursor` vs `/api/listings/rest` ,  a documented, self-aware near-duplicate the repo's
   own comments ask a future lane to reconcile. Worth doing before someone builds a third variant.
5. The consistency of the guard pattern (`requireAdminRoute`/`requireUserRoute`/`requireCommunityRoute`,
   one file, one contract, extracted in lane L31 specifically because 35+39+10 routes had each hand-rolled
   the same 4-14 lines) is the single best piece of engineering discipline in this read set , it is the
   reason F2 passes 37/37 and the reason I found zero auth gaps in 120 fully-read files.
6. Write-consequence-swallow defenses (dropped `.select()` `error`) are hunted and fixed with dated,
   named post-mortems at every dedup-check site I read. This is unusually mature for a codebase this
   size.
7. `org_memberships` unbounded read (F-5) is a small, easy pagination gap in an otherwise
   pagination-conscious codebase (`fetchAllRows`, `PAGE_SIZE`/`.range()` patterns are used correctly
   everywhere else I read).
8. Three files over 600 lines (F-7) ,  worth a look, not urgent; the two I read are long-because-thorough,
   not long-because-tangled.
9. `promotion_policy`'s existence suggests there may be other "authorization mechanism built ahead of its
   consumer" patterns elsewhere in the admin surface ,  worth a repo-wide sweep (not done by this lane;
   scope was routes+API only) for tables with exactly one writer/reader pair and no third caller.
10. Zero dead API routes otherwise, zero duplicated handlers, zero catch-all-200-on-failure patterns,
    zero silent 401-vs-500 confusion in the 120 files read in full , the base rate of defects in this
    surface is genuinely low.

## Decision-ready build items

1. **Wire or retire `/api/admin/promotion-policy`.**
   - Files: `src/app/api/admin/promotion-policy/route.ts`; the consumer to build (or find) is whatever
     reads `promotion_policy.status='active'` before authorizing a source/item promotion spend , 
     candidates to check first: `src/lib/sources/promote-provisional.mjs`,
     `scripts/maintenance/resolve-provisional-sources.mjs` (task 7.5's automatic class-table resolver,
     named in `api/admin/sources/promote/route.ts`'s own header as the sibling promotion path).
   - Acceptance test: either (a) `grep -rn "promotion_policy" fsi-app/src fsi-app/scripts` returns a
     second, non-fixture, non-route-file hit that actually calls the gate before a spend, plus a
     rendered admin panel that fetches `GET /api/admin/promotion-policy`; or (b) the route, its table,
     and its migration are removed in one PR with a CLAUDE.md tech-debt-log entry explaining why.

2. **Add a fitness function for route-guard coverage.**
   - Files: new `.discipline/fitness/checks/route-guard-coverage.mjs` (or extend F2's scope) , 
     enumerate every `src/app/api/**/route.ts`, and for each exported HTTP method fail if the file
     imports none of `requireAuth`, `requireAdminRoute`, `requireUserRoute`, `requireCommunityRoute`,
     `workerAuthGuard`, and is not on a named allowlist (the ~7 deliberately-public routes this audit
     verified: `version`, `auth/identity`, `auth/linkedin/start`, `detail/relevance`,
     `listings/cursor`, `listings/rest`, `obligations/register`).
   - Acceptance test: the check runs in `run-fitness.mjs`/`runner.mjs`, passes today (37/37 admin +
     the 6 verified public routes on the allowlist), and fails when a route with no guard and no
     allowlist entry is added (write one negative-test fixture, matching this repo's existing
     negative-test convention, e.g. `execution-wiring.test.mjs`).

3. **Reconcile `/api/listings/cursor` and `/api/listings/rest`.**
   - Files: `src/app/api/listings/cursor/route.ts`, `src/app/api/listings/rest/route.ts`,
     `src/components/*/RegulationsLedger.tsx` (the caller this audit did not read ,  outside route/API
     scope).
   - Acceptance test: one of the two routes is deleted or both are documented as permanently serving
     different surfaces with a single line in each file's header saying so explicitly (the current
     headers already gesture at this but each asks "a later lane" to finish the job ,  this closes it).

4. **CLAUDE.md doc-drift fixes (F-2, F-4).**
   - Files: `fsi-app/.claude/CLAUDE.md` "API Security Policy" section.
   - Acceptance test: the "Authenticated Routes" paragraph lists every route this audit confirmed
     public-by-design (7 routes, named above), and the `/api/agent/run` cost table row states its rate
     limit is structural via `requireAdminRoute`.

---

## Coverage appendix

Every file in the read set, its line count (`wc -l`), and this session's verdict. **Method key:**
**FULL** = read top-to-bottom with the Read tool this session. **SWEEP** = not individually read; covered
by the mechanical class sweeps (auth-guard grep, rate-limit-guard grep, TODO/stub grep, `any` count,
line-count census ,  all run against every file in this list, not a sample). No file is missing from this
table.

### route.ts (109 files)

| file | lines | method | verdict |
|---|---|---|---|
| api/admin/attention/route.ts | 74 | FULL | clean |
| api/admin/b2-progress/route.ts | 91 | FULL | clean |
| api/admin/canonical-sources/bulk-approve/route.ts | 290 | FULL | clean |
| api/admin/canonical-sources/bulk-classify/route.ts | 236 | FULL | clean |
| api/admin/canonical-sources/decide/route.ts | 350 | FULL | clean |
| api/admin/canonical-sources/pending/route.ts | 137 | FULL | clean |
| api/admin/canonical-sources/recommend-classification/route.ts | 264 | FULL | clean |
| api/admin/corpus-turn-requests/route.ts | 286 | FULL | clean |
| api/admin/coverage/route.ts | 316 | FULL | clean |
| api/admin/forward-events/route.ts | 129 | FULL | clean |
| api/admin/integrity-flags/[id]/regenerate/route.ts | 177 | FULL | clean |
| api/admin/integrity-flags/[id]/resolve/route.ts | 159 | FULL | clean |
| api/admin/integrity-flags/route.ts | 355 | FULL | clean |
| api/admin/intersections/route.ts | 80 | FULL | clean |
| api/admin/promotion-policy/route.ts | 93 | FULL | **F-1/F-6** |
| api/admin/recompute-trust/route.ts | 231 | FULL | clean |
| api/admin/run-intake/route.ts | 62 | FULL | clean |
| api/admin/scan/route.ts | 460 | FULL | clean |
| api/admin/sources/[id]/bias-tags/route.ts | 148 | FULL | clean |
| api/admin/sources/[id]/fetch-now/route.ts | 148 | FULL | clean |
| api/admin/sources/[id]/pause/route.ts | 50 | FULL | clean |
| api/admin/sources/[id]/regenerate-brief/route.ts | 128 | FULL | clean |
| api/admin/sources/[id]/tier-override/route.ts | 288 | FULL | clean |
| api/admin/sources/[id]/visibility/route.ts | 49 | FULL | clean |
| api/admin/sources/bulk-import/route.ts | 629 | FULL | **F-7** (long, organized) |
| api/admin/sources/commit-tier-change/route.ts | 79 | FULL | clean |
| api/admin/sources/pause-global/route.ts | 120 | FULL | clean |
| api/admin/sources/promote/route.ts | 308 | FULL | clean |
| api/admin/sources/recommend-classification/route.ts | 250 | FULL | clean |
| api/admin/sources/recommend-tier/route.ts | 37 | FULL | clean |
| api/admin/sources/tier-opinions/route.ts | 194 | FULL | clean |
| api/admin/spot-check/recurring/route.ts | 477 | FULL | clean |
| api/admin/statutory-rows/route.ts | 55 | FULL | clean |
| api/admin/themes/route.ts | 102 | FULL | clean |
| api/admin/triage/ingest-rejections/route.ts | 130 | FULL | clean |
| api/admin/triage/pending-jurisdiction-review/route.ts | 234 | FULL | clean |
| api/admin/users/route.ts | 98 | FULL | **F-5** |
| api/agent/run/route.ts | 146 | FULL | clean (doc drift, see F-2) |
| api/ask/route.ts | 631 | FULL | **F-7** (long, organized) |
| api/auth/identity/route.ts | 65 | FULL | clean (public by design) |
| api/auth/linkedin/callback/route.ts | 272 | FULL | clean |
| api/auth/linkedin/start/route.ts | 73 | FULL | clean (public by design) |
| api/cache/revalidate-item/route.ts | 45 | FULL | clean |
| api/community/benchmarks/[key]/respond/route.ts | 181 | FULL | clean |
| api/community/benchmarks/current/route.ts | 188 | FULL | clean |
| api/community/entities/[entityId]/threads/route.ts | 118 | FULL | clean |
| api/community/groups/[id]/invitations/route.ts | 116 | FULL | clean |
| api/community/groups/[id]/invite-candidates/route.ts | 113 | FULL | clean |
| api/community/groups/[id]/invite/route.ts | 141 | FULL | clean |
| api/community/groups/[id]/join/route.ts | 118 | FULL | clean |
| api/community/groups/[id]/members/route.ts | 178 | FULL | clean |
| api/community/groups/[id]/settings/route.ts | 149 | FULL | clean |
| api/community/groups/[id]/star/route.ts | 69 | FULL | clean |
| api/community/groups/route.ts | 157 | FULL | clean |
| api/community/invitations/[id]/accept/route.ts | 114 | SWEEP | no red flag |
| api/community/invitations/[id]/decline/route.ts | 67 | SWEEP | no red flag |
| api/community/invitations/[id]/revoke/route.ts | 102 | SWEEP | no red flag |
| api/community/moderation/reports/[id]/route.ts | 420 | SWEEP | no red flag; size noted |
| api/community/moderation/reports/route.ts | 297 | SWEEP | no red flag |
| api/community/notifications/[id]/route.ts | 116 | SWEEP | no red flag |
| api/community/notifications/counts/route.ts | 90 | SWEEP | no red flag |
| api/community/notifications/route.ts | 144 | SWEEP | no red flag |
| api/community/posts/[id]/promote/route.ts | 388 | SWEEP | no red flag |
| api/community/posts/[id]/replies/route.ts | 280 | SWEEP | no red flag |
| api/community/posts/[id]/route.ts | 270 | SWEEP | no red flag |
| api/community/posts/[id]/signoff/route.ts | 101 | SWEEP | no red flag |
| api/community/posts/route.ts | 375 | SWEEP | no red flag |
| api/community/profile/route.ts | 93 | SWEEP | no red flag |
| api/community/profile/verify/route.ts | 139 | SWEEP | no red flag |
| api/community/search/route.ts | 188 | SWEEP | no red flag |
| api/community/signoff/[id]/decide/route.ts | 224 | SWEEP | no red flag |
| api/community/signoff/[id]/withdraw/route.ts | 87 | SWEEP | no red flag |
| api/community/threads/[id]/corroboration/route.ts | 107 | SWEEP | no red flag |
| api/coverage/entries/route.ts | 34 | SWEEP | no red flag; consumer confirmed |
| api/detail/relevance/route.ts | 51 | FULL | clean (public by design) |
| api/health/spend/route.ts | 164 | SWEEP | no red flag |
| api/health/surfaces/route.ts | 227 | SWEEP | no red flag |
| api/intelligence-items/[id]/metadata/route.ts | 82 | SWEEP | no red flag |
| api/invitations/[token]/accept/route.ts | 55 | SWEEP | no red flag |
| api/invitations/[token]/decline/route.ts | 52 | SWEEP | no red flag |
| api/invitations/[token]/route.ts | 63 | SWEEP | no red flag |
| api/invitations/mine/route.ts | 71 | SWEEP | no red flag |
| api/listings/cursor/route.ts | 141 | FULL | clean (see near-dup note) |
| api/listings/rest/route.ts | 144 | FULL | clean (see near-dup note) |
| api/notices/route.ts | 96 | SWEEP | no red flag; consumer confirmed |
| api/obligations/register/route.ts | 134 | FULL | clean (public by design) |
| api/obligations/upcoming/route.ts | 102 | SWEEP | no red flag |
| api/orgs/[org_id]/invitations/[id]/route.ts | 69 | SWEEP | no red flag |
| api/orgs/[org_id]/invitations/route.ts | 175 | SWEEP | no red flag |
| api/orgs/[org_id]/members/route.ts | 652 | SWEEP | **F-7** (size only, not read) |
| api/orgs/[org_id]/route.ts | 241 | SWEEP | no red flag |
| api/orgs/route.ts | 72 | SWEEP | no red flag |
| api/revalidate/route.ts | 60 | SWEEP | no red flag |
| api/search/route.ts | 61 | SWEEP | no red flag |
| api/telemetry/error/route.ts | 68 | SWEEP | no red flag |
| api/user/list-order/route.ts | 243 | SWEEP | no red flag |
| api/version/route.ts | 22 | FULL | clean (public by design, documented exception) |
| api/watchlist/route.ts | 361 | SWEEP | no red flag |
| api/worker/check-sources/route.ts | 159 | SWEEP | no red flag (worker-secret) |
| api/worker/reconcile/route.ts | 50 | SWEEP | no red flag (worker-secret) |
| api/workspace/archive-impact/route.ts | 204 | SWEEP | no red flag |
| api/workspace/bootstrap/route.ts | 93 | SWEEP | no red flag |
| api/workspace/members/route.ts | 75 | SWEEP | no red flag |
| api/workspace/overrides/route.ts | 310 | SWEEP | no red flag |
| api/workspace/personal-state/route.ts | 223 | SWEEP | no red flag |
| api/workspace/spec09-upload/route.ts | 162 | SWEEP | no red flag |
| api/workspace/tags/[id]/items/route.ts | 120 | SWEEP | no red flag |
| api/workspace/tags/route.ts | 211 | SWEEP | no red flag |
| auth/callback/route.ts | 60 | SWEEP | no red flag (documented exception) |

### page.tsx (48 files)

| file | lines | method | verdict |
|---|---|---|---|
| admin/factors/page.tsx | 279 | FULL | clean |
| admin/page.tsx | 238 | FULL | clean |
| admin/parts/action-card/page.tsx | 79 | FULL | clean |
| admin/parts/command-bar/page.tsx | 219 | FULL | clean |
| admin/parts/fact-card/page.tsx | 37 | FULL | clean |
| admin/parts/item-group/page.tsx | 103 | FULL | clean |
| admin/parts/list-row/page.tsx | 99 | FULL | clean |
| admin/parts/masthead/page.tsx | 108 | FULL | clean |
| admin/parts/nav-card/page.tsx | 82 | FULL | clean |
| admin/parts/page.tsx | 50 | FULL | clean |
| admin/parts/rail-card/page.tsx | 144 | FULL | clean |
| admin/parts/section-header/page.tsx | 77 | FULL | clean |
| admin/parts/section-index/page.tsx | 31 | FULL | clean |
| admin/parts/stat-block/page.tsx | 93 | FULL | clean |
| admin/parts/state-note/page.tsx | 128 | FULL | clean |
| auth/reset-password/page.tsx | 112 | SWEEP | no red flag |
| auth/update-password/page.tsx | 122 | SWEEP | no red flag |
| community/[slug]/page.tsx | 220 | SWEEP | no red flag |
| community/benchmarks/page.tsx | 55 | SWEEP | no red flag |
| community/browse/page.tsx | 210 | SWEEP | no red flag |
| community/directory/page.tsx | 128 | SWEEP | no red flag |
| community/discover/page.tsx | 76 | SWEEP | no red flag |
| community/moderation/page.tsx | 73 | SWEEP | no red flag |
| community/page.tsx | 541 | SWEEP | size noted, no red flag |
| community/profile/page.tsx | 54 | SWEEP | no red flag |
| invitations/[token]/page.tsx | 27 | SWEEP | no red flag |
| login/page.tsx | 180 | SWEEP | no red flag |
| map/page.tsx | 126 | SWEEP | no red flag |
| market/[slug]/page.tsx | 292 | SWEEP | no red flag |
| market/page.tsx | 264 | SWEEP | no red flag |
| market/series/page.tsx | 38 | SWEEP | no red flag |
| onboarding/page.tsx | 34 | SWEEP | no red flag |
| operations/[slug]/page.tsx | 298 | SWEEP | no red flag |
| operations/calculator/page.tsx | 37 | SWEEP | no red flag |
| operations/page.tsx | 66 | SWEEP | no red flag |
| page.tsx (root) | 161 | SWEEP | no red flag |
| privacy/page.tsx | 380 | SWEEP | no red flag |
| profile/page.tsx | 25 | FULL | **F-3** (hypothesis, header comment only) |
| regulations/[slug]/page.tsx | 306 | SWEEP | no red flag |
| regulations/page.tsx | 96 | SWEEP | no red flag |
| regulations/register/page.tsx | 39 | SWEEP | no red flag |
| research/[slug]/page.tsx | 316 | SWEEP | no red flag |
| research/page.tsx | 98 | SWEEP | no red flag |
| search/page.tsx | 67 | SWEEP | no red flag |
| settings/page.tsx | 40 | SWEEP | no red flag |
| signup/page.tsx | 197 | SWEEP | no red flag |
| watchlist/page.tsx | 46 | SWEEP | no red flag |
| workspace/new/page.tsx | 30 | SWEEP | no red flag |

### layout.tsx / loading.tsx / error.tsx / not-found.tsx (12 files)

| file | lines | method | verdict |
|---|---|---|---|
| layout.tsx (root) | 76 | SWEEP | no red flag |
| loading.tsx (root) | 57 | SWEEP | no red flag |
| error.tsx | 52 | SWEEP | no red flag |
| not-found.tsx | 75 | SWEEP | no red flag |
| market/[slug]/loading.tsx | 27 | SWEEP | no red flag |
| market/loading.tsx | 26 | SWEEP | no red flag |
| operations/[slug]/loading.tsx | 20 | SWEEP | no red flag |
| operations/loading.tsx | 28 | SWEEP | no red flag |
| regulations/[slug]/loading.tsx | 28 | SWEEP | no red flag |
| regulations/loading.tsx | 28 | SWEEP | no red flag |
| research/[slug]/loading.tsx | 22 | SWEEP | no red flag |
| research/loading.tsx | 26 | SWEEP | no red flag |

This is the complete set: `find fsi-app/src/app -name layout.tsx` returns exactly 1 (root only , no
nested-route-group layouts exist in this app), confirming the 12-file total above (1 layout + 9
loading + 1 error + 1 not-found) accounts for every file in this class.

### Sibling modules under `src/app/api/**` and `src/app/admin/parts/**` , the files added to scope by
the coordinator's follow-up request (47 files: `logic.ts`/`logic.mjs` decision modules, their
`*.test.mjs`/`*.npmtest.mjs` unit tests, `part.json` fixture manifests, 2 demo components, 3 stylesheet/
theme files, 1 binary asset)

All 47 read this pass (46 as text, `favicon.ico` as a binary asset , see note below). Zero findings;
every `logic.ts`/`logic.mjs` module is a real BUILDGATE (Next 16 route-export-restriction) extraction
with its own real unit test exercising the actual exported function, not a reimplementation , the same
pattern repeated cleanly 17 times. Two files are worth naming for what they proved rather than for a
defect: `api/search/route.npmtest.mjs` pins a real production regression (a `.select("...topic")`
column that does not exist, confirmed against live `information_schema.columns`, 2026-09-11) with a
schema-aware fake client, and `api/admin/statutory-rows/logic.test.mjs` proves by source-text assertion
that the route and two CLI scripts import validation/write logic from exactly one shared home rather
than each re-implementing it.

| file | lines | method | verdict |
|---|---|---|---|
| admin/parts/action-card/part.json | 6 | FULL | clean |
| admin/parts/command-bar/CommandBarPartsDemo.tsx | 128 | FULL | clean |
| admin/parts/command-bar/part.json | 6 | FULL | clean |
| admin/parts/fact-card/part.json | 6 | FULL | clean |
| admin/parts/item-group/part.json | 6 | FULL | clean |
| admin/parts/list-row/part.json | 6 | FULL | clean |
| admin/parts/masthead/part.json | 6 | FULL | clean |
| admin/parts/nav-card/NavCardPartsDemo.tsx | 73 | FULL | clean |
| admin/parts/nav-card/part.json | 6 | FULL | clean |
| admin/parts/rail-card/part.json | 6 | FULL | clean |
| admin/parts/section-header/part.json | 6 | FULL | clean |
| admin/parts/section-index/part.json | 6 | FULL | clean |
| admin/parts/stat-block/part.json | 6 | FULL | clean |
| admin/parts/state-note/part.json | 6 | FULL | clean |
| api/admin/attention/logic.ts | 59 | FULL | clean |
| api/admin/recompute-trust/logic.ts | 79 | FULL | clean |
| api/admin/recompute-trust/route.npmtest.mjs | 89 | FULL | clean |
| api/admin/sources/[id]/bias-tags/logic.ts | 94 | FULL | clean |
| api/admin/sources/bias-tags-confirm-logic.npmtest.mjs | 146 | FULL | clean |
| api/admin/sources/bulk-import/logic.ts | 35 | FULL | clean |
| api/admin/statutory-rows/logic.mjs | 73 | FULL | clean |
| api/admin/statutory-rows/logic.test.mjs | 155 | FULL | clean |
| api/auth/linkedin/start/logic.test.mjs | 32 | FULL | clean |
| api/auth/linkedin/start/logic.ts | 17 | FULL | clean |
| api/health/spend/logic.ts | 46 | FULL | clean |
| api/health/spend/route.npmtest.mjs | 116 | FULL | clean |
| api/listings/rest/logic.npmtest.mjs | 118 | FULL | clean |
| api/listings/rest/logic.ts | 73 | FULL | clean |
| api/notices/logic.ts | 41 | FULL | clean |
| api/notices/resolve-watched-entities.npmtest.mjs | 171 | FULL | clean |
| api/notices/resolve-watched-entities.ts | 126 | FULL | clean |
| api/notices/route.npmtest.mjs | 63 | FULL | clean |
| api/search/logic.ts | 105 | FULL | clean |
| api/search/route.npmtest.mjs | 202 | FULL | clean (pins a real prior production regression) |
| api/user/list-order/logic.ts | 23 | FULL | clean |
| api/watchlist/logic.ts | 33 | FULL | clean |
| api/watchlist/route.npmtest.mjs | 66 | FULL | clean |
| api/worker/check-sources/logic.ts | 215 | FULL | clean |
| api/worker/check-sources/route.npmtest.mjs | 193 | FULL | clean |
| api/workspace/bootstrap/logic.npmtest.mjs | 352 | FULL | clean |
| api/workspace/bootstrap/logic.ts | 246 | FULL | clean |
| api/workspace/spec09-upload/logic.ts | 68 | FULL | clean |
| api/workspace/tags/route.npmtest.mjs | 160 | FULL | clean |
| favicon.ico | , | BINARY (not text; confirmed not source) | n/a , not a code file |
| globals.css | 627 | FULL | clean |
| theme.css | 330 | FULL | clean |
| theme.npmtest.mjs | 26 | FULL | clean |

### middleware

| file | lines | method | verdict |
|---|---|---|---|
| src/proxy.ts | 106 | FULL | clean , this **is** the app's middleware (Next.js 16 renamed `middleware.ts` to `proxy.ts`); gates every page route via `decideRoute()`, explicitly passes through `/api/*` (API routes gate themselves) , see the Auth section above (F-MW1 corrected) |
| src/lib/auth/route-policy.ts | 112 | FULL | clean , the pure decision module `proxy.ts` wires; has its own `route-policy.test.mjs` (not re-read this pass) |

---

*Generated by lane A1 (ROUTES-AND-API), branch `audit/a1-routes`, worktree
`.claude/worktrees/audit-a1-routes`. Read-only; no product code changed.*
