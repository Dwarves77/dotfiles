-- 240_coverage_gap_census_sweep1_existing_feeds.sql
-- Session C (discovery lane), 2026-07-19. SWEEP 1 of the new mandate: enumerate what each of the
-- 62 already-dispositioned free feeds (acquisition_backlog_v Section 2) actually carries NOW,
-- classify against the four surface contracts (Regulations/Operations/Market Intel/Research), and
-- record a dryRun (predictive, non-binding) disposition. Fetch-light only (WebFetch: plain HTTP /
-- API / static HTML, no browser rendering). 21 of 62 could not be resolved fetch-light (403/404/
-- timeout/cert-error/empty-SPA-shell) and are logged fetch_method='browser_required' with the
-- specific obstacle named, routing to Session A's Chrome-enumeration queue per the operator's
-- instruction. 2 dead authoritative_url findings (rank 76, 82: 404) are real findings, not fetch
-- obstacles -- flagged for the source-health lane, not re-fetched here. Zero corpus writes, zero
-- source registrations, zero staged_updates rows: discovery-not-intake.

INSERT INTO public.coverage_gap_census_findings
  (sweep, subject_type, subject_ref, instrument, jurisdiction, url, fetch_method, fetch_result, four_contract_classification, dry_run_disposition, dry_run_reason, entity_confirmed, notes)
VALUES
('sweep1_existing_feed_audit','existing_feed','23','BLS labor cost data (warehousing and transportation wage series)','us','https://api.bls.gov/publicAPI/v2/timeseries/data/','api',
 'GET returned 405 Method Not Allowed. BLS Series API requires POST with series IDs + registration key; confirmed the API exists and is reachable via POST (fetch-light compatible, not a browser blocker).',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"IN","reason":"Direct warehousing/transportation wage series, the labor-cost input Operations hire-vs-automate comparisons need."},"market_intel":{"verdict":"OUT","reason":"Not a market-movement signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','API confirmed live via POST; not yet wired as an Operations-surface consumer.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','24','Eurostat labour cost index (NACE H, transportation and storage)','eu','https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lc_lci_lev','api',
 'GET succeeded; live JSON dataset returned (NACE Rev.2 labour cost levels, updated 2026-04-23).',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"IN","reason":"Live EU labour-cost series for the road-secondary Operations benchmark."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fetchable, not yet wired as an Operations-surface consumer.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','25','EIA industrial electricity retail pricing (state-filterable)','us','https://api.eia.gov/v2/electricity/retail-sales/data/','api',
 '403 Forbidden. EIA v2 API requires a registered api_key query parameter; confirmed the API exists, requires a free operator-obtained key (fetch-light compatible once keyed, not a browser blocker).',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"IN","reason":"State-level industrial electricity pricing, direct Operations cost input."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Needs a free registered API key; not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','29','UK ONS labour cost / earnings data (ASHE by SIC, transport and warehousing)','uk','https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/regionbyindustry2digitsicashetable5','plain_http',
 'Static dataset archive page; editions 1997-2025 directly downloadable, no JS needed.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"IN","reason":"UK regional/sector earnings data, direct Operations labor-cost input."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','30','Japan MHLW Basic Survey on Wage Structure (via e-Stat), transport sector','asia','https://www.e-stat.go.jp/en/statistics/00450091','plain_http',
 'Landing/metadata page only; links to the actual survey data tables hosted elsewhere on the same site (a register-enumeration case, not the raw data itself).',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"CONDITIONAL","reason":"Genuine wage data exists one hop deeper; this landing page alone does not carry it."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Needs a second-hop link-follow to the actual data tables, not just this landing page.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','31','Singapore MOM labour market statistics (wages, transport sector)','asia','https://stats.mom.gov.sg/','plain_http',
 'Portal landing page with links to a data explorer/filter tool, not raw data itself.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"CONDITIONAL","reason":"Genuine wage data exists via the linked explorer; landing page alone does not carry it."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Needs a second-hop follow into the data explorer.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','32','Brazil IBGE Pesquisa Industrial Mensal de Emprego e Salario','latam','https://www.ibge.gov.br/en/statistics/economic/industry-and-construction/17330-pesquisa-industrial-mensal-de-emprego-e-salario-2.html','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s Chrome-enumeration queue to confirm whether the block is durable.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','33','Mexico INEGI Encuesta Anual de Transportes (EAT) / ENOE','latam','https://www.inegi.org.mx/programas/eat/2018/','browser_required',
 'Only the page title returned ("Encuesta Anual de Transportes (EAT). Serie 2018"); no substantive content in the plain fetch, consistent with a JS-rendered body.',
 NULL,'browser_required_undetermined','Insufficient content in fetch-light pass; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','34','UAE FCSA UAE.Stat labour force and wage statistics','meaf','https://uaestat.fcsc.gov.ae/en','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','35','Switzerland BFS/OFS Swiss Earnings Structure Survey (ESS)','meaf','https://www.bfs.admin.ch/bfs/en/home/statistics/work-income/wages-income-employment-labour-costs/earnings-structure.html','plain_http',
 'Live and reachable; earnings-structure statistics page confirmed, but content was truncated in this light pass (fetch-tool length cap), not fully read.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"IN","reason":"Swiss earnings-structure data, inferred from the confirmed live page; full content not read this pass."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live and reachable; worth a full (uncapped) fetch at build time, this pass only confirmed liveness.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','36','South Africa Stats SA Quarterly Employment Statistics (QES)','meaf','https://www.statssa.gov.za/?p=18527','plain_http',
 'Q1 2025 employment media release visible with real figures ("Total employment decreased by 74 000 or -0.7% quarter-on-quarter"); some interactive nav elements use javascript:void(0) but the core release text is static and readable.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"IN","reason":"South African employment statistics, direct labor-market Operations input."},"market_intel":{"verdict":"IN","reason":"Quarterly employment change is a genuine market-moving labor signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Core release content already static-readable despite JS-dependent nav chrome.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','37','Eurostat electricity prices for non-household (industrial) consumers','eu','https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_205/default/table?lang=en','browser_required',
 'Only nav scaffold rendered, no data visible; explicit BROWSER_REQUIRED (databrowser UI shell).',
 NULL,'browser_required_undetermined','This is the interactive databrowser UI; Eurostat likely has a plain dissemination-API equivalent (same pattern as rank 24) that was not tested this pass, scope-bounded to what was registered. Flagged as a lead, not tested.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','38','UK DESNZ Quarterly Energy Prices (non-domestic/industrial electricity)','uk','https://www.gov.uk/government/collections/quarterly-energy-prices','plain_http',
 'Static collection index; publications 2015-2026 listed by quarter with dates, fully static.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text; statistical bulletins."},"operations":{"verdict":"IN","reason":"UK industrial/domestic electricity pricing series, direct Operations cost input."},"market_intel":{"verdict":"OUT","reason":"Not a market-movement signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','39','Japan METI/ANRE General Energy Statistics (industrial electricity)','asia','https://www.meti.go.jp/english/statistics/','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','40','Singapore EMA regulated electricity tariff + Uniform Singapore Energy Price','asia','https://www.ema.gov.sg/resources/statistics/average-monthly-uniform-singapore-energy-price','browser_required',
 'Landing page with a loading indicator, explicit BROWSER_REQUIRED for the embedded chart; direct Excel/PDF download links for the underlying data ARE present in the static HTML though.',
 NULL,'browser_required_undetermined','The page-embedded chart needs JS, but the Excel/PDF download links are a plain-HTTP-fetchable document path worth trying directly at build time rather than the rendered page.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','41','Brazil ANEEL open-data tariff datasets (Tarifa de Energia / TUSD)','latam','https://dadosabertos.aneel.gov.br/dataset/tarifas-distribuidoras-energia-eletrica','plain_http',
 'Dataset metadata page with CSV/XML/PDF resource links, fully static, no JS needed.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text; a tariff dataset."},"operations":{"verdict":"IN","reason":"Brazilian distribution-company electricity tariffs, direct Operations cost input."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, CSV/XML resources directly linked.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','42','Mexico CRE/CFE industrial electricity tariffs (Gran Demanda MTH)','latam','https://app.cfe.mx/Aplicaciones/CCFE/Tarifas/TarifasCREIndustria/Tarifas/GranDemandaMTH.aspx','browser_required',
 'TLS certificate verification failure ("unable to verify the first certificate") blocked the fetch-light attempt; a cert-chain issue specific to this host, not a JS-rendering issue.',
 NULL,'browser_required_undetermined','Genuinely blocked to this fetch tool by a TLS cert problem; a full 3-tier canonical-fetch transport may tolerate it differently. Flagged for build-time transport, not necessarily a Chrome-rendering need, but routed to the same worklist since it cannot be resolved fetch-light today.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','43','Switzerland ElCom electricity price and tariff data (LINDAS linked data)','meaf','https://energy.ld.admin.ch/elcom/electricityprice-swiss','api',
 'RDF/semantic-web metadata returned live (median electricity tariff dataset, temporal coverage 2009-2026); SPARQL endpoint and visualization tool linked, genuinely machine-readable.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text; a linked-data tariff dataset."},"operations":{"verdict":"IN","reason":"Swiss electricity tariff data, direct Operations cost input."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live SPARQL-queryable linked data, not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','44','South Africa NERSA-approved Eskom electricity tariffs (industrial)','meaf','https://www.nersa.org.za/','plain_http',
 'Static homepage with regulator decisions, municipal tariff determinations, and news, fully static, no JS needed.',
 '{"regulations":{"verdict":"IN","reason":"Regulator decisions and tariff determinations are binding regulatory content."},"operations":{"verdict":"IN","reason":"Eskom-approved industrial tariffs, direct Operations cost input."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, dual regulations/operations value.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','45','UAE FCSA electricity tariff by entity, slab consumption','meaf','https://uaestat.fcsc.gov.ae/vis?lc=en&fs%5B0%5D=FCSC+-+Statistical+Hierarchy%2C0%7CElectricity&df%5Bid%5D=DF_ELECTR_TCO&df%5Bag%5D=FCSA','browser_required',
 '403 Forbidden on plain fetch-light attempt (the interactive .Stat visualization endpoint, distinct from rank 34''s landing page).',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','47','Ship & Bunker world bunker prices (free daily port-level VLSFO/IFO/MGO)','global','https://shipandbunker.com/prices','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','48','Bunker Index (BIX) World and Regional Indices','global','https://bunkerindex.com/indices/index.php','plain_http',
 'Live prices returned directly in static HTML table: World/Americas/APAC/EMEA IFO380, VLSFO, MGO values with daily deltas (e.g. World VLSFO $821.07).',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"OUT","reason":"Not the primary use case."},"market_intel":{"verdict":"IN","reason":"Live daily bunker-price indices, a genuine Market Intel signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Genuinely live, price-bearing, fetchable feed, not yet wired as a Market Intel consumer.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','50','California CARB Rulemaking Activity tracker (Advanced Clean Trucks/Fleets)','us-ca','https://ww2.arb.ca.gov/rulemaking-activity','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue. Same authoritative_url as rank 96 (dual Operations/Research surface framing per migration 227); one fetch attempt covers both rows.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','51','Washington Department of Ecology WAC 173-423 Clean Vehicles Program','us-wa','https://ecology.wa.gov/regulations-permits/laws-rules-rulemaking/rulemaking/wac-173-423-clean-vehicles-program','plain_http',
 'Full rulemaking timeline visible (CR-101 filed Nov 2025, informal comment periods Jan/Mar 2026, CR-102 filing Jun 2026, hearings Aug 2026, anticipated adoption Nov 2026), draft rule language and meeting materials, fully static.',
 '{"regulations":{"verdict":"IN","reason":"Active rulemaking tracking WAC 173-423, adopting CARB standards by reference."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility data surface."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, active rulemaking with a real timeline, not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','52','Oregon DEQ Clean Truck Rules rulemaking tracker','us-or','https://www.oregon.gov/deq/rulemaking/pages/ctr2025.aspx','plain_http',
 'Adopted-rule announcement (Administrative Order DEQ-17-2025, finalized 2025-07-14), full procedural history visible, static.',
 '{"regulations":{"verdict":"IN","reason":"Adopted rule text and procedural record."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility surface."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live and static; rulemaking is now adopted/closed so tracker value is now a historical record rather than an active process, still a genuine regulatory fact.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','53','New Jersey DEP Advanced Clean Trucks rulemaking and fleet-reporting','us-nj','https://dep.nj.gov/stopthesoot/advanced-clean-trucks-rule-fleet-reporting/','browser_required',
 'Fetch timed out at 60s; content undetermined this pass.',
 NULL,'browser_required_undetermined','Timeout, not confirmed JS-dependent; worth a plain retry at build time before assuming a hard block. Routed to Session A''s queue in the meantime.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','54','Massachusetts DEP 310 CMR 7.40 (Low Emission Vehicle Program)','us-ma','https://www.mass.gov/regulations/310-CMR-700-air-pollution-control','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','55','Vermont DEC Advanced Clean Trucks program','us-vt','https://dec.vermont.gov/air-quality/mobile-sources/zero-emission-vehicles/ACT','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','56','Colorado CDPHE Clean Trucking program and Regulation 20','us-co','https://cdphe.colorado.gov/cleantrucking','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','57','Maryland MDE COMAR 26.11.43 (Advanced Clean Trucks Program) fact sheet','us-md','https://mde.maryland.gov/programs/regulations/air/Documents/2023%20ACT%20Fact%20Sheet%2005.24.23%20AQCAC.pdf','plain_http',
 'PDF fetched (255KB, 7pp, dated 2023-06-07); structural metadata visible but body text was not decompressed by this light pass, substantive content inconclusive from metadata alone.',
 '{"regulations":{"verdict":"CONDITIONAL","reason":"Very likely a regulatory fact sheet by title and source (MDE air-regulations documents path); body text not confirmed this pass, labeled inconclusive rather than asserted."},"operations":{"verdict":"OUT","reason":"Not the primary use case."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_park','PDF is reachable via plain HTTP, not browser-required; this light pass could not extract body text, a real fetch/parse at build time would resolve it, not blocked, just under-resolved.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','58','Rhode Island DEM Advanced Clean Cars II and Advanced Clean Trucks','us-ri','https://dem.ri.gov/environmental-protection-bureau/air-resources/mobile-sources/advanced-clean-cars-ii-advanced-clean','plain_http',
 'Final rule (250-RICR-120-05-37) with FAQ and legal framework (Clean Air Act Section 177), static, fully readable.',
 '{"regulations":{"verdict":"IN","reason":"Finalized rule text and legal citations."},"operations":{"verdict":"OUT","reason":"Not the primary use case."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','59','British Columbia Zero-Emission Vehicles Act (medium/heavy-duty)','ca-bc','https://www2.gov.bc.ca/gov/content/industry/electricity-alternative-energy/transportation-energies/clean-transportation-policies-programs/zero-emission-vehicles-act','plain_http',
 'Legislated sales targets (26% by 2026, 90% by 2030, 100% by 2035), compliance structure and advisory-council info, static.',
 '{"regulations":{"verdict":"IN","reason":"Legislated ZEV sales-target requirements."},"operations":{"verdict":"IN","reason":"Compliance/credit-tracking structure has direct Operations feasibility value."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, dual regulations/operations value.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','60','Quebec zero-emission vehicles (ZEV) standard, heavy-duty expansion','ca-qc','https://www.environnement.gouv.qc.ca/changementsclimatiques/vze/index-en.htm','plain_http',
 'Active public consultation open (2026-06-23 to 2026-07-23) on proposed amendments, registration/credit-tracking system, static.',
 '{"regulations":{"verdict":"IN","reason":"Active rulemaking consultation and binding standard text."},"operations":{"verdict":"IN","reason":"Credit-tracking and compliance-period reporting infrastructure."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, active consultation window makes this timely.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','61','Chile RETC (Registro de Emisiones y Transferencias de Contaminantes)','latam','https://retc.mma.gob.cl/','browser_required',
 'Homepage carousel/video/expandable-menu elements explicitly need JS for full functionality; some news headlines visible in the static pass.',
 NULL,'browser_required_undetermined','Partial static content only; full registry access needs JS. Routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','62','Germany LUCID Packaging Register (ZSVR)','eu','https://www.verpackungsregister.org/en/','plain_http',
 'Static homepage: packaging-law obligations, LUCID registration system links, news through June 2026.',
 '{"regulations":{"verdict":"IN","reason":"German packaging-law compliance framework and registration requirements."},"operations":{"verdict":"OUT","reason":"Not the primary use case."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','63','France Registre National des Producteurs (Citeo)','eu','https://www.citeo.com/en/my-membership/','plain_http',
 'FAQ with fee structures (EUR80 flat to per-unit), legal citations (Article L.541-10), penalty amounts, static.',
 '{"regulations":{"verdict":"IN","reason":"French EPR legal framework and penalty structure."},"operations":{"verdict":"IN","reason":"Fee/contribution-rate data is direct Operations cost input."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, dual regulations/operations value.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','64','UK Extended Producer Responsibility for packaging: public registers','uk','https://www.gov.uk/guidance/find-large-producers-on-the-report-packaging-data-service','plain_http',
 'Three public registers described (producers/schemes/reprocessors), static, cites Producer Responsibility Obligations (Packaging and Packaging Waste) Regulations 2024.',
 '{"regulations":{"verdict":"IN","reason":"Statutory register guidance under a named 2024 regulation."},"operations":{"verdict":"IN","reason":"Register content has direct vendor/compliance-status Operations value."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, dual regulations/operations value.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','65','Japan JCPRA (Japan Containers and Packaging Recycling Association)','asia','https://www.jcpra.or.jp/','plain_http',
 'Homepage with statutory obligations (Container Packaging Recycling Law) and fee structures referenced, mostly static.',
 '{"regulations":{"verdict":"IN","reason":"Statutory recycling-law obligations and fee structures."},"operations":{"verdict":"OUT","reason":"Not the primary use case."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, mostly static, not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','66','South Korea KECO Resource Circulation Compliance System (EPR)','asia','https://www.keco.or.kr/en/lay1/S295T386C400/contents.do','plain_http',
 'EPR program description, mandatory items (4 packaging materials, 7 products), exemption criteria table, static.',
 '{"regulations":{"verdict":"IN","reason":"Mandatory compliance obligations under Korean EPR scheme."},"operations":{"verdict":"OUT","reason":"Not the primary use case."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','70','Netherlands Verpact national packaging EPR','eu','https://business.gov.nl/regulations/packaging/','plain_http',
 'Dutch packaging requirements: 2014 Packaging Management Decree, thresholds, static.',
 '{"regulations":{"verdict":"IN","reason":"Statutory packaging-law requirements and thresholds."},"operations":{"verdict":"OUT","reason":"Not the primary use case."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, not yet wired.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','71','Belgium dual packaging EPR system (Fost Plus / Valipac)','eu','https://www.ecopv-eu.com/en/packaging-belgium-epr-guideline/','plain_http',
 'Full compliance guide: thresholds, fee/eco-modulation, incoming PPWR de-minimis elimination noted, static.',
 '{"regulations":{"verdict":"IN","reason":"Belgian EPR compliance requirements, including a forward PPWR threshold change."},"operations":{"verdict":"IN","reason":"Fee-calculation and threshold data is direct Operations cost input."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, dual regulations/operations value, includes a real forward-looking PPWR change.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','72','Italy CONAI (Consorzio Nazionale Imballaggi) and RENAP','eu','https://www.conai.org/','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','73','Spain Registro de Productores de Producto (Ecoembes)','eu','https://www.ecoembes.com/en/registration-product-producers','plain_http',
 'Registry landing page (Royal Decree 1055/2022), minimal content, static.',
 '{"regulations":{"verdict":"IN","reason":"Statutory registry under a named Royal Decree."},"operations":{"verdict":"OUT","reason":"Not the primary use case; landing page carries minimal operational detail."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, static, thin content but a genuine regulatory registry entry point.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','74','Poland BDO (Baza Danych o Produktach i Opakowaniach)','eu','https://bdo.mos.gov.pl/','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','75','Austria ARA (Altstoff Recycling Austria)','eu','https://www.ara.at/en','plain_http',
 'Homepage describing EPR services (packaging, e-waste, battery compliance), static.',
 '{"regulations":{"verdict":"IN","reason":"Austrian EPR compliance-organization services."},"operations":{"verdict":"IN","reason":"Licensing/material-flow service descriptions have Operations feasibility value."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, dual regulations/operations value.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','76','Sweden EPR packaging producer-responsibility reporting','eu','https://www.naturvardsverket.se/en/guidance/extended-producer-responsibility-epr/producer-responsibility-for-packaging/','plain_http',
 '404 Not Found. The registered authoritative_url no longer resolves.',
 NULL,'would_decline','A dead-URL finding, not a fetch obstacle. The registered authoritative_url needs re-verification/correction, flagged for the source-health lane rather than this census.',true,'Real finding: authoritative_url is stale.'),

('sweep1_existing_feed_audit','existing_feed','77','Denmark Dansk Producentansvar (DPA)','eu','https://producentansvar.dk/en/about-us/','plain_http',
 'About-us page: governance/board structure, IT systems for producer-responsibility registers across electronics/batteries/vehicles/packaging, static.',
 '{"regulations":{"verdict":"IN","reason":"Danish EPR administrator, statutory basis under the Environmental Protection Act."},"operations":{"verdict":"IN","reason":"Register infrastructure description has Operations compliance-status value."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_mint','Live, fully static, dual regulations/operations value.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','78','EU-EPR-remainder (rollup placeholder, ~19 smaller EU member-state packaging registers)','eu',NULL,'not_applicable',
 NULL,NULL,'not_applicable','Rollup placeholder row with no single authoritative_url of its own; no individual feed to enumerate. Each real register would need its own row if/when priced individually.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','80','EPD International EPD Library','global','https://www.environdec.com/library','browser_required',
 'Static pass shows ~10 of ~2245 total entries; full pagination/filtering needs JS.',
 NULL,'would_mint','Partial static content visible; a build-time integration should look for an API/bulk-export path rather than paginated scraping. Routed to Session A''s queue for the full-depth pass.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','81','Science Based Targets initiative (SBTi) Target Dashboard','global','https://sciencebasedtargets.org/target-dashboard','browser_required',
 'Explicit BROWSER_REQUIRED for the interactive 15,246-record filter dashboard; summary stats visible in the static pass (13,895 companies, 11,549 validated targets); an Excel export is referenced.',
 NULL,'would_mint','The Excel bulk-export path referenced on the page is the fetch-light-appropriate integration route, worth a direct check at build time rather than the JS dashboard itself.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','82','Freightos Baltic Index (FBX)','global','https://www.freightos.com/freight-index/','browser_required',
 '404 Not Found. The registered authoritative_url no longer resolves.',
 NULL,'would_decline','A dead-URL finding, not a fetch obstacle. Registered authoritative_url needs re-verification, flagged for the source-health lane rather than this census.',true,'Real finding: authoritative_url is stale.'),

('sweep1_existing_feed_audit','existing_feed','85','EEX EU ETS Spot, Futures and Options','eu','https://www.eex.com/en/markets/environmental-markets/eu-ets-spot-futures-options','plain_http',
 'Static contract-specifications page (contract volume, tick size, delivery procedures); no live prices on this specific page.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text; exchange product specifications."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility surface."},"market_intel":{"verdict":"CONDITIONAL","reason":"Reference/product-spec content, not a live price feed; the live-price value (if any) lives elsewhere on eex.com and was not tested this pass."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_decline','This page is product specifications, not a live price feed; not a genuine gap-closing candidate as registered.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','86','ICE EU Carbon Allowance futures launch','global','https://ir.theice.com/press/news-details/2025/ICE-Launches-EU-Carbon-Allowance-2-Futures/default.aspx','plain_http',
 'Static press release announcing the 2025-05-06 EUA2 futures launch; a one-time dated announcement, not an ongoing feed.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility surface."},"market_intel":{"verdict":"IN","reason":"Genuinely a market-moving instrument-launch signal, but this specific URL is a single dated event, not a recurring feed."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_decline','Single dated press release, already fully captured as a point-in-time fact; no ongoing enumeration value from this specific URL.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','88','UNCTADstat container port throughput database','global','https://unctadstat.unctad.org/datacentre/dataviewer/US.ContPortThroughput','browser_required',
 'Empty body in static pass beyond institutional metadata; explicit BROWSER_REQUIRED, SPA data-viewer shell.',
 NULL,'browser_required_undetermined','Routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','91','SSRN Transportation Research Network (TransportRN)','global','https://www.ssrn.com/index.cfm/en/transportrn/','browser_required',
 '403 Forbidden on plain fetch-light attempt.',
 NULL,'browser_required_undetermined','Bot-blocked to fetch-light; routed to Session A''s queue.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','92','arXiv physics.soc-ph (Physics and Society) listing','global','https://arxiv.org/list/physics.soc-ph/recent','plain_http',
 '35 entries visible for 2026-07-13 through 2026-07-17, full listing with titles/authors, static and current.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"OUT","reason":"Not the primary use case."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"IN","reason":"Live, current preprint listing spanning climate/social-dynamics/policy-impact research, genuine Research horizon-scan content."}}'::jsonb,
 'would_mint','Live, current, fully static listing, not yet wired as a Research-surface intake walker.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','94','EU "Have Your Say" public consultation portal','eu','https://have-your-say.ec.europa.eu/index_en','plain_http',
 'Three engagement channels described (public consultations, European Citizens'' Initiative, Citizens'' Engagement Platform); the mechanism is static and reachable, but no specific CURRENT open-consultation listing is visible on this landing page.',
 '{"regulations":{"verdict":"CONDITIONAL","reason":"Genuine early-signal value per ADR-015''s awareness-tier framing, but this landing page describes the mechanism rather than listing today''s open consultations."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility surface."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Not horizon-scan in the academic sense, though early-signal adjacent."}}'::jsonb,
 'would_mint','Mechanism page reachable and static; the actual per-consultation listing needs a deeper page or an API, a second-hop register-enumeration case.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','95','ICAO CAEP (Committee on Aviation Environmental Protection)','global','https://www.icao.int/CAEP','plain_http',
 'Committee structure, membership (34 states + 21 observers), 8 working groups, milestones visible; no current meeting documents visible on this page.',
 '{"regulations":{"verdict":"IN","reason":"Institutional/governance body formulating ICAO SARPs, binding aviation environmental standards."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility surface."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"OUT","reason":"Structural page only; meeting-document depth not confirmed this pass."}}'::jsonb,
 'would_park','Structural page reachable and static; the actual meeting-document index (the real feedstock value) is a deeper page not confirmed this pass, a second-hop register-enumeration case per the build plan''s Phase-1 seam, not resolved here.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','96','California CARB Advanced Clean Trucks / Advanced Clean Fleets (Research carry-forward)','us-ca','https://ww2.arb.ca.gov/rulemaking-activity','browser_required',
 'Same authoritative_url as rank 50; 403 Forbidden confirmed once via rank 50''s fetch attempt, not re-fetched separately.',
 NULL,'browser_required_undetermined','Duplicate URL with rank 50 (dual Operations/Research surface framing per migration 227); one fetch attempt serves both census rows honestly rather than a redundant second call.',true,'Duplicate authoritative_url with rank 50.'),

('sweep1_existing_feed_audit','existing_feed','97','IEA Hydrogen Tracker and Production/Infrastructure Database','global','https://www.iea.org/data-and-statistics/data-tools/hydrogen-tracker','browser_required',
 'Landing/description page only (project-level data, 1,000+ policy tracker, cost-to-2030 projections described); the interactive data explorer itself is not embedded in the static HTML.',
 NULL,'browser_required_undetermined','Routed to Session A''s queue for the actual tracker interface.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','98','PNNL Port Electrification Handbook','us','https://www.pnnl.gov/projects/port-electrification-handbook','plain_http',
 'Project overview with downloadable handbook/executive-summary/workbook (PDF/Excel), static.',
 '{"regulations":{"verdict":"OUT","reason":"Not regulatory text."},"operations":{"verdict":"OUT","reason":"A reference handbook, not live jurisdictional cost data."},"market_intel":{"verdict":"OUT","reason":"Not a market signal."},"research":{"verdict":"IN","reason":"Forward-looking port-electrification planning guidance, genuine Research horizon-scan content."}}'::jsonb,
 'would_mint','Live, fully static, downloadable resources directly linked.',true,NULL),

('sweep1_existing_feed_audit','existing_feed','103','FMC tariff and surcharge monitoring','us','https://www.fmc.gov/articles/fmc-monitoring-and-review-of-surcharges-and-fees/','plain_http',
 'A 2024-10-11 dated news article, static, full text visible; not a recurring monitoring index.',
 '{"regulations":{"verdict":"IN","reason":"FMC enforcement-posture statement on surcharge legality."},"operations":{"verdict":"OUT","reason":"Not a cost/feasibility surface."},"market_intel":{"verdict":"IN","reason":"Enforcement signaling that could affect ocean-carrier surcharge decisions."},"research":{"verdict":"OUT","reason":"Not horizon-scan."}}'::jsonb,
 'would_decline','This specific URL is one dated news article, already fully captured as a point fact. If FMC publishes an ongoing surcharge-review index/register, that would be the actual feed-worthy URL; not tested this pass, second-hop needed, flagged not fetched (sweep 1 scope is auditing registered URLs as-is).',true,NULL);
