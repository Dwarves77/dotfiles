-- Migration 146 (Option A — RENDER-DERIVE): item_cross_references is the SINGLE SOURCE OF TRUTH for
-- item<->item links; related_items becomes a READ-DERIVED projection of the edge table
-- (phase-intake-gate, Confirmation 1). Prevents the drift where an agent-emitted related_items array and
-- the edge table disagree.
--
-- Fork resolution (2026-07-01): the FIRST 146 draft wrote related_items BACK into intelligence_items via a
-- trigger + reconcile loop. That UPDATE tripped the provenance-flip guard (guard_provenance_flip_trg,
-- migration 118 / row-43) on unverified items. Option A therefore DERIVES related_items ON READ (a STABLE
-- function + a view) and NEVER writes intelligence_items — the provenance trigger is NOT touched.
--
-- What this migration does (all writes target item_cross_references ONLY; intelligence_items is never mutated):
--   * origin column (manual | agent_semantic | entity_extraction) distinguishes admin-curated, agent-emitted,
--     and intake-extracted edges (used by the retroactive backfill + the single-writer-per-origin rule).
--   * one-time backfill of existing agent-emitted intelligence_items.related_items INTO edges (origin=agent_semantic).
--   * related_items_derived(uuid) + view item_related_items_derived: read-side projection consumers switch to.
--
-- Reversible: DROP VIEW + DROP FUNCTION + ALTER TABLE DROP COLUMN origin. STABLE. Idempotent.

ALTER TABLE public.item_cross_references
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual', 'agent_semantic', 'entity_extraction'));

-- One-time backfill: agent-emitted intelligence_items.related_items -> edges (origin=agent_semantic).
-- INSERT targets item_cross_references ONLY (never intelligence_items) so the provenance guard is untouched.
-- Idempotent (ON CONFLICT), FK-safe (target must exist), never self-links.
INSERT INTO public.item_cross_references (source_item_id, target_item_id, relationship, origin)
SELECT ii.id, t.tid, 'related', 'agent_semantic'
  FROM public.intelligence_items ii
  CROSS JOIN LATERAL unnest(ii.related_items) AS t(tid)
 WHERE ii.related_items IS NOT NULL
   AND t.tid IS NOT NULL
   AND t.tid <> ii.id
   AND EXISTS (SELECT 1 FROM public.intelligence_items x WHERE x.id = t.tid)
ON CONFLICT (source_item_id, target_item_id) DO NOTHING;

-- READ-DERIVE (Option A): related_items for one item = DISTINCT edge targets. Read-only; NO write-back.
-- Consumers that today read intelligence_items.related_items switch to this (a follow-on, gated on this
-- migration being live per the schema-before-dependent-code rule).
CREATE OR REPLACE FUNCTION public.related_items_derived(p_item uuid)
RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(DISTINCT x.target_item_id), ARRAY[]::uuid[])
    FROM public.item_cross_references x
   WHERE x.source_item_id = p_item;
$$;

-- Bulk read-derive: item_id -> derived related_items (for list/grid consumers).
CREATE OR REPLACE VIEW public.item_related_items_derived AS
  SELECT source_item_id AS item_id,
         array_agg(DISTINCT target_item_id) AS related_items
    FROM public.item_cross_references
   GROUP BY source_item_id;
