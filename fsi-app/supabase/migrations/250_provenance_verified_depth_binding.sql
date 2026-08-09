-- Migration 250: #43 provenance binding REBUILT — verified-status bound to the derivation by
-- trigger depth, forgeable GUC mechanism retired.
--
-- APPLIED LIVE 2026-08-09 via Supabase MCP (ledger 20260809183427 provenance_verified_depth_binding)
-- ahead of this commit — this file is the audit record per the code-vs-data doctrine, NOT a pending
-- apply. Verified live by the adversarial battery now permanent at
-- scripts/verify/prov-guard-adversarial-audit.mjs (forged-GUC escalation denied, direct
-- unverified->verified denied, ON CONFLICT escalation denied, restrictive flip allowed,
-- derivation re-verify at depth>=2 allowed).
--
-- WHAT WAS BROKEN (audit finding P0#6, [CONFIRMED] by live introspection 2026-08-09):
--   1. The mig-118 carve-out read a session-settable GUC: ANY role could run
--      SELECT set_config('app.prov_flip_origin','INSERT',true) and satisfy it — the "origin
--      stamp" was attacker-writable, so the reconciler binding was decorative.
--   2. pg_trigger_depth() >= 1 evaluated INSIDE the guard function is ALWAYS true (the guard
--      itself is trigger #1), so the depth condition excluded nothing.
--   3. INSERT ... ON CONFLICT DO UPDATE fires BEFORE INSERT row triggers for rows that take the
--      update path, so the stamp recorded 'INSERT' for what was actually an update of a
--      pre-existing row.
--   4. WIDER THAN THE AUDIT FOUND: the guard fired only on OLD='unverified'. The real corpus
--      lifecycle parks items at 'quarantined' (birth derivation on a bare row fails validation),
--      so quarantined->verified — the transition 180 live rows are one UPDATE away from — was
--      never guarded at all. Any role could bless a quarantined row directly.
--
-- THE REAL INVARIANT (audit-gate.ts, platform doctrine, and the live corpus all agree):
--   'verified' means "validate_item_provenance passed on write" — it is STAMPED BY THE MACHINE
--   (set_provenance_status), never asserted by a caller. The one sanctioned exception is the
--   scoped `reconciler` credential (mig 118's role, retained unchanged).
--
-- THE NEW CONSTRUCTION (non-forgeable):
--   Gate every transition INTO 'verified'. Allow it only when
--     (a) current_user = 'reconciler'  — the bound credential, unchanged; or
--     (b) pg_trigger_depth() >= 2 inside the guard — i.e. the UPDATE was issued from INSIDE
--         another trigger. Verified against the live catalog 2026-08-09: set_provenance_status
--         is the ONLY trigger function that writes intelligence_items.provenance_status
--         (pg_proc scan), and it writes only validate_item_provenance's recommendation.
--         Trigger depth cannot be set, faked, or reached by any SQL a non-owner can run:
--         a direct statement lands the guard at depth 1; only owner-created triggers create
--         depth >= 2. This is engine truth, not session state.
--   Non-escalating transitions (-> quarantined, -> pending_human_verify, any downgrade off
--   'verified') are deliberately open: they are restrictive, the derivation needs them (birth
--   quarantine, re-ground resets), and gating them under mig 118 is what wedged legitimate
--   reconciliation (tech-debt-log entry "reconciler cred not provisioned": claim-inserts on the
--   6 unverified orphans ERRORED). Under this design touch-and-derive works for any role and
--   validation remains the sole path to 'verified'.
--
-- SCOPE CHANGE vs mig 118's letter (surfaced, operator-visible — see ADR-017): 118 guarded
-- "off 'unverified'" (any target); this guards "into 'verified'" (any origin). The old letter
-- left the dominant escalation (quarantined->verified) open and blocked harmless restrictive
-- flips; the new letter matches the invariant the platform actually enforces everywhere else
-- (customer reads gate on ='verified').
--
-- REGRESSION ANALYSIS (live-verified before apply):
--   - App code: zero direct provenance_status='verified' writers (grep of src/ + scripts/;
--     writers set 'quarantined' only). The modern reconcile lane (reconcile-revalidate.mjs) is
--     touch-and-derive — "no SET provenance_status" by design — which is depth>=2, allowed.
--   - Archived one-shot scripts (_diag/revalidate-141, backfill-claim-tiers-pg) wrote
--     recommended_status directly as postgres; a re-run that recommends 'verified' now raises.
--     Correct: the sanctioned pattern is touch-and-derive (or the reconciler credential).
--   - pending_human_verify -> verified: zero writers exist in code (grep); no admin-queue lane
--     writes it. Binding it closes the unverified -> pending -> verified laundering path.
--   - Born-'verified' INSERTs self-heal: the AFTER INSERT derivation re-validates the bare row
--     and demotes it in the same statement (demotion is not guarded), so INSERT stays ungated.
--
-- RESIDUALS (documented, unchanged by this migration):
--   - Forged-inputs: a role that can write claims/spans/gate-A state can steer validation
--     itself. Bound upstream (append-only guards, mint chokepoint, capture provenance), not here.
--   - Owner: postgres owns the table and can disable triggers (mig 118's residual, still true;
--     bound by operator-side credential scoping).
--   - Downgrade vandalism (verified -> X by any role) remains open, as before: non-escalating.

BEGIN;

-- 1. Retire the forgeable origin-stamp mechanism entirely.
DROP TRIGGER IF EXISTS stamp_prov_origin_trg ON public.intelligence_items;
DROP FUNCTION IF EXISTS public.stamp_prov_origin();

-- 2. Rebuild the guard on the depth construction.
CREATE OR REPLACE FUNCTION public.guard_provenance_flip()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $fn$
BEGIN
  -- Escalation INTO 'verified' only. (Re-checked here so the function stays safe even if the
  -- trigger is ever recreated without its WHEN clause.)
  IF NEW.provenance_status = 'verified'
     AND NEW.provenance_status IS DISTINCT FROM OLD.provenance_status THEN
    -- depth semantics: a trigger fired by a top-level statement runs at pg_trigger_depth()=1;
    -- >=2 means the UPDATE was issued from inside another trigger — in this schema, only
    -- set_provenance_status (the validation derivation) issues such writes.
    IF current_user <> 'reconciler' AND pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION
        '#43 provenance binding: item % cannot be set to ''verified'' by a direct write from role %; ''verified'' is stamped only by the set_provenance_status derivation (validation) or the bound reconciler credential.',
        NEW.id, current_user
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_provenance_flip_trg ON public.intelligence_items;
CREATE TRIGGER guard_provenance_flip_trg
  BEFORE UPDATE ON public.intelligence_items
  FOR EACH ROW
  WHEN (old.provenance_status IS DISTINCT FROM new.provenance_status
        AND new.provenance_status = 'verified')
  EXECUTE FUNCTION public.guard_provenance_flip();

COMMENT ON FUNCTION public.guard_provenance_flip() IS
  '#43 credential binding, rebuilt by migration 250. BEFORE UPDATE on intelligence_items: any transition INTO provenance_status=''verified'' is rejected unless current_user=reconciler (the bound credential) or the write was issued from inside another trigger (pg_trigger_depth()>=2 in the guard = the set_provenance_status validation derivation, the only trigger function that writes this column). Replaces mig 118''s session-GUC origin stamp, which any role could forge via set_config, and closes the previously-unguarded quarantined->verified escalation. Restrictive transitions (->quarantined, ->pending_human_verify, downgrades) are deliberately open. Not owner-proof: postgres can disable this trigger; that residual is bound by operator-side credential scoping.';

COMMIT;
