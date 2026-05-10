-- ════════════════════════════════════════════════════════════════════
-- Migration 053 — intelligence_item_versions append-only history.
--
-- Wave 1a foundation: every UPDATE to intelligence_items writes a
-- version row via trigger. Append-only: REVOKE UPDATE,DELETE.
--
-- Trigger captures every writer (agent/run, staged-updates,
-- intelligence-items metadata route, manual SQL) so callers do not
-- need to remember to dual-write.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS intelligence_item_versions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id        UUID NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  version_number              INT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_run_id           UUID,
  previous_version_id         UUID REFERENCES intelligence_item_versions(id) ON DELETE SET NULL,

  -- Snapshot of versioned columns from intelligence_items
  full_brief                  TEXT,
  severity                    TEXT,
  priority                    TEXT,
  urgency_tier                TEXT,
  format_type                 TEXT,
  topic_tags                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  operational_scenario_tags   JSONB NOT NULL DEFAULT '[]'::jsonb,
  compliance_object_tags      JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_items               JSONB NOT NULL DEFAULT '[]'::jsonb,
  intersection_summary        TEXT,
  sources_used                UUID[] NOT NULL DEFAULT '{}',
  last_regenerated_at         TIMESTAMPTZ,
  regeneration_skill_version  TEXT,

  UNIQUE (intelligence_item_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_iiv_item_version
  ON intelligence_item_versions (intelligence_item_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_iiv_created_at
  ON intelligence_item_versions (created_at DESC);

COMMENT ON TABLE intelligence_item_versions IS
  'Append-only version history for intelligence_items. One row per UPDATE via trigger. Never UPDATE or DELETE; new rows only.';

-- Append-only enforcement. Service role bypasses RLS so the
-- REVOKE is the actual guard, not a policy.
ALTER TABLE intelligence_item_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iiv_service_role_select_insert ON intelligence_item_versions;
CREATE POLICY iiv_service_role_select_insert ON intelligence_item_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE UPDATE, DELETE ON intelligence_item_versions FROM PUBLIC;
REVOKE UPDATE, DELETE ON intelligence_item_versions FROM authenticated;
REVOKE UPDATE, DELETE ON intelligence_item_versions FROM anon;

-- Trigger function: snapshot intelligence_items on UPDATE.
-- version_number is monotonic per intelligence_item_id.
CREATE OR REPLACE FUNCTION trg_intelligence_items_version_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_version INT;
  prev_id UUID;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1,
         (SELECT id FROM intelligence_item_versions
            WHERE intelligence_item_id = NEW.id
            ORDER BY version_number DESC
            LIMIT 1)
    INTO next_version, prev_id
    FROM intelligence_item_versions
   WHERE intelligence_item_id = NEW.id;

  INSERT INTO intelligence_item_versions (
    intelligence_item_id,
    version_number,
    previous_version_id,
    full_brief,
    severity,
    priority,
    urgency_tier,
    format_type,
    topic_tags,
    operational_scenario_tags,
    compliance_object_tags,
    related_items,
    intersection_summary,
    sources_used,
    last_regenerated_at,
    regeneration_skill_version
  ) VALUES (
    NEW.id,
    next_version,
    prev_id,
    NEW.full_brief,
    NEW.severity,
    NEW.priority,
    NEW.urgency_tier,
    NEW.format_type,
    COALESCE(to_jsonb(NEW.topic_tags), '[]'::jsonb),
    COALESCE(to_jsonb(NEW.operational_scenario_tags), '[]'::jsonb),
    COALESCE(to_jsonb(NEW.compliance_object_tags), '[]'::jsonb),
    COALESCE(to_jsonb(NEW.related_items), '[]'::jsonb),
    NEW.intersection_summary,
    COALESCE(NEW.sources_used, '{}'::uuid[]),
    NEW.last_regenerated_at,
    NEW.regeneration_skill_version
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS intelligence_items_version_snapshot ON intelligence_items;
CREATE TRIGGER intelligence_items_version_snapshot
  AFTER UPDATE ON intelligence_items
  FOR EACH ROW
  WHEN (
    OLD.full_brief IS DISTINCT FROM NEW.full_brief OR
    OLD.severity IS DISTINCT FROM NEW.severity OR
    OLD.priority IS DISTINCT FROM NEW.priority OR
    OLD.urgency_tier IS DISTINCT FROM NEW.urgency_tier OR
    OLD.format_type IS DISTINCT FROM NEW.format_type OR
    OLD.topic_tags IS DISTINCT FROM NEW.topic_tags OR
    OLD.intersection_summary IS DISTINCT FROM NEW.intersection_summary
  )
  EXECUTE FUNCTION trg_intelligence_items_version_snapshot();
