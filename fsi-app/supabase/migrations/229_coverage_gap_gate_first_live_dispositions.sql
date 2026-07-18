-- 229_coverage_gap_gate_first_live_dispositions.sql
-- Session C (coverage discovery lane), 2026-07-17. First LIVE exercise of the migration-228
-- surface-contract gate (per the ruling: no backfill/synthetic seeding, the gate binds the next
-- real decline/park). This migration dispositions exactly the 4 rows the consolidation order names
-- as PRODUCT DECISIONS needing an inline five-surface test: the 3 Class 6 enforcement-verification
-- rows (67-69, five-surface test already written in prose in migration 224's notes, now also
-- structured here) and rank 16 (EU 2019/880, the parked art-vertical-scope flag from the original
-- discovery pass, ruled "hold at relevance-unconfirmed" at session start).
--
-- All 4 rows get disposition='parked' (routed to the operator for a scope or product-build
-- decision -- none of these are rejected outright, none are silently accepted). This is the FIRST
-- REAL row the golden's PART B auto-arm binds to; migration number posted to Session A per the
-- PENDING-C handoff so PI-5.enforcedBy gets migration:229 added.

UPDATE public.coverage_gap_candidates
SET disposition = 'parked',
    surface_test = '{
      "regulations": {"verdict": "OUT", "reason": "Not itself regulatory text; the underlying Truck and Bus Regulation / ACF rules are separately in-corpus."},
      "operations": {"verdict": "IN", "reason": "A per-carrier/subcontractor CA compliance-status lookup is exactly the structured jurisdictional decision data Operations contract calls for; Clean Truck Check equivalent lookup tool was likewise IN when checked in a prior pass."},
      "market_intel": {"verdict": "OUT", "reason": "Not a market-movement or vendor-activity signal."},
      "research": {"verdict": "OUT", "reason": "An operational verification tool, not horizon-scan analytical content."},
      "community": {"verdict": "OUT", "reason": "Not peer-generated content."}
    }'::jsonb
WHERE rank = 67;

UPDATE public.coverage_gap_candidates
SET disposition = 'parked',
    surface_test = '{
      "regulations": {"verdict": "OUT", "reason": "Not regulatory text."},
      "operations": {"verdict": "OUT", "reason": "Anonymised-by-design public output cannot support a per-carrier lookup; at most an aggregated trend input, not sufficient for Operations decision-support."},
      "market_intel": {"verdict": "OUT", "reason": "An annual industry-wide decarbonization trend point, closer to statistical/research character than a market-movement signal."},
      "research": {"verdict": "IN", "reason": "The anonymised annual aggregate report to MEPC is exactly the quantified, analytically-deep horizon-scan content Research contract wants."},
      "community": {"verdict": "OUT", "reason": "Not peer-generated."}
    }'::jsonb
WHERE rank = 68;

UPDATE public.coverage_gap_candidates
SET disposition = 'parked',
    surface_test = '{
      "regulations": {"verdict": "OUT", "reason": "Tightly coupled to the already-in-corpus EU ETS aviation regulation, but the registry itself is not regulatory text."},
      "operations": {"verdict": "CONDITIONAL", "reason": "Would fit Operations contract the same way TRUCRS does IF true operator-level granularity is confirmed available; the public EU ETS data viewer as checked publishes country/activity-type aggregates, not confirmed per-aircraft-operator, so this is OUT pending a granularity-verification step."},
      "market_intel": {"verdict": "IN", "reason": "Aggregated verified-emissions/allowance/surrender data is squarely carbon market intelligence per the Market Intel surface scope."},
      "research": {"verdict": "OUT", "reason": "Not horizon-scan."},
      "community": {"verdict": "OUT", "reason": "Not peer-generated."}
    }'::jsonb
WHERE rank = 69;

UPDATE public.coverage_gap_candidates
SET disposition = 'parked',
    surface_test = '{
      "regulations": {"verdict": "OUT", "reason": "A real EU regulation, but a cultural-heritage/customs-control instrument, not a freight-sustainability instrument under the platform current scope; would flip IN only if the operator widens scope to art-logistics compliance generally."},
      "operations": {"verdict": "OUT", "reason": "Not a jurisdictional cost/feasibility data surface; an import-documentation compliance requirement, not an operations cost/infrastructure input."},
      "market_intel": {"verdict": "OUT", "reason": "Not a market-movement or vendor-activity signal."},
      "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
      "community": {"verdict": "OUT", "reason": "Not peer-generated."}
    }'::jsonb
WHERE rank = 16;
