-- subject: Migration 364 (lane SEC-1, 2026-10-08): an authenticated user can no longer write their own is_platform_admin, role, org_id or workspace_role on public.profiles; table-level INSERT/UPDATE is replaced by column-level grants that exclude those four columns, plus a BEFORE INSERT OR UPDATE guard trigger (profiles_privilege_guard) that raises 42501 for any caller other than service_role, postgres, supabase_admin or the table owner; the self-check attacks both layers as role authenticated and rolls back; NOT APPLIED.
-- 364 -- profiles privilege columns (lane SEC-1, 2026-10-08).
--
-- APPLIED (production ledger version 20261008030947, as of 2026-10-08). Authored by lane SEC-1; the coordinator's executor applies it before the PR merges (two-track
-- policy, CLAUDE.md standing rule 3: schema DDL applies via the Supabase CLI before any dependent code commits).
-- No code depends on this migration: every user-session write to profiles in src touches only columns that stay
-- writable (listed under CONSUMERS below).
--
-- THE FINDING. [CONFIRMED by catalog read, 2026-10-08] role `authenticated` held UPDATE on public.profiles
-- (table-level, so on every column, including is_platform_admin). The only UPDATE policy, profiles_self_update
-- (migration 165), gates ROWS (auth.uid() = id), not COLUMNS, and no trigger guarded the column. So any signed-in
-- user could run, through PostgREST, `PATCH /rest/v1/profiles?id=eq.<own id>` with {"is_platform_admin": true}
-- and become a platform admin (requirePlatformAdmin and the admin RLS policies read that column). The same
-- hole covered `role`, `org_id` and `workspace_role` (the denormalised active-org projection, migration 105).
-- [CONFIRMED by code read, same date] the same four columns were also reachable by INSERT: profiles_self_insert
-- (migration 165) lets a signed-in user create their OWN row, and authenticated held table-level INSERT, so a user
-- with no profile row yet could insert one carrying is_platform_admin = true before ensureProfile (service role)
-- created the row. This migration closes that path too (rule 13: a flag is work).
--
-- THE FIX, TWO LAYERS.
--   1. Column privileges. REVOKE INSERT and UPDATE on the table FROM PUBLIC, anon, authenticated, then GRANT
--      INSERT and UPDATE back to authenticated on every profiles column EXCEPT the four privilege-bearing ones:
--          is_platform_admin   role   org_id   workspace_role
--      (all four exist: role in 001, is_platform_admin in 075, org_id and workspace_role in 105). A table-level
--      revoke is required: REVOKE (col) while a table-level grant exists is a no-op in Postgres. The column list
--      is read from pg_attribute at apply time, so it is exactly the table's live columns minus the four.
--      anon is NOT re-granted: no policy ever let anon write profiles (002 has only "Public read" SELECT, 165 adds
--      authenticated-only INSERT/UPDATE), so this changes no behaviour and removes a dead grant. service_role is
--      untouched and keeps full privileges. SELECT grants are untouched (migration 165 owns them).
--   2. Defence in depth. BEFORE INSERT OR UPDATE trigger profiles_privilege_guard raises 42501 when a caller that
--      is not sanctioned changes any of the four columns (UPDATE) or inserts a row carrying any of them at a
--      non-default value (INSERT: is_platform_admin true, org_id or workspace_role not null, role other than the
--      column default 'viewer'). It makes a future careless GRANT (or a re-run of a schema-wide
--      GRANT ... ON ALL TABLES) harmless: the privilege can come back, the escalation cannot.
--
-- WHO IS SANCTIONED (the identity idiom). The guard keys on current_user, NOT on a JWT claim and NOT on a
-- transaction-local marker. Why not migration 201's marker idiom (app.pause_flag_writer set by a SECURITY DEFINER
-- RPC): 201 needs a marker because its writer is an RPC that must be the ONLY path even for service_role. Here the
-- sanctioned writers are roles. Under PostgREST the requester's role is applied with SET LOCAL ROLE, so
-- current_user is `authenticated`/`anon` for a user and `service_role` for the service key; a SECURITY DEFINER
-- function runs as its owner (postgres); the SQL editor and migrations run as postgres. A request.jwt.claim.role
-- GUC is a client-influenced setting and is deliberately not consulted. The trigger function is SECURITY INVOKER
-- on purpose, so current_user is the real caller.
--
-- RPCs CHECKED. [CONFIRMED by reading the definitions] create_org_for_self (076) and accept_invitation (076, 156,
-- 160 pins search_path only) are SECURITY DEFINER and write organizations, org_memberships, workspace_settings and
-- org_invitations; NEITHER writes profiles. So no marker is needed and no RPC body is touched or needs to change.
-- No trigger function or other SQL function in the migration tree updates profiles (075's mirrors were dropped in
-- 183).
--
-- CONSUMERS (user-session writes to profiles in fsi-app/src, none touches the four columns) [CONFIRMED by grep]:
--   UserProfilePage.tsx persist(): full_name, bio, avatar_url, jurisdiction_overrides, transport_mode_overrides,
--     verifier_status (set to 'pending'), updated_at
--   OnboardingWizard.tsx: transport_mode_overrides, jurisdiction_overrides, updated_at
--   NoWorkspaceLanding.tsx: job_title, updated_at
--   lib/orgs/create-org.mjs: job_title, region, updated_at
--   api/auth/linkedin/callback/route.ts: linkedin_verified, verification_tier, full_name, headline, linkedin_url,
--     updated_at
--   lib/auth/provision-personal-workspace.ts ensureProfile (service role INSERT of id, email, role 'member',
--     settings): unaffected, service_role is sanctioned.
--
-- CONSEQUENCE FOR FUTURE COLUMNS. A column added to profiles after this migration gets no INSERT/UPDATE grant for
-- authenticated until the adding migration grants it. That fails closed (a write errors 42501, visibly) and is the
-- intended default for a privilege boundary.
--
-- SELF-CHECK (inside the migration transaction, rolled back by a sentinel exception, no data changed). Fixtures
-- are never invented ids (profiles.id has a foreign key to auth.users, profiles_id_auth_users_fkey): the UPDATE legs use the
-- oldest REAL profile row (all changes rolled back; skipped with a NOTICE if profiles is empty), the INSERT legs use an
-- auth.users row with no profile, or a fixture auth.users row with only its id (rolled back). As role authenticated
-- with a fixture JWT sub:
--   A. UPDATE of each of the four columns on the own row is refused with 42501 "permission denied" (layer 1);
--   B. UPDATE of job_title on the own row SUCCEEDS with 1 row (the revoke is not over-broad);
--   C. INSERT of an own row with is_platform_admin = true is refused with 42501; a plain own-row INSERT succeeds;
--   D. with the four column grants TEMPORARILY restored inside the rolled-back sub-transaction, the same UPDATE and
--      INSERT attacks are refused by the TRIGGER (42501 naming profiles_privilege_guard): layer 2 stands alone;
--   E. as role service_role, UPDATE of is_platform_admin SUCCEEDS (the sanctioned path is open).
-- After the sub-transaction, the privilege catalog is checked (has_column_privilege). Reversible: DROP TRIGGER
-- profiles_privilege_guard_trg, DROP FUNCTION profiles_privilege_guard(), GRANT INSERT, UPDATE ON public.profiles
-- TO authenticated (restores the pre-364 table-level grant; do not, it re-opens the escalation).

BEGIN;

-- ---- Preconditions: the table and the four privilege-bearing columns exist -----------------------------------
DO $$
DECLARE
  v_col text;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.profiles does not exist';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['is_platform_admin', 'role', 'org_id', 'workspace_role'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = 'public.profiles'::regclass AND attname = v_col AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'ABORT: public.profiles has no column % (migrations 001, 075, 105 create the four)', v_col;
    END IF;
  END LOOP;
END $$;

-- ---- Layer 1: column privileges --------------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO v_cols
    FROM pg_attribute
   WHERE attrelid = 'public.profiles'::regclass
     AND attnum > 0
     AND NOT attisdropped
     AND attname NOT IN ('is_platform_admin', 'role', 'org_id', 'workspace_role');
  EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', v_cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', v_cols);
END $$;

-- ---- Layer 2: the guard trigger --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_privilege_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_owner name;
BEGIN
  -- Sanctioned callers: the service key's role, the migration/SQL-editor roles, and the table owner.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  SELECT pg_get_userbyid(c.relowner) INTO v_owner FROM pg_class c WHERE c.oid = 'public.profiles'::regclass;
  IF current_user = v_owner THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin
       OR NEW.role           IS DISTINCT FROM OLD.role
       OR NEW.org_id         IS DISTINCT FROM OLD.org_id
       OR NEW.workspace_role IS DISTINCT FROM OLD.workspace_role THEN
      RAISE EXCEPTION
        'profiles_privilege_guard: is_platform_admin, role, org_id and workspace_role on public.profiles are writable only by service_role or the table owner; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.is_platform_admin IS TRUE
       OR NEW.org_id IS NOT NULL
       OR NEW.workspace_role IS NOT NULL
       OR NEW.role IS DISTINCT FROM 'viewer' THEN
      RAISE EXCEPTION
        'profiles_privilege_guard: a new public.profiles row may not set is_platform_admin, role, org_id or workspace_role; only service_role or the table owner may; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.profiles_privilege_guard() IS
  'SEC-1 (migration 364). BEFORE INSERT OR UPDATE guard on public.profiles: raises 42501 when a caller other than service_role, postgres, supabase_admin or the table owner changes is_platform_admin, role, org_id or workspace_role (or inserts a row carrying a non-default value of one). SECURITY INVOKER so current_user is the real caller; keys on current_user, not on a JWT claim. Layer 2 behind the column-level grants.';

DROP TRIGGER IF EXISTS profiles_privilege_guard_trg ON public.profiles;
CREATE TRIGGER profiles_privilege_guard_trg
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_privilege_guard();

-- ---- Self-check: attack both layers, rolled back ---------------------------------------------------------------
-- FIXTURES. public.profiles.id has a foreign key to auth.users (profiles_id_auth_users_fkey), so no id is ever
-- invented: the UPDATE legs use a REAL existing profile row (oldest by created_at; every change is rolled back; if
-- profiles is empty those legs are skipped with a NOTICE), and the INSERT legs use an auth.users row that has no
-- profile yet, or, if none exists, a fixture auth.users row inserted with only its id (ASSUMPTION, stated in a NOTICE:
-- auth.users requires nothing but id; if that insert fails, the INSERT legs are skipped with a NOTICE and the
-- privilege-catalog assertions below still run). Attack values are chosen to DIFFER from the row's current value
-- (NOT is_platform_admin, etc.) so the trigger's IS DISTINCT FROM comparison fires whatever the row holds.
DO $$
DECLARE
  v_uid     uuid;
  v_new     uuid;
  v_denied  boolean;
  v_msg     text;
  v_rows    integer;
  v_flag    boolean;
  v_before  boolean;
  v_attack  text;
BEGIN
  SELECT id INTO v_uid FROM public.profiles ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'migration 364 self-check: public.profiles is empty, UPDATE legs (A, B, D, E) skipped';
  END IF;

  SELECT u.id INTO v_new
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
   WHERE p.id IS NULL
   LIMIT 1;

  BEGIN
    IF v_new IS NULL THEN
      BEGIN
        v_new := gen_random_uuid();
        INSERT INTO auth.users (id) VALUES (v_new);
        RAISE NOTICE 'migration 364 self-check: inserted a fixture auth.users row with only its id (assumes no other NOT NULL column without a default; rolled back with the self-check)';
      EXCEPTION WHEN OTHERS THEN
        v_new := NULL;
        RAISE NOTICE 'migration 364 self-check: could not insert a fixture auth.users row (%), INSERT legs (C, D2) skipped', SQLERRM;
      END;
    END IF;

    IF v_uid IS NOT NULL THEN
      SELECT is_platform_admin INTO v_before FROM public.profiles WHERE id = v_uid;

      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

      -- A. Layer 1: each privilege-bearing column refused by column privilege.
      FOREACH v_attack IN ARRAY ARRAY['is_platform_admin', 'role', 'org_id', 'workspace_role'] LOOP
        v_denied := false;
        v_msg := NULL;
        BEGIN
          IF v_attack = 'is_platform_admin' THEN
            UPDATE public.profiles SET is_platform_admin = NOT is_platform_admin WHERE id = v_uid;
          ELSIF v_attack = 'role' THEN
            UPDATE public.profiles SET role = CASE WHEN role IS DISTINCT FROM 'admin' THEN 'admin' ELSE 'viewer' END WHERE id = v_uid;
          ELSIF v_attack = 'org_id' THEN
            UPDATE public.profiles SET org_id = CASE WHEN org_id IS NULL THEN '00000000-0000-0000-0000-000000000000'::uuid ELSE NULL END WHERE id = v_uid;
          ELSE
            UPDATE public.profiles SET workspace_role = CASE WHEN workspace_role IS DISTINCT FROM 'owner' THEN 'owner' ELSE 'member' END WHERE id = v_uid;
          END IF;
        EXCEPTION WHEN insufficient_privilege THEN
          v_denied := true;
          v_msg := SQLERRM;
        END;
        IF NOT v_denied THEN
          RAISE EXCEPTION 'ABORT: authenticated was able to UPDATE profiles.% on its own row', v_attack;
        END IF;
        IF position('profiles_privilege_guard' IN v_msg) > 0 OR position('permission denied' IN v_msg) = 0 THEN
          RAISE EXCEPTION 'ABORT: layer 1 did not refuse profiles.% by column privilege (got: %)', v_attack, v_msg;
        END IF;
      END LOOP;

      -- B. Not over-broad: an ordinary own-row column still updates.
      UPDATE public.profiles SET job_title = 'sec1-selfcheck' WHERE id = v_uid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'ABORT: authenticated could not UPDATE profiles.job_title on its own row (rows=%)', v_rows;
      END IF;
      RESET ROLE;
    END IF;

    -- C. INSERT path. Attack: own row with is_platform_admin = true is refused; plain own row is accepted.
    IF v_new IS NOT NULL THEN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_new::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_new::text, 'role', 'authenticated')::text, true);
      v_denied := false;
      v_msg := NULL;
      BEGIN
        INSERT INTO public.profiles (id, is_platform_admin) VALUES (v_new, true);
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
        v_msg := SQLERRM;
      END;
      IF NOT v_denied THEN
        RAISE EXCEPTION 'ABORT: authenticated was able to INSERT its own profiles row with is_platform_admin = true';
      END IF;
      IF position('permission denied' IN v_msg) = 0 THEN
        RAISE EXCEPTION 'ABORT: layer 1 did not refuse the INSERT by column privilege (got: %)', v_msg;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_new) THEN
        INSERT INTO public.profiles (id, display_name) VALUES (v_new, 'sec1-selfcheck');
      END IF;
      RESET ROLE;
    END IF;

    -- D. Layer 2 alone: restore the four column grants, inside this rolled-back sub-transaction, and attack again.
    GRANT INSERT (is_platform_admin, role, org_id, workspace_role) ON public.profiles TO authenticated;
    GRANT UPDATE (is_platform_admin, role, org_id, workspace_role) ON public.profiles TO authenticated;

    IF v_uid IS NOT NULL THEN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

      FOREACH v_attack IN ARRAY ARRAY['is_platform_admin', 'role', 'org_id', 'workspace_role'] LOOP
        v_denied := false;
        v_msg := NULL;
        BEGIN
          IF v_attack = 'is_platform_admin' THEN
            UPDATE public.profiles SET is_platform_admin = NOT is_platform_admin WHERE id = v_uid;
          ELSIF v_attack = 'role' THEN
            UPDATE public.profiles SET role = CASE WHEN role IS DISTINCT FROM 'admin' THEN 'admin' ELSE 'viewer' END WHERE id = v_uid;
          ELSIF v_attack = 'org_id' THEN
            UPDATE public.profiles SET org_id = CASE WHEN org_id IS NULL THEN '00000000-0000-0000-0000-000000000000'::uuid ELSE NULL END WHERE id = v_uid;
          ELSE
            UPDATE public.profiles SET workspace_role = CASE WHEN workspace_role IS DISTINCT FROM 'owner' THEN 'owner' ELSE 'member' END WHERE id = v_uid;
          END IF;
        EXCEPTION WHEN insufficient_privilege THEN
          v_denied := true;
          v_msg := SQLERRM;
        END;
        IF NOT v_denied THEN
          RAISE EXCEPTION 'ABORT: with grants restored, the trigger let authenticated UPDATE profiles.% on its own row', v_attack;
        END IF;
        IF position('profiles_privilege_guard' IN v_msg) = 0 THEN
          RAISE EXCEPTION 'ABORT: layer 2 did not refuse profiles.% (got: %)', v_attack, v_msg;
        END IF;
      END LOOP;
      RESET ROLE;
    END IF;

    -- D2. Layer 2 on the INSERT path (the BEFORE trigger fires before any key or foreign-key check).
    IF v_new IS NOT NULL THEN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_new::text, true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_new::text, 'role', 'authenticated')::text, true);
      v_denied := false;
      v_msg := NULL;
      BEGIN
        INSERT INTO public.profiles (id, is_platform_admin) VALUES (v_new, true);
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
        v_msg := SQLERRM;
      END;
      IF NOT v_denied THEN
        RAISE EXCEPTION 'ABORT: with grants restored, the trigger let authenticated INSERT a profiles row with is_platform_admin = true';
      END IF;
      IF position('profiles_privilege_guard' IN v_msg) = 0 THEN
        RAISE EXCEPTION 'ABORT: layer 2 did not refuse the INSERT (got: %)', v_msg;
      END IF;
      RESET ROLE;
    END IF;

    -- E. The sanctioned path stays open: service_role can change the flag.
    IF v_uid IS NOT NULL THEN
      SET LOCAL ROLE service_role;
      UPDATE public.profiles SET is_platform_admin = NOT is_platform_admin WHERE id = v_uid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'ABORT: service_role could not UPDATE profiles.is_platform_admin (rows=%)', v_rows;
      END IF;
      RESET ROLE;
      SELECT is_platform_admin INTO v_flag FROM public.profiles WHERE id = v_uid;
      IF v_flag IS NOT DISTINCT FROM v_before THEN
        RAISE EXCEPTION 'ABORT: the service_role UPDATE of is_platform_admin did not change the value';
      END IF;
    END IF;

    RAISE EXCEPTION 'sec1_364_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'sec1_364_selfcheck_rollback' THEN RAISE; END IF;
  END;

  -- Privilege catalog after the rolled-back sub-transaction: the temporary re-grants must be gone.
  FOREACH v_attack IN ARRAY ARRAY['is_platform_admin', 'role', 'org_id', 'workspace_role'] LOOP
    IF has_column_privilege('authenticated', 'public.profiles', v_attack, 'UPDATE') THEN
      RAISE EXCEPTION 'ABORT: authenticated still holds UPDATE on profiles.%', v_attack;
    END IF;
    IF has_column_privilege('authenticated', 'public.profiles', v_attack, 'INSERT') THEN
      RAISE EXCEPTION 'ABORT: authenticated still holds INSERT on profiles.%', v_attack;
    END IF;
    IF has_column_privilege('anon', 'public.profiles', v_attack, 'UPDATE')
       OR has_column_privilege('anon', 'public.profiles', v_attack, 'INSERT') THEN
      RAISE EXCEPTION 'ABORT: anon holds a write privilege on profiles.%', v_attack;
    END IF;
  END LOOP;
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'job_title', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: authenticated lost UPDATE on profiles.job_title';
  END IF;
  IF NOT has_column_privilege('service_role', 'public.profiles', 'is_platform_admin', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: service_role lost UPDATE on profiles.is_platform_admin';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'profiles_privilege_guard_trg' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'ABORT: profiles_privilege_guard_trg is missing or disabled';
  END IF;

  RAISE NOTICE 'migration 364 OK: authenticated cannot write is_platform_admin, role, org_id or workspace_role on profiles (column privilege and trigger each refuse with 42501); ordinary own-row writes and service_role writes still work';
END $$;

COMMIT;
