-- 227_coverage_gap_class9_research_horizon_sources.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Category-driven discovery bank 9
-- of 9 (FINAL CLASS): Research/horizon-scan sources, 4 sub-parts per the addendum.
--
-- SUB-PART (a), standing research institutions (ICCT, ITF/OECD, IEA transport, Fraunhofer IML,
-- TNO, MIT CTL, Smart Freight Centre, RMI): retrieval-before-generation check found ALL EIGHT
-- already registered platform sources (several at freight-specific sub-pages: ICCT Freight sector
-- page, RMI Aviation, Fraunhofer IML AI-in-logistics, Smart Freight Centre GLEC Framework, MIT
-- CTL root). ZERO new rows inserted for this sub-part -- this validates the operator's own framing
-- ("these are correctly SOURCES to register") rather than contradicting it: the source-registration
-- lane already did this work, no coverage_gap_candidates row is owed here. Documented as a finding,
-- not silently skipped.
--
-- SUB-PARTS (b)-(d): 8 new entity-confirmed rows (rank 91-98) -- preprint/journal feeds (SSRN
-- Transportation Research Network, arXiv physics.soc-ph listing, Transportation Research Part D),
-- regulatory-pipeline early signals (EU Have Your Say, ICAO CAEP, PLUS the Bank-4 CARB
-- repeal-rulemaking MONITORING flag carried forward per operator ruling 2 as a confirmed
-- HIGH-priority instance), technology-maturity trackers (IEA Hydrogen Tracker, PNNL Port
-- Electrification Handbook).
--
-- Retrieval-before-generation catch: federalregister.gov root IS ALREADY a registered platform
-- source (plus several specific document URLs) -- functions as the pipeline-signal tracker itself,
-- NOT re-added as a new row despite being the natural US-equivalent instance for this sub-part.

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(91, 'SSRN Transportation Research Network (TransportRN) — open-access preprint feed, freight/logistics/supply chain working papers', 'global', 'multi (horizon-scan preprint feed, freight/logistics/transport research)', 'multi',
 'Free public preprint feed, entity-confirmed. A dedicated SSRN vertical network for transportation research working papers (preprints, working papers, dissertations, teaching materials), including an active MIT Center for Transportation & Logistics research-paper collection hosted within it.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.ssrn.com/index.cfm/en/transportrn/',
 'Entity-confirmed: real, live, dedicated freight/transport-specific network (not a generic SSRN search). A cleaner category fit than arXiv (rank 92) for this vertical.',
 'data_feed', 'research_horizon_source'),

(92, 'arXiv physics.soc-ph (Physics and Society) listing — freight/transportation/logistics cross-listed preprints', 'global', 'multi (horizon-scan preprint feed, cross-listed transport/logistics research)', 'multi',
 'Free public preprint feed, entity-confirmed. arXiv has no dedicated freight/logistics category; relevant papers (freight transportation planning, intermodal network resilience, dynamic freight pricing, passenger-freight shared mobility) are cross-listed primarily under physics.soc-ph, with additional overlap in economics (econ.GN) and optimization (math.OC) categories.',
 'LOW', 'MISSING', NULL, 'minor', true, 'https://arxiv.org/list/physics.soc-ph/recent',
 'Entity-confirmed: real, live. The imperfect category fit (no dedicated freight/logistics arXiv category) is noted honestly rather than overstated -- this listing captures a meaningful but incomplete slice of relevant preprints, cross-listing to econ.GN/math.OC would need to be checked separately for full coverage.',
 'data_feed', 'research_horizon_source'),

(93, 'Transportation Research Part D: Transport and Environment (Elsevier/ScienceDirect journal)', 'global', 'multi (horizon-scan peer-reviewed journal, transport-and-environment specific)', 'multi',
 'Journal feed (subscription-gated full-text, abstracts free), entity-confirmed. The specific journal home page named in the operator''s original addendum wording; distinct from the already-registered sciencedirect.com root and the one already-registered unrelated article (battery critical-minerals), neither of which is this journal''s dedicated feed page.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.sciencedirect.com/journal/transportation-research-part-d-transport-and-environment',
 'Entity-confirmed: real, live, journal-specific page. Full-text access is subscription-gated per standard Elsevier journal access (abstracts/TOC free) -- a lighter access barrier than the fully licensed data-feed rows elsewhere in this table, not flagged for a spend decision on the same footing as e.g. Argus or Xeneta.',
 'data_feed', 'research_horizon_source'),

(94, 'EU "Have Your Say" public consultation portal (European Commission pre-legislative feedback and initiative tracking)', 'eu', 'multi (EU regulatory-pipeline early signal, pre-legislative stage)', 'multi',
 'Free official pre-legislative tracker, entity-confirmed. Single portal for all European Commission public consultations since November 2018, covering initiative scope/priorities feedback and legal-draft comments across 24 official languages -- the EU-equivalent early-signal instance to the US Federal Register''s proposed-rule stage (which is already a registered platform source, not re-added here).',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://have-your-say.ec.europa.eu/index_en',
 'Entity-confirmed: real, live. Distinct subdomain from the many already-registered ec.europa.eu pages (climate/energy/environment/transport/trimis/etc, all substantive-content pages, not this pre-legislative consultation-tracking subdomain).',
 'tracker', 'research_horizon_source'),

(95, 'ICAO CAEP (Committee on Aviation Environmental Protection) meeting agendas and reports', 'global', 'air (global aviation-environmental-standard-setting pipeline, workspace''s primary transport mode)', 'air',
 'Free official regulatory-pipeline tracker, entity-confirmed. CAEP operates on a 3-year decision-making cycle (13th meeting held Feb 17-28, 2025 at ICAO HQ); its reports and meeting outputs are the earliest visible signal for future ICAO aviation-environmental standards (CORSIA, SAF, noise, local air quality) before they reach binding MEPC/Assembly-resolution stage.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.icao.int/CAEP',
 'Entity-confirmed: real, live. Distinct from the many already-registered icao.int pages (ISPS Code, DGR, MARPOL, MEPC documents, CORSIA/SAF program pages) -- CAEP itself was not among them, a genuine gap at the correct granularity for the air-mode-specific early-signal pattern this sub-part asks for.',
 'tracker', 'research_horizon_source'),

(96, 'California CARB Advanced Clean Trucks / Advanced Clean Fleets repeal rulemaking (carried forward from Bank 4/rank 50 per operator ruling)', 'us-ca', 'road (pre-enactment early signal, CARB repeal rulemaking cascading to all ACT/ACF-adopter states)', 'road',
 'CONFIRMED HIGH-PRIORITY INSTANCE, carried forward per direct operator ruling (received mid-turn during Bank 6): this is exactly the pre-enactment early-signal pattern Class 9c (regulatory-pipeline early signals) formalizes. Per the Bank 4 finding (migration 220, rank 50): CARB voted to repeal Advanced Clean Fleets private/federal-fleet requirements (Sept 2025, effective Jan 1 2027), and per an April 2026 Legal Planet report is under a separate settlement obligation to propose repeal of Advanced Clean Trucks itself (board hearing targeted by Oct 31, 2026). Operator reasoning: "a repeal rulemaking on CARB truck rules is precisely the know-before-competitors event the Research surface contract exists for, it shifts planning assumptions for every ACT/ACF-adopter state row in the table."',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://ww2.arb.ca.gov/rulemaking-activity',
 'Same authoritative_url as rank 50 (the Class 4 tracker row) -- this rank-96 row is deliberately the RESEARCH-SURFACE framing of the identical underlying event (an early regulatory-pipeline signal with cross-state planning-assumption impact), while rank 50 is the OPERATIONS-SURFACE framing (the state-tracker itself). Not a duplicate: same source, two distinct surface-consumption purposes per the five-surface-test discipline applied in Bank 6.',
 'tracker', 'research_horizon_source'),

(97, 'IEA Hydrogen Tracker and Hydrogen Production and Infrastructure Projects Database', 'global', 'multi (global hydrogen-project technology-maturity tracker, freight-relevant for future zero-emission fuel supply)', 'multi',
 'Free official data tool, entity-confirmed. Covers all worldwide hydrogen production projects commissioned since 2000 (planning, under-construction, and operational stages) plus pipeline/storage/import-export-terminal infrastructure projects, with offtake-agreement tracking since 2020 -- a technology-maturity signal for future hydrogen-fueled freight (trucks, potentially maritime).',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.iea.org/data-and-statistics/data-tools/hydrogen-tracker',
 'Entity-confirmed: real, live. Distinct from the already-registered IEA Global Hydrogen Review 2025 REPORT (a periodic narrative publication) -- this is the underlying interactive data-tool/database, a different artifact type at the correct granularity for a technology-maturity TRACKER.',
 'data_feed', 'research_horizon_source'),

(98, 'PNNL Port Electrification Handbook (US maritime port shore-power and electrification reference)', 'us', 'ocean (US port electrification technology-maturity reference)', 'ocean',
 'Free official technology-maturity reference, entity-confirmed. Developed by Pacific Northwest National Laboratory to aid US maritime ports in clean-energy-transition planning (shore power, electrified cargo-handling equipment) -- the clearest single US port-electrification tracking resource found in this pass; no equivalent live PROJECT DATABASE (vs. a handbook/reference document) was confirmed in this pass, an honest gap rather than an assumed one.',
 'LOW', 'MISSING', NULL, 'minor', true, 'https://www.pnnl.gov/projects/port-electrification-handbook',
 'Entity-confirmed: real, live. A reference/handbook artifact rather than a live tracked-projects database (distinguishing it from rank 97''s IEA tool) -- flagged for the feed-build task that this row''s content shape differs from most other tracker/data_feed rows in the table.',
 'data_feed', 'research_horizon_source');
