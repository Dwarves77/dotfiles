-- 262 — complete the RLS InitPlan sweep migration 259 started (2026-08-12).
--
-- WHAT AND WHY. A Supabase performance advisor run on 2026-08-12 reported 143 `auth_rls_initplan`
-- findings: RLS policies calling auth.uid() / auth.role() UNWRAPPED, which Postgres re-evaluates ONCE
-- PER ROW instead of once per query. On a table the size of intelligence_items that is the dominant
-- cost in the 1.3-2.5s query times observed in production. The documented fix is to wrap the call in
-- `(select ...)`, which turns it into an InitPlan evaluated a single time.
--
-- Migration 259 fixed the 8 tables on the evidence trail of the specific slow pages, taking the count
-- 143 -> 109. This migration finishes the remaining 109 policies across 43 tables, mostly community_*
-- plus org_invitations, moderation_reports, notification_preferences and profiles.
--
-- SEMANTICS-PRESERVING. Wrapping a function call in a scalar subquery changes WHEN it is evaluated, not
-- WHAT it returns. Same logic, same access outcome, per role, in every case.
--
-- WHY A LOOP RATHER THAN 109 WRITTEN-OUT STATEMENTS. Hand-transcribing 109 security policy expressions
-- is a typo waiting to happen, and a typo in an RLS predicate fails SILENTLY in the dangerous direction:
-- either a user sees nothing, or a user sees rows they should not. The loop reads each policy's LIVE
-- definition from pg_policies and rewrites only the two exact tokens, leaving every other character of
-- the expression untouched, including calls to helper functions like user_belongs_to_org(). There is no
-- opportunity for a hand-edit to alter the logic.
--
-- SAFETY PROPERTIES:
--   * Only policies that ALREADY contain an unwrapped auth call are touched. The WHERE clause excludes
--     anything already wrapped, so re-running is a no-op rather than a double-wrap.
--   * USING is emitted only when qual IS NOT NULL and WITH CHECK only when with_check IS NOT NULL.
--     An INSERT policy has no qual, and emitting a USING clause for one is an error, not a nuisance.
--   * Role lists are never touched. This migration changes evaluation timing only, never who a policy
--     applies to. (259 did narrow one role list, deliberately and separately.)
--   * The post-check RAISEs if any unwrapped call survives, so a cursor-visibility miss cannot pass
--     silently as success.

DO $$
DECLARE
  p          record;
  new_qual   text;
  new_check  text;
  stmt       text;
  n          int := 0;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '')       LIKE '%auth.uid()%'
        OR coalesce(qual, '')       LIKE '%auth.role()%'
        OR coalesce(with_check, '') LIKE '%auth.uid()%'
        OR coalesce(with_check, '') LIKE '%auth.role()%')
      AND NOT (coalesce(qual, '')       LIKE '%SELECT auth.%'
            OR coalesce(with_check, '') LIKE '%SELECT auth.%')
    ORDER BY tablename, policyname
  LOOP
    new_qual  := replace(replace(p.qual,       'auth.uid()', '(select auth.uid())'),
                                              'auth.role()', '(select auth.role())');
    new_check := replace(replace(p.with_check, 'auth.uid()', '(select auth.uid())'),
                                              'auth.role()', '(select auth.role())');

    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF p.qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF p.with_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'migration 262: rewrote % policies', n;
END $$;

-- Post-check. A cursor iterating pg_policies while those policies are being altered is exactly the kind
-- of thing that can quietly skip rows, so success is asserted against a fresh read rather than assumed
-- from the loop counter.
DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual, '')       LIKE '%auth.uid()%'
      OR coalesce(qual, '')       LIKE '%auth.role()%'
      OR coalesce(with_check, '') LIKE '%auth.uid()%'
      OR coalesce(with_check, '') LIKE '%auth.role()%')
    AND NOT (coalesce(qual, '')       LIKE '%SELECT auth.%'
          OR coalesce(with_check, '') LIKE '%SELECT auth.%');

  IF remaining > 0 THEN
    RAISE EXCEPTION 'ABORT: % policies still carry an unwrapped auth call after the sweep', remaining;
  END IF;

  RAISE NOTICE 'migration 262 OK: zero unwrapped auth calls remain in schema public';
END $$;
