-- 235_coverage_gap_section4_final_rulings.sql
-- Session C (coverage discovery lane), 2026-07-18. Final Section 4 (Product/Scope Decision)
-- rulings, closing the last open items in the discovery arc.
--
-- EU 2019/880 (rank 16): DECLINED. Operator ruling recorded verbatim in surface_test.regulations.reason:
-- customs/provenance compliance is an entire other subset of a build not being done now, the
-- product is sustainability regulation.
--
-- CARB TRUCRS (rank 67): DECLINED as source AND as feature. Operator ruling recorded verbatim:
-- the product informs vendors about rules and their cost exposure, it does not vet vendors;
-- per-vehicle compliance lookup is procurement tooling outside the product. This REVERSES the
-- migration-229 five-surface finding (Operations=IN) with an explicit operator scope ruling that
-- supersedes the per-surface mechanical test -- the row still carries the original five-surface
-- test as history (not erased), with the operator's scope ruling appended as the disposition
-- reason, since the scope boundary is a product decision the five-surface test alone cannot make.
--
-- IMO GISIS (rank 68): TAKEN. Reclassified from a Class 6 product-decision row (data_class=tracker,
-- access_model=not_applicable) to a plain accepted free content source: data_class -> instrument,
-- access_model -> free, estimated_priority -> HIGH, disposition -> kept, so it routes into Section 1
-- (free-acquire ready) per the operator's explicit "move to Section 1" instruction. surface_test
-- retained (not required for disposition=kept, but kept for full audit trail) reflecting the final
-- Research=IN verdict.
--
-- EU Union Registry/EUTL (rank 69): TAKEN. Same reclassification pattern (tracker->instrument,
-- not_applicable->free, disposition->kept), Market Intel surface, with a verification note recorded
-- for the still-open Operations-granularity question (assessed at acquisition time, re-sections if
-- the data turns out aggregate-and-lagged rather than operator-level and timely).

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "OPERATOR RULING (verbatim): customs/provenance compliance is an entire other subset of a build not being done now, the product is sustainability regulation. Scope decision, not a five-surface mechanical finding -- this closes the session-start hold at relevance-unconfirmed."},
  "operations": {"verdict": "OUT", "reason": "Not a jurisdictional cost/feasibility data surface; an import-documentation compliance requirement."},
  "market_intel": {"verdict": "OUT", "reason": "Not a market-movement or vendor-activity signal."},
  "research": {"verdict": "OUT", "reason": "Not horizon-scan content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated."}
}'::jsonb WHERE rank = 16;

UPDATE public.coverage_gap_candidates SET disposition = 'declined', surface_test = '{
  "regulations": {"verdict": "OUT", "reason": "Not itself regulatory text; the underlying Truck and Bus Regulation / ACF rules are separately in-corpus."},
  "operations": {"verdict": "OUT", "reason": "OPERATOR RULING (verbatim), SUPERSEDING the migration-229 mechanical five-surface finding of Operations=IN: the product informs vendors about rules and their cost exposure, it does not vet vendors. Per-vehicle compliance lookup is procurement tooling outside the product. Declined as BOTH a content source and a feature -- a scope-boundary decision the five-surface test alone cannot make, since the mechanical test correctly found a structural fit but the operator ruled the fit is out of the product''s intended function regardless."},
  "market_intel": {"verdict": "OUT", "reason": "Not a market-movement or vendor-activity signal."},
  "research": {"verdict": "OUT", "reason": "An operational verification tool, not horizon-scan analytical content."},
  "community": {"verdict": "OUT", "reason": "Not peer-generated content."}
}'::jsonb WHERE rank = 67;

UPDATE public.coverage_gap_candidates SET
  disposition = 'kept',
  data_class = 'instrument',
  access_model = 'free',
  estimated_priority = 'HIGH',
  surface_test = '{
    "regulations": {"verdict": "OUT", "reason": "Not regulatory text."},
    "operations": {"verdict": "OUT", "reason": "Anonymised-by-design public output cannot support a per-carrier lookup."},
    "market_intel": {"verdict": "OUT", "reason": "An annual industry-wide trend point, closer to statistical/research character than a market-movement signal."},
    "research": {"verdict": "IN", "reason": "TAKEN. Fleet fuel-consumption ground truth under CII/EEXI/FuelEU feeds Research horizon assessments -- the anonymised annual aggregate report to MEPC is exactly the quantified, analytically-deep content the Research surface contract wants."},
    "community": {"verdict": "OUT", "reason": "Not peer-generated."}
  }'::jsonb
WHERE rank = 68;

UPDATE public.coverage_gap_candidates SET
  disposition = 'kept',
  data_class = 'instrument',
  access_model = 'free',
  surface_test = '{
    "regulations": {"verdict": "OUT", "reason": "Tightly coupled to the already-in-corpus EU ETS aviation regulation, but the registry itself is not regulatory text."},
    "operations": {"verdict": "CONDITIONAL", "reason": "OPEN VERIFICATION NOTE: granularity to be assessed at acquisition. If operator-level and timely, this serves the Operations surface too; if aggregate-and-lagged, the row stays Market-Intel-only and does not re-open the Operations question without new evidence."},
    "market_intel": {"verdict": "IN", "reason": "TAKEN. Aggregated verified-emissions/allowance/surrender data is squarely carbon market intelligence per the Market Intel surface scope."},
    "research": {"verdict": "OUT", "reason": "Not horizon-scan."},
    "community": {"verdict": "OUT", "reason": "Not peer-generated."}
  }'::jsonb
WHERE rank = 69;
