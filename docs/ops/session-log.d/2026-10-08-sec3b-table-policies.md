# 2026-10-08, lane SEC-3b (sec3b-table-policies): table policies and triggers that let a user change their own standing (migration 370, NOT APPLIED; item 5 stopped)

## Finding

- [CONFIRMED by catalog read, privilege census 2026-10-08] organizations.plan, the community_member_profiles verification columns, org_memberships.role, community_posts sign-off, author and group columns, the sign-off request status and decide path, community_groups.owner_user_id, and the viewer role on six workspace tables were all reachable by a signed-in user through PostgREST. The census read them from the live catalog; this lane executes each exploit under rollback in the migration self-check (never against live).
- [CONFIRMED by code read] two extra holes in the same policies, closed by the same triggers: membership_update_admin has no WITH CHECK, so an admin could re-point a membership row at another org (org_id) or another user (user_id); signoff_decide has no WITH CHECK, so a verifier could rewrite requested_by to dodge a self-decision rule. community_posts sign-off columns were also INSERTable, not only UPDATEable.
- [CONFIRMED by code read] the viewer gap is wider than the policies: the routes that write the six tables (api/workspace/overrides, api/watchlist, api/workspace/tags, api/workspace/tags/[id]/items, api/workspace/portfolios and children) use the service-role client, which bypasses RLS, and none checks the caller's role (overrides gates only the workspace-scope archive). The policy change closes direct PostgREST writes; it does not close the routes. See NEEDS WRITE-SET EXPANSION.

## Accomplished

- `fsi-app/supabase/migrations/370_privilege_table_policies.sql` (header NOT APPLIED), one transaction, items 1, 2, 3, 4, 6, 7 of the brief:
  - Helper `is_sanctioned_writer(regclass)`: current_user in service_role, postgres, supabase_admin, or the table owner (the 364 and 367 idiom, one copy instead of six).
  - Item 1 organizations.plan: table-level INSERT and UPDATE revoked from PUBLIC, anon, authenticated, column grants re-issued without plan (list read from pg_attribute); trigger `organizations_plan_guard`.
  - Item 2 community_member_profiles verified, verified_at, verification_method, organisation_key: same two layers; trigger `community_member_profiles_verification_guard`. No src change needed: the verify route already uses the service-role client.
  - Item 3 org_memberships: trigger `org_membership_role_guard` (INSERT, UPDATE, DELETE). Only an owner grants or revokes owner; an admin sets member, viewer or admin; nobody changes their own role; the last owner cannot be demoted or removed; org_id and user_id never change. The three membership policies stay.
  - Item 4 community_posts: signed_off_at and signed_off_by revoked for INSERT and UPDATE, author_user_id revoked for UPDATE (it stays INSERTable: the posts route inserts it); trigger `community_posts_guard` also gates group_id moves on user_is_group_admin of both groups. The decide route already stamps with the service-role client, so there is no STOP.
  - Item 6: `user_can_write_in_org(uuid)` (member, admin, owner; SECURITY DEFINER, pinned search_path, EXECUTE to authenticated and service_role); 15 ALTER POLICY statements switch the INSERT, UPDATE and DELETE policies of workspace_item_overrides, org_watchlist, workspace_tags, item_workspace_tags, portfolios, portfolio_members. SELECT policies untouched.
  - Item 7: trigger `community_post_signoff_requests_guard` (INSERT pinned to pending; a decision is refused when the caller or the recorded verifier is the requester; requested_by and post_id fixed) and `community_groups_owner_guard` (owner_user_id moves only by the current owner or service role).
  - Self-check (one DO block, sentinel rollback): 6 fixture auth.users plus profiles, 2 orgs, 2 groups, 2 posts, attacks as authenticated through a fixture JWT sub and as service_role, about 60 legs counting controls, layer 2 proven alone by restoring the column grants inside the rolled-back block, then a privilege-catalog assertion pass (temporary grants gone, legitimate columns kept, six triggers enabled, 15 policies switched, no SELECT policy switched).
- `370_privilege_table_policies.test.mjs` (24 tests, node builtins only).
- `fsi-app/scripts/proof/attacks/attacks.json`: 6 attacks added in the existing shape (31 total): sec3b-org-plan-self-upgrade-refused, sec3b-member-verified-badge-refused, sec3b-org-membership-role-escalation-refused, sec3b-post-signoff-and-author-forgery-refused, sec3b-signoff-self-decision-and-group-takeover-refused, sec3b-viewer-cannot-write-workspace-tables. attacks-manifest, run-attacks, attack-engine and fixtures tests pass.
- Viewer UI (item 6; write-set expansion granted for these components), all reading `useWorkspaceStore((s) => s.userRole) === "viewer"`, the role read the other role-gated screens use (BriefingScheduleSection, OrganisationProfileSection, RegulationDetailSurface): `ui/ActionRow.tsx` (no + Tag), `ui/DetailTagRow.tsx` (no pill remove), `ui/WatchButton.tsx` (no team watch; personal watch stays), `regulations/PriorityDropdown.tsx` (no priority or dismiss items; no empty kebab), `portfolio/PortfolioIndexView.tsx` (no create form), `portfolio/PortfolioDetailView.tsx` (no remove, rename, delete, add-search, clear-unheld action). Test `src/components/ui/viewer-read-only.test.mjs` (11 tests).
- `docs/inventories/migrations.md` regenerated with its generator (330 rows).

## Read and reused

- Read in full: the brief, COMMON.md, CLAUDE.md, lane-common-contract.md, the privilege census, spec 05 section 2, migrations 364 (function, grants, trigger, self-check shape, test conventions: reused as the two-layer pattern and the current_user idiom), 367 (CREATE OR REPLACE precedent, sanctioned-caller wording), 006, 046, 077, 153, 154, 156, 191, 259, 293, 313, 362 and the 030 and 190 post and counter definitions, `scripts/proof/attacks` (engine, fixtures, manifest test, two existing attacks as templates), the six viewer-gap routes' client use, the community routes' client use (requireCommunityRoute is the cookie-bound RLS client), S8-A's role handling on the lane/s8a-notes-assignment branch (canWrite over owner, admin, member; unmerged, so not importable).
- Reused: user_belongs_to_org's shape for the new function; user_is_group_admin as is; the existing `(select auth.role())` policy style from 259; workspaceStore userRole instead of a new role hook; ALTER POLICY instead of drop and create, so roles, names and unchanged clauses stay.

## Red then green

- `node --test supabase/migrations/370_privilege_table_policies.test.mjs` with the migration file moved aside: the suite fails to load (ENOENT, 1 test, 0 pass). With the file: 24 of 24 pass. `viewer-read-only.test.mjs`: 11 of 11 pass; the six components were edited before the test existed, so its red state was not captured, stated for honesty.

## Before and after, per item

| Item | Before | After |
|---|---|---|
| 1 organizations.plan | org owner or admin could UPDATE plan (policy org_update_admin, table-level UPDATE) | column privilege denies (42501); trigger denies if the grant returns; service_role and postgres only |
| 2 verification columns | member could set verified, verified_at, verification_method, organisation_key on own row (INSERT or UPDATE) | same two layers; the verify route (service role) is the only writer |
| 3 org_memberships.role | admin could grant owner, demote or remove an owner, re-point a row at another org; last owner removable | trigger rules above; policies unchanged; service_role and definer functions exempt |
| 4 community_posts | author could stamp signed_off_at and signed_off_by (UPDATE and INSERT), moderator could rewrite the author, author could move a post to any group | stamp and author columns closed at grant and trigger; group move needs moderator or admin of both groups |
| 6 viewer gap | viewer satisfied every write policy on 6 tables | 15 write policies require member, admin or owner; reads unchanged; UI controls hidden for viewer |
| 7 sign-off and ownership | request status unpinned on INSERT; a verifier could decide their own request; a moderator could take group ownership | trigger pins pending, refuses requester as verifier, fixes requested_by and post_id; only the current owner transfers |

## Src call sites changed

- Item 2: none (verify route is already service-role; profile route upserts only allowed columns). Item 4: none (decide route is already service-role; the posts PATCH sends title and body; CommunityRooms updates referenced_intelligence_item_ids, all still granted). Item 5: none (stopped). Item 6: the six components above.

## Route enforcement of the viewer role (expansion GRANTED by the coordinator, built)

- Every write handler of the seven service-role routes calls one gate, `requireOrgWriter(userId, orgId)`, added to `src/lib/api/org.ts` beside `resolveOrgMembershipFromUserId` (coordinator grant after F45 flagged the first, inline version as duplicated code). It returns `{ membership }` or `{ response }`: role viewer gives 403 `{ error: "viewer_read_only" }`, owner, admin and member give their membership, no membership of that org (or a null org, or a failed read, fail closed) gives the routes' existing 403 "User has no organization membership", unchanged. The route returns `response` as is, before any write; reads are unchanged. Routes: `workspace/overrides` (POST, DELETE), `watchlist` (POST, DELETE, TEAM scope only), `workspace/tags` (POST, DELETE), `workspace/tags/[id]/items` (PUT, DELETE), `workspace/portfolios` (POST), `workspace/portfolios/[id]` (PATCH, DELETE), `workspace/portfolios/[id]/members` (POST, DELETE). In overrides, tags and items the gate replaces the old inline org check (it takes the resolved org id, null included), so those handlers got shorter; F45 measured 5307 duplicated lines against a base of 5315.
- Tests: `src/lib/api/org-writer.npmtest.mjs` (7: viewer, member, admin, owner, no membership, failed read, null org, and the lookup scoped to the given org) and `src/app/api/workspace/viewer-read-only-routes.npmtest.mjs` (27: per handler a viewer gets 403 `viewer_read_only` with zero service-client calls, a member passes through to the client; the personal watch scope is not refused). Red then green: with the seven route files restored to master, 26 of 27 route tests fail (the one pass is the personal-scope case); with the change, 27 of 27 pass; the helper's test could not load before `requireOrgWriter` existed.
- The F45 clone pair `workspace/overrides/route.ts` against `workspace/personal-state/route.ts` PREDATES this lane [CONFIRMED: 25 shared 8-line windows between the two files as they stand on origin/master, and `personal-state/route.ts` is untouched by this lane]. Left as is, named here as pre-existing.
- One reading of the ruling to confirm: `/api/watchlist` carries two scopes. Only `scope=team` (org_watchlist, the shared write that migration 370's policies gate) is refused for a viewer; `scope=personal` (user_watchlist, the caller's own rows, no policy change) stays open, which is what the viewer UI keeps (personal watch). The route's header comment, which said the team scope had no role gate by design, was rewritten to match.
- Test `src/app/api/workspace/viewer-read-only-routes.npmtest.mjs` (27 tests): per handler, a viewer gets 403 `viewer_read_only` and the stubbed service client records zero calls; a member passes through (no viewer refusal, the client is reached); plus the personal watchlist scope is not refused for a viewer. Red then green: with the seven route files restored to master, 13 fail (every viewer case) and 14 pass; with the change, 27 of 27 pass.

## STOP: item 5, the profiles read policy (not built)

- Why: the brief says to verify that Community displays use the spec 05 pseudonymous subset and to STOP if a read needs a column the subset lacks. They do not. [CONFIRMED by reading each call site] user-session reads of other users' profiles need columns outside both the same-org subset (id, display name fields, job_title, region, badge) and the spec 05 subset (role, industry, company size, region, badge):
  - Cross-org author and member display, user client (cookie or browser): `api/community/posts/route.ts` (two reads), `api/community/posts/[id]/replies/route.ts` (two), `api/community/posts/[id]/route.ts` (two), `api/community/groups/[id]/members/route.ts`, `api/community/groups/[id]/invitations/route.ts`, `components/community/CouncilMembersRail.tsx`: full_name and avatar_url. `app/community/page.tsx` line 322 (authors across orgs): full_name, display_name, email, jurisdiction_overrides, workspace_role, verifier_status, org_id.
  - Name search over every profile: `api/community/search/route.ts` (ilike full_name), `api/community/groups/[id]/invite-candidates/route.ts` (ilike full_name; its comment says it relies on the current authenticated read of all rows).
  - Same-org peers: `app/community/page.tsx` line 234 reads email, jurisdiction_overrides, workspace_role beyond the peer subset.
  - Aggregate over all rows: `app/community/directory/page.tsx` (affiliation_type, region, sector_overrides, verifier_status for every profile).
  - Platform admin cross-org reads through the user session: `app/admin/page.tsx` line 159 and `components/admin/AdminDashboard.tsx` line 289 embed profiles(full_name, display_name, email, avatar_url) for every org member.
  - Not classified for client: `lib/supabase-server.ts` line 5157 (id, full_name of adders).
  - Unaffected (service role): api/orgs/[org_id]/route.ts and members, api/workspace/members, api/workspace/bootstrap, api/workspace/archive-impact, api/auth/linkedin/callback. Own-row reads (UserProfilePage, OnboardingWizard, server-bootstrap, platform-admin-gate, shell-context) are unaffected by an own-row policy.
- Structural fact: Postgres RLS cannot give different columns per row policy. Column grants are per role, so "own row full, same-org peers a subset, everyone else a smaller subset" cannot be three policies on `profiles` alone; it needs the own full row to come from another object (a view or RPC) or the sensitive columns (email, is_platform_admin, linkedin_sub) to leave the authenticated column grant and be read through one. The brief's `profiles_public` view with security_invoker on also needs SELECT on its columns for anon and authenticated on `profiles` itself, which contradicts "no direct SELECT on profiles for anon" unless the view is owner-run and filtered.
- Product facts the decision needs: migration 336 and the R8.7 amendment (spec 07, 2026-09-25) make author identity shown by default in Community (name unless the post is anonymous), which is the opposite of spec 05 section 2's "not name or company". Which one governs decides whether cross-org full_name and avatar_url stay readable.
- Decision-ready: once the coordinator rules (a) which cross-org columns Community may read and (b) how a platform admin reads other orgs, item 5 is one more migration (371) plus the call-site repoints; this lane has the call-site list above.

## Corrections after the first CI run (same day)

- F28 failed on the first push: `attacks.json` is a governing file of the chain-proof family and the range added no run artifact, so a pending marker was added (common rule 10). GATE-3 (PR 1002) then merged to master and retired the pending/ scheme (its test fails while any pending/ directory exists), so after merging master the marker was removed again; the net diff carries no pending file.
- `ActionRow.npmtest.mjs` (existing, not touched) asserts the literal `{onTag && (`. The first draft changed that line to `{onTag && !isViewer && (`; ActionRow now renames the prop (`onTag: onTagProp`) and derives `const onTag = isViewer ? undefined : onTagProp`, so the JSX line is unchanged. Not caught locally because npmtests were not run; CI caught it.

## Decisions

1. The sanctioned set is the 364 and 367 set, including postgres, so SECURITY DEFINER functions (create_org_for_self, accept_invitation) pass the membership trigger. Not closed: accept_invitation's ON CONFLICT DO UPDATE SET role can demote an existing owner or admin who accepts a lower invite (census finding). It is a function body change (SEC-3a territory); the one-line fix is DO NOTHING, or a WHERE clause limiting the update to viewers. Recorded here and in the migration header. Coordinator ruling: this goes to the functions lane (SEC-4), not this lane.
2. Added beyond the brief, same triggers, same invariant (all accepted by the coordinator as part of items 3, 4 and 7): org_id and user_id immutability on memberships (accepted as part of item 3); INSERT closure of the sign-off columns (accepted as part of item 4); requested_by and post_id immutability on sign-off requests (accepted as part of item 7). Without them the named rules are bypassable by moving the row.
3. Column revoke is table-level revoke plus column re-grant (a column revoke under a table grant is a no-op, 364's finding). Consequence: a column added later to these three tables is not writable by authenticated until its migration grants it; this fails closed, visibly.
4. The viewer UI gate is viewer-only (role null or loading keeps today's screen), so no flicker for members; enforcement is the database and, once granted, the routes.
5. Migration number 370 confirmed free on origin (368 merged, 369 is SEC-3a).

## NOT done

- Item 5 (above; reassigned by the coordinator to a new lane, under the corrected rule that spec 07 amendment R8.7, identity shown by default with anonymity opt-in, governs, not the spec 05 pseudonymous subset; the call-site list above stays as the hand-off). Nothing applied; nothing executed against Postgres (none on this machine): the SQL has been read and statically tested only, the self-check runs at apply time and in the chain-proof replay. [HYPOTHESIS] a fixture `auth.users` insert with only (id, aud, role, email, created_at, updated_at) succeeds on the live project; if not, the self-check skips its legs with a NOTICE and the catalog assertions still run.
- No rendering-guard or UX smoke run locally (CI runs them); no local tsc run (CI runs it).

## Open items

- Apply order for the executor: migration 370 can apply before or after the code; the code changes only hide controls. The attacks need 370 applied on the proof stack (the replay applies it).
- SEC-3a (369) revokes anon writes by table; the two migrations touch disjoint objects except REVOKE on the same three tables (idempotent either order).

### UX compliance
- Screens and blocks: detail action row (+ Tag), detail tag row, team watch pill, priority and dismiss kebab menu, portfolio index create form, portfolio detail manage, add and remove controls. Layout unchanged for members, admins and owners.
- For a viewer: the primary goal on these screens is reading; the path is unchanged (open the page, read); the one primary action is removed, not disabled, so there is no dead control. Empty portfolio states say why: "Your role in this workspace can read portfolios but not create them; a member, admin or owner can."
- Feedback states: no new asynchronous action; the existing pending, success and failure states of each control are untouched. Every remaining target keeps its existing 44 px size.
