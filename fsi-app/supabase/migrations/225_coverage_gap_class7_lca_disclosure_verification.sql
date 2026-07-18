-- 225_coverage_gap_class7_lca_disclosure_verification.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Category-driven discovery bank 7
-- of 9: CLASS 7 (lifecycle and disclosure verification), pattern instances ecoinvent (rank 27)
-- and CDP corporate data (rank 28). Expanded to the rest of the LCA-database and disclosure-
-- repository landscape relevant to packaging and carrier emissions, access-classed per the
-- operator's original Gemini-delta framing (LICENSED vs FREE, spend-flagged where paid).
--
-- Retrieval-before-generation catch, two hits: (1) cdp.net/en/supply-chain -- the CDP Supply
-- Chain program page, the exact candidate this bank was about to propose for carrier/logistics
-- Scope 3 disclosure -- is ALREADY a registered platform source, NOT re-added; (2)
-- sciencebasedtargets.org root landing page is ALREADY registered, but the specific Target
-- Dashboard sub-page (the actual downloadable disclosure-database artifact) is NOT -- a genuine
-- gap at the correct granularity, same host-vs-page pattern as classes 4 and 5.

INSERT INTO public.coverage_gap_candidates
  (rank, instrument, jurisdiction, primary_vertical, transport_mode, freight_relevance, estimated_priority, coverage_class, corpus_match_ref, sizing_class, entity_confirmed, authoritative_url, notes, data_class, discovery_class)
VALUES
(79, 'Sphera LCA Data / GaBi (life-cycle-assessment database and packaging-specific calculator)', 'global', 'luxury goods / packaging (LCA benchmark, direct ecoinvent competitor with a packaging-specific calculator tool)', 'multi',
 'LICENSED, entity-confirmed as real and paid, same access-model posture as rank 27 (ecoinvent). Sphera (formerly GaBi) maintains 20,000+ DEKRA-verified, bi-annually updated LCI datasets across 60+ industries, plus a dedicated GaBi Packaging Calculator (web-based tool for LCA modeling and alternative-design simulation) -- a more packaging-workflow-specific product than ecoinvent''s general database.',
 'LOW', 'MISSING', NULL, 'minor', true, 'https://sphera.com/life-cycle-assessment-data',
 'Entity-confirmed: real product line, subscription-gated, no public free tier found (same posture as rank 27). FLAGGED for operator spend-and-license decision before any acquisition step, same as ecoinvent; listed as an alternative/competitor rather than assumed redundant, since the packaging-calculator tooling is a distinct capability ecoinvent as sourced here does not describe.',
 'data_feed', 'lca_disclosure_verification'),

(80, 'EPD International EPD Library (Environmental Product Declarations, ISO 14025/14040/14044-based, construction and packaging-relevant product categories)', 'global', 'luxury goods / packaging (third-party-verified product-level environmental disclosures)', 'multi',
 'FREE, entity-confirmed, public. All EPDs registered in the International EPD System are publicly downloadable via the EPD Library, organized by product category, region, and verification status; construction-materials EPDs (EN 15804-governed) are the largest represented category, with growing packaging-material coverage. A meaningfully different data shape from ecoinvent/Sphera: individual THIRD-PARTY-VERIFIED product declarations rather than a modeled LCI database.',
 'MODERATE', 'MISSING', NULL, 'major', true, 'https://www.environdec.com/library',
 'Entity-confirmed: real, live, free public library. The strongest free-access row in this class -- worth prioritizing over the two licensed LCA databases (ranks 27, 79) if the near-term need is citable third-party-verified disclosures rather than raw modeled LCI data.',
 'data_feed', 'lca_disclosure_verification'),

(81, 'Science Based Targets initiative (SBTi) Target Dashboard (corporate GHG-reduction-target disclosure database, downloadable)', 'global', 'all verticals (client-conversation corporate climate-target disclosure data)', 'multi',
 'FREE, entity-confirmed, public. 11,000+ companies'' validated science-based emissions-reduction targets, downloadable in by-target or by-company .xls format. Distinct from rank 28 (CDP corporate response data, paid/license-gated for corporate-level detail): SBTi''s target-level disclosure is free and structured for direct download, a materially different access posture for a related client-conversation use case (which corporations/counterparties have validated net-zero commitments).',
 'MODERATE', 'MISSING', NULL, 'major', true, 'https://sciencebasedtargets.org/target-dashboard',
 'Entity-confirmed: real, live, free downloadable dashboard. Distinct from the already-registered sciencebasedtargets.org/ root landing page (general org site, not this specific downloadable-database page) -- same host-vs-page granularity pattern as classes 4 and 5. cdp.net/en/supply-chain (the carrier/logistics Scope 3 disclosure angle originally considered for this bank) was checked and found ALREADY registered, not re-added.',
 'data_feed', 'lca_disclosure_verification');
