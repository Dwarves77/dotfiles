-- 222_coverage_gap_class6_enforcement_verification_systems.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Category-driven discovery bank 6
-- of 9: CLASS 6 (enforcement and compliance-verification systems), pattern instance CARB TRUCRS.
-- This class was PREVIOUSLY DECLINED in the migration 216 Gemini-delta pass (TRUCRS and CTC-VIS
-- were entity-confirmed but treated as fleet-operator compliance-verification/reporting portals
-- for a fleet's OWN vehicles -- an enforcement-query product-feature question, not third-party
-- corpus or feed data). The operator has now REVERSED that framing and wants every instance of
-- this class listed as a distinct PRODUCT-DECISION section: not "should this be a coverage_gap
-- row" but "what would each instance ENABLE if the platform built against it". Rows below carry
-- that product framing explicitly in notes, distinct from the content-gap framing of classes 1-5.
--
-- Retrieval-before-generation catch: THETIS-MRV (mrv.emsa.europa.eu) is ALREADY a registered
-- platform source -- NOT re-added as a gap row. The 3 rows below (TRUCRS, IMO GISIS Ship Fuel Oil
-- Consumption Database, EU Union Registry/EUTL for aviation) were confirmed genuinely unregistered
-- and were selected to span all 3 transport modes: road (TRUCRS), ocean (IMO GISIS), air (EU
-- Union Registry aviation ETS) -- deliberate mode coverage given the operator's air-primary /
-- road-secondary / ocean-tertiary profile.

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(67, 'CARB TRUCRS (Truck Regulation Upload, Compliance and Reporting System) — fleet-level per-vehicle emissions-compliance verification system', 'us-ca', 'road (per-fleet, per-vehicle CA truck/bus compliance status)', 'road',
 'PRODUCT-DECISION, entity-confirmed real and live (re-raised per operator instruction, reversing the migration 216 decline). TRUCRS is where CA fleets self-report vehicle/company data and compliance options for the Truck and Bus Regulation and Advanced Clean Fleets; CARB separately exposes a public Truck and Bus Regulation compliance-status LOOKUP tool (ww2.arb.ca.gov/applications/truck-and-bus-regulation-check-compliance-status) that checks status by vehicle/company without requiring TRUCRS credentials.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://ww2.arb.ca.gov/our-work/programs/truck-bus-regulation/trucrs-reporting-information',
 'PRODUCT-DECISION FRAMING: TRUCRS itself is a fleet''s own reporting channel (not integrable as a third-party data source), but the PUBLIC lookup tool built on top of it would enable a workspace-facing feature -- checking a carrier or subcontractor''s CA compliance status before booking a lane, a genuine competitive/operational value-add distinct from a content-brief gap. This is a build-a-feature decision, not a source-registration or grounding decision; routed here for operator scoping rather than resolved unilaterally. Entity-confirmed: both TRUCRS and the public lookup tool are real and live.',
 'tracker', 'enforcement_verification_system'),

(68, 'IMO GISIS Ship Fuel Oil Consumption Database — global vessel-level DCS verification and reporting registry', 'global', 'ocean (per-vessel global fuel-consumption and CII/carbon-intensity verification)', 'ocean',
 'PRODUCT-DECISION, entity-confirmed real and live. Flag states upload verified per-ship IMO DCS data (fuel oil consumption, distance, hours underway, and since 2023 the operational Carbon Intensity Indicator) to GISIS by June 30 each year; the IMO Secretariat publishes an ANONYMISED annual aggregate report to MEPC, individual-ship identification is deliberately not possible from the public output.',
 'LOW', 'MISSING', NULL, 'minor', true, 'https://gisis.imo.org/Public/',
 'PRODUCT-DECISION FRAMING: because the public-facing output is anonymised at the individual-ship level by design, this system CANNOT enable a per-carrier lookup feature the way TRUCRS''s public tool can -- its value to the platform is limited to the anonymised aggregate trend reporting (already partially represented via the existing IMO corpus items), not a new operator-verification capability. Listed for class completeness and to make that limitation explicit rather than silently assumed. Entity-confirmed: real, live, public aggregate reports confirmed accessible; individual-record data confirmed NOT public.',
 'tracker', 'enforcement_verification_system'),

(69, 'EU Union Registry / EUTL (European Union Transaction Log) — aircraft-operator EU-ETS aviation compliance registry', 'eu', 'air (per-aircraft-operator EU-ETS allowance compliance, EU-ETS-covered flights)', 'air',
 'PRODUCT-DECISION, entity-confirmed real and live. The Union Registry records ~1,500 aircraft operators'' allowance holdings and obligations (verified-emissions entry by March 31, allowance surrender by September 30 annually); the companion EU ETS data viewer (EEA-hosted) publishes aggregated verified-emissions/allowance/surrender data by country, activity type, and year across all EU ETS participants including aviation.',
 'MODERATE', 'MISSING', NULL, 'minor', true, 'https://climate.ec.europa.eu/eu-action/carbon-markets/eu-emissions-trading-system-eu-ets/union-registry_en',
 'PRODUCT-DECISION FRAMING: unlike GISIS, the EU ETS data viewer DOES publish operator-level aggregated data (by aircraft operator is not fully individuated in the public viewer as confirmed in this pass, but country/activity-type breakdowns are) -- the highest-leverage AIR-MODE instance in this class given the workspace''s air-primary transport profile. Worth flagging for the same lookup-feature product question raised on TRUCRS (rank 67): could a workspace-facing "is this carrier/operator EU-ETS compliant" check be built from this registry, and is operator-level granularity actually available or only aggregate. Routed for operator scoping, not resolved here. Entity-confirmed: real, live, both the Union Registry and the EU ETS data viewer confirmed accessible.',
 'tracker', 'enforcement_verification_system');
