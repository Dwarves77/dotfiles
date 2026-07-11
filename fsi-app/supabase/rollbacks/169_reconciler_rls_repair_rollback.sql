-- Rollback for migration 169 — drop the reconciler SELECT policies on the validator input tables.
-- NOTE: reversing re-breaks the reconciler runner (validator sees 0 input rows → mis-quarantines valid
-- items). Reverse only if a policy is found to over-expose; then forward-fix with a scoped predicate.

BEGIN;

DROP POLICY IF EXISTS agent_run_searches_reconciler_select ON public.agent_run_searches;
DROP POLICY IF EXISTS section_claim_provenance_reconciler_select ON public.section_claim_provenance;
DROP POLICY IF EXISTS item_type_required_slots_reconciler_select ON public.item_type_required_slots;

COMMIT;
