-- 219_coverage_gap_class3_commercial_fuel_assessments.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Category-driven discovery bank 3
-- of 9: CLASS 3 (commercial fuel and green-premium assessments), pattern instance S&P Global
-- Commodity Insights / Platts (row 26) already exists; this migration adds the rest of the
-- licensed-market landscape (Argus, General Index) plus the free/semi-free bunker-index tier
-- (Ship & Bunker, Bunker Index/BIX, MABUX), all access-model flagged per the operator's framing
-- "listed with access models, all spend-flagged".
--
-- Retrieval-before-generation catch: spglobal.com is ALREADY registered as a platform source
-- (rank 26, Platts). OPIS (Oil Price Information Service) is an S&P Global brand as of the 2022
-- IHS Markit merger -- NOT added here as a separate row, noted as an ADJUNCT on rank 26 instead.

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(46, 'Argus Media Marine Fuels (daily spot assessments, 120+ bunker prices, VLSFO/HSFO/MGO plus biofuel/ammonia/LNG/methanol/CO2, 24-month forward curves)', 'global', 'ocean (bunker fuel pricing benchmark)', 'ocean',
 'LICENSED, entity-confirmed as real and paid. Direct competitor/complement to the rank-26 Platts assessment: broader alt-fuel grade coverage (ammonia, LNG, methanol daily spot alongside VLSFO/HSFO/MGO) and a published forward-curve product (Argus Marine Fuels Forward Curves, 24-month rolling) that Platts as sourced here does not. Ocean-tertiary-mode weighting plus a real license/spend cost: MODERATE despite high data quality, pending an operator spend-and-license decision, same posture as rank 26.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.argusmedia.com/en/commodities/marine-fuels',
 'Entity-confirmed: real product line (argusmedia.com/en/solutions/products/argus-marine-fuels), subscription-gated, no public free tier found. Published methodology PDF confirmed live (argus-marine-fuels.ashx). FLAGGED for operator spend-and-license decision before any acquisition step; not actionable at $0. Not a duplicate of rank 26 (different provider, S&P Global vs Argus Media are separate PRAs).',
 'data_feed', 'commercial_fuel_assessment'),

(47, 'Ship & Bunker world bunker prices (free daily port-level VLSFO/HSFO/MGO pricing, historical charts)', 'global', 'ocean (bunker fuel pricing benchmark, free tier)', 'ocean',
 'FREE, entity-confirmed. shipandbunker.com/prices publishes daily world bunker prices by port with historical trend charts, no registration wall found on the public price pages. Lower analytical depth than Argus/Platts (no forward curves, no alt-fuel green-premium calculator) but zero cost, making it the most immediately actionable row in this class.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://shipandbunker.com/prices',
 'Entity-confirmed: real, live, free public pricing pages confirmed in this pass. No dedicated documented REST API found (HTML price tables); a feed-build task would need to confirm scrape-vs-API access, not a license/spend decision like ranks 26 and 46.',
 'data_feed', 'commercial_fuel_assessment'),

(48, 'Bunker Index (BIX) World and Regional Indices (free unweighted spot-average indices, IFO 380/VLSFO/MGO, since 2009)', 'global', 'ocean (bunker fuel pricing benchmark, free tier)', 'ocean',
 'FREE, entity-confirmed. bunkerindex.com publishes BIX World Indices (unweighted simple averages of spot port prices across the three main grades), the longest-running free bunker index found in this pass (live since April 2009). Companion free-tier row to rank 47, different methodology (index-of-indices vs per-port raw prices).',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://bunkerindex.com/indices/index.php',
 'Entity-confirmed: real, live, bunkerindex.com confirmed operating since 2009 per its own historical claim (first to publish regular USD/tonne global marine fuel indices). Free public index pages; no documented API found in this pass.',
 'data_feed', 'commercial_fuel_assessment'),

(49, 'MABUX Global Bunker Index and Bunker Price Indications (400+ ports, composite World Bunker Index, API solutions noted but not confirmed)', 'global', 'ocean (bunker fuel pricing benchmark, mixed tier)', 'ocean',
 'MIXED ACCESS, entity-confirmed. mabux.com publishes free price-indication pages and a composite World Bunker Index (380 HSFO/VLSFO/MGO) covering 400+ ports, plus a stated but not-in-this-pass-confirmed API/subscription tier for real-time and forecast data. Explicit disclaimer that published prices are indications only, not firm quotes -- noted as a data-quality caveat for the feed-build task.',
 'LOW', 'MISSING', NULL, 'minor', true, 'https://www.mabux.com/',
 'Entity-confirmed: real, live, free indication pages and composite index confirmed. Site itself states prices are indications and disclaims responsibility for market decisions based on them -- lower confidence tier than ranks 26/46/47/48, listed for completeness of the class rather than as a priority acquisition.',
 'data_feed', 'commercial_fuel_assessment');

UPDATE public.coverage_gap_candidates
SET notes = notes || ' ADJUNCT (2026-07-17 Class 3 discovery): OPIS (Oil Price Information Service) is an S&P Global Commodity Insights brand post the 2022 IHS Markit merger, same corporate family as this row -- not added as a separate coverage_gap_candidates row (spglobal.com already registered).'
WHERE rank = 26;
