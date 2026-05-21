-- Migration 098: get_source_citation_stats body swap.
--
-- Build 8 Dispatch 8.1 primary deliverable (2026-05-21). Migration 088
-- created the RPC reading from the legacy `intelligence_items.source_id`
-- OR `sources_used` array union; migration 089 introduced the first-class
-- `intelligence_item_citations` edge table with backfill (origin =
-- 'sources_used_backfill'). The 088 RPC body migration to read from
-- the edge table was deferred per migration 089's header:
--   "scheduled with the Build 8 (Research) and Tier 4 Build dispatches"
-- This is that migration.
--
-- Why the swap matters (data integrity).
--   The legacy union reads `intelligence_items.sources_used` UUID[] which
--   covers only 159/657 of historical items (the rest carry the citation
--   as the row's source_id). Going forward, new agent-generated briefs
--   should write into the edge table (origin='agent_extraction'); the
--   read-side swap here unblocks customer-facing surfaces that need
--   accurate per-source citation counts (Build 8 /research,
--   Tier 4 Q9 signal sets).
--
-- Backfill state at this migration.
--   Migration 089 backfilled ~752 rows with origin='sources_used_backfill'
--   from the legacy array. After this RPC swap, callers see citation
--   counts identical to (or larger than) the legacy union because:
--     1. Every prior `source_id` association is recorded in the backfill
--     2. Every prior `sources_used` element is recorded in the backfill
--     3. The UNIQUE constraint on (item, source, origin) dedupes within
--        an origin; the RPC's count(DISTINCT intelligence_item_id) further
--        dedupes across origins for a given (item, source) pair.
--
-- Signature: unchanged from migration 088 (source_ids UUID[]) ->
--   (source_id UUID, citation_count INTEGER, recency TIMESTAMPTZ).
--   `recency` semantics shift from max(intelligence_items.added_date) to
--   max(intelligence_item_citations.detected_at). For backfill rows
--   detected_at = intelligence_items.created_at; for agent_extraction
--   rows it's the agent-write time. Both are forward-correct timestamps.
--
-- Security model unchanged (SECURITY INVOKER; grants to anon, authenticated,
-- service_role).
--
-- Idempotent: CREATE OR REPLACE.

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
         count(DISTINCT iic.intelligence_item_id)::int AS citation_count,
         max(iic.detected_at) AS recency
    FROM unnest(source_ids) AS req(source_id)
    LEFT JOIN public.intelligence_item_citations iic
      ON iic.source_id = req.source_id
   GROUP BY req.source_id;
$$;

COMMENT ON FUNCTION public.get_source_citation_stats(UUID[]) IS
  'Q1 swap (Build 8): per-source citation_count + recency from the intelligence_item_citations edge table (replaced legacy intelligence_items.source_id OR sources_used union from migration 088). citation_count uses DISTINCT intelligence_item_id to dedupe across multiple origin tags (backfill + agent_extraction + manual) for the same (item, source) pair. recency = max(detected_at).';

COMMIT;
