-- Migration 148 (count-integrity build 2026-07-02): a SINGLE server-side classification + counting SoT
-- for the customer-facing surface counts, replacing five independent client/SQL re-derivations that
-- disagreed on population and vocabulary.
--
-- THE LEAKS THIS CLOSES (all were "the same surface counted two ways"):
--   1. Rail verified-filter vs aggregates. The dashboard rail (surface-coverage.ts) filtered
--      provenance_status='verified'; get_workspace_intelligence_aggregates_scoped (069, the masthead
--      source) did NOT — so header and rail counted different populations. Here EVERY customer count
--      gates provenance_status='verified' in ONE place.
--   2. Research empty-scope degrade. /research passed RESEARCH_SCOPE={} to 069, degrading it to
--      workspace-wide totals (the 259 leak). get_surface_counts(org,'research') is surface-scoped.
--   3. Header-vs-cards dual derivation. Header read the RPC total; severity/band cards counted over a
--      capped, client-derived `displayed` list. This RPC is the single population both can read.
--   4. MARKET_ITEM_TYPES / MARKET_SCOPE vocab split. /market restated the item_type+domain mapping as
--      page-scope arrays; the rail restated it again as JS sets. Classification now lives once, in
--      surface_of(), whose mapping is byte-identical to src/lib/surface-of.mjs `surfaceOf` (the vocab
--      drift guard fails the build on any divergence — binding 3).
--   5. Override overlay JOIN-vs-second-query. The rail did a base query + a second overrides query;
--      069 did a LEFT JOIN. Both RPCs here apply the workspace override overlay as ONE LEFT JOIN.
--
-- DESIGN (rulings + bindings, dispatch 2026-07-02):
--   - VERIFIED-ONLY (ruling 1): customer counts gate provenance_status='verified'. get_all_surface_counts
--     returns BOTH verified and total per surface from the SAME scan — the customer rail consumes
--     verified; the admin rail renders both (the unverified delta is operator visibility). No separate
--     variant RPC.
--   - MULTI-LABEL (ruling 2): total_items is the DISTINCT item count (header); by_severity/by_band/
--     by_priority are label instances (cards). total_items >= sum(by_severity) because items may carry
--     no severity label; the consumer shows an honest "N items / M classified" hint only when they
--     differ (EP-7 stands — never forced to a single label).
--   - UNCATEGORIZED (binding 4): surface_of returns 'uncategorized' for any (item_type, domain) that
--     matches no rule. Never a customer surface; it is a defect signal the admin rail drills into.
--
-- NOTE ON by_severity / by_band SOURCE. These aggregate the intelligence_items.severity and signal_band
-- columns (migration 102). Those columns are the spec home but are currently sparsely populated; the
-- live surface cards still DERIVE severity/band client-side. This RPC exposes the column-based
-- distribution so the cards can migrate to it once the columns are backfilled — the card migration is
-- deliberately NOT part of this migration's consumer wiring (surfaced to the operator as a held item).
--
-- Idempotent (CREATE OR REPLACE). SECURITY DEFINER mirrors 068/069. surface_of is IMMUTABLE and pure.
-- Applies on the operator DDL window; RIDES THE SAME supabase db push as 146 + 147 (one identity
-- confirmation, one proof window). Consumers fail soft when absent (they fall back to prior RPCs), so
-- this is safe to merge/deploy before it is applied. Reversible: DROP FUNCTION (x3).

-- ─────────────────────────────────────────────────────────────────────────────
-- surface_of(item_type, domain) -> customer surface. The CASE below is GENERATED from
-- src/lib/surface-of.mjs SURFACE_RULES via renderSurfaceOfSql(); do NOT hand-edit it. To change the
-- mapping, edit SURFACE_RULES and regenerate (the vocab-drift guard enforces byte-equality).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION surface_of(p_item_type text, p_domain int)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    CASE
      WHEN p_item_type IN ('regulation', 'directive', 'standard', 'guidance', 'framework', 'law') THEN 'regulations'
      WHEN p_domain IN (1) THEN 'regulations'
      WHEN p_domain IN (3, 6) THEN 'operations'
      WHEN p_domain IN (7) THEN 'research'
      WHEN p_domain IN (2, 4) THEN 'market'
      WHEN p_item_type IN ('regional_data') THEN 'operations'
      WHEN p_item_type IN ('research_finding') THEN 'research'
      WHEN p_item_type IN ('market_signal', 'initiative', 'technology', 'innovation') THEN 'market'
      ELSE 'uncategorized'
    END;
$$;

COMMENT ON FUNCTION surface_of(text, int) IS
  'Single classification SoT: maps (item_type, domain) to one of regulations/market/operations/research, else uncategorized. Body GENERATED from src/lib/surface-of.mjs SURFACE_RULES (renderSurfaceOfSql); the vocab-drift guard fails CI on any divergence. Mirrors the five-surface model (Community is not an intelligence_items surface).';

-- ─────────────────────────────────────────────────────────────────────────────
-- get_surface_counts(org, surface): verified-population count bundle for ONE surface. Shape is a
-- superset of 069 (total_items/by_priority/by_status/by_jurisdiction/total_jurisdictions/
-- last_updated_at) plus by_severity/by_band, so it is a drop-in replacement for the masthead consumers.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_surface_counts(p_org_id UUID, p_surface TEXT)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER AS $$
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
    WHERE NOT COALESCE(wo.is_archived, ii.is_archived)          -- active rows, override overlay applied
      AND ii.provenance_status = 'verified'                     -- ruling 1: customer counts gate verified
      AND surface_of(ii.item_type, ii.domain) = p_surface       -- single classification SoT
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
  );
$$;

COMMENT ON FUNCTION get_surface_counts(UUID, TEXT) IS
  'Verified-population count bundle for ONE customer surface (regulations/market/operations/research/uncategorized). Gates provenance_status=verified (ruling 1). total_items = distinct verified items (header); by_priority/by_severity/by_band = label instances (cards) — total_items >= sum(by_severity). Override overlay applied as one LEFT JOIN. Superset of 069 shape; drop-in for the masthead consumers via getScopedWorkspaceAggregates fail-soft.';

-- ─────────────────────────────────────────────────────────────────────────────
-- get_all_surface_counts(org): one scan, {verified,total} per surface for the dashboard rail.
-- Customer rail reads .verified; admin rail renders both (the unverified delta = operator visibility).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_all_surface_counts(p_org_id UUID)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH scope AS (
    SELECT
      surface_of(ii.item_type, ii.domain) AS surface,
      (ii.provenance_status = 'verified')  AS is_verified
    FROM intelligence_items ii
    LEFT JOIN workspace_item_overrides wo
      ON  wo.item_id = ii.id
      AND wo.org_id  = p_org_id
    WHERE NOT COALESCE(wo.is_archived, ii.is_archived)          -- active rows, override overlay applied
  ),
  per_surface AS (
    SELECT surface,
           COUNT(*) FILTER (WHERE is_verified)::int AS verified,
           COUNT(*)::int                           AS total
    FROM scope
    GROUP BY surface
  ),
  -- Always emit all five buckets, zero-filled where a surface has no rows, so consumers can render a
  -- stable rail without null-guarding each key.
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
  FROM filled;
$$;

COMMENT ON FUNCTION get_all_surface_counts(UUID) IS
  'One-scan {verified,total} per customer surface + grand total, for the dashboard rail. Active rows with the workspace override overlay applied. Customer rail consumes .verified (ruling 1); admin rail renders both (the verified-vs-total delta is operator visibility). uncategorized is a defect signal (binding 4), never a customer surface.';
