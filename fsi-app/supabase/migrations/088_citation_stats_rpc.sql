-- Migration 088: get_source_citation_stats(source_ids UUID[]) RPC
--
-- Why this migration exists.
-- The Intelligence Assistant (`src/app/api/ask/route.ts`) assembles a
-- Citation[] per response. Per OBS-28 (Sprint 2 Tier 3 Build 5) the citation
-- surface is restored in the frontend with provenance signal: source name,
-- tier badge, citation count, recency. The count and recency aggregates
-- require per-source rollups over `intelligence_items`. A per-citation
-- N+1 select from the route handler would degrade response time linearly
-- with citation count; a single RPC keeps the round trip count at one and
-- pushes the aggregation into Postgres where the relevant indexes live.
--
-- v1 semantics (revisits when Q1 brief->source edge table lands).
--   citation_count := count of intelligence_items where
--                     source_id = $1 OR sources_used @> ARRAY[$1]::uuid[]
--   recency        := max(added_date) over the same set
--
-- The union over source_id and sources_used reflects the actual data shape
-- on 2026-05-19: 616/657 items have a non-null source_id, only 159/657 have
-- a non-empty sources_used array. Counting via sources_used alone would
-- undercount legacy items by ~3.5x. When Q1 lands the canonical brief->source
-- edge table, the union becomes a single join and this RPC's body is the
-- expected migration point.
--
-- The recency column choice is added_date, not created_at or updated_at.
-- added_date is operator-curated and tracks content cadence; created_at and
-- updated_at drift with platform plumbing (re-ingest, normalization triggers,
-- regeneration). `intelligence_items` does not carry a published_at column,
-- which would be the ideal canonical recency field; that is a Q1-class
-- schema addition.
--
-- Function signature.
--   get_source_citation_stats(source_ids UUID[])
--     RETURNS TABLE(source_id UUID, citation_count INT, recency TIMESTAMPTZ)
--
-- The recency column on the returned table is TIMESTAMPTZ even though
-- added_date is DATE. The DATE -> TIMESTAMPTZ cast is explicit so the
-- API surface carries an ISO 8601 timestamp with timezone for the
-- frontend renderer.
--
-- Security model.
--   SECURITY INVOKER. The RPC reads from `intelligence_items` and `sources`
--   under the caller's RLS. The Intelligence Assistant route already runs
--   under service-role; non-service callers will see RLS-filtered counts,
--   which is the correct behavior for a future per-workspace caller.
--
-- Performance.
--   Returns one row per element in source_ids. Aggregates over
--   intelligence_items via the existing indexes on source_id and
--   sources_used (GIN if present, sequential scan if not). Citation
--   payloads in practice carry a handful of unique source_ids per
--   response, so the per-call cost is bounded.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_source_citation_stats(source_ids UUID[])
RETURNS TABLE(
  source_id UUID,
  citation_count INTEGER,
  recency TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT req.source_id::uuid AS source_id,
         count(ii.*)::int    AS citation_count,
         max(ii.added_date)::timestamptz AS recency
    FROM unnest(source_ids) AS req(source_id)
    LEFT JOIN public.intelligence_items ii
      ON ii.source_id = req.source_id
      OR ii.sources_used @> ARRAY[req.source_id]::uuid[]
   GROUP BY req.source_id;
$$;

COMMENT ON FUNCTION public.get_source_citation_stats(UUID[]) IS
  'Q8/OBS-28: per-source citation_count + recency for Intelligence Assistant provenance panel. v1 union semantic over intelligence_items.source_id and .sources_used; revisits when Q1 brief->source edge table lands.';

-- Grant execute to the roles the Intelligence Assistant route uses.
-- The route calls under service_role; anon/authenticated are granted for
-- the future per-workspace caller (which will run under the user's RLS).
GRANT EXECUTE ON FUNCTION public.get_source_citation_stats(UUID[])
  TO anon, authenticated, service_role;

COMMIT;
