-- ════════════════════════════════════════════════════════════════════
-- Migration 020 — intersection-readiness columns on intelligence_items
--
-- Phase B.2.5: extend the agent emission contract so every regenerated
-- brief carries structured tags that drive intersection detection.
--
-- Two regulations "intersect" when they impose overlapping or conflicting
-- requirements on the same operational scenario for the same compliance
-- object. Without structured tags the system can't surface intersections
-- proactively — it would have to re-analyse every brief pair on demand,
-- which doesn't scale and breaks the integrity rule (claims would have
-- to be re-grounded each time).
--
-- Four new columns:
--
--   operational_scenario_tags TEXT[] — open vocabulary of scenarios this
--     item touches (e.g. 'ocean-bunkering', 'EU-import-customs-declaration',
--     'scope-3-emissions-reporting'). The system prompt provides a core
--     glossary of ~30 values; agents prefer those, but may emit new
--     scenarios when the core glossary doesn't fit. Open vocabulary is
--     more honest than forcing a square-peg fit.
--
--   compliance_object_tags TEXT[] — closed vocabulary of supply-chain
--     roles/entities this item imposes obligations on (e.g. 'carrier-ocean',
--     'importer', 'freight-forwarder'). Closed because supply-chain roles
--     are well-defined and joinable across items.
--
--   related_items UUID[] — direct UUID references to other intelligence_items
--     the agent recognises as topically/operationally related. Populated
--     from the agent's source pool when it draws on another item's content
--     during composition. Drives the link graph for intersection detection.
--
--   intersection_summary TEXT — short markdown (≤500 chars) describing
--     how this item interacts with adjacent regulations the agent
--     identified during composition. Sourced; integrity rule applies.
--
-- All four are nullable / default empty so existing rows aren't broken;
-- B.2 regeneration populates them per the new contract.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS operational_scenario_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS compliance_object_tags    TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS related_items             UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intersection_summary      TEXT;

-- GIN indexes on the tag arrays so intersection-detection queries
-- (find items sharing scenario X and compliance object Y) are fast.
CREATE INDEX IF NOT EXISTS idx_items_op_scenario_tags
  ON intelligence_items USING GIN(operational_scenario_tags);
CREATE INDEX IF NOT EXISTS idx_items_compliance_object_tags
  ON intelligence_items USING GIN(compliance_object_tags);
CREATE INDEX IF NOT EXISTS idx_items_related_items
  ON intelligence_items USING GIN(related_items);

COMMENT ON COLUMN intelligence_items.operational_scenario_tags IS
  'Open vocabulary of operational scenarios this item touches. Agents prefer the core glossary in SKILL.md but may emit new scenarios. Drives intersection detection: items sharing scenario tags are intersection candidates.';

COMMENT ON COLUMN intelligence_items.compliance_object_tags IS
  'Closed vocabulary of supply-chain roles/entities this item imposes obligations on. ~18 values per SKILL.md. Drives intersection detection: items imposing on the same role are intersection candidates.';

COMMENT ON COLUMN intelligence_items.related_items IS
  'UUID array of intelligence_items the agent recognised as topically/operationally related during brief composition. Populated from the source pool. Drives the intersection link graph.';

COMMENT ON COLUMN intelligence_items.intersection_summary IS
  'Short markdown (≤500 chars) describing how this item interacts with adjacent regulations the agent identified. Sourced; integrity rule applies. NULL when no intersections were identified during composition.';
