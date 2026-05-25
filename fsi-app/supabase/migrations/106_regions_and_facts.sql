-- Migration 106: regions table + operations_decisions JSONB column +
-- regional_data_facts table per operator Q7 decision (2026-05-24).
--
-- Q7: split by query needs:
--     - regions.operations_decisions as JSONB column on regions table
--       (varied per region, low query needs)
--     - regional_data_facts as proper table with FK to sources, per-row
--       queryable for the Operations 6-dimension fact tables (per-cell
--       query needs)
--
-- The regions table holds canonical region rows that the platform
-- pivots on (EU, US, ASIA, UK, UAE per current Operations rebuild,
-- plus expansion). operations_decisions is a free-shape JSONB blob
-- for region-level decision summaries (varied semantics per region,
-- not amenable to a rigid schema).
--
-- regional_data_facts is the structured per-cell store for the
-- Operations D2-D6 fact tables (D2 Regional resources, D3 Labor,
-- D4 Materials, D5 Infrastructure, D6 Cost). Each row is one
-- (region, dimension, fact_label) tuple with a value, status
-- (e.g. "Constrained" / "Available" / "Limited"), source_id FK to
-- sources, and last_updated timestamp. The Operations page queries
-- this table at render time to populate fact tables; today the
-- EU/US facts are hard-coded vertical-slice placeholders.

BEGIN;

-- ── regions table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT UNIQUE NOT NULL,
  label                 TEXT NOT NULL,
  severity              TEXT,
  iso_codes             TEXT[] NOT NULL DEFAULT '{}',
  operations_decisions  JSONB NOT NULL DEFAULT '{}',
  display_order         INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE regions DROP CONSTRAINT IF EXISTS regions_severity_check;
ALTER TABLE regions ADD CONSTRAINT regions_severity_check
  CHECK (severity IS NULL OR severity IN ('critical', 'high', 'moderate', 'low'));

CREATE INDEX IF NOT EXISTS idx_regions_code ON regions(code);
CREATE INDEX IF NOT EXISTS idx_regions_iso_codes ON regions USING GIN (iso_codes);

COMMENT ON TABLE regions IS
  'Canonical region rows the Operations surface pivots on (Q7, 2026-05-24). Today: EU, US, ASIA, UK, UAE. Expansion-friendly.';

COMMENT ON COLUMN regions.operations_decisions IS
  'Free-shape JSONB for region-level decision summaries. Varied semantics per region. Low query needs (renders inline on Operations region detail).';

COMMENT ON COLUMN regions.iso_codes IS
  'ISO 3166 codes this region groups (e.g. EU groups DE, NL, BE, FR, IT, ES). Used by the Operations regional grouping logic to match resource.jurisdiction to a canonical region.';

-- Seed the 5 current regions used by OperationsPage. Idempotent.
INSERT INTO regions (code, label, severity, iso_codes, display_order)
VALUES
  ('EU',   'European Union',                'critical', ARRAY['EU','DE','NL','BE','FR','IT','ES'], 1),
  ('US',   'United States',                 'critical', ARRAY['US','US-CA','US-NY','US-TX'], 2),
  ('ASIA', 'Asia, Singapore + Hong Kong',   'high',     ARRAY['SG','HK','CN','JP','KR'], 3),
  ('UK',   'United Kingdom',                'high',     ARRAY['GB'], 4),
  ('UAE',  'UAE, Dubai',                    'moderate', ARRAY['AE'], 5)
ON CONFLICT (code) DO NOTHING;

-- ── regional_data_facts table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS regional_data_facts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id       UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  dimension       TEXT NOT NULL,
  fact_label      TEXT NOT NULL,
  value           TEXT NOT NULL,
  status          TEXT,
  trend           TEXT,
  source_id       UUID REFERENCES sources(id) ON DELETE SET NULL,
  source_note     TEXT,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_id, dimension, fact_label)
);

ALTER TABLE regional_data_facts DROP CONSTRAINT IF EXISTS regional_data_facts_dimension_check;
ALTER TABLE regional_data_facts ADD CONSTRAINT regional_data_facts_dimension_check
  CHECK (dimension IN (
    'regulatory_feasibility',
    'regional_resources',
    'labor_markets',
    'materials_sourcing',
    'infrastructure',
    'operational_cost'
  ));

ALTER TABLE regional_data_facts DROP CONSTRAINT IF EXISTS regional_data_facts_trend_check;
ALTER TABLE regional_data_facts ADD CONSTRAINT regional_data_facts_trend_check
  CHECK (trend IS NULL OR trend IN ('up', 'down', 'flat'));

CREATE INDEX IF NOT EXISTS idx_regional_data_facts_region_dim
  ON regional_data_facts(region_id, dimension);

CREATE INDEX IF NOT EXISTS idx_regional_data_facts_source
  ON regional_data_facts(source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON TABLE regional_data_facts IS
  'Per-cell fact store for Operations D2-D6 fact tables (Q7, 2026-05-24). One row per (region, dimension, fact_label). Source-cited and timestamped. Replaces the hard-coded EU/US facts currently in OperationsPage.tsx.';

COMMENT ON COLUMN regional_data_facts.dimension IS
  'One of the 6 Operations dimensions per D1-D6 vocabulary. D1 regulatory_feasibility is rendered via Regulations cross-refs (no rows here); D2-D6 store actual facts.';

COMMENT ON COLUMN regional_data_facts.trend IS
  'up / down / flat for week-over-week or quarter-over-quarter direction. NULL when trend is not tracked.';

-- RLS: world-readable for active rows (no PII).
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regional_data_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY regions_read ON regions FOR SELECT USING (true);
CREATE POLICY regional_data_facts_read ON regional_data_facts FOR SELECT USING (true);

COMMIT;
