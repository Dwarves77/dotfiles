-- 215_coverage_gap_candidates_latam_meaf.sql
-- Session C (coverage discovery lane), 2026-07-17. Completion pass per operator ruling: the
-- LatAm/MEAF sweep flagged as not-yet-done in the first slice (migration 214). Same evidence
-- hierarchy, same rules (read-only; this INSERT is the only write; not a worklist).
--
-- Corpus title-search basis (LatAm/MEAF, before this pass): Brazil, Mexico, Colombia, UAE all
-- had existing rows; Chile, Argentina, South Africa, Saudi Arabia had ZERO. Brazil RenovaBio
-- (Law 13,576/2017, amended Law 15,082/2024 "Combustivel do Futuro") is a retrieval-before-
-- generation dedup catch against the corpus's existing "Brazil National Policy on Alternative
-- Fuels (PNCA)" item (verified) -- almost certainly the same instrument family, NOT inserted
-- as a new gap.

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes)
VALUES
(17, 'Mexico Emissions Trading System (Sistema de Comercio de Emisiones, SEMARNAT)', 'latam', 'road / general cargo (MX lanes)', 'road',
 'Mexico''s national ETS pilot (2020-21) and transition phase (2022) heading toward an operational compliance phase anticipated 2026, per SEMARNAT''s Aug 2025 COCOSCE committee meeting. The specific carbon-market instrument, distinct from SEMARNAT the regulator (which corpus HAS). Early read on the compliance-phase rules and allowance allocation is a lead-time edge on MX-lane cost modeling before the market opens.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.gob.mx/semarnat',
 'Corpus HAS Mexico SEMARNAT (general regulator, verified) but NOT the ETS instrument itself. Operational phase not yet launched as of this search (2026-07); acquisition confidence moderate pending the 2026 launch.'),

(18, 'South Africa Carbon Tax Act 15 of 2019 (Phase 2 from 2026) + Climate Change Act 22 of 2024', 'meaf', 'road / warehousing (ZA lanes)', 'road',
 'Live binding carbon tax since 1 Jun 2019, administered by SARS; Phase 1 ran through 31 Dec 2025, Phase 2 begins 2026 with the Climate Change Act 22 of 2024 amending its legal basis (new section 17A). Direct fuel-levy interaction on road transport. No South Africa presence in the corpus at all; a genuine jurisdiction-level gap for a market with an active carbon-tax regime.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.sars.gov.za/customs-and-excise/excise/environmental-levy-products/carbon-tax/',
 'Zero South Africa items found in corpus title search. Phase 2 transition (2026) is the live-relevance trigger; rate at R236/tCO2e for 2025.'),

(19, 'Chile Ley Marco de Cambio Climatico (Law 21.455 of 2022)', 'latam', 'road / ocean (CL lanes)', 'multi',
 'Framework climate law setting carbon-neutrality-by-2050 + sectoral emission-reduction instruments; the Ministry of Transportation and Telecommunications (MTT) is a named sectoral authority under the law. No Chile presence in the corpus. Chile is a significant LatAm mining-export and Pacific-corridor lane; the sectoral transport plan under this law will set binding freight-relevant targets.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.bcn.cl/leychile/navegar?idNorma=1177286',
 'Zero Chile items found in corpus title search. Framework law is enacted; the sector-specific MTT implementing regulations are still developing (lower near-term acquisition yield, but the framework itself is a real gap).'),

(20, 'Argentina Ley de Presupuestos Minimos de Adaptacion y Mitigacion al Cambio Climatico Global (Law 27.520 of 2019) + National Sustainable Transport Plan (2023)', 'latam', 'road / general cargo (AR lanes)', 'road',
 'Binding national climate-adaptation-and-mitigation framework naming transport as a covered sector; the 2023 National Sustainable Transport Plan targets a minimum 5.84 MT CO2e reduction vs business-as-usual, freight-relevant given cargo transport is ~13% of Argentina''s national GHG. No Argentina presence in the corpus at all.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.argentina.gob.ar/ambiente/cambio-climatico/ley-27520',
 'Zero Argentina items found in corpus title search. Two-part candidate: the 2019 framework law (enacted, binding) + the 2023 sustainable transport plan (target-based, freight-specific) -- treat as one jurisdiction gap, split into two instruments if acquired.'),

(21, 'Saudi Arabia National Transport and Logistics Strategy (2021) + Saudi Green Initiative (logistics/ports)', 'meaf', 'ocean (Red Sea ports) / road (GCC hub)', 'ocean',
 'Vision-2030-linked strategy positioning Saudi Arabia as a global logistics hub with green-port commitments (King Abdullah Port solar + water-efficiency, >20% footprint cut cited by Mawani); Saudi Green Initiative targets net-zero by 2060. Freight-relevant for GCC transhipment and Red Sea corridor planning. Corpus HAS UAE items (Hydrogen Strategy, Net Zero Roadmap) but ZERO Saudi Arabia presence -- a genuine GCC-coverage gap alongside the existing UAE cluster.',
 'LOW', 'MISSING', NULL, 'minor', true, 'https://mot.gov.sa/en/ntls',
 'Lower confidence than the enacted-law candidates: this is a national STRATEGY/vision document plus voluntary green-initiative commitments, not a single binding regulatory instrument -- flag for the operator as strategy-class, not law-class, similar caveat to the EU Green Claims/ELV pre-enactment entries.');
