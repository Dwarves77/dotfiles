-- subject: Migration 379 (lane S8-E6, 2026-10-08): grid_connection_queues gains per-substation demand headroom and constraint evidence (substation_ref, substation_name, demand_firm_mw, demand_available_mw, demand_constraint GREEN/AMBER/RED, demand_constraint_limiting_factor), the figure envelope (source_id to sources, origin_class, derivation, confidence_admiralty; a figure without them is refused by a CHECK), capacity_band_mw becomes nullable (a band OR a substation must be named), a UNIQUE (dso_name, substation_ref, as_of) key, and the outbox trigger propagation_outbox_trg in migration 352's form (entity = jurisdiction_id). Additive; existing rows and the existing reader are unaffected. NOT APPLIED.
-- 379 -- grid_connection_queues: substation evidence, envelope and outbox trigger (lane S8-E6, 2026-10-08).
--
-- NOT APPLIED. Authored by lane S8-E6; the coordinator's executor applies it. Two-track policy (CLAUDE.md standing rule
-- 3): schema DDL applies before the dependent code (scripts/producers/operations/ukpn-capacity-heatmap-producer.mjs) is
-- dispatched with --apply. The producer is dry by default and refuses an apply until this migration is applied.
-- Requires migrations 282 (entities), 284 and 352 (propagation_events and emit_propagation_event with its optional entity
-- column), 296 (the origin_class and derivation vocabularies, transcribed below), 297 (grid_connection_queues) and the
-- sources table. Migration 373 (lane L4-E, unmerged when this was written) redefines emit_propagation_event() as 352's
-- body plus one leg; this migration only attaches a trigger to the function by name, so it holds either way.
--
-- WHY. Spec 09 section 1.6 and the PROD-SRC register (section 1.6) found one free, CC BY 4.0 dataset that bears on the
-- demand connection queue: UK Power Networks' LTDS Capacity Heatmap. It states, per primary substation, the firm demand
-- capacity and the demand capacity still available in MW and a GREEN/AMBER/RED demand constraint with its limiting factor.
-- It states NO queue duration in months. The table as migration 297 made it (jurisdiction_id, dso_name, capacity_band_mw
-- NOT NULL, queue_months_p50/p90, as_of, obs_status) has no column for a substation, a MW headroom, a constraint, or the
-- source of any figure. [CONFIRMED by reading 297 column by column.] The brief's covered columns ("demand side MW and
-- constraint columns per substation") therefore have no home until this migration, and the lane brief's words "a column
-- the spec table defines but 296/297 omitted" do not strictly describe it: spec 09 section 1.6 defines no substation
-- columns. This is the one judgment call of the lane and is reported as such; the migration is additive and cheap to
-- refuse.
--
-- WHAT THIS DOES (all additive except the one NOT NULL relaxation).
--   1. Ten nullable columns. substation_ref (the publisher's own mRID, the stable identity of a substation row),
--      substation_name, demand_firm_mw (>= 0), demand_available_mw (NO lower bound: the publisher states -3.1 MW for a
--      RED substation, a deficit is a fact), demand_constraint (GREEN, AMBER, RED: the publisher's RAG),
--      demand_constraint_limiting_factor (free text, the publisher's vocabulary: Thermal, Voltage), source_id (uuid to
--      sources(id), the registered publisher, rule 18: the figure carries its source's rating), origin_class and
--      derivation (the shared vocabularies, transcribed from migration 296 byte for byte and drift-guarded by this
--      migration's own test), confidence_admiralty (the 296 shape guard).
--   2. capacity_band_mw DROP NOT NULL. The publisher states no connection-size band; a band is never estimated (rule 2).
--      The old invariant is kept by a CHECK: a row names a band or a substation. The old CHECK (length > 0) still holds
--      for a non-NULL band.
--   3. CHECK grid_connection_queues_demand_figure_enveloped: a row that carries a demand MW figure carries source_id,
--      origin_class and derivation (NO FIGURE SHIPS WITHOUT AN ENVELOPE, src/lib/contracts/envelope.mjs, enforced in
--      the database, not by a producer's manners).
--   4. UNIQUE (dso_name, substation_ref, as_of): one row per substation per release, so a producer re-run is idempotent.
--      NULLs are distinct in a unique constraint, so rows without a substation_ref (the migration 297 shape) are free.
--   5. The outbox trigger, rule 17 (nothing runs alone): AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW EXECUTE FUNCTION
--      emit_propagation_event('queue_id', 'jurisdiction_id'), the 352 form: the row has no entity_id column, so the
--      second argument names the column that holds the entity (a jurisdiction), used only when an entities row exists.
--      An outbox row for this table therefore names the jurisdiction (GB for the first producer) and reaches the items
--      linked to it. The new emitting table needs an entry in EMITTING_TABLE_EVENT_MAP
--      (src/lib/learning/questions-on-change.mjs), a file outside this lane's write set: reported as NEEDS WRITE-SET
--      EXPANSION, and questions-on-change.test.mjs fails on this PR until the entry lands.
--
-- WHAT THIS DOES NOT DO. queue_months_p50 and queue_months_p90 stay NULL for every row this dataset produces (no free
-- dataset found states them), with obs_status 'L' (Missing, not covered) written by the producer. The reader (GridQueuePanel) is not changed.
--
-- Reversible while no producer has written: ALTER TABLE ... DROP CONSTRAINT for the eight constraints, DROP the ten
-- columns, SET NOT NULL on capacity_band_mw (only if no NULL band exists), DROP TRIGGER propagation_outbox_trg.

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.grid_connection_queues') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.grid_connection_queues does not exist, migration 297 must be applied first';
  END IF;
  IF to_regclass('public.sources') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.sources does not exist';
  END IF;
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist, migration 282 must be applied first';
  END IF;
  IF to_regclass('public.propagation_events') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.propagation_events does not exist, migration 284 must be applied first';
  END IF;
  IF to_regprocedure('public.emit_propagation_event()') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.emit_propagation_event() does not exist, migrations 284 and 352 must be applied first';
  END IF;
  IF NOT (SELECT prosrc LIKE '%TG_ARGV[1]%' FROM pg_proc WHERE oid = 'public.emit_propagation_event()'::regprocedure) THEN
    RAISE EXCEPTION 'ABORT: emit_propagation_event() has no optional entity column argument, migration 352 must be applied first';
  END IF;
END $$;

-- 1. The ten nullable columns.
ALTER TABLE public.grid_connection_queues
  ADD COLUMN IF NOT EXISTS substation_ref text,
  ADD COLUMN IF NOT EXISTS substation_name text,
  ADD COLUMN IF NOT EXISTS demand_firm_mw numeric,
  ADD COLUMN IF NOT EXISTS demand_available_mw numeric,
  ADD COLUMN IF NOT EXISTS demand_constraint text,
  ADD COLUMN IF NOT EXISTS demand_constraint_limiting_factor text,
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.sources(id),
  ADD COLUMN IF NOT EXISTS origin_class text,
  ADD COLUMN IF NOT EXISTS derivation text,
  ADD COLUMN IF NOT EXISTS confidence_admiralty text;

COMMENT ON COLUMN public.grid_connection_queues.substation_ref IS
  'The publisher''s own identifier for the substation row (UK Power Networks heatmap mRID). The stable identity of a '
  'per-substation observation; NULL for a migration 297 shape row (a band-level queue observation).';
COMMENT ON COLUMN public.grid_connection_queues.substation_name IS
  'The substation name as the publisher states it (e.g. "Aberdeen Pl A 11kV"). NULL for a band-level row.';
COMMENT ON COLUMN public.grid_connection_queues.demand_firm_mw IS
  'Firm demand capacity of the substation in MW, as published (observed). NULL when the row does not state it.';
COMMENT ON COLUMN public.grid_connection_queues.demand_available_mw IS
  'Demand capacity still available at the substation in MW, as published (observed). May be NEGATIVE: the publisher '
  'states a deficit for a RED substation, and a deficit is a fact, not an error. This is HEADROOM, not a queue duration.';
COMMENT ON COLUMN public.grid_connection_queues.demand_constraint IS
  'The publisher''s demand constraint indicator for the substation: GREEN, AMBER or RED, verbatim.';
COMMENT ON COLUMN public.grid_connection_queues.demand_constraint_limiting_factor IS
  'The publisher''s stated limiting factor for the demand constraint (e.g. Thermal, Voltage), verbatim; the '
  'publisher''s vocabulary, so no CHECK list.';
COMMENT ON COLUMN public.grid_connection_queues.source_id IS
  'sources(id): the registered publisher of the figure (rule 18: the figure carries its source''s rating). Required '
  'whenever a demand MW figure is present (grid_connection_queues_demand_figure_enveloped).';
COMMENT ON COLUMN public.grid_connection_queues.origin_class IS
  'Shared ORIGIN_CLASSES vocabulary (src/lib/contracts/vocabularies.mjs), same list as migration 296.';
COMMENT ON COLUMN public.grid_connection_queues.derivation IS
  'Shared DERIVATIONS vocabulary (src/lib/contracts/envelope.mjs), same list as migration 296.';
COMMENT ON COLUMN public.grid_connection_queues.confidence_admiralty IS
  'Admiralty pair shape (letter A-F, digit 1-6). NULL unless a rating is stated; never estimated.';

-- 2. A band is never estimated: relax NOT NULL, keep the old invariant as "a band OR a substation".
ALTER TABLE public.grid_connection_queues ALTER COLUMN capacity_band_mw DROP NOT NULL;

COMMENT ON COLUMN public.grid_connection_queues.capacity_band_mw IS
  'Connection size band the queue months apply to. NULL for a per-substation headroom row: the publisher states no '
  'band and a band is never estimated.';

-- 3. to 4. The constraints, each guarded so a re-run is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.grid_connection_queues'::regclass AND conname = 'grid_connection_queues_demand_constraint_check') THEN
    ALTER TABLE public.grid_connection_queues ADD CONSTRAINT grid_connection_queues_demand_constraint_check
      CHECK (demand_constraint IS NULL OR demand_constraint IN ('GREEN','AMBER','RED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.grid_connection_queues'::regclass AND conname = 'grid_connection_queues_demand_firm_nonneg') THEN
    ALTER TABLE public.grid_connection_queues ADD CONSTRAINT grid_connection_queues_demand_firm_nonneg
      CHECK (demand_firm_mw IS NULL OR demand_firm_mw >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.grid_connection_queues'::regclass AND conname = 'grid_connection_queues_origin_class_check') THEN
    ALTER TABLE public.grid_connection_queues ADD CONSTRAINT grid_connection_queues_origin_class_check
      CHECK (origin_class IS NULL OR origin_class IN (
        'community','community-corroborated','modelled','derived','partner','verified','official'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.grid_connection_queues'::regclass AND conname = 'grid_connection_queues_derivation_check') THEN
    ALTER TABLE public.grid_connection_queues ADD CONSTRAINT grid_connection_queues_derivation_check
      CHECK (derivation IS NULL OR derivation IN (
        'statutory_fixed','statutory_formula','observed','transacted_index','assessed','calculated',
        'interpolated','modelled','estimated'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.grid_connection_queues'::regclass AND conname = 'grid_connection_queues_confidence_admiralty_shape') THEN
    ALTER TABLE public.grid_connection_queues ADD CONSTRAINT grid_connection_queues_confidence_admiralty_shape
      CHECK (confidence_admiralty IS NULL OR confidence_admiralty ~ '^[A-F][1-6]$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.grid_connection_queues'::regclass AND conname = 'grid_connection_queues_band_or_substation') THEN
    ALTER TABLE public.grid_connection_queues ADD CONSTRAINT grid_connection_queues_band_or_substation
      CHECK (capacity_band_mw IS NOT NULL OR substation_ref IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.grid_connection_queues'::regclass AND conname = 'grid_connection_queues_demand_figure_enveloped') THEN
    ALTER TABLE public.grid_connection_queues ADD CONSTRAINT grid_connection_queues_demand_figure_enveloped
      CHECK (
        (demand_firm_mw IS NULL AND demand_available_mw IS NULL)
        OR (source_id IS NOT NULL AND origin_class IS NOT NULL AND derivation IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.grid_connection_queues'::regclass AND conname = 'grid_connection_queues_substation_key') THEN
    ALTER TABLE public.grid_connection_queues ADD CONSTRAINT grid_connection_queues_substation_key
      UNIQUE (dso_name, substation_ref, as_of);
  END IF;
END $$;

-- 5. The outbox trigger, migration 352's form: the entity is read from jurisdiction_id.
DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.grid_connection_queues;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.grid_connection_queues
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('queue_id', 'jurisdiction_id');

-- Self-check, with nothing surviving it (the sentinel exception rolls the inner block back). Attacks, not presence:
-- a figure without its envelope, an unknown constraint, a duplicate key, a row naming neither band nor substation.
DO $$
DECLARE
  n_cols     int;
  n_args     int;
  n_ev_before bigint;
  n_ev_after  bigint;
  n_rows_before bigint;
  n_rows_after  bigint;
  ok_jur     text := 'cl:jurisdiction:00000000000003f9';
  v_src      uuid;
  v_ent      text;
  v_pk       text;
  rejected   boolean;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'grid_connection_queues';
  IF n_cols <> 19 THEN RAISE EXCEPTION 'ABORT: grid_connection_queues has % columns, expected 19 (9 from 297 plus 10)', n_cols; END IF;

  SELECT t.tgnargs INTO n_args FROM pg_trigger t
   WHERE t.tgname = 'propagation_outbox_trg' AND t.tgrelid = 'public.grid_connection_queues'::regclass AND NOT t.tgisinternal;
  IF n_args IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'ABORT: grid_connection_queues outbox trigger has % arguments, expected 2', n_args;
  END IF;

  SELECT count(*) INTO n_ev_before FROM public.propagation_events;
  SELECT count(*) INTO n_rows_before FROM public.grid_connection_queues;

  BEGIN
    INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (ok_jur, 'jurisdiction', 'migration 379 self-check jurisdiction');

    -- (a) a band-level row (the 297 shape) is still accepted, and its outbox row names the jurisdiction
    INSERT INTO public.grid_connection_queues (jurisdiction_id, dso_name, capacity_band_mw, queue_months_p50, queue_months_p90, as_of)
      VALUES (ok_jur, 'selfcheck DSO', '1-5MW', 10, 20, '2026-09-01')
      RETURNING queue_id::text INTO v_pk;
    SELECT entity_id INTO v_ent FROM public.propagation_events
     WHERE table_name = 'grid_connection_queues' AND row_pk = v_pk AND change_kind = 'insert';
    IF v_ent IS DISTINCT FROM ok_jur THEN
      RAISE EXCEPTION 'ABORT: the outbox row for a grid_connection_queues insert did not name the jurisdiction (got %)', v_ent;
    END IF;

    -- (b) ATTACK: a demand MW figure with no source, origin_class or derivation is refused
    rejected := false;
    BEGIN
      INSERT INTO public.grid_connection_queues (jurisdiction_id, dso_name, substation_ref, demand_available_mw, as_of)
        VALUES (ok_jur, 'selfcheck DSO', 'sub-b', 5, '2026-09-01');
    EXCEPTION WHEN check_violation THEN
      rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'ABORT: a demand MW figure without its envelope was accepted'; END IF;

    -- (c) ATTACK: an unknown constraint value is refused
    rejected := false;
    BEGIN
      INSERT INTO public.grid_connection_queues (jurisdiction_id, dso_name, substation_ref, demand_constraint, as_of)
        VALUES (ok_jur, 'selfcheck DSO', 'sub-c', 'PURPLE', '2026-09-01');
    EXCEPTION WHEN check_violation THEN
      rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'ABORT: an unknown demand_constraint was accepted'; END IF;

    -- (d) ATTACK: a row naming neither a band nor a substation is refused
    rejected := false;
    BEGIN
      INSERT INTO public.grid_connection_queues (jurisdiction_id, dso_name, as_of)
        VALUES (ok_jur, 'selfcheck DSO', '2026-09-01');
    EXCEPTION WHEN check_violation THEN
      rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'ABORT: a row with neither a band nor a substation was accepted'; END IF;

    -- (e) a substation row with a negative headroom and its envelope is accepted (needs one sources row), and a
    --     duplicate of it is refused by the unique key
    SELECT id INTO v_src FROM public.sources LIMIT 1;
    IF v_src IS NULL THEN
      RAISE NOTICE 'migration 379 self-check: no sources row on this database, leg (e) skipped';
    ELSE
      INSERT INTO public.grid_connection_queues
        (jurisdiction_id, dso_name, substation_ref, substation_name, demand_firm_mw, demand_available_mw, demand_constraint,
         demand_constraint_limiting_factor, source_id, origin_class, derivation, obs_status, as_of)
        VALUES (ok_jur, 'selfcheck DSO', 'sub-e', 'Selfcheck 11kV', 45.7, -3.1, 'RED', 'Thermal', v_src, 'official', 'observed', 'L', '2026-09-01');
      rejected := false;
      BEGIN
        INSERT INTO public.grid_connection_queues (jurisdiction_id, dso_name, substation_ref, as_of)
          VALUES (ok_jur, 'selfcheck DSO', 'sub-e', '2026-09-01');
      EXCEPTION WHEN unique_violation THEN
        rejected := true;
      END;
      IF NOT rejected THEN RAISE EXCEPTION 'ABORT: a duplicate (dso_name, substation_ref, as_of) was accepted'; END IF;
    END IF;

    RAISE EXCEPTION 'm379_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'm379_selfcheck_rollback' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO n_ev_after FROM public.propagation_events;
  IF n_ev_after <> n_ev_before THEN
    RAISE EXCEPTION 'ABORT: the self-check left % propagation_events row(s) behind', n_ev_after - n_ev_before;
  END IF;
  SELECT count(*) INTO n_rows_after FROM public.grid_connection_queues;
  IF n_rows_after <> n_rows_before THEN
    RAISE EXCEPTION 'ABORT: the self-check left % grid_connection_queues row(s) behind', n_rows_after - n_rows_before;
  END IF;
  IF EXISTS (SELECT 1 FROM public.entities WHERE entity_id = ok_jur) THEN
    RAISE EXCEPTION 'ABORT: the self-check left its fixture entity behind';
  END IF;

  RAISE NOTICE 'migration 379 OK: grid_connection_queues carries substation evidence and its envelope (attacks refused), outbox trigger attached, % outbox rows before and after', n_ev_after;
END $$;

COMMIT;
