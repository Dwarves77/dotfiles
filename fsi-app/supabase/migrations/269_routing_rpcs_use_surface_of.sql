-- 269 — the three category-routing RPCs stop carrying their own copy of the surface predicate
-- (2026-08-30).
--
-- WHAT THIS FIXES. `surface_of(p_item_type, p_domain)` (migration 148) is the DATABASE half of the ONE
-- home for "which surface does this item belong to" — generated from SURFACE_RULES in
-- src/lib/surface-of.mjs by renderSurfaceOfSql(), with the vocab-drift guard asserting the migration
-- contains exactly that text so the two halves can never diverge. `get_surface_counts` (also 148) uses
-- it. The three category-routing RPCs did NOT: each carried a hand-written `ii.item_type IN (...)`
-- list, i.e. a THIRD, FOURTH and FIFTH copy of a predicate that already had a single home.
--
-- The copies had drifted, and the drift was customer-visible on every one of the three surfaces.
-- Measured live 2026-08-30 over verified, non-archived items, hardcoded list vs surface_of:
--     research    31 -> 38   (+7  under-routed)
--     market      56 -> 48   (-8  net; 12 leave, 4 arrive)
--     operations  21 -> 24   (+3  under-routed)
--
-- The Research undercount is the one that surfaced this: /research showed "38 findings" in its
-- masthead (get_surface_counts, correct) above ~31 cards (this RPC, wrong) — two disagreeing totals on
-- one screen, an 18% gap, exactly the kind of defect that teaches a reader not to trust the numbers.
-- Fixing the page's own fetcher was not sufficient, because the page intersects its rows against this
-- RPC's id set; the RPC was the binding constraint.
--
-- NOTHING IS LOST — every re-routed item MOVES, none disappear. The 12 leaving Market, enumerated
-- before this migration was written rather than assumed:
--     4  initiative    domain 7 -> research     (e.g. the UN STI Forum 2024 item)
--     3  market_signal domain 7 -> research     (e.g. US corporate climate disclosure landscape)
--     3  initiative    domain 3 -> operations   (e.g. Blue Visby prototype trials)
--     1  initiative    domain 1 -> regulations  (Maritime Singapore Green Initiative)
--     1  market_signal domain 1 -> regulations  (IDB Transport Sector Framework)
-- The two moving to `regulations` are ADR-020's regulation precedence doing exactly what it was
-- decided to do: a domain-1 item is a regulation first, whatever its item_type says. Market shrinking
-- is therefore a correction, not a regression — those items were being shown on a surface the
-- platform's own decided predicate says they do not belong to.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE. Every other line of all three functions is byte-identical to
-- the live definition read from pg_get_functiondef() immediately before this file was written: same
-- RETURNS TABLE column lists, same SECURITY DEFINER, same `SET search_path`, same
-- `_assert_org_membership` call, same `_workspace_active_items(p_org_id)` org scoping (get_research /
-- get_operations) and same workspace_item_overrides join (get_market_intel), same ORDER BY, same
-- joins. ONLY the WHERE predicate changes. In particular the org-membership and workspace-override
-- scoping is untouched — dropping the page-level intersection instead of fixing the RPC would have
-- bypassed that scoping, which is why the fix lives here and not in the page.
--
-- DDL, so it applies via the sanctioned lane BEFORE the dependent code merges (CLAUDE.md standing
-- rule 3). Reversible: re-run migration 125's / the market RPC's original bodies with their hardcoded
-- item_type lists.

CREATE OR REPLACE FUNCTION public.get_research_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    src.what_it_changes, src.does_not_resolve,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  JOIN public.intelligence_items src ON src.id = ii.id
  WHERE public.surface_of(ii.item_type, ii.domain) = 'research'
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5
    END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_operations_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  WHERE public.surface_of(ii.item_type, ii.domain) = 'operations'
  ORDER BY
    CASE ii.effective_priority
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

CREATE OR REPLACE FUNCTION public.get_market_intel_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, signal_band text, trajectory_points jsonb, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, conversion_trigger text, cross_references text, effective_priority text, effective_archived boolean)
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
    AND public.surface_of(ii.item_type, ii.domain) = 'market'
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
