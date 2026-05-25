-- Migration 103: intelligence_item_sections table per operator Q4
-- decision (2026-05-24).
--
-- Q4: table (NOT JSONB) for structured per-section content + queryable
--     source_ids per section. 14 sections per regulatory_fact_document
--     format; 8 per technology_profile / operations_profile /
--     market_signal_brief; 6 per research_summary. Each section has a
--     stable section_key, an order index, markdown content body, an
--     is_conditional flag (for sections that only render when content
--     exists), and a source_ids UUID[] for the sources that section
--     draws on.
--
-- This unblocks the RegulationDetailSurface 14-section reader: today
-- only 3 sections (immediate action, what-it-is, compliance chain)
-- render as first-class UI; the other 11 sit inside opaque full_brief
-- markdown. With this table, the renderer queries by item_id and
-- composes the section-numbered structured view directly.
--
-- The agent persists into this table on each regeneration alongside
-- the existing full_brief markdown column (Phase 3C work). The
-- markdown stays as the authoritative content body; this table is a
-- structured projection optimized for the reader UI.

BEGIN;

CREATE TABLE IF NOT EXISTS intelligence_item_sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  section_key     TEXT NOT NULL,
  section_order   INTEGER NOT NULL,
  content_md      TEXT NOT NULL,
  is_conditional  BOOLEAN NOT NULL DEFAULT false,
  source_ids      UUID[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_item_sections_item_id
  ON intelligence_item_sections(item_id);

CREATE INDEX IF NOT EXISTS idx_item_sections_section_key
  ON intelligence_item_sections(section_key);

-- GIN index for source_ids array lookup (e.g., reverse-citation queries).
CREATE INDEX IF NOT EXISTS idx_item_sections_source_ids
  ON intelligence_item_sections USING GIN (source_ids);

COMMENT ON TABLE intelligence_item_sections IS
  'Structured per-section projection of intelligence_items.full_brief (Q4, 2026-05-24). One row per (item_id, section_key). Powers the 14-section reader on /regulations/[slug] and the 6/8-section readers on other surfaces.';

COMMENT ON COLUMN intelligence_item_sections.section_key IS
  'Stable key per section per format. See SKILL.md format-specific section vocabulary.';

COMMENT ON COLUMN intelligence_item_sections.source_ids IS
  'UUIDs of sources this section draws on. Powers per-section citation rendering and reverse-citation queries.';

-- RLS policies: read access matches intelligence_items (public for
-- active rows, hidden when parent item is_archived = true).
ALTER TABLE intelligence_item_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY intelligence_item_sections_read ON intelligence_item_sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM intelligence_items i
      WHERE i.id = intelligence_item_sections.item_id
        AND i.is_archived = false
    )
  );

-- Service-role bypass via Supabase service key (no policy needed; RLS
-- is auth.uid()-based and service role bypasses RLS by default).

COMMIT;
