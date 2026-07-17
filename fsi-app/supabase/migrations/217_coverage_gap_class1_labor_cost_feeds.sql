-- 217_coverage_gap_class1_labor_cost_feeds.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Category-driven discovery,
-- superseding the single-instance Gemini delta: the external review diagnosed missing COVERAGE
-- CLASSES; this expands each class to full jurisdictional/vertical membership. Multi-session job,
-- banked per class. This bank: CLASS 1 (jurisdictional labor-cost feeds), pattern instances BLS
-- (row 23) and Eurostat (row 24) already exist; this migration adds full membership across the
-- remaining operator jurisdictions.
--
-- SCHEMA NOTE (deviation flagged, not silent): the operator's instruction named "a new
-- coverage_class column" for the 9 pattern-classes, but coverage_class already exists with a
-- DIFFERENT meaning (the MISSING/AMBIGUOUS_ARCHIVED/HAVE_QUARANTINED evidence hierarchy from the
-- original discovery pass). Not overloading that column. Adding a distinct `discovery_class`
-- column for the 9 pattern-classes, and extending `data_class` with a third value `tracker` for
-- classes 4-6 (rulemaking/reporting/enforcement trackers are neither regulatory instruments nor
-- numeric data feeds).
ALTER TABLE public.coverage_gap_candidates
  ADD COLUMN IF NOT EXISTS discovery_class text
    CHECK (discovery_class IN (
      'labor_cost_feed', 'energy_price_feed', 'commercial_fuel_assessment',
      'state_subnational_tracker', 'compliance_reporting_portal', 'enforcement_verification_system',
      'lca_disclosure_verification', 'market_intel_source', 'research_horizon_source'
    ));

COMMENT ON COLUMN public.coverage_gap_candidates.discovery_class IS
  'Which of the 9 operator-defined coverage classes (Gemini-review-driven category expansion, 2026-07-17) this row belongs to. NULL for rows from the original single-pass discovery job (ranks 1-22) and the pre-category Gemini delta (ranks 23-28), which predate this categorization. Distinct from coverage_class (the MISSING/AMBIGUOUS_ARCHIVED/HAVE_QUARANTINED evidence hierarchy) -- do not conflate the two.';

ALTER TABLE public.coverage_gap_candidates
  DROP CONSTRAINT coverage_gap_candidates_data_class_check;
ALTER TABLE public.coverage_gap_candidates
  ADD CONSTRAINT coverage_gap_candidates_data_class_check
    CHECK (data_class IN ('instrument', 'data_feed', 'tracker'));

-- CLASS 1 membership, entity-confirmed. Retrieval-before-generation catch: ILO ILOSTAT
-- (ilo.org / ilostat.ilo.org) is ALREADY a registered platform source (T3 authority per the
-- Section-3 host census) -- a global aggregator, not a per-jurisdiction primary; NOT added here
-- as a new gap since the operator asked for national primaries, and it is already covered.
INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(29, 'UK ONS labour cost / earnings data (ASHE by SIC, transport and storage)', 'uk', 'road (UK labor cost benchmark)', 'road',
 'Free official statistics, entity-confirmed. Annual Survey of Hours and Earnings (ASHE) provides UK-specific wage data by 2-digit SIC (covers transport/storage codes), region-breakable. Free access also via the Nomis portal. Direct UK-equivalent of the BLS/Eurostat pattern for the road-secondary mode.',
 'HIGH', 'MISSING', NULL, 'minor', true, 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/regionbyindustry2digitsicashetable5',
 'Entity-confirmed: ONS ASHE Table 5 dataset real and SIC-filterable. No single documented REST API found in this pass (ONS offers dataset downloads + the Nomis portal, not a dedicated timeseries API like BLS/EIA) -- flagged as download/portal-access, not confirmed-API, a distinction for the feed-build task.',
 'data_feed', 'labor_cost_feed'),

(30, 'Japan MHLW Basic Survey on Wage Structure (via e-Stat), transportation and warehousing', 'asia', 'road / ocean (Japan labor cost benchmark)', 'multi',
 'Free official statistics, entity-confirmed. e-Stat (Japan''s government statistics portal) hosts the MHLW Basic Survey on Wage Structure with transportation/warehousing industry breakdowns (road freight, water transport, warehousing services segments).',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.e-stat.go.jp/en/statistics/00450091',
 'Entity-confirmed: e-Stat dataset real, MHLW-sourced. Specific API endpoint/query parameters not enumerated in this pass -- e-Stat does offer a documented API (api.e-stat.go.jp) per general knowledge but the exact application-specific query was not confirmed live; flagged for the feed-build task to verify the API path before use.',
 'data_feed', 'labor_cost_feed'),

(31, 'Singapore MOM labour market statistics (wages, transport sector)', 'asia', 'ocean (Singapore hub labor cost benchmark)', 'ocean',
 'Free official statistics, entity-confirmed. MOM''s Labour Market Statistics and Publications (stats.mom.gov.sg) tracks occupational wages and sector employment; Singapore is a top transhipment hub, ocean-tertiary-mode relevant but high-value given hub concentration.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://stats.mom.gov.sg/',
 'Entity-confirmed: MOM stats portal real. No dedicated public API found in this pass (table/report downloads); flagged as portal-access not confirmed-API.',
 'data_feed', 'labor_cost_feed'),

(32, 'Brazil IBGE Encuesta Anual de Transportes / Monthly Survey of Industrial Employment and Wages', 'latam', 'road / ocean (Brazil transport-sector labor cost benchmark)', 'multi',
 'Free official statistics, entity-confirmed, STRONG fit: IBGE''s Annual Transport Survey (Pesquisa Anual de Transportes) is a TRANSPORT-SECTOR-SPECIFIC survey (SCIAN/CNAE transport, postal, storage services, ~95% of sector income value), a better direct match than a generic national wage survey.',
 'HIGH', 'MISSING', NULL, 'minor', true, 'https://www.ibge.gov.br/en/statistics/economic/industry-and-construction/17330-pesquisa-industrial-mensal-de-emprego-e-salario-2.html',
 'Entity-confirmed: IBGE Monthly Survey of Industrial Employment and Wages (PIMES) real; the more sector-specific Pesquisa Anual de Transportes also confirmed real (inegi-equivalent style annual transport survey) -- noting the general PIMES url here as the closer wage-data match, transport-sector annual survey as a companion.',
 'data_feed', 'labor_cost_feed'),

(33, 'Mexico INEGI Encuesta Anual de Transportes (EAT) / ENOE, transport-postal-storage', 'latam', 'road / ocean (Mexico transport-sector labor cost benchmark)', 'multi',
 'Free official statistics, entity-confirmed, STRONG fit: INEGI''s Encuesta Anual de Transportes (EAT) is a dedicated transport/postal/storage-sector annual survey (SCIAN classification, ~95.4% of sector income value covered), a better direct match than the general national employment survey (ENOE).',
 'HIGH', 'MISSING', NULL, 'minor', true, 'https://www.inegi.org.mx/programas/eat/2018/',
 'Entity-confirmed: EAT (transport-sector-specific) real; ENOE (general national labor survey) also confirmed real as a companion source. No documented public REST API found in this pass; INEGI offers structured downloads via inegi.org.mx, flagged as download/portal-access.',
 'data_feed', 'labor_cost_feed'),

(34, 'UAE FCSA UAE.Stat labour force and wage statistics', 'meaf', 'air / ocean (UAE hub labor cost benchmark)', 'multi',
 'Free official statistics, entity-confirmed. The Federal Competitiveness and Statistics Authority (FCSA, formerly FCSC) operates UAE.Stat, publishing labour force size and wage-category breakdowns. UAE is a major air-cargo (DXB/DWC) and ocean-transhipment (Jebel Ali) hub, dual mode relevance.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://uaestat.fcsc.gov.ae/en',
 'Entity-confirmed: FCSA/UAE.Stat real, includes a structured data-visualization/query interface (SDMX-style df/vs parameters visible in the URL structure) suggesting a queryable backend, not yet confirmed as a stable public API.',
 'data_feed', 'labor_cost_feed'),

(35, 'Switzerland BFS/OFS Swiss Earnings Structure Survey (ESS)', 'meaf', 'air (Switzerland CH-origin labor cost benchmark)', 'air',
 'Free official statistics, entity-confirmed. The Federal Statistical Office''s biennial Earnings Structure Survey (ESS) covers all economic activities incl. transport, with the STAT-TAB interactive database for custom queries. CH is an air-cargo and luxury-goods node per the operator''s vertical profile.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.bfs.admin.ch/bfs/en/home/statistics/work-income/wages-income-employment-labour-costs/earnings-structure.html',
 'Entity-confirmed: BFS ESS real, biennial cadence (2024 latest), STAT-TAB database confirmed as the query interface. No dedicated timeseries API found in this pass.',
 'data_feed', 'labor_cost_feed'),

(36, 'South Africa Stats SA Quarterly Employment Statistics (QES), transport sector', 'meaf', 'road (South Africa transport-sector labor cost benchmark)', 'road',
 'Free official statistics, entity-confirmed. Stats SA''s Quarterly Employment Statistics (P0277) reports employee counts and gross earnings by industry incl. transport, with recent transport-sector employment gains specifically noted (73,000 Q1 2025).',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.statssa.gov.za/?p=18527',
 'Entity-confirmed: Stats SA QES real, transport-industry breakdown confirmed present in the published bulletins. No dedicated public API found in this pass; PDF/bulletin-based publication.',
 'data_feed', 'labor_cost_feed');
