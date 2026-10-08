-- subject: Migration 369 (lane SEC-3a, 2026-10-08): functions, views and grants that let anon or a signed-in user write what only the system may write; EXECUTE on admin_set_judgement_drain, admin_set_pause_state, item_corrections_note, item_corrections_patch (and the three corrections read helpers and move_override_notes_to_item_notes) revoked from PUBLIC, anon and authenticated and held by service_role only; publish_aggregate likewise service_role only (ruling A) and pinned to search_path public, pg_temp; every public view set to security_invoker = on with INSERT, UPDATE and DELETE revoked from PUBLIC, anon and authenticated, and anon SELECT revoked on research_assessments_current; anon loses INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on every public table except the write privileges a policy naming anon or public still needs, authenticated loses TRUNCATE, TRIGGER and REFERENCES (not covered by RLS), and the postgres default privileges for new tables stop granting them; the self-check attacks each closure as anon, authenticated and service_role in a block that always rolls back; APPLIED (production ledger version 20261008072538, as of 2026-10-08).
-- 369 -- functions, views and grants (lane SEC-3a, 2026-10-08).
--
-- APPLIED (production ledger version 20261008072538, as of 2026-10-08). Authored by lane SEC-3a; the coordinator's executor applies it after CI (two-track policy, CLAUDE.md
-- standing rule 3: schema DDL applies via the Supabase CLI before any dependent code commits). No code in src or
-- scripts changes: every caller of what is closed here uses the service-role client (listed under CALLERS). Sibling
-- of 364 (SEC-1) and 367 (SEC-2); table policies and triggers are SEC-3b (migration 370) and are NOT touched here.
--
-- SOURCE. The privilege census scripts/tmp/privilege-census-2026-10-08.md (gitignored, read in full): section 2
-- (SECURITY DEFINER functions executable by anon or authenticated), section 3 (views with security_invoker off),
-- section 0 (table-level grants: anon holds INSERT 107, UPDATE 106, DELETE 107, TRUNCATE 110, TRIGGER 110 of 119
-- tables). Every census fact below is [CONFIRMED: catalog] by that census; this lane had no live access and read only
-- the migration tree and src.
--
-- 1. FUNCTIONS (EXECUTE).
--    admin_set_judgement_drain(text, text)   migration 354. SECURITY DEFINER, no caller test, and it declares the very
--      marker (app.judgement_drain_writer) that the guard trigger keys on, so anyone able to EXECUTE it can flip the
--      scheduled-drain kill switch. EXECUTE was held by PUBLIC, anon and authenticated (354 granted service_role but
--      never revoked the defaults). Revoked from PUBLIC, anon, authenticated; granted to service_role.
--    admin_set_pause_state(text, boolean, text, date, boolean)   migration 201. Migration 248 already revoked it; the
--      census shows it outside the executable set. It is revoked and granted again here so the two sibling writers are
--      closed by one migration and a re-grant after 248 cannot survive (idempotent).
--    item_corrections_note(uuid, jsonb), item_corrections_patch(uuid, text, jsonb)   migration 356. SECURITY DEFINER with
--      no caller test; note upserts item_correction_evidence (anyone could inflate observed_count or overwrite
--      latest_machine_value), patch discloses the enforced correction values and writes through note. Their only
--      callers are the zz_item_corrections_apply_* trigger functions, which are SECURITY DEFINER (owned by the migration
--      role, so unaffected by a revoke from the public roles) and create_item_correction (service_role). Revoked from
--      PUBLIC, anon, authenticated; granted to service_role.
--    Extension, same family and same posture, ruled by the coordinator: the three read helpers of migration 356
--      (item_corrections_latest(uuid, text), item_corrections_span_is_verbatim(uuid, uuid, text),
--      item_corrections_pair_tombstoned(uuid, uuid)) return rows of item_corrections (an admin-read-only table by RLS)
--      to anon, and move_override_notes_to_item_notes() (census section 2: an anon-triggerable cross-tenant bulk write,
--      defined out of repo, run post-merge by the executor over the Supabase MCP as the service role). A function is in
--      this list only because [CONFIRMED by git grep over fsi-app/src, fsi-app/scripts, fsi-app/.discipline and the
--      migration tree] it is SECURITY DEFINER and every caller is a SECURITY DEFINER function (the three helpers are
--      called only from item_corrections_patch, item_corrections_before_insert and
--      item_corrections_block_tombstoned_edge, migration 356, all SECURITY DEFINER) or the service role (no src or
--      script reaches any of the four through rpc; item-corrections.mjs names two of them in a comment only). Each is
--      revoked from PUBLIC, anon, authenticated and granted to service_role, but only when it exists
--      (to_regprocedure), so the migration is safe on a database where the out-of-repo function is absent.
--    publish_aggregate(text, text, jsonb)   migrations 287, 347. SECURITY DEFINER, no search_path set. RULING A
--      (coordinator, 2026-10-08): service_role only. Revoked from PUBLIC, anon and authenticated, granted to
--      service_role. Aggregates are system-published and no user path exists (ADR-042; no caller in src or scripts), so
--      the cohort-membership validation the original brief asked for is moot: a user cannot call the gate with a
--      caller-supplied cohort at all, which also closes the ledger poisoning by any signed-in user. A future caller is
--      a server route that derives member_ids from a real join and calls through the service client. The search_path is
--      pinned with ALTER FUNCTION ... SET search_path = public, pg_temp, not CREATE OR REPLACE: the body is not
--      reproduced here, so the 180-line gate cannot drift from the applied one, and the pin changes nothing else (every
--      table in the body is already qualified public., every function it calls is in pg_catalog). The PROOF-4 attacks
--      (scripts/proof/attacks/attacks.json, group ADR-035 aggregate floor) were changed in the same PR: the floor and
--      dominance legs run as the service role, and an authenticated leg and an anon leg must be refused 42501.
--
-- CALLERS [CONFIRMED by git grep and by reading the files]. admin_set_pause_state and admin_set_judgement_drain: only
-- src/app/api/admin/sources/pause-global/route.ts, through the client requireAdminRoute returns, which is
-- getServiceSupabase() (src/lib/api/route-guard.ts); and scripts/proof/load-subset.mjs, a direct database connection
-- as the migration role. No user-session caller exists, so no STOP.
--
-- 2. VIEWS. The public views are enumerated from pg_class at apply time (not hard-coded, because DEAD-2's migration
-- 368 drops acquisition_backlog_v and this migration must be order-independent of it). Each view with
-- security_invoker off becomes security_invoker = on: today derived_values_admissible, research_assessments_current and
-- propagation_queue_depth run as their owner (postgres), so a write through an auto-updatable one skips the base table's
-- RLS (the base tables have RLS on and no policy, deny-all), which is how the deliberately read-only pollution barrier
-- (RD-56) became a write door. INSERT, UPDATE and DELETE are revoked on every view from PUBLIC, anon and authenticated.
-- Switching to security_invoker changes the READ path of exactly two views for non-service roles (the base tables have
-- no SELECT policy, so a non-service caller now reads zero rows or is refused): derived_values_admissible and
-- research_assessments_current. [CONFIRMED by reading every reader] each reader uses the service-role client:
-- src/app/research/page.tsx readAssessmentsByItemId (getServiceSupabase), src/app/research/[slug]/page.tsx (the ctx
-- client of load-detail.ts, defaultCreateServiceClient), src/lib/agent/canonical-pipeline.ts
-- buildPlanningAssumptionContext (a service client), scripts/producers/research/research-assessment-producer.mjs
-- (service role), src/app/api/notices/route.ts (getServiceSupabase) for derived_values_admissible. service_role bypasses
-- RLS and holds the table grants, so nothing it reads changes. propagation_queue_depth has no reader in src.
-- ANON READ OF research_assessments_current: revoked. Evidence it is not a product requirement: spec
-- docs/specs/03-research.md renders credibility and horizon on /research and /research/[slug], both server-rendered
-- through the service-role client above; no anon-key client and no public listing RPC reads the view (the public
-- listing RPCs are the get_*_public family, none of which selects from it). authenticated SELECT on the two views
-- (granted by 285 and 344) is left in place; under security_invoker it is inert, which is what the base-table RLS
-- already meant. A later CREATE OR REPLACE VIEW without WITH (security_invoker = on) resets the option (Postgres
-- replaces reloptions on CREATE OR REPLACE VIEW), so any future migration that restates one of these views must carry
-- the option.
--
-- 3. GRANT HYGIENE (anon). REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
-- FROM anon, then GRANT back, per table and per command, only what a policy that names anon or public still needs
-- (pg_policies, schema public, roles overlapping {anon, public}, cmd INSERT, UPDATE, DELETE or ALL, on an ordinary or
-- partitioned table). The census found zero policies naming anon with a write command and no public-role write policy
-- without an identity or service_role test, so the re-grant set is expected to be small; its size is printed in a
-- NOTICE. TRUNCATE, REFERENCES and TRIGGER are never granted back: they are not subject to RLS, and anon needs none of
-- them. anon SELECT is untouched (the block asserts the anon SELECT grant count is identical before and after).
-- authenticated: REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated (coordinator
-- ruling). None of the three is subject to RLS and Supabase's default grant gives all three to authenticated; no
-- legitimate caller needs them (migrations run as the owner). authenticated INSERT, UPDATE and DELETE are untouched
-- (SEC-3b owns the table policies); the block asserts their grant counts are identical before and after. Default
-- privileges: ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE the same six FROM anon and the three
-- FROM authenticated, so a table created later does not come back with them. A function default privilege is NOT
-- changed here (that would change every future function for every role).
--
-- SELF-CHECK. One DO block, no fixture rows invented, every change rolled back by a sentinel exception. A helper in
-- pg_temp (dropped afterwards) runs one statement as a role under SET LOCAL ROLE and returns 'ok' or the SQLSTATE.
-- Attacks: anon and authenticated each calling admin_set_judgement_drain, admin_set_pause_state, item_corrections_note
-- and item_corrections_patch must get 42501, and so must anon and authenticated calling publish_aggregate, while
-- service_role succeeds (a refusal payload for an unregistered field, which still writes the ledger, rolled back);
-- service_role must succeed on the service-only writers (note excepted: it is not expected to succeed as service_role
-- because its foreign key needs a real correction, so only the privilege check is asserted). Every view must carry
-- security_invoker = on and grant no INSERT, UPDATE or DELETE to anon or authenticated, and a real INSERT DEFAULT VALUES
-- and a real DELETE through each auto-updatable view as anon and as authenticated must get 42501. anon SELECT on
-- research_assessments_current must get 42501. The two flipped read views must still be readable as service_role, and
-- readable as authenticated only as zero rows when the base table has no SELECT policy. Hygiene: no public table's anon
-- ACL holds any of the six privileges except those the live policies justify; a real INSERT DEFAULT VALUES, UPDATE
-- and DELETE as anon on a table with no anon-or-public write policy must get 42501; a real TRUNCATE as authenticated on
-- a real table must get 42501; and the postgres default ACL for new tables in public (pg_default_acl) holds none of the
-- six for anon and none of the three for authenticated (read from the catalog; no table is created, so no object is
-- left for F47 or F64 to flag).

BEGIN;

-- ---- Preconditions ---------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_sig text;
  v_role text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.admin_set_judgement_drain(text, text)',
    'public.admin_set_pause_state(text, boolean, text, date, boolean)',
    'public.publish_aggregate(text, text, jsonb)',
    'public.item_corrections_note(uuid, jsonb)',
    'public.item_corrections_patch(uuid, text, jsonb)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'ABORT: % does not exist (migrations 201, 287, 354 and 356 create the five)', v_sig;
    END IF;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'postgres'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      RAISE EXCEPTION 'ABORT: role % does not exist', v_role;
    END IF;
  END LOOP;
  IF to_regclass('public.system_state') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.system_state does not exist';
  END IF;
END $$;

-- ---- 1. Functions ----------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.admin_set_judgement_drain(text, text)',
    'public.admin_set_pause_state(text, boolean, text, date, boolean)',
    'public.item_corrections_note(uuid, jsonb)',
    'public.item_corrections_patch(uuid, text, jsonb)',
    'public.item_corrections_latest(uuid, text)',
    'public.item_corrections_span_is_verbatim(uuid, uuid, text)',
    'public.item_corrections_pair_tombstoned(uuid, uuid)',
    'public.move_override_notes_to_item_notes()'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE NOTICE 'migration 369: % does not exist on this database, skipped', v_sig;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', to_regprocedure(v_sig));
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', to_regprocedure(v_sig));
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.publish_aggregate(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_aggregate(text, text, jsonb) TO service_role;
ALTER FUNCTION public.publish_aggregate(text, text, jsonb) SET search_path = public, pg_temp;

-- ---- 2. Views --------------------------------------------------------------------------------------------------
DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT c.relname
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
     ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v.relname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM PUBLIC, anon, authenticated', v.relname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.research_assessments_current') IS NOT NULL THEN
    REVOKE SELECT ON public.research_assessments_current FROM anon;
  ELSE
    RAISE NOTICE 'migration 369: public.research_assessments_current does not exist on this database, anon SELECT revoke skipped';
  END IF;
END $$;

-- ---- 3. Grant hygiene (anon: the six; authenticated: TRUNCATE, TRIGGER, REFERENCES) ---------------------------------
DO $$
DECLARE
  r record;
  v_anon oid := (SELECT oid FROM pg_roles WHERE rolname = 'anon');
  v_auth oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
  v_sel_before integer;
  v_sel_after integer;
  v_iud_before integer;
  v_iud_after integer;
  v_regranted integer := 0;
  v_list text := '';
BEGIN
  SELECT count(*) INTO v_sel_before
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v')
     AND a.grantee = v_anon AND a.privilege_type = 'SELECT';
  SELECT count(*) INTO v_iud_before
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
     AND a.grantee = v_auth AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE');

  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;

  FOR r IN
    SELECT p.tablename AS t,
           bool_or(p.cmd IN ('INSERT', 'ALL')) AS ins,
           bool_or(p.cmd IN ('UPDATE', 'ALL')) AS upd,
           bool_or(p.cmd IN ('DELETE', 'ALL')) AS del
      FROM pg_policies p
      JOIN pg_class c ON c.relname = p.tablename AND c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
     WHERE p.schemaname = 'public'
       AND p.roles && ARRAY['anon', 'public']::name[]
       AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     GROUP BY p.tablename
     ORDER BY p.tablename
  LOOP
    IF r.ins THEN EXECUTE format('GRANT INSERT ON public.%I TO anon', r.t); END IF;
    IF r.upd THEN EXECUTE format('GRANT UPDATE ON public.%I TO anon', r.t); END IF;
    IF r.del THEN EXECUTE format('GRANT DELETE ON public.%I TO anon', r.t); END IF;
    v_regranted := v_regranted + 1;
    v_list := v_list || CASE WHEN v_list = '' THEN '' ELSE ', ' END || r.t;
  END LOOP;

  SELECT count(*) INTO v_sel_after
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v')
     AND a.grantee = v_anon AND a.privilege_type = 'SELECT';
  IF v_sel_after <> v_sel_before THEN
    RAISE EXCEPTION 'ABORT: the anon SELECT grant count changed from % to % (this migration must not touch SELECT)', v_sel_before, v_sel_after;
  END IF;
  SELECT count(*) INTO v_iud_after
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
     AND a.grantee = v_auth AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_iud_after <> v_iud_before THEN
    RAISE EXCEPTION 'ABORT: the authenticated INSERT, UPDATE, DELETE grant count changed from % to % (SEC-3b owns those)', v_iud_before, v_iud_after;
  END IF;

  RAISE NOTICE 'migration 369: anon write privileges re-granted on % table(s) that carry a write policy naming anon or public: %', v_regranted, coalesce(nullif(v_list, ''), '(none)');
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;

-- ---- Self-check: attack every closure, rolled back -------------------------------------------------------------
-- Helper: run one statement as a role, return 'ok' or the SQLSTATE. Lives in pg_temp, dropped after the self-check.
CREATE FUNCTION pg_temp.sec3a_attempt(p_role text, p_sql text) RETURNS text
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

DO $selfcheck$
DECLARE
  v_anon oid := (SELECT oid FROM pg_roles WHERE rolname = 'anon');
  v_auth oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
  v_trunc text;
  v_cur_drain text;
  v_res text;
  v_role text;
  v_sig text;
  v_view record;
  v_vn text;
  v_tbl text;
  v_col text;
  v_priv text;
  v_n integer;
  v_cnt_auth bigint;
  v_base text;
BEGIN
  SELECT coalesce(judgement_drain, 'off') INTO v_cur_drain FROM public.system_state WHERE id = true;
  v_cur_drain := coalesce(v_cur_drain, 'off');

  BEGIN
    -- ======== A. functions: the attack, as anon and as authenticated, then the allowed side ========
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      v_res := pg_temp.sec3a_attempt(v_role, format('SELECT public.admin_set_judgement_drain(%L, %L)', 'sec3a-selfcheck', v_cur_drain));
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: % calling admin_set_judgement_drain got % (want 42501)', v_role, v_res; END IF;
      v_res := pg_temp.sec3a_attempt(v_role, 'SELECT public.admin_set_pause_state(''sec3a-selfcheck'', NULL, NULL, NULL, false)');
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: % calling admin_set_pause_state got % (want 42501)', v_role, v_res; END IF;
      v_res := pg_temp.sec3a_attempt(v_role, 'SELECT public.item_corrections_note(gen_random_uuid(), ''{}''::jsonb)');
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: % calling item_corrections_note got % (want 42501)', v_role, v_res; END IF;
      v_res := pg_temp.sec3a_attempt(v_role, 'SELECT public.item_corrections_patch(gen_random_uuid(), ''intelligence_items'', ''{}''::jsonb)');
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: % calling item_corrections_patch got % (want 42501)', v_role, v_res; END IF;
    END LOOP;

    v_res := pg_temp.sec3a_attempt('service_role', format('SELECT public.admin_set_judgement_drain(%L, %L)', 'sec3a-selfcheck', v_cur_drain));
    IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: service_role calling admin_set_judgement_drain got % (want ok)', v_res; END IF;
    v_res := pg_temp.sec3a_attempt('service_role', 'SELECT public.admin_set_pause_state(''sec3a-selfcheck'', NULL, NULL, NULL, false)');
    IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: service_role calling admin_set_pause_state got % (want ok)', v_res; END IF;
    v_res := pg_temp.sec3a_attempt('service_role', 'SELECT public.item_corrections_patch(gen_random_uuid(), ''intelligence_items'', ''{}''::jsonb)');
    IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: service_role calling item_corrections_patch got % (want ok)', v_res; END IF;
    -- note has a foreign key to item_corrections, so a call with a random id fails for a reason other than privilege;
    -- the assertion is only that the privilege check passes.
    v_res := pg_temp.sec3a_attempt('service_role', 'SELECT public.item_corrections_note(gen_random_uuid(), ''{}''::jsonb)');
    IF v_res = '42501' THEN RAISE EXCEPTION 'ABORT: service_role was refused item_corrections_note'; END IF;

    -- publish_aggregate (ruling A): anon and authenticated refused; service_role reaches the gate (a refusal payload).
    v_res := pg_temp.sec3a_attempt('anon', 'SELECT public.publish_aggregate(''sec3a_no_table'', ''sec3a_no_column'', ''{"member_ids": []}''::jsonb)');
    IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: anon calling publish_aggregate got % (want 42501)', v_res; END IF;
    v_res := pg_temp.sec3a_attempt('authenticated', 'SELECT public.publish_aggregate(''sec3a_no_table'', ''sec3a_no_column'', ''{"member_ids": []}''::jsonb)');
    IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: authenticated calling publish_aggregate got % (want 42501)', v_res; END IF;
    v_res := pg_temp.sec3a_attempt('service_role', 'SELECT public.publish_aggregate(''sec3a_no_table'', ''sec3a_no_column'', ''{"member_ids": []}''::jsonb)');
    IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: service_role calling publish_aggregate got % (want ok)', v_res; END IF;

    -- the privilege catalog for every function this migration closes
    FOREACH v_sig IN ARRAY ARRAY[
      'public.admin_set_judgement_drain(text, text)',
      'public.admin_set_pause_state(text, boolean, text, date, boolean)',
      'public.item_corrections_note(uuid, jsonb)',
      'public.item_corrections_patch(uuid, text, jsonb)',
      'public.item_corrections_latest(uuid, text)',
      'public.item_corrections_span_is_verbatim(uuid, uuid, text)',
      'public.item_corrections_pair_tombstoned(uuid, uuid)',
      'public.move_override_notes_to_item_notes()',
      'public.publish_aggregate(text, text, jsonb)'
    ] LOOP
      IF to_regprocedure(v_sig) IS NULL THEN CONTINUE; END IF;
      IF has_function_privilege('anon', to_regprocedure(v_sig), 'EXECUTE') THEN
        RAISE EXCEPTION 'ABORT: anon still holds EXECUTE on %', v_sig;
      END IF;
      IF NOT has_function_privilege('service_role', to_regprocedure(v_sig), 'EXECUTE') THEN
        RAISE EXCEPTION 'ABORT: service_role lost EXECUTE on %', v_sig;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
         WHERE p.oid = to_regprocedure(v_sig) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      ) THEN
        RAISE EXCEPTION 'ABORT: PUBLIC still holds EXECUTE on %', v_sig;
      END IF;
      IF has_function_privilege('authenticated', to_regprocedure(v_sig), 'EXECUTE') THEN
        RAISE EXCEPTION 'ABORT: authenticated still holds EXECUTE on %', v_sig;
      END IF;
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
       WHERE p.oid = 'public.publish_aggregate(text, text, jsonb)'::regprocedure AND c = 'search_path=public, pg_temp'
    ) THEN
      RAISE EXCEPTION 'ABORT: publish_aggregate does not carry search_path = public, pg_temp';
    END IF;

    -- ======== B. views ========
    FOR v_view IN
      SELECT c.oid, c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' ORDER BY c.relname
    LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_class c, unnest(c.reloptions) o WHERE c.oid = v_view.oid AND o ~ '^security_invoker=(on|true)$') THEN
        RAISE EXCEPTION 'ABORT: view % does not carry security_invoker = on', v_view.relname;
      END IF;
      FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
          IF has_table_privilege(v_role, v_view.oid, v_priv) THEN
            RAISE EXCEPTION 'ABORT: % still holds % on view %', v_role, v_priv, v_view.relname;
          END IF;
        END LOOP;
        IF pg_relation_is_updatable(v_view.oid, false) & 8 = 8 THEN
          v_res := pg_temp.sec3a_attempt(v_role, format('INSERT INTO public.%I DEFAULT VALUES', v_view.relname));
          IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: % INSERT through view % got % (want 42501)', v_role, v_view.relname, v_res; END IF;
        END IF;
        IF pg_relation_is_updatable(v_view.oid, false) & 16 = 16 THEN
          v_res := pg_temp.sec3a_attempt(v_role, format('DELETE FROM public.%I WHERE false', v_view.relname));
          IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: % DELETE through view % got % (want 42501)', v_role, v_view.relname, v_res; END IF;
        END IF;
      END LOOP;
    END LOOP;

    IF to_regclass('public.research_assessments_current') IS NOT NULL THEN
      v_res := pg_temp.sec3a_attempt('anon', 'SELECT count(*) FROM public.research_assessments_current');
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: anon SELECT on research_assessments_current got % (want 42501)', v_res; END IF;
    END IF;

    -- the two flipped read views: still readable by service_role; readable by authenticated only as zero rows when the
    -- base table has no SELECT policy for authenticated or public (a refusal 42501 is also correct)
    FOREACH v_vn IN ARRAY ARRAY['derived_values_admissible', 'research_assessments_current'] LOOP
      IF to_regclass('public.' || v_vn) IS NULL THEN CONTINUE; END IF;
      v_base := CASE v_vn WHEN 'derived_values_admissible' THEN 'derived_values' ELSE 'research_assessments' END;
      v_res := pg_temp.sec3a_attempt('service_role', format('SELECT count(*) FROM public.%I', v_vn));
      IF v_res <> 'ok' THEN RAISE EXCEPTION 'ABORT: service_role reading view % got % (want ok)', v_vn, v_res; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = v_base AND p.cmd IN ('SELECT', 'ALL')
           AND p.roles && ARRAY['authenticated', 'public']::name[]
      ) THEN
        v_cnt_auth := NULL;
        BEGIN
          EXECUTE 'SET LOCAL ROLE authenticated';
          EXECUTE format('SELECT count(*) FROM public.%I', v_vn) INTO v_cnt_auth;
          EXECUTE 'RESET ROLE';
        EXCEPTION WHEN insufficient_privilege THEN
          EXECUTE 'RESET ROLE';
          v_cnt_auth := 0;
        END;
        IF v_cnt_auth <> 0 THEN
          RAISE EXCEPTION 'ABORT: authenticated read % rows through view % although base table % has no SELECT policy', v_cnt_auth, v_vn, v_base;
        END IF;
      ELSE
        RAISE NOTICE 'migration 369 self-check: base table % has a SELECT policy for authenticated or public, authenticated zero-row assertion skipped for %', v_base, v_vn;
      END IF;
    END LOOP;

    -- ======== C. grant hygiene ========
    FOR v_view IN
      SELECT c.oid, c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') ORDER BY c.relname
    LOOP
      FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = v_view.oid AND a.grantee = v_anon AND a.privilege_type = v_priv) THEN
          IF v_priv IN ('TRUNCATE', 'REFERENCES', 'TRIGGER') THEN
            RAISE EXCEPTION 'ABORT: anon still holds % on table %', v_priv, v_view.relname;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = v_view.relname
               AND p.roles && ARRAY['anon', 'public']::name[]
               AND (p.cmd = v_priv OR p.cmd = 'ALL')
          ) THEN
            RAISE EXCEPTION 'ABORT: anon holds % on table % with no policy naming anon or public for it', v_priv, v_view.relname;
          END IF;
        END IF;
      END LOOP;
    END LOOP;

    -- a real attack on one table with no write policy for anon or public and no PUBLIC write grant
    SELECT c.relname INTO v_tbl
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
                        AND p.roles && ARRAY['anon', 'public']::name[] AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL'))
       AND NOT EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = 0 AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE'))
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' AND a.attidentity = '')
     ORDER BY (c.relname = 'system_state') DESC, c.relname
     LIMIT 1;
    IF v_tbl IS NULL THEN
      RAISE NOTICE 'migration 369 self-check: no table suitable for the anon write attack, runtime hygiene leg skipped';
    ELSE
      SELECT a.attname INTO v_col FROM pg_attribute a
       WHERE a.attrelid = ('public.' || quote_ident(v_tbl))::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND a.attgenerated = '' AND a.attidentity = ''
       ORDER BY a.attnum LIMIT 1;
      v_res := pg_temp.sec3a_attempt('anon', format('INSERT INTO public.%I DEFAULT VALUES', v_tbl));
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: anon INSERT into % got % (want 42501)', v_tbl, v_res; END IF;
      v_res := pg_temp.sec3a_attempt('anon', format('UPDATE public.%I SET %I = %I WHERE false', v_tbl, v_col, v_col));
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: anon UPDATE of % got % (want 42501)', v_tbl, v_res; END IF;
      v_res := pg_temp.sec3a_attempt('anon', format('DELETE FROM public.%I WHERE false', v_tbl));
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: anon DELETE from % got % (want 42501)', v_tbl, v_res; END IF;
    END IF;

    -- authenticated: TRUNCATE, TRIGGER and REFERENCES are gone from every table's ACL, and a real TRUNCATE is refused
    -- (TRUNCATE is not subject to RLS, so before this migration it would have emptied the table; the block rolls back)
    FOR v_view IN
      SELECT c.oid, c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') ORDER BY c.relname
    LOOP
      FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = v_view.oid AND a.grantee = v_auth AND a.privilege_type = v_priv) THEN
          RAISE EXCEPTION 'ABORT: authenticated still holds % on table %', v_priv, v_view.relname;
        END IF;
      END LOOP;
    END LOOP;
    SELECT c.relname INTO v_trunc
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND NOT EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = 0 AND a.privilege_type = 'TRUNCATE')
     ORDER BY (c.relname = 'aggregate_query_log') DESC, c.relname
     LIMIT 1;
    IF v_trunc IS NULL THEN
      RAISE NOTICE 'migration 369 self-check: no table suitable for the authenticated TRUNCATE attack, leg skipped';
    ELSE
      v_res := pg_temp.sec3a_attempt('authenticated', format('TRUNCATE public.%I', v_trunc));
      IF v_res <> '42501' THEN RAISE EXCEPTION 'ABORT: authenticated TRUNCATE of % got % (want 42501)', v_trunc, v_res; END IF;
    END IF;

    -- the default-privilege change, read from the catalog (no table is created): the default ACL the migration role
    -- gives new tables in public holds none of the six for anon and none of the three for authenticated
    SELECT count(*) INTO v_n
      FROM pg_default_acl d, aclexplode(d.defaclacl) a
     WHERE d.defaclobjtype = 'r'
       AND d.defaclnamespace = 'public'::regnamespace
       AND d.defaclrole = 'postgres'::regrole
       AND ((a.grantee = v_anon AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
         OR (a.grantee = v_auth AND a.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')));
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'ABORT: the postgres default ACL for new tables in public still grants % write-class privilege(s) to anon or authenticated', v_n;
    END IF;

    RAISE EXCEPTION 'sec3a_369_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'sec3a_369_selfcheck_rollback' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'migration 369 OK: admin writers and the corrections evidence writers are service_role only; publish_aggregate is service_role only and carries a pinned search_path; every public view is security_invoker with no INSERT, UPDATE or DELETE for PUBLIC, anon or authenticated; anon holds no TRUNCATE, REFERENCES or TRIGGER and write privileges only where a policy needs them; authenticated holds no TRUNCATE, REFERENCES or TRIGGER; the default ACL for new tables matches; each closure attacked as anon and authenticated and confirmed open for service_role';
END $selfcheck$;

DROP FUNCTION pg_temp.sec3a_attempt(text, text);

COMMIT;

-- Rollback (reversible in intent; do not, it re-opens the holes):
--   GRANT EXECUTE ON FUNCTION <each function above> TO PUBLIC, anon, authenticated;
--   ALTER FUNCTION public.publish_aggregate(text, text, jsonb) RESET search_path;
--   ALTER VIEW public.<view> SET (security_invoker = off);  GRANT INSERT, UPDATE, DELETE ON public.<view> TO anon, authenticated;
--   GRANT SELECT ON public.research_assessments_current TO anon;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO anon;
--   GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public TO authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLES TO authenticated;
