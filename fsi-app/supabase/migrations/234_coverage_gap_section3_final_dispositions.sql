-- 234_coverage_gap_section3_final_dispositions.sql
-- Session C (coverage discovery lane), 2026-07-18. Final pricing rulings: dispositions every
-- Section 3 (operator spend/license) row through the migration-228 gate (disposition + surface_test),
-- the gate's first bulk live use beyond the initial 4-row exercise in migration 229.
--
-- OCEAN FUEL bucket (Platts/26, Argus/46, MABUX/49): DECLINED. Free stack suffices (Ship & Bunker
-- held Section 2 rank 47, Bunker Index held Section 2 rank 48, EEX/ICE delayed carbon quotes),
-- loss-tolerable per the free-alternative analysis delivered the prior turn.
--
-- LCA/DISCLOSURE bucket (ecoinvent/27, Sphera/79, CDP corporate/28, Transportation Research Part D/93):
-- DECLINED. Free stack suffices (DEFRA/GLEC/EPA emission factors for freight-leg calculations, EPD
-- libraries for product declarations, SSRN/arXiv preprints already held for research).
--
-- AIR bucket: Xeneta/83, CargoIS/87, Fastmarkets/89, General Index/90 DECLINED per their
-- loss-material-but-free-stack-adequate-for-brief-grade-need verdicts (operator's ruling, not the
-- prior LOSS-MATERIAL verdict alone -- the operator weighed brief-grade sufficiency against
-- transaction-grade precision and ruled against acquiring transaction-grade air-rate data at this
-- time). TAC Index/84: PARKED with a WATCH condition -- the sole loss-material row kept open,
-- revisit trigger recorded in surface_test as an additional (non-schema-required) key.
--
-- UDB/102: DECLINED per the operator's addendum ruling (superseding an interim "parked pending
-- eligibility check" instruction issued in the same message before the addendum arrived) --
-- operator confirmed the workspace's SAF purchases are a book-and-claim beneficiary position, not
-- an upstream economic-operator role, so UDB registration eligibility does not apply. The interim
-- "parked" instruction was never applied to the database; only the final declined disposition
-- lands here, avoiding a spurious intermediate state.

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text; a commercial price-reporting product."},
  "operations": {"verdict": "OUT", "reason": "Free stack (Ship & Bunker, Bunker Index) already covers bunker-price awareness at daily/free granularity."},
  "market_intel": {"verdict": "OUT", "reason": "Declined: free stack (Ship & Bunker, Bunker Index, EEX/ICE delayed carbon quotes) judged sufficient for brief-grade need; audit-grade referenceable assessment not required at this time."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 26;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text; a commercial price-reporting product."},
  "operations": {"verdict": "OUT", "reason": "Free stack already covers bunker-price awareness; Argus forward-curve product has no free equivalent but is not required at this time."},
  "market_intel": {"verdict": "OUT", "reason": "Declined: same free-stack sufficiency finding as rank 26 (Platts); the forward-curve gap noted in the free-alternative analysis was not judged to outweigh declining both ocean-fuel commercial assessments now."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 46;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text."},
  "operations": {"verdict": "OUT", "reason": "Two higher-confidence free rows (Ship & Bunker, Bunker Index) already held cover the same ground; MABUX explicitly disclaims its own prices as indications only."},
  "market_intel": {"verdict": "OUT", "reason": "Declined: the clearest strike-candidate in the whole Section 3 list per the free-alternative analysis -- free stack fully substitutes."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 49;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text; a modeled LCI database product."},
  "operations": {"verdict": "OUT", "reason": "Declined: GLEC/DEFRA/EPA free emission-factor sets judged sufficient for freight-leg emissions calculation, the platform''s primary Operations use case for LCA data; ecoinvent''s deeper packaging-material LCI breadth not required at this time."},
  "market_intel": {"verdict": "OUT", "reason": "Not a market signal."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 27;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text."},
  "operations": {"verdict": "OUT", "reason": "Declined: same free-stack sufficiency finding as rank 27 (ecoinvent); redundant with it in any case (near-identical value case)."},
  "market_intel": {"verdict": "OUT", "reason": "Not a market signal."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 79;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text; a corporate ESG disclosure aggregator."},
  "operations": {"verdict": "OUT", "reason": "Not a jurisdictional cost/feasibility surface."},
  "market_intel": {"verdict": "OUT", "reason": "Not a market-movement signal."},
  "research": {"verdict": "OUT", "reason": "Declined: free subnational CDP tier (already open), self-published counterparty CDP responses/sustainability reports, and progressively-landing CSRD mandatory filings judged to substitute for the paid corporate tier at brief-grade need."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 28;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text."},
  "operations": {"verdict": "OUT", "reason": "Not a jurisdictional cost/feasibility surface."},
  "market_intel": {"verdict": "OUT", "reason": "Not a market signal."},
  "research": {"verdict": "OUT", "reason": "Declined: SSRN TransportRN (rank 91) and arXiv physics.soc-ph (rank 92), both already held, substantially cover the same underlying research pre-publication; the weakest spend case in the whole Section 3 list."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 93;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text; a commercial rate-benchmarking platform."},
  "operations": {"verdict": "OUT", "reason": "Not the primary use case; Xeneta''s value is Market Intel-side rate benchmarking."},
  "market_intel": {"verdict": "OUT", "reason": "Declined: no free source reaches transaction-level lane-specific rates, a real loss, but not acquired at this time -- brief-grade need judged servable by the held composite indices (Freightos FBX, Drewry) plus IATA macro commentary."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 83;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text."},
  "operations": {"verdict": "OUT", "reason": "Not the primary use case."},
  "market_intel": {"verdict": "OUT", "reason": "Declined: no free source reaches CargoIS''s 140,000-airport-pair granularity, a real loss, but IATA''s own free monthly Air Cargo Market Analysis plus airport-authority traffic statistics judged sufficient for brief-grade macro air-cargo demand awareness at this time."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 87;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text."},
  "operations": {"verdict": "OUT", "reason": "Not the primary use case."},
  "market_intel": {"verdict": "OUT", "reason": "Declined: EASA''s free ReFuelEU Annual Technical Report (already held), ICAO CORSIA eligible-fuels list, and IATA/CADO SAF Registry judged sufficient for uptake/eligibility-grade need; live spot pricing not required at this time."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 89;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text."},
  "operations": {"verdict": "OUT", "reason": "Not the primary use case."},
  "market_intel": {"verdict": "OUT", "reason": "Declined: identical free-stack profile to rank 89 (Fastmarkets); acquiring both would in any case have been redundant."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 90;

UPDATE public.coverage_gap_candidates SET disposition = 'parked', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not regulatory text; a commercial air-cargo pricing benchmark."},
  "operations": {"verdict": "OUT", "reason": "Not the primary use case."},
  "market_intel": {"verdict": "CONDITIONAL", "reason": "The sole loss-material row in the whole bucket: no free source reaches timestamped, lane-specific air-cargo pricing. Parked with a watch condition rather than declined, since this is the one row where the free-stack gap is judged to bite hardest against the workspace''s air-primary mode."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."},
  "watch_condition": {"trigger": "Revisit if lane-level or daily air-rate questions exceed what the free IATA Air Cargo Market Analysis monthly snapshots can answer.", "recorded": "2026-07-18"}
}'::jsonb WHERE rank = 84;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "IN", "reason": "The traceability mandate itself is binding RED II/III content."},
  "operations": {"verdict": "OUT", "reason": "Declined-not-eligible: operator confirmed the workspace''s SAF purchases are a book-and-claim BENEFICIARY position (buying certificates/credits), not an upstream economic-operator role (producer/trader/blender) in the biofuels supply chain -- upstream registrations already cover traceability on the workspace''s behalf, so UDB registration does not apply to this workspace. Superseded an interim parked-pending-eligibility-check instruction issued earlier in the same operator message; that interim state was never applied to the database."},
  "market_intel": {"verdict": "OUT", "reason": "Not a market signal."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 102;
