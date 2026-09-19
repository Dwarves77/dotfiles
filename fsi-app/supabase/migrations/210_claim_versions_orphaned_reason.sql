-- subject: Migration 210 (operator ruling 2026-07-16, third live-ledger exit). Extends the `claim_versions.supersede_reason` vocab to add `orphaned_no_prose_referent`, a claim whose text annotates NO prose paragraph in any section certifies nothing customer-facing (dead ledger weight from prior synthesis, proven FUNCTIONLESS not proven wrong). Distinct reason from `proven_inaccurate` so the taxonomy stays honest. Also tightens `claim_versions_proof_required` so ANY non-`changed` exit (both `proven_inaccurate` and `orphaned_no_prose_referent`) MUST carry `inaccuracy_proof`. The exhaustive live-ledger exits are now: changed (re-attribution) / proven_inaccurate (cross-instrument, evidenced) / orphaned_no_prose_referent (functionless, slot-coverage-safe); relabel-to-ANALYSIS stays LIVE. Consumed by drain-clear.mjs (three-exit version-out, condition-b slot-safety). Doctrine addendum on erase-only-on-proven-inaccuracy; invariant RD-45. **APPLIED 2026-07-16** via apply_migration. Reversible (restore the 208 2-value vocab + proof constraint).
-- 210_claim_versions_orphaned_reason.sql
--
-- THIRD SANCTIONED LIVE-LEDGER EXIT (operator ruling 2026-07-16): a claim whose text annotates NO prose
-- paragraph in any section of the brief certifies nothing customer-facing — it is dead ledger weight from
-- prior synthesis, proven FUNCTIONLESS (not proven wrong). It exits the live ledger under its own
-- supersede_reason 'orphaned_no_prose_referent', distinct from 'proven_inaccurate' so the taxonomy stays
-- honest, with the mechanical proof recorded (claim text verbatim-absent from every section's prose) and
-- through the same guarded fail-closed archive-then-delete (recoverable from claim_versions).
--
-- The exhaustive live-ledger exit set is now: 'changed' (re-attribution, old state kept), 'proven_inaccurate'
-- (cross-instrument / contradicted, evidenced), 'orphaned_no_prose_referent' (functionless, mechanically
-- proven). Relabel-to-ANALYSIS keeps a claim LIVE and is not an exit. Nothing else removes a claim.
--
-- Change: (1) extend the supersede_reason vocab to include the new value; (2) extend the proof-required
-- constraint so an orphaned_no_prose_referent archive MUST also carry its mechanical proof (both non-'changed'
-- reasons require proof). Pure constraint DDL, no row rewrites, idempotent (drop-if-exists + re-add).

alter table public.claim_versions drop constraint if exists claim_versions_supersede_reason_chk;
alter table public.claim_versions add constraint claim_versions_supersede_reason_chk
  check (supersede_reason in ('changed', 'proven_inaccurate', 'orphaned_no_prose_referent'));

-- A non-'changed' archive (an EXIT from the live ledger, not a re-attribution) MUST carry its proof.
alter table public.claim_versions drop constraint if exists claim_versions_proof_required;
alter table public.claim_versions add constraint claim_versions_proof_required
  check (supersede_reason = 'changed' or inaccuracy_proof is not null);

comment on table public.claim_versions is
  'Preserved claim history (non-destructive grounding doctrine 2026-07-16). Append-only. current_claim_id / intelligence_item_id are SOFT refs (no cascading FK) so history survives current-row/item deletion. supersede_reason = changed (old state before a re-attribution) | proven_inaccurate (final state + proof of a cross-instrument/contradicted erase) | orphaned_no_prose_referent (final state + proof of a functionless claim whose text is verbatim-absent from every section prose). The three exits + relabel-to-ANALYSIS (stays live) are the ONLY sanctioned live-ledger dispositions.';
