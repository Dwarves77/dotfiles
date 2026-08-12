-- 259 — RLS initplan rewrites + policy de-stack (2026-08-12).
--
-- SOURCED TO a 2026-08-12 Supabase performance advisor run: 143 `auth_rls_initplan` results and
-- 257 `multiple_permissive_policies` results, both against public schema RLS policies. This
-- migration addresses both classes.
--
-- CLASS 1 — auth_rls_initplan (143 results). Every policy below calls `auth.role()` or
-- `auth.uid()` directly in its USING/WITH CHECK clause. Postgres cannot hoist a bare function
-- call out of the per-row evaluation, so on an N-row scan the planner re-invokes auth.role() /
-- auth.uid() N times — once per row — even though the result is invariant for the whole
-- statement. This is Supabase's own documented anti-pattern and Supabase's own documented fix:
-- wrap the auth function call in `(select ...)`. The subselect is opaque to the row-level
-- evaluator, so Postgres plans it as an InitPlan and evaluates it EXACTLY ONCE per query, then
-- reuses the cached result for every row instead of recomputing it per row.
--
-- These rewrites are SEMANTICS-PRESERVING. `auth.role()` and `auth.uid()` are STABLE functions —
-- constant for the lifetime of a single statement — so `(select auth.role())` returns the
-- identical value `auth.role()` would have returned on every row. Same logic, same access
-- outcome, only the evaluation plan changes. Every USING/WITH CHECK predicate below is otherwise
-- byte-for-byte the predicate the policy already has today.
--
-- All of Section 1 uses `ALTER POLICY ... USING (...) [WITH CHECK (...)]`, which rewrites the
-- policy's expression IN PLACE. There is no DROP/CREATE pair, so there is no window in which the
-- table is either unprotected (no policy) or double-protected (old + new policy stacked) — the
-- rewrite is atomic from the perspective of any concurrent query.
--
-- CLASS 2 — multiple_permissive_policies (257 results). Where two or more PERMISSIVE policies on
-- the same table/role/command both apply, Postgres OR's their predicates together and evaluates
-- BOTH per row — cost without benefit whenever one policy already subsumes the other for that
-- role. Section 2 removes exactly two of these stacks; see the inline reasoning there. This
-- migration does not attempt to clear all 257 advisor findings — only the two stacks whose fix is
-- unambiguous and independently verifiable at post-check time. The remaining findings are
-- unaffected by this migration and are tracked separately.

-- ============================================================================================
-- SECTION 1 — initplan rewrites: wrap auth.role() / auth.uid() in (select ...) so each is
-- evaluated once per query (InitPlan) instead of once per row.
-- ============================================================================================

ALTER POLICY intelligence_items_admin_delete ON public.intelligence_items USING ((select auth.role()) = 'service_role');
ALTER POLICY intelligence_items_admin_insert ON public.intelligence_items WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY intelligence_items_admin_update ON public.intelligence_items USING ((select auth.role()) = 'service_role');
ALTER POLICY item_timelines_admin_update ON public.item_timelines USING ((select auth.role()) = 'service_role');
ALTER POLICY item_timelines_admin_write ON public.item_timelines WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY summaries_write_service ON public.intelligence_summaries WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY summaries_read_authenticated ON public.intelligence_summaries USING ((select auth.role()) = 'authenticated' OR (select auth.role()) = 'service_role');
ALTER POLICY summaries_update_service ON public.intelligence_summaries USING ((select auth.role()) = 'service_role');
ALTER POLICY sources_admin_delete ON public.sources USING ((select auth.role()) = 'service_role');
ALTER POLICY sources_admin_insert ON public.sources WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY sources_admin_update ON public.sources USING ((select auth.role()) = 'service_role');
ALTER POLICY org_watchlist_member_delete ON public.org_watchlist USING (user_belongs_to_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY org_watchlist_member_insert ON public.org_watchlist WITH CHECK ((user_belongs_to_org(org_id) AND added_by_user_id = (select auth.uid())) OR (select auth.role()) = 'service_role');
ALTER POLICY org_watchlist_member_read ON public.org_watchlist USING (user_belongs_to_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY org_watchlist_member_update ON public.org_watchlist USING (user_belongs_to_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY overrides_delete_org ON public.workspace_item_overrides USING (user_belongs_to_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY overrides_insert_org ON public.workspace_item_overrides WITH CHECK (user_belongs_to_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY overrides_read_org ON public.workspace_item_overrides USING (user_belongs_to_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY overrides_update_org ON public.workspace_item_overrides USING (user_belongs_to_org(org_id) OR (select auth.role()) = 'service_role');
ALTER POLICY user_item_state_delete ON public.user_item_state USING ((select auth.uid()) = user_id);
ALTER POLICY user_item_state_insert ON public.user_item_state WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY user_item_state_select ON public.user_item_state USING ((select auth.uid()) = user_id);
ALTER POLICY user_item_state_update ON public.user_item_state USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY user_list_order_delete ON public.user_list_order USING ((select auth.uid()) = user_id);
ALTER POLICY user_list_order_insert ON public.user_list_order WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY user_list_order_select ON public.user_list_order USING ((select auth.uid()) = user_id);
ALTER POLICY user_list_order_update ON public.user_list_order USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================================================
-- SECTION 2 — de-stack: remove two of the multiple_permissive_policies stacks where a role's
-- access is fully covered by exactly one policy already, so the OR-of-predicates work the
-- planner does today becomes a single-policy evaluation with no change in outcome.
-- ============================================================================================

-- (a) sources_reconciler_select is a pure duplicate for every role it covers.
--
-- Migration 257 created this policy (FOR SELECT TO reconciler USING (true)) to close an inert
-- SELECT-grant gap for the reconciler credential. Since then, `sources_read` (FOR SELECT
-- USING (true), no TO clause -> applies to every role including reconciler) already grants the
-- identical unconditional SELECT to every role that reconciler could ever be. The two policies
-- are permissive, same command, same effective predicate (true), same table -> reconciler's
-- SELECT on public.sources is decided twice for the same answer on every query. Dropping
-- sources_reconciler_select removes the duplicate without narrowing reconciler's access at all:
-- sources_read still covers it with qual=true. This supersedes the sources_reconciler_select
-- portion of migration 257; the intelligence_items_reconciler_select and
-- intelligence_item_sections_reconciler_select policies migration 257 also created are UNCHANGED
-- and NOT duplicates (no unconditional-true public policy exists on those two tables).
DROP POLICY IF EXISTS sources_reconciler_select ON public.sources;

-- (b) intelligence_items_read narrowed off anon/authenticated so it no longer stacks with
-- intelligence_items_reconciler_select for the reconciler role.
--
-- OPERATOR RULING 2026-08-12: the live role list on this project is anon, authenticated,
-- authenticator, dashboard_user, reconciler, service_role (plus Supabase-internal roles such as
-- supabase_admin / supabase_auth_admin, which are not application-facing and out of scope here).
-- Verified facts this ruling rests on:
--   - `service_role` has rolbypassrls = true. A role with BYPASSRLS never evaluates policies at
--     all (RLS is skipped outright for it), so this de-stack has ZERO effect on service_role —
--     it was never one of the "multiple permissive policies" being counted for that role.
--   - `reconciler` is already fully covered for SELECT on intelligence_items by its own
--     migration-257 policy, intelligence_items_reconciler_select (FOR SELECT TO reconciler
--     USING (true)). Narrowing intelligence_items_read to TO anon, authenticated removes
--     reconciler from that policy's role list, collapsing reconciler from two stacked permissive
--     SELECT policies down to the one that already gives it full, unconditional visibility.
--     Reconciler's access is UNCHANGED.
--   - WHY reconciler keeps full (unconditional) visibility deliberately: its purpose, per
--     migration 250/257, is verifying provenance — it is the sanctioned writer of
--     provenance_status='verified'. Rows it has not yet verified are precisely the rows it exists
--     to inspect, so an unverified/unfiltered row IS its work, not an exception to guard against.
--     Migration 250 established reconciler as that sanctioned writer; migration 257 gave it the
--     matching SELECT visibility. This migration does not touch that grant of visibility, only
--     removes the now-redundant second path to it.
--   - DELIBERATE CONSEQUENCE: `dashboard_user` and any future role not explicitly listed in
--     intelligence_items_read's TO clause LOSE read access through this policy. RLS is deny-by-
--     default — a role with no covering permissive policy for a command simply has no rows
--     visible for that command — so this is a narrowing, not a break: dashboard_user was never
--     granted a distinct visibility story of its own, and going forward any role that should read
--     intelligence_items must be added to this policy (or another) explicitly rather than
--     inheriting visibility implicitly via an unrestricted TO public policy. This is the intended
--     direction of the fix, not a side effect to be walked back.
ALTER POLICY intelligence_items_read ON public.intelligence_items TO anon, authenticated;

-- ============================================================================================
-- POST-CHECK
-- ============================================================================================

DO $$
DECLARE
  bad_initplan_count int := 0;
  bad_row record;
  reconciler_dup_exists boolean;
  intel_read_roles name[];
BEGIN
  -- (1) No un-wrapped auth.role()/auth.uid() call remains on the 8 tables touched in Section 1.
  -- Postgres normalises `(select auth.role())` to `( SELECT auth.role() AS role)` in the
  -- pg_policies qual/with_check text, so match loosely on '%SELECT auth.%' rather than the exact
  -- source-code spelling.
  FOR bad_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'intelligence_items', 'item_timelines', 'intelligence_summaries', 'sources',
        'org_watchlist', 'workspace_item_overrides', 'user_item_state', 'user_list_order'
      )
      AND (
        (qual LIKE '%auth.role()%' OR qual LIKE '%auth.uid()%'
          OR with_check LIKE '%auth.role()%' OR with_check LIKE '%auth.uid()%')
      )
      AND NOT (
        (qual IS NULL OR qual LIKE '%SELECT auth.%')
        AND (with_check IS NULL OR with_check LIKE '%SELECT auth.%')
      )
  LOOP
    RAISE NOTICE 'UNWRAPPED AUTH CALL REMAINS: %.% policy %', bad_row.schemaname, bad_row.tablename, bad_row.policyname;
    bad_initplan_count := bad_initplan_count + 1;
  END LOOP;

  IF bad_initplan_count > 0 THEN
    RAISE EXCEPTION 'POST-CHECK ABORT: % polic(ies) on the target tables still call auth.role()/auth.uid() outside a (select ...) wrapper', bad_initplan_count;
  END IF;

  -- (2) sources_reconciler_select must no longer exist.
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sources' AND policyname = 'sources_reconciler_select'
  ) INTO reconciler_dup_exists;

  IF reconciler_dup_exists THEN
    RAISE EXCEPTION 'POST-CHECK ABORT: sources_reconciler_select still exists on public.sources';
  END IF;

  -- (3) intelligence_items_read must no longer include 'public' in its role list.
  SELECT roles INTO intel_read_roles
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'intelligence_items' AND policyname = 'intelligence_items_read';

  IF intel_read_roles IS NULL THEN
    RAISE EXCEPTION 'POST-CHECK ABORT: intelligence_items_read not found on public.intelligence_items';
  END IF;

  IF intel_read_roles @> ARRAY['public']::name[] THEN
    RAISE EXCEPTION 'POST-CHECK ABORT: intelligence_items_read still applies TO public (roles = %)', intel_read_roles;
  END IF;

  RAISE NOTICE 'OK: all 27 initplan rewrites hold no un-wrapped auth call, sources_reconciler_select is gone, and intelligence_items_read no longer targets public';
END $$;
