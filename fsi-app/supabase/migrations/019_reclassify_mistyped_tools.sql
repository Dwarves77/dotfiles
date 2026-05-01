-- ════════════════════════════════════════════════════════════════════
-- Migration 019 — reclassify 8 mis-typed `tool` rows to their proper
-- item_type so the B.2 format-mapping contract picks the right format.
--
-- Pre-state: 15 rows had item_type='tool'. Audit revealed 11 are
-- mis-typed (regulator/agency, regulation, research output, standard,
-- initiative, framework, regional benchmarks). 4 are genuine tools
-- (CDP, EcoVadis, Blue Visby, ICAO Carbon Calculator) and stay 'tool'.
-- 3 institutional bodies (EEA, ECLAC, OECD) are deferred to Phase D
-- pending source-registry vs intelligence-item separation.
--
-- This migration handles the 8 unambiguous reclassifications.
--
-- Post-state: 7 rows remain item_type='tool' (4 genuine + 3 deferred).
-- The 4 genuine tools map to technology_profile per the format
-- selection rule restored in this commit.
-- ════════════════════════════════════════════════════════════════════

-- Group A: regulation
UPDATE intelligence_items SET item_type = 'regulation'
 WHERE legacy_id = 'o6'; -- EU MRV Regulation

-- Group B: research_finding
UPDATE intelligence_items SET item_type = 'research_finding'
 WHERE id = 'b88753be-8ed4-4392-9cee-9f472c208513'; -- Warehouse Solar & BESS ROI Analysis

-- Group C: standard
UPDATE intelligence_items SET item_type = 'standard'
 WHERE id = '9e594959-7de8-41e8-a25c-5b1976f77b34'; -- Green Building Certification Standards

-- Group D: initiative
UPDATE intelligence_items SET item_type = 'initiative'
 WHERE legacy_id = 'l8'; -- Drive Electric

-- Group E: framework (institutional reference dashboards)
UPDATE intelligence_items SET item_type = 'framework'
 WHERE legacy_id IN ('o8', 't5'); -- Alternative Fuels Insight, World Bank Carbon Pricing Dashboard

-- Group F: regional_data (regional benchmark datasets)
UPDATE intelligence_items SET item_type = 'regional_data'
 WHERE id IN (
   'd2b343b4-334d-401e-b93c-962bd8ac9932',  -- Industrial Electricity Tariff Benchmarks (IEA)
   '5b07f503-8dbc-4bb4-b801-6359b5ab6018'   -- Logistics Labor Cost & Availability Benchmarks (BLS)
 );
