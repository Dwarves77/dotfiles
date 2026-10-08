-- subject: Migration 373 (lane L4-E, 2026-10-08, remaining-build-register item 12, spec 08, CLAUDE.md rule 17, migration 352's one-entity-per-outbox-row rule): market_series and regional_data_facts changes reach the items they move; NOT APPLIED. `market_series` gains `entity_id text NULL REFERENCES entities(entity_id)` and its outbox trigger is recreated as ('id','entity_id') in 352's optional-argument form (NULL or unknown leaves the outbox entity NULL, the write never fails). `regional_data_facts` gains a new trigger function `emit_propagation_events_for_region(pk_col, region_col)` that resolves the row's region to its jurisdiction entities through `entity_refs` (ref_table 'regions', role 'jurisdiction', migration 283) and writes ONE outbox row per entity (a region with no refs writes none and does not raise). `emit_propagation_event()` itself is not touched, so every existing one-event attachment is byte-identical. `propagation_events` rows are never updated or deleted (append-only). The self-check runs against the REAL tables inside a sub-transaction rolled back by a sentinel.
-- 373 -- outbox entity for market_series and regional_data_facts (lane L4-E, 2026-10-08).
--
-- NOT APPLIED. Authored by lane L4-E; the coordinator applies it (two-track policy, CLAUDE.md standing rule 3).
-- Requires migrations 106 (regions, regional_data_facts), 268 (market_series), 282 (entities), 283 (entity_refs),
-- 284 (the outbox) and 352 (the optional entity argument of emit_propagation_event()).
--
-- WHY. Migration 352 resolved the entity for emission_factors only and left these two tables alone because neither
-- carried a column naming an entity. An outbox row with a NULL entity_id can never fire a signpost (the drain matches
-- an event to a signpost by entity_id) and reaches no item (questions-on-change reads the entity-to-item link). Register
-- item 12: "market_series and regional_data_facts outbox rows carry no single entity so reach no item". The coordinator's
-- ruling for this lane (binding): one outbox row carries ONE entity_id, so a table that touches several entities emits one
-- row per entity; an unknown id leaves NULL rather than failing the write.
--
-- WHAT EACH TABLE KEYS ON (read from the creating migrations, not assumed).
--   market_series         id uuid PK, series_key, label, the envelope (268). No column named an entity. THIS migration
--                         adds entity_id (below). Producers set it at write time from the producer registry entry
--                         (scripts/producers/registry), and the data script scripts/migrations/data/
--                         backfill-market-series-entity.mjs sets it on the rows that exist (a DATA step, not run here).
--   regional_data_facts   id uuid PK, region_id uuid NOT NULL REFERENCES regions(id) (106). A region has no entity column;
--                         it reaches entities through entity_refs (283: ref_table 'regions', ref_id = regions.id, role
--                         'jurisdiction'), one row per ISO code the region groups, so one region reaches N jurisdiction
--                         entities (EU reaches DE, NL, BE, FR, IT, ES and EU itself). N outbox rows per change.
--
-- market_series. entity_id is a plain nullable FK, indexed where set. The trigger is recreated with
-- ('id', 'entity_id'). emit_propagation_event() already reads a row's own entity_id key first (migration 284), so the
-- second argument is redundant for this table and is passed anyway because the ruling names that form; it is harmless
-- (the optional branch only runs when the first lookup found nothing, and finds nothing again). The FK means an unknown id
-- cannot be stored, so "unknown leaves NULL" holds by construction; the self-check proves the FK refuses one.
--
-- regional_data_facts. A new function, not a change to emit_propagation_event(), so the one-event attachments (emission_factors,
-- derived_values, statutory_computations, estimated_values and the rest) cannot move. It copies 284's classification exactly
-- (insert, delete, no-op update detection by jsonb diff minus updated_at, supersede detection) and 284's INSERT column list
-- exactly; the only difference is the entity: a loop over the region's jurisdiction refs, in entity_id order, one INSERT each.
-- When an UPDATE moves a fact to another region, the entities of BOTH regions are affected, so both regions' jurisdiction
-- refs are walked (de-duplicated). A region with no jurisdiction ref emits NOTHING: an event with no entity reaches no item,
-- and regional_data_facts rows carry no derivation edges (ADR-043; the producers' summaries record edges_authored null), so
-- there is no dependent for invalidate_dependents() to lose. SECURITY: invoker rights like 284's function (not a definer, so F70
-- does not apply), search_path pinned anyway, EXECUTE revoked from PUBLIC (a trigger function is never called by name; the
-- privilege is checked at CREATE TRIGGER, which the migration owner passes).
--
-- THE ARGUMENTS. TG_ARGV[0] is the primary-key column (as in every other attachment), TG_ARGV[1] is the column holding the
-- region id. The ruling spelled the attachment ('region_id'); the pk column is passed first so the argument convention
-- stays identical across all attachments.
--
-- WHAT THIS DOES NOT DO. No existing propagation_events row is touched; the new entities apply to events written after this
-- migration. No market_series row is backfilled here (the data script does that, dry by default).
--
-- SELF-CHECK. A DO block creates real fixture rows in the real tables (entities, regions, entity_refs, regional_data_facts,
-- market_series) and one TEMP table, asserts the outbox rows they produce, then raises a sentinel exception that rolls
-- everything back. Asserted: a fact in a region with 2 refs gives 2 events with the right entity ids; the same fact updated
-- gives 2 more; a no-op update gives 0; a region with no jurisdiction ref (and one with a non-jurisdiction ref) gives 0 and
-- does not raise; a fact moved between regions gives the union; a delete gives the current region's events; a market_series
-- row with an entity gives exactly 1 event with that entity, an UPDATE gives exactly 1, a NULL entity gives 1 event with a
-- NULL entity and does not raise, an unknown entity is refused by the FK; a one-argument attachment still gives exactly 1
-- event with no entity; the three real trigger attachments have the expected function and argument count. Nothing survives.
--
-- Reversible: ALTER TABLE public.market_series DROP COLUMN entity_id (drops its trigger argument's target; recreate the
-- trigger as emit_propagation_event('id')); DROP TRIGGER propagation_outbox_trg ON public.regional_data_facts; CREATE TRIGGER
-- propagation_outbox_trg AFTER INSERT OR UPDATE OR DELETE ON public.regional_data_facts FOR EACH ROW EXECUTE FUNCTION
-- public.emit_propagation_event('id'); DROP FUNCTION public.emit_propagation_events_for_region().

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist, migration 282 must be applied first';
  END IF;
  IF to_regclass('public.entity_refs') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entity_refs does not exist, migration 283 must be applied first';
  END IF;
  IF to_regclass('public.propagation_events') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.propagation_events does not exist, migration 284 must be applied first';
  END IF;
  IF to_regclass('public.market_series') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.market_series does not exist, migration 268 must be applied first';
  END IF;
  IF to_regclass('public.regional_data_facts') IS NULL OR to_regclass('public.regions') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.regional_data_facts or public.regions does not exist, migration 106 must be applied first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.proname = 'emit_propagation_event' AND p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%TG_NARGS%'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.emit_propagation_event() lacks the optional entity argument, migration 352 must be applied first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.entity_refs'::regclass AND c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%regions%'
  ) THEN
    RAISE EXCEPTION 'ABORT: entity_refs does not admit ref_table regions (migration 283 CHECK)';
  END IF;
END $$;

-- market_series: the entity the series describes.
ALTER TABLE public.market_series
  ADD COLUMN IF NOT EXISTS entity_id text REFERENCES public.entities(entity_id);

COMMENT ON COLUMN public.market_series.entity_id IS
  'The entity this series describes (a jurisdiction for a regional price index), set by the producer from its registry '
  'entry at write time and by scripts/migrations/data/backfill-market-series-entity.mjs for older rows. Nullable: a '
  'series about no single entity (an FX rate, a global dataset) stays NULL. FK to entities, so an unknown id cannot be '
  'stored. The outbox trigger (emit_propagation_event, migration 284/352) records it as propagation_events.entity_id, '
  'which is what lets a change to the series reach the items linked to that entity (migration 373).';

CREATE INDEX IF NOT EXISTS market_series_entity_idx
  ON public.market_series (entity_id) WHERE entity_id IS NOT NULL;

DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.market_series;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.market_series
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('id', 'entity_id');

-- regional_data_facts: one outbox row per jurisdiction entity of the row's region.
CREATE OR REPLACE FUNCTION public.emit_propagation_events_for_region() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new        jsonb;
  v_old        jsonb;
  v_pk_col     text := TG_ARGV[0];
  v_region_col text := TG_ARGV[1];
  v_kind       text;
  v_row_pk     text;
  v_region_new uuid;
  v_region_old uuid;
  r            record;
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
  v_region_new := (v_new->>v_region_col)::uuid;
  v_region_old := (v_old->>v_region_col)::uuid;

  -- A region reaches several jurisdiction entities; an outbox row carries one entity, so one row per entity. A move
  -- between regions affects both regions' entities. No ref: no row, no error.
  FOR r IN
    SELECT DISTINCT er.entity_id
      FROM public.entity_refs er
     WHERE er.ref_table = 'regions'
       AND er.role = 'jurisdiction'
       AND er.ref_id IN (v_region_new, v_region_old)
     ORDER BY er.entity_id
  LOOP
    INSERT INTO public.propagation_events (table_name, row_pk, entity_id, change_kind, old_row, new_row)
    VALUES (TG_TABLE_NAME, v_row_pk, r.entity_id, v_kind, v_old, v_new);
  END LOOP;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.emit_propagation_events_for_region() IS
  'Outbox writer for a table whose rows belong to a region (migration 373). Same classification and INSERT as '
  'emit_propagation_event(); the entity is each jurisdiction entity of the row''s region (entity_refs, ref_table regions, '
  'role jurisdiction), one outbox row per entity, none when the region has no ref. TG_ARGV[0] is the primary-key column, '
  'TG_ARGV[1] the region id column. Invoker rights, search_path pinned.';

REVOKE EXECUTE ON FUNCTION public.emit_propagation_events_for_region() FROM PUBLIC;

DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.regional_data_facts;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.regional_data_facts
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_events_for_region('id', 'region_id');

-- Self-check, with nothing surviving it (the sentinel exception rolls the inner block back).
DO $$
DECLARE
  n_before   bigint;
  n_after    bigint;
  v_e1       text := 'cl:jurisdiction:00000000000000b1';
  v_e2       text := 'cl:jurisdiction:00000000000000b2';
  v_e3       text := 'cl:jurisdiction:00000000000000b3';
  v_unknown  text := 'cl:jurisdiction:00000000000000b4';
  v_ra       uuid;
  v_rb       uuid;
  v_rc       uuid;
  v_fact     uuid;
  v_fact_c   uuid;
  v_ser      uuid;
  v_ser_null uuid;
  v_old      uuid;
  v_mark     bigint;
  v_n        int;
  v_ents     text[];
  v_kinds    text[];
  v_ok       boolean;
BEGIN
  SELECT count(*) INTO n_before FROM public.propagation_events;

  -- The three real attachments: function and argument count.
  SELECT count(*) = 1 INTO v_ok FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgname = 'propagation_outbox_trg' AND t.tgrelid = 'public.market_series'::regclass AND NOT t.tgisinternal
     AND p.proname = 'emit_propagation_event' AND t.tgnargs = 2;
  IF NOT v_ok THEN RAISE EXCEPTION 'ABORT: market_series outbox trigger is not emit_propagation_event with 2 arguments'; END IF;
  SELECT count(*) = 1 INTO v_ok FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgname = 'propagation_outbox_trg' AND t.tgrelid = 'public.regional_data_facts'::regclass AND NOT t.tgisinternal
     AND p.proname = 'emit_propagation_events_for_region' AND t.tgnargs = 2;
  IF NOT v_ok THEN RAISE EXCEPTION 'ABORT: regional_data_facts outbox trigger is not emit_propagation_events_for_region with 2 arguments'; END IF;
  IF to_regclass('public.emission_factors') IS NOT NULL THEN
    SELECT count(*) = 1 INTO v_ok FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgname = 'propagation_outbox_trg' AND t.tgrelid = 'public.emission_factors'::regclass AND NOT t.tgisinternal
       AND p.proname = 'emit_propagation_event' AND t.tgnargs = 2;
    IF NOT v_ok THEN RAISE EXCEPTION 'ABORT: the emission_factors outbox trigger (migration 352) changed'; END IF;
  END IF;

  BEGIN
    INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES
      (v_e1, 'jurisdiction', 'migration 373 self-check one'),
      (v_e2, 'jurisdiction', 'migration 373 self-check two'),
      (v_e3, 'jurisdiction', 'migration 373 self-check three');
    INSERT INTO public.regions (code, label) VALUES ('l4e373-a', 'migration 373 region a') RETURNING id INTO v_ra;
    INSERT INTO public.regions (code, label) VALUES ('l4e373-b', 'migration 373 region b') RETURNING id INTO v_rb;
    INSERT INTO public.regions (code, label) VALUES ('l4e373-c', 'migration 373 region c') RETURNING id INTO v_rc;
    INSERT INTO public.entity_refs (ref_table, ref_id, entity_id, role, asserted_by) VALUES
      ('regions', v_ra, v_e1, 'jurisdiction', 'l4e-373-selfcheck'),
      ('regions', v_ra, v_e2, 'jurisdiction', 'l4e-373-selfcheck'),
      ('regions', v_rb, v_e3, 'jurisdiction', 'l4e-373-selfcheck'),
      ('regions', v_rc, v_e3, 'not-a-jurisdiction', 'l4e-373-selfcheck');

    -- regional_data_facts (a) a fact in a region with 2 refs: 2 events, the right entity ids
    SELECT coalesce(max(event_id), 0) INTO v_mark FROM public.propagation_events;
    INSERT INTO public.regional_data_facts (region_id, dimension, fact_label, value)
      VALUES (v_ra, 'infrastructure', 'l4e-373 fact', '1') RETURNING id INTO v_fact;
    SELECT count(*), array_agg(entity_id ORDER BY entity_id), array_agg(DISTINCT change_kind) INTO v_n, v_ents, v_kinds
      FROM public.propagation_events WHERE event_id > v_mark AND table_name = 'regional_data_facts' AND row_pk = v_fact::text;
    IF v_n <> 2 OR v_ents IS DISTINCT FROM ARRAY[v_e1, v_e2] OR v_kinds IS DISTINCT FROM ARRAY['insert'] THEN
      RAISE EXCEPTION 'ABORT: a regional_data_facts insert in a region with 2 jurisdiction refs must give 2 insert events for those 2 entities (got % %)', v_n, v_ents;
    END IF;

    -- (b) a region with no jurisdiction ref (here: only a ref of another role): 0 events, no error
    SELECT coalesce(max(event_id), 0) INTO v_mark FROM public.propagation_events;
    INSERT INTO public.regional_data_facts (region_id, dimension, fact_label, value)
      VALUES (v_rc, 'infrastructure', 'l4e-373 fact c', '1') RETURNING id INTO v_fact_c;
    SELECT count(*) INTO v_n FROM public.propagation_events WHERE event_id > v_mark AND table_name = 'regional_data_facts';
    IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: a regional_data_facts insert in a region with no jurisdiction ref must give 0 events (got %)', v_n; END IF;

    -- (c) an update of the fact: 2 more events
    SELECT coalesce(max(event_id), 0) INTO v_mark FROM public.propagation_events;
    UPDATE public.regional_data_facts SET value = '2' WHERE id = v_fact;
    SELECT count(*), array_agg(entity_id ORDER BY entity_id), array_agg(DISTINCT change_kind) INTO v_n, v_ents, v_kinds
      FROM public.propagation_events WHERE event_id > v_mark AND table_name = 'regional_data_facts' AND row_pk = v_fact::text;
    IF v_n <> 2 OR v_ents IS DISTINCT FROM ARRAY[v_e1, v_e2] OR v_kinds IS DISTINCT FROM ARRAY['update'] THEN
      RAISE EXCEPTION 'ABORT: a regional_data_facts update must give 2 update events for the region''s 2 entities (got % %)', v_n, v_ents;
    END IF;

    -- (d) a no-op update gives none
    SELECT coalesce(max(event_id), 0) INTO v_mark FROM public.propagation_events;
    UPDATE public.regional_data_facts SET value = value WHERE id = v_fact;
    SELECT count(*) INTO v_n FROM public.propagation_events WHERE event_id > v_mark AND table_name = 'regional_data_facts';
    IF v_n <> 0 THEN RAISE EXCEPTION 'ABORT: a no-op regional_data_facts update must give 0 events (got %)', v_n; END IF;

    -- (e) a move between regions: the entities of both regions
    SELECT coalesce(max(event_id), 0) INTO v_mark FROM public.propagation_events;
    UPDATE public.regional_data_facts SET region_id = v_rb WHERE id = v_fact;
    SELECT count(*), array_agg(entity_id ORDER BY entity_id) INTO v_n, v_ents
      FROM public.propagation_events WHERE event_id > v_mark AND table_name = 'regional_data_facts' AND row_pk = v_fact::text;
    IF v_n <> 3 OR v_ents IS DISTINCT FROM ARRAY[v_e1, v_e2, v_e3] THEN
      RAISE EXCEPTION 'ABORT: moving a fact between regions must give one event per entity of both regions (got % %)', v_n, v_ents;
    END IF;

    -- (f) a delete: the current region's entities
    SELECT coalesce(max(event_id), 0) INTO v_mark FROM public.propagation_events;
    DELETE FROM public.regional_data_facts WHERE id = v_fact;
    SELECT count(*), array_agg(entity_id ORDER BY entity_id), array_agg(DISTINCT change_kind) INTO v_n, v_ents, v_kinds
      FROM public.propagation_events WHERE event_id > v_mark AND table_name = 'regional_data_facts' AND row_pk = v_fact::text;
    IF v_n <> 1 OR v_ents IS DISTINCT FROM ARRAY[v_e3] OR v_kinds IS DISTINCT FROM ARRAY['delete'] THEN
      RAISE EXCEPTION 'ABORT: a regional_data_facts delete must give 1 delete event for the region''s entity (got % %)', v_n, v_ents;
    END IF;

    -- market_series (g) a row with an entity: exactly 1 event with that entity
    SELECT coalesce(max(event_id), 0) INTO v_mark FROM public.propagation_events;
    INSERT INTO public.market_series (series_key, label, reference_period, entity_id)
      VALUES ('l4e373:selfcheck', 'migration 373 series', '2026-W01', v_e1) RETURNING id INTO v_ser;
    SELECT count(*), array_agg(entity_id) INTO v_n, v_ents
      FROM public.propagation_events WHERE event_id > v_mark AND table_name = 'market_series' AND row_pk = v_ser::text;
    IF v_n <> 1 OR v_ents IS DISTINCT FROM ARRAY[v_e1] THEN
      RAISE EXCEPTION 'ABORT: a market_series insert with an entity must give exactly 1 event carrying it (got % %)', v_n, v_ents;
    END IF;

    -- (h) an UPDATE of that row: exactly 1 event, same entity
    SELECT coalesce(max(event_id), 0) INTO v_mark FROM public.propagation_events;
    UPDATE public.market_series SET label = 'migration 373 series revised' WHERE id = v_ser;
    SELECT count(*), array_agg(entity_id) INTO v_n, v_ents
      FROM public.propagation_events WHERE event_id > v_mark AND table_name = 'market_series' AND row_pk = v_ser::text AND change_kind = 'update';
    IF v_n <> 1 OR v_ents IS DISTINCT FROM ARRAY[v_e1] THEN
      RAISE EXCEPTION 'ABORT: a market_series update must give exactly 1 event carrying its entity (got % %)', v_n, v_ents;
    END IF;

    -- (i) a NULL entity: 1 event with a NULL entity, and the write does not raise
    SELECT coalesce(max(event_id), 0) INTO v_mark FROM public.propagation_events;
    INSERT INTO public.market_series (series_key, label, reference_period, entity_id)
      VALUES ('l4e373:selfcheck', 'migration 373 series, no entity', '2026-W02', NULL) RETURNING id INTO v_ser_null;
    SELECT count(*) INTO v_n FROM public.propagation_events
     WHERE event_id > v_mark AND table_name = 'market_series' AND row_pk = v_ser_null::text AND entity_id IS NULL;
    IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: a market_series row with a NULL entity must give 1 event with a NULL entity (got %)', v_n; END IF;

    -- (j) an unknown entity cannot be stored (the FK refuses it)
    BEGIN
      INSERT INTO public.market_series (series_key, label, reference_period, entity_id)
        VALUES ('l4e373:selfcheck', 'migration 373 series, unknown entity', '2026-W03', v_unknown);
      RAISE EXCEPTION 'ABORT: market_series accepted an entity id with no entities row';
    EXCEPTION WHEN foreign_key_violation THEN
      NULL;
    END;

    -- (k) the one-argument shape is unchanged: exactly 1 event, no entity, whatever the row holds
    CREATE TEMP TABLE l4e_373_oldshape (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), region_id uuid) ON COMMIT DROP;
    CREATE TRIGGER l4e_373_selfcheck_trg AFTER INSERT OR UPDATE OR DELETE ON l4e_373_oldshape
      FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('id');
    INSERT INTO l4e_373_oldshape (region_id) VALUES (v_ra) RETURNING id INTO v_old;
    SELECT count(*) INTO v_n FROM public.propagation_events
     WHERE table_name = 'l4e_373_oldshape' AND row_pk = v_old::text AND entity_id IS NULL;
    IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: a one-argument attachment must give exactly 1 event with no entity (got %)', v_n; END IF;

    RAISE EXCEPTION 'l4e_373_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'l4e_373_selfcheck_rollback' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO n_after FROM public.propagation_events;
  IF n_after <> n_before THEN
    RAISE EXCEPTION 'ABORT: the self-check left % propagation_events row(s) behind', n_after - n_before;
  END IF;
  IF EXISTS (SELECT 1 FROM public.entities WHERE entity_id IN (v_e1, v_e2, v_e3))
     OR EXISTS (SELECT 1 FROM public.regions WHERE code LIKE 'l4e373-%')
     OR EXISTS (SELECT 1 FROM public.market_series WHERE series_key = 'l4e373:selfcheck') THEN
    RAISE EXCEPTION 'ABORT: the self-check left a fixture row behind';
  END IF;

  RAISE NOTICE 'migration 373 OK: market_series.entity_id feeds the outbox entity; regional_data_facts emits one outbox row per jurisdiction entity of its region; % outbox rows before and after', n_after;
END $$;

COMMIT;
