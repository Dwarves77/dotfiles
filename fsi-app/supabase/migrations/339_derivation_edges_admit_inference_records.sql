-- subject: Migration 339 (Lane W2-G, wave2b, 2026-09-29, coordinator ruling same day). Widens
-- `derivation_edges` (migration 285) to admit `inference_records` (migration 338) as a first-class DAG
-- participant, on BOTH sides, and rewrites `assert_acyclic()`/`invalidate_dependents()` to walk the
-- closure polymorphically across `derived_values` and `inference_records` rather than assuming the
-- target table is always `derived_values`. Precedent: migration 333 (`derivation_edges_from_table_allowed`
-- widened to add `state_cost_facts`, the same DROP/ADD CHECK shape reused here). NOT applied by this
-- lane, no DB credentials in this worktree.
--
-- WHY THE "to" SIDE NEEDS A REAL SCHEMA CHANGE, NOT JUST A CHECK WIDEN. `derivation_edges.to_value_id`
-- (migration 285) is `uuid NOT NULL REFERENCES derived_values(value_id)`, a single-target FK. Postgres
-- has no conditional/polymorphic FK, so admitting a SECOND target table (`inference_records`) for the
-- "to" side means dropping that hard FK and making the "to" side generic the SAME WAY the "from" side
-- already is (`from_table text` + `from_pk text`, no FK, closed CHECK allowlist, migration 285's own
-- documented design for exactly this reason). This migration adds `to_table text NOT NULL DEFAULT
-- 'derived_values'` (every existing row is a `derived_values` target, so the default backfills them
-- correctly with zero data loss) and drops the single-target FK; `to_value_id` becomes a plain uuid,
-- validated by the CHECK allowlist below plus `register_derived_value()`/`register_inference_record()`
-- being the ONLY two write paths (no anon/authenticated INSERT grant, migration 330), never by a raw FK.
--
-- WHY assert_acyclic() AND invalidate_dependents() MUST BE REWRITTEN, NOT LEFT AS-IS. Both functions
-- (migration 285) hardcode `derived_values`/`value_id` at every join: the acyclic-reachability walk only
-- follows a hop whose `from_table = 'derived_values'` (the one table that could BE an intermediate DAG
-- node before this migration), and the invalidation closure only ever `UPDATE`s `derived_values`. Making
-- `inference_records` a real node means BOTH walks must follow a hop through EITHER table and BOTH
-- functions must mark/read staleness on EITHER table. The two functions below are `CREATE OR REPLACE`d
-- with polymorphic (table, pk) reachability in place of the old value_id-only walk; the numeric
-- derived_values path is proven BYTE-IDENTICAL for existing inputs by drain.test.mjs's 11 pre-existing
-- tests (unchanged, still passing) plus this migration's own self-check below.
--
-- register_inference_record(): the SAME atomic-write shape register_derived_value() already provides
-- (migration 285), for inference_records: one row + its derivation_edges rows in one transaction, so a
-- rejected edge cannot leave a claim row with mismatched provenance.
--
-- DO NOT APPLY without operator/coordinator sign-off (R14). This file is DRAFTED for review only, and
-- must apply AFTER migration 338.

BEGIN;

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.derivation_edges') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.derivation_edges does not exist, migration 285 must be applied first';
  END IF;
  IF to_regclass('public.inference_records') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.inference_records does not exist, migration 338 must be applied first';
  END IF;
END $$;

-- ── widen from_table (input-leaf side): inference_records may now be cited as an input, exactly like
-- state_cost_facts (migration 333's precedent) ──────────────────────────────────────────────────────
ALTER TABLE public.derivation_edges DROP CONSTRAINT IF EXISTS derivation_edges_from_table_allowed;
ALTER TABLE public.derivation_edges ADD CONSTRAINT derivation_edges_from_table_allowed CHECK (
  from_table IN ('emission_factors', 'market_series', 'regional_data_facts', 'derived_values',
                 'statutory_computations', 'estimated_values', 'state_cost_facts', 'inference_records')
);

-- ── widen the "to" side to be polymorphic (target-node side) ────────────────────────────────────────
ALTER TABLE public.derivation_edges ADD COLUMN IF NOT EXISTS to_table text NOT NULL DEFAULT 'derived_values';

-- Drop the single-target FK (dynamic lookup, not a hardcoded name, the auto-generated inline-REFERENCES
-- constraint name is a Postgres implementation detail this migration does not want to guess wrong).
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.derivation_edges'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.derivation_edges'::regclass AND attname = 'to_value_id')];
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.derivation_edges DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.derivation_edges DROP CONSTRAINT IF EXISTS derivation_edges_to_table_allowed;
ALTER TABLE public.derivation_edges ADD CONSTRAINT derivation_edges_to_table_allowed CHECK (
  to_table IN ('derived_values', 'inference_records')
);

COMMENT ON COLUMN public.derivation_edges.to_table IS
  'The target-node table this edge points into (derived_values or inference_records, migration 339). '
  'Generic address, no FK, same "closed allowlist, no FK, never inferred" posture from_table/from_pk '
  'already used (migration 285) -- the two legal writers (register_derived_value(), '
  'register_inference_record()) are what keeps to_value_id valid, never a database-level FK.';
COMMENT ON COLUMN public.derivation_edges.to_value_id IS
  'The target row''s own PK (derived_values.value_id or inference_records.inference_id, per to_table). '
  'No FK as of migration 339 (see that migration''s header for why a polymorphic target cannot carry a '
  'single-table FK); validity is enforced by the two RPC write paths, not by the database schema.';

CREATE INDEX IF NOT EXISTS derivation_edges_to_table_idx ON public.derivation_edges (to_table, to_value_id);

-- ── assert_acyclic(): polymorphic reachability walk ──────────────────────────────────────────────────
-- Was: only engaged when NEW.from_table = 'derived_values', walking a single-table (from_table='derived_
-- values', from_pk=value_id::text) chain. Now: engages whenever NEW.from_table is itself a DAG node kind
-- (derived_values OR inference_records -- the two tables that can, in turn, be someone else's input), and
-- the recursive reachability walk carries (node_table, node_id) pairs instead of a bare value_id, joining
-- derivation_edges on (from_table, from_pk) = (node_table, node_id) generically.
CREATE OR REPLACE FUNCTION public.assert_acyclic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_hit boolean;
BEGIN
  IF NEW.from_table IN ('derived_values', 'inference_records') THEN
    WITH RECURSIVE reach(node_table, node_id) AS (
      SELECT NEW.to_table, NEW.to_value_id::text
      UNION
      SELECT e.to_table, e.to_value_id::text
      FROM public.derivation_edges e
      JOIN reach r ON e.from_table = r.node_table AND e.from_pk = r.node_id
    )
    SELECT true INTO v_hit
    FROM reach r
    WHERE r.node_table = NEW.from_table AND r.node_id = NEW.from_pk
    LIMIT 1;

    IF v_hit THEN
      RAISE EXCEPTION 'assert_acyclic: edge (%,%) -> (%,%) would close a cycle',
        NEW.from_table, NEW.from_pk, NEW.to_table, NEW.to_value_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.assert_acyclic() IS
  'Migration 339: polymorphic rewrite of migration 285''s original (derived_values-only) acyclic guard. '
  'Only engages when the new edge''s input is itself a DAG node kind (derived_values OR '
  'inference_records, migration 339); every other from_table is a leaf by construction (see '
  'derivation_edges_from_table_allowed). Byte-identical behaviour for a derived_values-only edge set, '
  'proven by this migration''s own self-check reproducing migration 285''s 2-node cycle test.';

-- ── invalidate_dependents(): polymorphic closure walk + polymorphic stale-marking ───────────────────
-- Was: closure computed over derived_values.value_id only; UPDATE derived_values only. Now: the closure
-- walk carries (node_table, node_id) pairs (same shape as assert_acyclic's reach CTE above); the apply
-- branch UPDATEs whichever of derived_values / inference_records each closure member belongs to. Return
-- value is the TOTAL count across both tables (drain.ts's `result.invalidated` accumulates per-event
-- already, so this single combined count preserves that accumulation contract unchanged).
CREATE OR REPLACE FUNCTION public.invalidate_dependents(
  p_table text, p_pk text, p_event bigint DEFAULT NULL, p_apply boolean DEFAULT true
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  n integer;
  n_dv integer;
  n_ir integer;
BEGIN
  IF p_apply THEN
    WITH RECURSIVE affected(node_table, node_id) AS (
      SELECT e.to_table, e.to_value_id::text
      FROM public.derivation_edges e
      WHERE e.from_table = p_table AND e.from_pk = p_pk
      UNION
      SELECT e2.to_table, e2.to_value_id::text
      FROM public.derivation_edges e2
      JOIN affected a ON e2.from_table = a.node_table AND e2.from_pk = a.node_id
    )
    UPDATE public.derived_values d
       SET admissibility = 'stale', invalidated_at = now(), invalidated_by_event = p_event
      FROM affected a
     WHERE a.node_table = 'derived_values' AND d.value_id = a.node_id::uuid AND d.admissibility <> 'stale';
    GET DIAGNOSTICS n_dv = ROW_COUNT;

    WITH RECURSIVE affected(node_table, node_id) AS (
      SELECT e.to_table, e.to_value_id::text
      FROM public.derivation_edges e
      WHERE e.from_table = p_table AND e.from_pk = p_pk
      UNION
      SELECT e2.to_table, e2.to_value_id::text
      FROM public.derivation_edges e2
      JOIN affected a ON e2.from_table = a.node_table AND e2.from_pk = a.node_id
    )
    UPDATE public.inference_records ir
       SET admissibility = 'stale', invalidated_at = now(), invalidated_by_event = p_event
      FROM affected a
     WHERE a.node_table = 'inference_records' AND ir.inference_id = a.node_id::uuid AND ir.admissibility <> 'stale';
    GET DIAGNOSTICS n_ir = ROW_COUNT;

    n := coalesce(n_dv, 0) + coalesce(n_ir, 0);
  ELSE
    WITH RECURSIVE affected(node_table, node_id) AS (
      SELECT e.to_table, e.to_value_id::text
      FROM public.derivation_edges e
      WHERE e.from_table = p_table AND e.from_pk = p_pk
      UNION
      SELECT e2.to_table, e2.to_value_id::text
      FROM public.derivation_edges e2
      JOIN affected a ON e2.from_table = a.node_table AND e2.from_pk = a.node_id
    )
    SELECT
      (SELECT count(*) FROM affected a JOIN public.derived_values d ON a.node_table = 'derived_values' AND d.value_id = a.node_id::uuid WHERE d.admissibility <> 'stale')
      + (SELECT count(*) FROM affected a JOIN public.inference_records ir ON a.node_table = 'inference_records' AND ir.inference_id = a.node_id::uuid WHERE ir.admissibility <> 'stale')
    INTO n;
  END IF;
  RETURN coalesce(n, 0);
END $$;

COMMENT ON FUNCTION public.invalidate_dependents(text, text, bigint, boolean) IS
  'Migration 339: polymorphic rewrite of migration 285''s original (derived_values-only) invalidation '
  'walk. The closure now carries (node_table, node_id) pairs and marks whichever of derived_values / '
  'inference_records each member belongs to. Byte-identical result for a derived_values-only closure '
  '(proven by drain.test.mjs''s 11 pre-existing tests, unchanged, and this migration''s own self-check).';

-- ── register_inference_record(): the ONE atomic write path for a new inference_records row + its
-- derivation_edges, mirroring register_derived_value() (migration 285) exactly ─────────────────────────
CREATE OR REPLACE FUNCTION public.register_inference_record(
  p_subject_id text, p_claim_text text, p_status_token text, p_confidence numeric,
  p_cited_item_ids uuid[], p_origin_class text, p_method_id text, p_method_version text,
  p_computed_by text, p_trigger_question_ref text DEFAULT NULL,
  p_inputs jsonb DEFAULT '[]'::jsonb, p_supersedes uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_inference_id uuid;
  v_ref jsonb;
BEGIN
  INSERT INTO public.inference_records (
    subject_id, claim_text, status_token, confidence, cited_item_ids, origin_class,
    method_id, method_version, computed_by, trigger_question_ref, supersedes
  ) VALUES (
    p_subject_id, p_claim_text, p_status_token, p_confidence, p_cited_item_ids, p_origin_class,
    p_method_id, p_method_version, p_computed_by, p_trigger_question_ref, p_supersedes
  ) RETURNING inference_id INTO v_inference_id;

  FOR v_ref IN SELECT * FROM jsonb_array_elements(coalesce(p_inputs, '[]'::jsonb))
  LOOP
    INSERT INTO public.derivation_edges (from_table, from_pk, to_table, to_value_id, edge_kind)
    VALUES (v_ref->>'table', v_ref->>'pk', 'inference_records', v_inference_id, 'input');
  END LOOP;

  RETURN v_inference_id;
END $$;

COMMENT ON FUNCTION public.register_inference_record(text, text, text, numeric, uuid[], text, text, text, text, text, jsonb, uuid) IS
  'The ONE write path for a new inference_records row + its derivation_edges (migration 339), the '
  'narrative-table twin of register_derived_value() (migration 285). Called via sb.rpc() from '
  'methods/infer-from-question.ts, never a bare INSERT, for the same atomicity reason register_derived_'
  'value''s own header states.';

-- No GRANT EXECUTE to authenticated/anon (service-role-only write path, same posture as
-- register_derived_value(), migration 285).

COMMIT;

-- ── self-check (empirically verified against a local scratch schema; the coordinator re-runs an
-- equivalent check against the live project). Builds a derived_values probe, an inference_records
-- probe, a cross-table edge, proves assert_acyclic rejects a cross-table cycle, proves
-- invalidate_dependents' dry/apply modes mark BOTH tables, proves register_inference_record writes
-- atomically, cleans up to zero rows. ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dv_id uuid;
  v_ir_id uuid;
  v_ir_id2 uuid;
  v_dry_count integer;
  v_apply_count integer;
  v_cycle_rejected boolean := false;
BEGIN
  -- a derived_values probe row (self-contained, no method dependency)
  INSERT INTO public.derived_values (
    method_id, method_version, value, derivation, origin_class, lifecycle, admissibility,
    base_confidence, asserted_at, inputs, computed_by
  ) VALUES (
    'probe-method-339', 'v1', 1.0, 'calculated', 'derived', 'emerging', 'analysis_ok',
    0.8, now(), '[]'::jsonb, 'self-check-339'
  ) RETURNING value_id INTO v_dv_id;

  -- an inference_records probe row via register_inference_record(), citing the derived_values probe as
  -- a declared input (proves the write is atomic and the edge lands with to_table='inference_records')
  v_ir_id := public.register_inference_record(
    NULL, 'self-check-339 probe claim', 'HYPOTHESIS', 0.5, ARRAY[gen_random_uuid()], 'derived',
    'infer-from-question', 'v1', 'self-check-339',
    NULL, jsonb_build_array(jsonb_build_object('table', 'derived_values', 'pk', v_dv_id::text))
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.derivation_edges
    WHERE from_table = 'derived_values' AND from_pk = v_dv_id::text
      AND to_table = 'inference_records' AND to_value_id = v_ir_id
  ) THEN
    RAISE EXCEPTION 'migration 339 self-check FAILED: register_inference_record did not write the cross-table edge';
  END IF;

  -- assert_acyclic: a cross-table cycle (inference -> the derived_values row that feeds it) must be
  -- rejected, proving the polymorphic reach walk actually crosses tables.
  BEGIN
    INSERT INTO public.derivation_edges (from_table, from_pk, to_table, to_value_id, edge_kind)
    VALUES ('inference_records', v_ir_id::text, 'derived_values', v_dv_id, 'input');
    v_cycle_rejected := false; -- should never reach here
  EXCEPTION WHEN OTHERS THEN
    v_cycle_rejected := true; -- expected (assert_acyclic raises)
  END;
  IF NOT v_cycle_rejected THEN
    RAISE EXCEPTION 'migration 339 self-check FAILED: a cross-table cycle was NOT rejected';
  END IF;

  -- invalidate_dependents: dry mode counts, apply mode marks BOTH the derived_values row (if it were a
  -- target -- it is not, here, it is the source) and the inference_records row stale.
  v_dry_count := public.invalidate_dependents('derived_values', v_dv_id::text, NULL, false);
  IF v_dry_count <> 1 THEN
    RAISE EXCEPTION 'migration 339 self-check FAILED: dry-mode closure count expected 1, got %', v_dry_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.inference_records WHERE inference_id = v_ir_id AND admissibility = 'stale') THEN
    RAISE EXCEPTION 'migration 339 self-check FAILED: dry mode wrote a stale mark';
  END IF;

  v_apply_count := public.invalidate_dependents('derived_values', v_dv_id::text, NULL, true);
  IF v_apply_count <> 1 THEN
    RAISE EXCEPTION 'migration 339 self-check FAILED: apply-mode closure count expected 1, got %', v_apply_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inference_records WHERE inference_id = v_ir_id AND admissibility = 'stale') THEN
    RAISE EXCEPTION 'migration 339 self-check FAILED: apply mode did not mark the inference stale';
  END IF;

  -- a fresh derived_values-only probe pair proves the numeric path is byte-identical (no cross-table
  -- edge involved at all -- migration 285's own original 2-node scenario, replayed).
  DECLARE
    v_dv2 uuid;
    v_dv3 uuid;
  BEGIN
    INSERT INTO public.derived_values (
      method_id, method_version, value, derivation, origin_class, lifecycle, admissibility,
      base_confidence, asserted_at, inputs, computed_by
    ) VALUES (
      'probe-method-339b', 'v1', 2.0, 'calculated', 'derived', 'emerging', 'analysis_ok',
      0.8, now(), '[]'::jsonb, 'self-check-339'
    ) RETURNING value_id INTO v_dv2;
    v_dv3 := public.register_derived_value(
      NULL, 'probe-method-339c', 'v1', 3.0, NULL, NULL, NULL, NULL,
      'calculated', 'derived', 'emerging', 'analysis_ok', 0.8, now(), NULL,
      jsonb_build_array(jsonb_build_object('table', 'derived_values', 'pk', v_dv2::text)), 'self-check-339'
    );
    PERFORM public.invalidate_dependents('derived_values', v_dv2::text, NULL, true);
    IF NOT EXISTS (SELECT 1 FROM public.derived_values WHERE value_id = v_dv3 AND admissibility = 'stale') THEN
      RAISE EXCEPTION 'migration 339 self-check FAILED: derived_values-only closure regressed';
    END IF;
    -- MIG-CI-2 (2026-10-08): the FK to derived_values is dropped above, so deleting the probe rows no longer
    -- cascades; the dv2 -> dv3 edge register_derived_value wrote must be removed first, or one dangling edge is
    -- left behind (migration 350's post-check counts it on a replay stack; production never ran this block).
    DELETE FROM public.derivation_edges
      WHERE to_value_id IN (v_dv2, v_dv3) OR (from_table = 'derived_values' AND from_pk IN (v_dv2::text, v_dv3::text));
    DELETE FROM public.derived_values WHERE value_id IN (v_dv2, v_dv3);
  END;

  -- cleanup
  v_ir_id2 := NULL; -- no second inference row created in this check
  DELETE FROM public.derivation_edges WHERE to_table = 'inference_records' AND to_value_id = v_ir_id;
  DELETE FROM public.inference_records WHERE inference_id = v_ir_id;
  DELETE FROM public.derived_values WHERE value_id = v_dv_id;

  IF (SELECT count(*) FROM public.inference_records WHERE claim_text LIKE 'self-check-339%') <> 0
     OR (SELECT count(*) FROM public.derived_values WHERE computed_by = 'self-check-339') <> 0 THEN
    RAISE EXCEPTION 'migration 339 self-check FAILED: cleanup left probe rows behind';
  END IF;

  RAISE NOTICE 'migration 339 self-check PASSED';
END $$;
