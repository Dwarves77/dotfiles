-- Migration 109: region_dimension_coverage table per operator A6 scope
-- (Sprint 3, 2026-05-27).
--
-- Background: migration 106 landed the regions table (EU/US/ASIA/UK/UAE
-- seeded) and the regional_data_facts table (per-cell facts for D2-D6).
-- The Operations surface needs an additional coordination layer that
-- tracks per-(region, dimension) coverage STATE — i.e. whether a given
-- (region, dimension) cell is populated with sourced facts, only
-- partially populated, pending Sonnet find-new generation, or missing
-- entirely. This table is the source of truth for the mockup's
-- "Coverage gaps: D2 / D4 / D5 not yet populated" empty-dim notes and
-- the side-rail "By dimension" badges (5/5 / 2/5 etc).
--
-- 4 states (operator A6 scope):
--   - populated  : has sourced facts; mockup `cnt ok` green badge
--   - partial    : some facts but operator-marked incomplete; `cnt warn`
--   - pending    : find-new in progress / Sonnet queued; renders empty
--                  with explicit "in progress" affordance
--   - missing    : no facts, not yet investigated; renders the
--                  "Coverage gaps … Flag a coverage request" callout
--
-- Notes column captures operator narrative (e.g. "Awaiting Sonnet
-- pass per A6.3"; "ESG report due Q3 will populate this"). Optional.
--
-- fact_count is denormalized from regional_data_facts. A trigger keeps
-- it in sync on INSERT/UPDATE/DELETE so the surface can render badges
-- without a per-render aggregate query.
--
-- The seed inserts 30 rows (5 regions × 6 dimensions), each starting
-- in the `missing` state. A follow-up script in A6.2 reconciles the
-- initial state against existing regional_data_facts (any row with
-- fact_count > 0 flips to `populated`).
--
-- After apply: NOTIFY pgrst, 'reload schema'.

BEGIN;

-- ── Schema ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS region_dimension_coverage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id         UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  dimension         TEXT NOT NULL,
  state             TEXT NOT NULL DEFAULT 'missing',
  notes             TEXT,
  fact_count        INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_id, dimension)
);

-- Dimension vocabulary mirrors migration 106's regional_data_facts CHECK.
-- Idempotent drop+add for re-runs.
ALTER TABLE region_dimension_coverage
  DROP CONSTRAINT IF EXISTS region_dimension_coverage_dimension_check;
ALTER TABLE region_dimension_coverage
  ADD CONSTRAINT region_dimension_coverage_dimension_check
  CHECK (dimension IN (
    'regulatory_feasibility',
    'regional_resources',
    'labor_markets',
    'materials_sourcing',
    'infrastructure',
    'operational_cost'
  ));

ALTER TABLE region_dimension_coverage
  DROP CONSTRAINT IF EXISTS region_dimension_coverage_state_check;
ALTER TABLE region_dimension_coverage
  ADD CONSTRAINT region_dimension_coverage_state_check
  CHECK (state IN ('populated', 'partial', 'pending', 'missing'));

CREATE INDEX IF NOT EXISTS idx_rdc_region_dim
  ON region_dimension_coverage(region_id, dimension);
CREATE INDEX IF NOT EXISTS idx_rdc_state
  ON region_dimension_coverage(state);

COMMENT ON TABLE region_dimension_coverage IS
  'Per-(region, dimension) coverage state index. 4 states: populated / partial / pending / missing. Powers OperationsPage coverage gap callouts + side-rail By-dimension badges. fact_count is trigger-maintained from regional_data_facts.';

COMMENT ON COLUMN region_dimension_coverage.state IS
  'populated = has sourced facts; partial = some facts but operator-marked incomplete; pending = find-new in progress; missing = no facts, not yet investigated.';

COMMENT ON COLUMN region_dimension_coverage.notes IS
  'Operator narrative for why state is partial/pending/missing. Optional. Surfaced in admin coverage review UI; not rendered to customers directly.';

-- ── Seed: 30 rows (5 regions × 6 dimensions), all start as missing.
-- A follow-up script (A6.2) reconciles against existing
-- regional_data_facts: any (region, dimension) cell with rows in
-- regional_data_facts flips to 'populated' + fact_count gets set.
INSERT INTO region_dimension_coverage (region_id, dimension, state)
SELECT r.id, d.dim, 'missing'
FROM regions r
CROSS JOIN (VALUES
  ('regulatory_feasibility'),
  ('regional_resources'),
  ('labor_markets'),
  ('materials_sourcing'),
  ('infrastructure'),
  ('operational_cost')
) AS d(dim)
ON CONFLICT (region_id, dimension) DO NOTHING;

-- ── fact_count maintenance trigger ─────────────────────────────────
-- Keep fact_count denormalized from regional_data_facts so the
-- OperationsPage renderer doesn't need to aggregate on every load.
-- AFTER trigger so the source row is committed before we recount.

CREATE OR REPLACE FUNCTION region_dimension_coverage_sync_fact_count()
RETURNS TRIGGER AS $$
DECLARE
  affected_region_id UUID;
  affected_dimension TEXT;
BEGIN
  -- Determine which (region, dimension) cell changed.
  IF TG_OP = 'DELETE' THEN
    affected_region_id := OLD.region_id;
    affected_dimension := OLD.dimension;
  ELSE
    affected_region_id := NEW.region_id;
    affected_dimension := NEW.dimension;
  END IF;

  -- Re-count and upsert coverage row.
  INSERT INTO region_dimension_coverage (region_id, dimension, fact_count, updated_at)
  VALUES (
    affected_region_id,
    affected_dimension,
    (SELECT COUNT(*)::INT
       FROM regional_data_facts
      WHERE region_id = affected_region_id
        AND dimension = affected_dimension),
    NOW()
  )
  ON CONFLICT (region_id, dimension) DO UPDATE
    SET fact_count = EXCLUDED.fact_count,
        updated_at = NOW();

  -- Flip state to 'populated' on the first fact landing in a previously
  -- empty cell. Don't override 'partial' or 'pending' set by operator.
  UPDATE region_dimension_coverage
     SET state = 'populated'
   WHERE region_id = affected_region_id
     AND dimension = affected_dimension
     AND state = 'missing'
     AND fact_count > 0;

  -- Flip state back to 'missing' if the cell empties (last fact deleted).
  UPDATE region_dimension_coverage
     SET state = 'missing'
   WHERE region_id = affected_region_id
     AND dimension = affected_dimension
     AND fact_count = 0
     AND state = 'populated';

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rdf_sync_coverage ON regional_data_facts;
CREATE TRIGGER rdf_sync_coverage
  AFTER INSERT OR UPDATE OR DELETE ON regional_data_facts
  FOR EACH ROW EXECUTE FUNCTION region_dimension_coverage_sync_fact_count();

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE region_dimension_coverage ENABLE ROW LEVEL SECURITY;
CREATE POLICY region_dimension_coverage_read
  ON region_dimension_coverage FOR SELECT USING (true);

COMMIT;

-- After apply: NOTIFY pgrst, 'reload schema'
