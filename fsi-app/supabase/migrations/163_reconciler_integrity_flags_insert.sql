-- subject: Migration 163 (reconciler INSERT policy on integrity_flags, the moat guard's missing half, found by the conservation-audit re-ground proof). A single additive `CREATE POLICY integrity_flags_reconciler_insert` (roles={reconciler}, cmd=INSERT, WITH CHECK true) so `set_provenance_status`'s quarantine-branch flag insert stops failing RLS when the flip runs as the bound reconciler. FOUND ALREADY APPLIED OUT-OF-BAND on 2026-07-10 (policy present in pg_policies, ledger topped at 162), ledgered idempotently as version 163 via a guarded DO block (semantics identical to the authored file; delegated per the reconciliation-remediation dispatch's single-additive-policy clause). POST-APPLY PROOF (2026-07-11, via the reconciler DSN, all rolled back): INSERT integrity_flags OK; DELETE integrity_flags DENIED; INSERT sources DENIED; MCP postgres cannot SET ROLE reconciler. KNOWN RESIDUAL (operator DDL window owed, ADR-011 break-risky): this policy is necessary but NOT sufficient, post-mig-157 the reconciler cannot SELECT the validator's inputs (agent_run_searches / section_claim_provenance / item_type_required_slots read 0 rows) and its intelligence_items writes fail WITH CHECK even same-value; the reconciler runner is unsound until that window. Reversible (DROP POLICY).
-- Migration 163: let the bound `reconciler` role INSERT integrity_flags (the moat guard's missing half).
--
-- AUTHOR-ONLY / OPERATOR DDL WINDOW (RLS change = break-risky class per ADR-011). DO NOT apply inline.
--
-- WHY (found by the conservation-audit re-ground proof, 2026-07-09):
--   The re-ground reconciliation flips a verified-but-failing item to its honest terminal status through
--   the bound `reconciler` credential (the ONLY path the moat guard `guard_provenance_flip` permits).
--   On a QUARANTINE outcome, the trigger `set_provenance_status` (SECURITY INVOKER) inserts a
--   data_quality integrity_flags row AS the reconciler role. `reconciler` has a permissive
--   `intelligence_items` UPDATE policy (intelligence_items_reconciler_update: USING true / CHECK true)
--   but NO integrity_flags INSERT policy — so the status flip is allowed while the flag side-effect
--   fails RLS (`ExecWithCheckOptions`), aborting the whole flip. Recovered items (flip → verified,
--   no flag) are unaffected; only the honest-quarantine path is blocked.
--
-- FIX (minimal, additive, targeted — mirrors the existing intelligence_items_reconciler_update grant):
--   a single INSERT policy on integrity_flags for the reconciler role. Does not touch service_role,
--   authenticated, or anon behaviour. Reversible (DROP POLICY).
--
-- POST-APPLY VERIFICATION (run in the window):
--   1. As reconciler: touch updated_at on a verified fact_below_authority_floor item -> it flips to
--      quarantined AND the data_quality flag row is present (no ExecWithCheckOptions).
--   2. pg_policies shows integrity_flags_reconciler_insert with roles={reconciler}, cmd=INSERT.
--   Then resume: scripts/_reground/reconcile-revalidate.mjs --apply --only=<floor-class ids>.

BEGIN;

CREATE POLICY integrity_flags_reconciler_insert
  ON public.integrity_flags
  FOR INSERT
  TO reconciler
  WITH CHECK (true);

COMMIT;
