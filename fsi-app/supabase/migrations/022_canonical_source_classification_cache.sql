-- ════════════════════════════════════════════════════════════════════
-- Migration 022 — recommended_classification cache on canonical_source_candidates
--
-- Mirrors the migration-015 pattern for provisional_sources. Caches the
-- Haiku-generated classification (tier 1-7, domains 1-7, jurisdictions,
-- transport_modes, topic_tags, rationale, model, computed_at) so the
-- review UI can re-render without re-calling Claude on every expansion.
--
-- Used by /api/admin/canonical-sources/recommend-classification when the
-- reviewer expands a candidate that triggers approve flow on a URL not
-- already in the sources registry.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE canonical_source_candidates
  ADD COLUMN IF NOT EXISTS recommended_classification JSONB;

COMMENT ON COLUMN canonical_source_candidates.recommended_classification IS
  'Cached Haiku classification for the approve-flow new-source insert. Schema: { tier:1-7, domains:int[], jurisdictions:str[], transport_modes:str[], topic_tags:str[], rationale, model, computed_at }. Populated on first reviewer expansion of a candidate whose URL is not already in the sources registry.';
