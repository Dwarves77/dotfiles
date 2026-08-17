-- Rollback for migration 264: result_content -> result_content_excerpt.
--
-- The exact inverse, with the same anchor discipline in the same direction. Renaming the column back
-- without rebuilding validate_item_provenance would leave the gate referencing result_content, which
-- would no longer exist — the identical latent failure migration 264 exists to avoid, just mirrored.
--
-- NOTE ON SCOPE. This restores the DB. It does NOT revert the application sweep (51 references across
-- 15 live files). Per the code-vs-data state separation rule, those are separate stores with separate
-- change mechanisms: revert the code commit to match, or this rollback leaves deployed code reading a
-- column name that no longer exists.

-- ATOMICITY. No explicit BEGIN/COMMIT: a DO block executes as a SINGLE SQL statement, so the rename
-- and the function rebuild either both land or both roll back, and any RAISE inside undoes the whole
-- thing. Explicit transaction control is also omitted so that the text committed here is byte-identical
-- to what apply_migration runs (apply_migration supplies its own transaction; a nested BEGIN would
-- warn and the COMMIT would close the outer one).

DO $rb$
DECLARE
  v_def_before      text;
  v_def_after       text;
  v_verified_before bigint;
  v_verified_after  bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='agent_run_searches'
                   AND column_name='result_content') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='agent_run_searches'
                 AND column_name='result_content_excerpt') THEN
      RAISE NOTICE 'rollback 264: already rolled back — no-op';
      RETURN;
    END IF;
    RAISE EXCEPTION 'rollback 264: NEITHER column exists on agent_run_searches — refusing to guess';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def_before
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='validate_item_provenance';

  IF v_def_before IS NULL THEN
    RAISE EXCEPTION 'rollback 264: public.validate_item_provenance not found';
  END IF;
  IF position('result_content' in v_def_before) = 0 THEN
    RAISE EXCEPTION 'rollback 264: ANCHOR ABSENT — validate_item_provenance does not reference result_content; refusing to guess.';
  END IF;

  SELECT count(*) INTO v_verified_before
  FROM public.intelligence_items WHERE provenance_status='verified';

  ALTER TABLE public.agent_run_searches RENAME COLUMN result_content TO result_content_excerpt;
  EXECUTE replace(v_def_before, 'result_content', 'result_content_excerpt');

  SELECT pg_get_functiondef(p.oid) INTO v_def_after
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='validate_item_provenance';

  IF position('result_content_excerpt' in v_def_after) = 0 THEN
    RAISE EXCEPTION 'rollback 264: validate_item_provenance does not reference result_content_excerpt after rebuild';
  END IF;

  SELECT count(*) INTO v_verified_after
  FROM public.intelligence_items WHERE provenance_status='verified';
  IF v_verified_after <> v_verified_before THEN
    RAISE EXCEPTION 'rollback 264: verified-item count moved % -> % across a pure rename — aborting', v_verified_before, v_verified_after;
  END IF;

  RAISE NOTICE 'rollback 264: restored result_content_excerpt; gate rebuilt; verified items unchanged at %', v_verified_after;
END $rb$;
