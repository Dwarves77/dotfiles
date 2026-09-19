-- subject: Migration 252 (connection-discovery edges, Pillar A, 2026-08-09). Adds `basis` jsonb + `score` real to `item_cross_references` and widens the origin CHECK with `provenance_discovery`, so discovered connections store WHY they connect (same instrument / shared scenario / non-role compliance object / jurisdiction+topic), no ungrounded links. relationship stays semantic (`related`); signals live in basis. Consumed by src/lib/connections/discover.mjs + scripts/connections/discover-for-items.mjs (was backfill-edges.mjs, see correction below). Additive (nullable columns; CHECK widened, no row violates). **APPLIED LIVE 2026-08-09** via MCP. Reversible. **CORRECTION (lane W71-C, 2026-09-05):** `scripts/connections/backfill-edges.mjs` was DELETED, F25 module-liveness: unwired, superseded by `scripts/connections/discover-for-items.mjs` (the live, CI-dispatched connection-discovery runtime, corpus-turn.yml, reusing the identical discover.mjs scoring path); backfill-edges.mjs's own one-time cold-start pass already ran.
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
