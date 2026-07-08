-- Migration 159: intelligence_items full-text search substrate (chrome-audit S1-09, browser wave).
--
-- The Ask assistant's context was `order("priority").limit(30)` — the FIRST 30 items by priority,
-- with NO relevance to the question asked. Recon (2026-07-07) confirmed the DB has no FTS surface
-- at all: no tsvector anywhere, GIN indexes only on array columns, zero `.textSearch(` callers.
-- This migration adds the substrate; /api/ask consumes it in the same PR's code change.
--
-- Design:
--  * `search_tsv` GENERATED ALWAYS STORED — weighted: title (A) > summary (B) > full_brief (C).
--    Generated (not trigger-maintained) so there is no writer to forget — every insert/update of
--    the three source columns recomputes it by construction. to_tsvector/setweight with an explicit
--    regconfig are IMMUTABLE, as generated columns require. ~650 rows; storage is trivial.
--  * GIN index for @@ matching.
--  * `search_intelligence_items(q, max_rows)` RPC — websearch_to_tsquery + ts_rank_cd ordering
--    (PostgREST cannot ORDER BY rank without an RPC), gated on the CUSTOMER READ PREDICATE
--    (provenance_status='verified' AND NOT archived) so retrieval can never surface what the read
--    layer hides. STABLE, SECURITY INVOKER, search_path pinned (new functions do not join the
--    165-fn unpinned backlog).
--
-- APPLY: delegated (operator "Proceed" 2026-07-07); schema DDL applies BEFORE the dependent code
-- merges per the two-track policy. Ledger row 159 recorded in the same transaction.

BEGIN;

ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(full_brief, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_intelligence_items_search_tsv
  ON public.intelligence_items USING GIN (search_tsv);

CREATE OR REPLACE FUNCTION public.search_intelligence_items(q text, max_rows int DEFAULT 12)
RETURNS TABLE (id uuid, rank real)
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT ii.id,
         ts_rank_cd(ii.search_tsv, websearch_to_tsquery('english', q)) AS rank
    FROM public.intelligence_items ii
   WHERE ii.provenance_status = 'verified'
     AND ii.is_archived IS NOT TRUE
     AND ii.search_tsv @@ websearch_to_tsquery('english', q)
   ORDER BY rank DESC
   LIMIT greatest(1, least(coalesce(max_rows, 12), 30));
$$;

COMMENT ON FUNCTION public.search_intelligence_items(text, int) IS
  'S1-09 Ask retrieval: websearch-syntax FTS over verified, non-archived intelligence_items, ranked by ts_rank_cd over the weighted search_tsv (title A / summary B / full_brief C). Enforces the customer read predicate inside the function so retrieval can never widen visibility.';

COMMIT;
