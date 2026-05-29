-- Migration 115: set_provenance_status trigger (Sprint 4 Block 1, task 1.4).
--
-- Implements design-doc section 4 STEP 4 (trigger half) and section 3b's
-- branch logic: AFTER INSERT/UPDATE on intelligence_items,
-- intelligence_item_sections, and section_claim_provenance, call
-- validate_item_provenance(item_id) and set the affected item's
-- provenance_status to the function's recommended_status. Branches:
--   - criteria 1-5 fail            -> 'quarantined' (+ integrity_flags row)
--   - pass, item CRITICAL/HIGH     -> 'pending_human_verify' (criterion 6)
--   - pass, item MODERATE/LOW      -> 'verified' (+ provenance_verified_at)
--
-- ADDITIVE per the Block 1 hard fence:
--   - NO ALTER/DROP of any existing column/table/constraint.
--   - NO NOT NULL / CHECK added to EXISTING columns.
--   - NO backfill/UPDATE of EXISTING rows. The trigger fires ONLY on FUTURE
--     writes (the AFTER INSERT/UPDATE event for the row being written). It
--     contains NO statement that scans and re-stamps the pre-existing corpus.
--     provenance_status keeps its migration-112 default of 'unverified' on
--     every existing row until that row is itself next written (Block 1) or
--     until Phase 2 reconciliation runs the function over the corpus. Nothing
--     flips at migration-apply time: creating a trigger does not fire it.
--
-- Recursion: the intelligence_items trigger's own action is an UPDATE of
-- intelligence_items, which would re-enter the trigger. Guarded two ways:
--   (1) the trigger function only issues the UPDATE when the computed status
--       actually DIFFERS from the row's current status (no-op writes avoided);
--   (2) the trigger is created WHEN (pg_trigger_depth() = 0) on
--       intelligence_items, so the self-UPDATE never recurses regardless.
-- The integrity_flags INSERT is scoped to the single newly-written item; it is
-- NOT a corpus backfill.

BEGIN;

-- ── Trigger function ────────────────────────────────────────────────
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
  -- Resolve the affected intelligence_items.id from whichever table fired.
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

  -- Validate the affected item against the six criteria (read-only function).
  v_validation := public.validate_item_provenance(v_item_id);

  -- Read the item's current provenance_status so we only write on a change.
  SELECT provenance_status INTO v_current
    FROM public.intelligence_items
   WHERE id = v_item_id;

  IF NOT FOUND THEN
    -- Item was deleted concurrently; nothing to stamp.
    RETURN NEW;
  END IF;

  -- Only write when the terminal status actually changes. This both avoids
  -- redundant writes and, combined with the WHEN(pg_trigger_depth()=0) guard
  -- on the intelligence_items trigger below, prevents recursive re-firing.
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

  -- Quarantine branch: record an integrity_flags row carrying the failures
  -- payload so the staged/admin surfaces can show the exact problem. Scoped to
  -- THIS item only (the row just written), idempotent per open flag per item.
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

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.set_provenance_status() IS
  'Sprint 4 Block 1 task 1.4 trigger function. AFTER INSERT/UPDATE on intelligence_items / intelligence_item_sections / section_claim_provenance, calls validate_item_provenance(item_id) and stamps the affected item provenance_status with recommended_status (verified / pending_human_verify / quarantined). Sets provenance_verified_at on verified; inserts a data_quality integrity_flags row on quarantine. Writes only when the status changes (no-op-write avoidance) and the intelligence_items trigger is depth-guarded, so the self-UPDATE never recurses. Fires only on future writes; performs NO corpus backfill.';

-- ── Triggers ────────────────────────────────────────────────────────
-- intelligence_items: depth-guarded so the function''s own UPDATE of this
-- table does not re-enter the trigger.
DROP TRIGGER IF EXISTS set_provenance_status_trg ON public.intelligence_items;
CREATE TRIGGER set_provenance_status_trg
  AFTER INSERT OR UPDATE ON public.intelligence_items
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.set_provenance_status();

-- intelligence_item_sections: a section write re-validates its parent item.
DROP TRIGGER IF EXISTS set_provenance_status_sections_trg ON public.intelligence_item_sections;
CREATE TRIGGER set_provenance_status_sections_trg
  AFTER INSERT OR UPDATE ON public.intelligence_item_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_provenance_status();

-- section_claim_provenance: a claim write re-validates its parent item.
DROP TRIGGER IF EXISTS set_provenance_status_claims_trg ON public.section_claim_provenance;
CREATE TRIGGER set_provenance_status_claims_trg
  AFTER INSERT OR UPDATE ON public.section_claim_provenance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_provenance_status();

COMMIT;
