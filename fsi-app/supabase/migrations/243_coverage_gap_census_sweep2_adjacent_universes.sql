-- 243_coverage_gap_census_sweep2_adjacent_universes.sql
-- Session C (discovery lane), 2026-07-19. SWEEP 2: adjacent enumerable universes the original
-- discovery arc identified as categories but did not enumerate as instances -- rate indices, fuel
-- and carbon price feeds, port authority tariff publications, carrier surcharge notices, plain-HTTP
-- register indexes not among held sources. 15 candidates, entity-confirmed and dedup-checked against
-- coverage_gap_candidates and the live sources table before fetch (IMO's MEPC-resolutions index was
-- caught this way and dropped -- already registered, a HAVE not a gap). Fetch-light only; browser-
-- blocked rows carry pending_dependency='session_a_chrome_render' per the operator's visibility
-- ruling. Zero corpus writes, zero source registrations: discovery-not-intake.

INSERT INTO public.coverage_gap_census_findings
  (sweep, subject_type, subject_ref, instrument, jurisdiction, url, fetch_method, fetch_result, four_contract_classification, dry_run_disposition, dry_run_reason, entity_confirmed, pending_dependency, notes)
VALUES
('sweep2_adjacent_universes','candidate_source','rate-index-baltic-dry','Baltic Exchange dry bulk indices (BDI/BCI/BPI/BSI)','global','https://www.balticexchange.com/en/data-services/market-information0/dry-services.html','browser_required',
 'Confirmed the entity and page exist (dry bulk freight indices); dynamic query mechanism (`javascript:` handlers) needed for live values.',
 NULL,'browser_required_undetermined','Genuine market-benchmark entity, blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','rate-index-scfi','Shanghai Containerized Freight Index (SCFI)','global','https://en.sse.net.cn/indices/scfinew.jsp','browser_required',
 'Confirmed the entity and query interface exist; `javascript:querySCFI2()` and similar handlers gate live values.',
 NULL,'browser_required_undetermined','Genuine market-benchmark entity, blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','rate-index-ccfi','China Containerized Freight Index (CCFI)','global','https://en.sse.net.cn/indices/ccfinew.jsp','browser_required',
 'Confirmed the entity and query interface exist (same host as SCFI, sibling index); `javascript:queryCCFI2()` gates live values.',
 NULL,'browser_required_undetermined','Genuine market-benchmark entity, blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','carbon-carb-auction','California Cap-and-Trade Program auction information (CARB)','us-ca','https://ww2.arb.ca.gov/our-work/programs/cap-and-trade-program/auction-information','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','carbon-rggi-auction','Regional Greenhouse Gas Initiative (RGGI) auction results','us','https://www.rggi.org/auctions/auction-results','plain_http',
 'Static HTML table: cumulative proceeds ($11.4B+), recent auction pricing/volumes, bidder statistics across 11 participating US states.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text; transactional auction records."},"operations":{"verdict":"IN","reason":"Regional carbon-allowance cost data, direct Operations input for RGGI-covered lanes."},"market_intel":{"verdict":"IN","reason":"Carbon-price auction results are a genuine market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, dual operations/market_intel value, not among held sources.',true,NULL,NULL),

('sweep2_adjacent_universes','candidate_source','port-tariff-la','Port of Los Angeles tariff schedule','us','https://www.portoflosangeles.org/business/tariff','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','port-tariff-rotterdam','Port of Rotterdam port dues and tariffs','eu','https://www.portofrotterdam.com/en/doing-business/port-tariffs','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','port-tariff-hamburg','Hamburg Port Authority tariffs','eu','https://www.hamburg-port-authority.de/en/hpa-360/port-tariffs','browser_required',
 '404 Not Found. The entity (Hamburg Port Authority, a real port authority that publishes tariffs) is well established, but this specific URL guess did not resolve and the correct current URL was not independently re-derived this pass.',
 NULL,'browser_required_undetermined','URL unconfirmed this pass, entity real but not independently entity-confirmed via a second source; needs either a corrected URL search or Session A''s Chrome-based navigation.',false,'session_a_chrome_render','entity_confirmed=false: URL guess only, not independently verified.'),

('sweep2_adjacent_universes','candidate_source','carrier-surcharge-maersk','Maersk surcharge and rate notifications','global','https://www.maersk.com/news/notifications','browser_required',
 'Connection reset (ECONNRESET) on fetch-light attempt.',
 NULL,'browser_required_undetermined','Network-level failure, not confirmed JS-dependent; entity and page purpose well known (Maersk publishes surcharge notices here). Routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','carrier-surcharge-msc','MSC newsroom (surcharge and rate notices)','global','https://www.msc.com/en/newsroom','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','carrier-surcharge-cmacgm','CMA CGM news (surcharge and local notices)','global','https://www.cma-cgm.com/news/list','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','carrier-surcharge-hapaglloyd','Hapag-Lloyd local news (surcharge and rate notices)','global','https://www.hapag-lloyd.com/en/company/press/local-news.html','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,'session_a_chrome_render',NULL),

('sweep2_adjacent_universes','candidate_source','register-ecfr-api','eCFR (Electronic Code of Federal Regulations) versioner API','us','https://www.ecfr.gov/api/versioner/v1/titles.json','api',
 'GET succeeded; live JSON listing of all 50 CFR titles with amendment/issue dates and currency status as of 2026-07-16.',
 '{"regulations":{"verdict":"IN","reason":"Live, machine-readable index of the official compiled federal regulations."},"operations":{"verdict":"OUT","reason":"Not a jurisdictional cost/feasibility surface."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully machine-readable API, plain-HTTP register index not among held sources.',true,NULL,NULL),

('sweep2_adjacent_universes','candidate_source','register-legislation-gov-uk','UK legislation.gov.uk developer API','uk','https://www.legislation.gov.uk/developer/api','plain_http',
 'Static HTML with a search interface across primary/secondary/EU-derived UK legislation categories, but the fetch-light pass rendered a "Coming Soon" banner on this specific API-documentation sub-path, inconsistent with legislation.gov.uk''s well-established live status as a whole site -- flagged as an ambiguity, not resolved this pass.',
 '{"regulations":{"verdict":"CONDITIONAL","reason":"The site is a genuine, well-established UK legislation register; this specific sub-page''s content is ambiguous in this pass (see fetch_result), not confidently IN."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility surface."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_park','The site itself is real and valuable, but this pass could not confirm live API-documentation content at this URL; worth a direct re-check rather than a confident would_mint or would_decline.',true,NULL,NULL),

('sweep2_adjacent_universes','candidate_source','register-legislation-au','Australia Federal Register of Legislation','global','https://www.legislation.gov.au/','plain_http',
 'Homepage: search/browse for Acts, legislative instruments, gazettes, administrative arrangements. Functional as static HTML.',
 '{"regulations":{"verdict":"IN","reason":"The authoritative Australian Commonwealth legislation repository."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility surface."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, reachable, plain-HTTP register index not among held sources.',true,NULL,NULL);
