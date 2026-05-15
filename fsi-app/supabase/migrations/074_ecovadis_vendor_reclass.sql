-- Migration 074: reclassify EcoVadis as vendor_corporate
--
-- EcoVadis is a SaaS auditing/ratings platform, not a policy or
-- statistical data source. The 5 EcoVadis source rows were bulk-defaulted
-- with classification_rationale = 'tier 4 default' or 'tier 5 default'
-- and LOW confidence (3 as statistical_data_agency tier 4, 2 as trade_press
-- tier 5). 2 of the 5 EcoVadis intelligence_items were classified with
-- item_type = 'technology', which placed the highest-priority row inside
-- the Market Intel "POLICY ACCELERATION SIGNALS" section (tech tab).
--
-- Operator surfaced this in screenshot 2026-05-15: "ecovadis is a company
-- that provides auditing, why is it in market intel? It doesnt provide
-- content for market intel, its a resource for auditing".
--
-- Fix:
--   (a) Reclassify all 5 EcoVadis source rows to source_role =
--       'vendor_corporate', tier = 5, expected_output skewed toward
--       Operations + Out_of_Scope (auditing platform, not a content source).
--   (b) Re-type the 2 EcoVadis intel rows with item_type = 'technology' to
--       item_type = 'tool', matching the existing EcoVadis 'tool' row at
--       19f08fcc and removing them from the Market Intel tech-tab gate
--       at MarketPage.tsx:128-130.
--
-- Note on PR #108: PR #108 added a vendor filter to PolicySignals.tsx that
-- gates on item_type in (tool, tracker, news, journal, industry). With (b)
-- applied, EcoVadis falls into 'tool' and is captured by that filter.
-- (b) is the load-bearing fix for the visible bug; (a) corrects the
-- upstream classification so future EcoVadis ingestions route correctly
-- without depending on the downstream filter.
--
-- Idempotent: keyed by stable id; final state is the target state
-- regardless of how many times this runs.

BEGIN;

-- (a) Sources: 5 EcoVadis rows -> vendor_corporate, tier 5, vendor expected_output.
--     Reset rationale + confidence to reflect the manual correction.
UPDATE sources
SET
  source_role = 'vendor_corporate',
  tier = 5,
  expected_output = '{"Regulatory":0,"Research":0.05,"Market_Intel":0.05,"Operations":0.85,"Out_of_Scope":0.05}'::jsonb,
  classification_assigned_at = NOW(),
  classification_rationale = 'manual reclass from tier-4/5 default; SaaS auditing/ratings vendor (operator confirmed 2026-05-15)',
  classification_confidence = 'HIGH'
WHERE id IN (
  '6f698bf0-8e67-4432-83d1-83f9daff7283'::uuid,
  '4a956756-9117-451e-b3f1-1e976dd79e39'::uuid,
  'a6b20a8a-e6a9-41aa-9c6c-0f38b71016ba'::uuid,
  'a2d25d50-0bb7-4b7c-8cda-e37d26803e8e'::uuid,
  '4fdb662c-3ab1-4987-b754-5530c9e511e1'::uuid
);

-- (b) Items: re-type the 2 EcoVadis intel rows with item_type='technology' to 'tool'.
--     Other 3 EcoVadis rows are already correctly typed (1 'tool' + 2 'market_signal').
UPDATE intelligence_items
SET item_type = 'tool'
WHERE id IN (
  '8107ba33-30e8-4e73-bee2-dd967f995114'::uuid,
  '05b786f8-8753-4e81-923e-ee9d76c56609'::uuid
)
AND item_type = 'technology';

COMMIT;
