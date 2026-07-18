-- 221_coverage_gap_class5_compliance_reporting_portals.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Category-driven discovery bank 5
-- of 9: CLASS 5 (national compliance-reporting portals), pattern instances SINIR (Brazil) and
-- RETC (Chile), both flagged as verified-not-registered host candidates back in migration 216's
-- session log (never actually written as coverage_gap_candidates rows). Expanded to EU per-state
-- EPR packaging registers (representative sample, scope-narrowed and flagged, not all 27 member
-- states), UK's scheme, and 2 Asia equivalents (Japan, South Korea).
--
-- Retrieval-before-generation catch: SINIR is ALREADY a registered platform source (2 URLs,
-- including sinir.gov.br/sistemas/logistica-reversa/, the actual data-portal pattern this class
-- asks for) -- NOT re-added as a coverage_gap row, the pattern instance is already HAVE. RETC
-- (retc.mma.gob.cl) was checked and is NOT registered -- genuine gap, inserted as rank 61.
--
-- SCOPE NOTE (flagged per the no-silent-narrowing rule): "EU per-state EPR registers" is
-- represented here by Germany (LUCID/ZSVR, the largest and most-cited EU packaging register) and
-- France (Registre National des Producteurs via ADEME/SYDEREP) rather than all 27 EU member-state
-- registers individually. A full 27-state EU EPR register sweep is a distinct, larger scoping
-- decision than this bank's time allows; flagged here for an explicit operator call on whether it
-- warrants its own future bank, rather than silently treating 2 states as "EU done".

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(61, 'Chile RETC (Registro de Emisiones y Transferencias de Contaminantes) national pollutant and GHG emissions-and-transfers compliance register', 'latam', 'road / ocean (Chile facility-level compliance and emissions-transfer reporting)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed (re-confirmed from the 2026-07-17 Gemini-delta pass, now inserted as its own row per the Class 5 pattern-instance expansion). RETC covers 40,000+ industrial establishments'' pollutant and GHG transfer reporting under Ministry of Environment operation, a direct national compliance-reporting-portal pattern match.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://retc.mma.gob.cl/',
 'Entity-confirmed: real, public, Ministry of Environment operated. Host NOT found registered as a platform source in this pass -- a clean net-new gap (distinct from SINIR/Brazil, which IS already registered and is not re-added here).',
 'tracker', 'compliance_reporting_portal'),

(62, 'Germany LUCID Packaging Register (ZSVR, Zentrale Stelle Verpackungsregister) national producer compliance register', 'eu', 'road / air / ocean (Germany packaging-producer compliance reporting, EU''s largest national EPR register)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed, public register. Mandatory since July 1 2022 for every producer/initial distributor placing packaged goods on the German market; non-registration triggers a distribution ban enforceable against downstream distributors too, making this the single most consequential national EPR register in the EU for a packaging-commissioning workspace.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.verpackungsregister.org/en/',
 'Entity-confirmed: real, live, public register (verpackungsregister.org/en/foundation-authority/public-registers). Free registration; the register itself is a compliance-verification tool, not a licensed data product.',
 'tracker', 'compliance_reporting_portal'),

(63, 'France Registre National des Producteurs (national EPR producer register, operated by ADEME via SYDEREP)', 'eu', 'road / air / ocean (France packaging and multi-stream EPR producer registration)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed. Every producer subject to a REP (responsabilite elargie du producteur) stream, including household packaging, must hold a per-stream Unique Identifier (IDU) issued via ADEME''s SYDEREP system since January 1 2022 -- a distinct legal-entity-registration layer beneath the approved producer-responsibility organizations (Citeo, Adelphe, Leko) that actually run the compliance schemes.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.citeo.com/en/my-membership/',
 'Entity-confirmed: real. ADEME (agence de la transition ecologique) is the oversight authority and SYDEREP the underlying registration system; the authoritative_url here anchors to Citeo (the dominant household-packaging PRO) as the practical entry point since ADEME/SYDEREP does not have a single simple public English-language landing page confirmed in this pass -- flagged for the feed-build task to verify the most durable direct-to-ADEME URL.',
 'tracker', 'compliance_reporting_portal'),

(64, 'UK Extended Producer Responsibility for packaging: public registers (producers, compliance schemes, reprocessors/exporters)', 'uk', 'road / air / ocean (UK packaging-producer and compliance-scheme public registers)', 'multi',
 'Free official compliance-reporting portal, entity-confirmed, LIVE. The producer register updates daily; the reprocessor/exporter register updates weekly (Thursdays) or on suspension/cancellation events. Large-producer 2025 registration closed April 2025; large-organisation 2026 registration closed October 2025; small-organisation 2026 registration deadline April 2026 -- an active, near-term compliance calendar.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.gov.uk/guidance/find-large-producers-on-the-report-packaging-data-service',
 'Entity-confirmed: real, live public registers, distinct from the already-registered business.gov.uk EU-PPWR explainer page (a different, non-UK-EPR resource). This is the UK''s own domestic EPR-for-packaging system, separate from and post-Brexit-successor to any EU packaging-waste framework.',
 'tracker', 'compliance_reporting_portal'),

(65, 'Japan JCPRA (Japan Containers and Packaging Recycling Association) compliance reporting system, Container and Packaging Recycling Act', 'asia', 'ocean (Japan packaging-producer recycling-commission compliance reporting)', 'ocean',
 'Free official compliance-reporting portal, entity-confirmed. Businesses using, manufacturing, or importing designated packaging (glass, PET, paper cartons, other plastic packaging since April 2000) meeting volume thresholds must report packaging-waste-reduction activity to the national government and typically outsource recycling-fee compliance through JCPRA; non-compliance can trigger government directives, fines, and public disclosure.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.jcpra.or.jp/',
 'Entity-confirmed: real, live, JCPRA is the designated compliance-reporting body under the Ministry of Environment-enforced Container and Packaging Recycling Act (1995, enforced since April 1997).',
 'tracker', 'compliance_reporting_portal'),

(66, 'South Korea KECO Resource Circulation Compliance System (EPR reporting and verification, Ministry of Environment)', 'asia', 'ocean (South Korea packaging and multi-stream EPR compliance reporting)', 'ocean',
 'Free official compliance-reporting portal, entity-confirmed. Producers obligated to recycle must submit annual collection/recycling plans to KECO (Korea Environment Corporation) every January; KECO records producer production/import data and monitors/verifies recycling performance under Ministry of Environment oversight.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://www.keco.or.kr/en/lay1/S295T386C400/contents.do',
 'Entity-confirmed: real, live, KECO''s official EPR program page under the Ministry of Environment''s Korea Resource Circulation Compliance System.',
 'tracker', 'compliance_reporting_portal');
