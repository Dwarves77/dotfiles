-- Migration 252: connection-discovery edges (Pillar A, 2026-08-09).
--
-- APPLIED LIVE 2026-08-09 via Supabase MCP ahead of this commit — audit record, not a pending apply.
--
-- Adds a grounded BASIS + score to item_cross_references and a new origin for provenance-discovered edges,
-- so every discovered connection stores WHY it connects (same instrument / shared scenario / shared object /
-- jurisdiction+topic) — no ungrounded links. Additive: new nullable columns; the origin CHECK is WIDENED
-- (no existing row violates it). relationship stays the semantic vocabulary ('related' for discovery edges);
-- the specific signals live in basis. Consumed by src/lib/connections/discover.mjs + scripts/connections/
-- backfill-edges.mjs. Reversible (DROP COLUMN basis, score; restore the 3-value origin CHECK).

ALTER TABLE public.item_cross_references ADD COLUMN IF NOT EXISTS basis jsonb;
ALTER TABLE public.item_cross_references ADD COLUMN IF NOT EXISTS score real;

COMMENT ON COLUMN public.item_cross_references.basis IS
  'Grounded connection basis (mig 252): array of {signal, detail, weight} — the real shared attributes that justify this edge. No edge without a basis. Written by provenance-discovery + available to entity/semantic origins.';

ALTER TABLE public.item_cross_references DROP CONSTRAINT IF EXISTS item_cross_references_origin_check;
ALTER TABLE public.item_cross_references ADD CONSTRAINT item_cross_references_origin_check
  CHECK (origin = ANY (ARRAY['manual'::text, 'agent_semantic'::text, 'entity_extraction'::text, 'provenance_discovery'::text]));
