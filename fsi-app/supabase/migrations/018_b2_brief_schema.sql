-- ════════════════════════════════════════════════════════════════════
-- Migration 018 — B.2 brief regeneration schema
--
-- Repurposes intelligence_items.severity from the legacy
-- 'critical/high/medium/low' scale (164 rows universally 'medium' as
-- seed default, no readers in code) to the SKILL.md severity labels
-- (ACTION REQUIRED / COST ALERT / WINDOW CLOSING / COMPETITIVE EDGE /
-- MONITORING). Also adds five new columns for the B.2 regeneration
-- pipeline: urgency_tier, format_type, last_regenerated_at,
-- regeneration_skill_version, sources_used.
-- ════════════════════════════════════════════════════════════════════

-- Section 1: Repurpose existing severity column to SKILL.md labels.
-- Order matters: must drop NOT NULL and the old CHECK constraint *before*
-- the UPDATE that sets every row to NULL. Then add the new CHECK that
-- accepts NULL plus the 5 SKILL.md labels.
ALTER TABLE intelligence_items ALTER COLUMN severity DROP NOT NULL;
ALTER TABLE intelligence_items ALTER COLUMN severity DROP DEFAULT;
ALTER TABLE intelligence_items DROP CONSTRAINT intelligence_items_severity_check;
UPDATE intelligence_items SET severity = NULL;
ALTER TABLE intelligence_items ADD CONSTRAINT intelligence_items_severity_check
  CHECK (severity IS NULL OR severity IN
    ('ACTION REQUIRED', 'COST ALERT', 'WINDOW CLOSING', 'COMPETITIVE EDGE', 'MONITORING'));

-- Section 2: Add 5 new columns for B.2 architecture
ALTER TABLE intelligence_items ADD COLUMN urgency_tier TEXT
  CHECK (urgency_tier IS NULL OR urgency_tier IN ('watch', 'elevated', 'stable', 'informational'));
ALTER TABLE intelligence_items ADD COLUMN format_type TEXT
  CHECK (format_type IS NULL OR format_type IN
    ('regulatory_fact_document', 'technology_profile', 'operations_profile', 'market_signal_brief', 'research_summary'));
ALTER TABLE intelligence_items ADD COLUMN last_regenerated_at TIMESTAMPTZ;
ALTER TABLE intelligence_items ADD COLUMN regeneration_skill_version TEXT;
ALTER TABLE intelligence_items ADD COLUMN sources_used UUID[] DEFAULT '{}';

-- Section 3: Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_items_urgency_tier ON intelligence_items(urgency_tier) WHERE urgency_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_format_urgency ON intelligence_items(format_type, urgency_tier) WHERE format_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_last_regenerated ON intelligence_items(last_regenerated_at) WHERE last_regenerated_at IS NOT NULL;

-- Section 4: Comments for schema documentation
COMMENT ON COLUMN intelligence_items.severity IS 'Brief urgency severity per SKILL.md framework. Null until regenerated under new contract.';
COMMENT ON COLUMN intelligence_items.urgency_tier IS 'Dashboard counter tier (Watch/Elevated/Stable/Informational). Mapped from severity by agent during regeneration.';
COMMENT ON COLUMN intelligence_items.format_type IS 'SKILL.md format used to generate this brief. Determines section structure for rendering.';
COMMENT ON COLUMN intelligence_items.last_regenerated_at IS 'Timestamp of most recent agent regeneration under new SKILL.md contract.';
COMMENT ON COLUMN intelligence_items.regeneration_skill_version IS 'Identifier (date stamp or SKILL.md SHA) of contract version used for last regeneration.';
COMMENT ON COLUMN intelligence_items.sources_used IS 'Array of source IDs the agent referenced when generating this brief. Populated by citation extraction.';
