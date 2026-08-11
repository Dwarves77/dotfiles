-- 257 — reconciler SELECT policies: the three inert grants (2026-08-11).
--
-- FOUND BY rls-credential-parity's FIRST correctly-scored run (data-audit lane run #66 + the roles::text[]
-- harness fix shipped with it). The `reconciler` role — the bound credential migration 250 keeps as a
-- sanctioned writer of provenance_status='verified' — holds table-level SELECT grants on
-- intelligence_items, intelligence_item_sections, and sources, but NO covering SELECT policy on any of the
-- three. On an RLS-enabled table a grant without a policy is INERT (RLS denies by default), so the
-- reconciler credential could UPDATE intelligence_items (migration 169's policy) while being unable to
-- READ the rows it reconciles or the sources/sections it validates against — the migration-169 class,
-- three tables over.
--
-- Fix: the same shape as the five reconciler policies that already exist (agent_run_searches /
-- integrity_flags / item_type_required_slots / section_claim_provenance): PERMISSIVE SELECT, USING (true),
-- role-scoped. Read-only surface; grants are unchanged — this makes the grants the operator already issued
-- EFFECTIVE, it does not widen them.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reconciler') THEN
    RAISE EXCEPTION 'ABORT: role reconciler does not exist — this migration presupposes the mig-169/250 credential';
  END IF;
END $$;

DROP POLICY IF EXISTS intelligence_items_reconciler_select ON public.intelligence_items;
CREATE POLICY intelligence_items_reconciler_select
  ON public.intelligence_items FOR SELECT TO reconciler USING (true);

DROP POLICY IF EXISTS intelligence_item_sections_reconciler_select ON public.intelligence_item_sections;
CREATE POLICY intelligence_item_sections_reconciler_select
  ON public.intelligence_item_sections FOR SELECT TO reconciler USING (true);

DROP POLICY IF EXISTS sources_reconciler_select ON public.sources;
CREATE POLICY sources_reconciler_select
  ON public.sources FOR SELECT TO reconciler USING (true);

-- Post-check: every reconciler table-level grant on an RLS table is now covered by a permissive policy
-- for its command — the exact predicate rls-credential-parity audits.
DO $$
DECLARE
  gap record;
  n int := 0;
BEGIN
  FOR gap IN
    SELECT g.table_name, g.privilege_type
    FROM information_schema.role_table_grants g
    JOIN pg_class c ON c.relname = g.table_name
    JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
    WHERE g.table_schema = 'public' AND g.grantee = 'reconciler'
      AND g.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
      AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = g.table_name
          AND p.permissive = 'PERMISSIVE'
          AND (p.cmd = 'ALL' OR p.cmd = g.privilege_type)
          AND (p.roles @> ARRAY['reconciler']::name[] OR p.roles @> ARRAY['public']::name[])
      )
  LOOP
    RAISE NOTICE 'STILL UNCOVERED: % %', gap.table_name, gap.privilege_type;
    n := n + 1;
  END LOOP;
  IF n > 0 THEN
    RAISE EXCEPTION 'POST-CHECK ABORT: % reconciler grant(s) still lack a covering policy', n;
  END IF;
  RAISE NOTICE 'OK: every reconciler grant on an RLS table is backed by a covering policy';
END $$;
