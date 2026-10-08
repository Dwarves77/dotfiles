-- subject: Migration 367 (lane SEC-2, 2026-10-08): an authenticated user can no longer write their own verifier_status, verification_tier, membership_tier, contribution_score, verifier_since, linkedin_verified, linkedin_identity_verified, linkedin_workplace_verified or linkedin_verification_checked_at on public.profiles (column UPDATE and INSERT privileges revoked, and the migration 364 guard function profiles_privilege_guard extended to the same nine columns); the one legitimate user transition, asking to be verified, becomes the SECURITY DEFINER RPC public.request_verification() (none or revoked to pending for auth.uid() only); the self-check attacks both layers and the RPC as roles authenticated and anon and rolls back; NOT APPLIED.
-- 367 -- profiles status and tier columns (lane SEC-2, 2026-10-08).
--
-- APPLIED (production ledger version 20261008033159, as of 2026-10-08). Authored by lane SEC-2; the coordinator's executor applies it before the PR merges (two-track
-- policy, CLAUDE.md standing rule 3: schema DDL applies via the Supabase CLI before any dependent code commits).
-- REQUIRES migration 364 (lane SEC-1, PR 991) applied first: 364 turned the table-level INSERT/UPDATE grant into
-- per-column grants and created profiles_privilege_guard plus its trigger profiles_privilege_guard_trg. This
-- migration aborts in its preconditions if 364 is not in place. DEPENDENT CODE (committed in the same PR, safe only
-- after this applies): UserProfilePage.tsx calls the RPC instead of writing verifier_status, and the LinkedIn
-- callback route writes verification_tier through the service-role client.
--
-- THE FINDING. [CONFIRMED by code read, 2026-10-08] signoff/[id]/decide/route.ts treats profiles.verifier_status =
-- 'active' as verifier authorisation (as does migration 153's RLS on community_post_signoff_requests), and after 364
-- an authenticated user still held column UPDATE on verifier_status, so PATCH /rest/v1/profiles?id=eq.<own id> with
-- {"verifier_status": "active"} self-authorised the caller as a verifier. The same hole covers verification_tier
-- (migration 007 RLS gates community reads on verification_tier != 'unverified' / IN ('linkedin_verified',
-- 'staff_verified')), membership_tier (007 RLS: IN ('member','contributor','verified','premium')) and
-- contribution_score. [CONFIRMED by code read] profiles_self_insert (165) also lets a user create their own row, and
-- 364 granted column INSERT on these columns, so a user with no row yet could insert one carrying verifier_status
-- 'active'. Both paths are closed here (rule 13: a flag is work).
--
-- THE COLUMNS (all nine confirmed to exist by reading the migrations that create them; none is ever dropped, grep of
-- every DROP COLUMN in the migration tree; the precondition asserts them again at apply time). The first four are the
-- original SEC-2 design; the last five are the badge and timestamp fields of the same verification lifecycle,
-- added by coordinator ruling (the same lane, the same migration):
--     verifier_status     text NOT NULL DEFAULT 'none' CHECK IN ('none','pending','active','revoked')  (075)
--     verification_tier   text DEFAULT 'unverified'                                                    (007)
--     membership_tier     text DEFAULT 'free'                                                          (007)
--     contribution_score  integer DEFAULT 0                                                            (007)
--     verifier_since      timestamptz NULL                                                             (075)
--     linkedin_verified, linkedin_identity_verified, linkedin_workplace_verified  boolean DEFAULT FALSE (007)
--     linkedin_verification_checked_at  timestamptz NULL                                               (007)
--
-- THE FIX.
--   1. Column privileges: REVOKE INSERT and UPDATE on those nine columns FROM PUBLIC, anon, authenticated. (364
--      already replaced the table-level grant with column grants, so a column revoke bites; the precondition proves
--      the table-level grant is gone.) service_role is untouched and keeps full privileges.
--   2. Defence in depth: CREATE OR REPLACE the SAME function public.profiles_privilege_guard() (no second function,
--      no second trigger; the existing trigger profiles_privilege_guard_trg already calls it) so that it also
--      raises 42501 for an unsanctioned change to any of the nine columns on UPDATE, or a non-default value on
--      INSERT (verifier_status other than 'none', verification_tier other than 'unverified', membership_tier other
--      than 'free', contribution_score other than 0, verifier_since or linkedin_verification_checked_at not NULL,
--      any of the three linkedin_* booleans TRUE). The 364 checks and the sanctioned-caller idiom (current_user in
--      service_role, postgres, supabase_admin, or the table owner) are carried over unchanged.
--
-- THE ONE LEGITIMATE USER TRANSITION. Asking to be verified (UserProfilePage VerifierTab, "Request verifier
-- sign-off") used to be a direct UPDATE of verifier_status to 'pending'. It is now public.request_verification():
-- SECURITY DEFINER (so it runs as the function owner and the guard trigger sanctions it), pinned search_path,
-- EXECUTE revoked from PUBLIC and anon, granted to authenticated only. Vocabulary (075 CHECK, the only vocabulary
-- there is): none -> pending -> active -> revoked. There is NO 'rejected' value; the vocabulary's equivalent is
-- 'revoked' (the credential was withdrawn), and the existing UI already offers the request button for exactly
-- 'none' and 'revoked'. So the eligible states are 'none' (and NULL, defensively; the column is NOT NULL) and
-- 'revoked'. Behaviour by current value, for auth.uid() only (no parameter, so no way to name another user):
--     none, NULL, revoked  -> sets 'pending', returns 'pending'
--     pending              -> NO-OP, returns 'pending' (idempotent: a double submit is harmless, not an error)
--     active               -> REFUSED, SQLSTATE 55000 (a verifier does not re-apply)
--     no auth.uid()        -> REFUSED, SQLSTATE 42501
--     no profiles row      -> REFUSED, SQLSTATE P0002
-- Moving a user to 'active' or 'revoked' stays an owner/service_role act: no code path exists for it today and none
-- is added here.
--
-- CONSUMERS [CONFIRMED by grep of fsi-app/src and fsi-app/scripts]:
--   writers of the original four columns: UserProfilePage.tsx (verifier_status 'pending', now the RPC) and
--     api/auth/linkedin/callback/route.ts (verification_tier 'linkedin_verified', plus linkedin_verified, now written
--     with the service-role client; the user is already authenticated and the value is attested by the server-side
--     LinkedIn code exchange, not by the client). No other writer in src or scripts.
--   readers (unaffected): signoff decide route, community page and directory, Post/VerifierBadge, the 007 and 153 RLS
--     policies, the spot-check scripts that read source_verifications.verification_tier (a different table).
--   test/fixture only: .discipline/rendering/smoke/stub-supabase-browser-account.mjs (a stub returning 'active').
--
-- WRITERS OF THE FIVE ADDED COLUMNS [CONFIRMED by grep of fsi-app/src, fsi-app/scripts, fsi-app/.discipline and
-- supabase/seed]: linkedin_verified is written only by the LinkedIn callback (service-role client, above).
-- verifier_since, linkedin_identity_verified, linkedin_workplace_verified and linkedin_verification_checked_at have
-- NO writer anywhere in code (UserProfilePage and the community pages only select verifier_since/linkedin_verified),
-- so nothing needs to move; a future writer must be server-side or an RPC.
--
-- SELF-CHECK (inside the migration transaction, rolled back by a sentinel exception, no data changed). Fixtures are
-- never invented ids (profiles.id has a foreign key to auth.users, profiles_id_auth_users_fkey, which exists live and
-- is declared in no repo migration): the UPDATE and RPC legs use the oldest REAL profile row (normalised to the column
-- defaults by the migration role first; every change rolled back; skipped with a NOTICE if profiles is empty), and
-- the INSERT legs use an auth.users row with no profile, or a fixture auth.users row inserted with only its id
-- (rolled back; skipped with a NOTICE if it cannot be made), the same approach migration 364 uses. As role
-- authenticated with the fixture JWT sub:
--   A. UPDATE of each of the nine columns on the own row is refused with 42501 "permission denied" (layer 1);
--   B. request_verification() from 'none' returns 'pending' and the row reads 'pending';
--   C. calling it again from 'pending' returns 'pending' and changes nothing (no-op);
--   D. from 'active' it is refused with 55000; from 'revoked' it succeeds; the migration role sets the fixture state;
--   E. as role anon the RPC is refused (no EXECUTE); as authenticated with no sub it is refused with 42501;
--   F. (INSERT fixture) INSERT of an own row carrying verifier_status 'active' is refused with 42501 (layer 1), and a plain own-row
--      INSERT succeeds;
--   G. with the column grants TEMPORARILY restored inside the rolled-back sub-transaction, the same UPDATE and
--      INSERT attacks are refused by the TRIGGER (message names profiles_privilege_guard): layer 2 stands alone;
--      and the 364 columns are still refused by the same function (is_platform_admin);
--   H. the RPC still works with the grants restored AND the guard enabled (it is sanctioned by owner identity, not
--      by an absent grant);
--   I. as role service_role, UPDATE of all nine columns SUCCEEDS (the sanctioned path is open);
--   J. not over-broad: job_title still updates for authenticated.
-- After the sub-transaction the privilege catalog is checked (has_column_privilege, has_function_privilege).
-- Reversible: GRANT INSERT (the nine columns above) and GRANT UPDATE
-- of the same TO authenticated, DROP FUNCTION public.request_verification(), and CREATE OR REPLACE
-- profiles_privilege_guard() back to the migration 364 body (do not, it re-opens self-authorisation).

BEGIN;

-- ---- Preconditions: 364 is in place, the nine columns exist --------------------------------------------------------
DO $$
DECLARE
  v_col text;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.profiles does not exist';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['verifier_status', 'verification_tier', 'membership_tier', 'contribution_score',
                               'verifier_since', 'linkedin_verified', 'linkedin_identity_verified',
                               'linkedin_workplace_verified', 'linkedin_verification_checked_at',
                               'updated_at'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = 'public.profiles'::regclass AND attname = v_col AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'ABORT: public.profiles has no column % (migrations 007, 075 create them)', v_col;
    END IF;
  END LOOP;
  IF to_regprocedure('public.profiles_privilege_guard()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'profiles_privilege_guard_trg' AND tgenabled <> 'D'
     ) THEN
    RAISE EXCEPTION 'ABORT: migration 364 (profiles_privilege_guard and profiles_privilege_guard_trg) must be applied before 367';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION 'ABORT: authenticated still holds a table-level INSERT or UPDATE on public.profiles (migration 364 not in effect); a column revoke would be a no-op';
  END IF;
END $$;

-- ---- Layer 1: column privileges --------------------------------------------------------------------------------
REVOKE INSERT (verifier_status, verification_tier, membership_tier, contribution_score, verifier_since, linkedin_verified, linkedin_identity_verified, linkedin_workplace_verified, linkedin_verification_checked_at)
  ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (verifier_status, verification_tier, membership_tier, contribution_score, verifier_since, linkedin_verified, linkedin_identity_verified, linkedin_workplace_verified, linkedin_verification_checked_at)
  ON public.profiles FROM PUBLIC, anon, authenticated;

-- ---- Layer 2: extend the 364 guard function (same function, same trigger) ---------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_privilege_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_owner name;
BEGIN
  -- Sanctioned callers: the service key's role, the migration/SQL-editor roles, and the table owner (which is also
  -- the identity a SECURITY DEFINER function owned by the migration role runs as, e.g. request_verification()).
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  SELECT pg_get_userbyid(c.relowner) INTO v_owner FROM pg_class c WHERE c.oid = 'public.profiles'::regclass;
  IF current_user = v_owner THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_platform_admin   IS DISTINCT FROM OLD.is_platform_admin
       OR NEW.role               IS DISTINCT FROM OLD.role
       OR NEW.org_id             IS DISTINCT FROM OLD.org_id
       OR NEW.workspace_role     IS DISTINCT FROM OLD.workspace_role
       OR NEW.verifier_status    IS DISTINCT FROM OLD.verifier_status
       OR NEW.verification_tier  IS DISTINCT FROM OLD.verification_tier
       OR NEW.membership_tier    IS DISTINCT FROM OLD.membership_tier
       OR NEW.contribution_score IS DISTINCT FROM OLD.contribution_score
       OR NEW.verifier_since     IS DISTINCT FROM OLD.verifier_since
       OR NEW.linkedin_verified  IS DISTINCT FROM OLD.linkedin_verified
       OR NEW.linkedin_identity_verified  IS DISTINCT FROM OLD.linkedin_identity_verified
       OR NEW.linkedin_workplace_verified IS DISTINCT FROM OLD.linkedin_workplace_verified
       OR NEW.linkedin_verification_checked_at IS DISTINCT FROM OLD.linkedin_verification_checked_at THEN
      RAISE EXCEPTION
        'profiles_privilege_guard: is_platform_admin, role, org_id, workspace_role, verifier_status, verification_tier, membership_tier, contribution_score, verifier_since, the linkedin_* verification flags and linkedin_verification_checked_at on public.profiles are writable only by service_role, the table owner or a SECURITY DEFINER function it owns; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.is_platform_admin IS TRUE
       OR NEW.org_id IS NOT NULL
       OR NEW.workspace_role IS NOT NULL
       OR NEW.role IS DISTINCT FROM 'viewer'
       OR NEW.verifier_status    IS DISTINCT FROM 'none'
       OR NEW.verification_tier  IS DISTINCT FROM 'unverified'
       OR NEW.membership_tier    IS DISTINCT FROM 'free'
       OR NEW.contribution_score IS DISTINCT FROM 0
       OR NEW.verifier_since IS NOT NULL
       OR NEW.linkedin_verified IS TRUE
       OR NEW.linkedin_identity_verified IS TRUE
       OR NEW.linkedin_workplace_verified IS TRUE
       OR NEW.linkedin_verification_checked_at IS NOT NULL THEN
      RAISE EXCEPTION
        'profiles_privilege_guard: a new public.profiles row may not set is_platform_admin, role, org_id, workspace_role, verifier_status, verification_tier, membership_tier, contribution_score, verifier_since, the linkedin_* verification flags or linkedin_verification_checked_at; only service_role or the table owner may; current_user=%', current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.profiles_privilege_guard() IS
  'SEC-1 (migration 364), extended by SEC-2 (migration 367). BEFORE INSERT OR UPDATE guard on public.profiles: raises 42501 when a caller other than service_role, postgres, supabase_admin or the table owner changes is_platform_admin, role, org_id, workspace_role, verifier_status, verification_tier, membership_tier, contribution_score, verifier_since, linkedin_verified, linkedin_identity_verified, linkedin_workplace_verified or linkedin_verification_checked_at (or inserts a row carrying a non-default value of one). SECURITY INVOKER so current_user is the real caller; keys on current_user, not on a JWT claim. Layer 2 behind the column-level grants.';

-- ---- The one legitimate transition: request_verification() -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_verification()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'request_verification: no authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT p.verifier_status INTO v_status FROM public.profiles p WHERE p.id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_verification: no profiles row for the caller' USING ERRCODE = 'P0002';
  END IF;

  IF v_status = 'pending' THEN
    RETURN 'pending';
  END IF;

  IF v_status IS NULL OR v_status IN ('none', 'revoked') THEN
    UPDATE public.profiles SET verifier_status = 'pending', updated_at = now() WHERE id = v_uid;
    RETURN 'pending';
  END IF;

  RAISE EXCEPTION 'request_verification: verifier_status is % and cannot be re-requested', v_status
    USING ERRCODE = '55000';
END;
$fn$;

COMMENT ON FUNCTION public.request_verification() IS
  'SEC-2 (migration 367). SECURITY DEFINER. Sets profiles.verifier_status to pending for auth.uid() only, from none, NULL or revoked; a no-op from pending; refused (55000) from active; refused (42501) without a session. Runs as the function owner so the profiles_privilege_guard trigger sanctions the write; takes no parameter so it cannot name another user. EXECUTE: authenticated only.';

REVOKE ALL ON FUNCTION public.request_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_verification() TO authenticated;

-- ---- Self-check: attack both layers and the RPC, rolled back ----------------------------------------------------
-- FIXTURES (same approach as migration 364). public.profiles.id has a foreign key to auth.users
-- (profiles_id_auth_users_fkey), so no id is ever invented: the UPDATE and RPC legs use the oldest REAL profile row
-- (its nine columns are first set to their defaults by the migration role, and every change is rolled back; if
-- profiles is empty those legs are skipped with a NOTICE), and the INSERT legs use an auth.users row that has no
-- profile yet, or, if none exists, a fixture auth.users row inserted with only its id (ASSUMPTION, stated in a
-- NOTICE: auth.users requires nothing but id; if that insert fails the INSERT legs are skipped with a NOTICE and the
-- privilege-catalog assertions below still run).
DO $$
DECLARE
  v_uid      uuid;
  v_new      uuid;
  v_denied   boolean;
  v_msg      text;
  v_state    text;
  v_ret      text;
  v_rows     integer;
  v_cols     text[] := ARRAY['verifier_status', 'verification_tier', 'membership_tier', 'contribution_score',
                             'verifier_since', 'linkedin_verified', 'linkedin_identity_verified',
                             'linkedin_workplace_verified', 'linkedin_verification_checked_at'];
  v_vals     text[] := ARRAY['''active''', '''staff_verified''', '''premium''', '9999',
                             'now()', 'true', 'true', 'true', 'now()'];
  v_attack   text;
  i          integer;
BEGIN
  SELECT id INTO v_uid FROM public.profiles ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'migration 367 self-check: public.profiles is empty, UPDATE and RPC legs (A to E, G, H to J) skipped';
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
        RAISE NOTICE 'migration 367 self-check: inserted a fixture auth.users row with only its id (assumes no other NOT NULL column without a default; rolled back with the self-check)';
      EXCEPTION WHEN OTHERS THEN
        v_new := NULL;
        RAISE NOTICE 'migration 367 self-check: could not insert a fixture auth.users row (%), INSERT legs (F, G2) skipped', SQLERRM;
      END;
    END IF;

    IF v_uid IS NOT NULL THEN
      -- Normalise the real row to the column defaults (migration role: sanctioned; rolled back), so every attack
      -- value below DIFFERS from what the row holds and the trigger's IS DISTINCT FROM comparison must fire.
      UPDATE public.profiles
         SET verifier_status = 'none', verification_tier = 'unverified', membership_tier = 'free',
             contribution_score = 0, verifier_since = NULL, linkedin_verified = false,
             linkedin_identity_verified = false, linkedin_workplace_verified = false,
             linkedin_verification_checked_at = NULL
       WHERE id = v_uid;

      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

      -- A. Layer 1: each status, tier, badge or timestamp column refused by column privilege.
      FOR i IN 1 .. array_length(v_cols, 1) LOOP
        v_denied := false;
        v_msg := NULL;
        BEGIN
          EXECUTE format('UPDATE public.profiles SET %I = %s WHERE id = %L', v_cols[i], v_vals[i], v_uid);
        EXCEPTION WHEN insufficient_privilege THEN
          v_denied := true;
          v_msg := SQLERRM;
        END;
        IF NOT v_denied THEN
          RAISE EXCEPTION 'ABORT: authenticated was able to UPDATE profiles.% on its own row', v_cols[i];
        END IF;
        IF position('profiles_privilege_guard' IN v_msg) > 0 OR position('permission denied' IN v_msg) = 0 THEN
          RAISE EXCEPTION 'ABORT: layer 1 did not refuse profiles.% by column privilege (got: %)', v_cols[i], v_msg;
        END IF;
      END LOOP;
      -- The single named attack of the finding, spelled out.
      v_denied := false;
      BEGIN
        UPDATE public.profiles SET verifier_status = 'active' WHERE id = v_uid;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
      END;
      IF NOT v_denied THEN
        RAISE EXCEPTION 'ABORT: authenticated could self-authorise verifier_status = active';
      END IF;

      -- B. The RPC from 'none' sets 'pending'.
      v_ret := public.request_verification();
      IF v_ret IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'ABORT: request_verification() from none returned % (expected pending)', v_ret;
      END IF;
      RESET ROLE;
      SELECT verifier_status INTO v_state FROM public.profiles WHERE id = v_uid;
      IF v_state IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'ABORT: request_verification() did not persist pending (row reads %)', v_state;
      END IF;

      -- C. Again from 'pending': no-op, returns 'pending', status unchanged.
      SET LOCAL ROLE authenticated;
      v_ret := public.request_verification();
      IF v_ret IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'ABORT: request_verification() from pending returned % (expected the no-op pending)', v_ret;
      END IF;
      RESET ROLE;
      SELECT verifier_status INTO v_state FROM public.profiles WHERE id = v_uid;
      IF v_state IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'ABORT: the pending no-op changed the status to %', v_state;
      END IF;

      -- D. From 'active': refused (55000). From 'revoked': succeeds.
      UPDATE public.profiles SET verifier_status = 'active' WHERE id = v_uid;   -- migration role: sanctioned
      SET LOCAL ROLE authenticated;
      v_denied := false;
      v_msg := NULL;
      BEGIN
        v_ret := public.request_verification();
      EXCEPTION WHEN object_not_in_prerequisite_state THEN
        v_denied := true;
        v_msg := SQLERRM;
      END;
      IF NOT v_denied THEN
        RAISE EXCEPTION 'ABORT: request_verification() was accepted from active (returned %)', v_ret;
      END IF;
      RESET ROLE;
      SELECT verifier_status INTO v_state FROM public.profiles WHERE id = v_uid;
      IF v_state IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'ABORT: the refused call from active changed the status to %', v_state;
      END IF;
      UPDATE public.profiles SET verifier_status = 'revoked' WHERE id = v_uid;
      SET LOCAL ROLE authenticated;
      v_ret := public.request_verification();
      IF v_ret IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'ABORT: request_verification() from revoked returned % (expected pending)', v_ret;
      END IF;
      RESET ROLE;
      SELECT verifier_status INTO v_state FROM public.profiles WHERE id = v_uid;
      IF v_state IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'ABORT: request_verification() from revoked did not persist pending (row reads %)', v_state;
      END IF;
    END IF;

    -- E. anon has no EXECUTE; an authenticated role with no sub is refused by the function. No row is needed.
    SET LOCAL ROLE anon;
    v_denied := false;
    v_msg := NULL;
    BEGIN
      v_ret := public.request_verification();
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
      v_msg := SQLERRM;
    END;
    IF NOT v_denied THEN
      RAISE EXCEPTION 'ABORT: anon was able to call request_verification()';
    END IF;
    RESET ROLE;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{}', true);
    v_denied := false;
    v_msg := NULL;
    BEGIN
      v_ret := public.request_verification();
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
      v_msg := SQLERRM;
    END;
    IF NOT v_denied OR position('no authenticated user' IN v_msg) = 0 THEN
      RAISE EXCEPTION 'ABORT: request_verification() without a sub was not refused by the function (got: %)', v_msg;
    END IF;
    RESET ROLE;

    -- F. INSERT path, layer 1: own row carrying verifier_status = active refused; a plain own row accepted.
    IF v_new IS NOT NULL THEN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_new::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_new::text, 'role', 'authenticated')::text, true);
      v_denied := false;
      v_msg := NULL;
      BEGIN
        INSERT INTO public.profiles (id, verifier_status) VALUES (v_new, 'active');
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
        v_msg := SQLERRM;
      END;
      IF NOT v_denied THEN
        RAISE EXCEPTION 'ABORT: authenticated was able to INSERT its own profiles row with verifier_status = active';
      END IF;
      IF position('permission denied' IN v_msg) = 0 THEN
        RAISE EXCEPTION 'ABORT: layer 1 did not refuse the INSERT by column privilege (got: %)', v_msg;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_new) THEN
        INSERT INTO public.profiles (id, display_name) VALUES (v_new, 'sec2-selfcheck');
      END IF;
      RESET ROLE;
    END IF;

    -- G. Layer 2 alone: restore the nine column grants inside this rolled-back block and attack again.
    GRANT INSERT (verifier_status, verification_tier, membership_tier, contribution_score, verifier_since, linkedin_verified, linkedin_identity_verified, linkedin_workplace_verified, linkedin_verification_checked_at) ON public.profiles TO authenticated;
    GRANT UPDATE (verifier_status, verification_tier, membership_tier, contribution_score, verifier_since, linkedin_verified, linkedin_identity_verified, linkedin_workplace_verified, linkedin_verification_checked_at) ON public.profiles TO authenticated;
    GRANT UPDATE (is_platform_admin) ON public.profiles TO authenticated;

    IF v_uid IS NOT NULL THEN
      UPDATE public.profiles
         SET verifier_status = 'none', verification_tier = 'unverified', membership_tier = 'free',
             contribution_score = 0, verifier_since = NULL, linkedin_verified = false,
             linkedin_identity_verified = false, linkedin_workplace_verified = false,
             linkedin_verification_checked_at = NULL
       WHERE id = v_uid;
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

      FOR i IN 1 .. array_length(v_cols, 1) LOOP
        v_denied := false;
        v_msg := NULL;
        BEGIN
          EXECUTE format('UPDATE public.profiles SET %I = %s WHERE id = %L', v_cols[i], v_vals[i], v_uid);
        EXCEPTION WHEN insufficient_privilege THEN
          v_denied := true;
          v_msg := SQLERRM;
        END;
        IF NOT v_denied THEN
          RAISE EXCEPTION 'ABORT: with grants restored, the trigger let authenticated UPDATE profiles.% on its own row', v_cols[i];
        END IF;
        IF position('profiles_privilege_guard' IN v_msg) = 0 THEN
          RAISE EXCEPTION 'ABORT: layer 2 did not refuse profiles.% (got: %)', v_cols[i], v_msg;
        END IF;
      END LOOP;
      -- the 364 columns are still refused by the one shared function
      v_denied := false;
      v_msg := NULL;
      BEGIN
        UPDATE public.profiles SET is_platform_admin = NOT is_platform_admin WHERE id = v_uid;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
        v_msg := SQLERRM;
      END;
      IF NOT v_denied OR position('profiles_privilege_guard' IN v_msg) = 0 THEN
        RAISE EXCEPTION 'ABORT: the extended guard no longer refuses is_platform_admin (got: %)', v_msg;
      END IF;
      RESET ROLE;
    END IF;

    -- G2. Layer 2 on the INSERT path, every column (the BEFORE trigger fires before any key or foreign-key check).
    IF v_new IS NOT NULL THEN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_new::text, true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_new::text, 'role', 'authenticated')::text, true);
      FOR i IN 1 .. array_length(v_cols, 1) LOOP
        v_denied := false;
        v_msg := NULL;
        BEGIN
          EXECUTE format('INSERT INTO public.profiles (id, %I) VALUES (%L, %s)', v_cols[i], v_new, v_vals[i]);
        EXCEPTION WHEN insufficient_privilege THEN
          v_denied := true;
          v_msg := SQLERRM;
        END;
        IF NOT v_denied THEN
          RAISE EXCEPTION 'ABORT: with grants restored, the trigger let authenticated INSERT a row with profiles.% set', v_cols[i];
        END IF;
        IF position('profiles_privilege_guard' IN v_msg) = 0 THEN
          RAISE EXCEPTION 'ABORT: layer 2 did not refuse the INSERT of profiles.% (got: %)', v_cols[i], v_msg;
        END IF;
      END LOOP;
      RESET ROLE;
    END IF;

    IF v_uid IS NOT NULL THEN
      -- H. The RPC still works with the grants restored and the guard enabled (sanctioned by owner identity).
      UPDATE public.profiles SET verifier_status = 'none' WHERE id = v_uid;
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
      v_ret := public.request_verification();
      IF v_ret IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'ABORT: request_verification() was not sanctioned by the guard (returned %)', v_ret;
      END IF;
      RESET ROLE;

      -- I. The sanctioned path stays open: service_role can set all nine.
      SET LOCAL ROLE service_role;
      UPDATE public.profiles
         SET verifier_status = 'active', verification_tier = 'staff_verified',
             membership_tier = 'premium', contribution_score = 5,
             verifier_since = now(), linkedin_verified = true, linkedin_identity_verified = true,
             linkedin_workplace_verified = true, linkedin_verification_checked_at = now()
       WHERE id = v_uid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'ABORT: service_role could not UPDATE the status columns (rows=%)', v_rows;
      END IF;
      RESET ROLE;
      SELECT verifier_status || '/' || verification_tier || '/' || membership_tier || '/' || contribution_score::text
        INTO v_state FROM public.profiles WHERE id = v_uid;
      IF v_state IS DISTINCT FROM 'active/staff_verified/premium/5' THEN
        RAISE EXCEPTION 'ABORT: the service_role UPDATE did not persist (row reads %)', v_state;
      END IF;

      -- J. Not over-broad: the guard does not trip on an ordinary column.
      SET LOCAL ROLE authenticated;
      UPDATE public.profiles SET job_title = 'sec2-selfcheck' WHERE id = v_uid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      RESET ROLE;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'ABORT: authenticated could not UPDATE profiles.job_title on its own row (rows=%)', v_rows;
      END IF;
    END IF;

    RAISE EXCEPTION 'sec2_367_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'sec2_367_selfcheck_rollback' THEN RAISE; END IF;
  END;

  -- Privilege catalog after the rolled-back block: the temporary re-grants must be gone.
  FOREACH v_attack IN ARRAY v_cols LOOP
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
    IF NOT has_column_privilege('service_role', 'public.profiles', v_attack, 'UPDATE') THEN
      RAISE EXCEPTION 'ABORT: service_role lost UPDATE on profiles.%', v_attack;
    END IF;
  END LOOP;
  IF has_column_privilege('authenticated', 'public.profiles', 'is_platform_admin', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: authenticated holds UPDATE on profiles.is_platform_admin (the temporary re-grant leaked)';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'job_title', 'UPDATE') THEN
    RAISE EXCEPTION 'ABORT: authenticated lost UPDATE on profiles.job_title';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.request_verification()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: authenticated lacks EXECUTE on request_verification()';
  END IF;
  IF has_function_privilege('anon', 'public.request_verification()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: anon holds EXECUTE on request_verification()';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'profiles_privilege_guard_trg' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'ABORT: profiles_privilege_guard_trg is missing or disabled';
  END IF;

  RAISE NOTICE 'migration 367 OK: authenticated cannot write verifier_status, verification_tier, membership_tier, contribution_score, verifier_since or the linkedin_* verification fields on profiles (column privilege and the extended 364 trigger each refuse with 42501); request_verification() moves none or revoked to pending for the caller only; service_role writes still work';
END $$;

COMMIT;
