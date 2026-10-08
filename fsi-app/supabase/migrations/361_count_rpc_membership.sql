-- subject: Migration 361 (lane S8-C, 2026-10-07, buildout plan Stage 8): the two count RPCs of migration 148, `get_surface_counts(p_org_id, p_surface)` and `get_all_surface_counts(p_org_id)`, gain the organisation membership gate that migration 077 gave the ten page RPCs and never gave these two (148 post-dates 077); both are SECURITY DEFINER and answered any caller for any org id, folding that org's priority and archive overrides into the tally; the gate is `_assert_org_membership` (service role bypasses; a NULL org on get_surface_counts, the public masthead path of PERF-10, is service role only); the search_path pin of migration 160 is kept; the self-check attacks both functions under simulated JWT claims inside a rolled-back sub-transaction; APPLIED (production ledger version 20261008010426, as of 2026-10-08).
-- 361 -- membership gate on the two count RPCs (lane S8-C, 2026-10-07).
--
-- APPLIED (production ledger version 20261008010426, as of 2026-10-08). Authored by lane S8-C; the coordinator applies it (two-track policy, CLAUDE.md standing rule 3: schema
-- DDL applies via the Supabase CLI). Requires migration 077 (public._assert_org_membership) and migration 148
-- (get_surface_counts, get_all_surface_counts, surface_of). Reversible: re-run the two function bodies of migration 148
-- (LANGUAGE sql, no gate) and `ALTER FUNCTION ... SET search_path = public, extensions, pg_temp` per migration 160.
--
-- WHY. Migration 077 closed the "any p_org_id, no auth.uid() check" hole on the ten page RPCs it listed. Migration
-- 148 (count integrity, written after 077) added two more SECURITY DEFINER functions taking p_org_id as plain LANGUAGE
-- sql with no gate. Confirmed by reading both files: 077 names ten functions and neither of these is among them; 148
-- contains no call to _assert_org_membership and no auth.uid(); no later migration redefines either (the only later
-- mentions are 149 and 269 in prose and 160's ALTER ... SET search_path). src/lib/data.ts (PERF-10) already records the
-- same fact, read live by pg_get_functiondef. Both functions grant EXECUTE to PUBLIC by default (148 grants nothing), so
-- any signed-in user, or the anon key, could call them through PostgREST with another organisation's id. What leaks is
-- that organisation's workspace_item_overrides folded into the tally: by_priority (priority_override) and the active /
-- archived population (is_archived), a soft confidentiality leak of the kind 077 was written to close.
--
-- THE GATE. Reuses public._assert_org_membership(p_org_id) from 077, byte for byte the same gate the ten page RPCs use:
-- it raises 42501 for a non-member and for a caller with no auth.uid(), and the service role bypasses it (every app
-- caller reads these through getServiceSupabase: fetchSurfaceCounts / fetchPublicSurfaceCounts in supabase-server.ts,
-- fetchIntelligenceCountsViaRpc in dashboard/surface-coverage.ts, the health surfaces probe). It refuses by RAISE, not by
-- returning an empty bundle, because a zero bundle is a plausible count and would be rendered as one.
--   - get_all_surface_counts(p_org_id): gate is the first statement. A NULL org raises 22023 (077 semantics); no caller
--     passes NULL (surface-coverage returns EMPTY_SNAPSHOT before the call when there is no org).
--   - get_surface_counts(p_org_id, p_surface): one extra rule. getPublicSurfaceCounts (PERF-10, ADR-026) passes a NULL org
--     on purpose to read the platform-wide masthead count with no override overlay; the 077 helper would raise on NULL even
--     for the service role and break /regulations, /market, /operations and /research. So a NULL org is allowed for the
--     service role only (that is the intended caller), and refused with 42501 for everyone else; a non-NULL org goes
--     through the 077 helper. The platform-wide NULL read carries no tenant data but the public path is server-side only,
--     so closing it to client roles costs nothing.
--
-- LANGUAGE. The 148 bodies are LANGUAGE sql, which cannot run a gate before its query; 077 made the same change for its
-- ten (sql to plpgsql, body otherwise unchanged). The counting SQL below is the 148 text unchanged (verified gate,
-- surface_of single source of truth, one override LEFT JOIN, five zero-filled buckets); only the wrapper changes.
-- CREATE OR REPLACE resets function-level settings, so SET search_path = public, extensions, pg_temp (migration 160's pin)
-- is restated; without it the advisor lint function_search_path_mutable would return for these two. Grants are untouched.
--
-- SELF-CHECK (standing rule 15: a guard is proven by attack, not by presence). A rolled-back sub-transaction simulates
-- JWT claims (set_config('request.jwt.claims', ..., true), local to the transaction) and attacks BOTH functions:
--   refused (insufficient_privilege): a random user against a random org; an unauthenticated caller; an authenticated
--   caller with a NULL org (get_surface_counts); a real member against an org they do not belong to (when one exists).
--   accepted: the service role with a random org and with a NULL org; a real member against their own org.
-- No fixture rows are written (migration 311's inline proof inserted org_memberships rows, hit the profiles foreign key
-- and was unappliable); the member cases read a live org_memberships row and self-skip with a NOTICE when there is none.
-- A refusal that does not happen aborts the migration. Everything inside the sub-block is rolled back.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = '_assert_org_membership') THEN
    RAISE EXCEPTION 'ABORT: public._assert_org_membership is missing (migration 077 not applied)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'get_surface_counts') THEN
    RAISE EXCEPTION 'ABORT: public.get_surface_counts is missing (migration 148 not applied)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'get_all_surface_counts') THEN
    RAISE EXCEPTION 'ABORT: public.get_all_surface_counts is missing (migration 148 not applied)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_surface_counts(org, surface): the 148 body behind the membership gate.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_surface_counts(p_org_id uuid, p_surface text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF p_org_id IS NULL THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'org_id is required' USING ERRCODE = '42501';
    END IF;
  ELSE
    PERFORM public._assert_org_membership(p_org_id);
  END IF;

  WITH scope AS (
    SELECT
      ii.id,
      ii.status,
      ii.jurisdictions,
      ii.updated_at,
      ii.severity,
      ii.signal_band,
      COALESCE(wo.priority_override, ii.priority) AS effective_priority
    FROM intelligence_items ii
    LEFT JOIN workspace_item_overrides wo
      ON  wo.item_id = ii.id
      AND wo.org_id  = p_org_id
    WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
      AND ii.provenance_status = 'verified'
      AND surface_of(ii.item_type, ii.domain) = p_surface
  ),
  by_priority AS (
    SELECT effective_priority AS k, COUNT(*)::int AS v FROM scope
    WHERE effective_priority IS NOT NULL GROUP BY effective_priority
  ),
  by_severity AS (
    SELECT severity AS k, COUNT(*)::int AS v FROM scope
    WHERE severity IS NOT NULL GROUP BY severity
  ),
  by_band AS (
    SELECT signal_band AS k, COUNT(*)::int AS v FROM scope
    WHERE signal_band IS NOT NULL GROUP BY signal_band
  ),
  by_status AS (
    SELECT status AS k, COUNT(*)::int AS v FROM scope
    WHERE status IS NOT NULL GROUP BY status
  ),
  juris_unnest AS (
    SELECT NULLIF(TRIM(j), '') AS jurisdiction
    FROM scope LEFT JOIN LATERAL unnest(scope.jurisdictions) AS j ON TRUE
  ),
  by_jurisdiction AS (
    SELECT jurisdiction AS k, COUNT(*)::int AS v FROM juris_unnest
    WHERE jurisdiction IS NOT NULL GROUP BY jurisdiction
  )
  SELECT jsonb_build_object(
    'surface',             p_surface,
    'total_items',         (SELECT COUNT(*)::int FROM scope),
    'by_priority',         COALESCE((SELECT jsonb_object_agg(k, v) FROM by_priority), '{}'::jsonb),
    'by_severity',         COALESCE((SELECT jsonb_object_agg(k, v) FROM by_severity), '{}'::jsonb),
    'by_band',             COALESCE((SELECT jsonb_object_agg(k, v) FROM by_band), '{}'::jsonb),
    'by_status',           COALESCE((SELECT jsonb_object_agg(k, v) FROM by_status), '{}'::jsonb),
    'by_jurisdiction',     COALESCE((SELECT jsonb_object_agg(k, v) FROM by_jurisdiction), '{}'::jsonb),
    'total_jurisdictions', (SELECT COUNT(DISTINCT jurisdiction)::int FROM juris_unnest WHERE jurisdiction IS NOT NULL),
    'last_updated_at',     (SELECT MAX(updated_at) FROM scope)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.get_surface_counts(uuid, text) IS
  'Verified-population count bundle for ONE customer surface (regulations/market/operations/research/uncategorized). Gates provenance_status=verified (ruling 1). total_items = distinct verified items (header); by_priority/by_severity/by_band = label instances (cards). Override overlay applied as one LEFT JOIN. Membership gate (migration 361): _assert_org_membership(p_org_id) raises 42501 for a non-member or an unauthenticated caller; the service role bypasses; a NULL org (public platform-wide masthead read, PERF-10) is service role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- get_all_surface_counts(org): the 148 body behind the membership gate.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_all_surface_counts(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._assert_org_membership(p_org_id);

  WITH scope AS (
    SELECT
      surface_of(ii.item_type, ii.domain) AS surface,
      (ii.provenance_status = 'verified')  AS is_verified
    FROM intelligence_items ii
    LEFT JOIN workspace_item_overrides wo
      ON  wo.item_id = ii.id
      AND wo.org_id  = p_org_id
    WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
  ),
  per_surface AS (
    SELECT surface,
           COUNT(*) FILTER (WHERE is_verified)::int AS verified,
           COUNT(*)::int                           AS total
    FROM scope
    GROUP BY surface
  ),
  surfaces(s) AS (
    VALUES ('regulations'), ('market'), ('operations'), ('research'), ('uncategorized')
  ),
  filled AS (
    SELECT surfaces.s AS surface,
           COALESCE(ps.verified, 0) AS verified,
           COALESCE(ps.total, 0)    AS total
    FROM surfaces
    LEFT JOIN per_surface ps ON ps.surface = surfaces.s
  )
  SELECT
    jsonb_object_agg(
      filled.surface,
      jsonb_build_object('verified', filled.verified, 'total', filled.total)
    )
    || jsonb_build_object(
         'total',
         jsonb_build_object(
           'verified', (SELECT COALESCE(SUM(verified), 0)::int FROM filled),
           'total',    (SELECT COALESCE(SUM(total), 0)::int    FROM filled)
         )
       )
  INTO v_result
  FROM filled;

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.get_all_surface_counts(uuid) IS
  'One-scan {verified,total} per customer surface + grand total, for the dashboard rail. Active rows with the workspace override overlay applied. Customer rail consumes .verified (ruling 1); admin rail renders both. uncategorized is a defect signal (binding 4), never a customer surface. Membership gate (migration 361): _assert_org_membership(p_org_id) raises for a non-member, an unauthenticated caller or a NULL org; the service role bypasses a membership check.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Self-check: structure, then the attack.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n         int;
  v_stranger  uuid := gen_random_uuid();
  v_org_x     uuid := gen_random_uuid();
  v_member_org  uuid;
  v_member_user uuid;
  v_other_org   uuid;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('get_surface_counts', 'get_all_surface_counts')
     AND p.prosecdef AND p.provolatile = 's' AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
     AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'ABORT: expected both count RPCs plpgsql STABLE SECURITY DEFINER with a pinned search_path, found %', v_n;
  END IF;

  SELECT om.org_id, om.user_id INTO v_member_org, v_member_user
    FROM public.org_memberships om ORDER BY om.created_at LIMIT 1;
  IF v_member_org IS NOT NULL THEN
    SELECT o.id INTO v_other_org FROM public.organizations o
     WHERE NOT EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.org_id = o.id AND m.user_id = v_member_user)
     LIMIT 1;
  END IF;

  BEGIN
    -- 1. A non-member (random user, random org) is refused by both.
    PERFORM set_config('request.jwt.claim.role', '', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    BEGIN
      PERFORM public.get_surface_counts(v_org_x, 'research');
      RAISE EXCEPTION 'ABORT: get_surface_counts answered a non-member';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.get_all_surface_counts(v_org_x);
      RAISE EXCEPTION 'ABORT: get_all_surface_counts answered a non-member';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- 2. An authenticated caller with a NULL org is refused by get_surface_counts.
    BEGIN
      PERFORM public.get_surface_counts(NULL, 'research');
      RAISE EXCEPTION 'ABORT: get_surface_counts answered an authenticated caller with a NULL org';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- 3. An unauthenticated caller (no sub, no role) is refused by both.
    PERFORM set_config('request.jwt.claims', '{}', true);
    BEGIN
      PERFORM public.get_surface_counts(v_org_x, 'research');
      RAISE EXCEPTION 'ABORT: get_surface_counts answered an unauthenticated caller';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.get_all_surface_counts(v_org_x);
      RAISE EXCEPTION 'ABORT: get_all_surface_counts answered an unauthenticated caller';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- 4. The service role is accepted, with a random org and (get_surface_counts only) with a NULL org.
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    BEGIN
      PERFORM public.get_surface_counts(v_org_x, 'research');
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'ABORT: get_surface_counts refused the service role';
    END;
    BEGIN
      PERFORM public.get_surface_counts(NULL, 'research');
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'ABORT: get_surface_counts refused the service role with a NULL org';
    END;
    BEGIN
      PERFORM public.get_all_surface_counts(v_org_x);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'ABORT: get_all_surface_counts refused the service role';
    END;

    -- 5. A real member (read from a live row, never fabricated) is accepted on their own org and refused on another.
    IF v_member_org IS NULL THEN
      RAISE NOTICE 'SKIP: no live org_memberships row to impersonate for the member cases (accepted on own org, refused on another)';
    ELSE
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_user, 'role', 'authenticated')::text, true);
      BEGIN
        PERFORM public.get_surface_counts(v_member_org, 'research');
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION 'ABORT: get_surface_counts refused a real member';
      END;
      BEGIN
        PERFORM public.get_all_surface_counts(v_member_org);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION 'ABORT: get_all_surface_counts refused a real member';
      END;
      IF v_other_org IS NULL THEN
        RAISE NOTICE 'SKIP: no second organisation to attack the member against';
      ELSE
        BEGIN
          PERFORM public.get_surface_counts(v_other_org, 'research');
          RAISE EXCEPTION 'ABORT: get_surface_counts answered a member of a different org';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        BEGIN
          PERFORM public.get_all_surface_counts(v_other_org);
          RAISE EXCEPTION 'ABORT: get_all_surface_counts answered a member of a different org';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END IF;
    END IF;

    RAISE EXCEPTION 'g361_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'g361_selfcheck_rollback' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'migration 361 OK: both count RPCs plpgsql STABLE SECURITY DEFINER with a pinned search_path; attack held (non-member, unauthenticated and authenticated NULL-org refused; service role accepted; member cases % )',
    CASE WHEN v_member_org IS NULL THEN 'skipped, no live membership' ELSE 'run' END;
END $$;

COMMIT;
