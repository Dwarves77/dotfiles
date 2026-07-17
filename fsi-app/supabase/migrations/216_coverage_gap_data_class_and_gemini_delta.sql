-- 216_coverage_gap_data_class_and_gemini_delta.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Gemini cross-check integration.
-- Read-only investigation lane; this table remains the one permitted write surface. No corpus
-- items minted, no sources registered (host candidates are LISTED for a future wave only).
--
-- (1) SCHEMA: data_class distinguishes REGULATORY INSTRUMENTS (the original 21+1 rows) from
-- DATA FEEDS (live numeric/API sources serving Operations + Market Intel surface contracts).
-- A data_feed row is NOT a candidate for the regulatory ledger; it is a candidate for a SEPARATE
-- feed-intake architecture (API attestation: feed/series/query/retrieval_timestamp/value; a
-- second intake door that never mints FACT claims into section_claim_provenance). That
-- architecture is a NAMED POST-DRAIN BUILD UNIT, not built here, not scoped to this table.
ALTER TABLE public.coverage_gap_candidates
  ADD COLUMN IF NOT EXISTS data_class text NOT NULL DEFAULT 'instrument'
    CHECK (data_class IN ('instrument','data_feed'));

COMMENT ON COLUMN public.coverage_gap_candidates.data_class IS
  'instrument = regulatory/policy instrument (the original table scope, MISSING/AMBIGUOUS_ARCHIVED/HAVE_QUARANTINED against the corpus). data_feed = a live numeric/API data source serving Operations or Market Intel surface content, NOT a corpus regulatory item. A data_feed row implies a SEPARATE feed-intake architecture (API attestation: feed, series, query, retrieval_timestamp, value) that NEVER mints a FACT claim in section_claim_provenance -- a second intake door alongside the regulatory grounding pipeline, named as a post-drain build unit, not scoped or built by this table.';

-- (2) NEW INSTRUMENT CANDIDATE, entity-confirmed (NYSDEC, dec.ny.gov, CARB-aligned per Advanced
-- Clean Trucks + Heavy-Duty Omnibus + Phase 2 GHG, model-year 2026 phase-in). Distinct from the
-- corpus's existing NY item (0ea6a710, general truck/carrier safety framework, not emissions
-- standards). Jurisdiction us-ny checked against the 15-code state/country collision class
-- (docs/audits/us-state-code-audit-2026-05-12.md) -- NY is not a colliding ISO country code, safe.
INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class)
VALUES
(22, 'New York 6 NYCRR Part 218 -- Heavy-Duty Vehicle Emission Standards (Advanced Clean Trucks + Heavy-Duty Omnibus + Phase 2 GHG, CARB-aligned)', 'us-ny', 'road (HDV fleet compliance, NY-registered/operating fleets)', 'road',
 'Direct road-mode freight compliance requirement: NY has adopted California ACT sales-percentage mandates plus the Heavy-Duty Omnibus and Phase 2 GHG warranty/engine standards for model year 2026+, binding on manufacturers and fleets operating in NY. A road-secondary-mode operator with NY-touching lanes needs the phase-in schedule and warranty-coverage requirements before the 2026 model year compliance date lands.',
 'HIGH', 'MISSING', NULL, 'minor', true, 'https://dec.ny.gov/regulations/regulatory-agenda',
 'Entity-confirmed via NYSDEC adopted-amendment documents (218hdomnibus.pdf, 218acc2.pdf) and Cornell LII regulation text. Jurisdiction us-ny checked clean against the 15-code collision list (US-CA=Canada, US-IN=India, US-PA=Panama, etc, per the 2026-05-12 audit) -- NY collides with no ISO country code. Distinct instrument from corpus item 0ea6a710 (NY truck/carrier safety framework, not this emissions standard).',
 'instrument');

-- (3) DATA-FEED CANDIDATES, entity-confirmed per-endpoint, data_class='data_feed'. coverage_class
-- reuses MISSING to mean "not currently integrated as a platform feed" (the enum's nearest honest
-- fit; documented here rather than widening the CHECK for a 6-row extension). Two URL corrections
-- found during entity-confirmation, both noted: the EIA endpoint segment is "retail-sales" not
-- "retail-pricing" (no such EIA API path exists); the Eurostat API version segment is "1.0" not
-- "v1.0". Priority is scored against Operations-surface value weighted by the operator's stated
-- transport-mode priority (air primary, road secondary, ocean tertiary); sizing_class here is
-- repurposed to mean breadth+cost-of-access (major = broad/free/systemic, minor = narrow/gated).
INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class)
VALUES
(23, 'BLS labor cost data (warehousing and transportation wage series)', 'us', 'road / warehousing (labor cost benchmark)', 'road',
 'Free public API, entity-confirmed exact endpoint match. Warehousing (NAICS 493) and transportation (NAICS 484) wage series are the direct labor-cost input for the Operations surface''s hire-vs-automate comparisons (per environmental-policy-and-innovation Operations Profile section 3). Road-secondary-mode weighting: HIGH, this is the single most direct free Operations data source named in this batch.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://api.bls.gov/publicAPI/v2/timeseries/data/',
 'Entity-confirmed: exact URL match. Free, registration required for an API key (not a paywall) per bls.gov/developers. Specific warehousing/transportation series IDs not yet enumerated -- a feed-build task, not a this-table task.',
 'data_feed'),

(24, 'Eurostat labour cost index (NACE H, transportation and storage)', 'eu', 'road (EU labor cost benchmark)', 'road',
 'Free public API, entity-confirmed dataset exists (lc_lci_lev, Labour cost levels by NACE Rev.2 activity). EU-equivalent of the BLS series for the road-secondary mode; narrower than BLS (EU-only, annual cadence, 70-day post-period lag). Operations-surface value real but regionally bounded.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lc_lci_lev',
 'Entity-confirmed dataset (lc_lci_lev). URL CORRECTED: the operator-stated path used version segment "v1.0"; the live Eurostat REST API uses "1.0" (no v-prefix), confirmed against the official API introduction doc and a working example query. NACE H filter applies via the standard geo/nace_r2 query params, not yet enumerated.',
 'data_feed'),

(25, 'EIA industrial electricity retail pricing (state-filterable)', 'us', 'road / ocean (warehouse and port energy cost benchmark)', 'multi',
 'Free public API, entity-confirmed with a URL correction. Industrial-sector, state-filterable electricity pricing is a direct Operations Profile section-1 input (cost baseline) across warehouse and port-adjacent facilities, cross-modal.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://api.eia.gov/v2/electricity/retail-sales/data/',
 'Entity-confirmed with a URL CORRECTION: the operator-stated segment "retail-pricing" does not exist as an EIA API path; the real, confirmed endpoint is "retail-sales" (sectorid=IND for industrial, stateid facet for state filtering). Free, API key required (self-service registration, not a paywall).',
 'data_feed'),

(26, 'S&P Global Commodity Insights / Platts marine fuel assessments (bunker spot, bio-methanol, VLSFO baseline, green premium)', 'global', 'ocean (bunker fuel pricing benchmark)', 'ocean',
 'LICENSED, entity-confirmed as real and paid (daily assessments across 65+ ports, VLSFO/IFO/MDO/MGO grades, alternative-fuel green-premium calculator including bio-methanol). Ocean-tertiary-mode weighting plus a real license/spend cost: MODERATE despite high data quality, pending an operator spend-and-license decision.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.spglobal.com/commodity-insights/en/products-solutions/shipping/marine-fuels',
 'Entity-confirmed: real product line, subscription-gated, no public free tier found. FLAGGED for operator spend-and-license decision before any acquisition step; not actionable at $0.',
 'data_feed'),

(27, 'ecoinvent life-cycle-assessment (LCA) database', 'global', 'luxury goods / packaging (LCA benchmark, packaging-lifecycle relevance)', 'multi',
 'LICENSED, entity-confirmed as real and paid (yearly single-user/enterprise licenses via a license calculator; free tier limited to low/low-middle-income-country academic use, not applicable here). Cross-modal, narrower Operations fit than the free feeds above (packaging-vertical use case specifically).',
 'LOW', 'MISSING', NULL, 'minor', true, 'https://ecoinvent.org/database/',
 'Entity-confirmed: real product, 26,000+ LCI datasets incl. packaging materials. FLAGGED for operator spend-and-license decision; no public free access path for this use case.',
 'data_feed'),

(28, 'CDP corporate response data (client ESG disclosure data)', 'global', 'all verticals (client-conversation ESG data)', 'multi',
 'Access model RESOLVED (was flagged unconfirmed): CDP''s Open Data Portal is free ONLY for city/state/region disclosers and Target 15.1 monitoring data; full CORPORATE-level disclosure responses (the specific ask here) require a paid Data License Agreement, restricted to accredited stakeholders/subscribers. The Disclosure API is a submission channel for organizations reporting TO CDP, not a public retrieval API. Classifying as licensed on that basis.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.cdp.net/en/data-licenses',
 'Entity-confirmed and access-model resolved via cdp.net/en/data (free tiers) vs cdp.net/en/data-licenses (paid corporate tier). FLAGGED for operator spend-and-license decision for corporate-level data specifically; the free city/region portal is a separate, already-open resource not gated the same way.',
 'data_feed');

-- (4) URL ENRICHMENT on existing instrument rows (appended to notes as ADJUNCT, authoritative_url
-- left as the primary instrument anchor per the operator's framing "alongside the instrument
-- itself"). All four entity-confirmed this pass.
UPDATE public.coverage_gap_candidates
SET notes = notes || ' ADJUNCT (2026-07-17 Gemini cross-check, entity-confirmed): ICAO CORSIA Central Registry (CCR) at https://www.icao.int/CORSIA/CCR is an adjunct acquisition target for offsetting/reporting data alongside the instrument text itself. Most of the live CCR is authorized-States-only; the periodic public "Information and Data for Transparency Part III" editions (PDF/Excel, State-pairs and Aeroplane Operators data) are the genuinely acquirable public slice.'
WHERE rank = 1;

UPDATE public.coverage_gap_candidates
SET notes = notes || ' ADJUNCT (2026-07-17 Gemini cross-check, entity-confirmed): gov.uk CBAM consultation/collection endpoint at https://www.gov.uk/government/collections/carbon-border-adjustment-mechanism (durable collection page; the two individual technical-consultation sub-pages are time-bound and will close/archive).'
WHERE rank = 2;

UPDATE public.coverage_gap_candidates
SET notes = notes || ' CELEX CONFIRMED (2026-07-17 Gemini cross-check): CELEX 32024L1760 exact-matches this row''s existing authoritative_url (eur-lex.europa.eu/eli/dir/2024/1760/oj/eng) -- Directive (EU) 2024/1760 of 13 June 2024, no URL change needed, identity confirmation only.'
WHERE rank = 3;

UPDATE public.coverage_gap_candidates
SET notes = notes || ' ADJUNCT (2026-07-17 Gemini cross-check, entity-confirmed): Singapore NEA carbon tax page at https://www.nea.gov.sg/our-services/climate-change-energy-efficiency/climate-change/carbon-tax confirmed real and content-matching (rate schedule, ICC offset eligibility), adjunct to the Carbon Pricing Act primary.'
WHERE rank = 10;
