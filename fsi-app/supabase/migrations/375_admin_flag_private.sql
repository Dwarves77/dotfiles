-- subject: Migration 375 (lane SEC-6, 2026-10-08): profiles.is_platform_admin becomes readable by nobody but the system and, through two definer functions, its owner. A SECURITY DEFINER predicate public.is_platform_admin() (the caller's own row, false when there is none) replaces the column read in the 22 RLS policies that evaluated it as the querying user, each repointed with its own ALTER POLICY and its meaning unchanged; then SELECT on the column is revoked from PUBLIC, anon and authenticated (my_profile(), migration 372, still returns it for the caller's own row). The rolled-back self-check attacks the column read and the predicate as user, admin, anon and service_role and exercises one policy per source migration (082, 099, 153, 166, 182, 195, 249, 277, 342, 355, 356) as admin and as non-admin; a catalog pass fails the apply if any policy in public still names the column; APPLIED (production ledger version 20261008131209, as of 2026-10-08).
-- 375 -- the platform-admin flag is private (lane SEC-6, 2026-10-08).
--
-- APPLIED (production ledger version 20261008131209, as of 2026-10-08). Authored by lane SEC-6; the coordinator's executor applies it after migrations 370, 371 and 372 (372
-- created my_profile() and the profiles read policy this file relies on; 371 is the definer-hygiene pass this function
-- follows), under the two-track policy (CLAUDE.md standing rule 3: schema DDL applies via the Supabase CLI BEFORE the
-- dependent code merges). The code in this PR reads the flag through the rpc public.is_platform_admin(); it is NOT safe
-- to run against a database that lacks this migration.
--
-- THE FINDING [CONFIRMED by reading migration 372 and the migration tree]. After migration 372 the flag was still in the
-- authenticated column grant on public.profiles, because RLS policies on other tables read it AS THE QUERYING USER
-- (`EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)`), and PostgreSQL
-- checks the column privilege of a policy expression against the caller: revoking the column first would have made every
-- query on those tables raise 42501 for every signed-in user, platform admins included. What stayed exposed was the
-- flag on the caller's own row and on the rows of same-organisation members. 372's session log staged this follow-up.
--
-- WHAT THIS MIGRATION DOES.
--   1. public.is_platform_admin() RETURNS boolean: the caller's own row's flag (auth.uid()), false when there is no row or
--      no caller. SECURITY DEFINER, STABLE, search_path = public, pg_temp, REVOKE ALL FROM PUBLIC, EXECUTE to anon,
--      authenticated and service_role (class C of migration 371: an RLS predicate, granted explicitly to every role the
--      policies it sits in apply to; see ANON AND THE PREDICATE below). No parameter, so it cannot name another user: it
--      answers "am I an admin" and nothing else, and says false when auth.uid() is null, so granting anon leaks nothing.
--      It reads the column as its owner, so the column revoke below does not reach it.
--   2. The census. A parse of every CREATE POLICY, DROP POLICY, DROP TABLE and ALTER POLICY in the migration tree, in file
--      order, leaves exactly 22 live policies whose USING or WITH CHECK reads profiles.is_platform_admin (the test file
--      repeats that parse and fails if the tree and the list below ever disagree). One ALTER POLICY each, below, in
--      source-migration order:
--        082  ingest_rejections_read_platform_admin, ingest_rejections_update_platform_admin (ingest_rejections),
--             pjr_read_platform_admin, pjr_update_platform_admin (pending_jurisdiction_review)
--        099  source_tier_opinions_select_platform_admin, source_tier_opinions_update_platform_admin (source_tier_opinions)
--        153  signoff_select, signoff_decide (community_post_signoff_requests; the verifier_status arm is kept as an own-row
--             read of a column that stays granted)
--        166  provisional_sources_admin_read (provisional_sources; the service_role arm is kept)
--        182  moderation_reports_select, moderation_reports_update_admin (moderation_reports; the reporter, post-moderator
--             and group-moderator arms are kept verbatim)
--        195  error_events_admin_read (error_events, TO authenticated kept by ALTER POLICY)
--        249  integrity_flags_admin_read, integrity_flags_admin_update (integrity_flags), holdings_quality_admin_read
--        277  corpus_turn_requests_admin_read (corpus_turn_requests, TO authenticated kept)
--        342  canonical_source_candidates_admin_read, canonical_source_candidates_admin_write (FOR ALL)
--        355  vocabulary_terms_admin_read, vocabulary_mentions_admin_read
--        356  item_corrections_admin_read, item_correction_evidence_admin_read (TO authenticated kept)
--      NOT in the list: post_promotions_select (migrations 041 and 182): the table was dropped by migration 348, so it has no
--      live policy. The 027 policies on user_profiles, the 032 and 041 originals of the 182 policies, and the 043 and 048
--      originals of the 249 and 342 policies were each superseded by DROP POLICY and CREATE POLICY in a later file.
--      ALTER POLICY keeps the policy's command and roles; USING and WITH CHECK are restated wherever the old policy had a
--      flag in them (five policies carry a WITH CHECK that read the flag: both 082 update policies, the 099 update policy,
--      integrity_flags_admin_update and canonical_source_candidates_admin_write); a policy whose WITH CHECK never read the
--      flag (moderation_reports_update_admin) keeps its WITH CHECK untouched.
--      Form: the predicate is written `(SELECT public.is_platform_admin())`, which PostgreSQL plans as an InitPlan evaluated
--      once per statement instead of once per row, the same cost the old uncorrelated EXISTS subquery had.
--   3. REVOKE SELECT (is_platform_admin) ON public.profiles FROM PUBLIC, anon, authenticated. Migration 372 already replaced
--      the table-level SELECT of authenticated with a column grant, so a column revoke bites (a column revoke under a
--      table-level grant is a no-op; the precondition fails the apply if a table-level SELECT has come back, and the
--      self-check proves the column is refused). service_role keeps its grant. Nothing else about the grant changes: id,
--      verifier_status (read by signoff_select and signoff_decide) and every other column stay readable as before.
--
-- CONSUMERS [CONFIRMED by git grep over fsi-app/src and fsi-app/scripts]. The own-row readers move to the rpc
-- public.is_platform_admin(): lib/auth/platform-admin-gate.ts (decidePlatformAdmin, the /admin gate),
-- lib/api/server-bootstrap.ts (the identity route's nav bit), lib/community/shell-context.ts and
-- api/community/signoff/[id]/decide/route.ts. lib/auth/admin.ts isPlatformAdmin(userId, client), the workspace bootstrap
-- logic and supabase-server.ts isPlatformAdminInline read the column of an arbitrary user through the SERVICE client,
-- which keeps its grant, and are unchanged. The existing PROOF-4 attack admin-gate-self-promotion-refused reads the
-- column without a role (the connection role) and attempts UPDATE and INSERT writes, none of which needs SELECT on the
-- column; it is unchanged.
--
-- ANON AND THE PREDICATE [coordinator correction, 2026-10-08; mechanism INFERRED from migration 371's class-C note, not
-- executed here]. PostgreSQL checks EXECUTE on a function used inside a policy as the role running the query, and policies
-- are OR'd: a table that also carries a public-read policy would raise 42501 for anon instead of evaluating that other
-- policy to true if the predicate were closed to anon. So the predicate is class C (371: RLS predicates get anon,
-- authenticated and service_role granted explicitly, REVOKE FROM PUBLIC kept), and it returns false when auth.uid() is
-- null, so the grant leaks nothing. [CONFIRMED by a parse of the tree, repeated by the test file] no table among the 22
-- policies' tables carries a live policy that lets anon read it today (the reconciler policies on integrity_flags are TO
-- reconciler, the rest are service_role or caller-keyed), so the anon leg of the self-check is the predicate call
-- (false, no raise); the test fails if one of those tables gains a public-read policy without a row-read leg here.
--
-- SELF-CHECK (one DO block, sentinel rollback, no data changed). Fixtures: two auth.users and profiles rows (a non-admin and
-- an admin, the admin inserted by the sanctioned apply role through the 364 guard). ASSUMPTION, stated and the same as
-- 372: a minimal auth.users row can be inserted; if not, the role legs are skipped with a NOTICE and the catalog pass still
-- runs. Legs: authenticated non-admin SELECT of the column raises 42501, of id, display_name and verifier_status works,
-- is_platform_admin() is false, my_profile() carries false; authenticated admin SELECT of the column on its OWN row raises
-- 42501, is_platform_admin() is true, my_profile() carries true; anon is_platform_admin() returns false and does not raise; service_role with
-- no caller gets false from the predicate and still reads the column; then for each of the eleven source migrations one
-- policy's table is counted as the owner, as the admin (no error, same count) and as the non-admin (0 rows, or 42501
-- where the role holds no table grant), never 42P17 and never any other error. Then the catalog pass: no policy in public
-- names the flag as a column, all 22 name the predicate (and the five with a WITH CHECK name it there too), the privilege
-- and function shape.
--
-- Reversible: GRANT SELECT (is_platform_admin) ON public.profiles TO authenticated; ALTER POLICY each of the 22 back to the
-- EXISTS form of its source migration; DROP FUNCTION public.is_platform_admin(). Do not: it re-opens the flag.

BEGIN;

-- ---- Preconditions ------------------------------------------------------------------------------------------------
CREATE TEMP TABLE _sec6_policy_list (tbl text NOT NULL, pol text NOT NULL, has_check boolean NOT NULL) ON COMMIT DROP;
INSERT INTO _sec6_policy_list (tbl, pol, has_check) VALUES
  ('ingest_rejections', 'ingest_rejections_read_platform_admin', false),
  ('ingest_rejections', 'ingest_rejections_update_platform_admin', true),
  ('pending_jurisdiction_review', 'pjr_read_platform_admin', false),
  ('pending_jurisdiction_review', 'pjr_update_platform_admin', true),
  ('source_tier_opinions', 'source_tier_opinions_select_platform_admin', false),
  ('source_tier_opinions', 'source_tier_opinions_update_platform_admin', true),
  ('community_post_signoff_requests', 'signoff_select', false),
  ('community_post_signoff_requests', 'signoff_decide', false),
  ('provisional_sources', 'provisional_sources_admin_read', false),
  ('moderation_reports', 'moderation_reports_select', false),
  ('moderation_reports', 'moderation_reports_update_admin', false),
  ('error_events', 'error_events_admin_read', false),
  ('integrity_flags', 'integrity_flags_admin_read', false),
  ('integrity_flags', 'integrity_flags_admin_update', true),
  ('holdings_quality', 'holdings_quality_admin_read', false),
  ('corpus_turn_requests', 'corpus_turn_requests_admin_read', false),
  ('canonical_source_candidates', 'canonical_source_candidates_admin_read', false),
  ('canonical_source_candidates', 'canonical_source_candidates_admin_write', true),
  ('vocabulary_terms', 'vocabulary_terms_admin_read', false),
  ('vocabulary_mentions', 'vocabulary_mentions_admin_read', false),
  ('item_corrections', 'item_corrections_admin_read', false),
  ('item_correction_evidence', 'item_correction_evidence_admin_read', false);

DO $$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.profiles does not exist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.profiles'::regclass AND attname = 'is_platform_admin' AND attnum > 0 AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'ABORT: public.profiles has no column is_platform_admin';
  END IF;
  IF to_regprocedure('public.my_profile()') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.my_profile() does not exist (migration 372 must be applied first)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_own_or_shared_org') THEN
    RAISE EXCEPTION 'ABORT: policy profiles_select_own_or_shared_org is missing on public.profiles (migration 372 must be applied first)';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: authenticated holds the table-level SELECT on public.profiles, so a column revoke would be a no-op (migration 372 replaced it with a column grant; something has restored it)';
  END IF;
  SELECT string_agg(l.tbl || '.' || l.pol, ', ' ORDER BY l.tbl, l.pol) INTO v_missing
    FROM _sec6_policy_list l
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = l.tbl AND p.policyname = l.pol
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: these policies do not exist in public, so their migrations are not applied yet: %', v_missing;
  END IF;
END $$;

-- ---- 1. The predicate ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT coalesce((SELECT p.is_platform_admin FROM public.profiles p WHERE p.id = auth.uid()), false)
$fn$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'SEC-6 (migration 375). True when the caller (auth.uid()) has a profiles row with is_platform_admin = true, false when the flag is false, the row is missing or there is no caller. SECURITY DEFINER so it reads the column its owner can read after SELECT (is_platform_admin) was revoked from authenticated; no parameter, so it cannot ask about anyone else. Used by the 22 admin RLS policies and by the own-row readers in the app (platform-admin gate, identity bootstrap, Community shell, signoff decide).';

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated, service_role;

-- ---- 2. The 22 policies, one ALTER each, meaning unchanged -----------------------------------------------------------
-- 082
ALTER POLICY ingest_rejections_read_platform_admin ON public.ingest_rejections
  USING ((SELECT public.is_platform_admin()));
ALTER POLICY ingest_rejections_update_platform_admin ON public.ingest_rejections
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));
ALTER POLICY pjr_read_platform_admin ON public.pending_jurisdiction_review
  USING ((SELECT public.is_platform_admin()));
ALTER POLICY pjr_update_platform_admin ON public.pending_jurisdiction_review
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

-- 099
ALTER POLICY source_tier_opinions_select_platform_admin ON public.source_tier_opinions
  USING ((SELECT public.is_platform_admin()));
ALTER POLICY source_tier_opinions_update_platform_admin ON public.source_tier_opinions
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

-- 153: requester reads their own; active verifiers and platform admins read all / decide.
ALTER POLICY signoff_select ON public.community_post_signoff_requests
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.verifier_status = 'active'
    )
    OR (SELECT public.is_platform_admin())
  );
ALTER POLICY signoff_decide ON public.community_post_signoff_requests
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.verifier_status = 'active'
    )
    OR (SELECT public.is_platform_admin())
  );

-- 166
ALTER POLICY provisional_sources_admin_read ON public.provisional_sources
  USING (auth.role() = 'service_role' OR (SELECT public.is_platform_admin()));

-- 182 (the WITH CHECK of moderation_reports_update_admin never read the flag and is left as it is)
ALTER POLICY moderation_reports_select ON public.moderation_reports
  USING (
    (reporter_user_id = auth.uid())
    OR ((target_kind = 'post') AND (EXISTS (
          SELECT 1 FROM public.community_posts p
            JOIN public.community_group_members m ON m.group_id = p.group_id
           WHERE p.id = moderation_reports.target_id
             AND m.user_id = auth.uid()
             AND m.role = ANY (ARRAY['admin','moderator']))))
    OR ((target_kind = 'group') AND (EXISTS (
          SELECT 1 FROM public.community_group_members m
           WHERE m.group_id = moderation_reports.target_id
             AND m.user_id = auth.uid()
             AND m.role = ANY (ARRAY['admin','moderator']))))
    OR (SELECT public.is_platform_admin())
  );
ALTER POLICY moderation_reports_update_admin ON public.moderation_reports
  USING (
    (SELECT public.is_platform_admin())
    OR ((target_kind = 'post') AND (EXISTS (
          SELECT 1 FROM public.community_posts p
            JOIN public.community_group_members m ON m.group_id = p.group_id
           WHERE p.id = moderation_reports.target_id
             AND m.user_id = auth.uid()
             AND m.role = ANY (ARRAY['admin','moderator']))))
    OR ((target_kind = 'group') AND (EXISTS (
          SELECT 1 FROM public.community_group_members m
           WHERE m.group_id = moderation_reports.target_id
             AND m.user_id = auth.uid()
             AND m.role = ANY (ARRAY['admin','moderator']))))
  );

-- 195
ALTER POLICY error_events_admin_read ON public.error_events
  USING ((SELECT public.is_platform_admin()));

-- 249
ALTER POLICY integrity_flags_admin_read ON public.integrity_flags
  USING ((SELECT public.is_platform_admin()));
ALTER POLICY integrity_flags_admin_update ON public.integrity_flags
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));
ALTER POLICY holdings_quality_admin_read ON public.holdings_quality
  USING ((SELECT public.is_platform_admin()));

-- 277
ALTER POLICY corpus_turn_requests_admin_read ON public.corpus_turn_requests
  USING ((SELECT public.is_platform_admin()));

-- 342
ALTER POLICY canonical_source_candidates_admin_read ON public.canonical_source_candidates
  USING ((SELECT public.is_platform_admin()));
ALTER POLICY canonical_source_candidates_admin_write ON public.canonical_source_candidates
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

-- 355
ALTER POLICY vocabulary_terms_admin_read ON public.vocabulary_terms
  USING ((SELECT public.is_platform_admin()));
ALTER POLICY vocabulary_mentions_admin_read ON public.vocabulary_mentions
  USING ((SELECT public.is_platform_admin()));

-- 356
ALTER POLICY item_corrections_admin_read ON public.item_corrections
  USING ((SELECT public.is_platform_admin()));
ALTER POLICY item_correction_evidence_admin_read ON public.item_correction_evidence
  USING ((SELECT public.is_platform_admin()));

-- ---- 3. The column is private ------------------------------------------------------------------------------------
REVOKE SELECT (is_platform_admin) ON public.profiles FROM PUBLIC, anon, authenticated;

-- ---- Self-check: attack every leg, rolled back -------------------------------------------------------------------
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_ready boolean := true;
  v_denied boolean;
  v_flag boolean;
  v_n bigint;
  v_total bigint;
  v_adm bigint;
  v_t text;
  v_tables text[] := ARRAY[
    'ingest_rejections', 'source_tier_opinions', 'community_post_signoff_requests', 'provisional_sources',
    'moderation_reports', 'error_events', 'integrity_flags', 'corpus_turn_requests',
    'canonical_source_candidates', 'vocabulary_terms', 'item_corrections'
  ];
BEGIN
  BEGIN
    BEGIN
      INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
        (v_user, 'authenticated', 'authenticated', 'sec6-user-' || replace(v_user::text, '-', '') || '@selfcheck.invalid', now(), now()),
        (v_admin, 'authenticated', 'authenticated', 'sec6-admin-' || replace(v_admin::text, '-', '') || '@selfcheck.invalid', now(), now());
    EXCEPTION WHEN OTHERS THEN
      v_ready := false;
      RAISE NOTICE 'migration 375 self-check: could not insert fixture auth.users rows (%), role legs skipped, catalog assertions still run', SQLERRM;
    END;

    IF v_ready THEN
      INSERT INTO public.profiles (id, email, display_name, full_name) VALUES
        (v_user, 'sec6-user-' || replace(v_user::text, '-', '') || '@selfcheck.invalid', 'Sec6 User', 'Sec6 User');
      INSERT INTO public.profiles (id, email, display_name, full_name, is_platform_admin) VALUES
        (v_admin, 'sec6-admin-' || replace(v_admin::text, '-', '') || '@selfcheck.invalid', 'Sec6 Admin', 'Sec6 Admin', true);

      -- A. Authenticated NON-ADMIN.
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

      v_denied := false;
      BEGIN
        PERFORM p.is_platform_admin FROM public.profiles p WHERE p.id = v_user;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
      END;
      IF NOT v_denied THEN RAISE EXCEPTION 'ABORT: a non-admin could SELECT is_platform_admin from its own profiles row'; END IF;

      v_denied := false;
      BEGIN
        PERFORM p.is_platform_admin FROM public.profiles p WHERE p.id = v_admin;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
      END;
      IF NOT v_denied THEN RAISE EXCEPTION 'ABORT: a non-admin could SELECT is_platform_admin from another profiles row'; END IF;

      SELECT count(*) INTO v_n FROM (SELECT p.id, p.display_name, p.verifier_status FROM public.profiles p WHERE p.id = v_user) s;
      IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: the revoke is over-broad: id, display_name and verifier_status of the own row are no longer readable (% rows)', v_n; END IF;

      SELECT public.is_platform_admin() INTO v_flag;
      IF v_flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'ABORT: is_platform_admin() must be false for a non-admin (got %)', v_flag; END IF;

      SELECT m.is_platform_admin INTO v_flag FROM public.my_profile() m;
      IF v_flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'ABORT: my_profile() must carry is_platform_admin = false for a non-admin (got %)', v_flag; END IF;
      RESET ROLE;

      -- B. Authenticated ADMIN.
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

      v_denied := false;
      BEGIN
        PERFORM p.is_platform_admin FROM public.profiles p WHERE p.id = v_admin;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
      END;
      IF NOT v_denied THEN RAISE EXCEPTION 'ABORT: a platform admin could SELECT is_platform_admin from its own profiles row (the column is not private)'; END IF;

      SELECT public.is_platform_admin() INTO v_flag;
      IF v_flag IS DISTINCT FROM true THEN RAISE EXCEPTION 'ABORT: is_platform_admin() must be true for the platform admin (got %)', v_flag; END IF;

      SELECT m.is_platform_admin INTO v_flag FROM public.my_profile() m;
      IF v_flag IS DISTINCT FROM true THEN RAISE EXCEPTION 'ABORT: my_profile() must carry is_platform_admin = true for the platform admin (got %)', v_flag; END IF;
      RESET ROLE;

      -- C. ANON can call the predicate (policies are OR'd, so a closed predicate would break any other policy on the
      -- same table) and it says false: there is no caller. No table among the 22 has an anon-readable policy, so the
      -- leg is the call itself.
      SET LOCAL ROLE anon;
      PERFORM set_config('request.jwt.claim.sub', '', true);
      PERFORM set_config('request.jwt.claims', '', true);
      v_denied := false;
      v_flag := NULL;
      BEGIN
        SELECT public.is_platform_admin() INTO v_flag;
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
      END;
      IF v_denied THEN RAISE EXCEPTION 'ABORT: anon could not execute is_platform_admin() (policies are OR''d: a closed predicate raises 42501 on a table that has another policy for anon)'; END IF;
      IF v_flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'ABORT: is_platform_admin() must be false for anon (got %)', v_flag; END IF;
      RESET ROLE;

      -- D. SERVICE_ROLE: no caller means false, and the sanctioned column read stays open.
      SET LOCAL ROLE service_role;
      PERFORM set_config('request.jwt.claim.sub', '', true);
      PERFORM set_config('request.jwt.claims', '', true);
      SELECT public.is_platform_admin() INTO v_flag;
      IF v_flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'ABORT: is_platform_admin() must be false when there is no caller (got %)', v_flag; END IF;
      SELECT p.is_platform_admin INTO v_flag FROM public.profiles p WHERE p.id = v_admin;
      IF v_flag IS DISTINCT FROM true THEN RAISE EXCEPTION 'ABORT: service_role could not read profiles.is_platform_admin (got %)', v_flag; END IF;
      RESET ROLE;

      -- E. One policy per source migration, exercised as the admin and as the non-admin. The table is counted as the
      -- owner first (RLS does not apply), the admin must see exactly that count, the non-admin none of it.
      FOREACH v_t IN ARRAY v_tables LOOP
        IF to_regclass('public.' || quote_ident(v_t)) IS NULL THEN
          RAISE EXCEPTION 'ABORT: public.% does not exist', v_t;
        END IF;
        IF NOT (has_table_privilege('authenticated', 'public.' || quote_ident(v_t), 'SELECT')
                OR has_any_column_privilege('authenticated', 'public.' || quote_ident(v_t), 'SELECT')) THEN
          RAISE NOTICE 'migration 375 self-check: authenticated holds no SELECT on public.% (the privilege layer refuses before the policy), policy leg skipped', v_t;
          CONTINUE;
        END IF;
        EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_total;

        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
        PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
        BEGIN
          EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_adm;
        EXCEPTION WHEN OTHERS THEN
          RESET ROLE;
          RAISE EXCEPTION 'ABORT: the platform admin could not read public.% after the repoint (SQLSTATE %, %)', v_t, SQLSTATE, SQLERRM;
        END;
        RESET ROLE;
        IF v_adm <> v_total THEN
          RAISE EXCEPTION 'ABORT: the platform admin sees % of % rows of public.% after the repoint', v_adm, v_total, v_t;
        END IF;

        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
        PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
        v_denied := false;
        v_n := NULL;
        BEGIN
          EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
        EXCEPTION
          WHEN insufficient_privilege THEN v_denied := true;
          WHEN OTHERS THEN
            RESET ROLE;
            RAISE EXCEPTION 'ABORT: a non-admin read of public.% failed with an error that is neither a row count nor 42501 (SQLSTATE %, %)', v_t, SQLSTATE, SQLERRM;
        END;
        RESET ROLE;
        IF NOT v_denied AND v_n <> 0 THEN
          RAISE EXCEPTION 'ABORT: a non-admin sees % rows of public.% (the repointed policy admits them)', v_n, v_t;
        END IF;
      END LOOP;
    END IF;

    RAISE EXCEPTION 'sec6_375_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'sec6_375_selfcheck_rollback' THEN RAISE; END IF;
  END;
END $$;

-- ---- Catalog pass (after the rolled-back sub-transaction) --------------------------------------------------------
DO $$
DECLARE
  v_bad text;
  v_col text;
BEGIN
  -- 1. No policy in public names the flag as a column reference. Calls to the predicate are removed first, and so is the
  -- output alias the deparser gives a scalar sub-select ("AS is_platform_admin").
  SELECT string_agg(p.tablename || '.' || p.policyname, ', ' ORDER BY p.tablename, p.policyname) INTO v_bad
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND regexp_replace(
           regexp_replace(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''), 'is_platform_admin\s*\(\s*\)', '', 'gi'),
           'AS\s+is_platform_admin', '', 'gi') ~* 'is_platform_admin';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: these policies in public still read the is_platform_admin column, which authenticated can no longer select: %', v_bad;
  END IF;

  -- 2. All 22 name the predicate, and the five that restate a WITH CHECK name it there too.
  SELECT string_agg(l.tbl || '.' || l.pol, ', ' ORDER BY l.tbl, l.pol) INTO v_bad
    FROM _sec6_policy_list l
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = l.tbl AND p.policyname = l.pol
        AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~* 'is_platform_admin\s*\(\s*\)'
        AND (NOT l.has_check OR coalesce(p.with_check, '') ~* 'is_platform_admin\s*\(\s*\)')
   );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: these policies do not call is_platform_admin() where they must: %', v_bad;
  END IF;
  IF (SELECT count(*) FROM _sec6_policy_list) <> 22 THEN
    RAISE EXCEPTION 'ABORT: the policy list changed size (expected 22)';
  END IF;

  -- 3. Privileges on the column and on the rest of the grant.
  IF has_column_privilege('anon', 'public.profiles', 'is_platform_admin', 'SELECT')
     OR has_column_privilege('authenticated', 'public.profiles', 'is_platform_admin', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: anon or authenticated can still SELECT profiles.is_platform_admin';
  END IF;
  IF has_table_privilege('anon', 'public.profiles', 'SELECT') OR has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: a table-level SELECT on public.profiles is held by anon or authenticated';
  END IF;
  IF NOT has_column_privilege('service_role', 'public.profiles', 'is_platform_admin', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: service_role lost SELECT on profiles.is_platform_admin';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['id', 'display_name', 'full_name', 'avatar_url', 'job_title', 'org_id', 'verifier_status'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.profiles', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'ABORT: authenticated lost SELECT on profiles.% (the revoke is over-broad)', v_col;
    END IF;
  END LOOP;
  IF has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: authenticated can SELECT profiles.email (migration 372 removed it)';
  END IF;

  -- 4. The predicate: definer, pinned path naming pg_temp, EXECUTE for anon, authenticated and service_role (class C), not PUBLIC.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = 'public.is_platform_admin()'::regprocedure
       AND prosecdef
       AND provolatile = 's'
       AND prorettype = 'boolean'::regtype
       AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search_path=%pg_temp%')
  ) THEN
    RAISE EXCEPTION 'ABORT: public.is_platform_admin() must be STABLE SECURITY DEFINER returning boolean with a search_path that names pg_temp';
  END IF;
  IF NOT has_function_privilege('anon', 'public.is_platform_admin()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.is_platform_admin()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.is_platform_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: anon, authenticated and service_role must all be able to execute is_platform_admin() (class C: an RLS predicate)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = 'public.is_platform_admin()'::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ABORT: EXECUTE on is_platform_admin() is still granted to PUBLIC';
  END IF;

  RAISE NOTICE 'migration 375 OK: profiles.is_platform_admin is private; 22 policies call public.is_platform_admin(); the admin read and the non-admin refusal were exercised on rolled-back fixtures';
END $$;

COMMIT;
