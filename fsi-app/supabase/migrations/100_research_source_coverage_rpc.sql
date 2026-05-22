-- Migration 100: get_research_source_coverage RPC.
--
-- Build 8.5 deliverable (2026-05-22). Closes the Build 8 scope gap that
-- 8.1-8.4 left open: the source coverage matrix tab on /research was a
-- hardcoded stub with the tab hidden. Per Build 8 plan
-- (docs/plans/build-8-research-surface.md) section 8.5, the matrix was
-- recommended for deferral pending the source registry rollup endpoint;
-- this migration is that endpoint, scoped to Research-bound sources.
--
-- What it returns.
--   A pivot of active Research-bound sources (sources.category='research',
--   sources.status='active') across (transport_mode x jurisdiction_iso),
--   with a source_count per cell. The Research surface UI maps cells to a
--   3-state coverage label (none / partial / full) per its own thresholds.
--
-- Why a Research-specific RPC instead of reusing coverage_matrix() (mig 039).
--   - coverage_matrix() pivots intelligence_items by (jurisdiction x item_type),
--     not (transport_mode x jurisdiction). Different axes.
--   - The admin surface counts items + sources of every category. Research
--     wants only the Research-routed source slice per the platform-intent
--     skill (caros-ledge-platform-intent SKILL.md Section 3 / Research) and
--     environmental-policy-and-innovation source taxonomy (research category =
--     analytical press + horizon-scan academic + intergovernmental analysis).
--   - The admin RPC is gated behind a platform-admin auth check; the Research
--     surface is workspace-customer-facing.
--
-- Cell semantics. The RPC returns the raw source_count per cell. The UI
-- derives a 3-state coverage label using simple count thresholds:
--   0 sources       -> 'none'
--   1-2 sources     -> 'partial'
--   3+ sources      -> 'full'
-- These thresholds mirror the admin coverage 'sparse' (1-2) / 'covered'
-- (>=3) split in fsi-app/src/app/api/admin/coverage/route.ts; freshness
-- is intentionally omitted because Research-source coverage is a
-- registry-breadth signal, not an ingest-freshness signal.
--
-- Depends on:
--   sources.transport_modes (TEXT[], migration 004)
--   sources.jurisdiction_iso (TEXT[], migration 033)
--   sources.category (TEXT, migration 084; 'research' route)
--   sources.status (TEXT, migration 004; 'active' filter)
--
-- Security model. SECURITY INVOKER; granted to anon + authenticated +
-- service_role. Returns aggregate counts only over the platform-wide
-- sources registry; no workspace-scoped data leaks. Matches the security
-- posture of get_source_citation_stats (migration 098), which also reads
-- platform-wide registry rows for customer-facing surfaces.
--
-- STABLE: read-only, no side effects, safe for repeated calls. The
-- /research source coverage tab calls this on every page render until a
-- cache layer is added; the row set is small (Research-bound sources are
-- a few dozen).
--
-- Idempotent: CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_research_source_coverage()
RETURNS TABLE (
  transport_mode TEXT,
  jurisdiction_iso TEXT,
  source_count INT
)
LANGUAGE SQL STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    tm AS transport_mode,
    ji AS jurisdiction_iso,
    COUNT(*)::INT AS source_count
  FROM public.sources
  CROSS JOIN LATERAL UNNEST(transport_modes) AS tm
  CROSS JOIN LATERAL UNNEST(jurisdiction_iso) AS ji
  WHERE category = 'research'
    AND status = 'active'
  GROUP BY tm, ji;
$$;

COMMENT ON FUNCTION public.get_research_source_coverage IS
  'Build 8.5: pivot of active Research-bound sources (sources.category=research, status=active) by (transport_mode x jurisdiction_iso). One row per (mode, jurisdiction) cell with source_count; cells with zero sources are omitted (the UI fills them as none-coverage). Caller is customer-facing /research source coverage tab. Sources with empty transport_modes OR empty jurisdiction_iso arrays produce no rows for the missing axis (documented behavior; the registry-classification step is where that gap closes).';

GRANT EXECUTE ON FUNCTION public.get_research_source_coverage() TO anon, authenticated, service_role;

COMMIT;
