-- subject: Migration 371 (lane SEC-4, 2026-10-08): every SECURITY DEFINER function in public gets explicit grants and a pinned search_path; EXECUTE is revoked from PUBLIC on all of them and then granted per class (A internal helpers and E the cache writer to service_role only, B trigger functions to nobody, C public listing RPCs and RLS predicates to anon, authenticated and service_role, D everything else callable to authenticated and service_role), every definer lacking a search_path is pinned to public, pg_temp (public, extensions, pg_temp where its body names a pgcrypto or other extension function), and accept_invitation stops demoting an existing owner or admin who accepts a lower invitation; the self-check attacks each class as the refused role and exercises it as the intended role against real rows in a block that always rolls back; APPLIED (production ledger version 20261008131647, as of 2026-10-08).
-- 371 -- definer hygiene (lane SEC-4, 2026-10-08).
--
-- APPLIED (production ledger version 20261008131647, as of 2026-10-08). Authored by lane SEC-4; the coordinator's executor applies it after CI and after 369 (and 370 if it has
-- merged), under the two-track policy (CLAUDE.md standing rule 3: schema DDL applies via the Supabase CLI before any
-- dependent code commits). No code in src or scripts changes: every caller of what is closed here uses the service-role
-- client or a signed-in user's client (evidence per function below). Sibling of 369 (SEC-3a, functions, views and table
-- grants) and 370 (SEC-3b, table policies); it touches no table policy and no function body but accept_invitation.
--
-- WHY. PostgreSQL grants EXECUTE on every new function to PUBLIC, and Supabase's default privileges grant it to anon,
-- authenticated and service_role on top. A SECURITY DEFINER function runs with its owner's rights, so each one without an
-- explicit REVOKE is a privilege door open to the anon key. SEC-3a's session log (2026-10-08) counted 56 definers in the
-- migration tree, 14 with an explicit REVOKE FROM PUBLIC and 42 without (31 callable, 11 trigger). This lane's own parse
-- of the tree (create, drop and redefine in file order, comments stripped) found 57 (45 callable, 12 trigger) before 370 merged
-- (58 with 370, which adds the callable user_can_write_in_org; 370's amendment for the 42P17 policy recursion adds two more, user_org_role and user_group_role, both policy predicates used only in INSERT, UPDATE and DELETE policies and so class D like user_can_write_in_org: 60): one more than SEC-3a's 56 before 370. Migration 358 defines move_override_notes_to_item_notes (SEC-3a's log says the tree does not define it),
-- and intelligence_items_theme_guard is a trigger function revoked from PUBLIC only; the callable count is 32 + 14 and the
-- trigger count 11 + 1, and the test file asserts both.
-- A CREATE OR REPLACE also resets a function's search_path, which is how migrations 272
-- and 316 dropped the pin migration 160 had set on get_technology_items, get_workspace_intelligence, _dashboard, _listings
-- and _slim; an unpinned path lets a role that can create objects in a schema ahead of public shadow what a body names.
-- Fitness function F70 (definer-hygiene) keeps both halves from returning for any definer created at 371 or later.
--
-- 1. THE CLASSES. Grants are applied to every overload of each name, found in pg_proc at apply time (no hand-typed
--    signature), and a name absent from this database is skipped with a NOTICE (several migrations are authored but not
--    yet applied live).
--      A  internal helpers, service_role only: _assert_org_membership, _workspace_active_items. Callers are other
--         definer functions (the page RPCs, which run as the owner and are not affected by a revoke from the public roles).
--         Not used in any RLS policy [CONFIRMED by reading every current CREATE and ALTER POLICY in the tree].
--      B  the SECURITY DEFINER trigger functions, nobody (REVOKE FROM PUBLIC, anon, authenticated; found by prorettype =
--         trigger at apply time). EXECUTE on a trigger function is checked at CREATE TRIGGER, never at fire time, so a
--         revoke here cannot stop a trigger from firing; it only stops a role calling the function by name.
--      C  public listing RPCs and RLS predicates, anon, authenticated and service_role granted explicitly (REVOKE FROM
--         PUBLIC only, so the explicit grants stay the contract): get_market_intel_items_public,
--         get_operations_items_public, get_research_items_public, get_workspace_intelligence_listings_public,
--         get_workspace_intelligence_slim_public (migration 306, anon grant stated there; the app reads them through
--         getServiceSupabase) and, BY CALLER EVIDENCE, the four predicates user_belongs_to_org, user_is_group_admin,
--         user_is_group_member, user_owns_group. The brief put the predicates in class D; the evidence moves them. Their
--         callers are RLS policies with no TO clause (006_rls_multi_tenant.sql, 046, 259, 311, 313, 345, 358, 359, 362),
--         which apply to PUBLIC, and PostgreSQL checks EXECUTE on a function used inside a policy as the role running the
--         query. Revoking anon would turn an anon SELECT on organizations, workspace_settings, community_groups and the
--         other tables those policies guard from "zero rows" into 42501. Each predicate reads auth.uid() or a caller
--         supplied id and returns a boolean, so an anon call learns nothing it could not learn from an authenticated one.
--      D  everything else callable, authenticated and service_role (REVOKE FROM PUBLIC, anon): accept_invitation,
--         create_org_for_self, decline_invitation, lookup_invitation, revoke_invitation, get_all_surface_counts,
--         get_surface_counts, get_market_intel_items, get_operations_items, get_research_items, get_technology_items,
--         get_workspace_due_next, get_workspace_intelligence, get_workspace_intelligence_aggregates,
--         get_workspace_intelligence_aggregates_scoped, get_workspace_intelligence_dashboard,
--         get_workspace_intelligence_listings, get_workspace_intelligence_slim, get_workspace_recent_changes, and (migration 370, SEC-3b,
--         merged after this lane began) user_can_write_in_org, the viewer-read-only write predicate. It is used only in the
--         INSERT, UPDATE and DELETE policies of tables whose write grants 369 limits, so an anon write is denied with 42501
--         either by the privilege check or by the policy; 370 revoked it from PUBLIC only, so Supabase's default anon grant
--         would otherwise remain.
--         Callers [CONFIRMED by git grep over src and scripts]: the invitation functions are called from
--         src/app/api/invitations/[token]/{accept,decline}/route.ts, src/app/api/invitations/[token]/route.ts and
--         src/app/api/orgs/[org_id]/invitations/[id]/route.ts through the signed-in user's client (requireCommunityRoute,
--         authentication required); create_org_for_self from src/lib/orgs/create-org.mjs; the get_* functions through
--         getServiceSupabase (supabase-server.ts lines 866, 1605, 3065; dashboard/surface-coverage.ts; the health surfaces
--         route). None is called from a browser client or the anon key, and every one already refuses anon inside its body
--         (auth.uid() or _assert_org_membership), so the revoke only moves the refusal to the privilege check.
--         lookup_invitation was the one explicitly granted to anon (migration 076, "anon-safe"); its only caller is the
--         authenticated route above, so anon loses nothing the product uses.
--      E  gate_a_health_refresh, service_role only: the unscheduled cache writer (migration 256), no caller through rpc.
--         This migration now references it, so its entry in F47's reason-bearing allowlist is removed in the same PR.
--
-- 2. search_path. Every SECURITY DEFINER function in public whose proconfig has no search_path ending in pg_temp is
--    enumerated from pg_proc at apply time and pinned with ALTER FUNCTION ... SET search_path = public, pg_temp, or its
--    existing schemas followed by pg_temp when it already has a pin without it (no CREATE OR REPLACE, so no body
--    is restated and none can drift). The body of each function the tree defines without a pin was read for unqualified
--    references to objects outside public [CONFIRMED]: get_technology_items, get_workspace_intelligence, _dashboard,
--    _listings and _slim name only public tables, public._assert_org_membership and public._workspace_active_items, so
--    public, pg_temp is complete for them. The one function in the tree that calls an extension function unqualified,
--    create_org_for_self (pgcrypto gen_random_bytes), already carries public, extensions, pg_temp from migration 160 and is
--    not touched. For a function that exists only on the live database, whose body this lane cannot read, the apply-time
--    scan below looks for a pgcrypto, uuid-ossp, pg_trgm or unaccent function name called without a schema and, if it finds
--    one, pins public, extensions, pg_temp instead; the NOTICE names the function and the schema either way.
--
-- 3. accept_invitation. CREATE OR REPLACE with exactly one change from migration 156: the ON CONFLICT (org_id, user_id) DO
--    UPDATE branch now sets role only when the invitation is a promotion (viewer to member, viewer to admin, member to
--    admin). An existing owner or admin who accepts a lower invitation keeps the role, an owner is never granted by an
--    invitation (invitations cannot propose it) and an existing owner is never changed; owner transfer stays with
--    org_membership_role_guard (migration 370). SEC-3b disclosed the demotion; migration 156's clause set the role to
--    whatever the invitation proposed. Also restated: SECURITY DEFINER and SET search_path = public, pg_temp (a CREATE OR
--    REPLACE resets the path; the body names only public and auth-qualified objects). The invitation is still marked
--    accepted when the role is unchanged, because the invitee did join (or already was a member).
--
-- SELF-CHECK. One DO block, real rows only (an admin, an owner, a member and a viewer membership are read from
-- org_memberships; a leg with no such row is skipped with a NOTICE and never invented), every change rolled back by a
-- sentinel exception. Helpers in pg_temp (dropped afterwards) run one statement as a role under SET LOCAL ROLE and return
-- 'ok' or the SQLSTATE, and accept an invitation as a real member. Per class: one call as the intended role succeeds (or
-- passes the privilege check) and one call as a refused role raises 42501; accept_invitation as a real admin accepting a
-- viewer invitation leaves the row admin (and the owner and promotion cases); catalog assertions through aclexplode with
-- acldefault (so a function with a NULL ACL, which means PUBLIC may execute, is counted): no SECURITY DEFINER function in
-- public grants EXECUTE to PUBLIC, every one carries search_path in proconfig, every classed function holds exactly the
-- privileges of its class for anon, authenticated and service_role.
--
-- ONE RULE FOR search_path (coordinator ruling, 2026-10-08): a path that omits pg_temp searches the temporary schema first
-- and implicitly, which is the shadowing hole the pin exists to close, so a path that does not END in pg_temp counts as
-- unpinned. Six functions in the tree carry search_path = public alone (admin_set_judgement_drain, admin_set_pause_state,
-- capture_worker_fetch, enqueue_pending_first_fetch, move_override_notes_to_item_notes, reorder_user_list_item); the same
-- apply-time enumeration repairs them (their existing schemas are kept and pg_temp is appended), with no list in the SQL.

BEGIN;

-- ---- Preconditions ---------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'postgres'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      RAISE EXCEPTION 'ABORT: role % does not exist', v_role;
    END IF;
  END LOOP;
  IF to_regprocedure('public.accept_invitation(text)') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.accept_invitation(text) does not exist (migration 076 creates it)';
  END IF;
  IF to_regclass('public.org_memberships') IS NULL OR to_regclass('public.org_invitations') IS NULL OR to_regclass('public.org_member_bans') IS NULL THEN
    RAISE EXCEPTION 'ABORT: org_memberships, org_invitations and org_member_bans are required (migrations 006, 076, 156)';
  END IF;
END $$;

-- ---- 3. accept_invitation: the one function body this migration restates ---------------------------------------------
-- IDENTICAL to migration 156 except the ON CONFLICT clause (promotion only) and the pinned search_path.
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation public.org_invitations;
  v_caller_id  uuid;
  v_caller_email text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT lower(u.email) INTO v_caller_email
  FROM auth.users u WHERE u.id = v_caller_id;
  IF v_caller_email IS NULL THEN
    RAISE EXCEPTION 'Caller email not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invitation
  FROM public.org_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF v_invitation IS NULL THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', v_invitation.status USING ERRCODE = '22023';
  END IF;
  IF v_invitation.expires_at <= now() THEN
    UPDATE public.org_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;
  IF v_invitation.invited_email <> v_caller_email THEN
    RAISE EXCEPTION 'Invitation is for a different email' USING ERRCODE = '42501';
  END IF;

  -- BAN GUARD (migration 156): a banned account cannot rejoin this workspace,
  -- even with a fresh invitation. Lifting the ban (DELETE the row) is required
  -- first. Errcode 42501 = insufficient privilege.
  IF EXISTS (
    SELECT 1 FROM public.org_member_bans b
    WHERE b.org_id = v_invitation.org_id
      AND b.user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'This account is banned from the workspace' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.org_memberships (org_id, user_id, role)
  VALUES (v_invitation.org_id, v_caller_id, v_invitation.proposed_role)
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role = EXCLUDED.role
    WHERE (org_memberships.role = 'viewer' AND EXCLUDED.role IN ('member', 'admin'))
       OR (org_memberships.role = 'member' AND EXCLUDED.role = 'admin');

  UPDATE public.org_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_invitation.id;

  RETURN v_invitation.org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

-- ---- 1. Grants by class ----------------------------------------------------------------------------------------------
-- The class table. Read by the grant loop below and by the self-check, so the two cannot drift apart.
CREATE TEMP TABLE sec4_class (cls text NOT NULL, revoke_from text NOT NULL, grant_to text NOT NULL, fname text NOT NULL) ON COMMIT DROP;

INSERT INTO sec4_class (cls, revoke_from, grant_to, fname)
SELECT v.cls, v.revoke_from, v.grant_to, n
  FROM (VALUES
    ('A', 'PUBLIC, anon, authenticated', 'service_role', ARRAY['_assert_org_membership', '_workspace_active_items']),
    ('C', 'PUBLIC', 'anon, authenticated, service_role', ARRAY['get_market_intel_items_public', 'get_operations_items_public', 'get_research_items_public', 'get_workspace_intelligence_listings_public', 'get_workspace_intelligence_slim_public', 'user_belongs_to_org', 'user_is_group_admin', 'user_is_group_member', 'user_owns_group']),
    ('D', 'PUBLIC, anon', 'authenticated, service_role', ARRAY['accept_invitation', 'create_org_for_self', 'decline_invitation', 'lookup_invitation', 'revoke_invitation', 'get_all_surface_counts', 'get_surface_counts', 'get_market_intel_items', 'get_operations_items', 'get_research_items', 'get_technology_items', 'get_workspace_due_next', 'get_workspace_intelligence', 'get_workspace_intelligence_aggregates', 'get_workspace_intelligence_aggregates_scoped', 'get_workspace_intelligence_dashboard', 'get_workspace_intelligence_listings', 'get_workspace_intelligence_slim', 'get_workspace_recent_changes', 'user_can_write_in_org', 'user_org_role', 'user_group_role']),
    ('E', 'PUBLIC, anon, authenticated', 'service_role', ARRAY['gate_a_health_refresh'])
  ) AS v(cls, revoke_from, grant_to, names), unnest(v.names) AS n;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.cls, c.fname, c.revoke_from, c.grant_to, p.oid::regprocedure AS sig
      FROM sec4_class c
      LEFT JOIN pg_proc p ON p.pronamespace = 'public'::regnamespace AND p.proname = c.fname
     ORDER BY c.cls, c.fname, p.oid
  LOOP
    IF r.sig IS NULL THEN
      RAISE NOTICE 'migration 371: public.% does not exist on this database, class % skipped', r.fname, r.cls;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %s', r.sig, r.revoke_from);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', r.sig, r.grant_to);
  END LOOP;
END $$;

-- Class B. EXECUTE on a trigger function is checked at CREATE TRIGGER, never at fire time: this stops a role calling the function by name, and cannot stop a trigger firing.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)
     ORDER BY p.proname, p.oid
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Catch-all: a SECURITY DEFINER function that still holds PUBLIC EXECUTE after the classes (a function that exists only
-- on this database, or one added to the tree and left out of the class table) is revoked from PUBLIC only; its explicit
-- anon and authenticated grants are untouched and are named in the NOTICE for the next lane. A NULL ACL means the default,
-- which includes PUBLIC, so it is counted through acldefault.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND EXISTS (
         SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
     ORDER BY p.proname, p.oid
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    RAISE NOTICE 'migration 371: public.% held PUBLIC EXECUTE outside every class; revoked from PUBLIC only, give it a class', r.proname;
  END LOOP;
END $$;

-- ---- 2. search_path --------------------------------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_path text;
  v_cur text;
  -- unqualified calls to functions that live in the extensions schema (pgcrypto, uuid-ossp, pg_trgm, unaccent)
  v_ext_re constant text := '(^|[^A-Za-z0-9_.])(gen_random_bytes|digest|hmac|crypt|gen_salt|pgp_sym_encrypt|pgp_sym_decrypt|uuid_generate_v[0-9a-z]*|similarity|word_similarity|unaccent)[[:space:]]*[(]';
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname, p.prosrc,
           (SELECT substr(c, 13) FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%' LIMIT 1) AS cur
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%' AND c ~ 'pg_temp$')
     ORDER BY p.proname, p.oid
  LOOP
    v_cur := r.cur;
    IF v_cur IS NOT NULL THEN
      -- already pinned, but without pg_temp last: keep its schemas and name pg_temp last (the temporary schema is
      -- otherwise searched first, the shadowing hole the pin exists to close)
      v_path := regexp_replace(v_cur, ',?\s*pg_temp', '', 'g') || ', pg_temp';
    ELSIF r.prosrc ~* v_ext_re THEN
      v_path := 'public, extensions, pg_temp';
    ELSE
      v_path := 'public, pg_temp';
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = %s', r.sig, v_path);
    RAISE NOTICE 'migration 371: public.% pinned to search_path = %', r.proname, v_path;
  END LOOP;
END $$;

-- ---- Self-check: attack every class, rolled back -------------------------------------------------------------------------
-- Helper: run one statement as a role, return 'ok' or the SQLSTATE. Lives in pg_temp, dropped after the self-check.
CREATE FUNCTION pg_temp.sec4_attempt(p_role text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql;
    RESET ROLE;
    RETURN 'ok';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN SQLSTATE;
  END;
END $f$;

-- Helper: invite a real member at a proposed role, accept as that member through the real function, report the outcome
-- and the membership role afterwards ('ok:admin'). The invitation row is written by the migration role and rolled back.
CREATE FUNCTION pg_temp.sec4_accept(p_org uuid, p_user uuid, p_email text, p_proposed text) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE
  v_token text := 'sec4-' || md5(random()::text || clock_timestamp()::text);
  v_res   text;
  v_role  text;
BEGIN
  INSERT INTO public.org_invitations (org_id, invited_email, invited_by_user_id, proposed_role, token)
  VALUES (p_org, p_email, p_user, p_proposed, v_token);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  v_res := pg_temp.sec4_attempt('authenticated', format('SELECT public.accept_invitation(%L)', v_token));
  PERFORM set_config('request.jwt.claims', '{}', true);
  SELECT m.role INTO v_role FROM public.org_memberships m WHERE m.org_id = p_org AND m.user_id = p_user;
  RETURN v_res || ':' || coalesce(v_role, 'none');
END $f$;

DO $selfcheck$
DECLARE
  r              record;
  v_leg          record;
  v_res          text;
  v_n            integer;
  v_exp_anon     boolean;
  v_exp_auth     boolean;
  v_member_org   uuid;
  v_member_user  uuid;
  v_fx_org       uuid;
  v_fx_user      uuid;
  v_fx_email     text;
  v_src          text;
BEGIN
  BEGIN
    -- ======== A. catalog: every classed function holds exactly its class privileges ========
    FOR r IN
      SELECT c.cls, c.fname, p.oid
        FROM sec4_class c
        JOIN pg_proc p ON p.pronamespace = 'public'::regnamespace AND p.proname = c.fname
    LOOP
      v_exp_anon := (r.cls = 'C');
      v_exp_auth := (r.cls IN ('C', 'D'));
      IF has_function_privilege('anon', r.oid, 'EXECUTE') <> v_exp_anon THEN
        RAISE EXCEPTION 'ABORT: anon EXECUTE on % (class %) is % (want %)', r.fname, r.cls, NOT v_exp_anon, v_exp_anon;
      END IF;
      IF has_function_privilege('authenticated', r.oid, 'EXECUTE') <> v_exp_auth THEN
        RAISE EXCEPTION 'ABORT: authenticated EXECUTE on % (class %) is % (want %)', r.fname, r.cls, NOT v_exp_auth, v_exp_auth;
      END IF;
      IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'ABORT: service_role lost EXECUTE on % (class %)', r.fname, r.cls;
      END IF;
    END LOOP;

    -- B. trigger functions: nobody but the owner can call them
    FOR r IN
      SELECT p.oid, p.proname FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)
    LOOP
      IF has_function_privilege('anon', r.oid, 'EXECUTE') OR has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'ABORT: a public role can still EXECUTE the trigger function %', r.proname;
      END IF;
    END LOOP;

    -- no SECURITY DEFINER function in public grants EXECUTE to PUBLIC (a NULL ACL is the default, which includes PUBLIC)
    SELECT count(*) INTO v_n FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE');
    IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: % SECURITY DEFINER function(s) in public still grant EXECUTE to PUBLIC', v_n; END IF;

    -- every SECURITY DEFINER function in public carries a search_path that ends in pg_temp
    SELECT count(*) INTO v_n FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%' AND c ~ 'pg_temp$');
    IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: % SECURITY DEFINER function(s) in public carry no search_path ending in pg_temp', v_n; END IF;

    -- accept_invitation as applied carries the promotion-only clause
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure('public.accept_invitation(text)');
    IF v_src !~ 'ON CONFLICT[^;]*WHERE' THEN RAISE EXCEPTION 'ABORT: accept_invitation does not carry the promotion-only ON CONFLICT clause'; END IF;

    -- ======== B. runtime attacks as the refused role, controls as the intended role ========
    -- class D (lookup_invitation was granted to anon by migration 076): anon refused, authenticated and service_role pass
    IF to_regprocedure('public.lookup_invitation(text)') IS NOT NULL THEN
      v_res := pg_temp.sec4_attempt('anon', 'SELECT * FROM public.lookup_invitation(''sec4-no-such-token'')');
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: anon calling lookup_invitation got % (want 42501)', v_res; END IF;
      v_res := pg_temp.sec4_attempt('authenticated', 'SELECT * FROM public.lookup_invitation(''sec4-no-such-token'')');
      IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: authenticated calling lookup_invitation got % (want ok)', v_res; END IF;
      v_res := pg_temp.sec4_attempt('service_role', 'SELECT * FROM public.lookup_invitation(''sec4-no-such-token'')');
      IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: service_role calling lookup_invitation got % (want ok)', v_res; END IF;
    END IF;

    -- class C (control): anon still reaches the public listing RPC and an RLS predicate
    IF to_regprocedure('public.get_market_intel_items_public()') IS NOT NULL THEN
      v_res := pg_temp.sec4_attempt('anon', 'SELECT count(*) FROM public.get_market_intel_items_public()');
      IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: anon calling get_market_intel_items_public got % (want ok)', v_res; END IF;
    END IF;
    IF to_regprocedure('public.user_belongs_to_org(uuid)') IS NOT NULL THEN
      v_res := pg_temp.sec4_attempt('anon', format('SELECT public.user_belongs_to_org(%L::uuid)', gen_random_uuid()));
      IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: anon calling user_belongs_to_org got % (want ok; an RLS policy needs it)', v_res; END IF;
    END IF;

    -- class E: anon and authenticated refused before the function body can run
    IF to_regprocedure('public.gate_a_health_refresh()') IS NOT NULL THEN
      v_res := pg_temp.sec4_attempt('anon', 'SELECT public.gate_a_health_refresh()');
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: anon calling gate_a_health_refresh got % (want 42501)', v_res; END IF;
      v_res := pg_temp.sec4_attempt('authenticated', 'SELECT public.gate_a_health_refresh()');
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: authenticated calling gate_a_health_refresh got % (want 42501)', v_res; END IF;
    END IF;

    -- class A: a real member as authenticated is refused (so the 42501 is the privilege check, not the membership check);
    -- the service role passes. Needs one real membership row.
    SELECT om.org_id, om.user_id INTO v_member_org, v_member_user FROM public.org_memberships om ORDER BY om.created_at LIMIT 1;
    IF v_member_org IS NULL THEN
      RAISE NOTICE 'migration 371 self-check: no org_memberships row to impersonate, the class A runtime attack skipped (the catalog assertion above still ran)';
    ELSIF to_regprocedure('public._assert_org_membership(uuid)') IS NOT NULL THEN
      PERFORM set_config('request.jwt.claim.role', '', true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_user, 'role', 'authenticated')::text, true);
      v_res := pg_temp.sec4_attempt('authenticated', format('SELECT public._assert_org_membership(%L::uuid)', v_member_org));
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: a real member as authenticated calling _assert_org_membership got % (want 42501)', v_res; END IF;
      PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
      v_res := pg_temp.sec4_attempt('service_role', format('SELECT public._assert_org_membership(%L::uuid)', v_member_org));
      IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: service_role calling _assert_org_membership got % (want ok)', v_res; END IF;
      PERFORM set_config('request.jwt.claims', '{}', true);
    END IF;

    -- ======== C. accept_invitation: a role is never lowered by accepting a lower invitation ========
    -- have: the role the real member holds; proposed: the invitation; want: the role afterwards. Promotion legs last.
    FOR v_leg IN
      SELECT * FROM (VALUES
        (1, 'admin',  'viewer', 'admin'),
        (2, 'admin',  'member', 'admin'),
        (3, 'owner',  'viewer', 'owner'),
        (4, 'owner',  'admin',  'owner'),
        (5, 'member', 'viewer', 'member'),
        (6, 'viewer', 'member', 'member'),
        (7, 'member', 'admin',  'admin'),
        (8, 'viewer', 'admin',  'admin')
      ) AS t(ord, have, proposed, want) ORDER BY ord
    LOOP
      v_fx_org := NULL;
      SELECT m.org_id, m.user_id, lower(u.email) INTO v_fx_org, v_fx_user, v_fx_email
        FROM public.org_memberships m
        JOIN auth.users u ON u.id = m.user_id
        JOIN public.profiles pr ON pr.id = m.user_id
       WHERE m.role = v_leg.have AND u.email IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.org_invitations i WHERE i.org_id = m.org_id AND i.invited_email = lower(u.email) AND i.status = 'pending')
         AND NOT EXISTS (SELECT 1 FROM public.org_member_bans b WHERE b.org_id = m.org_id AND b.user_id = m.user_id)
       ORDER BY m.created_at LIMIT 1;
      IF v_fx_org IS NULL THEN
        RAISE NOTICE 'migration 371 self-check: no % membership to impersonate, the accept_invitation leg % to % skipped', v_leg.have, v_leg.have, v_leg.proposed;
        CONTINUE;
      END IF;
      v_res := pg_temp.sec4_accept(v_fx_org, v_fx_user, v_fx_email, v_leg.proposed);
      IF v_res <> 'ok:' || v_leg.want THEN
        RAISE EXCEPTION 'ABORT: a real % accepting a % invitation got % (want ok:%)', v_leg.have, v_leg.proposed, v_res, v_leg.want;
      END IF;
    END LOOP;

    RAISE EXCEPTION 'sec4_371_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'sec4_371_selfcheck_rollback' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'migration 371 OK: every SECURITY DEFINER function in public has EXECUTE revoked from PUBLIC and holds only its class privileges (A and E service_role, B nobody, C anon authenticated service_role, D authenticated service_role), every one carries a pinned search_path, accept_invitation no longer lowers a role, and each class was attacked as the refused role and exercised as the intended role';
END $selfcheck$;

DROP FUNCTION pg_temp.sec4_accept(uuid, uuid, text, text);
DROP FUNCTION pg_temp.sec4_attempt(text, text);

COMMIT;

-- Rollback (reversible in intent; do not, it re-opens the holes):
--   GRANT EXECUTE ON FUNCTION <each function in the class table above> TO PUBLIC, anon, authenticated;
--   ALTER FUNCTION <each pinned function> RESET search_path;   (the NOTICE lines of the apply list them)
--   restore migration 156's accept_invitation body (the unconditional SET role = EXCLUDED.role).
