-- 272 — the eight customer-facing RPCs start projecting ii.jurisdiction_iso (2026-08-30).
--
-- WHAT THIS FIXES. Addendum 63 (lane `lb`, 2026-08-30) found that `Resource.jurisdictionIso` can
-- never populate on any list/ledger surface, no matter what the TypeScript mapper does: none of the
-- eight customer-facing RPCs project `ii.jurisdiction_iso` in their live `RETURNS TABLE` / `SELECT`,
-- even though the underlying column is a TEXT ARRAY on `intelligence_items` (migration 033) and is
-- already carried by `_workspace_active_items` (migration 077/117), the shared scoping function six
-- of these eight source from. Lane `lb` shipped the TS half as a dormant passthrough
-- (`normalizeJurisdictionIsoColumn`, `src/lib/jurisdictions/iso.ts`, wired into the three
-- `Resource`-mapper call sites in `src/lib/supabase-server.ts`) and left this migration as a
-- decision-ready spec. This is the RPC half: add the one column, nothing else moves.
--
-- THE EIGHT AND WHERE EACH BODY WAS TAKEN FROM (highest-numbered migration that (re)defines each,
-- verified this session by `git grep -n "CREATE OR REPLACE FUNCTION public.<name>"` across every
-- migration file on disk, NOT from pg_get_functiondef — this lane has no database access):
--   get_workspace_intelligence        <- migration 120 (reads intelligence_items directly)
--   get_workspace_intelligence_slim   <- migration 120 (reads intelligence_items directly)
--   get_workspace_intelligence_dashboard <- migration 077 (reads _workspace_active_items(p_org_id))
--   get_workspace_intelligence_listings  <- migration 077 (reads _workspace_active_items(p_org_id))
--   get_market_intel_items            <- migration 269 (reads intelligence_items directly)
--   get_research_items                <- migration 269 (reads _workspace_active_items(p_org_id))
--   get_operations_items              <- migration 269 (reads _workspace_active_items(p_org_id))
--   get_technology_items              <- migration 134, NOT 269 — 269 redefined only
--     get_research_items/get_operations_items/get_market_intel_items (confirmed by reading 269 in
--     full: it contains exactly three CREATE OR REPLACE FUNCTION statements, and get_technology_items
--     is not one of them). get_technology_items' live body is unchanged since 134 and still carries
--     its own hardcoded `WHERE ii.item_type IN ('technology', 'innovation', 'tool')` predicate (never
--     converted to `surface_of()` by 269 — that is a real, separate gap this migration does not
--     touch, since 269's own discipline is "only the WHERE predicate changes" and this migration's is
--     "only the projection changes").
--
-- THE DISCIPLINE (precedent: migration 269's own header). Every other line of every one of the eight
-- functions below is byte-identical to the source migration named above: same RETURNS TABLE column
-- order otherwise, same LANGUAGE (plpgsql throughout; note migration 120's two omit the explicit
-- STABLE SECURITY DEFINER's `SET search_path` clause that 077's four carry, and 269's three do too —
-- that inconsistency is preserved verbatim, not normalized, because normalizing it here would violate
-- the same discipline it is invoked to protect), same SECURITY DEFINER, same `SET search_path` where
-- the source had one, same joins, same WHERE, same ORDER BY, same org-scoping
-- (`_assert_org_membership` + `_workspace_active_items(p_org_id)` or the inline
-- `workspace_item_overrides` join, whichever the source used). ONLY the projection changes:
-- `jurisdiction_iso text[]` is appended to the end of each RETURNS TABLE column list and each SELECT
-- list — never inserted mid-list — specifically so this diff touches nothing else.
--
-- WHY APPENDING AT THE END IS SAFE. `src/lib/supabase-server.ts` calls all eight through
-- `supabase.rpc(name, { p_org_id })` / `serviceClient.rpc(...)` (standard supabase-js), which returns
-- PostgREST's JSON-object encoding of a `RETURNS TABLE` result — each row is an object keyed by
-- column NAME, not a positional array. Every consumer in that file reads `row.jurisdiction_iso` by
-- property name (confirmed: the three existing mapper call sites, e.g. supabase-server.ts ~line 620,
-- ~line 1184, ~line 2838, all index by name). No caller of any of these eight RPCs depends on
-- column position. Appending is behavior-preserving for every existing field and additive for the
-- new one.
--
-- FOR THE TWO THAT SOURCE `intelligence_items` DIRECTLY (get_workspace_intelligence,
-- get_workspace_intelligence_slim, get_market_intel_items): `ii` already aliases
-- `public.intelligence_items`, which already has the `jurisdiction_iso text[]` column (migration
-- 033) — `ii.jurisdiction_iso` is a plain column reference, no join.
--
-- FOR THE FOUR THAT SOURCE `_workspace_active_items(p_org_id)` (get_workspace_intelligence_dashboard,
-- get_workspace_intelligence_listings, get_research_items, get_operations_items):
-- `_workspace_active_items` (migration 117, its own latest redefinition) already SELECTs
-- `ii.jurisdiction_iso` into its own RETURNS TABLE (verified: the column sits between
-- `intersection_summary` and `agent_integrity_flag` in its live signature) — `ii.jurisdiction_iso` in
-- each of these four is a passthrough of an already-scoped function's own output, not a new join
-- against the base table.
--
-- NOT TOUCHED, ON PURPOSE. `_workspace_active_items` itself is unchanged — it already carries the
-- column, so widening its four dependents needs no change to it. `get_technology_items` is unchanged
-- (out of the named eight's scope is false — it IS one of the eight — but see the migration-source
-- note above: it is included below, sourced from 134, with the same append-only treatment as the
-- other seven).
--
-- DDL, so it applies via the sanctioned lane BEFORE the dependent (already-shipped, dormant) TS code
-- goes live (CLAUDE.md standing rule 3). Reversible: re-run each named source migration's body
-- verbatim (120 for the base/slim pair, 077 for dashboard/listings, 269 for
-- research/operations/market, 134 for technology) — every one of those bodies is reproduced in this
-- file's own history, so "reversal" is "drop the appended column and appended SELECT expression from
-- each of the eight," which is exactly what rolling back to the prior CREATE OR REPLACE achieves. No
-- rollback file: no migration that only redefines existing SECURITY DEFINER functions via CREATE OR
-- REPLACE (071, 073, 077, 117, 120, 125, 133, 134, 148, 269 — the entire lineage this migration
-- extends) has ever shipped one; CREATE OR REPLACE FUNCTION is its own reversal once the prior body is
-- known, and every prior body is preserved above and in the migrations this migration cites.

--
-- ── WHY THIS FILE DROPS BEFORE IT CREATES (found by execution, 2026-08-30) ──────────────────────────
-- The first version of this migration used CREATE OR REPLACE FUNCTION alone, the way migration 269
-- did. Postgres REFUSED it:
--     ERROR: 42P13: cannot change return type of existing function
--     DETAIL: Row type defined by OUT parameters is different.
--     HINT:  Use DROP FUNCTION get_workspace_intelligence(uuid) first.
-- CREATE OR REPLACE can change a function's BODY but never its RETURNS TABLE shape, and this migration
-- adds a column to all eight. 269 got away with CREATE OR REPLACE because it changed only a WHERE
-- predicate. The authoring lane had no database access and could not have discovered this; it surfaced
-- on the coordinator's first apply.
--
-- SAFETY OF THE DROP. Postgres DDL is transactional: the DROP and the CREATE below commit together, so
-- no concurrent session ever observes a missing function. There is no deploy window to schedule. This
-- is NOT the migration-265 case, where a DROP's safety depended on a consumer change shipping first.
--
-- GRANTS ARE NOT PRESERVED BY DROP, so they are restored explicitly at the foot of this file. The
-- pre-drop ACL was read live and was identical on all eight:
--     =X/postgres | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- `=X/postgres` is the PUBLIC grant Postgres re-creates by default; the three named roles are not, and
-- must be re-granted or every customer read 403s.
-- ────────────────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP FUNCTION IF EXISTS public.get_workspace_intelligence(uuid);
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_slim(uuid);
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_dashboard(uuid);
DROP FUNCTION IF EXISTS public.get_workspace_intelligence_listings(uuid);
DROP FUNCTION IF EXISTS public.get_research_items(uuid);
DROP FUNCTION IF EXISTS public.get_operations_items(uuid);
DROP FUNCTION IF EXISTS public.get_market_intel_items(uuid);
DROP FUNCTION IF EXISTS public.get_technology_items(uuid);

CREATE OR REPLACE FUNCTION public.get_workspace_intelligence(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], full_brief text, operational_impact text, open_questions text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, reasoning text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.full_brief, ii.operational_impact, ii.open_questions,
    ii.tags, ii.domain, ii.category, ii.item_type, ii.source_id, ii.source_url,
    ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status, ii.severity,
    ii.confidence, ii.priority, ii.reasoning, ii.entry_into_force,
    ii.compliance_deadline, ii.next_review_date, ii.added_date, ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority)::text AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)         AS effective_archived,
    ii.jurisdiction_iso
  FROM public.intelligence_items ii
  LEFT JOIN public.workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified' -- migration 120: customer read gate
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_slim(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    COALESCE(wo.priority_override, ii.priority)::text AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)         AS effective_archived,
    ii.jurisdiction_iso
  FROM public.intelligence_items ii
  LEFT JOIN public.workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND ii.provenance_status = 'verified' -- migration 120: customer read gate
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_dashboard(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, summary text, tags text[], domain integer,
   category text, item_type text, source_id uuid, source_url text,
   jurisdictions text[], transport_modes text[], verticals text[], status text,
   severity text, confidence text, priority text, entry_into_force date,
   compliance_deadline date, next_review_date date, added_date date,
   last_verified timestamp with time zone, is_archived boolean,
   effective_priority text, effective_archived boolean, jurisdiction_iso text[]
 ) AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.summary, ii.tags, ii.domain,
    ii.category, ii.item_type, ii.source_id, ii.source_url,
    ii.jurisdictions, ii.transport_modes, ii.verticals, ii.status,
    ii.severity, ii.confidence, ii.priority, ii.entry_into_force,
    ii.compliance_deadline, ii.next_review_date, ii.added_date,
    ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso
  FROM public._workspace_active_items(p_org_id) ii
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC,
    ii.id ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_workspace_intelligence_listings(p_org_id uuid)
 RETURNS TABLE(
   id uuid, legacy_id text, title text, what_is_it text, why_matters text,
   key_data text[], tags text[], domain integer, category text, item_type text,
   source_id uuid, source_url text, jurisdictions text[], transport_modes text[],
   verticals text[], status text, severity text, confidence text, priority text,
   entry_into_force date, compliance_deadline date, next_review_date date,
   added_date date, last_verified timestamp with time zone, is_archived boolean,
   effective_priority text, effective_archived boolean, jurisdiction_iso text[]
 ) AS $$
BEGIN
  PERFORM public._assert_org_membership(p_org_id);
  RETURN QUERY
  SELECT
    ii.id, ii.legacy_id, ii.title, ii.what_is_it, ii.why_matters,
    ii.key_data, ii.tags, ii.domain, ii.category, ii.item_type,
    ii.source_id, ii.source_url, ii.jurisdictions, ii.transport_modes,
    ii.verticals, ii.status, ii.severity, ii.confidence, ii.priority,
    ii.entry_into_force, ii.compliance_deadline, ii.next_review_date,
    ii.added_date, ii.last_verified, ii.is_archived,
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso
  FROM public._workspace_active_items(p_org_id) ii
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_research_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
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
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso
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
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
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
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso
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
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, signal_band text, trajectory_points jsonb, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, conversion_trigger text, cross_references text, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
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
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived,
    ii.jurisdiction_iso
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

CREATE OR REPLACE FUNCTION public.get_technology_items(p_org_id uuid)
 RETURNS TABLE(id uuid, legacy_id text, title text, summary text, what_is_it text, why_matters text, key_data text[], tags text[], domain integer, category text, item_type text, source_id uuid, source_url text, jurisdictions text[], transport_modes text[], verticals text[], status text, severity text, confidence text, priority text, entry_into_force date, compliance_deadline date, next_review_date date, added_date date, last_verified timestamp with time zone, is_archived boolean, what_it_changes text, does_not_resolve text, effective_priority text, effective_archived boolean, jurisdiction_iso text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    ii.effective_priority, ii.effective_archived, ii.jurisdiction_iso
  FROM public._workspace_active_items(p_org_id) ii
  JOIN public.sources s ON s.id = ii.source_id
  JOIN public.intelligence_items src ON src.id = ii.id
  WHERE ii.item_type IN ('technology', 'innovation', 'tool')
  ORDER BY
    CASE ii.effective_priority
      WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 WHEN 'LOW' THEN 4 ELSE 5
    END,
    ii.added_date DESC, ii.id ASC;
END;
$function$;

-- Restore the ACL the DROP removed (read live pre-drop; identical on all eight).
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_slim(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_dashboard(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_intelligence_listings(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_research_items(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_operations_items(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_market_intel_items(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_technology_items(uuid) TO anon, authenticated, service_role;

COMMIT;
