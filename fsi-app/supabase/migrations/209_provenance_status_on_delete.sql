-- 209_provenance_status_on_delete.sql
--
-- ROOT-GAP FIX (operator ruling 2026-07-16): the set_provenance_status trigger fired only on AFTER
-- INSERT/UPDATE, never on DELETE. So versioning a claim OUT of the live ledger (eraseClaimWithProof /
-- the guarded version-out used by the drain prior-junk clearance and the hold-resolution loop) removed a
-- gate-FAILING claim but did NOT recompute provenance_status — the item stayed quarantined with a valid
-- ledger until an unrelated INSERT/UPDATE happened to nudge it. That nudge was a hack; this is the real fix.
--
-- Change: (1) extend set_provenance_status() to handle TG_OP = 'DELETE' (derive the item id from OLD and
-- RETURN OLD); (2) add an AFTER DELETE trigger on section_claim_provenance. The function guards on
-- "SELECT ... WHERE id = v_item_id; IF NOT FOUND RETURN" so a CASCADE delete of the item itself (claims
-- cascade out) is a safe no-op — it never tries to update a row that is being deleted. Recompute runs off
-- the post-delete ledger (AFTER DELETE), which is exactly what validate_item_provenance must see.
--
-- Safe against live data: pure trigger/function DDL, no row rewrites, no backfill. Idempotent (CREATE OR
-- REPLACE + DROP TRIGGER IF EXISTS). Existing INSERT/UPDATE triggers are unchanged.

CREATE OR REPLACE FUNCTION public.set_provenance_status()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_item_id    uuid;
  v_validation validation_result;
  v_current    provenance_status;
  v_verified_at timestamptz;
BEGIN
  -- DELETE fires with OLD populated and NEW null; INSERT/UPDATE with NEW. Derive the affected item id from
  -- whichever record the event carries, then recompute against the CURRENT (post-event) ledger.
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'section_claim_provenance' THEN
      v_item_id := OLD.intelligence_item_id;
    ELSIF TG_TABLE_NAME = 'intelligence_item_sections' THEN
      v_item_id := OLD.item_id;
    ELSIF TG_TABLE_NAME = 'intelligence_items' THEN
      v_item_id := OLD.id;
    ELSE
      RETURN OLD;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'intelligence_items' THEN
      v_item_id := NEW.id;
    ELSIF TG_TABLE_NAME = 'intelligence_item_sections' THEN
      v_item_id := NEW.item_id;
    ELSIF TG_TABLE_NAME = 'section_claim_provenance' THEN
      v_item_id := NEW.intelligence_item_id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF v_item_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_validation := public.validate_item_provenance(v_item_id);

  SELECT provenance_status INTO v_current
    FROM public.intelligence_items
   WHERE id = v_item_id;

  -- Item gone (e.g. a CASCADE delete of the item itself) -> nothing to stamp. Safe no-op.
  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_current IS DISTINCT FROM v_validation.recommended_status THEN
    IF v_validation.recommended_status = 'verified' THEN
      v_verified_at := now();
    ELSE
      v_verified_at := NULL;
    END IF;

    UPDATE public.intelligence_items
       SET provenance_status      = v_validation.recommended_status,
           provenance_verified_at = v_verified_at
     WHERE id = v_item_id;
  END IF;

  -- Quarantine branch: open a data_quality flag (idempotent per open flag per item).
  IF v_validation.recommended_status = 'quarantined' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.integrity_flags f
       WHERE f.category = 'data_quality'
         AND f.subject_type = 'item'
         AND f.subject_ref = v_item_id::text
         AND f.status = 'open'
    ) THEN
      INSERT INTO public.integrity_flags (
        category, subject_type, subject_ref, description,
        recommended_actions, status, created_by
      )
      VALUES (
        'data_quality',
        'item',
        v_item_id::text,
        'Provenance gate quarantine: item failed one or more of the six provenance criteria on write.',
        jsonb_build_object('failures', v_validation.failures),
        'open',
        'set_provenance_status_trigger'
      );
    END IF;
  END IF;

  -- F5 CLOSE-ON-VERIFY (migration 139): when the item is (re-)verified, resolve any OPEN trigger-created
  -- data_quality flag for it. Keeps the flag surface meaningful across re-grounds / revalidations / version-outs.
  IF v_validation.recommended_status = 'verified' THEN
    UPDATE public.integrity_flags
       SET status = 'resolved',
           resolved_at = now(),
           resolved_by = 'set_provenance_status_trigger',
           resolution_note = 'auto-resolved: item re-verified by the provenance gate'
     WHERE category = 'data_quality'
       AND subject_type = 'item'
       AND subject_ref = v_item_id::text
       AND status = 'open'
       AND created_by = 'set_provenance_status_trigger';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;

COMMENT ON FUNCTION public.set_provenance_status() IS
  'Sprint 4 Block 1 task 1.4 trigger function, migration 209 revision. AFTER INSERT/UPDATE/DELETE on '
  'intelligence_items / intelligence_item_sections / section_claim_provenance, calls '
  'validate_item_provenance(item_id) and stamps the affected item provenance_status. DELETE derives the '
  'item id from OLD and RETURNs OLD; a CASCADE delete of the item itself is a safe no-op (NOT FOUND guard). '
  'Opens a data_quality flag on quarantine (idempotent); closes it on verify (migration 139). Writes only '
  'when status changes. Fires on future writes; performs NO corpus backfill.';

-- Add the missing AFTER DELETE trigger on section_claim_provenance so a version-out (drain / hold-loop)
-- recomputes status without an unrelated nudge write. INSERT/UPDATE triggers stay as they are.
DROP TRIGGER IF EXISTS set_provenance_status_claims_del_trg ON public.section_claim_provenance;
CREATE TRIGGER set_provenance_status_claims_del_trg
  AFTER DELETE ON public.section_claim_provenance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_provenance_status();
