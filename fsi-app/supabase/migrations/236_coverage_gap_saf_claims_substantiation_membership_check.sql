-- 236_coverage_gap_saf_claims_substantiation_membership_check.sql
-- Session C (coverage discovery lane), 2026-07-18. Final membership check before idling, per
-- operator addendum: SAF book-and-claim claims-substantiation coverage, the operator's own
-- compliance exposure as a SAF purchaser (confirmed this pass to be a book-and-claim beneficiary
-- position, per the UDB decline ruling in migration 234).
--
-- STATUS CORRECTION on rank 12 (EU Green Claims Directive): the Commission announced an intention
-- to withdraw the GCD legislative proposal in June 2025; formal status remains unclear per this
-- pass's search, but the proposal is stalled. The ACTUALLY-BINDING instrument is a different one:
-- Directive (EU) 2024/825 (Empowering Consumers for the Green Transition / EmpCo), adopted 28 Feb
-- 2024, in force 26 Mar 2024, member-state transposition due 27 Mar 2026, APPLIES from 27 Sept
-- 2026 -- a real, dated, near-term enforcement date bans generic green claims and offset-based
-- "climate neutral" claims EU-wide via post-market national-authority enforcement (not the GCD's
-- proposed pre-market verification model). Added as its own new row (rank 106) rather than
-- silently overwriting rank 12, since they are two distinct instruments with different mechanisms
-- and rank 12's own instrument identity should not be altered to describe a different directive.
--
-- 3 NEW GENUINE GAPS entity-confirmed for the SAF claims-substantiation question specifically:
-- WEF SAFc emissions accounting/reporting guidelines (the standardized book-and-claim accounting
-- methodology), IATA's own SAF Accounting Policy Paper (chain-of-custody based), and a REAL,
-- entity-confirmed enforcement-precedent finding: UK ASA vs Virgin Atlantic ("100% SAF" ruled
-- misleading), Amsterdam Court vs KLM (15 of 19 environmental statements ruled misleading), and
-- the EU Commission's collective 20-airline greenwashing-claims action -- all real, all directly
-- on-point for SAF/book-and-claim marketing claims specifically (not generic greenwashing).
--
-- CHECKED, NOT ADDED: no GHG Protocol document specifically dedicated to SAF/aviation book-and-
-- claim accounting was confirmed distinct from its general Scope 3 Corporate Value Chain guidance
-- (which treats additionality/eligibility case-by-case per GHGP principles, not via a SAF-specific
-- standard) -- an honest non-finding, not asserted as a gap.

UPDATE public.coverage_gap_candidates
SET notes = notes || ' STATUS UPDATE (2026-07-18, SAF claims-substantiation membership check): the European Commission announced an intention to withdraw this proposal in June 2025 (formal status remains unclear per this pass''s search); the proposal is effectively stalled. The instrument actually taking binding effect on the same subject matter is Directive (EU) 2024/825 (Empowering Consumers for the Green Transition), added as its own row (rank 106) rather than conflated with this one.'
WHERE rank = 12;

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class, access_model)
VALUES
(106, 'Directive (EU) 2024/825 -- Empowering Consumers for the Green Transition (EmpCo), applies from 27 Sept 2026', 'eu', 'air (SAF/environmental-claims greenwashing enforcement, all verticals'' marketing/client-conversation exposure)', 'multi',
 'FREE, entity-confirmed, real and binding (distinct from the stalled Green Claims Directive proposal at rank 12). Adopted 28 Feb 2024, in force 26 Mar 2024, applies EU-wide from 27 Sept 2026; bans generic/unsubstantiated green claims and offset-based "climate neutral" claims via post-market enforcement by national consumer-protection authorities -- directly applicable to any SAF/book-and-claim marketing language the workspace or its counterparties use in client conversations.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://eur-lex.europa.eu/eli/dir/2024/825/oj/eng',
 'Entity-confirmed: real, live, official EUR-Lex text. Near-term enforcement date (27 Sept 2026) makes this a genuine near-horizon compliance item, not a distant proposal like rank 12.',
 'instrument', NULL, 'free'),

(107, 'WEF Sustainable Aviation Fuel Certificate (SAFc) Emissions Accounting and Reporting Guidelines', 'global', 'air (SAF book-and-claim accounting standard, the workspace''s own exposure as a SAF-certificate purchaser)', 'air',
 'FREE, entity-confirmed, public. The standardized methodology referenced by SAFc marketplaces and corporate buyers for accounting/reporting SAF-certificate purchases without physical fuel uplift -- directly on point for a workspace confirmed (per the UDB decline ruling) to hold a book-and-claim beneficiary position. Distinct from and more specific than general GHG Protocol Scope 3 guidance, which treats this case-by-case rather than via a dedicated SAF standard.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.weforum.org/publications/sustainable-aviation-fuel-certificate-safc-emissions-accounting-and-reporting-guidelines/',
 'Entity-confirmed: real, live. weforum.org is already a registered platform source at other pages (First Movers Coalition, Global Aviation Sustainability Outlook); this specific SAFc guidelines page was not among them -- genuine gap at the correct granularity.',
 'instrument', 'vertical_operational_standard', 'free'),

(108, 'IATA SAF Accounting Policy Paper (chain-of-custody-based book-and-claim accounting, "Policy 1")', 'global', 'air (SAF book-and-claim chain-of-custody standard, industry primary-source complement to the WEF guidelines)', 'air',
 'FREE, entity-confirmed, public. IATA''s own policy position on SAF accounting based on robust chain-of-custody approaches -- the industry-primary-source complement to the WEF SAFc guidelines (rank 107), directly relevant to substantiating that a purchased SAF certificate traces to a real, non-double-counted physical uplift.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.iata.org/contentassets/d13875e9ed784f75bac90f000760e998/saf-accounting-policy-paper_20230905_final.pdf',
 'Entity-confirmed: real, live PDF. Distinct from the many already-registered IATA pages (DGR, SAF program, fact sheets, CargoIS) -- this specific accounting-policy document was not among them.',
 'instrument', 'vertical_operational_standard', 'free'),

(109, 'SAF book-and-claim greenwashing enforcement precedent (UK ASA v. Virgin Atlantic, Amsterdam Court v. KLM, EU Commission 20-airline collective action)', 'global', 'air (SAF/book-and-claim marketing-claim enforcement precedent, the workspace''s own client-conversation risk as a SAF-certificate purchaser)', 'air',
 'FREE, entity-confirmed, real and directly on-point (not generic greenwashing precedent). UK ASA ruled Virgin Atlantic''s unqualified "100% sustainable aviation fuel" claim misleading (breach of 5 Broadcast Advertising Code provisions); the Amsterdam District Court ruled 15 of 19 KLM environmental statements misleading, specifically criticizing an "overly rosy picture" of SAF''s effects; the European Commission sent letters to 20 airlines (incl. Air France, KLM, Lufthansa, Ryanair) on potentially misleading green claims, with airlines committing to eliminate or clarify "carbon neutral"/"sustainable" flight claims made via offsets or SAF purchase. This is the concrete enforcement pattern the workspace''s own SAF-certificate/book-and-claim marketing language should be checked against.',
 'HIGH', 'MISSING', NULL, 'major', true, 'https://www.stewartslaw.com/news/airline-adverts-banned-for-misleading-on-sustainability-in-asas-latest-regulatory-action-against-greenwashing/',
 'Entity-confirmed: real rulings/actions across 3 distinct authorities (UK ASA, Dutch courts, EU Commission), each independently confirmed via search in this pass. Authoritative_url anchors to a legal-industry summary of the ASA ruling since ASA''s own ruling-database entry URL was not directly captured in this pass -- flagged for the feed-build task to locate and substitute the primary ASA/Amsterdam-court source documents.',
 'instrument', NULL, 'free');
