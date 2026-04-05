-- ══════════════════════════════════════════════════════════════
-- Migration: Convert legacy resources → intelligence_items
-- ══════════════════════════════════════════════════════════════
--
-- This script runs AFTER seed-sources.sql has populated the
-- sources table. It:
--
-- 1. Reads each row from the legacy resources table
-- 2. Finds the matching source by URL pattern
-- 3. Inserts an intelligence_item linked to that source
-- 4. Copies timelines, changelog, disputes, cross-refs, supersessions
--
-- All 119 legacy resources become Domain 1 (Regulatory) items.
-- ══════════════════════════════════════════════════════════════

-- Step 1: Insert intelligence_items from resources, with source linkage
INSERT INTO intelligence_items (
  legacy_id,
  title,
  summary,
  what_is_it,
  why_matters,
  key_data,
  tags,
  domain,
  category,
  item_type,
  source_id,
  source_url,
  jurisdictions,
  transport_modes,
  priority,
  reasoning,
  added_date,
  is_archived,
  archive_reason,
  archive_note,
  archived_date
)
SELECT
  r.id AS legacy_id,
  r.title,
  r.note AS summary,
  r.what_is_it,
  r.why_matters,
  r.key_data,
  r.tags,
  1 AS domain,  -- All legacy resources are Domain 1 (Regulatory)
  r.topic AS category,
  CASE
    WHEN r.type IN ('regulation', 'law', 'legal', 'rule') THEN 'regulation'
    WHEN r.type = 'standard' THEN 'standard'
    WHEN r.type = 'framework' THEN 'framework'
    WHEN r.type = 'certification' THEN 'standard'
    WHEN r.type = 'tool' THEN 'tool'
    WHEN r.type = 'data' THEN 'tool'
    WHEN r.type = 'initiative' THEN 'initiative'
    WHEN r.type = 'industry' THEN 'initiative'
    WHEN r.type = 'news' THEN 'market_signal'
    WHEN r.type = 'academic' THEN 'research_finding'
    WHEN r.type = 'innovation' THEN 'innovation'
    ELSE 'regulation'
  END AS item_type,
  -- Source linkage: find the best matching source by URL pattern
  (
    SELECT s.id FROM sources s
    WHERE
      CASE
        WHEN r.url ILIKE '%eur-lex.europa.eu%' THEN s.name = 'EUR-Lex'
        WHEN r.url ILIKE '%transport.ec.europa.eu%' THEN s.name = 'EUR-Lex'
        WHEN r.url ILIKE '%environment.ec.europa.eu%' THEN s.name = 'EUR-Lex'
        WHEN r.url ILIKE '%climate.ec.europa.eu%' THEN s.name = 'EC DG CLIMA Shipping'
        WHEN r.url ILIKE '%taxation-customs.ec.europa.eu%' THEN s.name = 'EC CBAM Portal'
        WHEN r.url ILIKE '%mrv.emsa.europa.eu%' THEN s.name = 'THETIS-MRV'
        WHEN r.url ILIKE '%ec.europa.eu%' THEN s.name = 'European Commission Press Corner'
        WHEN r.url ILIKE '%consilium.europa.eu%' THEN s.name = 'Council of the European Union Press'
        WHEN r.url ILIKE '%europa.eu%' THEN s.name = 'EUR-Lex'
        WHEN r.url ILIKE '%imo.org%' THEN s.name = 'International Maritime Organization'
        WHEN r.url ILIKE '%icao.int%' THEN s.name = 'International Civil Aviation Organization'
        WHEN r.url ILIKE '%epa.gov%' THEN s.name = 'US EPA Emissions Regulations'
        WHEN r.url ILIKE '%federalregister.gov%' THEN s.name = 'Federal Register'
        WHEN r.url ILIKE '%legislation.gov.uk%' THEN s.name = 'UK Legislation'
        WHEN r.url ILIKE '%gov.uk%' THEN s.name = 'UK Legislation'
        WHEN r.url ILIKE '%iea.org%' THEN s.name = 'IEA Policies and Measures Database'
        WHEN r.url ILIKE '%theicct.org%' THEN s.name = 'ICCT Freight'
        WHEN r.url ILIKE '%itf-oecd.org%' THEN s.name = 'International Transport Forum'
        WHEN r.url ILIKE '%iso.org%' THEN s.name = 'ISO 14083'
        WHEN r.url ILIKE '%smartfreightcentre.org%' THEN s.name = 'Smart Freight Centre / GLEC Framework'
        WHEN r.url ILIKE '%ghgprotocol.org%' THEN s.name = 'GHG Protocol'
        WHEN r.url ILIKE '%sciencebasedtargets.org%' THEN s.name = 'Science Based Targets initiative'
        WHEN r.url ILIKE '%cdp.net%' THEN s.name = 'CDP Supply Chain'
        WHEN r.url ILIKE '%ifrs.org%' THEN s.name = 'IFRS / ISSB Sustainability Standards'
        WHEN r.url ILIKE '%fiata.org%' THEN s.name = 'FIATA Sustainability'
        WHEN r.url ILIKE '%unfccc.int%' THEN s.name = 'UNFCCC NDC Registry'
        WHEN r.url ILIKE '%carbonpricingdashboard.worldbank.org%' THEN s.name = 'World Bank Carbon Pricing Dashboard'
        WHEN r.url ILIKE '%eea.europa.eu%' THEN s.name = 'European Environment Agency'
        WHEN r.url ILIKE '%icapcarbonaction.com%' THEN s.name = 'ICAP Allowance Price Explorer'
        WHEN r.url ILIKE '%irena.org%' THEN s.name = 'IRENA Publications'
        WHEN r.url ILIKE '%arb.ca.gov%' THEN s.name = 'US EPA Emissions Regulations'
        WHEN r.url ILIKE '%ctl.mit.edu%' THEN s.name = 'MIT Center for Transportation and Logistics'
        ELSE FALSE
      END
    LIMIT 1
  ) AS source_id,
  r.url AS source_url,
  CASE
    WHEN r.jurisdiction IS NOT NULL THEN ARRAY[r.jurisdiction]
    ELSE ARRAY['global']
  END AS jurisdictions,
  r.modes AS transport_modes,
  r.priority,
  r.reasoning,
  r.added_date,
  r.is_archived,
  r.archive_reason,
  r.archive_note,
  r.archived_date
FROM resources r;

-- Step 2: Copy timelines to item_timelines
-- Legacy dates may be partial (e.g. "2023-07"), so pad with "-01" if needed
INSERT INTO item_timelines (item_id, milestone_date, label, is_completed, sort_order)
SELECT
  ii.id AS item_id,
  CASE
    WHEN t.date ~ '^\d{4}-\d{2}-\d{2}$' THEN t.date::DATE
    WHEN t.date ~ '^\d{4}-\d{2}$' THEN (t.date || '-01')::DATE
    WHEN t.date ~ '^\d{4}$' THEN (t.date || '-01-01')::DATE
    ELSE CURRENT_DATE
  END AS milestone_date,
  t.label,
  COALESCE(t.status = 'past', FALSE) AS is_completed,
  t.sort_order
FROM timelines t
JOIN intelligence_items ii ON ii.legacy_id = t.resource_id;

-- Step 3: Copy changelog to item_changelog
INSERT INTO item_changelog (item_id, change_date, change_type, field, previous_value, new_value, impact)
SELECT
  ii.id AS item_id,
  c.date AS change_date,
  c.type AS change_type,
  COALESCE(c.fields[1], 'unknown') AS field,
  COALESCE(c.prev_value, '') AS previous_value,
  COALESCE(c.now_value, '') AS new_value,
  c.impact
FROM changelog c
JOIN intelligence_items ii ON ii.legacy_id = c.resource_id;

-- Step 4: Copy disputes to item_disputes
INSERT INTO item_disputes (item_id, is_active, note, disputing_sources)
SELECT
  ii.id AS item_id,
  d.active AS is_active,
  d.note,
  d.sources AS disputing_sources
FROM disputes d
JOIN intelligence_items ii ON ii.legacy_id = d.resource_id;

-- Step 5: Copy cross-references to item_cross_references
-- Map legacy 'references' to 'related' (valid check constraint values)
INSERT INTO item_cross_references (source_item_id, target_item_id, relationship)
SELECT
  s_ii.id AS source_item_id,
  t_ii.id AS target_item_id,
  CASE
    WHEN cr.relationship IN ('related', 'supersedes', 'implements', 'conflicts', 'amends', 'depends_on') THEN cr.relationship
    WHEN cr.relationship = 'references' THEN 'related'
    ELSE 'related'
  END AS relationship
FROM cross_references cr
JOIN intelligence_items s_ii ON s_ii.legacy_id = cr.source_id
JOIN intelligence_items t_ii ON t_ii.legacy_id = cr.target_id
ON CONFLICT (source_item_id, target_item_id) DO NOTHING;

-- Step 6: Copy supersessions to item_supersessions
INSERT INTO item_supersessions (old_item_id, new_item_id, supersession_date, severity, note)
SELECT
  old_ii.id AS old_item_id,
  new_ii.id AS new_item_id,
  CASE
    WHEN s.date ~ '^\d{4}-\d{2}-\d{2}$' THEN s.date::DATE
    WHEN s.date ~ '^\d{4}-\d{2}$' THEN (s.date || '-01')::DATE
    WHEN s.date ~ '^\d{4}$' THEN (s.date || '-01-01')::DATE
    ELSE CURRENT_DATE
  END AS supersession_date,
  s.severity,
  s.note
FROM supersessions s
JOIN intelligence_items old_ii ON old_ii.legacy_id = s.old_id
JOIN intelligence_items new_ii ON new_ii.legacy_id = s.new_id;

-- Step 7: Log the migration as trust events for each source that gained items
INSERT INTO source_trust_events (source_id, event_type, details, created_by)
SELECT DISTINCT
  ii.source_id,
  'discovery',
  jsonb_build_object(
    'type', 'discovery',
    'discovered_via', 'manual_add',
    'initial_tier', s.tier,
    'items_migrated', (SELECT COUNT(*) FROM intelligence_items WHERE source_id = ii.source_id)
  ),
  'system'
FROM intelligence_items ii
JOIN sources s ON ii.source_id = s.id
WHERE ii.source_id IS NOT NULL;
