-- subject: Migration 352 (lane L4-D, 2026-10-05, ADR-044 decision 4, ADR-043): the outbox trigger function resolves `propagation_events.entity_id` for `emission_factors` from its `corridor_id` column (a corridor entity id), through an optional second trigger argument; NOT APPLIED. `market_series` and `regional_data_facts` carry no column that names an entity and are left exactly as they are (reported by the lane, not guessed). `propagation_events` rows are never touched (append-only); the function changes, never existing rows.
-- 352 -- emit_propagation_event(): optional entity column for the outbox (lane L4-D, 2026-10-05).
--
-- NOT APPLIED. Authored by lane L4-D; the coordinator applies it (two-track policy, CLAUDE.md standing rule 3).
-- Requires migrations 258 (emission_factors), 282 (entities) and 284 (the outbox and its trigger function).
--
-- WHY. Lane L4-A found that an outbox row from emission_factors, market_series or regional_data_facts carries
-- a NULL entity_id (migration 284: "populated only when the changed row itself carries an entity_id column"),
-- so a change there reaches no signpost and no item. A signpost watches an entity; the drain matches an event
-- to a signpost by the event's entity_id (src/lib/learning/prediction-scoring.mjs). An outbox row that names no
-- entity can never fire one.
--
-- WHAT EACH TABLE KEYS ON (read from the creating migrations, not assumed).
--   emission_factors      corridor_id text, CHECK '^cl:corridor:[0-9a-f]{16}$' (migration 258): the shape of a
--                         corridor entity id (migration 282, cl:<kind>:<16 hex>). THIS migration resolves it.
--   market_series         id, series_key, label, plus the envelope (migration 268). series_key is a text
--                         producer-namespaced identity ("eu-oil-bulletin:automotive-diesel"). NO column names
--                         an entity. NOT changed here: the lane was told not to invent a join.
--   regional_data_facts   region_id uuid REFERENCES regions(id) (migration 106). regions has no entity column;
--                         it reaches entities only through entity_refs (migration 283), which is multi-valued
--                         (one region to several jurisdiction entities, role = 'jurisdiction'), and an outbox
--                         row carries ONE entity_id. NOT changed here, for the same reason.
--
-- HOW. The function gains an OPTIONAL second trigger argument, TG_ARGV[1]: the name of the column on the
-- changed row that names an entity. When the row has no entity_id of its own (the existing rule, unchanged)
-- and TG_ARGV[1] is given, the entity is read from that column. The value is used only if an entities row
-- with that id exists: propagation_events.entity_id is an FK to entities, so an id with no entities row (a
-- corridor id minted by cl_corridor_id() that scripts/entities/seed-corridors.mjs has not seeded) would make
-- the outbox INSERT fail inside the trigger and ROLL BACK THE EMISSION FACTOR WRITE. An unknown id therefore
-- leaves entity_id NULL, exactly as today. One primary-key lookup, no join, no recursion: still cheap.
-- The existing three-table attachments and migrations 285/286 pass one argument and behave byte-identically.
--
-- WHAT THIS DOES NOT DO. No existing propagation_events row is updated or deleted (ADR-043); the new entity
-- applies to events written after this migration. market_series and regional_data_facts triggers are not
-- recreated.
--
-- SELF-CHECK. A DO block builds throwaway TEMP tables inside a sub-transaction that is rolled back by a
-- sentinel exception, attaches the real function with the same two arguments the emission_factors trigger
-- uses, and asserts the entity is recorded for a known corridor, left NULL for an unknown corridor, left NULL
-- for a NULL column, and left NULL by a one-argument attachment (the old shape). Nothing from the check
-- survives: the propagation_events count is asserted equal before and after.
--
-- Reversible: re-run the body of migration 284's emit_propagation_event() and
--   DROP TRIGGER propagation_outbox_trg ON public.emission_factors;
--   CREATE TRIGGER propagation_outbox_trg AFTER INSERT OR UPDATE OR DELETE ON public.emission_factors
--     FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('factor_id');

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist, migration 282 must be applied first';
  END IF;
  IF to_regclass('public.propagation_events') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.propagation_events does not exist, migration 284 must be applied first';
  END IF;
  IF to_regclass('public.emission_factors') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.emission_factors does not exist, migration 258 must be applied first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'emission_factors' AND column_name = 'corridor_id'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.emission_factors has no corridor_id column';
  END IF;
END $$;

-- The outbox writer. Migration 284's body, plus the optional entity column (TG_ARGV[1]).
CREATE OR REPLACE FUNCTION public.emit_propagation_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_new       jsonb;
  v_old       jsonb;
  v_pk_col    text := TG_ARGV[0];
  v_kind      text;
  v_row_pk    text;
  v_entity_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_old := NULL;
    v_kind := 'insert';
  ELSIF TG_OP = 'DELETE' THEN
    v_new := NULL;
    v_old := to_jsonb(OLD);
    v_kind := 'delete';
  ELSE -- UPDATE
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
    IF (v_new - 'updated_at') IS NOT DISTINCT FROM (v_old - 'updated_at') THEN
      RETURN NEW; -- nothing material changed; do not amplify the outbox
    END IF;
    IF (v_old ? 'superseded_by') AND (v_old->>'superseded_by') IS NULL AND (v_new->>'superseded_by') IS NOT NULL THEN
      v_kind := 'supersede';
    ELSE
      v_kind := 'update';
    END IF;
  END IF;

  v_row_pk := coalesce(v_new->>v_pk_col, v_old->>v_pk_col);
  v_entity_id := coalesce(v_new->>'entity_id', v_old->>'entity_id');

  -- Lane L4-D: a table with no entity_id column may name its entity in another column, given as the optional
  -- second trigger argument. Used only when an entities row exists for it (the FK on propagation_events.entity_id
  -- would otherwise fail this INSERT and roll back the change being recorded).
  IF v_entity_id IS NULL AND TG_NARGS >= 2 THEN
    v_entity_id := coalesce(v_new->>TG_ARGV[1], v_old->>TG_ARGV[1]);
    IF v_entity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.entities e WHERE e.entity_id = v_entity_id) THEN
      v_entity_id := NULL;
    END IF;
  END IF;

  INSERT INTO public.propagation_events (table_name, row_pk, entity_id, change_kind, old_row, new_row)
  VALUES (TG_TABLE_NAME, v_row_pk, v_entity_id, v_kind, v_old, v_new);

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.emit_propagation_event() IS
  'The outbox writer (spec 08 section 2.2 Part 1). ONE INSERT, no recursion. TG_ARGV[0] names the primary-key '
  'column. Optional TG_ARGV[1] (migration 352) names a column that holds an entity id, used when the row has '
  'no entity_id column of its own and only when an entities row exists for the value (propagation_events.'
  'entity_id is an FK). Attached AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW on every propagation source table.';

-- emission_factors: its corridor_id names a corridor entity.
DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.emission_factors;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.emission_factors
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('factor_id', 'corridor_id');

-- Self-check, with nothing surviving it (the sentinel exception rolls the inner block back).
DO $$
DECLARE
  n_before   bigint;
  n_after    bigint;
  n_args     int;
  v_known    text := 'cl:corridor:00000000000000a1';
  v_unknown  text := 'cl:corridor:00000000000000a2';
  v_ent      text;
  v_ok       boolean;
BEGIN
  SELECT count(*) INTO n_before FROM public.propagation_events;

  -- The real attachment carries both arguments.
  SELECT t.tgnargs INTO n_args FROM pg_trigger t
   WHERE t.tgname = 'propagation_outbox_trg' AND t.tgrelid = 'public.emission_factors'::regclass AND NOT t.tgisinternal;
  IF n_args IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'ABORT: emission_factors outbox trigger has % arguments, expected 2', n_args;
  END IF;

  BEGIN
    INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (v_known, 'corridor', 'migration 352 self-check corridor');

    CREATE TEMP TABLE l4d_352_fixture (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), corridor_id text) ON COMMIT DROP;
    CREATE TRIGGER l4d_352_selfcheck_trg AFTER INSERT OR UPDATE OR DELETE ON l4d_352_fixture
      FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('id', 'corridor_id');
    CREATE TEMP TABLE l4d_352_oldshape (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), corridor_id text) ON COMMIT DROP;
    CREATE TRIGGER l4d_352_selfcheck_trg AFTER INSERT OR UPDATE OR DELETE ON l4d_352_oldshape
      FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('id');

    INSERT INTO l4d_352_fixture (corridor_id) VALUES (v_known), (v_unknown), (NULL);
    INSERT INTO l4d_352_oldshape (corridor_id) VALUES (v_known);

    -- (a) a known corridor is recorded as the event's entity
    SELECT count(*) = 1 INTO v_ok FROM public.propagation_events
     WHERE table_name = 'l4d_352_fixture' AND new_row->>'corridor_id' = v_known AND entity_id = v_known;
    IF NOT v_ok THEN RAISE EXCEPTION 'ABORT: a known corridor_id was not recorded as the outbox entity_id'; END IF;

    -- (b) an unknown corridor id leaves entity_id NULL and does not fail the write
    SELECT count(*) = 1 INTO v_ok FROM public.propagation_events
     WHERE table_name = 'l4d_352_fixture' AND new_row->>'corridor_id' = v_unknown AND entity_id IS NULL;
    IF NOT v_ok THEN RAISE EXCEPTION 'ABORT: an unknown corridor_id must leave entity_id NULL'; END IF;

    -- (c) a NULL column leaves entity_id NULL
    SELECT count(*) = 1 INTO v_ok FROM public.propagation_events
     WHERE table_name = 'l4d_352_fixture' AND new_row->>'corridor_id' IS NULL AND entity_id IS NULL;
    IF NOT v_ok THEN RAISE EXCEPTION 'ABORT: a NULL corridor_id must leave entity_id NULL'; END IF;

    -- (d) the old one-argument shape records no entity, whatever the row holds (byte-identical behaviour)
    SELECT entity_id INTO v_ent FROM public.propagation_events WHERE table_name = 'l4d_352_oldshape';
    IF v_ent IS NOT NULL THEN RAISE EXCEPTION 'ABORT: a one-argument attachment must not resolve an entity'; END IF;

    RAISE EXCEPTION 'l4d_352_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'l4d_352_selfcheck_rollback' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO n_after FROM public.propagation_events;
  IF n_after <> n_before THEN
    RAISE EXCEPTION 'ABORT: the self-check left % propagation_events row(s) behind', n_after - n_before;
  END IF;
  IF EXISTS (SELECT 1 FROM public.entities WHERE entity_id IN (v_known, v_unknown)) THEN
    RAISE EXCEPTION 'ABORT: the self-check left a fixture entity behind';
  END IF;

  RAISE NOTICE 'migration 352 OK: emit_propagation_event() resolves emission_factors.corridor_id to the outbox entity_id (existing entities only), % outbox rows before and after', n_after;
END $$;

COMMIT;
