-- subject: Migration 374 (lane MIG-374, 2026-10-08): the two schema items owed by earlier lanes. A GIN index on inference_records.cited_item_ids for the customer containment read (cited_item_ids @> ARRAY[item]), and signposts.lifecycle_applied_at timestamptz, the record that a fired signpost's assessment lifecycle update was made, which lets src/lib/learning/prediction-scoring.mjs retry a failed lifecycle transition exactly once instead of skipping it or advancing it twice; NOT APPLIED.
-- 374 -- GIN index on inference_records.cited_item_ids, and signposts.lifecycle_applied_at (lane MIG-374, 2026-10-08).
--
-- NOT APPLIED. Authored by lane MIG-374; the coordinator's executor applies it. Two-track policy (CLAUDE.md standing
-- rule 3): this is schema DDL, so it applies via the Supabase CLI BEFORE the dependent code relies on it. The code in
-- this PR (src/lib/learning/prediction-scoring.mjs) tolerates the column being absent: until this is applied the
-- firing still moves the assessment lifecycle, the stamp and the repair are skipped and counted
-- (lifecycle_skipped_column_absent), and nothing fails.
--
-- (a) THE INDEX. Owed by lane P2-GRADE (docs/ops/session-log.d/2026-10-05-p2-grade-inference-chips.md, "Owed"): the
-- customer detail read filters inference_records with `.contains("cited_item_ids", [itemId])` (src/lib/detail/
-- inference-view.mjs), which PostgREST sends as `cited_item_ids @> '{item}'`. A btree cannot serve an array
-- containment test; a GIN index on the uuid[] column can, using the default array_ops operator class, which supports
-- @>, <@, && and =. Without it that read is a sequential scan of inference_records on every item detail load.
-- It is created with the plain CREATE INDEX form. CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and
-- this file (like every migration here) is applied inside one transaction, so the concurrent form is not available;
-- the plain form takes a SHARE lock on inference_records for the duration of the build, which blocks writes to it and
-- not reads. inference_records is small and written only by the inference producer and the drain's recompute pass, so
-- the lock is short. Apply it outside a drain run.
--
-- (b) THE COLUMN. Owed by lane L4-D (docs/ops/session-log.d/2026-10-05-l4d-predictions-reliability.md, "What is NOT
-- done"). signpost-watch.ts fireSignpost fires a signpost in three separate writes: signposts.fired_at, the
-- propagation_events outbox row, then research_assessments.lifecycle_state. If the third fails, fired_at is set and the
-- lifecycle has not moved; the signpost can no longer be matched by an event (it is fired), and the repair pass in
-- prediction-scoring.mjs could score it but could not tell whether the lifecycle moved, and a `confirms` transition
-- (emerging to strengthening to corroborated) is not idempotent. lifecycle_applied_at is that record.
--   NULL      the lifecycle update for this firing has not been recorded as made.
--   not NULL  when it was made. Never cleared.
-- It is written by prediction-scoring.mjs, in two places and no other: right after fireSignpost has moved the
-- lifecycle for a firing (markLifecycleApplied), and by the repair pass after it applies nextLifecycleState to a
-- signpost found fired with the column still NULL. Both writes set it only where it is still NULL. A signpost that
-- never fired (a deadline refutation) never has it set.
--
-- EXISTING ROWS. The column is added nullable with no default and no backfill. A signpost that fired BEFORE this
-- migration reads as "fired, lifecycle not recorded as applied", so the first repair pass after it would apply
-- nextLifecycleState to that signpost's assessment a second time if the firing's own lifecycle update had in fact
-- succeeded. The self-check below counts such rows and reports the number in a NOTICE. When that number is not zero,
-- the executor decides per row set, with the assessments in view, whether to backfill
-- (`UPDATE public.signposts SET lifecycle_applied_at = fired_at WHERE fired_at IS NOT NULL AND lifecycle_applied_at IS NULL`)
-- as a data step BEFORE the next propagation drain; this file does not guess it, because it cannot tell a firing whose
-- lifecycle update failed from one that succeeded. Build mode holds data population until every layer is built
-- (operator ruling 2026-10-04), so the expected count is 0.
--
-- SELF-CHECK. The index exists on the column with the GIN access method and is valid; the column exists, is
-- timestamptz and nullable; and a NOTICE reports the count described above.
--
-- Reversible: DROP INDEX public.inference_records_cited_item_ids_gin_idx;
--             ALTER TABLE public.signposts DROP COLUMN lifecycle_applied_at;

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.inference_records') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.inference_records does not exist, migration 338 must be applied first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'inference_records' AND column_name = 'cited_item_ids'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.inference_records.cited_item_ids does not exist';
  END IF;
  IF to_regclass('public.signposts') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.signposts does not exist, migration 346 must be applied first';
  END IF;
END $$;

-- (a) the containment index (plain form: CONCURRENTLY is not available inside the apply transaction)
CREATE INDEX IF NOT EXISTS inference_records_cited_item_ids_gin_idx ON public.inference_records USING gin (cited_item_ids);

-- (b) the lifecycle record
ALTER TABLE public.signposts
  ADD COLUMN IF NOT EXISTS lifecycle_applied_at timestamptz;

COMMENT ON COLUMN public.signposts.lifecycle_applied_at IS
  'NULL until the assessment lifecycle update for this signpost''s firing has been recorded as made, then when it was made; never cleared. Set only by src/lib/learning/prediction-scoring.mjs, only where still NULL: right after fireSignpost moves research_assessments.lifecycle_state for a firing, or by the repair pass after it applies nextLifecycleState to a signpost found fired with this column NULL. The repair applies the transition only where this is NULL, so a failed lifecycle update is retried once and a succeeded one is never applied twice. A signpost that never fired never has it set.';

-- Self-check
DO $$
DECLARE
  v_am       text;
  v_valid    boolean;
  v_type     text;
  v_nullable text;
  n_legacy   bigint;
BEGIN
  SELECT am.amname, i.indisvalid INTO v_am, v_valid
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_am am ON am.oid = ic.relam
   WHERE ic.relname = 'inference_records_cited_item_ids_gin_idx'
     AND i.indrelid = 'public.inference_records'::regclass
     AND i.indnatts = 1
     AND i.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.inference_records'::regclass AND a.attname = 'cited_item_ids');
  IF v_am IS NULL THEN
    RAISE EXCEPTION 'ABORT: no index named inference_records_cited_item_ids_gin_idx on inference_records(cited_item_ids)';
  END IF;
  IF v_am <> 'gin' THEN
    RAISE EXCEPTION 'ABORT: inference_records_cited_item_ids_gin_idx uses access method %, expected gin', v_am;
  END IF;
  IF NOT v_valid THEN
    RAISE EXCEPTION 'ABORT: inference_records_cited_item_ids_gin_idx is not valid';
  END IF;

  SELECT data_type, is_nullable INTO v_type, v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'signposts' AND column_name = 'lifecycle_applied_at';
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'ABORT: signposts.lifecycle_applied_at does not exist';
  END IF;
  IF v_type <> 'timestamp with time zone' THEN
    RAISE EXCEPTION 'ABORT: signposts.lifecycle_applied_at is %, expected timestamp with time zone', v_type;
  END IF;
  IF v_nullable <> 'YES' THEN
    RAISE EXCEPTION 'ABORT: signposts.lifecycle_applied_at must be nullable (NULL means not recorded as applied)';
  END IF;

  SELECT count(*) INTO n_legacy FROM public.signposts WHERE fired_at IS NOT NULL AND lifecycle_applied_at IS NULL;

  RAISE NOTICE 'migration 374 OK: GIN index on inference_records(cited_item_ids) valid, signposts.lifecycle_applied_at present and nullable; % fired signpost(s) read as lifecycle not recorded as applied (0 expected in build mode, see EXISTING ROWS in the header)', n_legacy;
END $$;

COMMIT;
