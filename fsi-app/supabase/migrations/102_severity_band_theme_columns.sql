-- Migration 102: Expand severity enum + add signal_band + theme columns
-- on intelligence_items per operator Q1-Q3 decisions (2026-05-24).
--
-- Q1: severity, single column with broad enum allowing all per-surface
--     vocabularies. Each surface applies what fits its content type.
--     Includes the 5-label SKILL.md vocab plus per-surface 4-label sets.
--     Nullable. Existing UPPERCASE values converted to lowercase
--     underscore form (canonical from here forward).
--
-- Q2: signal_band, single column for Market Intel routing
--     (price / corporate / corridor). Nullable for non-market items.
--
-- Q3: theme, single column for Research grouping with the 7 canonical
--     themes. Nullable for non-research items. Explicit column rather
--     than overloading topic_tags[0] semantics per operator guidance,
--     classifier does not emit ordering today and "primary tag" would
--     be retroactive implicit semantics.
--
-- All three columns are nullable. The agent classifier populates them
-- on next regeneration; existing rows stay NULL until reprocessed.
-- Phase 3C dispatches the regex-classifier refactor that swaps
-- ResearchView.assignTheme, MarketPage.assignBand, etc. to read these
-- columns directly.

BEGIN;

-- ── Q1: broaden severity enum ──────────────────────────────────────
ALTER TABLE intelligence_items DROP CONSTRAINT IF EXISTS intelligence_items_severity_check;

UPDATE intelligence_items
SET severity = CASE severity
    WHEN 'ACTION REQUIRED' THEN 'action_required'
    WHEN 'COST ALERT'      THEN 'cost_alert'
    WHEN 'WINDOW CLOSING'  THEN 'window_closing'
    WHEN 'COMPETITIVE EDGE' THEN 'competitive_edge'
    WHEN 'MONITORING'      THEN 'monitoring'
    ELSE severity
END
WHERE severity IS NOT NULL;

ALTER TABLE intelligence_items ADD CONSTRAINT intelligence_items_severity_check
  CHECK (severity IS NULL OR severity IN (
    -- 5-label SKILL.md Market Intel vocabulary
    'action_required', 'cost_alert', 'window_closing', 'competitive_edge', 'monitoring',
    -- 4-label per-surface priority tier vocabulary (Operations, Regulations)
    'critical', 'high', 'moderate', 'low',
    -- 4-label per-surface vocabulary used elsewhere
    'immediate', 'watch', 'reference', 'background'
  ));

COMMENT ON COLUMN intelligence_items.severity IS
  'Per-surface severity vocabulary, single column with broad enum (Q1, 2026-05-24). Allows action_required / cost_alert / window_closing / competitive_edge / monitoring (Market Intel), critical / high / moderate / low (Operations, Regulations), immediate / watch / reference / background (other). Nullable.';

-- ── Q2: signal_band for Market Intel routing ──────────────────────
ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS signal_band TEXT;

ALTER TABLE intelligence_items DROP CONSTRAINT IF EXISTS intelligence_items_signal_band_check;
ALTER TABLE intelligence_items ADD CONSTRAINT intelligence_items_signal_band_check
  CHECK (signal_band IS NULL OR signal_band IN ('price', 'corporate', 'corridor'));

CREATE INDEX IF NOT EXISTS idx_items_signal_band
  ON intelligence_items(signal_band)
  WHERE signal_band IS NOT NULL;

COMMENT ON COLUMN intelligence_items.signal_band IS
  'Market Intel band routing (Q2, 2026-05-24). price / corporate / corridor. Nullable for non-market items.';

-- ── Q3: theme for Research grouping ───────────────────────────────
ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS theme TEXT;

ALTER TABLE intelligence_items DROP CONSTRAINT IF EXISTS intelligence_items_theme_check;
ALTER TABLE intelligence_items ADD CONSTRAINT intelligence_items_theme_check
  CHECK (theme IS NULL OR theme IN (
    'emissions_accounting',
    'fuels_saf',
    'packaging_circular',
    'carbon_markets',
    'cold_chain_art',
    'last_mile_electrification',
    'disclosure_regimes'
  ));

CREATE INDEX IF NOT EXISTS idx_items_theme
  ON intelligence_items(theme)
  WHERE theme IS NOT NULL;

COMMENT ON COLUMN intelligence_items.theme IS
  'Research theme grouping (Q3, 2026-05-24). 7 canonical themes per ResearchView.tsx vocabulary. Nullable for non-research items. Explicit column (NOT topic_tags[0] reuse) per operator guidance.';

COMMIT;
