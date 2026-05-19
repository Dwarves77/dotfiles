-- Migration 089: brief-to-source edge table (Q1).
--
-- Why this migration exists.
-- Per docs/sprint-2/source-credibility-model-decisions-2026-05-19.md Q1
-- ("Edge table for brief to source citations"), brief-to-source citations
-- move from the JSON-ish UUID[] column intelligence_items.sources_used onto
-- a first-class edge table parallel to the existing source-to-source edge
-- table source_citations (migration 004). The asymmetry between briefs
-- carrying an embedded array and sources carrying an edge-table is platform
-- debt; briefs participate in the citation network and need to be first-
-- class graph nodes so "this brief is heavily cited" can become a signal
-- without later reshaping.
--
-- Companion context.
-- Migration 088 (Q8/OBS-28) get_source_citation_stats currently unions
-- intelligence_items.source_id and .sources_used to compute the citation
-- count per source for the Intelligence Assistant provenance panel.
-- Migration 088's header notes "v1 union semantics; revisits when Q1
-- brief->source edge table lands"; THIS migration is the landing event.
-- The 088 RPC body migration to read from this edge table is a separate
-- consumer migration scheduled with the Build 8 (Research) and Tier 4
-- Build dispatches that consume citation_count under the Q9 per-surface
-- signal sets.
--
-- v1 scope (Q1 decision flag 3 in the decisions doc).
-- This migration captures INPUT-source associations only (the sources the
-- brief generation pipeline consumed), backfilled from
-- intelligence_items.sources_used. DISCOVERED-source associations (the
-- "New Sources Identified" markdown tables that agents emit at brief
-- generation per src/lib/agent/system-prompt.ts:358-368 and parse at
-- src/app/api/agent/run/route.ts:479-580) fill organically going forward
-- when the route handler is updated to write to this table alongside the
-- existing source_citations + provisional_sources writes. Historical
-- markdown parsing of past briefs is explicitly OUT of scope per the
-- decisions doc Q1 implementation flag.
--
-- Origin column (sources_used_backfill, agent_extraction, manual).
-- Three values capture the provenance of each edge row at the time it
-- was inserted:
--   * sources_used_backfill: this migration's one-time backfill from
--     intelligence_items.sources_used. Every row inserted by this
--     migration carries this origin.
--   * agent_extraction: subsequent writes from the agent run handler
--     when it parses the "New Sources Identified" table or detects an
--     existing source in the brief body. Pending the route-handler
--     update; no rows of this origin land today.
--   * manual: operator-curated edges (e.g. correcting a missed
--     citation post-publication). Pending an admin surface; no rows
--     of this origin land today.
--
-- The origin column participates in the UNIQUE constraint
-- (intelligence_item_id, source_id, origin) so the same (item, source)
-- pair can carry multiple origin tags without conflict. This matters
-- when the agent extraction writes a row for a source that was already
-- captured in the backfill: both rows survive and the operator can see
-- both provenances. Counting citations dedupes via DISTINCT on
-- (intelligence_item_id, source_id) at the read site.
--
-- detected_at semantics.
-- For sources_used_backfill rows, detected_at = intelligence_items.created_at
-- (the closest available proxy for when the citation actually entered
-- the system; intelligence_items has no published_at column today,
-- itself a Q1-class schema addition per migration 088's header).
-- For agent_extraction rows, detected_at = now() at the time of the
-- agent run write. For manual rows, detected_at = now() at the time of
-- the operator edit.
-- detected_at is consumed by Q6 recency-decay logic when computing
-- citation network weight contributions. The same column on
-- source_citations carries the same semantic.
--
-- Index strategy.
-- Three indexes:
--   * (intelligence_item_id) supports "show me every source this brief
--     cites" queries from the Intelligence Assistant and Research
--     surfaces.
--   * (source_id) supports the inverse "show me every brief that cites
--     this source" query, used by the Source Detail admin surface.
--   * (source_id, detected_at DESC) supports the per-source citation
--     count + recency aggregation that the Q8/OBS-28 RPC currently
--     computes via the sources_used array union; once that RPC migrates
--     to this table, this composite index keeps the aggregate cheap.
--
-- ON DELETE CASCADE on both FKs.
-- When an intelligence_item or source is hard-deleted, the edge rows
-- become meaningless and should follow. This matches the existing
-- source_citations behavior on source deletions.
--
-- Idempotent backfill.
-- The backfill INSERT uses ON CONFLICT DO NOTHING against the unique
-- constraint. Re-running this migration (or running parts of it after
-- a partial failure) produces no duplicates and no errors. The
-- backfill is bounded: 752 rows (159 items with non-empty sources_used,
-- average 4.7 sources per item) as of 2026-05-19.

BEGIN;

CREATE TABLE IF NOT EXISTS public.intelligence_item_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  origin TEXT NOT NULL CHECK (origin IN ('sources_used_backfill', 'agent_extraction', 'manual')),
  CONSTRAINT intelligence_item_citations_unique_edge
    UNIQUE (intelligence_item_id, source_id, origin)
);

CREATE INDEX IF NOT EXISTS intelligence_item_citations_item_idx
  ON public.intelligence_item_citations (intelligence_item_id);

CREATE INDEX IF NOT EXISTS intelligence_item_citations_source_idx
  ON public.intelligence_item_citations (source_id);

CREATE INDEX IF NOT EXISTS intelligence_item_citations_source_recency_idx
  ON public.intelligence_item_citations (source_id, detected_at DESC);

COMMENT ON TABLE public.intelligence_item_citations IS
  'Q1: brief-to-source edge table parallel to source_citations (source-to-source). Backfilled from intelligence_items.sources_used at migration time (origin=sources_used_backfill). Discovered-source associations (origin=agent_extraction) fill organically when the agent run handler at src/app/api/agent/run/route.ts is updated to write here alongside source_citations and provisional_sources. Manual operator edits use origin=manual. Decisions doc: docs/sprint-2/source-credibility-model-decisions-2026-05-19.md Q1.';

COMMENT ON COLUMN public.intelligence_item_citations.detected_at IS
  'When the edge was observed. For sources_used_backfill: intelligence_items.created_at. For agent_extraction: now() at agent run write. For manual: now() at operator edit. Consumed by Q6 recency-decay logic in citation-network weight computation.';

COMMENT ON COLUMN public.intelligence_item_citations.origin IS
  'Provenance tag. sources_used_backfill (migration 089 one-time), agent_extraction (route handler write, pending), manual (operator edit, pending). UNIQUE constraint allows multiple origin tags per (item, source) pair so an agent_extraction row coexists with a prior sources_used_backfill row without conflict; readers dedupe via DISTINCT (intelligence_item_id, source_id).';

-- Idempotent backfill from intelligence_items.sources_used.
-- One row per (item, source) pair where source resolves in public.sources.
-- The JOIN against sources implicitly drops any orphan source_id in
-- sources_used arrays (none exist as of probe 2026-05-19; the join
-- is the defensive form regardless).
INSERT INTO public.intelligence_item_citations
  (intelligence_item_id, source_id, detected_at, origin)
SELECT DISTINCT
  ii.id,
  s.id,
  ii.created_at,
  'sources_used_backfill'
FROM public.intelligence_items ii
JOIN public.sources s
  ON s.id = ANY(ii.sources_used)
WHERE ii.sources_used IS NOT NULL
  AND array_length(ii.sources_used, 1) > 0
ON CONFLICT (intelligence_item_id, source_id, origin) DO NOTHING;

COMMIT;
