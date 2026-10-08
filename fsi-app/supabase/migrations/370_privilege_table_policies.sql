-- subject: Migration 370 (lane SEC-3b, 2026-10-08): table policies and triggers that stop a signed-in user changing their own standing; organizations.plan, the community_member_profiles verification columns and community_posts sign-off columns become system-written (table-level INSERT/UPDATE replaced by column grants plus a guard trigger each), org_memberships gets a role-transition trigger (only an owner grants or revokes owner, nobody changes their own role, the last owner cannot be demoted or removed, org_id and user_id are fixed), community_posts author and group moves are guarded, community_post_signoff_requests pins the initial status and refuses a self-decision, community_groups.owner_user_id moves only by the current owner, and the viewer role loses write access on workspace_item_overrides, org_watchlist, workspace_tags, item_workspace_tags, portfolios and portfolio_members through the new user_can_write_in_org(); the profiles read policy (item 5 of the brief) is NOT in this migration, see the lane report; a rolled-back self-check attacks every guard as role authenticated and proves the legitimate paths still work; NOT APPLIED.
-- 370 -- privilege table policies (lane SEC-3b, 2026-10-08).
--
-- NOT APPLIED. Authored by lane SEC-3b; the coordinator's executor applies it after CI (two-track policy, CLAUDE.md
-- standing rule 3: schema DDL applies via the Supabase CLI before any dependent code commits). Written against the
-- privilege census (fsi-app/scripts/tmp/privilege-census-2026-10-08.md, section 1 findings 1 to 7) and the pattern of
-- migrations 364 and 367 (column grants plus a BEFORE INSERT OR UPDATE guard that keys on current_user).
--
-- THE FINDINGS ADDRESSED. [CONFIRMED by catalog read, census 2026-10-08]; the exploits themselves were not executed
-- live, the self-check below executes each one under rollback.
--   1. organizations.plan. Policy org_update_admin lets any owner or admin UPDATE their org row and authenticated held
--      table-level UPDATE, so an org admin could set their own plan to enterprise.
--   2. community_member_profiles.verified, verified_at, verification_method, organisation_key. The own-row INSERT and
--      UPDATE policies gate rows, not columns, so a member could self-grant the verified badge. The only legitimate
--      writer is POST /api/community/profile/verify, which already uses the service-role client.
--   3. org_memberships.role. membership_write_admin and membership_update_admin let an admin INSERT or UPDATE any row of
--      their org with role owner, demote an owner, or even re-point a membership row at another org (no WITH CHECK).
--   4. community_posts.signed_off_at, signed_off_by, author_user_id, group_id. The author-or-moderator UPDATE policy had
--      no column restriction: an author could stamp their own post as signed off, a moderator could rewrite the author,
--      an author could move a post into a group they do not belong to. The same sign-off columns were also INSERTable.
--   6. The viewer gap. user_belongs_to_org() has no role test, so role viewer satisfied every write policy on six tables.
--   7. community_post_signoff_requests (status unpinned on INSERT, a verifier could decide their own request) and
--      community_groups.owner_user_id (a moderator could transfer ownership to themselves).
--
-- THE FIX, PER ITEM.
--   Items 1, 2, 4: the 364 pattern, two layers. Layer 1: REVOKE INSERT, UPDATE on the table FROM PUBLIC, anon,
--   authenticated, then GRANT column lists back to authenticated that exclude the system-written columns (a column
--   revoke under a table-level grant is a no-op in Postgres, so the table-level revoke is required; the lists are read
--   from pg_attribute at apply time). Layer 2: a BEFORE INSERT OR UPDATE guard trigger, SECURITY INVOKER with a pinned
--   search_path, that raises 42501 for any caller that is not sanctioned. A careless future GRANT then restores a
--   privilege but not the escalation.
--   Item 3: org_membership_role_guard (BEFORE INSERT OR UPDATE OR DELETE on org_memberships). The policies
--   membership_write_admin, membership_update_admin and membership_delete_admin STAY (they gate which rows an admin
--   reaches); the trigger adds the transition rule. For a non-sanctioned caller, with A = auth.uid() and the caller's
--   own role read from org_memberships:
--       INSERT   role owner needs A to be an owner of that org; any other role needs A to be an owner or admin.
--       UPDATE   org_id and user_id never change; a role change needs A to be an owner or admin, A may not change the
--                role of their own row, granting or revoking owner needs A to be an owner, and the last owner of an org
--                cannot be demoted.
--       DELETE   removing an owner needs A to be an owner and cannot remove the last owner; removing anyone else needs
--                A to be an owner or admin.
--   Item 6: public.user_can_write_in_org(p_org uuid) = a membership with role member, admin or owner. ALTER POLICY
--   switches the INSERT, UPDATE and DELETE policies of workspace_item_overrides, org_watchlist, workspace_tags,
--   item_workspace_tags, portfolios and portfolio_members to it; the SELECT policies keep user_belongs_to_org.
--   Item 7: community_post_signoff_requests_guard (INSERT must carry the initial status pending; a decision, that is a
--   move to signed_off or declined, is refused when the caller or the recorded verifier is the requester; requested_by
--   and post_id are fixed) and community_groups_owner_guard (owner_user_id changes only when the caller is the current
--   owner).
--
-- WHO IS SANCTIONED (the identity idiom, unchanged from 364 and 367). public.is_sanctioned_writer(rel) is true when
-- current_user is service_role, postgres or supabase_admin, or is the owner of the table. It keys on current_user, never
-- on a JWT claim: under PostgREST the requester's role is applied with SET LOCAL ROLE, so current_user is
-- authenticated or anon for a user and service_role for the service key, while a SECURITY DEFINER function runs as its
-- owner. The helper is SECURITY INVOKER on purpose so it sees the real caller. It is one function so the six guards do
-- not carry six copies of the idiom.
--
-- WHAT THIS MIGRATION DOES NOT CLOSE (disclosed, rule 13).
--   * accept_invitation() is SECURITY DEFINER and its ON CONFLICT (org_id, user_id) DO UPDATE SET role clause can demote
--     an existing owner or admin who accepts a lower invitation. The definer runs as postgres, which is sanctioned
--     here, so this trigger does not see it. Closing it is a function-body change (SEC-3a territory): replace DO UPDATE
--     with DO NOTHING, or add WHERE org_memberships.role = 'viewer'.
--   * profiles read exposure (brief item 5) is not built; the lane report states the facts that stopped it.
--   * Server routes that write the six viewer-gap tables with the service-role client (RLS bypassed) still need an
--     owner, admin or member check in the route itself; the lane report lists them.
--
-- CONSUMERS CHECKED [CONFIRMED by grep, 2026-10-08].
--   organizations: the only writer is api/orgs/[org_id]/route.ts, service-role client. Browser reads select plan only.
--   community_member_profiles: api/community/profile/route.ts upserts org_type, role, sector, region, default_anonymous
--     with the caller's client (allowed columns); api/community/profile/verify/route.ts writes the four verification
--     columns with the service-role client.
--   org_memberships: every writer in src is a service-role route (api/orgs/[org_id]/members, api/admin/users) or a
--     SECURITY DEFINER function (create_org_for_self, accept_invitation).
--   community_posts: the caller's client updates title and body (api/community/posts/[id]) and
--     referenced_intelligence_item_ids (components/community/CommunityRooms.tsx), inserts without sign-off columns;
--     api/community/signoff/[id]/decide stamps signed_off_at and signed_off_by with the service-role client. The reply
--     counter trigger update_community_post_reply_count is SECURITY DEFINER (migration 190). No code moves a post to
--     another group.
--   community_post_signoff_requests: signoff/[id]/decide updates status, verifier_id, decided_at, primary_doc_url,
--     decision_note with the caller's client and verifier_id = the caller; signoff/[id]/withdraw moves the requester's
--     own pending row to withdrawn; posts/[id]/signoff inserts status pending.
--   community_groups: no code path changes owner_user_id after insert.
--
-- SELF-CHECK (one DO block, rolled back by a sentinel exception, no data changed). Fixtures are never invented ids
-- without a row behind them: the block inserts six fixture auth.users rows (with a profiles row each), one fixture
-- organization pair, two community groups, two posts and the dependent rows, as the migration role (sanctioned), then
-- attacks as role authenticated with a fixture JWT subject through pg_temp.sec3b_try. If the fixture auth.users insert
-- fails, every leg is skipped with a NOTICE and the privilege-catalog assertions after the block still run. Legs that
-- need an intelligence_items row are skipped with a NOTICE when the table is empty.
-- Reversible: DROP the six triggers and their functions, DROP FUNCTION is_sanctioned_writer and user_can_write_in_org
-- after pointing the 15 ALTERed policies back at user_belongs_to_org, and GRANT INSERT, UPDATE on the three tables to
-- authenticated (do not: it re-opens the escalation).

BEGIN;

-- ---- Preconditions ------------------------------------------------------------------------------------------------
DO $pre$
DECLARE
  v_rel  text;
  v_pol  text[];
  v_name text;
  v_tbl  text;
  v_pair text;
BEGIN
  FOREACH v_rel IN ARRAY ARRAY['organizations', 'community_member_profiles', 'org_memberships', 'community_posts',
      'community_post_signoff_requests', 'community_groups', 'workspace_item_overrides', 'org_watchlist',
      'workspace_tags', 'item_workspace_tags', 'portfolios', 'portfolio_members', 'profiles'] LOOP
    IF to_regclass('public.' || v_rel) IS NULL THEN
      RAISE EXCEPTION 'ABORT: public.% does not exist', v_rel;
    END IF;
  END LOOP;

  FOREACH v_pair IN ARRAY ARRAY[
      'organizations.plan', 'community_member_profiles.verified', 'community_member_profiles.verified_at',
      'community_member_profiles.verification_method', 'community_member_profiles.organisation_key',
      'community_posts.signed_off_at', 'community_posts.signed_off_by', 'community_posts.author_user_id',
      'community_posts.group_id', 'community_post_signoff_requests.requested_by',
      'community_post_signoff_requests.post_id', 'community_post_signoff_requests.verifier_id',
      'community_groups.owner_user_id', 'org_memberships.role'] LOOP
    v_tbl := split_part(v_pair, '.', 1);
    v_name := split_part(v_pair, '.', 2);
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = ('public.' || v_tbl)::regclass AND attname = v_name AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'ABORT: public.%.% does not exist', v_tbl, v_name;
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY ARRAY['user_belongs_to_org', 'user_is_group_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = v_name) THEN
      RAISE EXCEPTION 'ABORT: public.%() does not exist', v_name;
    END IF;
  END LOOP;

  -- The 15 policies item 6 re-points must exist under these names (migrations 006, 077, 313, 362).
  v_pol := ARRAY[
    'workspace_item_overrides.overrides_insert_org', 'workspace_item_overrides.overrides_update_org',
    'workspace_item_overrides.overrides_delete_org',
    'org_watchlist.org_watchlist_member_insert', 'org_watchlist.org_watchlist_member_update',
    'org_watchlist.org_watchlist_member_delete',
    'workspace_tags.workspace_tags_org_insert', 'workspace_tags.workspace_tags_org_delete',
    'item_workspace_tags.item_workspace_tags_org_insert', 'item_workspace_tags.item_workspace_tags_org_delete',
    'portfolios.portfolios_org_insert', 'portfolios.portfolios_org_update', 'portfolios.portfolios_org_delete',
    'portfolio_members.portfolio_members_org_insert', 'portfolio_members.portfolio_members_org_delete'];
  FOREACH v_pair IN ARRAY v_pol LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = split_part(v_pair, '.', 1) AND policyname = split_part(v_pair, '.', 2)
    ) THEN
      RAISE EXCEPTION 'ABORT: policy % on public.% does not exist', split_part(v_pair, '.', 2), split_part(v_pair, '.', 1);
    END IF;
  END LOOP;
END $pre$;

-- ---- Shared idiom: who is sanctioned ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_sanctioned_writer(p_rel regclass)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT current_user IN ('service_role', 'postgres', 'supabase_admin')
      OR current_user = (SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid = p_rel);
$fn$;

COMMENT ON FUNCTION public.is_sanctioned_writer(regclass) IS
  'SEC-3b (migration 370). True when current_user is service_role, postgres, supabase_admin or the owner of the given table. Keys on current_user, never on a JWT claim. SECURITY INVOKER on purpose so current_user is the real caller; a SECURITY DEFINER function runs as its owner and is therefore sanctioned. Used by the six guard triggers of migration 370.';

REVOKE ALL ON FUNCTION public.is_sanctioned_writer(regclass) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_sanctioned_writer(regclass) TO authenticated, service_role;

-- ---- Item 1: organizations.plan ----------------------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON TABLE public.organizations FROM PUBLIC, anon, authenticated;

DO $grant1$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_cols
    FROM pg_attribute
   WHERE attrelid = 'public.organizations'::regclass AND attnum > 0 AND NOT attisdropped AND attname <> 'plan';
  EXECUTE format('GRANT INSERT (%s) ON public.organizations TO authenticated', v_cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.organizations TO authenticated', v_cols);
END $grant1$;

CREATE OR REPLACE FUNCTION public.organizations_plan_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF public.is_sanctioned_writer('public.organizations'::regclass) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan THEN
      RAISE EXCEPTION 'organizations_plan_guard: organizations.plan is writable only by service_role or the table owner; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.plan IS DISTINCT FROM 'free' THEN
    RAISE EXCEPTION 'organizations_plan_guard: a new organizations row starts on the free plan; only service_role or the table owner may set another; current_user=%', current_user
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.organizations_plan_guard() IS
  'SEC-3b (migration 370). BEFORE INSERT OR UPDATE guard on public.organizations: raises 42501 when a caller other than service_role, postgres, supabase_admin or the table owner changes plan (or inserts a row on a plan other than free). Layer 2 behind the column grants.';

DROP TRIGGER IF EXISTS organizations_plan_guard_trg ON public.organizations;
CREATE TRIGGER organizations_plan_guard_trg
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_plan_guard();

-- ---- Item 2: community_member_profiles verification columns --------------------------------------------------------------
REVOKE INSERT, UPDATE ON TABLE public.community_member_profiles FROM PUBLIC, anon, authenticated;

DO $grant2$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_cols
    FROM pg_attribute
   WHERE attrelid = 'public.community_member_profiles'::regclass AND attnum > 0 AND NOT attisdropped
     AND attname NOT IN ('verified', 'verified_at', 'verification_method', 'organisation_key');
  EXECUTE format('GRANT INSERT (%s) ON public.community_member_profiles TO authenticated', v_cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.community_member_profiles TO authenticated', v_cols);
END $grant2$;

CREATE OR REPLACE FUNCTION public.community_member_profiles_verification_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF public.is_sanctioned_writer('public.community_member_profiles'::regclass) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.verified            IS DISTINCT FROM OLD.verified
       OR NEW.verified_at         IS DISTINCT FROM OLD.verified_at
       OR NEW.verification_method IS DISTINCT FROM OLD.verification_method
       OR NEW.organisation_key    IS DISTINCT FROM OLD.organisation_key THEN
      RAISE EXCEPTION 'community_member_profiles_verification_guard: verified, verified_at, verification_method and organisation_key are writable only by service_role or the table owner; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.verified IS TRUE
     OR NEW.verified_at IS NOT NULL
     OR NEW.verification_method IS NOT NULL
     OR NEW.organisation_key IS NOT NULL THEN
    RAISE EXCEPTION 'community_member_profiles_verification_guard: a new community_member_profiles row may not set verified, verified_at, verification_method or organisation_key; only service_role or the table owner may; current_user=%', current_user
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.community_member_profiles_verification_guard() IS
  'SEC-3b (migration 370). BEFORE INSERT OR UPDATE guard on public.community_member_profiles: raises 42501 when a caller other than service_role, postgres, supabase_admin or the table owner changes verified, verified_at, verification_method or organisation_key (or inserts a row carrying one). The verification route uses the service-role client. Layer 2 behind the column grants.';

DROP TRIGGER IF EXISTS community_member_profiles_verification_guard_trg ON public.community_member_profiles;
CREATE TRIGGER community_member_profiles_verification_guard_trg
  BEFORE INSERT OR UPDATE ON public.community_member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.community_member_profiles_verification_guard();

-- ---- Item 3: org_memberships role transitions ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_membership_role_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_actor      uuid := auth.uid();
  v_org        uuid;
  v_actor_role text;
  v_other_owners integer;
BEGIN
  IF public.is_sanctioned_writer('public.org_memberships'::regclass) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'org_membership_role_guard: no signed-in user; current_user=%', current_user
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_org := OLD.org_id;
  ELSE
    v_org := NEW.org_id;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'org_membership_role_guard: org_id and user_id of a membership never change; remove and add the member instead'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT m.role INTO v_actor_role
    FROM public.org_memberships m
   WHERE m.org_id = v_org AND m.user_id = v_actor;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner' THEN
      IF v_actor_role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'org_membership_role_guard: only an owner may grant the owner role'
          USING ERRCODE = '42501';
      END IF;
    ELSIF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'org_membership_role_guard: only an owner or admin may add a member'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF OLD.user_id = v_actor THEN
        RAISE EXCEPTION 'org_membership_role_guard: nobody changes their own role'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.role = 'owner' OR NEW.role = 'owner' THEN
        IF v_actor_role IS DISTINCT FROM 'owner' THEN
          RAISE EXCEPTION 'org_membership_role_guard: only an owner may grant or revoke the owner role'
            USING ERRCODE = '42501';
        END IF;
      ELSIF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'org_membership_role_guard: only an owner or admin may change a member role'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
        SELECT count(*) INTO v_other_owners
          FROM public.org_memberships m
         WHERE m.org_id = OLD.org_id AND m.role = 'owner' AND m.id <> OLD.id;
        IF v_other_owners = 0 THEN
          RAISE EXCEPTION 'org_membership_role_guard: the last owner of an organization cannot be demoted'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE
  IF OLD.role = 'owner' THEN
    IF v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'org_membership_role_guard: only an owner may remove an owner'
        USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_other_owners
      FROM public.org_memberships m
     WHERE m.org_id = OLD.org_id AND m.role = 'owner' AND m.id <> OLD.id;
    IF v_other_owners = 0 THEN
      RAISE EXCEPTION 'org_membership_role_guard: the last owner of an organization cannot be removed'
        USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'org_membership_role_guard: only an owner or admin may remove a member'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$fn$;

COMMENT ON FUNCTION public.org_membership_role_guard() IS
  'SEC-3b (migration 370). BEFORE INSERT OR UPDATE OR DELETE guard on public.org_memberships for callers other than service_role, postgres, supabase_admin or the table owner: only an owner grants or revokes owner, an admin may set member, viewer or admin, nobody changes their own role, the last owner cannot be demoted or removed, org_id and user_id never change. The policies membership_write_admin, membership_update_admin and membership_delete_admin stay and decide which rows an admin reaches. SECURITY INVOKER; a SECURITY DEFINER function (accept_invitation, create_org_for_self) runs as its owner and is sanctioned.';

DROP TRIGGER IF EXISTS org_membership_role_guard_trg ON public.org_memberships;
CREATE TRIGGER org_membership_role_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.org_memberships
  FOR EACH ROW EXECUTE FUNCTION public.org_membership_role_guard();

-- ---- Item 4: community_posts sign-off columns, author, group moves ----------------------------------------------------------
REVOKE INSERT, UPDATE ON TABLE public.community_posts FROM PUBLIC, anon, authenticated;

DO $grant4$
DECLARE
  v_ins text;
  v_upd text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_ins
    FROM pg_attribute
   WHERE attrelid = 'public.community_posts'::regclass AND attnum > 0 AND NOT attisdropped
     AND attname NOT IN ('signed_off_at', 'signed_off_by');
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_upd
    FROM pg_attribute
   WHERE attrelid = 'public.community_posts'::regclass AND attnum > 0 AND NOT attisdropped
     AND attname NOT IN ('signed_off_at', 'signed_off_by', 'author_user_id');
  EXECUTE format('GRANT INSERT (%s) ON public.community_posts TO authenticated', v_ins);
  EXECUTE format('GRANT UPDATE (%s) ON public.community_posts TO authenticated', v_upd);
END $grant4$;

CREATE OR REPLACE FUNCTION public.community_posts_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF public.is_sanctioned_writer('public.community_posts'::regclass) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.signed_off_at IS NOT NULL OR NEW.signed_off_by IS NOT NULL THEN
      RAISE EXCEPTION 'community_posts_guard: signed_off_at and signed_off_by are written only by the sign-off decision (service_role); current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.signed_off_at IS DISTINCT FROM OLD.signed_off_at OR NEW.signed_off_by IS DISTINCT FROM OLD.signed_off_by THEN
    RAISE EXCEPTION 'community_posts_guard: signed_off_at and signed_off_by are written only by the sign-off decision (service_role); current_user=%', current_user
      USING ERRCODE = '42501';
  END IF;
  IF NEW.author_user_id IS DISTINCT FROM OLD.author_user_id THEN
    RAISE EXCEPTION 'community_posts_guard: the author of a post never changes; current_user=%', current_user
      USING ERRCODE = '42501';
  END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    IF v_actor IS NULL
       OR NOT public.user_is_group_admin(OLD.group_id, v_actor)
       OR NOT public.user_is_group_admin(NEW.group_id, v_actor) THEN
      RAISE EXCEPTION 'community_posts_guard: a post moves between groups only when the caller is a moderator or admin of both; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.community_posts_guard() IS
  'SEC-3b (migration 370). BEFORE INSERT OR UPDATE guard on public.community_posts for callers other than service_role, postgres, supabase_admin or the table owner: signed_off_at and signed_off_by never change (the sign-off decide route stamps them with the service-role client), the author never changes, and group_id changes only when the caller is a moderator or admin (user_is_group_admin) of BOTH groups. Layer 2 behind the column grants.';

DROP TRIGGER IF EXISTS community_posts_guard_trg ON public.community_posts;
CREATE TRIGGER community_posts_guard_trg
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.community_posts_guard();

-- ---- Item 7: sign-off requests and group ownership ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_post_signoff_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF public.is_sanctioned_writer('public.community_post_signoff_requests'::regclass) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'community_post_signoff_requests_guard: a new sign-off request starts as pending; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.requested_by IS DISTINCT FROM OLD.requested_by OR NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    RAISE EXCEPTION 'community_post_signoff_requests_guard: requested_by and post_id of a request never change; current_user=%', current_user
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('signed_off', 'declined') THEN
    IF v_actor IS NULL OR v_actor = OLD.requested_by OR NEW.verifier_id IS NOT DISTINCT FROM OLD.requested_by THEN
      RAISE EXCEPTION 'community_post_signoff_requests_guard: the verifier of a request cannot be its requester; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.community_post_signoff_requests_guard() IS
  'SEC-3b (migration 370). BEFORE INSERT OR UPDATE guard on public.community_post_signoff_requests for callers other than service_role, postgres, supabase_admin or the table owner: a new request starts as pending, requested_by and post_id never change, and a decision (a move to signed_off or declined) is refused when the caller or the recorded verifier is the requester.';

DROP TRIGGER IF EXISTS community_post_signoff_requests_guard_trg ON public.community_post_signoff_requests;
CREATE TRIGGER community_post_signoff_requests_guard_trg
  BEFORE INSERT OR UPDATE ON public.community_post_signoff_requests
  FOR EACH ROW EXECUTE FUNCTION public.community_post_signoff_requests_guard();

CREATE OR REPLACE FUNCTION public.community_groups_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF public.is_sanctioned_writer('public.community_groups'::regclass) THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    IF OLD.owner_user_id IS NULL OR OLD.owner_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'community_groups_owner_guard: only the current owner may transfer a group; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.community_groups_owner_guard() IS
  'SEC-3b (migration 370). BEFORE UPDATE guard on public.community_groups for callers other than service_role, postgres, supabase_admin or the table owner: owner_user_id changes only when the caller is the current owner. A group moderator or admin (user_is_group_admin) cannot transfer ownership to themselves.';

DROP TRIGGER IF EXISTS community_groups_owner_guard_trg ON public.community_groups;
CREATE TRIGGER community_groups_owner_guard_trg
  BEFORE UPDATE ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.community_groups_owner_guard();

-- ---- Item 6: the viewer role is read-only ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_write_in_org(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships m
     WHERE m.org_id = p_org
       AND m.user_id = auth.uid()
       AND m.role IN ('member', 'admin', 'owner')
  );
$fn$;

COMMENT ON FUNCTION public.user_can_write_in_org(uuid) IS
  'SEC-3b (migration 370). True when auth.uid() holds a membership of the organization with role member, admin or owner; role viewer reads (user_belongs_to_org) but does not write. Same shape as user_belongs_to_org (SECURITY DEFINER, pinned search_path) so it does not recurse through org_memberships RLS. Used by the INSERT, UPDATE and DELETE policies of workspace_item_overrides, org_watchlist, workspace_tags, item_workspace_tags, portfolios and portfolio_members.';

REVOKE ALL ON FUNCTION public.user_can_write_in_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_write_in_org(uuid) TO authenticated, service_role;

ALTER POLICY overrides_insert_org ON public.workspace_item_overrides
  WITH CHECK (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY overrides_update_org ON public.workspace_item_overrides
  USING (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY overrides_delete_org ON public.workspace_item_overrides
  USING (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');

ALTER POLICY org_watchlist_member_insert ON public.org_watchlist
  WITH CHECK ((public.user_can_write_in_org(org_id) AND added_by_user_id = (select auth.uid())) OR (select auth.role()) = 'service_role');
ALTER POLICY org_watchlist_member_update ON public.org_watchlist
  USING (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY org_watchlist_member_delete ON public.org_watchlist
  USING (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');

ALTER POLICY workspace_tags_org_insert ON public.workspace_tags
  WITH CHECK ((public.user_can_write_in_org(org_id) AND created_by = (select auth.uid())) OR (select auth.role()) = 'service_role');
ALTER POLICY workspace_tags_org_delete ON public.workspace_tags
  USING (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');

ALTER POLICY item_workspace_tags_org_insert ON public.item_workspace_tags
  WITH CHECK ((public.user_can_write_in_org(org_id) AND created_by = (select auth.uid())) OR (select auth.role()) = 'service_role');
ALTER POLICY item_workspace_tags_org_delete ON public.item_workspace_tags
  USING (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');

ALTER POLICY portfolios_org_insert ON public.portfolios
  WITH CHECK ((public.user_can_write_in_org(org_id) AND created_by = (select auth.uid())) OR (select auth.role()) = 'service_role');
ALTER POLICY portfolios_org_update ON public.portfolios
  USING (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role')
  WITH CHECK (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY portfolios_org_delete ON public.portfolios
  USING (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');

ALTER POLICY portfolio_members_org_insert ON public.portfolio_members
  WITH CHECK ((public.user_can_write_in_org(org_id) AND added_by = (select auth.uid())) OR (select auth.role()) = 'service_role');
ALTER POLICY portfolio_members_org_delete ON public.portfolio_members
  USING (public.user_can_write_in_org(org_id) OR (select auth.role()) = 'service_role');

-- ---- Self-check: attack every guard, rolled back -----------------------------------------------------------------------------
-- Two temporary helpers (dropped at the end): sec3b_try runs one statement as role authenticated (or service_role) with
-- a fixture JWT subject and returns 'ok:<rows>' or 'err:<sqlstate>:<first line of the message>'; sec3b_expect raises
-- ABORT when the result does not match the expected LIKE pattern (and does not match the optional reject pattern).
CREATE FUNCTION pg_temp.sec3b_try(p_role text, p_uid uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v_rows integer;
BEGIN
  IF p_role = 'service_role' THEN
    SET LOCAL ROLE service_role;
  ELSE
    SET LOCAL ROLE authenticated;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', CASE WHEN p_role = 'service_role' THEN 'service_role' ELSE 'authenticated' END)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', CASE WHEN p_role = 'service_role' THEN 'service_role' ELSE 'authenticated' END, true);
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    RETURN 'ok:' || v_rows::text;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'err:' || SQLSTATE || ':' || split_part(SQLERRM, E'\n', 1);
  END;
END;
$f$;

CREATE FUNCTION pg_temp.sec3b_expect(p_label text, p_got text, p_want_like text, p_reject_like text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  IF p_got NOT LIKE p_want_like OR (p_reject_like IS NOT NULL AND p_got LIKE p_reject_like) THEN
    RAISE EXCEPTION 'ABORT: % expected % but got %', p_label, p_want_like, p_got;
  END IF;
END;
$f$;

DO $sc$
DECLARE
  v_owner  uuid := gen_random_uuid();
  v_admin  uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_viewer uuid := gen_random_uuid();
  v_other  uuid := gen_random_uuid();
  v_extra  uuid := gen_random_uuid();
  v_users  uuid[];
  v_u      uuid;
  v_ok     boolean := true;
  v_org    uuid;
  v_org2   uuid;
  v_item   uuid;
  m_owner  uuid;
  m_admin  uuid;
  m_other  uuid;
  v_tag    uuid;
  v_pf     uuid;
  v_g1     uuid;
  v_g2     uuid;
  v_p1     uuid;
  v_p2     uuid;
  v_req1   uuid;
  v_req2   uuid;
  v_attack text;
BEGIN
  v_users := ARRAY[v_owner, v_admin, v_member, v_viewer, v_other, v_extra];

  BEGIN
    BEGIN
      FOREACH v_u IN ARRAY v_users LOOP
        INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
        VALUES (v_u, 'authenticated', 'authenticated', 'sec3b-' || v_u::text || '@sec3b-selfcheck.invalid', now(), now());
        INSERT INTO public.profiles (id, email, display_name)
        VALUES (v_u, 'sec3b-' || v_u::text || '@sec3b-selfcheck.invalid', 'sec3b selfcheck')
        ON CONFLICT (id) DO NOTHING;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_ok := false;
      RAISE NOTICE 'migration 370 self-check: could not create fixture auth.users and profiles rows (%), attack legs skipped; privilege-catalog assertions still run', SQLERRM;
    END;

    IF v_ok THEN
      -- Fixtures, as the migration role (sanctioned for every guard).
      INSERT INTO public.organizations (name, slug) VALUES ('sec3b selfcheck a', 'sec3b-a-' || v_owner::text) RETURNING id INTO v_org;
      INSERT INTO public.organizations (name, slug) VALUES ('sec3b selfcheck b', 'sec3b-b-' || v_owner::text) RETURNING id INTO v_org2;
      INSERT INTO public.org_memberships (org_id, user_id, role) VALUES
        (v_org, v_owner, 'owner'), (v_org, v_admin, 'admin'), (v_org, v_member, 'member'),
        (v_org, v_viewer, 'viewer'), (v_org, v_other, 'member');
      SELECT id INTO m_owner FROM public.org_memberships WHERE org_id = v_org AND user_id = v_owner;
      SELECT id INTO m_admin FROM public.org_memberships WHERE org_id = v_org AND user_id = v_admin;
      SELECT id INTO m_other FROM public.org_memberships WHERE org_id = v_org AND user_id = v_other;
      SELECT id INTO v_item FROM public.intelligence_items LIMIT 1;

      -- ===== Item 1: organizations.plan =====
      -- A. layer 1: the org admin and the org owner cannot write plan (column privilege).
      FOREACH v_u IN ARRAY ARRAY[v_admin, v_owner] LOOP
        PERFORM pg_temp.sec3b_expect('1A organizations.plan by a member of the org',
          pg_temp.sec3b_try('authenticated', v_u, format('UPDATE public.organizations SET plan = %L WHERE id = %L', 'enterprise', v_org)),
          'err:42501:%permission denied%');
      END LOOP;
      -- B. not over-broad: the admin can still rename the org.
      PERFORM pg_temp.sec3b_expect('1B organizations.name by the org admin',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.organizations SET name = %L WHERE id = %L', 'sec3b renamed', v_org)),
        'ok:1');
      -- C. layer 2 alone: restore the column grant inside the rolled-back block, the trigger refuses.
      GRANT UPDATE (plan) ON public.organizations TO authenticated;
      PERFORM pg_temp.sec3b_expect('1C layer 2 on organizations.plan',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.organizations SET plan = %L WHERE id = %L', 'enterprise', v_org)),
        'err:42501:%organizations_plan_guard%');
      REVOKE UPDATE (plan) ON public.organizations FROM authenticated;
      -- D. the sanctioned path stays open.
      PERFORM pg_temp.sec3b_expect('1D organizations.plan by service_role',
        pg_temp.sec3b_try('service_role', NULL, format('UPDATE public.organizations SET plan = %L WHERE id = %L', 'pro', v_org)),
        'ok:1');

      -- ===== Item 2: community_member_profiles verification columns =====
      INSERT INTO public.community_member_profiles (user_id, org_type) VALUES (v_member, 'other');
      FOREACH v_attack IN ARRAY ARRAY[
          'verified = true', 'verified_at = now()', 'verification_method = ''linkedin''', 'organisation_key = ''sec3b'''] LOOP
        PERFORM pg_temp.sec3b_expect('2A community_member_profiles ' || v_attack || ' by the member',
          pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.community_member_profiles SET %s WHERE user_id = %L', v_attack, v_member)),
          'err:42501:%permission denied%');
      END LOOP;
      PERFORM pg_temp.sec3b_expect('2B community_member_profiles.sector by the member',
        pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.community_member_profiles SET sector = %L WHERE user_id = %L', 'sec3b', v_member)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('2C INSERT of an own verified row',
        pg_temp.sec3b_try('authenticated', v_viewer, format('INSERT INTO public.community_member_profiles (user_id, org_type, verified) VALUES (%L, %L, true)', v_viewer, 'other')),
        'err:42501:%permission denied%');
      PERFORM pg_temp.sec3b_expect('2C control: INSERT of a plain own row',
        pg_temp.sec3b_try('authenticated', v_viewer, format('INSERT INTO public.community_member_profiles (user_id, org_type) VALUES (%L, %L)', v_viewer, 'other')),
        'ok:1');
      GRANT UPDATE (verified, verified_at, verification_method, organisation_key) ON public.community_member_profiles TO authenticated;
      GRANT INSERT (verified, verified_at, verification_method, organisation_key) ON public.community_member_profiles TO authenticated;
      PERFORM pg_temp.sec3b_expect('2D layer 2 on community_member_profiles UPDATE',
        pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.community_member_profiles SET verified = true WHERE user_id = %L', v_member)),
        'err:42501:%community_member_profiles_verification_guard%');
      PERFORM pg_temp.sec3b_expect('2D layer 2 on community_member_profiles INSERT',
        pg_temp.sec3b_try('authenticated', v_other, format('INSERT INTO public.community_member_profiles (user_id, org_type, verified) VALUES (%L, %L, true)', v_other, 'other')),
        'err:42501:%community_member_profiles_verification_guard%');
      REVOKE UPDATE (verified, verified_at, verification_method, organisation_key) ON public.community_member_profiles FROM authenticated;
      REVOKE INSERT (verified, verified_at, verification_method, organisation_key) ON public.community_member_profiles FROM authenticated;
      PERFORM pg_temp.sec3b_expect('2E verification by service_role',
        pg_temp.sec3b_try('service_role', NULL, format('UPDATE public.community_member_profiles SET verified = true, verified_at = now(), verification_method = %L, organisation_key = %L WHERE user_id = %L', 'corporate-email', 'sec3b', v_member)),
        'ok:1');

      -- ===== Item 3: org_memberships role transitions =====
      PERFORM pg_temp.sec3b_expect('3A an admin promotes a member to owner',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.org_memberships SET role = %L WHERE id = %L', 'owner', m_other)),
        'err:42501:%org_membership_role_guard%');
      PERFORM pg_temp.sec3b_expect('3B an admin adds a user as owner',
        pg_temp.sec3b_try('authenticated', v_admin, format('INSERT INTO public.org_memberships (org_id, user_id, role) VALUES (%L, %L, %L)', v_org, v_extra, 'owner')),
        'err:42501:%org_membership_role_guard%');
      PERFORM pg_temp.sec3b_expect('3C an admin demotes the owner',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.org_memberships SET role = %L WHERE id = %L', 'member', m_owner)),
        'err:42501:%org_membership_role_guard%');
      PERFORM pg_temp.sec3b_expect('3D the owner changes their own role',
        pg_temp.sec3b_try('authenticated', v_owner, format('UPDATE public.org_memberships SET role = %L WHERE id = %L', 'admin', m_owner)),
        'err:42501:%org_membership_role_guard%');
      PERFORM pg_temp.sec3b_expect('3E the last owner removes their own membership',
        pg_temp.sec3b_try('authenticated', v_owner, format('DELETE FROM public.org_memberships WHERE id = %L', m_owner)),
        'err:42501:%org_membership_role_guard%');
      PERFORM pg_temp.sec3b_expect('3F an admin removes the owner',
        pg_temp.sec3b_try('authenticated', v_admin, format('DELETE FROM public.org_memberships WHERE id = %L', m_owner)),
        'err:42501:%org_membership_role_guard%');
      PERFORM pg_temp.sec3b_expect('3G an admin re-points their membership at another org',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.org_memberships SET org_id = %L WHERE id = %L', v_org2, m_admin)),
        'err:42501:%org_membership_role_guard%');
      PERFORM pg_temp.sec3b_expect('3 control: an admin sets a member to viewer',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.org_memberships SET role = %L WHERE id = %L', 'viewer', m_other)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('3 control: an admin sets a viewer to admin',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.org_memberships SET role = %L WHERE id = %L', 'admin', m_other)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('3 control: the owner grants owner',
        pg_temp.sec3b_try('authenticated', v_owner, format('UPDATE public.org_memberships SET role = %L WHERE id = %L', 'owner', m_other)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('3 control: the owner revokes the second owner while another owner remains',
        pg_temp.sec3b_try('authenticated', v_owner, format('UPDATE public.org_memberships SET role = %L WHERE id = %L', 'member', m_other)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('3H service_role demotes the sole owner (sanctioned)',
        pg_temp.sec3b_try('service_role', NULL, format('UPDATE public.org_memberships SET role = %L WHERE id = %L', 'admin', m_owner)),
        'ok:1');
      UPDATE public.org_memberships SET role = 'owner' WHERE id = m_owner;

      -- ===== Item 6: the viewer gap =====
      INSERT INTO public.workspace_tags (org_id, name, created_by) VALUES (v_org, 'sec3b seed', v_owner) RETURNING id INTO v_tag;
      INSERT INTO public.portfolios (org_id, name, created_by) VALUES (v_org, 'sec3b seed', v_owner) RETURNING id INTO v_pf;
      INSERT INTO public.org_watchlist (org_id, added_by_user_id, item_type, item_id) VALUES (v_org, v_owner, 'item', 'sec3b-seed');
      PERFORM pg_temp.sec3b_expect('6 the viewer still reads tags',
        pg_temp.sec3b_try('authenticated', v_viewer, format('SELECT 1 FROM public.workspace_tags WHERE org_id = %L', v_org)),
        'ok:%', 'ok:0');
      PERFORM pg_temp.sec3b_expect('6A the viewer inserts a workspace tag',
        pg_temp.sec3b_try('authenticated', v_viewer, format('INSERT INTO public.workspace_tags (org_id, name, created_by) VALUES (%L, %L, %L)', v_org, 'sec3b viewer tag', v_viewer)),
        'err:42501:%');
      PERFORM pg_temp.sec3b_expect('6A control: a member inserts a workspace tag',
        pg_temp.sec3b_try('authenticated', v_member, format('INSERT INTO public.workspace_tags (org_id, name, created_by) VALUES (%L, %L, %L)', v_org, 'sec3b member tag', v_member)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('6B the viewer deletes a workspace tag',
        pg_temp.sec3b_try('authenticated', v_viewer, format('DELETE FROM public.workspace_tags WHERE id = %L', v_tag)),
        'ok:0');
      PERFORM pg_temp.sec3b_expect('6C the viewer inserts a team watchlist row',
        pg_temp.sec3b_try('authenticated', v_viewer, format('INSERT INTO public.org_watchlist (org_id, added_by_user_id, item_type, item_id) VALUES (%L, %L, %L, %L)', v_org, v_viewer, 'item', 'sec3b-viewer')),
        'err:42501:%');
      PERFORM pg_temp.sec3b_expect('6C control: a member inserts a team watchlist row',
        pg_temp.sec3b_try('authenticated', v_member, format('INSERT INTO public.org_watchlist (org_id, added_by_user_id, item_type, item_id) VALUES (%L, %L, %L, %L)', v_org, v_member, 'item', 'sec3b-member')),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('6C the viewer updates a team watchlist row',
        pg_temp.sec3b_try('authenticated', v_viewer, format('UPDATE public.org_watchlist SET note = %L WHERE org_id = %L', 'sec3b', v_org)),
        'ok:0');
      PERFORM pg_temp.sec3b_expect('6D the viewer inserts a portfolio',
        pg_temp.sec3b_try('authenticated', v_viewer, format('INSERT INTO public.portfolios (org_id, name, created_by) VALUES (%L, %L, %L)', v_org, 'sec3b viewer pf', v_viewer)),
        'err:42501:%');
      PERFORM pg_temp.sec3b_expect('6D the viewer renames a portfolio',
        pg_temp.sec3b_try('authenticated', v_viewer, format('UPDATE public.portfolios SET name = %L WHERE id = %L', 'sec3b renamed', v_pf)),
        'ok:0');
      PERFORM pg_temp.sec3b_expect('6D control: a member inserts a portfolio',
        pg_temp.sec3b_try('authenticated', v_member, format('INSERT INTO public.portfolios (org_id, name, created_by) VALUES (%L, %L, %L)', v_org, 'sec3b member pf', v_member)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('6D control: a member renames a portfolio',
        pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.portfolios SET name = %L WHERE id = %L', 'sec3b renamed', v_pf)),
        'ok:1');
      IF v_item IS NULL THEN
        RAISE NOTICE 'migration 370 self-check: public.intelligence_items is empty, item-dependent viewer legs (overrides, item tags, portfolio members) skipped';
      ELSE
        INSERT INTO public.workspace_item_overrides (org_id, item_id) VALUES (v_org, v_item);
        INSERT INTO public.item_workspace_tags (tag_id, intelligence_item_id, org_id, created_by) VALUES (v_tag, v_item, v_org, v_owner);
        PERFORM pg_temp.sec3b_expect('6E the viewer updates a priority override',
          pg_temp.sec3b_try('authenticated', v_viewer, format('UPDATE public.workspace_item_overrides SET priority_override = %L WHERE org_id = %L', 'CRITICAL', v_org)),
          'ok:0');
        PERFORM pg_temp.sec3b_expect('6E control: a member updates a priority override',
          pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.workspace_item_overrides SET priority_override = %L WHERE org_id = %L', 'LOW', v_org)),
          'ok:1');
        PERFORM pg_temp.sec3b_expect('6E the viewer deletes an override',
          pg_temp.sec3b_try('authenticated', v_viewer, format('DELETE FROM public.workspace_item_overrides WHERE org_id = %L', v_org)),
          'ok:0');
        PERFORM pg_temp.sec3b_expect('6F the viewer applies a tag to an item',
          pg_temp.sec3b_try('authenticated', v_viewer, format('INSERT INTO public.item_workspace_tags (tag_id, intelligence_item_id, org_id, created_by) VALUES (%L, %L, %L, %L)', v_tag, v_item, v_org, v_viewer)),
          'err:42501:%');
        PERFORM pg_temp.sec3b_expect('6F the viewer removes a tag from an item',
          pg_temp.sec3b_try('authenticated', v_viewer, format('DELETE FROM public.item_workspace_tags WHERE tag_id = %L', v_tag)),
          'ok:0');
        PERFORM pg_temp.sec3b_expect('6G the viewer adds a portfolio member',
          pg_temp.sec3b_try('authenticated', v_viewer, format('INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, item_id, added_by) VALUES (%L, %L, %L, %L, %L)', v_pf, v_org, 'item', v_item, v_viewer)),
          'err:42501:%');
        PERFORM pg_temp.sec3b_expect('6G control: a member adds a portfolio member',
          pg_temp.sec3b_try('authenticated', v_member, format('INSERT INTO public.portfolio_members (portfolio_id, org_id, member_kind, item_id, added_by) VALUES (%L, %L, %L, %L, %L)', v_pf, v_org, 'item', v_item, v_member)),
          'ok:1');
        PERFORM pg_temp.sec3b_expect('6G the viewer removes a portfolio member',
          pg_temp.sec3b_try('authenticated', v_viewer, format('DELETE FROM public.portfolio_members WHERE portfolio_id = %L', v_pf)),
          'ok:0');
      END IF;

      -- ===== Items 4 and 7: community fixtures =====
      INSERT INTO public.community_groups (name, slug, region, privacy, owner_user_id)
      VALUES ('sec3b g1', 'sec3b-g1-' || v_owner::text, 'EU', 'public', v_owner) RETURNING id INTO v_g1;
      INSERT INTO public.community_groups (name, slug, region, privacy, owner_user_id)
      VALUES ('sec3b g2', 'sec3b-g2-' || v_owner::text, 'EU', 'public', v_owner) RETURNING id INTO v_g2;
      INSERT INTO public.community_group_members (group_id, user_id, role) VALUES
        (v_g1, v_owner, 'admin'), (v_g1, v_member, 'member'), (v_g1, v_admin, 'moderator'), (v_g1, v_viewer, 'moderator'),
        (v_g2, v_admin, 'moderator');
      INSERT INTO public.community_posts (group_id, author_user_id, title, body)
      VALUES (v_g1, v_member, 'sec3b post one', 'sec3b body') RETURNING id INTO v_p1;
      INSERT INTO public.community_posts (group_id, author_user_id, title, body)
      VALUES (v_g1, v_member, 'sec3b post two', 'sec3b body') RETURNING id INTO v_p2;

      -- ===== Item 4: community_posts =====
      FOREACH v_attack IN ARRAY ARRAY['signed_off_at = now()', format('signed_off_by = %L', v_member)] LOOP
        PERFORM pg_temp.sec3b_expect('4A community_posts ' || split_part(v_attack, ' ', 1) || ' by the author',
          pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.community_posts SET %s WHERE id = %L', v_attack, v_p1)),
          'err:42501:%permission denied%');
      END LOOP;
      PERFORM pg_temp.sec3b_expect('4A INSERT of a post carrying signed_off_at',
        pg_temp.sec3b_try('authenticated', v_member, format('INSERT INTO public.community_posts (group_id, author_user_id, title, body, signed_off_at) VALUES (%L, %L, %L, %L, now())', v_g1, v_member, 'sec3b forged', 'x')),
        'err:42501:%permission denied%');
      PERFORM pg_temp.sec3b_expect('4B community_posts.body by the author',
        pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.community_posts SET body = %L WHERE id = %L', 'sec3b edited', v_p1)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('4C a moderator rewrites the author',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.community_posts SET author_user_id = %L WHERE id = %L', v_admin, v_p1)),
        'err:42501:%permission denied%');
      GRANT UPDATE (signed_off_at, signed_off_by, author_user_id) ON public.community_posts TO authenticated;
      GRANT INSERT (signed_off_at, signed_off_by) ON public.community_posts TO authenticated;
      PERFORM pg_temp.sec3b_expect('4D layer 2 on community_posts.signed_off_at',
        pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.community_posts SET signed_off_at = now() WHERE id = %L', v_p1)),
        'err:42501:%community_posts_guard%');
      PERFORM pg_temp.sec3b_expect('4D layer 2 on community_posts.author_user_id',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.community_posts SET author_user_id = %L WHERE id = %L', v_admin, v_p1)),
        'err:42501:%community_posts_guard%');
      PERFORM pg_temp.sec3b_expect('4D layer 2 on a forged INSERT',
        pg_temp.sec3b_try('authenticated', v_member, format('INSERT INTO public.community_posts (group_id, author_user_id, title, body, signed_off_by) VALUES (%L, %L, %L, %L, %L)', v_g1, v_member, 'sec3b forged', 'x', v_member)),
        'err:42501:%community_posts_guard%');
      REVOKE UPDATE (signed_off_at, signed_off_by, author_user_id) ON public.community_posts FROM authenticated;
      REVOKE INSERT (signed_off_at, signed_off_by) ON public.community_posts FROM authenticated;
      PERFORM pg_temp.sec3b_expect('4E an author moves a post into a group they do not moderate',
        pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.community_posts SET group_id = %L WHERE id = %L', v_g2, v_p1)),
        'err:42501:%community_posts_guard%');
      PERFORM pg_temp.sec3b_expect('4F a moderator of only one group moves a post to the other',
        pg_temp.sec3b_try('authenticated', v_viewer, format('UPDATE public.community_posts SET group_id = %L WHERE id = %L', v_g2, v_p1)),
        'err:42501:%');
      PERFORM pg_temp.sec3b_expect('4G control: a moderator of both groups moves the post',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.community_posts SET group_id = %L WHERE id = %L', v_g2, v_p1)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('4H the sign-off stamp by service_role',
        pg_temp.sec3b_try('service_role', NULL, format('UPDATE public.community_posts SET signed_off_at = now(), signed_off_by = %L WHERE id = %L', v_owner, v_p2)),
        'ok:1');

      -- ===== Item 7: sign-off requests =====
      PERFORM pg_temp.sec3b_expect('7A a requester opens a request already signed off',
        pg_temp.sec3b_try('authenticated', v_member, format('INSERT INTO public.community_post_signoff_requests (post_id, requested_by, status) VALUES (%L, %L, %L)', v_p2, v_member, 'signed_off')),
        'err:42501:%community_post_signoff_requests_guard%');
      PERFORM pg_temp.sec3b_expect('7A control: a requester opens a pending request',
        pg_temp.sec3b_try('authenticated', v_member, format('INSERT INTO public.community_post_signoff_requests (post_id, requested_by, status) VALUES (%L, %L, %L)', v_p2, v_member, 'pending')),
        'ok:1');
      SELECT id INTO v_req1 FROM public.community_post_signoff_requests WHERE post_id = v_p2 AND requested_by = v_member;
      INSERT INTO public.community_post_signoff_requests (post_id, requested_by, status) VALUES (v_p1, v_member, 'pending') RETURNING id INTO v_req2;
      UPDATE public.profiles SET verifier_status = 'active' WHERE id IN (v_member, v_owner);
      PERFORM pg_temp.sec3b_expect('7B an active verifier decides their own request',
        pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.community_post_signoff_requests SET status = %L, verifier_id = %L, decided_at = now() WHERE id = %L AND status = %L', 'signed_off', v_member, v_req1, 'pending')),
        'err:42501:%community_post_signoff_requests_guard%');
      PERFORM pg_temp.sec3b_expect('7C a verifier records the requester as the verifier',
        pg_temp.sec3b_try('authenticated', v_owner, format('UPDATE public.community_post_signoff_requests SET status = %L, verifier_id = %L, decided_at = now() WHERE id = %L AND status = %L', 'signed_off', v_member, v_req2, 'pending')),
        'err:42501:%community_post_signoff_requests_guard%');
      PERFORM pg_temp.sec3b_expect('7D a verifier rewrites requested_by',
        pg_temp.sec3b_try('authenticated', v_owner, format('UPDATE public.community_post_signoff_requests SET requested_by = %L WHERE id = %L', v_owner, v_req2)),
        'err:42501:%community_post_signoff_requests_guard%');
      PERFORM pg_temp.sec3b_expect('7 control: a different active verifier decides the request',
        pg_temp.sec3b_try('authenticated', v_owner, format('UPDATE public.community_post_signoff_requests SET status = %L, verifier_id = %L, decided_at = now() WHERE id = %L AND status = %L', 'signed_off', v_owner, v_req1, 'pending')),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('7 control: the requester withdraws their own pending request',
        pg_temp.sec3b_try('authenticated', v_member, format('UPDATE public.community_post_signoff_requests SET status = %L, decided_at = now() WHERE id = %L AND status = %L', 'withdrawn', v_req2, 'pending')),
        'ok:1');

      -- ===== Item 7: community_groups.owner_user_id =====
      PERFORM pg_temp.sec3b_expect('7E a moderator transfers group ownership to themselves',
        pg_temp.sec3b_try('authenticated', v_admin, format('UPDATE public.community_groups SET owner_user_id = %L WHERE id = %L', v_admin, v_g1)),
        'err:42501:%community_groups_owner_guard%');
      PERFORM pg_temp.sec3b_expect('7 control: the owner edits the group description',
        pg_temp.sec3b_try('authenticated', v_owner, format('UPDATE public.community_groups SET description = %L WHERE id = %L', 'sec3b', v_g1)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('7 control: the owner transfers the group',
        pg_temp.sec3b_try('authenticated', v_owner, format('UPDATE public.community_groups SET owner_user_id = %L WHERE id = %L', v_admin, v_g1)),
        'ok:1');
      PERFORM pg_temp.sec3b_expect('7F service_role reassigns the group (sanctioned)',
        pg_temp.sec3b_try('service_role', NULL, format('UPDATE public.community_groups SET owner_user_id = %L WHERE id = %L', v_owner, v_g1)),
        'ok:1');
    END IF;

    RAISE EXCEPTION 'sec3b_370_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'sec3b_370_selfcheck_rollback' THEN RAISE; END IF;
  END;

  -- Privilege catalog after the rolled-back block: the temporary re-grants must be gone, the legitimate columns stay.
  IF has_column_privilege('authenticated', 'public.organizations', 'plan', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.organizations', 'plan', 'INSERT') THEN
    RAISE EXCEPTION 'ABORT: authenticated still holds a write privilege on organizations.plan';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.organizations', 'name', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: authenticated lost UPDATE on organizations.name';
  END IF;
  FOREACH v_attack IN ARRAY ARRAY['verified', 'verified_at', 'verification_method', 'organisation_key'] LOOP
    IF has_column_privilege('authenticated', 'public.community_member_profiles', v_attack, 'UPDATE')
       OR has_column_privilege('authenticated', 'public.community_member_profiles', v_attack, 'INSERT') THEN
      RAISE EXCEPTION 'ABORT: authenticated still holds a write privilege on community_member_profiles.%', v_attack;
    END IF;
  END LOOP;
  IF NOT has_column_privilege('authenticated', 'public.community_member_profiles', 'sector', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: authenticated lost UPDATE on community_member_profiles.sector';
  END IF;
  FOREACH v_attack IN ARRAY ARRAY['signed_off_at', 'signed_off_by'] LOOP
    IF has_column_privilege('authenticated', 'public.community_posts', v_attack, 'UPDATE')
       OR has_column_privilege('authenticated', 'public.community_posts', v_attack, 'INSERT') THEN
      RAISE EXCEPTION 'ABORT: authenticated still holds a write privilege on community_posts.%', v_attack;
    END IF;
  END LOOP;
  IF has_column_privilege('authenticated', 'public.community_posts', 'author_user_id', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: authenticated still holds UPDATE on community_posts.author_user_id';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.community_posts', 'author_user_id', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.community_posts', 'body', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: authenticated lost INSERT on community_posts.author_user_id or UPDATE on community_posts.body';
  END IF;
  IF has_table_privilege('anon', 'public.organizations', 'UPDATE')
     OR has_table_privilege('anon', 'public.community_posts', 'UPDATE')
     OR has_table_privilege('anon', 'public.community_member_profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: anon still holds UPDATE on a table this migration closed';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
       WHERE NOT tgisinternal AND tgenabled <> 'D'
         AND tgname IN ('organizations_plan_guard_trg', 'community_member_profiles_verification_guard_trg',
                        'org_membership_role_guard_trg', 'community_posts_guard_trg',
                        'community_post_signoff_requests_guard_trg', 'community_groups_owner_guard_trg')) <> 6 THEN
    RAISE EXCEPTION 'ABORT: one of the six guard triggers is missing or disabled';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('workspace_item_overrides', 'org_watchlist', 'workspace_tags', 'item_workspace_tags', 'portfolios', 'portfolio_members')
         AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
         AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%user_can_write_in_org%') <> 15 THEN
    RAISE EXCEPTION 'ABORT: the 15 viewer-gap write policies do not all reference user_can_write_in_org';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('workspace_item_overrides', 'org_watchlist', 'workspace_tags', 'item_workspace_tags', 'portfolios', 'portfolio_members')
         AND cmd = 'SELECT'
         AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%user_can_write_in_org%') <> 0 THEN
    RAISE EXCEPTION 'ABORT: a read policy was switched to user_can_write_in_org; viewers must keep reading';
  END IF;

  RAISE NOTICE 'migration 370 OK: plan, verification columns and sign-off columns are system-written (column privilege and trigger each refuse with 42501); org_memberships role transitions, post author and group moves, sign-off self-decisions and group ownership transfers are guarded; the viewer role cannot write the six workspace tables; ordinary own-row writes and service_role writes still work';
END $sc$;

DROP FUNCTION pg_temp.sec3b_try(text, uuid, text);
DROP FUNCTION pg_temp.sec3b_expect(text, text, text, text);

COMMIT;
