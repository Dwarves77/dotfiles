-- 232_coverage_gap_gemini_second_pass_and_vertical_standards.sql
-- Session C (coverage discovery lane), 2026-07-18 reactivation. Gemini second-pass integration:
-- 4 external candidates (Bizot Green Protocol, EU Union Database for Biofuels, FMC tariff/surcharge
-- monitoring, CAAS Sustainable Air Hub Blueprint) entity-confirmed per standard rules, plus a class
-- finding: "vertical-specific operational standards" was never one of the original 9 discovery
-- classes. New discovery_class value `vertical_operational_standard` added (10th value) to name
-- this class honestly rather than force-fitting these rows into an ill-fitting existing bucket.
-- A membership check across the operator's other verticals found 2 more genuine siblings (BAFTA
-- Albert for film/TV, FIA Environmental Accreditation for automotive) and 1 already-held instance
-- (Julie's Bicycle for live events -- juliesbicycle.com already a registered platform source, not
-- re-added). A parallel membership check on airport-level SAF mandates (prompted directly by
-- Gemini's closing question about other localized-penalty verticals/lanes) found Japan's
-- METI/MLIT 10% SAF-by-2030 mandate as a genuine sibling to Singapore's CAAS mandate.
--
-- Retrieval-before-generation catches: fmc.gov root and meti.go.jp (general + GX-policy subpage)
-- are ALREADY registered -- the specific tariff/surcharge-monitoring page and the SAF-mandate-
-- specific content are NOT, genuine gaps at correct granularity (same host-vs-page pattern seen
-- throughout this job). juliesbicycle.com root is ALREADY registered -- not re-added.

ALTER TABLE public.coverage_gap_candidates
  DROP CONSTRAINT coverage_gap_candidates_discovery_class_check;
ALTER TABLE public.coverage_gap_candidates
  ADD CONSTRAINT discovery_class_check
    CHECK (discovery_class IN (
      'labor_cost_feed', 'energy_price_feed', 'commercial_fuel_assessment',
      'state_subnational_tracker', 'compliance_reporting_portal', 'enforcement_verification_system',
      'lca_disclosure_verification', 'market_intel_source', 'research_horizon_source',
      'vertical_operational_standard'
    ));

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(99, 'Bizot Green Protocol (Bizot Group refreshed guiding principles + climate handbooks, Sept 2023 refresh)', 'global', 'fine art (museum/gallery climate-control energy baseline + greener-transport-first mode-shift standard)', 'multi',
 'FREE, entity-confirmed, public (handbooks hosted on cimam.org, coverage via NEMO/National Museum Directors Council). The global operational standard governing museum/gallery climate environments: relaxes blanket HVAC tolerances to 16-25C / 40-60% RH bands to cut facility energy use, and formalizes "greener option first" -- prioritizing sea/road/rail consolidation over air freight plus virtual courier as default. Refreshed every 5 years (2015 original, 2023 refresh); directly informs both Operations facility-energy baselines and routing/mode-shift decisions for the fine-art vertical.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.cimam.org/documents/238/Bizot_Green_Protocol_-_2023_refresh_-_Sept_2023.pdf',
 'Entity-confirmed: real, live, free public PDF (Bizot Group / International Group of Organizers of Large Exhibitions). Voluntary industry standard, not government regulatory text -- classified data_class=instrument for Section-1 routing consistency with the already-registered Gallery Climate Coalition (GCC) framework. FIVE-SURFACE TEST (informational, not a park/product-decision gate): Regulations=CONDITIONAL (voluntary standard adjacent to regulatory content, tracked similarly to GCC, not binding law); Operations=IN (directly informs facility HVAC/climate-control energy-cost baselines and greener-transport-first routing decisions, squarely Operations'' contract); Market Intel=OUT; Research=CONDITIONAL (informs horizon-scan understanding of art-logistics decarbonization but primary use is operational compliance); Community=OUT (not peer-generated, though museums could discuss it in a Community working group).',
 'instrument', 'vertical_operational_standard'),

(100, 'BAFTA Albert certification and carbon calculator (UK screen-industry sustainability standard, film/TV production)', 'uk', 'film and TV production (sustainable-production certification and carbon-footprint measurement standard)', 'multi',
 'FREE (calculator/certification info public; certification process itself may carry industry membership costs not separately priced in this pass), entity-confirmed. albert (BAFTA-led consortium, born from a 2009 BBC carbon calculator, BAFTA-led industry standard since 2011) is the UK screen industry''s recognised environmental-sustainability standard: predicted carbon-footprint calculation pre- to post-production, 1-3 star certification, increasingly required by major broadcasters/streamers/funders. Direct sibling to Bizot (rank 99) for the film/TV vertical, found via the operator-directed membership check across verticals.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://baftaalbert.org/',
 'Entity-confirmed: real, live. Membership-check finding (film/TV vertical), not independently discovered -- directly responsive to the operator''s instruction to check for siblings across verticals. data_class=instrument for the same voluntary-industry-standard reasoning as rank 99.',
 'instrument', 'vertical_operational_standard'),

(101, 'FIA Environmental Accreditation Programme (motorsport/mobility 3-star sustainability framework, ISO 14001/20121/EMAS-based)', 'global', 'high-value automotive (motorsport/mobility environmental-management accreditation, classic/supercar/prototype-adjacent)', 'road',
 'FREE, entity-confirmed. FIA''s 3-level accreditation (basic to best-practice) across 17 environmental-management categories (energy use, supply chain, transport planning, noise, carbon emissions), launched 2012 for Sport stakeholders, extended to Mobility Clubs 2019, 260+ accredited organisations; all 2023 F1 teams achieved Three-Star accreditation. Direct sibling to Bizot (rank 99) for the high-value automotive vertical, found via the operator-directed membership check.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.fia.com/environmental-accreditation-programme',
 'Entity-confirmed: real, live. Membership-check finding (automotive vertical). Motorsport-specific rather than classic-car-logistics-specific, but a genuine operational-standard analog; data_class=instrument for the same voluntary-industry-standard reasoning as rank 99.',
 'instrument', 'vertical_operational_standard'),

(102, 'EU Union Database for Biofuels (UDB), liquid and gaseous renewable/recycled-carbon-fuel traceability registry (RED II Art.28(2) / RED III Art.31a)', 'eu', 'road / air / ocean (EU biofuel and SAF supply-chain traceability, anti-double-counting registry)', 'multi',
 'OPERATOR-GATED, NOT public, entity-confirmed and access model resolved per operator instruction. The UDB traces renewable/recycled-carbon-fuel consignments and raw materials from origin to EU-market point of use, live since Jan 2024 (liquids) / Nov 2024 (gases); ALL operators in the biofuels sector have access, but the database itself is confirmed "not yet open to the public" -- access requires registration as an economic operator in the EU biofuels/SAF supply chain, not a commercial subscription purchase. FIVE-SURFACE VALUE CASE: Regulations=IN (the traceability mandate itself is binding RED II/III content, distinct from and complementary to the already-in-corpus ReFuelEU/RED instruments); Operations=IN (directly enables auditing whether a SAF/biofuel credit is authentic vs double-marketed, closing the gap price indexers like Fastmarkets/Argus/General Index cannot close); Market Intel=OUT; Research=OUT; Community=OUT.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://energy.ec.europa.eu/topics/renewable-energy/bioenergy/biofuels/union-database-liquid-and-gaseous-renewable-and-recycled-carbon-fuels_en',
 'Entity-confirmed: real, live. Access model classified "licensed" for Section-routing purposes despite carrying no commercial fee -- the operative gate is registered-economic-operator status, not a paid subscription, and this distinction is flagged here rather than silently conflated with the commercial-licensing rows elsewhere in Section 3. Distinct from the already-registered ec.europa.eu subdomains (energy.ec.europa.eu itself was not previously registered at this specific page).',
 'tracker', 'compliance_reporting_portal'),

(103, 'FMC (Federal Maritime Commission) tariff and surcharge monitoring (carrier-filed Green Surcharge / EU ETS-FuelEU cost-pass-through legitimacy)', 'us', 'ocean (US-bound/outbound carrier tariff and environmental-surcharge legal transparency)', 'ocean',
 'FREE, entity-confirmed. FMC requires NVOCC/VOCC tariffs to be filed and open for public inspection (46 CFR Part 520, Carrier Automated Tariffs; FMC-1 form) and actively monitors and reviews surcharges and fees, including cost-pass-through mechanisms for EU ETS / FuelEU Maritime exposure on US trades. FMC''s own oversight content (Databases and Publications page, Surcharge Monitoring articles) is free and public; individual carrier tariff line-item data itself is often hosted by the carriers or third-party tariff publishers (e.g. DPI) rather than centralized on fmc.gov, a distinction flagged honestly rather than overstated. FIVE-SURFACE VALUE CASE per operator instruction: Operations=IN (parses legitimacy/baseline calculations of carrier-imposed environmental surcharges before they hit an invoice, direct cost-feasibility input); Market Intel=IN (carrier cost-shifting/surcharge trends are a market-signal category); Regulations=OUT (FMC oversight framework, not the surcharge-generating regulations themselves, which are separately in-corpus as EU ETS/FuelEU); Research=OUT; Community=OUT.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.fmc.gov/articles/fmc-monitoring-and-review-of-surcharges-and-fees/',
 'Entity-confirmed: real, live. Distinct from the already-registered fmc.gov root landing page (general agency site, not this surcharge-monitoring-specific page) -- same host-vs-page granularity pattern seen throughout this job.',
 'tracker', 'enforcement_verification_system'),

(104, 'CAAS Singapore Sustainable Air Hub Blueprint (mandatory SAF uplift target + levy, Changi/Seletar airports, from 2026)', 'asia', 'air (Singapore transhipment-hub SAF mandate and levy mechanism, workspace''s primary transport mode)', 'air',
 'FREE, entity-confirmed, real government mandate (not just an aspiration). Launched Feb 19 2024; requires SAF use on flights departing Singapore from 2026 (1% target, rising to 3-5% by 2030 subject to global SAF availability); a fixed-quantum SAF levy funds the uplift (2026 levy estimated to add ~S$3/6/16 to economy fares to Bangkok/Tokyo/London respectively). CAAS(Amendment) Bill introduced in Parliament to implement the policy legally. Singapore is a major air-cargo/transhipment node for the workspace''s air-primary profile, making this a non-negotiable localized pricing premium on outbound APAC air corridors.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.caas.gov.sg/sustainability/sustainable-air-hub-blueprint/',
 'Entity-confirmed: real, live, legally implemented via the CAAS(Amendment) Bill. Host (caas.gov.sg) was NOT found registered as a platform source at all in this pass -- a clean net-new gap.',
 'instrument', NULL),

(105, 'Japan METI/MLIT 10% SAF-by-2030 mandate (Basic Policy for Promoting Decarbonization in Aviation + Act on the Sophistication of Energy Supply Structures)', 'asia', 'air (Japan national SAF supply mandate, sibling to Singapore''s airport-level mandate)', 'air',
 'FREE, entity-confirmed, real regulatory mandate found via the operator-directed sibling-airport-mandate membership check (prompted by Gemini''s closing question about other localized-penalty lanes). MLIT''s Basic Policy for Promoting Decarbonization in Aviation (Dec 2022) set the 10%-SAF-by-2030 target for Japanese-airline jet fuel; a binding supply-side mechanism followed under the Act on the Sophistication of Energy Supply Structures (oil wholesalers producing/supplying 100,000+ kL jet fuel annually must supply a GHG-equivalent SAF share, approved by the Decarbonized Fuel Policy Subcommittee Sept 2024), backed by Green Innovation Fund investment and a 30 JPY/L tax credit.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.meti.go.jp/english/statistics/',
 'Entity-confirmed via multiple secondary/trade-press sources (law firm, industry press) describing the MLIT Basic Policy and the METI regulatory subcommittee action; a single canonical primary-government URL for the SAF-mandate-specific policy was not confirmed live in this pass (meti.go.jp root and one GX-policy subpage are already registered, neither is this mandate''s dedicated page) -- flagged honestly for the feed-build task to locate and verify the exact primary document URL rather than asserting one not directly confirmed.',
 'instrument', NULL);
