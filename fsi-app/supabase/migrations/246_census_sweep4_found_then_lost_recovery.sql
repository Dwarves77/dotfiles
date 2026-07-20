-- 246_census_sweep4_found_then_lost_recovery.sql
-- Session C (discovery lane), 2026-07-19. FOUND-THEN-LOST SOURCE RECOVERY AUDIT, census landing.
-- 35 lost_historical_provider rows: providers the repo's own history shows were found, mapped, or
-- evaluated in past source sweeps (the 2026-05-09 esgtoday "Source Registry Expansion" map + its
-- 2026-05-10 existence-check, the legacy Gemini-era seed-resources.json, seed-sources.sql, the
-- sprint3 vendor-source-sweep, both session logs) but are invisible to EVERY table in today's system
-- (sources / provisional_sources / canonical_source_candidates / portal_link_candidates /
-- census_worklist / coverage_gap_candidates / coverage_gap_census_findings / disposition_ledger).
-- LOST determined by a normalized-host diff against all of the above (825 active + 1297 total sources,
-- 1371 distinct tracked hosts). Discovery-not-intake: zero corpus writes, zero source registrations.
--
-- OPERATOR RULINGS (2026-07-19), applied verbatim:
--   * Census boundary: land the 15 market-data + 7 regulators + 4 standards + IEA (operator_confirm)
--     + 8 trade-press (would_park). OMIT the 4 tier-6 vendor-claim tools (passionfruit.earth,
--     slrconsulting.com, sparq360.com, sprih.com) entirely -- non-authorities, no census value.
--   * lens tag per row: freight_native (the maritime/energy/operations-emissions cluster, per the
--     operator's explicit 9-item list plus source-nature parallel) vs esg_finance (the
--     finance-supervisory + ESG-reporting inheritance). Tag, not re-scope; all 35 land.
--   * Operator answers recorded as given: IEA -> active account confirmed (auth-gated feed is
--     operator-credentialed, not cold); market-data providers -> no accounts held (they stay cold
--     LOST candidates, not live feeds).
--
-- ABSENCE FINDING (load-bearing, per the report): no artifact literally labeled "Gemini" exists in
-- history (tracked or deleted); every "gemini" hit is the "Capgemini" substring or Session C's own
-- methodology note. The operator's earlier-phase source research is NOT lost as a whole -- it survives
-- committed as seed-resources.json (119 legacy resource records) and the esgtoday-derived source map.
-- What leaked is the subset of PROVIDERS inside it that never became tracked sources: these 35 rows.
--
-- SCOPE NOTE (carried from the report, non-silent): the esgtoday map's Section C (hundreds of
-- corporate actors -- carriers, forwarders, manufacturers, luxury/museum/studio clients) is
-- DELIBERATELY EXCLUDED. They are the subjects data providers report on, not data providers; the
-- 2026-05-10 existence-check itself framed their ~0% registry presence as by-design for a separate
-- Market-Intel corporate-signal workstream. Excluded here so the omission is recorded, not hidden.
--
-- four_contract_classification carries a provider-level {primary_surface: ...} rather than the
-- document-level four-key {verdict,reason} contract used in sweeps 1-3: a lost PROVIDER has no single
-- document to test against the five surfaces, so the coarser provider-level surface is the honest form.

INSERT INTO public.coverage_gap_census_findings
  (sweep, subject_type, subject_ref, instrument, jurisdiction, url, fetch_method, four_contract_classification, dry_run_disposition, dry_run_reason, entity_confirmed, lens, historical_evidence, historical_intent, auth_gate, operator_confirm_question, notes)
VALUES
-- ============ MARKET-DATA, esg_finance (finance-supervisory inheritance) ============
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:msci','MSCI (climate alignment, ESG ratings)','global','https://www.msci.com/research','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Commercial ESG-ratings provider; paid relationship, a spend decision not a free-acquire. Operator confirms no account held.',true,'esg_finance',
 'esgtoday source-map 2026-05-09 Section B3; existence-check 2026-05-10 ABSENT, assigned tier T3.','Section H dispatch: add to registry with role+tier. The add never happened for B3.',NULL,NULL,
 'LOST: absent from all tracked tables. Operator confirmed 2026-07-19: no account held.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:moodys','Moody''s (sustainability bonds, transition finance)','global','https://www.moodys.com','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Commercial finance-data provider; paid. Operator confirms no account held.',true,'esg_finance',
 'esgtoday source-map B3; existence-check ABSENT tier T3.','add to registry with role+tier.',NULL,NULL,
 'LOST. Operator confirmed 2026-07-19: no account held.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:morganstanley','Morgan Stanley Institute for Sustainable Investing (investor flow data)','global','https://www.morganstanley.com/ideas','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Commercial investor research; paid/gated. Operator confirms no account held.',true,'esg_finance',
 'esgtoday source-map B3; existence-check ABSENT tier T3.','add to registry with role+tier.',NULL,NULL,
 'LOST. Operator confirmed 2026-07-19: no account held.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:ftserussell','FTSE Russell (asset-owner sustainability surveys)','global','https://www.ftserussell.com/research','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Commercial index/research provider; gated. Operator confirms no account held.',true,'esg_finance',
 'esgtoday source-map B3; existence-check ABSENT tier T3.','add to registry with role+tier.',NULL,NULL,
 'LOST. Operator confirmed 2026-07-19: no account held.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:linkedin-economicgraph','LinkedIn Economic Graph (green-skills / workforce data)','global','https://economicgraph.linkedin.com','not_applicable',
 '{"primary_surface":"operations"}'::jsonb,'would_park','Gated workforce-data platform. Operator confirms no account held.',true,'esg_finance',
 'esgtoday source-map B3; existence-check ABSENT tier T3.','add to registry with role+tier.',NULL,NULL,
 'LOST. Operator confirmed 2026-07-19: no account held.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:workiva','Workiva (sustainability reporting tooling, surveys)','global','https://www.workiva.com/insights','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Commercial reporting-tooling vendor. Operator confirms no account held.',true,'esg_finance',
 'esgtoday source-map B3; existence-check ABSENT tier T3.','add to registry with role+tier.',NULL,NULL,
 'LOST. Operator confirmed 2026-07-19: no account held.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:mordor','Mordor Intelligence (transport/logistics market research)','global','https://www.mordorintelligence.com','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Commercial market-research reports; paid.',true,'esg_finance',
 'legacy seed-resources.json (Asia-Pacific record g24 prose).','embedded reference in a legacy resource; never promoted to a source.',NULL,NULL,
 'LOST: absent from all tracked tables.'),
-- ============ MARKET-DATA, freight_native (operator maritime-emissions cluster) ============
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:rystad','Rystad Energy (energy market intelligence, SAF pricing)','global','https://www.rystadenergy.com','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Commercial energy-market intelligence; paid. Operator confirms no account held.',true,'freight_native',
 'esgtoday source-map B3 + seed-resources (CORSIA record a4); existence-check ABSENT tier T2.','add, SAF/energy pricing feed.',NULL,NULL,
 'LOST. Operator confirmed 2026-07-19: no account held.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:searoutes','Searoutes (routing / freight-emissions data)','global','https://www.searoutes.com','not_applicable',
 '{"primary_surface":"operations"}'::jsonb,'would_park','Commercial routing/emissions API/SaaS.',true,'freight_native',
 'legacy seed-resources.json (emissions-accounting record a7 prose).','embedded reference; never promoted.',NULL,NULL,
 'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:bigmile','BigMile (freight emissions calculation)','eu','https://www.bigmile.eu','not_applicable',
 '{"primary_surface":"operations"}'::jsonb,'would_park','Commercial emissions-calc SaaS.',true,'freight_native',
 'legacy seed-resources.json (think-tanks record r34 prose).','embedded reference; never promoted.',NULL,NULL,
 'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:zeronorth','ZeroNorth (maritime emissions / optimization data)','global','https://www.zeronorth.com','not_applicable',
 '{"primary_surface":"operations"}'::jsonb,'would_park','Commercial maritime-optimization SaaS.',true,'freight_native',
 'legacy seed-resources.json (green-corridors record r32 prose).','embedded reference; never promoted.',NULL,NULL,
 'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:entsoe','ENTSO-E Transparency Platform (EU electricity grid / transmission data)','eu','https://www.entsoe.eu','not_applicable',
 '{"primary_surface":"operations"}'::jsonb,'would_mint','Free EU grid transparency platform (registration-gated but free API); direct Operations energy-cost input, worth recovering.',true,'freight_native',
 'seed-sources.sql Section F (EU energy data).','named in the operations-layer source class; never registered.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:cdp-opendata','CDP Open Data API (Socrata; free disclosure data)','global','https://data.cdp.net','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_mint','Free open-data API sibling of the held cdp.net; worth recovering as a machine-readable feed.',true,'freight_native',
 'sprint3-a15 vendor-source-sweep 2026-05-25 (notes_snippet named the Socrata endpoint).','flagged in the vendor sweep as CDP''s open-data API; cdp.net registered, the API endpoint not.',NULL,NULL,
 'LOST: cdp.net is held, this data.cdp.net API endpoint is not. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:terrascope','Terrascope (emissions data platform)','global','https://www.terrascope.com','not_applicable',
 '{"primary_surface":"operations"}'::jsonb,'would_park','Commercial emissions-data SaaS. Operator confirms no account held.',true,'freight_native',
 'legacy seed-resources.json (Asia-Pacific record g20 prose).','embedded reference; never promoted.',NULL,NULL,
 'LOST. Operator confirmed 2026-07-19: no account held.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:normative','Normative (carbon accounting data)','global','https://www.normative.io','not_applicable',
 '{"primary_surface":"operations"}'::jsonb,'would_park','Commercial carbon-accounting SaaS. Operator confirms no account held.',true,'freight_native',
 'legacy seed-resources.json (think-tanks record r13 prose).','embedded reference; never promoted.',NULL,NULL,
 'LOST. Operator confirmed 2026-07-19: no account held.'),
-- ============ REGULATORS, esg_finance (all free gov, would_mint) ============
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:ecb','European Central Bank (banking supervision, climate risk)','eu','https://www.ecb.europa.eu','not_applicable',
 '{"primary_surface":"regulations"}'::jsonb,'would_mint','Free official regulator; genuine regulatory-authority gap.',true,'esg_finance',
 'esgtoday source-map A1; existence-check ABSENT tier T2.','add to registry with role+tier.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:eiopa','EIOPA (insurance & pensions sustainability)','eu','https://www.eiopa.europa.eu','not_applicable',
 '{"primary_surface":"regulations"}'::jsonb,'would_mint','Free official regulator.',true,'esg_finance',
 'esgtoday source-map A1; existence-check ABSENT tier T2.','add to registry with role+tier.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:afm','Dutch AFM (Netherlands sustainability claims)','eu','https://www.afm.nl','not_applicable',
 '{"primary_surface":"regulations"}'::jsonb,'would_mint','Free national regulator.',true,'esg_finance',
 'esgtoday source-map A4; existence-check ABSENT tier T3.','add to registry with role+tier.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:hkma','Hong Kong HKMA (sustainable-finance taxonomy)','asia','https://www.hkma.gov.hk','not_applicable',
 '{"primary_surface":"regulations"}'::jsonb,'would_mint','Free monetary/regulatory authority.',true,'esg_finance',
 'esgtoday source-map A4; existence-check ABSENT tier T3.','add to registry with role+tier.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:sebi','SEBI (India BRSR / ESG ratings)','asia','https://www.sebi.gov.in','not_applicable',
 '{"primary_surface":"regulations"}'::jsonb,'would_mint','Free national markets regulator.',true,'esg_finance',
 'esgtoday source-map A4; existence-check ABSENT tier T2.','add to registry with role+tier.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:dg-grow','European Commission DG GROW (industrial policy, made-in-EU)','eu','https://single-market-economy.ec.europa.eu','not_applicable',
 '{"primary_surface":"regulations"}'::jsonb,'would_mint','Free official EC directorate.',true,'esg_finance',
 'esgtoday source-map A1; existence-check ABSENT tier T2.','add to registry with role+tier.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:nyc-comptroller','New York City Comptroller (pension climate alignment)','us','https://comptroller.nyc.gov','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_mint','Free public office; investor-signal source.',true,'esg_finance',
 'esgtoday source-map A3; existence-check ABSENT tier T3.','add to registry with role+tier (investor signal).',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
-- ============ STANDARDS ============
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:sasb','SASB (industry-specific sustainability standards)','global','https://www.sasb.org','not_applicable',
 '{"primary_surface":"research"}'::jsonb,'would_mint','Free standards reference (now under IFRS/ISSB stewardship).',true,'esg_finance',
 'esgtoday source-map A5; existence-check ABSENT tier T2.','add to registry with role+tier.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:tcfd','TCFD (climate-related financial disclosure framework)','global','https://www.fsb-tcfd.org','not_applicable',
 '{"primary_surface":"research"}'::jsonb,'would_mint','Free framework reference (legacy, folded into ISSB).',true,'esg_finance',
 'esgtoday source-map A5; existence-check ABSENT tier T3.','add to registry with role+tier.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:sea-lng','SEA-LNG (maritime LNG-fuel coalition / position data)','global','https://sea-lng.org','not_applicable',
 '{"primary_surface":"research"}'::jsonb,'would_mint','Free industry-body site; maritime alternative-fuel positions.',true,'freight_native',
 'seed-sources.sql Section F (ocean fuels) + seed-resources record o8.','named in the fuels-and-technology source class; never registered.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:adec-esg','ADEC ESG (emissions reporting standard / reference)','global','https://www.adecesg.com','not_applicable',
 '{"primary_surface":"research"}'::jsonb,'would_mint','Free reference/reporting standard content.',true,'esg_finance',
 'legacy seed-resources.json (supply-chain-data record c9 prose).','embedded reference; never promoted.',NULL,NULL,
 'LOST: absent from all tracked tables. Free-acquire candidate.'),
-- ============ AUTH-GATED, operator_confirm ============
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:iea-monthly-electricity','IEA Monthly Electricity Statistics (statsnews@iea.org newsletter)','global','https://www.iea.org/data-and-statistics','not_applicable',
 '{"primary_surface":"operations"}'::jsonb,'operator_confirm','iea.org host is HELD (13 source rows) but this specific product is not; it arrives newsletter-borne and the new IEA platform is login-gated. Operator receives the newsletter, so a signup exists.',true,'freight_native',
 'operator inbound newsletter statsnews@iea.org; IEA in the design_handoff market-intel mockup + PROGRAM-BOARD; iea.org host held but this product absent from all tables.','monitor / recover as a live auth-gated feed via operator credentials.',
 'IEA new platform requires login; delivery via statsnews@iea.org newsletter. ANSWERED 2026-07-19: operator confirms an active IEA account exists, so the feed is operator-credentialed, not free-anonymous.',
 'Do you have an active IEA account / subscription to treat the login-gated Monthly Electricity Statistics as a live feed? [ANSWERED 2026-07-19: yes, active account confirmed.]',
 'LOST at product level despite host held. Auth-gated; operator account confirmed 2026-07-19 -- recovery is operator-credentialed, not cold.'),
-- ============ TRADE-PRESS, would_park (operator ruling) ============
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:transport-topics','Transport Topics (ATA trucking news)','us','https://www.ttnews.com','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Freight trade press; secondary market_news tier.',true,'freight_native',
 'esgtoday source-map B2; existence-check ABSENT tier T2.','add as market_news source.',NULL,NULL,'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:atwonline','Air Transport World (aviation industry trade)','global','https://www.atwonline.com','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Freight/aviation trade press; secondary.',true,'freight_native',
 'esgtoday source-map B2; existence-check ABSENT tier T3.','add as market_news source.',NULL,NULL,'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:container-news','Container News (container shipping)','global','https://www.container-news.com','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Freight trade press; secondary.',true,'freight_native',
 'esgtoday source-map B2; existence-check ABSENT tier T3.','add as market_news source.',NULL,NULL,'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:cargofacts','Cargo Facts (air freight market data)','global','https://www.cargofactsconsulting.com','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Air-freight trade data; secondary/paywalled.',true,'freight_native',
 'esgtoday source-map B2; existence-check ABSENT tier T3.','add as market_news source.',NULL,NULL,'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:oxfordenergy','Oxford Institute for Energy Studies (energy-economics research)','global','https://www.oxfordenergy.org','not_applicable',
 '{"primary_surface":"research"}'::jsonb,'would_park','Energy research institute; secondary reference.',true,'freight_native',
 'legacy seed-resources.json (EU-policy record g7 prose).','embedded reference; never promoted.',NULL,NULL,'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:responsible-investor','Responsible Investor (investor-side ESG news)','global','https://www.responsible-investor.com','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Finance/investor trade press; paywalled secondary.',true,'esg_finance',
 'esgtoday source-map B1; existence-check ABSENT tier T2.','add as market_news source.',NULL,NULL,'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:bloomberg-green','Bloomberg Green (climate & sustainability vertical)','global','https://www.bloomberg.com/green','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Paywalled general-finance press; secondary.',true,'esg_finance',
 'esgtoday source-map B1; existence-check ABSENT tier T2.','add as market_news source.',NULL,NULL,'LOST: absent from all tracked tables.'),
('sweep4_found_then_lost_recovery','lost_historical_provider','lost:ft-moralmoney','FT Moral Money (sustainable-finance newsletter/section)','global','https://www.ft.com/moral-money','not_applicable',
 '{"primary_surface":"market_intel"}'::jsonb,'would_park','Paywalled general-finance press; secondary.',true,'esg_finance',
 'esgtoday source-map B1; existence-check ABSENT tier T3.','add as market_news source.',NULL,NULL,'LOST: absent from all tracked tables.');
