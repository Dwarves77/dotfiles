-- Migration 151: state_cost_facts — schema home for STATE-LEVEL sourced
-- cost facts (minimum wage, labor rates, fuel taxes, etc.), Redesign
-- TEMPLATE 07 Operations "By state" sub-list.
--
-- WHY THIS EXISTS (do not fake, HANDOFF §7 "Known new backend work"):
--   The Operations region cards carry a "By state" sub-list for the US
--   (and, reserved, EU member states). Each state row shows per-state
--   figures that MUST carry their own statute citation — a US state
--   without a sourced figure shows PENDING, never a national number
--   presented as state law (HANDOFF §1, §4; feedback_no_legal_role_
--   determination). regional_data_facts (migration 106) is REGION-level
--   only (US, EU, ASIA, UK, UAE); it has no sub-national grain. This
--   table is the first-class store for the sub-national grain so the
--   sub-list renders real, cited state figures once the operator team
--   backfills them — and honestly renders the pending frame until then.
--
-- STATUS: schema home only. NOT applied by the T07 UI dispatch (no data
--   writes, scrape hold live). The Operations "By state" sub-list ships
--   with the pending frame; state cost figures render "—" + reason until
--   sourced rows land here. Apply + backfill is a separate operator-ruled
--   data dispatch under the code-vs-data separation (.claude/CLAUDE.md).

BEGIN;

CREATE TABLE IF NOT EXISTS state_cost_facts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Parent region this state rolls up to (US, and reserved EU). FK so the
  -- Operations region card can join sub-national rows under a region card.
  region_id         UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  -- ISO 3166-2 sub-division code (e.g. 'US-CA', 'US-NY'). The stable key.
  state_code        TEXT NOT NULL,
  -- Display label (e.g. 'California'). Sentence/proper case; no ALL-CAPS.
  state_label       TEXT NOT NULL,
  -- One of the 6 Operations dimensions (shared vocab with regional_data_facts).
  dimension         TEXT NOT NULL,
  fact_label        TEXT NOT NULL,
  value             TEXT NOT NULL,
  unit              TEXT,
  trend             TEXT,
  -- Every state figure carries its OWN statute citation (never a national
  -- average presented as state law). source_id ties to the sources registry;
  -- statute_citation is the human-readable enacted-text reference.
  source_id         UUID REFERENCES sources(id) ON DELETE SET NULL,
  statute_citation  TEXT,
  effective_date    DATE,
  last_updated      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state_code, dimension, fact_label)
);

ALTER TABLE state_cost_facts DROP CONSTRAINT IF EXISTS state_cost_facts_dimension_check;
ALTER TABLE state_cost_facts ADD CONSTRAINT state_cost_facts_dimension_check
  CHECK (dimension IN (
    'regulatory_feasibility',
    'regional_resources',
    'labor_markets',
    'materials_sourcing',
    'infrastructure',
    'operational_cost'
  ));

ALTER TABLE state_cost_facts DROP CONSTRAINT IF EXISTS state_cost_facts_trend_check;
ALTER TABLE state_cost_facts ADD CONSTRAINT state_cost_facts_trend_check
  CHECK (trend IS NULL OR trend IN ('up', 'down', 'flat'));

CREATE INDEX IF NOT EXISTS idx_state_cost_facts_region_dim
  ON state_cost_facts(region_id, dimension);

CREATE INDEX IF NOT EXISTS idx_state_cost_facts_state
  ON state_cost_facts(state_code);

CREATE INDEX IF NOT EXISTS idx_state_cost_facts_source
  ON state_cost_facts(source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON TABLE state_cost_facts IS
  'Sub-national (state / member-state) sourced cost facts for the Operations "By state" sub-list (T07, 2026-07). Each row carries its own statute citation; a state with no row here renders PENDING on the surface, never a national average presented as state law. Region-level facts live in regional_data_facts (106); this table adds the sub-national grain.';

COMMENT ON COLUMN state_cost_facts.state_code IS
  'ISO 3166-2 sub-division code (e.g. US-CA). Stable join key for the By-state sub-list.';

COMMENT ON COLUMN state_cost_facts.statute_citation IS
  'Human-readable enacted-text reference for this state figure. Paired with source_id. Never inferred — a figure without a citation does not belong in this table (it belongs in the pending frame on the surface).';

-- RLS: world-readable (no PII; same posture as regional_data_facts).
ALTER TABLE state_cost_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY state_cost_facts_read ON state_cost_facts FOR SELECT USING (true);

COMMIT;
