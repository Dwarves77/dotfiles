-- 226_coverage_gap_class8_market_intel_sources.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Category-driven discovery bank 8
-- of 9: CLASS 8 (Market Intel sources), 4 sub-parts per the addendum. 9 new entity-confirmed rows
-- (rank 82-90) across freight rate indices, carbon/compliance market pricing, capacity/demand
-- signals, and SAF/alt-fuel trackers beyond Platts.
--
-- Retrieval-before-generation catches, THREE significant hits found before drafting: (1) Drewry
-- World Container Index -- the exact drewry.co.uk WCI page is ALREADY a registered platform
-- source -- NOT added, despite being the class's most-cited freight rate benchmark, this is HAVE.
-- (2) ICAP Allowance Price Explorer -- the exact icapcarbonaction.com/en/ets-prices page is
-- ALREADY registered -- NOT added, HAVE. (3) World Bank Carbon Pricing Dashboard -- already
-- registered -- noted, not re-added. IATA and UNCTAD/World Bank are registered broadly at OTHER
-- pages/subdomains but not the specific CargoIS or container-throughput pages this bank asks for,
-- so those 2 rows stand as genuine gaps at the correct granularity (same host-vs-page pattern seen
-- repeatedly in classes 4, 5, 7).

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(82, 'Freightos Baltic Index (FBX) — container freight rate index, 12 major global trade routes plus composite', 'global', 'ocean (ocean container spot-rate benchmark, 12-lane coverage)', 'ocean',
 'FREE headline index / LICENSED for full platform access, entity-confirmed. Sourced through the Freightos platform; broader lane coverage (12 routes) than Drewry WCI''s 8 (Drewry WCI itself is already a registered platform source, not re-added here). A distinct methodology and lane set from the already-registered WCI, not a duplicate.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.freightos.com/freight-index/',
 'Entity-confirmed: real, live, widely cited alongside Drewry WCI and the Shanghai Containerized Freight Index (SCFI) as one of the 3-4 dominant container spot-rate benchmarks.',
 'data_feed', 'market_intel_source'),

(83, 'Xeneta ocean and air freight rate benchmarking platform (real contracted + spot rates, 60,000+ airport pairs, shipper/forwarder-contributed)', 'global', 'ocean / air (real-transaction-based freight rate benchmarking, both modes)', 'multi',
 'LICENSED, entity-confirmed as real and paid. Unlike index-style products (WCI, FBX), Xeneta aggregates anonymized ACTUAL contracted and spot rates contributed directly by shippers/forwarders across both ocean and air in one platform -- the only dual-mode instance found in this sub-part, directly relevant given the workspace''s air-primary / ocean-tertiary profile.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.xeneta.com/',
 'Entity-confirmed: real, live, subscription-gated (calculator tools offer limited free benchmarking, full platform access is licensed). FLAGGED for operator spend-and-license decision before any acquisition step.',
 'data_feed', 'market_intel_source'),

(84, 'TAC Index — official air cargo pricing benchmark (timestamped rate data, airlines/forwarders/financial media)', 'global', 'air (air cargo rate benchmark, workspace''s primary transport mode)', 'air',
 'LICENSED, entity-confirmed as real and paid. Positioned as "the official benchmark for air cargo pricing", trusted by airlines and financial media -- the air-mode-specific equivalent of the ocean-focused WCI/FBX pattern, directly matching the workspace''s air-primary transport priority.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.tacindex.com/',
 'Entity-confirmed: real, live. FLAGGED for operator spend-and-license decision; no public free tier confirmed in this pass.',
 'data_feed', 'market_intel_source'),

(85, 'EEX (European Energy Exchange) EU ETS Spot, Futures and Options market (common EU allowance auction platform)', 'eu', 'multi (EU carbon-allowance price benchmark, 28-country common auction platform)', 'multi',
 'Free public price data plus licensed trading access, entity-confirmed. EEX is the common auction platform for 28 countries'' (25 EU member states plus Iceland, Liechtenstein, Norway) EUA/EUAA allowances; EUAs traded at approximately EUR 72/tCO2e as of April 2026 per this pass''s search (EUR 60-95 range over 2025-26).',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.eex.com/en/markets/environmental-markets/eu-ets-spot-futures-options',
 'Entity-confirmed: real, live. Distinct from the already-registered ICAP and World Bank Carbon Pricing Dashboard sources (which aggregate/visualize prices from multiple exchanges); EEX is a primary EXCHANGE-level source, not an aggregator.',
 'data_feed', 'market_intel_source'),

(86, 'ICE (Intercontinental Exchange) EU carbon allowance futures and options (EUA, EUA 2)', 'global', 'multi (EU carbon-derivatives market, most liquid global venue per this pass)', 'multi',
 'Free headline price data plus licensed trading access, entity-confirmed. ICE is described as providing "the most liquid carbon derivatives market in the world"; the EUA 2 futures contract (tied to the incoming ETS2 covering buildings/road-transport fuel combustion, operational 2027) launched May 6, 2025 -- a forward-looking signal directly relevant to road-secondary-mode cost planning.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://ir.theice.com/press/news-details/2025/ICE-Launches-EU-Carbon-Allowance-2-Futures/default.aspx',
 'Entity-confirmed: real, live. Companion primary-exchange row to EEX (rank 85); ICAP (already registered) aggregates prices from both.',
 'data_feed', 'market_intel_source'),

(87, 'IATA CargoIS — air cargo capacity, demand, and trade-lane market intelligence (30,000+ forwarders, 300+ airlines, 140,000+ airport-pair coverage)', 'global', 'air (air cargo capacity/demand benchmarking, workspace''s primary transport mode)', 'air',
 'LICENSED, entity-confirmed as real and paid, per the operator''s original flag ("IATA CargoIS flagged"). 21M+ airway bills, $65B in charges, weekly-updated capacity and demand data across 140,000+ airport-to-airport lanes -- the deepest air-cargo capacity/demand dataset found in this discovery job, directly matching the workspace''s air-primary mode.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.iata.org/en/services/data/cargo/cargois/',
 'Entity-confirmed: real, live, subscription product (access model not fully priced in this pass -- IATA membership/data-services terms vary). FLAGGED for operator spend-and-license decision. Distinct from the already-registered IATA DGR, SAF-program, and fact-sheet pages (different IATA product lines).',
 'data_feed', 'market_intel_source'),

(88, 'UNCTADstat container port throughput database (annual, TEU, global port-level and aggregate)', 'global', 'ocean (global container-port capacity/demand signal)', 'ocean',
 'Free official statistics, entity-confirmed. 920 million TEU handled globally in 2024 (6.9% growth, versus 0.6%/year in 2022-2023) per this pass''s search; UNCTADstat''s dataviewer is the primary source, mirrored (not duplicated) by the World Bank''s Container port traffic indicator (data.worldbank.org/indicator/IS.SHP.GOOD.TU, which the World Bank itself sources from UNCTAD) -- one row chosen to avoid a near-duplicate primary/mirror pair per the dedup-before-grounding doctrine.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://unctadstat.unctad.org/datacentre/dataviewer/US.ContPortThroughput',
 'Entity-confirmed: real, live, last updated April 15, 2026 per this pass. Distinct subdomain/page from the already-registered unctad.org topic pages (unctadstat.unctad.org is UNCTAD''s statistics-specific subdomain, not represented among the already-registered unctad.org URLs).',
 'data_feed', 'market_intel_source'),

(89, 'Fastmarkets SAF (Sustainable Aviation Fuel) price assessments (IOSCO-approved methodology)', 'global', 'air (SAF pricing benchmark, workspace''s primary transport mode, alt-fuel cost signal)', 'air',
 'LICENSED, entity-confirmed as real and paid. Fastmarkets'' SAF price assessments use an IOSCO-approved methodology (a stronger regulatory-credibility signal than most commodity price-reporting agencies) combined with feedstock-market and legislative/production-capacity insight -- distinct from the already-inserted rank-26 Platts marine-fuel row (SAF/aviation-specific, not marine).',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.fastmarkets.com/agriculture/saf-price-data/',
 'Entity-confirmed: real, live, subscription-gated. FLAGGED for operator spend-and-license decision. IOSCO-approved methodology is a genuine differentiator worth noting for any future source-credibility scoring.',
 'data_feed', 'market_intel_source'),

(90, 'General Index Sustainable Aviation Fuel price indexes (Europe, North America, Asia, spot and production-cost-based models)', 'global', 'air (SAF pricing benchmark, workspace''s primary transport mode, multi-region)', 'air',
 'LICENSED, entity-confirmed as real and paid (same provider entity-confirmed but not added for a different, bunker-fuel product line in migration 219/Class 3). This SAF-specific product line covers 3 regions with both spot and production-cost-based pricing models, complementary to Fastmarkets (rank 89) rather than redundant -- General Index is FCA-regulated per the Class 3 finding.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.general-index.com/solutions/sustainable-aviation-fuel',
 'Entity-confirmed: real, live, subscription-gated. FLAGGED for operator spend-and-license decision. Same provider as the Class 3 General Index mention (bunker fuels), but this is a distinct product page/dataset (SAF, not marine bunker) -- not a duplicate row.',
 'data_feed', 'market_intel_source');
