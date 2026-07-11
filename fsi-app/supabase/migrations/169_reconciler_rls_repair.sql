-- Migration 169 (Wave-α Track B6) — reconciler SELECT policies on the validator's input tables
--
-- AUTHOR-ONLY / OPERATOR DDL WINDOW (RLS change = break-risky class, ADR-011).
-- Authored, apply via the DDL protocol — DO NOT apply inline.
--
-- WHY (master-gap-register P1 governance rider #1; reconciliation-remediation-closeout-2026-07-11 finding
--      2b + open-unit 1; DB-4 mig-163 residual):
--   The re-validation runner (scripts/_reground/reconcile-revalidate.mjs) touches
--   `intelligence_items.updated_at` through the BOUND `reconciler` role; the AFTER-UPDATE trigger
--   `set_provenance_status` (SECURITY INVOKER — prosecdef=false) recomputes status by calling
--   `validate_item_provenance(item_id)`, which is ALSO `STABLE` / SECURITY INVOKER — so it runs with the
--   RECONCILER's privileges. The reconciler HAS table GRANT SELECT on the validator's three input tables
--   (agent_run_searches, section_claim_provenance, item_type_required_slots) but RLS is ENABLED on all
--   three and there is NO policy admitting the reconciler → RLS returns 0 rows. The validator therefore
--   sees no claims / no slots and MIS-RECOMMENDS `quarantined` for VALID items. This is the RLS-credential
--   parity class (grant present, policy absent → silent deny).
--
-- ROOT CAUSE of the two symptoms named in the closeout:
--   * "reads 0 rows" on the three input tables  -> exactly this missing-SELECT-policy gap (fixed here).
--   * "even same-value writes fail WITH CHECK"   -> that was the trigger's quarantine-branch
--     `INSERT INTO integrity_flags` executing AS the reconciler with no INSERT policy (ExecWithCheckOptions
--     abort). That half was ALREADY fixed by `integrity_flags_reconciler_insert` (migration 163, ledgered
--     as version 20260711032524). With 163 + this migration, both halves are closed and the reconciler
--     runner becomes sound: the trigger reads real inputs, recommends correctly, and its flag side-effect
--     succeeds. The `intelligence_items_reconciler_update` policy (USING true / CHECK true) already admits
--     the outer + trigger-inner UPDATE, and `guard_provenance_flip` only binds flips OFF 'unverified'
--     (this population is verified-origin), so no further write policy is needed.
--
-- FIX: three targeted SELECT policies for the reconciler role — read-only, on the exact validator inputs.
--   Nothing else (no write, no other role) is touched.
--
-- POST-APPLY PROOF (see track-b-proofs.md B6; the orchestrator runs reconcile-revalidate.mjs on one known
--   item as the end-to-end proof):
--   * pg_policies shows *_reconciler_select (SELECT, roles={reconciler}) on all three tables.
--   * As the reconciler DSN: SELECT count(*) FROM agent_run_searches / section_claim_provenance /
--     item_type_required_slots each returns > 0 (was 0).
--   * `scripts/_reground/reconcile-revalidate.mjs --only=<a known-valid verified item>` (dry-run) has the
--     trigger recompute `verified` (no spurious quarantine flip) — validator now sees the inputs.
-- Reversible: rollbacks/169_reconciler_rls_repair_rollback.sql (DROP the 3 policies).

BEGIN;

DROP POLICY IF EXISTS agent_run_searches_reconciler_select ON public.agent_run_searches;
CREATE POLICY agent_run_searches_reconciler_select
  ON public.agent_run_searches
  FOR SELECT
  TO reconciler
  USING (true);

DROP POLICY IF EXISTS section_claim_provenance_reconciler_select ON public.section_claim_provenance;
CREATE POLICY section_claim_provenance_reconciler_select
  ON public.section_claim_provenance
  FOR SELECT
  TO reconciler
  USING (true);

DROP POLICY IF EXISTS item_type_required_slots_reconciler_select ON public.item_type_required_slots;
CREATE POLICY item_type_required_slots_reconciler_select
  ON public.item_type_required_slots
  FOR SELECT
  TO reconciler
  USING (true);

COMMIT;
