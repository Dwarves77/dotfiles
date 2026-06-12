-- Migration 139: set_provenance_status — CLOSE data_quality flags on (re-)verify (F5).
--
-- DEFECT: the trigger OPENS a data_quality integrity_flags row on quarantine (migration 115) but never
-- CLOSES it when the item later recovers to 'verified'. So every re-ground / the A6 30-flip revalidation
-- accreted stale 'open' quarantine flags on items that are now verified — the platform-flags surface
-- fills with resolved-in-reality-but-open-in-DB noise (alarm fatigue right as the nightly lane starts).
--
-- FIX: add a CLOSE-ON-VERIFY branch — when validate() recommends 'verified', resolve any OPEN
-- trigger-created data_quality flag for that item. Plus a ONE-TIME backfill that closes the stale ones
-- already sitting open on currently-verified items. Idempotent (only flips open->resolved). The function
-- body is otherwise byte-identical to migration 115.

BEGIN;

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
  IF TG_TABLE_NAME = 'intelligence_items' THEN
    v_item_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'intelligence_item_sections' THEN
    v_item_id := NEW.item_id;
  ELSIF TG_TABLE_NAME = 'section_claim_provenance' THEN
    v_item_id := NEW.intelligence_item_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_validation := public.validate_item_provenance(v_item_id);

  SELECT provenance_status INTO v_current
    FROM public.intelligence_items
   WHERE id = v_item_id;

  IF NOT FOUND THEN
    RETURN NEW;
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
  -- data_quality flag for it. Keeps the flag surface meaningful across re-grounds / revalidations.
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

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.set_provenance_status() IS
  'Sprint 4 Block 1 task 1.4 trigger function, migration 139 revision. AFTER INSERT/UPDATE, stamps provenance_status from validate_item_provenance and (NEW in 139) CLOSES the trigger-opened data_quality flag when the item is verified. Opens a data_quality flag on quarantine (idempotent). Fires only on future writes.';

-- ── ONE-TIME BACKFILL: close stale open flags on items that are already verified ──
UPDATE public.integrity_flags f
   SET status = 'resolved',
       resolved_at = now(),
       resolved_by = 'migration_139_backfill',
       resolution_note = 'auto-resolved: item is verified; stale quarantine flag pre-dated the close-on-verify trigger branch'
  FROM public.intelligence_items i
 WHERE f.category = 'data_quality'
   AND f.subject_type = 'item'
   AND f.status = 'open'
   AND f.created_by = 'set_provenance_status_trigger'
   AND i.id::text = f.subject_ref
   AND i.provenance_status = 'verified';

COMMIT;
