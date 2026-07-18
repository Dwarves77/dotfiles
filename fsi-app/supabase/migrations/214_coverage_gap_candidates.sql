-- 214_coverage_gap_candidates.sql
-- Session C (coverage discovery lane), 2026-07-17. Read-only lane; this table is the ONE
-- permitted write. It is a PRICING INPUT for the operator's coverage-floor number (the 60->400
-- expansion), NOT a worklist. Rows mint zero corpus items, acquire nothing, ground nothing.
-- Candidates enter the corpus only through a future priced wave via the intake lane.
--
-- Cross-check evidence hierarchy (operator amendment 2026-07-17, label-is-not-proof):
--   HAVE                 live verified item, matching canonical_instrument_key -> confidently excluded (NOT stored here)
--   HAVE_QUARANTINED     live quarantined match -> excluded but stored + annotated as in-drain
--   AMBIGUOUS_ARCHIVED   match only among archived rows / the 199-item review lane -> pending-review-dependent
--   MISSING              no match anywhere -> the true gap
-- disposition_ledger tombstones = evidence the ITEM was a husk, NOT that the INSTRUMENT is covered.

CREATE TABLE IF NOT EXISTS public.coverage_gap_candidates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank                  integer,                       -- ranked, most-significant-gap first
  instrument            text NOT NULL,                 -- named instrument / identifier
  jurisdiction          text NOT NULL,                 -- eu/us/uk/asia/latam/meaf/global + specific (ch, de, sg, in, cn)
  primary_vertical      text,                          -- freight vertical the gap most serves
  transport_mode        text,                          -- air/road/ocean/multi (operator priority: air>road>ocean)
  freight_relevance     text NOT NULL,                 -- FSI lens: what the operator knows before competitors + lead time bought
  estimated_priority    text NOT NULL CHECK (estimated_priority IN ('CRITICAL','HIGH','MODERATE','LOW')),
  coverage_class        text NOT NULL CHECK (coverage_class IN ('MISSING','AMBIGUOUS_ARCHIVED','HAVE_QUARANTINED')),
  corpus_match_ref      text,                          -- item id / canonical key when a match exists (archived or in-drain)
  sizing_class          text NOT NULL CHECK (sizing_class IN ('major','minor')),
  entity_confirmed      boolean NOT NULL DEFAULT false,-- entity identity confirmed via web search this session
  authoritative_url     text,                          -- primary URL for a FUTURE acquisition wave
  notes                 text,
  created_by            text NOT NULL DEFAULT 'session-c-coverage-discovery-2026-07-17',
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.coverage_gap_candidates IS
  'Coverage-floor pricing input (Session C, 2026-07-17). Ranked genuine-absence candidates for the 60->400 expansion. NOT a worklist; not corpus items. Cross-checked against the live corpus via the HAVE/HAVE_QUARANTINED/AMBIGUOUS_ARCHIVED/MISSING evidence hierarchy.';

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes)
VALUES
-- ============ MISSING, majors (ranked) ============
(1, 'ICAO CORSIA (Carbon Offsetting and Reduction Scheme for International Aviation)', 'global', 'live events / fine art / luxury (air-borne high-value)', 'air',
 'The single largest air-primary gap. CORSIA turns MANDATORY for all ICAO states from 2027 (offset above 85% of 2019 CO2). Knowing the offset-cost pass-through window before competitors lets the operator price air-freight surcharges into quotes 12-18 months early.',
 'CRITICAL', 'MISSING', NULL, 'major', true, 'https://www.icao.int/environmental-protection/CORSIA/Pages/default.aspx',
 'Adopted 2016; phase-in pilot 2021-23, first 2024-26, mandatory 2027-35. Authoritative primary = ICAO Annex 16 Vol IV. Air is the operator PRIMARY mode; corpus has EU/UK aviation ETS + ReFuelEU but NOT the global scheme.'),

(2, 'UK CBAM (Carbon Border Adjustment Mechanism, from 1 Jan 2027)', 'uk', 'all import cargo (aluminium/cement/steel/fertiliser/hydrogen precursors)', 'multi',
 'Import carbon cost on covered goods entering the UK from 2027; mirrors EU CBAM (which the corpus HAS, verified). A UK-lane forwarder needs the embodied-emissions declaration burden and rate mechanics before shippers do.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.gov.uk/government/collections/carbon-border-adjustment-mechanism',
 'Legislated in Finance Bill 2025-26; registration opens 1 Jan 2028; indirect emissions from 2029. Distinct instrument from EU CBAM (corpus item 51b2c91e, verified).'),

(3, 'EU Corporate Sustainability Due Diligence Directive (CSDDD), Directive (EU) 2024/1760', 'eu', 'all verticals (value-chain due diligence)', 'multi',
 'Value-chain human-rights + environmental due diligence on large companies; a freight forwarder is squarely in clients'' value chains and will field supplier-data requests. Lead time on transposition + the Article-22 climate-transition-plan duty is a client-conversation edge.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://eur-lex.europa.eu/eli/dir/2024/1760/oj/eng',
 'In force 25 Jul 2024; national transposition by 26 Jul 2028, apply from 2029. Distinct from CSRD (corpus HAS CSRD). Partially overlaps German LkSG (candidate 4).'),

(4, 'German Supply Chain Due Diligence Act (LkSG / Lieferkettensorgfaltspflichtengesetz)', 'de', 'all verticals (DE-nexus supply chains)', 'multi',
 'Live NOW (>=1,000 employees from 2024); BAFA-enforced, fines up to 2% of worldwide turnover. A DE-lane forwarder or a client with a DE nexus needs the annual BAFA reporting burden mapped ahead of enforcement.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.bafa.de/EN/Supply_Chain_Act/supply_chain_act_node.html',
 'bafa.de = confirmed ABSENT host (gate-b census). Enforced since 2023 (3,000+ emp) / 2024 (1,000+ emp). Partially subsumed by CSDDD transposition but binds independently until then.'),

(5, 'IMO EEXI + CII (Energy Efficiency Existing Ship Index / Carbon Intensity Indicator), MEPC.328(76), MARPOL Annex VI Ch.4', 'global', 'ocean high-value / project cargo', 'ocean',
 'Mandatory since 1 Jan 2023 on ships >=5,000 GT; the annual A-E rating drives vessel selection and charter cost. A D/E-rated vessel is a pass-through cost and a reputational flag the operator can screen for before booking.',
 'HIGH', 'AMBIGUOUS_ARCHIVED', 'CII item c5cae7db (archived duplicate_instrument); EEXI has NO row', 'major', true, 'https://www.imo.org/en/mediacentre/hottopics/pages/eexi-cii-faq.aspx',
 'CII exists ONLY as an archived duplicate_instrument row -> AMBIGUOUS, resolves at the review lane. EEXI = MISSING. MARPOL Annex VI parent IS live-verified (a8cdaa93) but the rating instruments lack their own live item. Ranked among majors; class is AMBIGUOUS per the evidence hierarchy.'),

(6, 'California Low Carbon Fuel Standard (LCFS)', 'us', 'road drayage / warehousing (CA lanes)', 'road',
 'Carbon-intensity standard on transport fuels (30% CI cut by 2030 after the 2025 amendments); sets the diesel-substitute + credit economics on all CA drayage. Knowing the credit-price trajectory lets the operator time fleet/fuel decisions on CA lanes.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://ww2.arb.ca.gov/our-work/programs/low-carbon-fuel-standard/about',
 'Amended reg effective 1 Jul 2025. Corpus HAS CARB ACT/ACF (fleet ZEV mandates) but NOT the fuel standard. Complements ACT/ACF; distinct instrument.'),

(7, 'EU Ecodesign for Sustainable Products Regulation (ESPR), Regulation (EU) 2024/1781', 'eu', 'luxury goods / packaging / general cargo', 'multi',
 'Framework for product circularity + Digital Product Passport + unsold-goods destruction ban (apparel/footwear from Jul 2026). Freight-relevant via DPP data-carrying obligations and packaging design that flows through the forwarder.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://eur-lex.europa.eu/eli/reg/2024/1781/oj/eng',
 'In force 18 Jul 2024; delegated acts roll 2026-2030. Distinct from PPWR (corpus HAS PPWR 2025/40). Pairs with EU F-gas + ELV as the circular-economy cluster.'),

(8, 'EU F-gas Regulation (EU) 2024/573 (fluorinated greenhouse gases)', 'eu', 'fine art / pharma / perishables (refrigerated transport)', 'multi',
 'HFC phase-down to 2050 + leak-check/recovery duties on refrigerated transport units (reefers leak heavily from vibration). Directly hits the temperature-controlled fine-art and perishables verticals; refrigerant-swap cost + compliance is a client-conversation lead.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://eur-lex.europa.eu/eli/reg/2024/573/oj/eng',
 'Applies from 11 Mar 2024; replaces the 2014 F-gas law. Strong vertical fit (temp-controlled art logistics = operator core). Sustainability-in-scope (GHG).'),

(9, 'Switzerland revised CO2 Act (SR 641.71) + CO2 Ordinance, in force 1 Jan 2025', 'meaf', 'air (CH-origin) / cross-alpine road', 'air',
 'Adds a SAF blend mandate (mirrors ReFuelEU) + aligns the Swiss ETS with the revised EU ETS incl. aviation. CH is a high-value air-freight and luxury-goods node; SAF surcharge + ETS scope on CH-EEA/UK flights is a pass-through the operator prices early.',
 'MODERATE', 'MISSING', NULL, 'major', true, 'https://www.fedlex.admin.ch/eli/cc/2022/824/en',
 'jurisdiction=meaf used as the catch-bucket for non-EU-EEA Europe (CH) pending a dedicated code. fedlex.admin.ch = confirmed ABSENT host (gate-b census). Switzerland adopted ReFuelEU. Maritime N/A (landlocked); aviation + cross-alpine road are the freight hooks.'),

-- ============ MISSING, moderates ============
(10, 'Singapore Carbon Pricing Act / carbon tax (S$25 2024-25 -> S$45 2026 -> S$50-80 by 2030)', 'asia', 'ocean bunkering / warehousing (SG hub)', 'ocean',
 'Singapore is a top global bunkering + transhipment hub; the rising carbon tax feeds bunker + warehouse-energy cost. Knowing the S$45 (2026) step and the 2030 trajectory lets the operator model SE-Asia lane costs ahead of the market.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.nccs.gov.sg/singapores-climate-action/mitigation-efforts/carbontax/',
 'Corpus HAS MPA Green Shipping + Singapore Maritime Decarb + SG Green Finance, but NOT the Carbon Pricing Act instrument itself.'),

(11, 'India Carbon Credit Trading Scheme (CCTS 2023) + fuel-efficiency (CAFE) norms', 'asia', 'road / general cargo (IN lanes)', 'road',
 'India''s compliance carbon market (Energy Conservation Act 2022) with binding GHG-intensity targets for 2025-26/2026-27 and notified HDV/LCV fuel-efficiency norms. A fast-growing lane; early read on the ICM price + transport norms is a planning-horizon edge.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://beeindia.gov.in/en/programmes/carbon-market',
 'Distinct from the corpus''s India Green Credit Programme (d91f76f0, verified) and India National Logistics Policy (beae0a7e). CCTS = the carbon market itself.'),

(12, 'EU Green Claims Directive (proposal, greenwashing / environmental claims substantiation)', 'eu', 'all verticals (client-facing sustainability claims)', 'multi',
 'Governs how the operator and its clients may SUBSTANTIATE green claims (e.g. "carbon-neutral shipping"). Directly shapes the client-conversation lens and the marketing-claim risk the platform advises on.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://environment.ec.europa.eu/topics/circular-economy/green-claims_en',
 'Pre-enactment (proposal COM(2023)166; negotiations ongoing/scaled back 2025). Flag: not yet an enacted instrument -> lower acquisition confidence until adopted.'),

(13, 'EU End-of-Life Vehicles Regulation (ELV, circularity for automotive; provisional agreement Dec 2025)', 'eu', 'high-value automotive (classic cars / EV)', 'road',
 'Circularity + recycled-content + design duties merging the ELV (2000/53) and 3R type-approval directives. Hits the classic-car / supercar / EV-battery vertical; recycled-content documentation flows through the mover.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://environment.ec.europa.eu/topics/waste-and-recycling/end-life-vehicles_en',
 'Provisional agreement 12 Dec 2025, Coreper 25 Feb 2026; NOT yet in the OJ. Flag: pre-enactment. Automotive-vertical fit.'),

-- ============ HAVE_QUARANTINED (excluded from MISSING; in-drain, annotated) ============
(14, 'IMO Net-Zero Framework / Green Fuel Intensity (GFI) standard + GHG pricing (MEPC 83, Apr 2025; adopted Oct 2025)', 'global', 'ocean (all >=5,000 GT)', 'ocean',
 'World-first mandatory GHG fuel-intensity standard + emissions pricing on international shipping from 2027. HIGH freight relevance but already IN the corpus (quarantined, active drain lane) -> not a NEW gap.',
 'HIGH', 'HAVE_QUARANTINED', 'item e241fe75 (quarantined) + o13 press-briefing capture (reassigned)', 'major', true, 'https://www.imo.org/en/mediacentre/pressbriefings/pages/imo-approves-netzero-regulations.aspx',
 'Retrieval-before-generation catch: exclude from MISSING; verify at drain. o13 capture was a press briefing (reassigned to Lane A per session-log 2026-07-17), so the ENACTED instrument acquisition is still owed inside the drain.'),

(15, 'China national ETS extension to transport / heavy industry (MEE work plan, Mar 2025)', 'asia', 'road / general cargo (CN lanes)', 'road',
 'China''s national carbon market; the transport-extension angle is already in the corpus (quarantined, deferred). The 2025 steel/cement/aluminium expansion is freight-secondary (embodied emissions -> CBAM cargo).',
 'LOW', 'HAVE_QUARANTINED', 'item 3e756291 (quarantined, disposition_deferred)', 'minor', true, 'https://www.mee.gov.cn/',
 'Transport-extension item is in-drain -> not a new gap. Industrial-sector expansion is a distinct development but freight-secondary; note for a future wave, do not double-count.'),

-- ============ SCOPE-FLAGGED (relevance-unconfirmed for the sustainability vertical) ============
(16, 'EU Regulation (EU) 2019/880 on the import of cultural goods (ICG system, applicable 28 Jun 2025)', 'eu', 'fine art / antiquities', 'air',
 'Import-licence + importer-statement regime on non-EU cultural goods via the ICG electronic system; squarely hits fine-art logistics (customs documentation, licence lead time). BUT this is cultural-heritage / illicit-trade, NOT emissions/sustainability.',
 'LOW', 'MISSING', NULL, 'minor', false, 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32019R0880',
 'SCOPE DECISION for the operator: art-vertical-relevant but outside the freight-SUSTAINABILITY scope as currently framed. entity_confirmed=false = relevance-to-scope unconfirmed (instrument identity IS confirmed). Include only if the operator widens scope to art-logistics compliance generally.');
