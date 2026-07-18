-- 223_coverage_gap_class5_eu_epr_expansion.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Bank 5b: operator ruling on the
-- Bank 5 (migration 221) EU-scope flag. Ruling: the 2-state Germany/France sample does not stand,
-- but full 27-state coverage is not warranted either. FSI lens applied: expand to member states
-- with material freight volume for the operator's verticals/lanes (Netherlands, Belgium, Italy,
-- Spain, Poland, Austria, Sweden, Denmark), plus ONE collective EU-EPR-remainder row recording
-- that the remaining ~19 smaller-state registers exist as a universe without individually pricing
-- Malta-class registers. This completes CLASS 5 as its own bank before Class 6's PRODUCT-DECISION
-- section is treated as final (Class 6 rows were already applied via migration 222 before this
-- ruling arrived mid-turn; sequencing is documented in the session log, not renumbered here).
--
-- Retrieval-before-generation catch: naturvardsverket.se (Sweden's EPA) IS already a registered
-- platform source, but only at the ROOT landing-page granularity, not the specific EPR/producer-
-- responsibility-for-packaging page -- same host-vs-page distinction as Class 4. All 8 rows below
-- are genuine gaps at the correct granularity; none of the other 7 hosts were found registered
-- at any granularity.

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(70, 'Netherlands Verpact (formerly Afvalfonds Verpakkingen) national packaging EPR register, reporting to RVO', 'eu', 'road / air / ocean (Netherlands packaging-producer compliance, major EU logistics/transshipment hub)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed. Verpact is the sole government-recognized collective PRO for Dutch packaging EPR; consolidated reporting flows to RVO (Rijksdienst voor Ondernemend Nederland). Netherlands is a top-tier EU logistics hub (Rotterdam, Schiphol), high freight-volume relevance for the workspace''s lanes.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://business.gov.nl/regulations/packaging/',
 'Entity-confirmed: real, live. Currently transitioning under the Packaging Management Decree 2014 toward direct PPWR applicability from August 12, 2026 -- a near-term regime-change worth noting for the feed-build task.',
 'tracker', 'compliance_reporting_portal'),

(71, 'Belgium dual packaging EPR system: Fost Plus (household) and Valipac (industrial/commercial), overseen by the Interregional Packaging Commission', 'eu', 'road / air (Belgium packaging-producer compliance, dual-scheme structure)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed. Belgium uniquely splits EPR by packaging destination (household vs industrial/commercial) across two separate PROs under joint IRPC/IVCIE oversight; annual declaration deadline February 28. Distinct compliance-mapping complexity from the single-PRO pattern in most other rows in this class.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.ecopv-eu.com/en/packaging-belgium-epr-guideline/',
 'Entity-confirmed: real, dual-scheme structure confirmed (Fost Plus + Valipac). Authoritative_url anchors to a compliance-guide page since neither Fost Plus nor Valipac''s own sites nor the IRPC provided a single canonical English-language registry landing page in this pass -- flagged for the feed-build task to verify the most durable direct-authority URL.',
 'tracker', 'compliance_reporting_portal'),

(72, 'Italy CONAI (Consorzio Nazionale Imballaggi) and RENAP national packaging producer register', 'eu', 'road / ocean (Italy packaging-producer compliance, mandatory no-opt-out system)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed. CONAI membership is compulsory (no voluntary alternative) for every producer/importer placing packaged goods on the Italian market; registration in RENAP (National Producers Register) required within 60 days of first market placement, via the Chambers of Commerce portal. Foreign producers must designate an Italy-resident authorized representative.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.conai.org/',
 'Entity-confirmed: real, live, mandatory system under Legislative Decree 152/2006. The compulsory-membership, no-de-minimis, foreign-representative-required structure makes this one of the higher compliance-friction EU registers for a non-Italy-based workspace commissioning Italy-market packaging.',
 'tracker', 'compliance_reporting_portal'),

(73, 'Spain Registro de Productores de Producto (national packaging EPR register, Royal Decree 1055/2022) and Ecoembes', 'eu', 'road / ocean (Spain packaging-producer compliance)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed. The national Product Producers Register (operative since December 29, 2022) requires registration with MITERD, yielding an ENV/Year/XXXXXXXXX packaging-EPR ID; Ecoembes is the largest household-packaging PRO, annual declaration due February 28.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.ecoembes.com/en/registration-product-producers',
 'Entity-confirmed: real, live. Distinguishes the government REGISTER (MITERD-run, mandatory legal identity layer) from Ecoembes (the PRO that handles the actual collection/recycling scheme) -- same two-layer pattern as the already-inserted France row (rank 63).',
 'tracker', 'compliance_reporting_portal'),

(74, 'Poland BDO (Baza Danych o Produktach i Opakowaniach oraz o Gospodarce Odpadami) national products/packaging/waste database', 'eu', 'road (Poland packaging-producer compliance, no de minimis threshold)', 'road',
 'Free official compliance-reporting portal, entity-confirmed. BDO is Poland''s single unified electronic registry (entity register + reporting tool + proof-of-lawful-operation) covering packaging, batteries, and WEEE together, administered by the Ministry of Climate and Environment; NO de minimis threshold, obligation arises from the very first sale.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://bdo.mos.gov.pl/',
 'Entity-confirmed: real, live, national single-system architecture (broader scope than a packaging-only register -- covers multiple EPR streams in one database, worth noting for the feed-build task as a different integration shape than the single-stream registers elsewhere in this class).',
 'tracker', 'compliance_reporting_portal'),

(75, 'Austria ARA (Altstoff Recycling Austria) dominant packaging-compliance system, no de minimis threshold', 'eu', 'road / air (Austria packaging-producer compliance)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed. ARA is Austria''s dominant PRO (operating since 1993) across 94 collection regions; the Packaging Ordinance 2014 (enforced from January 1, 2023) applies from the first gram of packaging placed on the market, no de minimis exemption, matching Germany''s (rank 62) and Poland''s (rank 74) no-threshold posture.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.ara.at/en',
 'Entity-confirmed: real, live, dominant-system structure confirmed (unlike Belgium''s dual-PRO split or France''s multi-PRO structure).',
 'tracker', 'compliance_reporting_portal'),

(76, 'Sweden EPR packaging producer-responsibility reporting to Naturvardsverket (Swedish EPA), regulation 2022:1274', 'eu', 'road / ocean (Sweden packaging-producer compliance, Nordic pattern representative)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed. Producers report packaging placed on market, waste collected, and treatment outcomes directly to Naturvardsverket; 2 approved PROs (NPA and TMR/FTI); a >=1 tonne/year threshold triggers a supervisory fee.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.naturvardsverket.se/en/guidance/extended-producer-responsibility-epr/producer-responsibility-for-packaging/',
 'Entity-confirmed: real, live. Distinct from the already-registered naturvardsverket.se/ root landing page (a general agency site, not this EPR-specific guidance page) -- same host-vs-page granularity pattern as Class 4.',
 'tracker', 'compliance_reporting_portal'),

(77, 'Denmark Dansk Producentansvar (DPA) individual mandatory packaging-producer registration, no PRO alternative', 'eu', 'road / ocean (Denmark packaging-producer compliance, individual-registration-only structure)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed. Denmark is structurally distinct from every other row in this class: brands CANNOT rely on a collective PRO and must register individually via DPA; full mandatory registration for all brands operating in Denmark by 2025 (already binding as of this pass).',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://producentansvar.dk/en/about-us/',
 'Entity-confirmed: real, live. The no-PRO-alternative structure is a genuine compliance-complexity outlier worth flagging distinctly from the collective-PRO pattern common to the rest of this class (Germany/France/NL/IT/ES/AT/SE all route through at least one collective scheme).',
 'tracker', 'compliance_reporting_portal'),

(78, 'EU-EPR-remainder: the ~19 smaller EU member-state packaging EPR registers not individually priced in this pass', 'eu', 'road / air / ocean (remaining EU member states: e.g. Czechia, Portugal, Ireland, Greece, Hungary, Romania, Bulgaria, Slovakia, Croatia, Slovenia, Finland, Lithuania, Latvia, Estonia, Luxembourg, Cyprus, Malta, and others not individually rowed)', 'multi',
 'COLLECTIVE PLACEHOLDER, not individually entity-confirmed per-state in this pass. Per operator ruling on the Bank 5 EU-scope flag: the table should record the whole universe of EU packaging EPR registers without pricing 15+ individual Malta-class registers, while still making the remainder visible rather than silently dropped. Each smaller state does have its own national register (all EU member states are PPWR/prior packaging-directive bound), confirmed as a CLASS fact, not confirmed row-by-row.',
 'LOW', 'MISSING', NULL, 'minor', false, NULL,
 'NOT individually entity-confirmed (deliberately, per operator scope ruling) -- entity_confirmed=false distinguishes this placeholder row from every other entity-confirmed row in the table. A future EXPANSION-WAVE decision (explicit operator call, not assumed) would convert this single row into individually-confirmed per-state rows if/when the remaining states'' freight volume for the workspace''s lanes justifies the pricing effort.',
 'tracker', 'compliance_reporting_portal');
