-- Migration 264 (2026-08-17): rename agent_run_searches.result_content_excerpt -> result_content.
--
-- WHY. The name asserts a truncation that ADR-016 forbids. That column is not an excerpt: it is the
-- FULL captured source content, and the whole grounding pool reads from it — validate_item_provenance
-- criterion 3 checks every FACT's source_span verbatim against it, and canonical-pipeline gates
-- usability at >200 chars. A name that says "excerpt" invites exactly the change ADR-016 refused: a
-- Cowork agent proposed capping this column at 2,000 chars, and the name was part of why that looked
-- reasonable. Renaming it is cheap; the standing invitation to slice it is not.
--
-- The new name matches the table's existing vocabulary — result_url, result_title, result_index,
-- result_content — and carries no adjective that can age badly.
--
-- ONE DB DEPENDENCY, verified live before authoring (not estimated):
--   functions referencing the column ...... 1  (public.validate_item_provenance)
--   views / matviews ...................... 0
--   indexes / constraints / RLS policies .. 0
-- Two functions CALL validate_item_provenance (set_provenance_status, gate_a_health_compute) but
-- neither names the column, so recreating the one function covers them.
--
-- THE HAZARD THIS MIGRATION EXISTS TO HANDLE. Postgres stores function bodies as TEXT. ALTER TABLE
-- ... RENAME COLUMN does NOT rewrite them and does NOT refuse the rename. So a bare rename leaves
-- validate_item_provenance referencing a column that no longer exists, and it fails only when next
-- CALLED — i.e. on the next write to intelligence_items, as a runtime error inside the provenance
-- gate. The rename and the function recreation therefore happen in ONE transaction, and the
-- function is rebuilt from its OWN pg_get_functiondef with a text substitution rather than a
-- hand-transcribed body (the migration-217 pattern): transcribing the gate by hand is how a
-- correctness-critical function silently drifts.
--
-- ANCHOR-VERIFIED + ZERO-FLIP. The DO block asserts the anchor exists before replacing anything
-- (if the function has drifted and no longer references the column, it RAISES rather than guessing),
-- and asserts afterwards that the new definition references the new name and NOT the old one. The
-- verified-item count is captured before and re-asserted after: this migration must not flip a
-- single item's provenance_status in either direction. It is a rename, not a semantic change.
--
-- REVERSIBLE: rollbacks/264_rename_result_content_excerpt_rollback.sql performs the exact inverse.

-- ATOMICITY. No explicit BEGIN/COMMIT: a DO block executes as a SINGLE SQL statement, so the rename
-- and the function rebuild either both land or both roll back, and any RAISE inside undoes the whole
-- thing. Explicit transaction control is also omitted so that the text committed here is byte-identical
-- to what apply_migration runs (apply_migration supplies its own transaction; a nested BEGIN would
-- warn and the COMMIT would close the outer one).

DO $mig$
DECLARE
  v_def_before      text;
  v_def_after       text;
  v_verified_before bigint;
  v_verified_after  bigint;
  v_old_col_exists  boolean;
BEGIN
  -- ── preconditions ────────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='agent_run_searches'
      AND column_name='result_content_excerpt'
  ) INTO v_old_col_exists;

  IF NOT v_old_col_exists THEN
    -- Idempotent no-op if already applied, but ONLY if the new column is actually there.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='agent_run_searches'
                 AND column_name='result_content') THEN
      RAISE NOTICE 'migration 264: already applied (result_content present, result_content_excerpt absent) — no-op';
      RETURN;
    END IF;
    RAISE EXCEPTION 'migration 264: NEITHER result_content_excerpt NOR result_content exists on agent_run_searches — refusing to guess what happened to the grounding pool';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def_before
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='validate_item_provenance';

  IF v_def_before IS NULL THEN
    RAISE EXCEPTION 'migration 264: public.validate_item_provenance not found — the provenance gate is the one dependency of this column and it must exist before the rename';
  END IF;

  -- The anchor. If the gate no longer mentions the column, something changed that this migration
  -- was not written against, and silently renaming would leave the gate reading a stale shape.
  IF position('result_content_excerpt' in v_def_before) = 0 THEN
    RAISE EXCEPTION 'migration 264: ANCHOR ABSENT — validate_item_provenance does not reference result_content_excerpt. The function drifted from what this migration was authored against; refusing to guess.';
  END IF;

  SELECT count(*) INTO v_verified_before
  FROM public.intelligence_items WHERE provenance_status='verified';

  -- ── the rename ───────────────────────────────────────────────────────────
  ALTER TABLE public.agent_run_searches RENAME COLUMN result_content_excerpt TO result_content;

  -- ── rebuild the gate from its own definition, never by hand ──────────────
  EXECUTE replace(v_def_before, 'result_content_excerpt', 'result_content');

  -- ── postconditions ───────────────────────────────────────────────────────
  SELECT pg_get_functiondef(p.oid) INTO v_def_after
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='validate_item_provenance';

  IF position('result_content_excerpt' in v_def_after) <> 0 THEN
    RAISE EXCEPTION 'migration 264: validate_item_provenance STILL references result_content_excerpt after rebuild — the gate would fail on next call';
  END IF;
  IF position('result_content' in v_def_after) = 0 THEN
    RAISE EXCEPTION 'migration 264: validate_item_provenance references NEITHER column name after rebuild — refusing to leave the provenance gate in an unknown state';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='agent_run_searches'
               AND column_name='result_content_excerpt') THEN
    RAISE EXCEPTION 'migration 264: old column still present after rename';
  END IF;

  -- Zero-flip: a rename must not move a single item across the provenance line.
  SELECT count(*) INTO v_verified_after
  FROM public.intelligence_items WHERE provenance_status='verified';

  IF v_verified_after <> v_verified_before THEN
    RAISE EXCEPTION 'migration 264: verified-item count moved % -> % across a pure rename — aborting', v_verified_before, v_verified_after;
  END IF;

  RAISE NOTICE 'migration 264: renamed result_content_excerpt -> result_content; validate_item_provenance rebuilt; verified items unchanged at %', v_verified_after;
END $mig$;
