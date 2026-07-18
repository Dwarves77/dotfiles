-- 224_coverage_gap_class6_five_surface_test.sql
-- Session C (coverage discovery lane), 2026-07-17 reactivation. Operator ruling 3 on Bank 6
-- (migration 222, applied before this ruling arrived mid-turn): each enforcement/verification
-- system must carry an explicit inline five-surface test (Regulations / Operations / Market
-- Intel / Research / Community, per caros-ledge-platform-intent) so a reviewer sees the
-- per-surface evidence directly, not the prior blanket-decline framing from migration 216.
-- Applied as a notes-append UPDATE rather than re-issuing the INSERTs, since the 3 rows are
-- already live and applied-migrations-are-immutable (standing rule 1) forbids editing 222 itself.

UPDATE public.coverage_gap_candidates
SET notes = notes || ' FIVE-SURFACE TEST: Regulations=OUT (not itself regulatory text; the underlying Truck and Bus Regulation / ACF rules are separately in-corpus). Operations=IN (a per-carrier/subcontractor CA compliance-status lookup is exactly the "structured jurisdictional decision data" Operations'' analysis contract calls for -- the template finding: Clean Truck Check''s equivalent lookup tool was likewise Operations=IN when checked in a prior pass). Market Intel=OUT (not a market-movement or vendor-activity signal). Research=OUT (an operational verification tool, not horizon-scan analytical content). Community=OUT (not peer-generated). Net: single-surface fit (Operations), a feature-build candidate, not a content-brief source -- supersedes the migration-216 blanket decline with per-surface evidence.'
WHERE rank = 67;

UPDATE public.coverage_gap_candidates
SET notes = notes || ' FIVE-SURFACE TEST: Regulations=OUT. Operations=OUT/WEAK (the anonymised-by-design public output cannot support a per-carrier lookup the way rank 67''s tool can; at most a highly aggregated cost/trend input, not sufficient alone for Operations'' decision-support contract). Market Intel=WEAK (an annual industry-wide decarbonization-trend data point, closer to statistical/research character than a "what the industry is doing" signal). Research=IN (the anonymised annual aggregate report to MEPC is exactly the quantified, analytically-deep horizon-scan content Research''s contract wants). Community=OUT. Net: Research is the correct-fit surface, not a product feature like rank 67 -- this row is a content-source gap, not an enforcement-lookup product decision, despite sharing the enforcement_verification_system discovery_class label.'
WHERE rank = 68;

UPDATE public.coverage_gap_candidates
SET notes = notes || ' FIVE-SURFACE TEST: Regulations=OUT (tightly coupled to the already-in-corpus EU ETS aviation regulation, but the registry itself is not regulatory text). Operations=CONDITIONAL (a compliance-status lookup would fit Operations'' contract the same way rank 67''s does, IF true operator-level granularity is confirmed available -- the EU ETS data viewer as checked in this pass publishes country/activity-type aggregates, not confirmed per-aircraft-operator, so this is OUT pending a granularity-verification step, not a settled IN). Market Intel=IN (aggregated verified-emissions/allowance/surrender data is squarely "carbon market intelligence" per the Market Intel surface scope). Research=OUT. Community=OUT. Net: Market Intel is the confirmed-fit surface; Operations remains an open question pending the granularity check flagged above, not resolved here.'
WHERE rank = 69;
