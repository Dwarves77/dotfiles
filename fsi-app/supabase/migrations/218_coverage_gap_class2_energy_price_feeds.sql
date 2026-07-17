-- 218_coverage_gap_class2_energy_price_feeds.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Category-driven discovery bank 2
-- of 9: CLASS 2 (energy and electricity price feeds), pattern instance EIA (row 25) already
-- exists; this migration adds full membership across the remaining operator jurisdictions.
-- Retrieval-before-generation catch: IEA (iea.org) is ALREADY a registered platform source (T3
-- authority per the Section-3 host census) -- a global aggregator, NOT added here as a new gap.

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(37, 'Eurostat electricity prices for non-household (industrial) consumers (nrg_pc_205)', 'eu', 'multi (EU industrial electricity cost benchmark)', 'multi',
 'Free official statistics, entity-confirmed real API-accessible dataset (nrg_pc_205, bi-annual since 2007, 43 regions, industrial consumption bands IB-IE). Direct EU-equivalent of the EIA pattern for warehouse/port energy cost baselines.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_205/default/table?lang=en',
 'Entity-confirmed: real dataset, DOI 10.2908/nrg_pc_205, accessible via the same Eurostat REST API pattern as rank 24 (statistics/1.0/data/nrg_pc_205) and via DBnomics as a documented alternative. Companion to the rank 24 labor-cost Eurostat row, same host.',
 'data_feed', 'energy_price_feed'),

(38, 'UK DESNZ Quarterly Energy Prices (non-domestic/industrial electricity, by consumption band)', 'uk', 'multi (UK industrial electricity cost benchmark)', 'multi',
 'Free official statistics, entity-confirmed. Quarterly Energy Prices publication covers non-domestic electricity/gas by consumption size band, with and without Climate Change Levy. Direct UK-equivalent of the EIA pattern.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.gov.uk/government/collections/quarterly-energy-prices',
 'Entity-confirmed: real, DESNZ-published, quarterly cadence (latest editions confirmed through March 2026). Published as bulletins/CSV tables (data.gov.uk dataset also confirmed), not a dedicated REST API.',
 'data_feed', 'energy_price_feed'),

(39, 'Japan METI/ANRE General Energy Statistics (industrial electricity pricing)', 'asia', 'multi (Japan industrial electricity cost benchmark)', 'multi',
 'Free official statistics, entity-confirmed. METI''s Agency for Natural Resources and Energy (ANRE) publishes annual General Energy Statistics with industrial electricity price tracking; also feeds e-Stat.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.meti.go.jp/english/statistics/',
 'Entity-confirmed: METI/ANRE real, annual cadence, publication-based (not a dedicated timeseries API found in this pass).',
 'data_feed', 'energy_price_feed'),

(40, 'Singapore EMA regulated electricity tariff + Uniform Singapore Energy Price (USEP)', 'asia', 'ocean (Singapore hub industrial/wholesale electricity benchmark)', 'ocean',
 'Free official statistics, entity-confirmed, STRONG fit: EMA publishes the quarterly regulated tariff (cents/kWh, cost-component breakdown) AND the half-hourly USEP wholesale price. Singapore hub relevance for warehouse/transhipment energy cost.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.ema.gov.sg/resources/statistics/average-monthly-uniform-singapore-energy-price',
 'Entity-confirmed: EMA real, both the regulated-tariff series and the USEP wholesale-price series confirmed live and current (2026 Q3 rate cited). Some EMA datasets also mirrored on data.gov.sg (Singapore''s open-data portal).',
 'data_feed', 'energy_price_feed'),

(41, 'Brazil ANEEL open-data tariff datasets (Tarifa de Energia / TUSD, distributor-level)', 'latam', 'multi (Brazil industrial electricity cost benchmark)', 'multi',
 'Free official open data, entity-confirmed. ANEEL''s Open Data Portal publishes Energy Rate (TE) and Distribution System Usage Rate (TUSD) values per distributor from tariff-adjustment proceedings, under a formal 2025-2027 Open Data Plan.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://dadosabertos.aneel.gov.br/dataset/tarifas-distribuidoras-energia-eletrica',
 'Entity-confirmed: dadosabertos.aneel.gov.br real, CSV datasets confirmed downloadable now; a formal API exists but requires Conecta platform authorization (email-based approval process), flagged as a access-friction note for the feed-build task, not a license cost.',
 'data_feed', 'energy_price_feed'),

(42, 'Mexico CRE/CFE industrial electricity tariffs (Gran Demanda / Media Tension)', 'latam', 'multi (Mexico industrial electricity cost benchmark)', 'multi',
 'Free official published tariffs, entity-confirmed. CRE sets the methodology; CFE publishes the resulting 17 tariff-division industrial rate schedules (e.g. Gran Demanda en Media Tension Horaria for >=100kW demand).',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://app.cfe.mx/Aplicaciones/CCFE/Tarifas/TarifasCREIndustria/Tarifas/GranDemandaMTH.aspx',
 'Entity-confirmed: CRE/CFE real, tariff schedules published and DOF-gazetted. Portal/table-based, no dedicated API found in this pass.',
 'data_feed', 'energy_price_feed'),

(43, 'Switzerland ElCom electricity price and tariff data (LINDAS linked-data service)', 'meaf', 'air (Switzerland industrial/business electricity cost benchmark)', 'air',
 'Free official statistics, entity-confirmed, STRONGEST API fit in this class besides EIA/Eurostat: ElCom publishes tariff comparisons across all Swiss network operators/communes, AND exposes a structured LINKED-DATA service (LINDAS, energy.ld.admin.ch) -- the closest thing to a documented machine-queryable endpoint found for a non-US/EU jurisdiction in this pass.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://energy.ld.admin.ch/elcom/electricityprice-swiss',
 'Entity-confirmed: ElCom real, the LINDAS linked-data endpoint confirmed live (also listed on opendata.swiss under the ElCom organization page). Household-tariff-focused in the search results; a business/industrial-tariff-specific slice not separately confirmed in this pass, flagged for the feed-build task to verify.',
 'data_feed', 'energy_price_feed'),

(44, 'South Africa NERSA-approved Eskom electricity tariffs (industrial/large-power-user)', 'meaf', 'road (South Africa industrial electricity cost benchmark)', 'road',
 'Free official published tariffs, entity-confirmed. NERSA approves and publishes Eskom''s annual tariff determinations; industrial/large-power-user rates and negotiated price agreements are separately tracked given South Africa''s well-documented energy-cost pressure on freight-adjacent heavy industry.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.nersa.org.za/',
 'Entity-confirmed: NERSA real, FY2026/2027 tariff determinations confirmed current (8.76% increase cited, effective 1 Apr 2026). Publication/PDF-based, no dedicated API found in this pass.',
 'data_feed', 'energy_price_feed'),

(45, 'UAE FCSA electricity tariff by entity, slab consumption and sector (federal statistical dataset)', 'meaf', 'air / ocean (UAE hub industrial electricity cost benchmark)', 'multi',
 'Free official statistics, entity-confirmed, STRONG fit: a dedicated FCSA federal dataset (DF_ELECTR_TCO) aggregating electricity tariffs by entity (emirate utility), consumption slab, AND sector -- stronger than any single-emirate utility page (DEWA/ADDC) since it is the national statistical authority''s cross-emirate, sector-filterable aggregation.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://uaestat.fcsc.gov.ae/vis?lc=en&fs%5B0%5D=FCSC+-+Statistical+Hierarchy%2C0%7CElectricity&df%5Bid%5D=DF_ELECTR_TCO&df%5Bag%5D=FCSA',
 'Entity-confirmed: FCSA/UAE.Stat real, same host and platform as rank 34 (labor statistics), a distinct dataset (DF_ELECTR_TCO) on the same SDMX-style query interface. Structured query interface confirmed; stable public REST API not separately confirmed.',
 'data_feed', 'energy_price_feed');
