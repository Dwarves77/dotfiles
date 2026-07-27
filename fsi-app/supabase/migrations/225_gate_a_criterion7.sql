-- 225_gate_a_criterion7.sql — GATE A: flip criterion 7 into validate_item_provenance (operator ruling 2026-07-26).
--
-- Landed AFTER 224 (state table) + the 100% backfill, so at flip time every brief already has current-hash state and
-- the criterion evaluates truthfully from moment one (interlock-free ordering — no grounding window ever broke).
--
-- CRITERION 7: a brief-bearing item is valid ONLY if it has a CURRENT-HASH CLEAN Gate-A scan state — i.e. an
-- item_gate_a_state row whose scanned_hash = md5(current full_brief) [not stale] AND orphan_count = 0. Missing state,
-- a stale hash (prose edited since the scan), or any orphan factual token => quarantined. Scope: figures + deadline-
-- dates (citation apparatus excluded, governed by criterion 2); years by context. See gate-a-scan.mjs + session log.
--
-- Applied via pg_get_functiondef inject-and-apply: read the live validate_item_provenance definition, inject the
-- criterion before the unique final `v_result.valid := (jsonb_array_length(v_failures)=0);` line (the `failures :=`
-- line is NOT unique — it also appears in the item-not-found branch), re-sync v_result.failures so the payload lists
-- criterion 7, EXECUTE. Idempotent (no-op if already present); raises if the anchor is missing or no change results.
-- Read-only-verified effect: exactly 329 of 345 brief items fail criterion 7 (the orphan-carrying set); GREEN 4/4 on
-- the red/green criterion test (clean->verified, orphaned/stale-hash/missing-state->quarantined).

DO $mig$
DECLARE
  def    text;
  newdef text;
  anchor constant text := 'v_result.valid := (jsonb_array_length(v_failures) = 0);';
  crit   constant text := $crit$  -- CRITERION 7 - GATE A (prose-fact, hash-validated). Every fact a customer could ACT ON must be span-proven.
  IF coalesce(v_item.full_brief, '') <> ''
     AND NOT EXISTS (SELECT 1 FROM public.item_gate_a_state g
                      WHERE g.intelligence_item_id = p_item_id
                        AND g.scanned_hash = md5(v_item.full_brief)
                        AND g.orphan_count = 0) THEN
    v_failures := v_failures || jsonb_build_object('criterion', 7, 'reason', 'gate_a_unproven_or_stale');
    v_result.failures := v_failures;
  END IF;
  $crit$;
BEGIN
  def := pg_get_functiondef('public.validate_item_provenance(uuid)'::regprocedure);
  IF position('gate_a_unproven_or_stale' in def) > 0 THEN
    RAISE NOTICE 'Gate A criterion 7 already present - no-op';
  ELSE
    IF position(anchor in def) = 0 THEN RAISE EXCEPTION 'Gate A flip: anchor line not found in validate_item_provenance'; END IF;
    newdef := replace(def, anchor, crit || anchor);
    IF newdef = def THEN RAISE EXCEPTION 'Gate A flip: replace produced no change'; END IF;
    EXECUTE newdef;
    RAISE NOTICE 'Gate A criterion 7 injected and applied';
  END IF;
END $mig$;
