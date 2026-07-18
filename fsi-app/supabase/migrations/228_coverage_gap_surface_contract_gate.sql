-- 228_coverage_gap_surface_contract_gate.sql
-- Session C (coverage discovery lane), 2026-07-17. Lands the PENDING-C schema handoff from Session
-- A's 2026-07-17 SURFACE-CONTRACT SCOPE GATE dispatch (main-checkout docs/ops/session-log.md,
-- "OPERATOR RULING" block): coverage_gap_candidates is Session C's table; Session A does not touch
-- it. This migration adds disposition + surface_test + the five-surface CHECK per that ruling.
--
-- disposition: kept | declined | parked (nullable -- most rows carry no disposition yet, see below).
-- surface_test: jsonb, the SSOT shape defined in scripts/verify/surface-contract-gate.golden.mjs
-- PART A: CONTRACT_KEYS = regulations, operations, market_intel, research, community, each key an
-- object {verdict, reason} both non-empty. The CHECK below is the DB-side twin of that golden.
--
-- SEEDING (per the ruling, DORMANT, no backfill, no synthetic rows): the 98 rows discovered across
-- this whole job are NOT retroactively stamped disposition='kept' or given synthetic surface_test
-- values just to satisfy the new columns -- disposition stays NULL by default, which the CHECK
-- treats as unconstrained (a NULL comparison in the WHERE-style CHECK expression passes). The gate
-- binds the NEXT real decline/park, exercised live in migration 229 (the actual consolidation-order
-- work) rather than invented here as filler.

ALTER TABLE public.coverage_gap_candidates
  ADD COLUMN IF NOT EXISTS disposition text,
  ADD COLUMN IF NOT EXISTS surface_test jsonb;

ALTER TABLE public.coverage_gap_candidates
  ADD CONSTRAINT coverage_gap_candidates_disposition_check
    CHECK (disposition IS NULL OR disposition IN ('kept', 'declined', 'parked'));

COMMENT ON COLUMN public.coverage_gap_candidates.disposition IS
  'kept = accepted as a real coverage gap. declined = rejected (not a genuine gap, or out of scope). parked = deferred pending an operator decision (scope, spend, or product). NULL = no disposition decision made yet (the default state for rows from the original discovery passes). Per operator ruling 2026-07-17: no backfill on existing rows -- this column is DORMANT until a row is actually dispositioned.';

ALTER TABLE public.coverage_gap_candidates
  ADD CONSTRAINT coverage_gap_candidates_surface_test_required_check
    CHECK (
      disposition IS NULL
      OR disposition = 'kept'
      OR (
        surface_test IS NOT NULL
        AND surface_test ?& ARRAY['regulations', 'operations', 'market_intel', 'research', 'community']
        AND coalesce(length(surface_test #>> '{regulations,verdict}'), 0) > 0
        AND coalesce(length(surface_test #>> '{regulations,reason}'), 0) > 0
        AND coalesce(length(surface_test #>> '{operations,verdict}'), 0) > 0
        AND coalesce(length(surface_test #>> '{operations,reason}'), 0) > 0
        AND coalesce(length(surface_test #>> '{market_intel,verdict}'), 0) > 0
        AND coalesce(length(surface_test #>> '{market_intel,reason}'), 0) > 0
        AND coalesce(length(surface_test #>> '{research,verdict}'), 0) > 0
        AND coalesce(length(surface_test #>> '{research,reason}'), 0) > 0
        AND coalesce(length(surface_test #>> '{community,verdict}'), 0) > 0
        AND coalesce(length(surface_test #>> '{community,reason}'), 0) > 0
      )
    );

COMMENT ON COLUMN public.coverage_gap_candidates.surface_test IS
  'Five-surface scope test, required when disposition IN (declined, parked): {"regulations":{"verdict":"IN|OUT|CONDITIONAL","reason":"..."}, "operations":{...}, "market_intel":{...}, "research":{...}, "community":{...}}. SSOT for the JSON shape is scripts/verify/surface-contract-gate.golden.mjs PART A (caros-ledge-platform-intent skill). The DB CHECK is the mechanical twin of that golden -- no decline/park can land in this table without every surface accounted for.';
