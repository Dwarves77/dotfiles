-- subject: Migration 380 (lane S8-E1, 2026-10-08): oem_tech_roadmaps gets its outbox trigger, keyed to manufacturer_id in migration 352's two-argument form, so a written or changed row reaches the signposts and items watching that manufacturer (CLAUDE.md rule 17); and announced_at, NOT NULL in migration 296, becomes nullable, because the registered producer's dataset (the EEA heavy-duty vehicle CO2 extract) carries no announcement date and a date is never estimated. NOT APPLIED.
-- 380 -- oem_tech_roadmaps: outbox trigger and nullable announced_at (lane S8-E1, 2026-10-08).
--
-- NOT APPLIED. Authored by lane S8-E1; the coordinator's executor applies it (two-track policy, CLAUDE.md standing rule 3:
-- schema DDL applies BEFORE the dependent code runs against the table). Requires migration 296 (oem_tech_roadmaps),
-- migration 282 (entities), migration 284 (propagation_events) and migration 352 (the two-argument emit_propagation_event).
--
-- WHY THE TRIGGER. oem_tech_roadmaps had no outbox trigger (read from every migration that attaches propagation_outbox_trg:
-- 284, 285, 286 and 352 name emission_factors, market_series, regional_data_facts, derived_values, statutory_computations
-- and estimated_values; none names this table). A row the registered producer writes would therefore change the product's
-- holdings and tell the flywheel nothing. The table has no entity_id column; its manufacturer_id is an FK to entities, so the
-- attachment passes it as 352's optional second argument: ('roadmap_id', 'manufacturer_id'). The function records the
-- manufacturer as the event's entity only when an entities row exists for it (propagation_events.entity_id is an FK).
--
-- WHY NULLABLE announced_at. Spec 09 section 1.1 and migration 296 declare announced_at date NOT NULL. The EEA extract evidences a
-- manufacturer, a powertrain and a count of registered vehicles; it holds no announcement date. Writing the registration date
-- or the dataset date there would state a fact the dataset does not contain, so the column must be able to hold NULL (rule 2).
-- Every existing row keeps its value; nothing is updated; the only reader (OemRoadmapPanel) selects and orders by the column
-- and renders neither it nor a date, so a NULL changes no rendering (read 2026-10-08).
--
-- WHAT THIS DOES NOT DO. No row is written, updated or deleted. emit_propagation_event() is not redefined here (352's body,
-- or 373's superset of it, stays). questions-on-change.mjs maps each emitting table to an event type; the mapping for
-- oem_tech_roadmaps lands with this migration's PR (see the lane report).
--
-- SELF-CHECK. Catalog legs read the real table: the trigger is attached with two arguments naming roadmap_id and
-- manufacturer_id, and announced_at is nullable. Behavioural legs build TEMP tables in a sub-transaction that a sentinel
-- exception rolls back, attach the real function with the same two arguments, and assert a known manufacturer is recorded as
-- the event's entity and an unknown one leaves entity_id NULL without failing the write. Nothing survives: the
-- propagation_events count is asserted equal before and after.
--
-- Reversible: DROP TRIGGER propagation_outbox_trg ON public.oem_tech_roadmaps;
--   ALTER TABLE public.oem_tech_roadmaps ALTER COLUMN announced_at SET NOT NULL;   (fails while any row holds NULL; none can exist before the producer is armed)

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.oem_tech_roadmaps') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.oem_tech_roadmaps does not exist, migration 296 must be applied first';
  END IF;
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist, migration 282 must be applied first';
  END IF;
  IF to_regclass('public.propagation_events') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.propagation_events does not exist, migration 284 must be applied first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'emit_propagation_event' AND pg_get_functiondef(p.oid) LIKE '%TG_NARGS%'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.emit_propagation_event() lacks the optional entity-column argument, migration 352 must be applied first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'oem_tech_roadmaps' AND column_name = 'manufacturer_id'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.oem_tech_roadmaps has no manufacturer_id column';
  END IF;
END $$;

ALTER TABLE public.oem_tech_roadmaps ALTER COLUMN announced_at DROP NOT NULL;

COMMENT ON COLUMN public.oem_tech_roadmaps.announced_at IS
  'The date the OEM announced the item. NULL when the row''s source evidences the stage but not an announcement date '
  '(the EEA heavy-duty vehicle CO2 extract, migration 380); a date is never estimated from a registration or dataset date.';

-- The outbox: one event per change, entity = the manufacturer when its entities row exists.
DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.oem_tech_roadmaps;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.oem_tech_roadmaps
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('roadmap_id', 'manufacturer_id');

-- Self-check, with nothing surviving it (the sentinel exception rolls the inner block back).
DO $$
DECLARE
  n_before   bigint;
  n_after    bigint;
  n_args     int;
  v_args     bytea;
  v_nullable boolean;
  v_known    text := 'cl:organisation:00000000000003a1';
  v_unknown  text := 'cl:organisation:00000000000003a2';
  v_ok       boolean;
BEGIN
  SELECT count(*) INTO n_before FROM public.propagation_events;

  -- (a) the real attachment carries both arguments, roadmap_id then manufacturer_id
  SELECT t.tgnargs, t.tgargs INTO n_args, v_args FROM pg_trigger t
   WHERE t.tgname = 'propagation_outbox_trg' AND t.tgrelid = 'public.oem_tech_roadmaps'::regclass AND NOT t.tgisinternal;
  IF n_args IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'ABORT: oem_tech_roadmaps outbox trigger has % arguments, expected 2', n_args;
  END IF;
  IF position('roadmap_id'::bytea IN v_args) = 0 OR position('manufacturer_id'::bytea IN v_args) = 0 THEN
    RAISE EXCEPTION 'ABORT: oem_tech_roadmaps outbox trigger arguments are not (roadmap_id, manufacturer_id)';
  END IF;

  -- (b) announced_at accepts NULL
  SELECT NOT a.attnotnull INTO v_nullable FROM pg_attribute a
   WHERE a.attrelid = 'public.oem_tech_roadmaps'::regclass AND a.attname = 'announced_at' AND NOT a.attisdropped;
  IF v_nullable IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: oem_tech_roadmaps.announced_at is still NOT NULL';
  END IF;

  BEGIN
    INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (v_known, 'organisation', 'migration 380 self-check manufacturer');

    CREATE TEMP TABLE s8e1_380_fixture (roadmap_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manufacturer_id text) ON COMMIT DROP;
    CREATE TRIGGER s8e1_380_selfcheck_trg AFTER INSERT OR UPDATE OR DELETE ON s8e1_380_fixture
      FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('roadmap_id', 'manufacturer_id');

    INSERT INTO s8e1_380_fixture (manufacturer_id) VALUES (v_known), (v_unknown);

    -- (c) a known manufacturer is recorded as the event's entity
    SELECT count(*) = 1 INTO v_ok FROM public.propagation_events
     WHERE table_name = 's8e1_380_fixture' AND new_row->>'manufacturer_id' = v_known AND entity_id = v_known;
    IF NOT v_ok THEN RAISE EXCEPTION 'ABORT: a known manufacturer_id was not recorded as the outbox entity_id'; END IF;

    -- (d) an unknown manufacturer leaves entity_id NULL and does not fail the write
    SELECT count(*) = 1 INTO v_ok FROM public.propagation_events
     WHERE table_name = 's8e1_380_fixture' AND new_row->>'manufacturer_id' = v_unknown AND entity_id IS NULL;
    IF NOT v_ok THEN RAISE EXCEPTION 'ABORT: an unknown manufacturer_id must leave entity_id NULL'; END IF;

    RAISE EXCEPTION 's8e1_380_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 's8e1_380_selfcheck_rollback' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO n_after FROM public.propagation_events;
  IF n_after <> n_before THEN
    RAISE EXCEPTION 'ABORT: the self-check left % propagation_events row(s) behind', n_after - n_before;
  END IF;
  IF EXISTS (SELECT 1 FROM public.entities WHERE entity_id IN (v_known, v_unknown)) THEN
    RAISE EXCEPTION 'ABORT: the self-check left a fixture entity behind';
  END IF;

  RAISE NOTICE 'migration 380 OK: oem_tech_roadmaps outbox trigger (roadmap_id, manufacturer_id) attached, announced_at nullable, % outbox rows before and after', n_after;
END $$;

COMMIT;
