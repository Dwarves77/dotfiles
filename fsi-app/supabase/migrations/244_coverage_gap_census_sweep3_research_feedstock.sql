-- 244_coverage_gap_census_sweep3_research_feedstock.sql
-- Session C (discovery lane), 2026-07-19. SWEEP 3 (final sweep of this mandate): Research feedstock
-- catalogs per ADR-015's G-6 feedstock-gap registration -- ISO/CEN standards-body work programmes for
-- freight-relevant technical committees, and a transport-research publication index. IMO's document/
-- resolution index was checked and DROPPED before fetch: already registered (imo.org "Index of MEPC
-- Resolutions and Guidelines related to MARPOL Annex VI", active), a HAVE not a gap -- caught by
-- dedup-before-generation against the live sources table. ICAO document-index coverage is already
-- represented by coverage_gap_candidates rank 95 (CAEP, sweep 1); not duplicated here. Fetch-light
-- only; browser-blocked rows carry pending_dependency per the operator's visibility ruling. Zero
-- corpus writes, zero source registrations: discovery-not-intake.

INSERT INTO public.coverage_gap_census_findings
  (sweep, subject_type, subject_ref, instrument, jurisdiction, url, fetch_method, fetch_result, four_contract_classification, dry_run_disposition, dry_run_reason, entity_confirmed, pending_dependency, notes)
VALUES
('sweep3_research_feedstock','candidate_catalog','iso-tc8','ISO/TC 8 Ships and marine technology, work programme','global','https://www.iso.org/committee/45776.html','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep3_research_feedstock','candidate_catalog','iso-tc104','ISO/TC 104 Freight containers, work programme','global','https://www.iso.org/committee/48192.html','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep3_research_feedstock','candidate_catalog','cen-tc320','CEN/TC 320 Transport, Logistics and Services, work programme','eu','https://standards.cencenelec.eu/dyn/www/f?p=205:7:0::::FSP_ORG_ID:6295','browser_required',
 '500 Internal Server Error on plain fetch-light attempt (not confirmed JS-dependent, but blocked regardless).',
 NULL,'browser_required_undetermined','Server-side failure to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep3_research_feedstock','candidate_catalog','trid','Transport Research International Documentation (TRID, TRB/OECD-ITRD joint database)','global','https://trid.trb.org/','plain_http',
 'Homepage: search/access interface, "1.5 million records of transportation research worldwide" across aviation, highways, rail, public transit and other modes, functional as static HTML.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility surface."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"IN","reason":"A large, live, cross-modal transport-research publication index -- directly the Research surface''s horizon-scan feedstock, per ADR-015''s G-6 registration."}}'::jsonb,
 'would_mint','Live, reachable, large-scale transport-research index not among held sources.',true,NULL,NULL);
