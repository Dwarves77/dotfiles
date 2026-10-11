-- subject: Migration 384 (lane DRIFT-1, 2026-10-10): reconciliation, a no-op on production. Makes a replay from the migration files produce the production-only objects the schema oracle reported (chain proof fire 9, run 38058989236, 562 differing objects): row level security on 11 tables, 5 constraints and 4 policies on the mig-009 capture tables, and the revoked PUBLIC execute on gate_a_health().
-- 384 -- schema oracle reconciliation: production-only objects (lane DRIFT-1, 2026-10-10).
--
-- APPLIED (production ledger version 20261011082720, as of 2026-10-11). Authored by lane DRIFT-1 with no database access; the coordinator's executor applies it (two-track policy, CLAUDE.md
-- standing rule 3: schema DDL applies via the Supabase CLI). IT CHANGES NOTHING ON PRODUCTION BY CONSTRUCTION: every statement is guarded by
-- a catalog check that finds the object already present there, and the self-check at the end reads the catalog and aborts the transaction if
-- an object is missing after the guards. The apply exists so the ledger and the files agree and so the chain proof's replay builds the same
-- objects production has.
--
-- WHY. Fire 9 was the first run of the schema oracle gate (scripts/proof/schema-diff.mjs): the replayed schema and a schema-only dump of
-- production differed in 562 objects (docs/ops/session-log.d/2026-10-10-drift1-schema-oracle.md has the classification). The objects below are
-- the class P rows: production has them and no migration file creates them (docs/inventories/out-of-band-objects.md names the policies and the
-- capture tables; migration 009 is capture-only and says its constraints are inferred).
--
-- WHAT THIS CREATES, each with the evidence for the production object it reproduces.
--   1. ENABLE ROW LEVEL SECURITY on 11 tables whose files never enable it: agent_run_searches, gate_a_health_cache, institutions,
--      intelligence_item_citations, intelligence_summaries, item_type_required_slots, section_claim_provenance, sector_contexts,
--      source_bias_tags, system_state, system_state_flag_audit. Evidence: AUD-AT-1 (docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md,
--      section 0) read production on 2026-10-08: 121 public tables, 0 with row level security off; the table rows of all 11 show an INSERT
--      refused by "rls" for the authenticated role. The oracle reported exactly these 11 tables as differing on the table's flags.
--   2. Five constraints on the mig-009 capture tables, named as production names them (the oracle reported them only on production):
--      intelligence_changes_item_id_fkey and intelligence_summaries_item_id_fkey, FOREIGN KEY (item_id) REFERENCES
--      public.intelligence_items(id) ON DELETE CASCADE (docs/archive/sprint-1/phase-2-dedup-plan.md line 55, "live pg_constraint
--      introspection ... CASCADE"); intelligence_changes_change_severity_check and intelligence_changes_change_type_check, the allowed values
--      in fsi-app/docs/inventories/db-check-constraints.json (live derived); intelligence_summaries_item_id_sector_key, UNIQUE (item_id,
--      sector), from the constraint name and migration 009's comment "Likely UNIQUE(item_id, sector)" ([HYPOTHESIS] on the columns; the
--      name is production's). Its unique index is the one index only production had.
--   3. Four policies. Three on intelligence_summaries in their final form: summaries_read_authenticated (SELECT, USING rewritten by migration 259),
--      summaries_write_service (INSERT, WITH CHECK by 259, narrowed TO authenticated, service_role by 381 part 2) and summaries_update_service
--      (UPDATE, USING by 259, narrowed by 381 part 2). The predicates are the ones 259 and 381 set by ALTER POLICY on production.
--      The fourth is sector_contexts_read_authenticated (SELECT, roles public), created because a later migration's precondition reads it (coordinator,
--      2026-10-10, SEC-9). Its BEHAVIOUR is [CONFIRMED: AUD-AT-1 line 195, production]: anon reads 0 rows through a policy that applies to it, authenticated
--      reads all 15 rows. Its predicate TEXT is in no file; it is written as the intelligence_summaries read policy's (authenticated or service_role),
--      which gives exactly that behaviour [HYPOTHESIS on the text: the service_role arm cannot be observed, the role bypasses RLS]. Fire 10's structural
--      record shows the token difference if the text differs.
--   4. REVOKE EXECUTE ON FUNCTION public.gate_a_health() FROM PUBLIC, the one function grant only the replay had (dashboard-created function,
--      docs/inventories/out-of-band-objects.md). [HYPOTHESIS] on the cause; the oracle shows production without the PUBLIC entry.
--
-- WHAT THIS DOES NOT DO (owed, [WORK: owed], needs the production text that no file holds; the executor reads it from pg_policies,
-- pg_attribute and pg_get_constraintdef in one query and the next lane writes it): the three other out-of-band policies (changes_read_authenticated,
-- changes_write_service, sector_contexts_write_service: their predicates are in no file, migration 381
-- says so), the intelligence_summaries_urgency_score_check constraint (its bounds are in no file), and the 7 columns whose type or default
-- differs (gate_a_health_cache.computed_at and singleton, intelligence_summaries.urgency_score, sector_contexts.cargo_types,
-- compliance_roles, transport_modes, urgency_weights). Nothing here guesses them.
--
-- No row is read, written, updated or deleted. Idempotent: a second apply changes nothing (the migration proof applies it twice).

BEGIN;

-- ---- 1. row level security on the 11 tables ---------------------------------------------------------------------------
DO $rls$
DECLARE
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'agent_run_searches', 'gate_a_health_cache', 'institutions', 'intelligence_item_citations', 'intelligence_summaries',
    'item_type_required_slots', 'section_claim_provenance', 'sector_contexts', 'source_bias_tags', 'system_state', 'system_state_flag_audit'
  ] LOOP
    IF to_regclass(format('public.%I', v_tbl)) IS NULL THEN
      RAISE EXCEPTION 'ABORT: migration 384 needs public.% (migrations 009, 016, 089, 092, 112, 122, 201, 256)', v_tbl;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
  END LOOP;
END $rls$;

-- ---- 2. the five constraints on the mig-009 capture tables, each only where production's name is absent -------------------
DO $con$
BEGIN
  IF to_regclass('public.intelligence_changes') IS NULL OR to_regclass('public.intelligence_summaries') IS NULL OR to_regclass('public.intelligence_items') IS NULL THEN
    RAISE EXCEPTION 'ABORT: migration 384 needs intelligence_changes, intelligence_summaries and intelligence_items (migrations 001 and 009)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.intelligence_changes'::regclass AND conname = 'intelligence_changes_item_id_fkey') THEN
    ALTER TABLE public.intelligence_changes ADD CONSTRAINT intelligence_changes_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES public.intelligence_items(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.intelligence_changes'::regclass AND conname = 'intelligence_changes_change_severity_check') THEN
    ALTER TABLE public.intelligence_changes ADD CONSTRAINT intelligence_changes_change_severity_check
      CHECK (change_severity IN ('critical', 'significant', 'minor', 'administrative'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.intelligence_changes'::regclass AND conname = 'intelligence_changes_change_type_check') THEN
    ALTER TABLE public.intelligence_changes ADD CONSTRAINT intelligence_changes_change_type_check
      CHECK (change_type IN ('new', 'status_change', 'deadline_change', 'scope_change', 'penalty_change', 'provision_added', 'provision_amended', 'administrative'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.intelligence_summaries'::regclass AND conname = 'intelligence_summaries_item_id_fkey') THEN
    ALTER TABLE public.intelligence_summaries ADD CONSTRAINT intelligence_summaries_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES public.intelligence_items(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.intelligence_summaries'::regclass AND conname = 'intelligence_summaries_item_id_sector_key') THEN
    ALTER TABLE public.intelligence_summaries ADD CONSTRAINT intelligence_summaries_item_id_sector_key UNIQUE (item_id, sector);
  END IF;
END $con$;

-- ---- 3. the three intelligence_summaries policies, final form (migration 259 predicates, migration 381 roles) -----------------
DO $pol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'intelligence_summaries' AND policyname = 'summaries_read_authenticated') THEN
    CREATE POLICY summaries_read_authenticated ON public.intelligence_summaries FOR SELECT TO public
      USING (((SELECT auth.role()) = 'authenticated') OR ((SELECT auth.role()) = 'service_role'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'intelligence_summaries' AND policyname = 'summaries_write_service') THEN
    CREATE POLICY summaries_write_service ON public.intelligence_summaries FOR INSERT TO authenticated, service_role
      WITH CHECK (((SELECT auth.role()) = 'service_role'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sector_contexts' AND policyname = 'sector_contexts_read_authenticated') THEN
    CREATE POLICY sector_contexts_read_authenticated ON public.sector_contexts FOR SELECT TO public
      USING (((SELECT auth.role()) = 'authenticated') OR ((SELECT auth.role()) = 'service_role'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'intelligence_summaries' AND policyname = 'summaries_update_service') THEN
    CREATE POLICY summaries_update_service ON public.intelligence_summaries FOR UPDATE TO authenticated, service_role
      USING (((SELECT auth.role()) = 'service_role'));
  END IF;
END $pol$;

-- ---- 4. gate_a_health(): no PUBLIC execute ------------------------------------------------------------------------------
DO $fn$
BEGIN
  IF to_regprocedure('public.gate_a_health()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.gate_a_health() FROM PUBLIC;
  END IF;
END $fn$;

-- ---- self-check: the catalog holds every object (read-only; a miss aborts and rolls the transaction back) --------------------
DO $check$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO v_missing FROM unnest(ARRAY[
    'agent_run_searches', 'gate_a_health_cache', 'institutions', 'intelligence_item_citations', 'intelligence_summaries',
    'item_type_required_slots', 'section_claim_provenance', 'sector_contexts', 'source_bias_tags', 'system_state', 'system_state_flag_audit'
  ]) AS t WHERE NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', t)));
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'ABORT: row level security is still off on: %', v_missing; END IF;

  SELECT string_agg(k, ', ') INTO v_missing FROM unnest(ARRAY[
    'intelligence_changes.intelligence_changes_item_id_fkey', 'intelligence_changes.intelligence_changes_change_severity_check',
    'intelligence_changes.intelligence_changes_change_type_check', 'intelligence_summaries.intelligence_summaries_item_id_fkey',
    'intelligence_summaries.intelligence_summaries_item_id_sector_key'
  ]) AS k WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.' || split_part(k, '.', 1)) AND c.conname = split_part(k, '.', 2)
  );
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'ABORT: constraint(s) missing: %', v_missing; END IF;

  SELECT string_agg(p, ', ') INTO v_missing FROM unnest(ARRAY['summaries_read_authenticated', 'summaries_write_service', 'summaries_update_service']) AS p
   WHERE NOT EXISTS (SELECT 1 FROM pg_policies x WHERE x.schemaname = 'public' AND x.tablename = 'intelligence_summaries' AND x.policyname = p);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'ABORT: policy(ies) missing: %', v_missing; END IF;
  IF (SELECT count(*) FROM pg_policies x WHERE x.schemaname = 'public' AND x.tablename = 'sector_contexts' AND x.policyname = 'sector_contexts_read_authenticated') = 0 THEN
    RAISE EXCEPTION 'ABORT: policy sector_contexts_read_authenticated missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure('public.gate_a_health()') AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.gate_a_health() still grants EXECUTE to PUBLIC';
  END IF;
  RAISE NOTICE 'migration 384 OK: 11 tables with row level security, 5 constraints, 4 policies, gate_a_health() without PUBLIC execute';
END $check$;

COMMIT;
