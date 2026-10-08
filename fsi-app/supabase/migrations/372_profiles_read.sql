-- subject: Migration 372 (lane SEC-5, 2026-10-08): who may read which profile columns, built to R8.7. The profiles SELECT policy "Public read" (USING true, role public, since migration 002) is dropped and replaced by one policy for authenticated: your own row, or the row of someone who shares an organisation with you; anon has no SELECT at all (table and column grants revoked). email leaves the authenticated column grant (table-level SELECT replaced by per-column SELECT without email), and two SECURITY DEFINER functions replace the reads that policy and grant now refuse: public.my_profile() returns the caller's own full row (email included), and public.community_identity(p_ids, p_query) returns cross-organisation Community identity (name, company, job title, region, avatar, verified, anonymous) with the per-USER half of R8.7 applied in SQL (default_anonymous withholds name, company and avatar, verified stays), never email or is_platform_admin. The self-check attacks every leg as anon, authenticated and service_role on rolled-back fixtures; NOT APPLIED.
-- 372 -- profiles read policy, column grants and the two identity functions (lane SEC-5, 2026-10-08).
--
-- NOT APPLIED. Authored by lane SEC-5; the coordinator's executor applies it. Two-track policy (CLAUDE.md standing rule
-- 3): schema DDL applies via the Supabase CLI BEFORE the dependent code merges. The code in this PR (Community routes,
-- community/page.tsx, CouncilMembersRail, the platform-admin pages) reads through community_identity and my_profile and
-- through the service client, so it is NOT safe to run against a database that lacks this migration: apply 372 first.
--
-- THE FINDING [CONFIRMED by catalog read, privilege census 2026-10-08, and by migrations 002 and 165]. profiles has had
-- one SELECT policy since migration 002, "Public read" USING (true) TO public, so every signed-in user read every row of
-- every organisation, and the column grant of authenticated included email and is_platform_admin (migration 165 removed
-- only anon's table-wide SELECT and gave anon a 34-column re-grant, leaving anon able to read the other 34 columns of
-- every row). SEC-3b stopped on this (docs/ops/session-log.d/2026-10-08-sec3b-table-policies.md) because the Community
-- reads need columns beyond any same-organisation subset, and because the brief cited spec 05's pseudonymous subset.
-- Spec 07 Amendment 2026-09-25 (R8.7) GOVERNS: name, company, role and verification badge are visible in a room by
-- default; anonymity is opt-in per post (community_posts.anonymous, migration 336) or per user
-- (community_member_profiles.default_anonymous, 336); an anonymous post keeps the verified marker.
--
-- WHAT THIS MIGRATION DOES.
--   1. Policy. DROP "Public read". CREATE profiles_select_own_or_shared_org FOR SELECT TO authenticated: the row is the
--      caller's own (id = auth.uid()), or the row's user has an org_memberships row in an organisation the caller
--      belongs to (user_belongs_to_org, migration 006, SECURITY DEFINER, so the org_memberships policies cannot recurse
--      into profiles). No SELECT policy for anon. The self INSERT and UPDATE policies of migration 165 are untouched.
--   2. Column privileges. REVOKE SELECT on the table and on every column FROM anon and PUBLIC (this removes the 34-column
--      grant of migration 165). REVOKE table-level SELECT FROM authenticated and GRANT SELECT back on every column EXCEPT
--      email, the column list read from pg_attribute at apply time (the 364 idiom: a column revoke under a table-level
--      grant is a no-op, so the table-level grant is replaced). service_role is untouched. A column added to profiles
--      later is NOT readable by authenticated until the adding migration grants it: it fails closed, visibly.
--   3. public.my_profile(): the caller's own full row (auth.uid()), email and is_platform_admin included. SECURITY
--      DEFINER, search_path pinned, EXECUTE to authenticated and service_role only.
--   4. public.community_identity(p_ids uuid[], p_query text default null): see the function comment. SECURITY DEFINER,
--      search_path pinned, EXECUTE to authenticated and service_role only. The Community routes all require a signed-in
--      user (requireCommunityRoute -> requireCommunityAuth answers 401 without a session; read 2026-10-08), so anon is
--      not granted EXECUTE: no Community route serves anon.
--
-- DEVIATION FROM THE BRIEF, STATED (item 2 said REVOKE SELECT (email, is_platform_admin)). is_platform_admin is NOT
-- revoked here. [CONFIRMED by reading the migrations] RLS policies on other tables evaluate
-- `EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)` (or the same with
-- the flag in an OR arm) AS THE QUERYING USER; they are created in migrations 082, 099, 153, 166, 182, 195, 249, 277, 342,
-- 355 and 356 (the live set, after later drops and repoints, is a census item for the follow-up). Postgres checks a policy expression's table and column privileges
-- against the caller, so revoking SELECT (is_platform_admin) from authenticated would make every query on those tables
-- raise 42501 for every signed-in user, platform admins included. Closing that needs those policies repointed at a
-- SECURITY DEFINER helper, which is another table's policies and is outside this lane's write set (the brief:
-- "NOT yours: any other table's policies"). What remains exposed after this migration is the flag on the caller's own
-- row and on the rows of same-organisation members, not the cross-organisation read and not anon. The exact staged
-- follow-up is in docs/ops/session-log.d/2026-10-08-sec5-profiles-read.md (helper + the policy list + the revoke).
--
-- CONSUMERS [CONFIRMED by grep of fsi-app/src]. Every user-session read of another user's profile or of email is listed
-- with its before and after in the session log; in short: the Community posts, replies, post, search, group members,
-- group invitations and invite-candidates routes, CouncilMembersRail and community/page.tsx read through
-- community_identity (and my_profile for the caller's own email); community/directory/page.tsx, admin/page.tsx and the
-- AdminDashboard refresh (through /api/admin/users) read through the service client under the platform-admin gate.
-- Unchanged: reads through the service client (workspace members, org members, archive-impact, linkedin callback), own-row
-- reads that do not select email (UserProfilePage, OnboardingWizard, server-bootstrap, platform-admin-gate, admin.ts,
-- shell-context, signoff decide), and writes (the 364 and 367 column grants and guard are untouched).
--
-- SELF-CHECK (one DO block, sentinel rollback, no data changed). Fixtures are rolled back: three auth.users + profiles
-- (u1 and u2 in organisation A, u3 in organisation B), two organisations with memberships, and community_member_profiles
-- rows (u2 default_anonymous and verified; u1 not verified). ASSUMPTION, stated: an auth.users row with only
-- (id, aud, role, email, created_at, updated_at) can be inserted (the PROOF-4 fixtures do the same); if it cannot, the role
-- legs are skipped with a NOTICE and the catalog assertions still run. Legs: anon SELECT on profiles raises 42501;
-- authenticated u1 reading u3's row (other organisation) returns 0 rows, u2's (same organisation) 1 row, its own 1 row;
-- u1 selecting email from its own row, and SELECT *, raise 42501; my_profile() as u1 returns 1 row carrying u1's email;
-- my_profile() as anon raises 42501; community_identity as u1: for u2 (default_anonymous) display_name and company_name are
-- NULL, anonymous true, verified true; for u3 the name and company are returned, anonymous false; a name query finds
-- u1 and u3 and NOT u2, a second-token (surname) query finds u3, a mid-token fragment finds nothing; a one-character query, a wildcard query and a NULL/NULL call return nothing; community_identity as
-- anon raises 42501; the function's result columns carry no email and no is_platform_admin; u1 can still update its own
-- job_title (the revoke is not over-broad); service_role still reads email. Then the privilege and policy catalog.
--
-- Reversible: DROP FUNCTION public.community_identity(uuid[], text); DROP FUNCTION public.my_profile();
-- DROP POLICY profiles_select_own_or_shared_org ON public.profiles; GRANT SELECT ON public.profiles TO authenticated;
-- GRANT SELECT (<the 34 columns of migration 165>) ON public.profiles TO anon; CREATE POLICY "Public read" ON
-- public.profiles FOR SELECT USING (true) (do not: it re-opens the cross-organisation read).

BEGIN;

-- ---- Preconditions ------------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_col text;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.profiles does not exist';
  END IF;
  IF to_regclass('public.org_memberships') IS NULL OR to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.org_memberships or public.organizations does not exist';
  END IF;
  IF to_regclass('public.community_member_profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.community_member_profiles does not exist (migration 293)';
  END IF;
  IF to_regprocedure('public.user_belongs_to_org(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.user_belongs_to_org(uuid) does not exist (migration 006)';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['email', 'full_name', 'display_name', 'avatar_url', 'job_title', 'region', 'org_id', 'is_platform_admin'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = 'public.profiles'::regclass AND attname = v_col AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'ABORT: public.profiles has no column %', v_col;
    END IF;
  END LOOP;
  FOREACH v_col IN ARRAY ARRAY['default_anonymous', 'verified', 'region'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = 'public.community_member_profiles'::regclass AND attname = v_col AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'ABORT: public.community_member_profiles has no column % (migrations 293 and 336)', v_col;
    END IF;
  END LOOP;
END $$;

-- ---- 1. Policy ---------------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read" ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own_or_shared_org ON public.profiles;
CREATE POLICY profiles_select_own_or_shared_org
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.org_memberships m
       WHERE m.user_id = profiles.id
         AND public.user_belongs_to_org(m.org_id)
    )
  );

-- ---- 2. Column privileges ----------------------------------------------------------------------------------------
-- anon: no read of any kind. The table-level revoke removes any table grant; the column loop removes the 34-column
-- grant migration 165 gave anon (a table-level REVOKE does not remove column-level grants).
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon;
DO $$
DECLARE
  v_col name;
BEGIN
  FOR v_col IN
    SELECT attname FROM pg_attribute
     WHERE attrelid = 'public.profiles'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    EXECUTE format('REVOKE SELECT (%I) ON public.profiles FROM PUBLIC, anon', v_col);
  END LOOP;
END $$;

-- authenticated: every column except email.
REVOKE SELECT ON TABLE public.profiles FROM authenticated;
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
     AND attname <> 'email';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', v_cols);
END $$;

-- ---- 3. my_profile() ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p.* FROM public.profiles p WHERE p.id = auth.uid()
$fn$;

COMMENT ON FUNCTION public.my_profile() IS
  'SEC-5 (migration 372). The caller''s own full profiles row (auth.uid()), email and is_platform_admin included: the only own-row path to email now that email is outside the authenticated column grant. SECURITY DEFINER, search_path pinned, EXECUTE to authenticated and service_role only. No parameter, so it cannot name another user.';

REVOKE ALL ON FUNCTION public.my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile() TO authenticated, service_role;

-- ---- 4. community_identity() -------------------------------------------------------------------------------------
-- Cross-organisation Community identity under R8.7. One row per profile found:
--   user_id       the profile id
--   display_name  full_name, else display_name; NULL when the member is default-anonymous
--   company_name  the active organisation (profiles.org_id), else the earliest membership's organisation; NULL when
--                 default-anonymous
--   job_title     profiles.job_title (role is not withheld by anonymity, R8.7: only name and company are)
--   region        community_member_profiles.region, else profiles.region
--   avatar_url    NULL when default-anonymous (a photograph identifies a member as much as a name does; this column is
--                 an addition to the brief's list, because the posts feed and replies render the headshot today)
--   verified      community_member_profiles.verified (false when the member has no row); NEVER withheld
--   anonymous     community_member_profiles.default_anonymous (false when the member has no row)
-- Modes: p_ids (up to 200 ids, a larger array is sliced) returns those members, anonymous ones with NULL name; p_query
-- (at least two characters, wildcards escaped) returns at most 25 members whose shown name has a whitespace-separated token
-- that STARTS with it (so "Surname" finds "Jane Surname"; a fragment from the middle of a token does not match) and
-- never a default-anonymous member (their name is withheld, so they are not findable by it); with both, the query
-- filters the ids. Neither returns nothing. The per-POST half of R8.7 (community_posts.anonymous) is applied by the
-- routes at the row, once (src/lib/community/identity.mjs authorBlockForPost). Never returns email or is_platform_admin.
CREATE OR REPLACE FUNCTION public.community_identity(p_ids uuid[], p_query text DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  company_name text,
  job_title text,
  region text,
  avatar_url text,
  verified boolean,
  anonymous boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH q AS (
    SELECT nullif(btrim(p_query), '') AS term,
           replace(replace(replace(nullif(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') AS esc
  ),
  base AS (
    SELECT p.id AS id,
           nullif(btrim(coalesce(nullif(btrim(p.full_name), ''), p.display_name)), '') AS nm,
           regexp_replace(coalesce(nullif(btrim(p.full_name), ''), p.display_name, ''), '\s+', ' ', 'g') AS nn,
           coalesce(
             (SELECT o.name FROM public.organizations o WHERE o.id = p.org_id),
             (SELECT o2.name
                FROM public.org_memberships m
                JOIN public.organizations o2 ON o2.id = m.org_id
               WHERE m.user_id = p.id
               ORDER BY m.created_at, m.id
               LIMIT 1)
           ) AS co,
           p.job_title AS jt,
           coalesce(c.region, p.region) AS rg,
           p.avatar_url AS av,
           coalesce(c.verified, false) AS vf,
           coalesce(c.default_anonymous, false) AS anon
      FROM public.profiles p
      LEFT JOIN public.community_member_profiles c ON c.user_id = p.id
     WHERE auth.uid() IS NOT NULL
  )
  SELECT b.id,
         (CASE WHEN b.anon THEN NULL ELSE b.nm END)::text,
         (CASE WHEN b.anon THEN NULL ELSE b.co END)::text,
         b.jt::text,
         b.rg::text,
         (CASE WHEN b.anon THEN NULL ELSE b.av END)::text,
         b.vf,
         b.anon
    FROM base b
    CROSS JOIN q
   WHERE (q.term IS NULL AND p_ids IS NOT NULL AND b.id = ANY ((p_ids)[1:200]))
      OR (q.term IS NOT NULL
          AND length(q.term) >= 2
          AND NOT b.anon
          AND (b.nn ILIKE (q.esc || '%')
               OR b.nn ILIKE ('% ' || q.esc || '%'))
          AND (p_ids IS NULL OR b.id = ANY ((p_ids)[1:200])))
   ORDER BY (CASE WHEN b.anon THEN NULL ELSE b.nm END) NULLS LAST, b.id
   LIMIT (CASE WHEN nullif(btrim(p_query), '') IS NULL THEN 200 ELSE 25 END)
$fn$;

COMMENT ON FUNCTION public.community_identity(uuid[], text) IS
  'SEC-5 (migration 372). Cross-organisation Community identity under spec 07 R8.7: name, company, job title, region, avatar, verified, anonymous. The per-user half of R8.7 is applied here (default_anonymous withholds display_name, company_name and avatar_url, verified stays); the per-post half is applied by the routes. p_ids: up to 200 ids. p_query: matches the start of any whitespace-separated token of the shown name, at least two characters, wildcards escaped, at most 25 rows, never matches a default-anonymous member. Never returns email or is_platform_admin. SECURITY DEFINER, search_path pinned, EXECUTE to authenticated and service_role only.';

REVOKE ALL ON FUNCTION public.community_identity(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_identity(uuid[], text) TO authenticated, service_role;

-- ---- Self-check: attack every leg, rolled back -------------------------------------------------------------------
DO $$
DECLARE
  v_u1 uuid := gen_random_uuid();
  v_u2 uuid := gen_random_uuid();
  v_u3 uuid := gen_random_uuid();
  v_oa uuid := gen_random_uuid();
  v_ob uuid := gen_random_uuid();
  v_e1 text := 'sec5-u1-' || replace(gen_random_uuid()::text, '-', '') || '@selfcheck.invalid';
  v_ready boolean := true;
  v_denied boolean;
  v_msg text;
  v_n integer;
  v_text text;
  v_flag boolean;
  v_flag2 boolean;
  v_n2 integer;
  v_n3 integer;
  v_col text;
BEGIN
  BEGIN
    -- Fixtures (owner role). If auth.users cannot take a minimal row, the role legs are skipped.
    BEGIN
      INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
        (v_u1, 'authenticated', 'authenticated', v_e1, now(), now()),
        (v_u2, 'authenticated', 'authenticated', 'sec5-u2-' || replace(v_u2::text, '-', '') || '@selfcheck.invalid', now(), now()),
        (v_u3, 'authenticated', 'authenticated', 'sec5-u3-' || replace(v_u3::text, '-', '') || '@selfcheck.invalid', now(), now());
    EXCEPTION WHEN OTHERS THEN
      v_ready := false;
      RAISE NOTICE 'migration 372 self-check: could not insert fixture auth.users rows (%), role legs skipped, catalog assertions still run', SQLERRM;
    END;

    IF v_ready THEN
      INSERT INTO public.profiles (id, email, display_name, full_name, job_title) VALUES
        (v_u1, v_e1, 'Sec5 One', 'Sec5 One', 'Ops lead'),
        (v_u2, 'sec5-u2-' || replace(v_u2::text, '-', '') || '@selfcheck.invalid', 'Sec5 Two', 'Sec5 Two', 'Analyst'),
        (v_u3, 'sec5-u3-' || replace(v_u3::text, '-', '') || '@selfcheck.invalid', 'Sec5 Three', 'Sec5 Three', 'Buyer');
      INSERT INTO public.organizations (id, name, slug) VALUES
        (v_oa, 'Sec5 Org A', 'sec5-a-' || replace(v_oa::text, '-', '')),
        (v_ob, 'Sec5 Org B', 'sec5-b-' || replace(v_ob::text, '-', ''));
      INSERT INTO public.org_memberships (org_id, user_id, role) VALUES
        (v_oa, v_u1, 'member'), (v_oa, v_u2, 'member'), (v_ob, v_u3, 'member');
      INSERT INTO public.community_member_profiles (user_id, org_type, verified, verified_at, verification_method, organisation_key, default_anonymous) VALUES
        (v_u1, 'other', false, NULL, NULL, NULL, false),
        (v_u2, 'forwarder', true, now(), 'write-in', 'sec5-selfcheck', true);

      -- A. anon cannot SELECT profiles at all.
      SET LOCAL ROLE anon;
      v_denied := false; v_msg := NULL;
      BEGIN
        PERFORM id FROM public.profiles LIMIT 1;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true; v_msg := SQLERRM;
      END;
      IF NOT v_denied THEN RAISE EXCEPTION 'ABORT: anon could SELECT id from public.profiles'; END IF;
      v_denied := false;
      BEGIN
        PERFORM display_name FROM public.profiles LIMIT 1;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
      END;
      IF NOT v_denied THEN RAISE EXCEPTION 'ABORT: anon could SELECT display_name from public.profiles (the migration 165 column grant survived)'; END IF;
      RESET ROLE;

      -- B. authenticated u1: policy legs and column legs.
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_u1::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);

      SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_u3;
      IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: authenticated read another organisation''s profiles row directly (% rows)', v_n; END IF;
      SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_u2;
      IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: a same-organisation profiles row is not readable (% rows, expected 1)', v_n; END IF;
      SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_u1;
      IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: the caller''s own profiles row is not readable (% rows, expected 1)', v_n; END IF;

      v_denied := false; v_msg := NULL;
      BEGIN
        PERFORM email FROM public.profiles WHERE id = v_u1;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true; v_msg := SQLERRM;
      END;
      IF NOT v_denied THEN RAISE EXCEPTION 'ABORT: authenticated could SELECT email from its own profiles row'; END IF;
      v_denied := false;
      BEGIN
        PERFORM * FROM public.profiles WHERE id = v_u1;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
      END;
      IF NOT v_denied THEN RAISE EXCEPTION 'ABORT: authenticated could SELECT * from profiles (email is in the grant)'; END IF;

      -- C. my_profile(): the own row, email included.
      SELECT count(*), max(email) INTO v_n, v_text FROM public.my_profile();
      IF v_n <> 1 OR v_text IS DISTINCT FROM v_e1 THEN RAISE EXCEPTION 'ABORT: my_profile() did not return exactly the caller''s own row with its email (rows=%)', v_n; END IF;

      -- D. community_identity: u2 is default-anonymous, u3 is not.
      SELECT count(*), bool_and(display_name IS NULL AND company_name IS NULL AND avatar_url IS NULL), bool_and(anonymous), bool_and(verified)
        INTO v_n, v_flag, v_flag2, v_denied
        FROM public.community_identity(ARRAY[v_u2], NULL);
      IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: community_identity did not return the default-anonymous member by id (% rows)', v_n; END IF;
      IF NOT v_flag THEN RAISE EXCEPTION 'ABORT: community_identity returned a name, company or avatar for a default-anonymous member'; END IF;
      IF NOT v_flag2 OR NOT v_denied THEN RAISE EXCEPTION 'ABORT: community_identity must return anonymous = true and keep verified = true for the default-anonymous member'; END IF;

      SELECT display_name, company_name, anonymous, verified
        INTO v_text, v_msg, v_flag, v_flag2
        FROM public.community_identity(ARRAY[v_u3], NULL);
      IF v_text IS DISTINCT FROM 'Sec5 Three' OR v_msg IS DISTINCT FROM 'Sec5 Org B' OR v_flag OR v_flag2 THEN
        RAISE EXCEPTION 'ABORT: community_identity did not return the other-organisation member''s name and company with anonymous = false';
      END IF;

      SELECT count(*) INTO v_n FROM public.community_identity(ARRAY[v_u1, v_u2, v_u3], NULL);
      IF v_n <> 3 THEN RAISE EXCEPTION 'ABORT: community_identity by three ids returned % rows', v_n; END IF;

      SELECT count(*) FILTER (WHERE user_id = v_u1), count(*) FILTER (WHERE user_id = v_u2), count(*) FILTER (WHERE user_id = v_u3)
        INTO v_n, v_n2, v_n3
        FROM (SELECT user_id FROM public.community_identity(NULL, 'Sec5')) s;
      IF v_n <> 1 OR v_n2 <> 0 OR v_n3 <> 1 THEN
        RAISE EXCEPTION 'ABORT: a name query must find u1 and u3 and must not find the default-anonymous u2';
      END IF;
      SELECT count(*) INTO v_n FROM public.community_identity(NULL, 'Three') WHERE user_id = v_u3;
      SELECT count(*) INTO v_n2 FROM public.community_identity(NULL, 'Two') WHERE user_id = v_u2;
      IF v_n <> 1 OR v_n2 <> 0 THEN
        RAISE EXCEPTION 'ABORT: a surname (second token) query must find u3 and must not find the default-anonymous u2';
      END IF;
      SELECT count(*) INTO v_n FROM public.community_identity(NULL, 'hree') WHERE user_id = v_u3;
      IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: a mid-token fragment must not match (% rows)', v_n; END IF;
      SELECT count(*) INTO v_n FROM public.community_identity(NULL, 'S');
      IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: a one-character query returned % rows', v_n; END IF;
      SELECT count(*) INTO v_n FROM public.community_identity(NULL, '%%');
      IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: a wildcard query matched % rows (wildcards are not escaped)', v_n; END IF;
      SELECT count(*) INTO v_n FROM public.community_identity(NULL, NULL);
      IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: community_identity(NULL, NULL) returned % rows', v_n; END IF;

      -- E. not over-broad: an ordinary own-row write still works.
      UPDATE public.profiles SET job_title = 'sec5-selfcheck' WHERE id = v_u1;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: authenticated could not update its own job_title (rows=%)', v_n; END IF;
      RESET ROLE;

      -- F. anon cannot execute either function.
      SET LOCAL ROLE anon;
      v_denied := false;
      BEGIN
        PERFORM public.my_profile();
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
      END;
      IF NOT v_denied THEN RAISE EXCEPTION 'ABORT: anon could execute my_profile()'; END IF;
      v_denied := false;
      BEGIN
        PERFORM public.community_identity(ARRAY[v_u3], NULL);
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
      END;
      IF NOT v_denied THEN RAISE EXCEPTION 'ABORT: anon could execute community_identity()'; END IF;
      RESET ROLE;

      -- G. The sanctioned path stays open: service_role reads email.
      SET LOCAL ROLE service_role;
      SELECT email INTO v_text FROM public.profiles WHERE id = v_u1;
      IF v_text IS DISTINCT FROM v_e1 THEN RAISE EXCEPTION 'ABORT: service_role could not read email'; END IF;
      RESET ROLE;
    END IF;

    RAISE EXCEPTION 'sec5_372_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'sec5_372_selfcheck_rollback' THEN RAISE; END IF;
  END;

  -- Catalog assertions, after the rolled-back sub-transaction.
  IF has_table_privilege('anon', 'public.profiles', 'SELECT') OR has_any_column_privilege('anon', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: anon still holds a SELECT privilege on public.profiles';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: authenticated still holds the table-level SELECT on public.profiles';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: authenticated can still SELECT profiles.email';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['id', 'display_name', 'full_name', 'avatar_url', 'job_title', 'org_id'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.profiles', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'ABORT: authenticated lost SELECT on profiles.%', v_col;
    END IF;
  END LOOP;
  -- Kept on purpose (see the DEVIATION paragraph): policies on other tables read it as the caller.
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'is_platform_admin', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: authenticated lost SELECT on profiles.is_platform_admin, which RLS policies on other tables evaluate as the caller; repoint those policies first';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: service_role lost SELECT on public.profiles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Public read') THEN
    RAISE EXCEPTION 'ABORT: the "Public read" policy is still on public.profiles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_own_or_shared_org' AND cmd = 'SELECT' AND roles = '{authenticated}') THEN
    RAISE EXCEPTION 'ABORT: profiles_select_own_or_shared_org is missing or not TO authenticated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd IN ('SELECT', 'ALL')
       AND ('public' = ANY (roles) OR 'anon' = ANY (roles))
  ) THEN
    RAISE EXCEPTION 'ABORT: a SELECT policy for public or anon remains on public.profiles';
  END IF;
  IF has_function_privilege('anon', 'public.my_profile()', 'EXECUTE') OR has_function_privilege('anon', 'public.community_identity(uuid[], text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: anon can execute my_profile() or community_identity()';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.my_profile()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.community_identity(uuid[], text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: authenticated cannot execute my_profile() or community_identity()';
  END IF;
  IF (SELECT count(*) FROM pg_proc
       WHERE oid IN ('public.my_profile()'::regprocedure, 'public.community_identity(uuid[], text)'::regprocedure)
         AND prosecdef AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search_path=%')) <> 2 THEN
    RAISE EXCEPTION 'ABORT: my_profile() and community_identity() must both be SECURITY DEFINER with a pinned search_path';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, unnest(p.proargnames) n
     WHERE p.oid = 'public.community_identity(uuid[], text)'::regprocedure AND n IN ('email', 'is_platform_admin')
  ) THEN
    RAISE EXCEPTION 'ABORT: community_identity() exposes email or is_platform_admin';
  END IF;

  RAISE NOTICE 'migration 372 OK: profiles is readable by authenticated for own and shared-organisation rows without email, not by anon; my_profile() and community_identity() are the definer paths; every leg refused or allowed as designed';
END $$;

COMMIT;
