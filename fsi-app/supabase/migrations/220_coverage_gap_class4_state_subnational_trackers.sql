-- 220_coverage_gap_class4_state_subnational_trackers.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Category-driven discovery bank 4
-- of 9: CLASS 4 (state and subnational rulemaking trackers), pattern instance NY DEC regulatory
-- agenda (rank 22's authoritative_url). Full ACT-adopter-state sweep: CARB-adopter states first
-- (CA/WA/OR/NY/NJ/MA), then the remaining ACT adopters (VT/CO/MD/NM/RI), then the freight-relevant
-- Canadian provinces (BC, QC). German Laender CHECKED and NOT applicable: heavy-duty vehicle
-- emissions in Germany are regulated federally/EU-level (already in-corpus as EU HDV CO2 standard
-- items), no Land-level ZEV sales-mandate rulemaking equivalent to the US state-adoption pattern
-- was found in this pass -- an honest scope-narrowing, not a silent omission.
--
-- Retrieval-before-generation catch (agency host vs specific tracker page): 11 of the 13 candidate
-- agency HOSTS are already registered platform sources, but at the general agency-landing-page
-- granularity, not the specific rulemaking-docket/tracker page this class asks for -- so most
-- rows below ARE new gaps despite the host being partially covered. TWO exceptions where the
-- SPECIFIC tracker-equivalent page is already registered at matching granularity, so NO new row
-- is inserted for them: (1) NY -- dec.ny.gov/regulatory is already registered, functionally the
-- same regulatory-agenda tracker as rank 22's authoritative_url (dec.ny.gov/regulations/regulatory-
-- agenda); (2) NM -- both the general NMED Air Quality Bureau page AND the specific "New Motor
-- Vehicle Emissions Standards (ACT/ACCII)" transportation page (env.nm.gov/climate-change-bureau/
-- transportation/) are already registered, the exact tracker pattern this class asks for.
--
-- MONITORING FLAG (rank 50 note): CARB is in an active settlement-driven rulemaking to repeal the
-- Advanced Clean Fleets private/federal-fleet requirements (repeal voted Sept 2025, effective Jan 1
-- 2027) AND, per an April 2026 Legal Planet report, is under a separate settlement obligation to
-- propose repeal of Advanced Clean Trucks itself (board hearing targeted by Oct 31 2026, submission
-- by Aug 31 2026). Because all 10 other ACT-adopter states peg their rule to CARB's by reference,
-- a CA repeal is the single highest-leverage regulatory reversal signal in this entire class --
-- WINDOW CLOSING / MONITORING per the business evaluation framework, not yet a settled fact.

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(50, 'California CARB Rulemaking Activity tracker (Advanced Clean Trucks / Advanced Clean Fleets rulemaking dockets, origin jurisdiction for all Section 177 ACT-adopter states)', 'us-ca', 'road (origin jurisdiction for the entire multi-state ACT/ACF clean-truck rulemaking pattern)', 'road',
 'Free official rulemaking tracker, entity-confirmed. CARB is the origin regulator all 10 other ACT-adopter states incorporate by reference; MONITORING FLAG: CARB voted to repeal Advanced Clean Fleets private/federal-fleet requirements (Sept 2025, effective Jan 1 2027), and per an April 2026 Legal Planet report is under a separate settlement obligation to propose repeal of Advanced Clean Trucks itself (board hearing targeted by Oct 31 2026). This is the single highest-leverage regulatory-reversal signal in the class -- a CA repeal cascades to every adopter state.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://ww2.arb.ca.gov/rulemaking-activity',
 'Entity-confirmed: real, live CARB rulemaking-activity index (distinct from the already-registered ww2.arb.ca.gov/ root landing page, which is a general agency site, not the docket tracker). ACT manufacturer sales mandate remains in effect as of this pass; ACF fleet-purchase mandate is being wound down for private/federal fleets, retained for CA state/local government fleets.',
 'tracker', 'state_subnational_tracker'),

(51, 'Washington Department of Ecology WAC 173-423 Clean Vehicles Program rulemaking tracker', 'us-wa', 'road (WA CARB-aligned clean-truck rulemaking)', 'road',
 'Free official rulemaking tracker, entity-confirmed. Ecology extended the Advanced Clean Cars II / Advanced Clean Trucks / Heavy-Duty Low NOx Omnibus enforcement pause through June 2026, with a new comment period open June 23 to Aug 13 2026 and adoption targeted November 2026 -- an active, near-term rulemaking window.',
 'HIGH', 'MISSING', NULL, 'minor', true, 'https://ecology.wa.gov/regulations-permits/laws-rules-rulemaking/rulemaking/wac-173-423-clean-vehicles-program',
 'Entity-confirmed: real, live, distinct from the already-registered ecology.wa.gov/air-climate division-landing page. On Oct 16 2025 Ecology adopted amendments incorporating CARB''s ACT and Heavy-Duty Low NOx Omnibus changes.',
 'tracker', 'state_subnational_tracker'),

(52, 'Oregon DEQ Clean Truck Rules rulemaking tracker', 'us-or', 'road (OR CARB-aligned clean-truck rulemaking)', 'road',
 'Free official rulemaking tracker, entity-confirmed. DEQ paused Advanced Clean Trucks enforcement for 2025-2026 and is pursuing a rulemaking to adopt minor CARB amendments plus a 1-year Heavy-Duty Low NOx Omnibus delay.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.oregon.gov/deq/rulemaking/pages/ctr2025.aspx',
 'Entity-confirmed: real, live, distinct from the already-registered oregon.gov/deq/Pages/index.aspx general landing and the already-registered Climate Protection Program page (a different, non-truck program).',
 'tracker', 'state_subnational_tracker'),

(53, 'New Jersey DEP Advanced Clean Trucks rulemaking and fleet-reporting tracker', 'us-nj', 'road (NJ CARB-aligned clean-truck rulemaking)', 'road',
 'Free official rulemaking tracker, entity-confirmed. NJDEP adopted ACT in December 2021 (incorporating CARB''s regulation by reference) and issued Administrative Order 2025-15 (June 25, 2025) offering manufacturers compliance flexibilities through model year 2026.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://dep.nj.gov/stopthesoot/advanced-clean-trucks-rule-fleet-reporting/',
 'Entity-confirmed: real, live. Host (dep.nj.gov) was NOT found registered as a platform source at all in this pass -- a clean net-new gap, not just a granularity gap.',
 'tracker', 'state_subnational_tracker'),

(54, 'Massachusetts DEP 310 CMR 7.40 (Low Emission Vehicle Program / Advanced Clean Trucks) rulemaking tracker', 'us-ma', 'road (MA CARB-aligned clean-truck rulemaking)', 'road',
 'Free official regulation/rulemaking page, entity-confirmed. MassDEP adopted CARB''s ACT, Phase 2 GHG, and Heavy-Duty Omnibus regulations effective Dec 30 2021; filed emergency amendments Nov 2025 adopting CARB''s MY2026 legacy-engine provisions and delaying HD Omnibus effective model year from 2025 to 2026.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.mass.gov/regulations/310-CMR-700-air-pollution-control',
 'Entity-confirmed: real, live. Distinct from the already-registered generic mass.gov MassDEP org landing page (which does not surface the specific 310 CMR 7.40 rulemaking activity).',
 'tracker', 'state_subnational_tracker'),

(55, 'Vermont DEC Advanced Clean Trucks program and enforcement-status page', 'us-vt', 'road (VT CARB-aligned clean-truck rulemaking, currently enforcement-paused)', 'road',
 'Free official program tracker, entity-confirmed. VT adopted ACT in December 2022 (2025 model-year effective), but Governor Executive Order 04-25 (May 13, 2025) directed the Agency of Natural Resources to pause enforcement of ACT, Advanced Clean Cars II, and Heavy-Duty Omnibus -- the rule is adopted and in effect on paper but not currently enforced, a WINDOW-CLOSING-class distinction worth tracking as its own signal.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://dec.vermont.gov/air-quality/mobile-sources/zero-emission-vehicles/ACT',
 'Entity-confirmed: real, live. Distinct from the already-registered dec.vermont.gov/ root landing page (general agency site, not this program-specific page).',
 'tracker', 'state_subnational_tracker'),

(56, 'Colorado CDPHE Clean Trucking program and Regulation 20 (5 CCR 1001-24) rulemaking tracker', 'us-co', 'road (CO CARB-aligned clean-truck rulemaking)', 'road',
 'Free official program tracker, entity-confirmed. Colorado adopted 3 clean-trucking rules in April 2023 (ACT, Heavy-Duty Low NOx, Large Entity Reporting) under AQCC Regulation 20, effective model year 2027; the Division must petition for MY2033+ standards by no later than July 31, 2029, a known future rulemaking trigger date.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://cdphe.colorado.gov/cleantrucking',
 'Entity-confirmed: real, live. Host (cdphe.colorado.gov) was NOT found registered as a platform source at all in this pass -- a clean net-new gap.',
 'tracker', 'state_subnational_tracker'),

(57, 'Maryland MDE COMAR 26.11.43 (Advanced Clean Trucks Program) rulemaking-documents tracker', 'us-md', 'road (MD CARB-aligned clean-truck rulemaking)', 'road',
 'Free official rulemaking-documents page, entity-confirmed. The Clean Trucks Act of 2023 required MDE to adopt CARB''s ACT program by reference under new COMAR 26.11.43; MY2027 manufacturer compliance-reporting begins; most recent published fact sheet dated June 16, 2025.',
 'LOW', 'MISSING', NULL, 'minor', true, 'https://mde.maryland.gov/programs/regulations/air/Documents/2023%20ACT%20Fact%20Sheet%2005.24.23%20AQCAC.pdf',
 'Entity-confirmed: real, a document-page rather than a live HTML tracker (a feed-build caveat, not a license/spend one). Distinct from the already-registered mde.maryland.gov Air & Climate Change Program landing page.',
 'tracker', 'state_subnational_tracker'),

(58, 'Rhode Island DEM Advanced Clean Cars II and Advanced Clean Trucks mobile-sources tracker', 'us-ri', 'road (RI CARB-aligned clean-truck rulemaking)', 'road',
 'Free official program tracker, entity-confirmed. RI adopted ACT, Advanced Clean Cars II, and the Low-NOx Heavy-Duty Omnibus rules together; ACT phases in through model year 2035 at 40-75% ZEV sales depending on vehicle class.',
 'LOW', 'MISSING', NULL, 'minor', true, 'https://dem.ri.gov/environmental-protection-bureau/air-resources/mobile-sources/advanced-clean-cars-ii-advanced-clean',
 'Entity-confirmed: real, live. Distinct from the already-registered dem.ri.gov climate-change landing page (a broader, non-mobile-sources-specific page).',
 'tracker', 'state_subnational_tracker'),

(59, 'British Columbia Zero-Emission Vehicles Act (medium- and heavy-duty ZEV mandate, under development)', 'ca-bc', 'road (BC MHD ZEV mandate, Class 3-8 vehicles, regulation under development)', 'road',
 'Free official program tracker, entity-confirmed. Under the ZEV Act and CleanBC Roadmap to 2030, BC is developing a Class 3-8 (>4,536 kg GVWR) MHD ZEV sales-mandate regulation, proposed with a 100-unit small-supplier volume threshold (~98.5% of BC''s MHD market). Not yet a finalized regulation as of this pass -- an emerging-jurisdiction candidate rather than an already-binding one.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www2.gov.bc.ca/gov/content/industry/electricity-alternative-energy/transportation-energies/clean-transportation-policies-programs/zero-emission-vehicles-act',
 'Entity-confirmed: real, live. Distinct from the already-registered www2.gov.bc.ca/gov/content/environment general ministry landing page.',
 'tracker', 'state_subnational_tracker'),

(60, 'Quebec zero-emission vehicles (ZEV) standard, heavy-duty expansion tracker', 'ca-qc', 'road (QC heavy-duty ZEV standard, regulation under development)', 'road',
 'Free official program tracker, entity-confirmed. The Act to amend various provisions relating to the environment (Chapter 12, assented May 28, 2025) amended Quebec''s ZEV Act to permit an eventual heavy-vehicle ZEV standard; the implementing regulation is confirmed under development, not yet finalized.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.environnement.gouv.qc.ca/changementsclimatiques/vze/index-en.htm',
 'Entity-confirmed: real, live. Distinct from the already-registered environnement.gouv.qc.ca/ root ministry landing page.',
 'tracker', 'state_subnational_tracker');
