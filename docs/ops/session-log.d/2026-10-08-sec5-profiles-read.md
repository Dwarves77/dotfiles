# 2026-10-08, lane SEC-5 (sec5-profiles-read): who may read which profile columns, built to R8.7 (migration 372, NOT APPLIED)

## Accomplished

- `fsi-app/supabase/migrations/372_profiles_read.sql` (header NOT APPLIED), one transaction:
  - Policy: `"Public read"` (USING true, role public, migration 002) dropped; `profiles_select_own_or_shared_org` FOR SELECT TO authenticated: own row, or a row whose user has an `org_memberships` row in an organisation the caller belongs to (`user_belongs_to_org`, migration 006, definer, so no recursion into profiles). No SELECT policy for anon.
  - Column privileges: SELECT revoked from PUBLIC and anon on the table and on every column (removes the 34-column anon grant of migration 165); authenticated's table-level SELECT replaced by a column grant on every column except `email`, list read from `pg_attribute` at apply time (the 364 idiom).
  - `public.my_profile()` (SETOF profiles, the caller's own full row, email included) and `public.community_identity(p_ids uuid[], p_query text default null)` (user_id, display_name, company_name, job_title, region, avatar_url, verified, anonymous). Both SECURITY DEFINER, `search_path = public, pg_temp`, `REVOKE ALL FROM PUBLIC, anon`, EXECUTE to authenticated and service_role only.
  - Self-check (one DO block, sentinel rollback, three fixture users in two organisations, `community_member_profiles` rows): anon SELECT of `id` and of `display_name` raises 42501; authenticated reading another organisation's row returns 0 rows, a same-organisation row 1, its own 1; own `email` and `SELECT *` raise 42501; `my_profile()` returns exactly the own row with its email; `community_identity` for the default-anonymous fixture returns NULL name, company and avatar with `anonymous` true and `verified` true, for the other-organisation fixture returns name and company with `anonymous` false; a name query finds the named fixtures and not the anonymous one, a second-token (surname) query finds the named member, a mid-token fragment finds nothing; a one-character, a wildcard and a NULL/NULL call return nothing; anon cannot execute either function; own `job_title` update still works; service_role still reads email; then a privilege and policy catalog pass.
- `372_profiles_read.test.mjs` (18 tests, node builtins only): migration text (policy, grants, hardening, no email or admin flag in the function result, per-user rule, token-start/escape/cap, attack legs) plus the code side (the eight routes and the rail no longer read `profiles`, the community page selects no email, the admin reads use the service client).
- `src/lib/community/identity.mjs` (+ `identity.test.mjs`, 13 new tests): the per-post half of R8.7 in one place (`effectiveAnonymous`, `authorBlockForPost`) and the injected-client loaders `loadCommunityIdentities` and `loadMyProfile`, with the `CommunityIdentityRow` typedef.
- `src/app/api/community/community-identity-routes.npmtest.mjs` (8 tests): the real handlers run with a stubbed guard and a fake client.
- `scripts/proof/attacks/attacks.json`: four attacks added (29 total), same shape: `sec5-profiles-anon-read-refused`, `sec5-profiles-cross-org-read-empty`, `sec5-profiles-email-column-refused`, `sec5-community-identity-anonymous-no-name`. Attacks suite tests 76 of 76 pass (manifest check that every function an attack names exists in a migration file passes).
- `docs/inventories/migrations.md` regenerated with its generator (333 rows, one added).

## Policy and grant, before and after

| Object | Before | After |
|---|---|---|
| profiles SELECT policy | `"Public read"` USING (true) TO public | `profiles_select_own_or_shared_org` TO authenticated: own row or shared organisation |
| anon on profiles | 34 columns SELECT (migration 165), every row visible | no table or column SELECT; 42501 |
| authenticated on profiles | table-level SELECT, every column of every row | column SELECT on every column except email; own and shared-organisation rows only |
| email | readable by every signed-in user for every user | not in the authenticated grant; own row via `my_profile()`; service_role only otherwise |
| is_platform_admin | readable by every signed-in user for every user | still in the column grant (see STOP below); rows limited to own and shared organisation |
| cross-organisation author identity | raw profiles rows | `community_identity()`: name, company, job title, region, avatar, verified, anonymous; default_anonymous applied in SQL |

## Src call sites, before and after (every user-session read of another user's profile or of email)

| Call site | Before | After |
|---|---|---|
| `api/community/posts/route.ts` GET and POST | `profiles` (full_name, avatar_url) + org_memberships company join under the caller's RLS | `community_identity` for names, company, job title, region, avatar; per-post flag applied at the row (legacy `author` block and `author_identity`); `community_member_profiles` read kept for org type, role, sector, verified |
| `api/community/posts/[id]/route.ts` GET, PATCH | `profiles` row | `community_identity` + `authorBlockForPost` (the select now carries `anonymous`) |
| `api/community/posts/[id]/replies/route.ts` GET, POST | `profiles` rows | same; the select now carries `anonymous` (a reply row has the column) |
| `api/community/search/route.ts` people scope | `profiles` ILIKE `%q%` on full_name | `community_identity(NULL, q)`: the start of any whitespace-separated token of the name, anonymous members not findable |
| `api/community/groups/[id]/members/route.ts` | `profiles` rows | `community_identity` by ids |
| `api/community/groups/[id]/invitations/route.ts` | `profiles` rows | `community_identity` by ids |
| `api/community/groups/[id]/invite-candidates/route.ts` | `profiles` ILIKE `%q%`, comment said it relied on the all-rows read | `community_identity(NULL, q)`, the local `escapeLike` removed (the RPC escapes) |
| `components/community/CouncilMembersRail.tsx` (server) | `profiles` rows | `community_identity` by ids |
| `app/community/page.tsx` line 138 (own row) | `profiles` incl. email | `my_profile()` through `loadMyProfile` |
| `app/community/page.tsx` line 234 (roster, same organisation) | `profiles` incl. email | `profiles` without email (readable under the new policy); name fallback chain loses the email step for peers |
| `app/community/page.tsx` line 322 (thread authors and sign-off requesters, cross-organisation) | `profiles` incl. email, workspace_role, org_id + `organizations` lookup | `community_identity`; author name, company; per-post and per-user anonymity -> "Anonymous member"; the `organizations` lookup removed; `isOwner` for other authors is false (cross-organisation workspace role is not R8.7 identity); the posts select carries `anonymous` |
| `app/community/directory/page.tsx` (aggregate over all rows) | user session, all profiles | service client for the four non-identifying columns (only counts leave the server). Not in the brief's list; the user session would have turned a platform-wide count into a one-organisation count silently |
| `app/admin/page.tsx` line 159 (members embed with email, all organisations) | user session | `getServiceSupabase()` behind `requirePlatformAdmin` |
| `components/admin/AdminDashboard.tsx` line 289 (browser refresh of the same embed) | browser client | `authedFetch("/api/admin/users")`; that platform-admin route (service client, `requireAdminRoute`, F2) now carries the profile embed |

Unchanged and confirmed service-role: `workspace/members`, `workspace/bootstrap/logic.ts`, `orgs/[org_id]/members`, `orgs/[org_id]`, `workspace/archive-impact`, `lib/supabase-server.ts` (owner roster, adders), `item-collab-route.ts` (roster). Unchanged own-row reads that select no email: UserProfilePage, OnboardingWizard, NoWorkspaceLanding, server-bootstrap, platform-admin-gate, admin.ts, shell-context, signoff decide, tags/server.ts and the watchlist adders (same-organisation).

Chip and types: `identity-format.ts` gains `authorIdentityLabel` and `ANONYMOUS_LABEL` ("Anonymous member"); `AuthorIdentityChip.tsx` renders that label, so an anonymous author is labelled, never blank, and keeps the Verified marker (before: an anonymous author with no org fields rendered nothing, including no Verified marker). `CommunityAuthorIdentity` and `AuthorIdentityProjection` already had name nullable, verified and anonymous, so `types.ts` and `api-client.ts` needed no change.

## Read and reused

- Read in full: the brief, COMMON.md, CLAUDE.md, lane-common-contract.md, SEC-3b's session log (origin/lane/sec3b-table-policies), spec 07 R8.7 amendment, migrations 002, 006 (`user_belongs_to_org`, `membership_read`), 165, 293, 336, 364 and 367 (the two-layer idiom, the self-check shape, the column-list-from-`pg_attribute` pattern), the route guard and `community-auth.ts`, all call-site files above, `identity.mjs` and its test, the attack engine, fixtures and manifest test, the SEC-3b viewer-route npmtest (template).
- Reused instead of building: `identity.mjs` as the home of the per-post rule and the loaders (no new src module), `projectAuthorIdentity` / `buildAuthorIdentityForRender` unchanged, `user_belongs_to_org` in the policy, the 364 grant idiom, the existing `GET /api/admin/users` route (extended with the embed) instead of a new admin route, `authedFetch`, `getServiceSupabase`, the attack engine's existing step kinds, the SEC-3b npmtest harness shape.

## Red then green

- `identity.test.mjs` with the new exports absent: the file fails to load (`does not provide an export named 'COMMUNITY_IDENTITY_RPC'`); with them: 29 of 29 pass.
- `identity-format.test.mjs` with `authorIdentityLabel` absent: fails to load (`does not provide an export named 'ANONYMOUS_LABEL'`); with it: 40 of 40 (both files) pass.
- `community-identity-routes.npmtest.mjs` with the seven route files restored to master: 0 of 8 pass (they read `profiles` and never call the RPC); with the change: 8 of 8 pass.
- `372_profiles_read.test.mjs`: written after the migration, so its red state was not captured (stated for honesty); it fails to load without the migration file (ENOENT) by construction.
- tsc (`--noEmit`) and eslint on the touched files: clean when run locally from the worktree.

## Decisions

1. [CONFIRMED by reading the migrations] `is_platform_admin` is NOT revoked from authenticated (deviation from brief item 2). RLS policies on other tables evaluate `profiles.is_platform_admin` as the querying user (created in 082, 099, 153, 166, 182, 195, 249, 277, 342, 355, 356); a column revoke makes every query on those tables raise 42501 for every signed-in user. Repointing them is another table's policies, outside the write set. [HYPOTHESIS, unverified on a live database] the claim that Postgres checks policy-expression column privileges against the caller is from the CREATE POLICY documentation and common Supabase practice (definer helpers in policies); the migration's own catalog assertion makes the apply fail loudly if the grant is ever removed, and the follow-up below is the safe order. The cross-organisation and anon exposure of the flag IS closed (rows limited to own and shared organisation; anon has nothing).
2. `avatar_url` is added to `community_identity` (not in the brief's column list), null when the member is default-anonymous: replies and the legacy author block render the headshot today, and a photograph identifies a member as much as a name. Remove the column if the coordinator disagrees.
3. `community_identity` rules beyond the brief, all fail-closed: a query shorter than two characters returns nothing, at most 25 rows per query, at most 200 ids per call, wildcards escaped, anon not granted EXECUTE (every Community route answers 401 without a session, so no route serves anon). Query matching is the start of ANY whitespace-separated token of the shown name (coordinator ruling on the first push: the brief's "name prefix" was wrong): "Surname" finds "Jane Surname"; a fragment from the middle of a token does not match (the old routes matched any substring).
4. company_name = the active organisation (`profiles.org_id`), else the earliest membership's organisation. The posts route used "first membership PostgREST returns".
5. Per-post vs per-user anonymity are strictly additive (either hides). A default-anonymous member's post that was explicitly written with `anonymous: false` therefore renders anonymous (privacy-safe direction); the previous behaviour (post flag wins) cannot be kept without letting any caller pass a flag that bypasses the per-user rule inside the RPC. Recorded as a limitation.
6. The directory aggregate and the `/api/admin/users` embed are in scope by the SEC-3b hand-off list (the brief's grant named "every platform-admin route or page that reads other users' profiles through the user session"); the directory is not admin but would have silently undercounted.
7. `/api/admin/users` GET returns memberships of every organisation (as it already did, behind the admin gate); the dashboard's server read and refresh now also see every organisation's members, where the user-session read saw only the admin's own organisations through `membership_read`. This is the platform-admin view the page claims to be.

## STOP / NEEDS WRITE-SET EXPANSION: finish the is_platform_admin revoke (staged, decision-ready)

Needs (a) a definer helper, (b) the policies repointed (another table's policies and a migration of its own), (c) own-row admin-flag readers switched to `my_profile()`, then (d) the revoke. Exact steps for the follow-up lane:

```sql
-- census (read-only): which live policies read the flag
SELECT schemaname, tablename, policyname, cmd FROM pg_policies
 WHERE qual ILIKE '%is_platform_admin%' OR with_check ILIKE '%is_platform_admin%';
-- helper (F69: REVOKE FROM PUBLIC + search_path)
CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp AS $$ SELECT coalesce((SELECT p.is_platform_admin FROM public.profiles p WHERE p.id = auth.uid()), false) $$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
-- per census row: ALTER POLICY <name> ON <table> USING (public.is_platform_admin() [OR <the policy's other arm>]);
-- (153 signoff_select also reads verifier_status: keep that arm as `OR EXISTS (... verifier_status = 'active')`, an own-row read that stays granted)
-- then, last:
REVOKE SELECT (is_platform_admin) ON public.profiles FROM authenticated;
```

Own-row readers of the flag through the user session that must move to `my_profile()` in the same lane: `lib/auth/admin.ts` (comment: self-read), `lib/auth/platform-admin-gate.ts`, `lib/api/server-bootstrap.ts`, `lib/community/shell-context.ts`, `api/community/signoff/[id]/decide/route.ts`, `lib/supabase-server.ts` isPlatformAdminInline (already service). Migration 372's catalog assertion on `is_platform_admin` must be inverted in that lane's migration.

## NOT done

- Nothing applied; nothing executed against Postgres (none on this machine). The self-check, and the four `sec5-*` attacks, run at apply time and in the chain-proof replay. [HYPOTHESIS] a fixture `auth.users` insert with only (id, aud, role, email, created_at, updated_at) succeeds on the live project (SEC-3b states the same assumption); if not, the role legs skip with a NOTICE and the catalog assertions still run.
- The `is_platform_admin` revoke (above).
- No rendering-guard or UX smoke run locally (CI runs them; Playwright is not set up in this worktree).
- The ordering of the merge with SEC-3b: both append to `scripts/proof/attacks/attacks.json`; whichever merges second resolves the array tail (the other's entries are independent). Migration 370 (SEC-3b) and 371 (SEC-4) are not on master yet; 372 depends on neither.

## Open items

- Apply order for the executor: migration 372 BEFORE this code merges (the code calls the RPCs; without 372 the Community routes get an RPC error and degrade to unnamed authors, and `my_profile()` is absent).
- Residual, by design of R8.7: `community_identity` by name can find any non-anonymous profile in the platform, not only people who have posted. Say so if a Community-participants-only restriction is wanted.
- Residual: `author_user_id` is still returned on anonymous posts (needed for the author's own edit and delete); it is a bare id, not an identity, but it links an anonymous author's posts to each other.

### UX compliance

- Block: `AuthorIdentityChip` (the author line on a post and on entity threads). Primary goal: tell the reader who is speaking and whether the source can be trusted. Path: zero steps, read in place. The one primary element is the identity line; the Verified marker is secondary and unchanged. Change: an anonymous author now reads "Anonymous member" (plus org type, role, sector, region when present) and keeps the Verified marker; before, an anonymous author with no other fields rendered nothing at all. Feedback states: none, the chip is presentational with no asynchronous action. Measured: the chip is inline text and a 10 px badge inside the existing post header row (it is not a row component and adds no interactive target, so law 2 does not apply); no new element changes the header's width on a 375 px viewport (the label is `overflow-wrap: anywhere`, shorter than the name and company line it replaces). Not run through the rendering guard locally; CI's UX smoke mounts the real Post and PostList.
- Block: `/community` thread rows and the roster (page.tsx), `CouncilMembersRail`. Layout unchanged; the only visible differences are "Anonymous member" in place of a name for an anonymous author and "Former member" unchanged for a deleted one. No new interactive element, no new asynchronous action.
- Block: admin members list. Layout unchanged; the data source moved to a platform-admin route; the refresh keeps its existing behaviour (a failed read sets an empty list, exactly as the old null-data path did; a thrown fetch hits the existing catch).

## Follow-up commit: search finds any token of the name (coordinator ruling 2026-10-08)

- `community_identity` p_query now matches `q%` OR `% q%` on the whitespace-normalised shown name (`regexp_replace(..., 's+', ' ', 'g')`), the escaped term built once in the `q` CTE. Same anonymity rule (a default-anonymous member is never matched), same two-character floor, same 25-row cap, wildcards still escaped.
- Self-check legs added: a second-token query ('Three') finds u3; the anonymous u2 is not found by its second token ('Two'); a mid-token fragment ('hree') finds nothing (filtered to the fixture id, so real rows cannot disturb the count).
- Attack `sec5-community-identity-anonymous-no-name` gains two steps: the default-anonymous member is not found by the second token of the name ('member_b'); a named member is found by the second token ('owner_a') and not by a mid-token fragment ('wner_a'). Attacks suite 76 of 76.
- Red then green: with the static test updated first, 2 of 18 failed (token rule and the new self-check legs absent from the SQL); after the SQL change 18 of 18 pass.
- Comments in the search route, the invite-candidates route and `identity.mjs` say "start of any token" instead of "prefix".

## Follow-up commit: apply abort fixed, region type mismatch (coordinator report, 2026-10-08)

- [CONFIRMED by the apply attempt] Migration 372 aborted at apply (rolled back, nothing recorded) with 42804 "COALESCE types text and text[] cannot be matched" in `community_identity`: `community_member_profiles.region` is text (migration 293), `profiles.region` is text[] (migration 105 converted it). My mistake: I read the 293 type and the profiles column name but not the 105 conversion, and no database was available to execute the function. Fix: `coalesce(c.region, nullif(array_to_string(p.region, ', '), ''))`.
- Self-check legs added, with fixtures: u3 has no community region and `profiles.region = ARRAY['EU','UK']`, asserted to return `'EU, UK'`; u2 has community region `'APAC'` and `profiles.region = ARRAY['EU']`, asserted to return `'APAC'` (the community region wins, and anonymity does not hide it).
- Every other coalesce in the function, with the column types read from the creating migrations:

| Expression | Left | Right | Source |
|---|---|---|---|
| `coalesce(nullif(btrim(p.full_name), ''), p.display_name)` (name) | text | text | full_name 007, display_name 001 |
| `coalesce(nullif(btrim(p.full_name), ''), p.display_name, '')` (normalised name) | text | text, text literal | same |
| `coalesce((SELECT o.name ...), (SELECT o2.name ...))` (company) | text | text | organizations.name 006 (`TEXT NOT NULL`) |
| `coalesce(c.verified, false)` | boolean | boolean | community_member_profiles.verified 293 (`boolean NOT NULL DEFAULT false`) |
| `coalesce(c.default_anonymous, false)` | boolean | boolean | community_member_profiles.default_anonymous 336 (`boolean NOT NULL DEFAULT false`) |
| `coalesce(c.region, nullif(array_to_string(p.region, ', '), ''))` (region, fixed) | text | text | 293 text; 105 text[] converted by `array_to_string` |

  Non-coalesce type edges also read: `p.job_title` text (007), `p.avatar_url` text (007), `p.org_id` uuid against `organizations.id` uuid (006, 105), `m.created_at` timestamptz and `m.id` uuid (006), `b.id = ANY(p_ids[1:200])` uuid against uuid[]; the result columns are cast to text where the source could be a varchar. The static test now asserts the region expression, the absence of the old form, and each of these source types against the creating migration files.
- Red then green: with the static test updated first, 2 of 21 failed (the region expression and the self-check legs absent); after the SQL change 21 of 21 pass; attacks suite unaffected (97 of 97 with it).
- What this does not prove: the function body has still never executed against Postgres from this lane (none on this machine). The type review above is by reading; the apply-time self-check is the execution.
