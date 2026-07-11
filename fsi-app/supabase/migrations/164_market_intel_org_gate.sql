-- Migration 164 (Wave-α Track B1) — restore the org-membership gate on get_market_intel_items
--
-- AUTHOR-ONLY / OPERATOR DDL WINDOW (RLS/RPC-authorization change = break-risky class, ADR-011).
-- Authored, apply via the DDL protocol — DO NOT apply inline.
--
-- WHY (master-gap-register P1 #1; CODE-5b F1; X headline 1; DB-3 verified live):
--   Migration 077 (Workstream C) added `_assert_org_membership(p_org_id)` to ALL TEN page-data RPCs so a
--   SECURITY DEFINER function could not return one org's overlay to a non-member. Migration 108 later
--   DROP+CREATE'd get_market_intel_items to widen the return shape (signal_band + trajectory_points) and
--   — because 108 rewrote the body as plain `LANGUAGE sql` — SILENTLY DROPPED the `_assert_org_membership`
--   call that 077 had installed. Every later revision (the provenance_status='verified' gate + the
--   what_it_changes/conversion_trigger/cross_references columns + item_type IN ('market_signal','initiative'))
--   inherited the gate-less body. Live `pg_get_functiondef` (2026-07-11) confirms: NO membership assert.
--   Result: any authenticated user calling the RPC with a foreign p_org_id reads that org's
--   workspace_item_overrides overlay (priority_override / is_archived). Masked today only by single-tenancy.
--
--   Its nine sibling RPCs (get_research_items, get_operations_items, the workspace_intelligence family)
--   still carry the 077 assert — this migration brings get_market_intel_items back into line with them.
--
-- FIX:
--   1. Re-add `PERFORM public._assert_org_membership(p_org_id)` (service_role bypasses; non-member RAISEs
--      42501). The function must become `LANGUAGE plpgsql` to host the PERFORM — exactly the pattern 077
--      used for the sibling RPCs (RETURN QUERY, STABLE SECURITY DEFINER preserved). The PostgREST-facing
--      contract (name, arg, return shape) is UNCHANGED — the live 33-column return shape is reproduced
--      byte-for-byte from `pg_get_functiondef`, so no consumer recompiles.
--   2. Add deterministic `, ii.id ASC` as the final ORDER BY key so equal-priority / equal-date rows have
--      a stable order (matches the sibling RPCs, which already tie-break on id).
--
--   Everything else in the LIVE body is preserved verbatim: the verified gate, the item_type filter, the
--   what_it_changes/conversion_trigger/cross_references columns, the effective_priority/archived overlay,
--   and `SET search_path`.
--
-- POST-APPLY PROOF (run in the window; see track-b-proofs.md B1):
--   * As the Jason auth user vs the home org  -> rows returned (member path OK).
--   * As the Jason auth user vs a fake org_id -> ERROR 42501 'Not a member of org ...'.
--   * As service_role vs the fake org         -> 0 rows, NO exception (service bypasses).
--   * pg_get_functiondef shows `PERFORM public._assert_org_membership` + `LANGUAGE plpgsql` + `ii.id ASC`.
--   * NOTIFY pgrst, 'reload schema'.
-- Reversible: rollbacks/164_market_intel_org_gate_rollback.sql restores the live gate-less SQL body.

BEGIN;

DROP FUNCTION IF EXISTS public.get_market_intel_items(uuid);

CREATE FUNCTION public.get_market_intel_items(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, summary text, what_is_it text,
   why_matters text, key_data text[], tags text[], domain integer, category text,
   item_type text, source_id uuid, source_url text, jurisdictions text[],
   transport_modes text[], verticals text[], status text, severity text,
   signal_band text, trajectory_points jsonb, confidence text, priority text,
   entry_into_force date, compliance_deadline date, next_review_date date,
   added_date date, last_verified timestamp with time zone, is_archived boolean,
   what_it_changes text, conversion_trigger text, cross_references text,
   effective_priority text, effective_archived boolean
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.signal_band,
    ii.trajectory_points,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    ii.what_it_changes,
    ii.conversion_trigger,
    ii.cross_references,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM public.intelligence_items ii
  JOIN public.sources s ON s.id = ii.source_id
  LEFT JOIN public.workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified'
    AND ii.item_type IN ('market_signal', 'initiative')
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_market_intel_items(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_market_intel_items(uuid) IS
  'Phase 1 routing: intelligence_items routed to /market (market_signal, initiative), verified-only. Wave-a Track B1 (2026-07-11): restored the _assert_org_membership gate that migration 108 silently dropped + deterministic id ASC tie-break. Membership-scoped (non-member RAISE 42501); service_role bypasses. See migration 077 for the gate rationale.';

COMMIT;

-- After apply: NOTIFY pgrst, 'reload schema'
