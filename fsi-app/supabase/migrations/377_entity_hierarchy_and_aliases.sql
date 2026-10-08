-- subject: Migration 377 (lane ALIAS-1, 2026-10-08, spec 00 section 1.3): the composite/atomic entity hierarchy and the name-alias table; entities gains entity_level (group, legal_entity, operating_identity; NULL for every non-organisation kind and never guessed); entity_relations (parent_entity_id, child_entity_id, relation group_of / legal_entity_of / operating_identity_of, asserted_by, asserted_at, source_id, provenance; PK (parent, child, relation); a relation that would make the child an ancestor of the parent is refused by trigger); entity_aliases (entity_id, alias, alias_kind name / short_name / former_name / ticker / scac / iata / other, asserted_by, asserted_at, source_id, provenance; PK (entity_id, alias, alias_kind, asserted_by), so each asserter's evidence is its own row; INSERT-only: an UPDATE, DELETE or TRUNCATE is refused by trigger and the update, delete and truncate privileges are revoked, a correction is a new row with a later asserted_at); RLS read for authenticated, writes service_role only; the outbox trigger propagation_outbox_trg in migration 352's form on both tables; a rolled-back self-check attacks every guard; APPLIED (production ledger version 20261008134702, as of 2026-10-08).
-- 377 -- entity hierarchy and aliases (lane ALIAS-1, 2026-10-08).
--
-- APPLIED (production ledger version 20261008134702, as of 2026-10-08). Authored by lane ALIAS-1; the coordinator applies it (two-track policy, CLAUDE.md standing
-- rule 3). Requires migration 282 (entities), 284 (the outbox) and 352 (emit_propagation_event() with its
-- optional entity column), and the sources table (migration 004).
--
-- WHY. Spec 00 section 1.3 states two rules the spine did not yet carry. Rule 1: "Maersk" the group,
-- "Maersk A/S" the LEI'd legal entity and "MAEU" the carrier operating identity are three objects with
-- declared relations, not one fuzzy object, and every screen states which level it shows. Rule 2: every
-- alias carries who asserted it and when; aliases are evidence, not edits. Lane VERIFY-1 confirmed both
-- absent: entities (282) has only kind, canonical_name, status and merged_into; merged_into is a tombstone
-- target, not a hierarchy; entity_scope.relation is open text with one writer value; entity_identifiers (282)
-- is a provenance-bearing alias structure for EXTERNAL identifier schemes only (its asserted_by / asserted_at
-- columns are the provenance shape reused below), and no table aliases an entity to a NAME.
--
-- DIRECTION OF entity_relations, STATED ONCE. The relation names the CHILD's role toward the PARENT:
--   child legal_entity_of parent   the child is a legal entity of the parent group
--   child operating_identity_of parent   the child is an operating identity of the parent legal entity
--   child group_of parent   the child is a sub-group of the parent group
-- So the three Maersk-shaped objects are two rows: (group, legal entity, legal_entity_of) and (legal entity,
-- operating identity, operating_identity_of). entities.entity_level carries each object's own level; the
-- relation rows carry the declared relations between them. Neither is derived from the other here, because a
-- level left NULL is "not recorded", never a guess.
--
-- THE CYCLE RULE. A relation whose child is already an ancestor of its parent (or is the parent itself) is
-- refused: the ancestors of the parent are walked through every relation type by a recursive query, and a
-- transaction-level advisory lock serialises writers so two concurrent inserts cannot each pass the check and
-- together close a loop. On UPDATE the row being replaced is excluded from the walk, so re-pointing an edge is
-- judged on the edges that remain.
--
-- THE ALIAS RULES. entity_aliases is INSERT-only for everyone, including the system: a BEFORE UPDATE OR DELETE
-- row trigger and a BEFORE TRUNCATE statement trigger refuse the change (restrict_violation), and the privileges
-- are revoked from authenticated and service_role as well, so the refusal holds at two layers. A correction is
-- a new row with a later asserted_at; the current display name (entities.canonical_name) is never overwritten
-- by an alias, and nothing in this migration writes entities from an alias. The alias text is stored trimmed
-- and with runs of whitespace collapsed (a CHECK), so a lookup by normalised text matches the stored form.
-- PK (entity_id, alias, alias_kind, asserted_by): aliases are evidence per asserter. The same alias of the same
-- kind for one entity, asserted by two parties, is two rows and both persist; one party repeating its own
-- assertion is refused by the key (a writer uses ON CONFLICT DO NOTHING). Two different aliases of one entity
-- also both persist.
--
-- EVENT TYPE. The outbox rows of both new tables are turned into the trigger event type identity_revised by
-- src/lib/learning/questions-on-change.mjs (constants.mjs TRIGGER_EVENT_TYPES). That type is a code vocabulary:
-- propagation_events carries a CHECK on change_kind only (migration 284: insert, update, delete, supersede) and
-- has no event_type column, so this migration extends no CHECK for it.
--
-- OUTBOX (CLAUDE.md standing rule 17: nothing in this build runs alone). Both tables carry the
-- propagation_outbox_trg trigger in migration 352's form. entity_aliases has an entity_id column, so the
-- outbox row's entity is resolved by the existing rule. entity_relations has none; its trigger passes
-- 'child_entity_id' as the optional second argument (migration 352), so the outbox row names the child, the
-- entity whose standing in the hierarchy changed (resolved only when an entities row exists for it, which the
-- foreign key guarantees). propagation_events rows are never updated or deleted here (ADR-043).
--
-- WHAT THIS DOES NOT DO. No row is inserted outside the rolled-back self-check: the seed values (which
-- organisations are groups, which legal entities, which operating identities, and their aliases) are
-- population and belong to the population lane. entity_level is left NULL on every existing row.
-- Functions here are SECURITY INVOKER with a pinned search_path and EXECUTE revoked from PUBLIC (F70 posture).
--
-- Reversible, in this order (no dependent object outside this migration):
--   DROP TABLE public.entity_aliases, public.entity_relations;
--   DROP FUNCTION public.entity_aliases_refuse_change();
--   DROP FUNCTION public.entity_relations_refuse_cycle();
--   ALTER TABLE public.entities DROP CONSTRAINT entities_entity_level_organisation_only,
--     DROP CONSTRAINT entities_entity_level_values, DROP COLUMN entity_level;

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist, migration 282 must be applied first';
  END IF;
  IF to_regclass('public.sources') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.sources does not exist, migration 004 must be applied first';
  END IF;
  IF to_regclass('public.propagation_events') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.propagation_events does not exist, migration 284 must be applied first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'emit_propagation_event' AND p.prosrc LIKE '%TG_NARGS >= 2%'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.emit_propagation_event() lacks the optional entity column argument, migration 352 must be applied first';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
    RAISE EXCEPTION 'ABORT: the anon, authenticated and service_role roles must all exist';
  END IF;
END $$;

-- 1. entities.entity_level ------------------------------------------------------------------------------
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS entity_level text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.entities'::regclass AND conname = 'entities_entity_level_values') THEN
    ALTER TABLE public.entities ADD CONSTRAINT entities_entity_level_values
      CHECK (entity_level IS NULL OR entity_level IN ('group', 'legal_entity', 'operating_identity'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.entities'::regclass AND conname = 'entities_entity_level_organisation_only') THEN
    ALTER TABLE public.entities ADD CONSTRAINT entities_entity_level_organisation_only
      CHECK (entity_level IS NULL OR kind = 'organisation');
  END IF;
END $$;

COMMENT ON COLUMN public.entities.entity_level IS
  'Spec 00 section 1.3 rule 1: which level of the composite/atomic hierarchy this organisation is: group, '
  'legal_entity (the LEI-bearing entity) or operating_identity (for example a carrier SCAC). NULL for every '
  'non-organisation kind (CHECK) and NULL where the level is not recorded: a level is set by the seed where '
  'known and never guessed. Screens state it through entityLevelLabel() in src/lib/entities/resolve.mjs.';

-- 2. entity_relations -----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_relations (
  parent_entity_id text        NOT NULL REFERENCES public.entities(entity_id),
  child_entity_id  text        NOT NULL REFERENCES public.entities(entity_id),
  relation         text        NOT NULL,
  asserted_by      text        NOT NULL,
  asserted_at      timestamptz NOT NULL DEFAULT now(),
  source_id        uuid        REFERENCES public.sources(id),
  provenance       jsonb,
  PRIMARY KEY (parent_entity_id, child_entity_id, relation),
  CONSTRAINT entity_relations_relation_values CHECK (relation IN ('group_of', 'legal_entity_of', 'operating_identity_of')),
  CONSTRAINT entity_relations_not_self CHECK (parent_entity_id <> child_entity_id),
  CONSTRAINT entity_relations_asserted_by_present CHECK (btrim(asserted_by) <> ''),
  CONSTRAINT entity_relations_provenance_object CHECK (provenance IS NULL OR jsonb_typeof(provenance) = 'object')
);

CREATE INDEX IF NOT EXISTS entity_relations_child_idx ON public.entity_relations (child_entity_id);

COMMENT ON TABLE public.entity_relations IS
  'Declared relations between organisation entities (spec 00 section 1.3 rule 1): the composite/atomic hierarchy '
  '(group, legal entity, operating identity) as separate objects with declared relations, not one fuzzy object. '
  'The relation names the CHILD''s role toward the PARENT. No cycles (trigger). Every row says who asserted it '
  'and when, with an optional registered source and free-form provenance. Written by service_role only.';
COMMENT ON COLUMN public.entity_relations.relation IS
  'The child''s role toward the parent: legal_entity_of (child is a legal entity of the parent group), '
  'operating_identity_of (child is an operating identity of the parent legal entity), group_of (child is a '
  'sub-group of the parent group).';

CREATE OR REPLACE FUNCTION public.entity_relations_refuse_cycle() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- One writer at a time: two concurrent inserts cannot each pass the walk below and together close a loop.
  PERFORM pg_advisory_xact_lock(hashtextextended('entity_relations_cycle', 0));

  IF NEW.parent_entity_id = NEW.child_entity_id THEN
    RAISE EXCEPTION 'entity_relations: % cannot be its own parent', NEW.parent_entity_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- The ancestors of the new parent, through every relation type. On UPDATE the row being replaced is left out.
  IF EXISTS (
    WITH RECURSIVE ancestors(entity_id) AS (
      SELECT NEW.parent_entity_id
      UNION
      SELECT r.parent_entity_id
        FROM public.entity_relations r
        JOIN ancestors a ON r.child_entity_id = a.entity_id
       WHERE NOT (TG_OP = 'UPDATE'
                  AND r.parent_entity_id = OLD.parent_entity_id
                  AND r.child_entity_id = OLD.child_entity_id
                  AND r.relation = OLD.relation)
    )
    SELECT 1 FROM ancestors WHERE entity_id = NEW.child_entity_id
  ) THEN
    RAISE EXCEPTION 'entity_relations: % as the child of % would make the child an ancestor of its own parent (a cycle)',
      NEW.child_entity_id, NEW.parent_entity_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.entity_relations_refuse_cycle() FROM PUBLIC;
COMMENT ON FUNCTION public.entity_relations_refuse_cycle() IS
  'Refuses an entity_relations row whose child is already an ancestor of its parent (or is the parent). '
  'SECURITY INVOKER, search_path pinned. Migration 377.';

DROP TRIGGER IF EXISTS entity_relations_no_cycle_trg ON public.entity_relations;
CREATE TRIGGER entity_relations_no_cycle_trg
  BEFORE INSERT OR UPDATE OF parent_entity_id, child_entity_id ON public.entity_relations
  FOR EACH ROW EXECUTE FUNCTION public.entity_relations_refuse_cycle();

DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.entity_relations;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.entity_relations
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('parent_entity_id', 'child_entity_id');

ALTER TABLE public.entity_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_relations_read ON public.entity_relations;
CREATE POLICY entity_relations_read ON public.entity_relations FOR SELECT TO authenticated USING (true);
-- No INSERT, UPDATE or DELETE policy: writes arrive through the service-role client (RLS bypass).

REVOKE ALL ON public.entity_relations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.entity_relations FROM authenticated;
GRANT SELECT ON public.entity_relations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_relations TO service_role;

-- 3. entity_aliases -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_aliases (
  entity_id   text        NOT NULL REFERENCES public.entities(entity_id),
  alias       text        NOT NULL,
  alias_kind  text        NOT NULL,
  asserted_by text        NOT NULL,
  asserted_at timestamptz NOT NULL DEFAULT now(),
  source_id   uuid        REFERENCES public.sources(id),
  provenance  jsonb,
  PRIMARY KEY (entity_id, alias, alias_kind, asserted_by),
  CONSTRAINT entity_aliases_alias_values CHECK (btrim(alias) <> '' AND alias = btrim(regexp_replace(alias, '\s+', ' ', 'g'))),
  CONSTRAINT entity_aliases_kind_values CHECK (alias_kind IN ('name', 'short_name', 'former_name', 'ticker', 'scac', 'iata', 'other')),
  CONSTRAINT entity_aliases_asserted_by_present CHECK (btrim(asserted_by) <> ''),
  CONSTRAINT entity_aliases_provenance_object CHECK (provenance IS NULL OR jsonb_typeof(provenance) = 'object')
);

COMMENT ON TABLE public.entity_aliases IS
  'Name aliases of entities with provenance (spec 00 section 1.3 rule 2): who asserted each alias and when. '
  'Aliases are evidence, not edits: INSERT-only (an UPDATE, DELETE or TRUNCATE is refused by trigger), a '
  'correction is a new row with a later asserted_at, and an alias never overwrites entities.canonical_name. '
  'The alias text is stored trimmed with whitespace collapsed (CHECK). Read by resolveEntityByAlias() in '
  'src/lib/entities/resolve.mjs. Written by service_role only.';
COMMENT ON COLUMN public.entity_aliases.asserted_by IS
  'Provenance on the alias, never overwritten (the shape of entity_identifiers.asserted_by, migration 282): '
  'a script path, a rule id or an editor identity.';
COMMENT ON COLUMN public.entity_aliases.alias_kind IS
  'name, short_name, former_name, ticker, scac, iata or other. Kinds that coincide with an external identifier '
  'scheme (scac, iata) are still aliases here; the validated identifier lives in entity_identifiers.';

CREATE OR REPLACE FUNCTION public.entity_aliases_refuse_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'entity_aliases is insert-only: % is refused; a correction is a new row with a later asserted_at', TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;

REVOKE EXECUTE ON FUNCTION public.entity_aliases_refuse_change() FROM PUBLIC;
COMMENT ON FUNCTION public.entity_aliases_refuse_change() IS
  'Refuses UPDATE, DELETE and TRUNCATE on entity_aliases (aliases are evidence, never edited). SECURITY '
  'INVOKER, search_path pinned. Migration 377.';

DROP TRIGGER IF EXISTS entity_aliases_insert_only_trg ON public.entity_aliases;
CREATE TRIGGER entity_aliases_insert_only_trg
  BEFORE UPDATE OR DELETE ON public.entity_aliases
  FOR EACH ROW EXECUTE FUNCTION public.entity_aliases_refuse_change();

DROP TRIGGER IF EXISTS entity_aliases_no_truncate_trg ON public.entity_aliases;
CREATE TRIGGER entity_aliases_no_truncate_trg
  BEFORE TRUNCATE ON public.entity_aliases
  FOR EACH STATEMENT EXECUTE FUNCTION public.entity_aliases_refuse_change();

DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.entity_aliases;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.entity_aliases
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('entity_id');

ALTER TABLE public.entity_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_aliases_read ON public.entity_aliases;
CREATE POLICY entity_aliases_read ON public.entity_aliases FOR SELECT TO authenticated USING (true);
-- No INSERT, UPDATE or DELETE policy: writes arrive through the service-role client (RLS bypass).

REVOKE ALL ON public.entity_aliases FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.entity_aliases FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.entity_aliases FROM service_role;
GRANT SELECT ON public.entity_aliases TO authenticated;
GRANT SELECT, INSERT ON public.entity_aliases TO service_role;

-- 4. Self-check, with nothing surviving it (the sentinel exception rolls the inner block back) ------------
DO $$
DECLARE
  n_before   bigint;
  n_after    bigint;
  v_group    text := 'cl:organisation:00000000000377a1';
  v_legal    text := 'cl:organisation:00000000000377a2';
  v_oper     text := 'cl:organisation:00000000000377a3';
  v_juris    text := 'cl:jurisdiction:00000000000377b1';
  v_refused  boolean;
  v_n        bigint;
  v_name     text;
BEGIN
  SELECT count(*) INTO n_before FROM public.propagation_events;

  BEGIN
    INSERT INTO public.entities (entity_id, kind, canonical_name, entity_level) VALUES
      (v_group, 'organisation', 'migration 377 self-check group', 'group'),
      (v_legal, 'organisation', 'migration 377 self-check legal entity', 'legal_entity'),
      (v_oper,  'organisation', 'migration 377 self-check operating identity', 'operating_identity'),
      (v_juris, 'jurisdiction', 'migration 377 self-check jurisdiction', NULL);

    -- (a) entity_level is organisation-only and closed
    v_refused := false;
    BEGIN
      UPDATE public.entities SET entity_level = 'group' WHERE entity_id = v_juris;
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: entity_level was accepted on a non-organisation kind'; END IF;
    v_refused := false;
    BEGIN
      UPDATE public.entities SET entity_level = 'subsidiary' WHERE entity_id = v_group;
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: entity_level accepted a value outside group, legal_entity, operating_identity'; END IF;

    -- (b) the three Maersk-shaped objects keep their declared relations
    INSERT INTO public.entity_relations (parent_entity_id, child_entity_id, relation, asserted_by) VALUES
      (v_group, v_legal, 'legal_entity_of', 'migration 377 self-check'),
      (v_legal, v_oper, 'operating_identity_of', 'migration 377 self-check');
    SELECT count(*) INTO v_n FROM public.entity_relations WHERE parent_entity_id IN (v_group, v_legal);
    IF v_n <> 2 THEN RAISE EXCEPTION 'ABORT: the two declared relations did not persist (got %)', v_n; END IF;

    -- (c) a cycle is refused: a self edge, a direct reversal, a loop through the chain, and a loop made by UPDATE
    v_refused := false;
    BEGIN
      INSERT INTO public.entity_relations (parent_entity_id, child_entity_id, relation, asserted_by)
        VALUES (v_oper, v_oper, 'group_of', 'migration 377 self-check');
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: a self relation was accepted'; END IF;
    v_refused := false;
    BEGIN
      INSERT INTO public.entity_relations (parent_entity_id, child_entity_id, relation, asserted_by)
        VALUES (v_legal, v_group, 'group_of', 'migration 377 self-check');
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: a direct reversal (a two-node cycle) was accepted'; END IF;
    v_refused := false;
    BEGIN
      INSERT INTO public.entity_relations (parent_entity_id, child_entity_id, relation, asserted_by)
        VALUES (v_oper, v_group, 'group_of', 'migration 377 self-check');
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: a loop through the chain (a three-node cycle) was accepted'; END IF;
    INSERT INTO public.entity_relations (parent_entity_id, child_entity_id, relation, asserted_by)
      VALUES (v_group, v_oper, 'operating_identity_of', 'migration 377 self-check');
    v_refused := false;
    BEGIN
      UPDATE public.entity_relations SET parent_entity_id = v_oper, child_entity_id = v_group
       WHERE parent_entity_id = v_group AND child_entity_id = v_oper AND relation = 'operating_identity_of';
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: an UPDATE that closes a loop was accepted'; END IF;

    -- (d) aliases: two different aliases of one entity, different assertors, both persist; so do two asserters of
    -- the SAME alias; one asserter repeating itself is refused; the display name is untouched
    INSERT INTO public.entity_aliases (entity_id, alias, alias_kind, asserted_by) VALUES
      (v_legal, 'Self Check A/S', 'name', 'migration 377 self-check assertor one'),
      (v_legal, 'SCHK', 'short_name', 'migration 377 self-check assertor two');
    INSERT INTO public.entity_aliases (entity_id, alias, alias_kind, asserted_by)
      VALUES (v_legal, 'Self Check A/S', 'name', 'migration 377 self-check assertor two');
    SELECT count(*) INTO v_n FROM public.entity_aliases WHERE entity_id = v_legal AND alias = 'Self Check A/S' AND alias_kind = 'name';
    IF v_n <> 2 THEN RAISE EXCEPTION 'ABORT: two asserters of the same alias did not both persist (got % rows)', v_n; END IF;
    v_refused := false;
    BEGIN
      INSERT INTO public.entity_aliases (entity_id, alias, alias_kind, asserted_by)
        VALUES (v_legal, 'Self Check A/S', 'name', 'migration 377 self-check assertor two');
    EXCEPTION WHEN unique_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: a repeated assertion by the same asserter was accepted'; END IF;
    SELECT count(DISTINCT asserted_by) INTO v_n FROM public.entity_aliases WHERE entity_id = v_legal;
    IF v_n <> 2 THEN RAISE EXCEPTION 'ABORT: two aliases with different assertors did not both persist (got % assertors)', v_n; END IF;
    SELECT canonical_name INTO v_name FROM public.entities WHERE entity_id = v_legal;
    IF v_name <> 'migration 377 self-check legal entity' THEN RAISE EXCEPTION 'ABORT: an alias insert changed the display name'; END IF;

    -- (e) aliases are insert-only: UPDATE, DELETE and TRUNCATE are each refused
    v_refused := false;
    BEGIN
      UPDATE public.entity_aliases SET asserted_by = 'someone else' WHERE entity_id = v_legal AND alias = 'SCHK';
    EXCEPTION WHEN restrict_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: an alias UPDATE was accepted'; END IF;
    v_refused := false;
    BEGIN
      DELETE FROM public.entity_aliases WHERE entity_id = v_legal AND alias = 'SCHK';
    EXCEPTION WHEN restrict_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: an alias DELETE was accepted'; END IF;
    v_refused := false;
    BEGIN
      TRUNCATE public.entity_aliases;
    EXCEPTION WHEN restrict_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: an alias TRUNCATE was accepted'; END IF;

    -- (f) alias text and kind are checked: uncollapsed whitespace, an unknown kind and a blank assertor are each refused
    v_refused := false;
    BEGIN
      INSERT INTO public.entity_aliases (entity_id, alias, alias_kind, asserted_by) VALUES (v_legal, 'Self  Check', 'name', 'x');
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: an alias with uncollapsed whitespace was accepted'; END IF;
    v_refused := false;
    BEGIN
      INSERT INTO public.entity_aliases (entity_id, alias, alias_kind, asserted_by) VALUES (v_legal, 'Self Check', 'nickname', 'x');
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: an alias with an unknown alias_kind was accepted'; END IF;
    v_refused := false;
    BEGIN
      INSERT INTO public.entity_aliases (entity_id, alias, alias_kind, asserted_by) VALUES (v_legal, 'Self Check', 'name', '  ');
    EXCEPTION WHEN check_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: an alias with a blank asserted_by was accepted'; END IF;

    -- (g) the outbox recorded the writes: aliases under their own entity, relations under the child
    SELECT count(*) INTO v_n FROM public.propagation_events
     WHERE table_name = 'entity_aliases' AND entity_id = v_legal AND change_kind = 'insert';
    IF v_n <> 3 THEN RAISE EXCEPTION 'ABORT: expected 3 entity_aliases outbox rows under the legal entity, got %', v_n; END IF;
    SELECT count(*) INTO v_n FROM public.propagation_events
     WHERE table_name = 'entity_relations' AND entity_id = v_legal AND change_kind = 'insert';
    IF v_n <> 1 THEN RAISE EXCEPTION 'ABORT: expected 1 entity_relations outbox row under the child legal entity, got %', v_n; END IF;

    -- (h) privileges: authenticated may read and may not write; service_role may not change or remove an alias
    v_refused := false;
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO public.entity_aliases (entity_id, alias, alias_kind, asserted_by) VALUES (v_legal, 'Auth Insert', 'name', 'x');
    EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
    END;
    RESET ROLE;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: authenticated could insert an alias'; END IF;
    v_refused := false;
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO public.entity_relations (parent_entity_id, child_entity_id, relation, asserted_by)
        VALUES (v_group, v_juris, 'group_of', 'x');
    EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
    END;
    RESET ROLE;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: authenticated could insert a relation'; END IF;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.entity_aliases WHERE entity_id = v_legal;
    RESET ROLE;
    IF v_n <> 3 THEN RAISE EXCEPTION 'ABORT: authenticated could not read the aliases it is meant to read (got %)', v_n; END IF;
    v_refused := false;
    BEGIN
      SET LOCAL ROLE service_role;
      UPDATE public.entity_aliases SET asserted_by = 'someone else' WHERE entity_id = v_legal;
    EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
    END;
    RESET ROLE;
    IF NOT v_refused THEN RAISE EXCEPTION 'ABORT: service_role could update an alias'; END IF;

    RAISE EXCEPTION 'alias1_377_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'alias1_377_selfcheck_rollback' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO n_after FROM public.propagation_events;
  IF n_after <> n_before THEN
    RAISE EXCEPTION 'ABORT: the self-check left % propagation_events row(s) behind', n_after - n_before;
  END IF;
  IF EXISTS (SELECT 1 FROM public.entities WHERE entity_id IN (v_group, v_legal, v_oper, v_juris)) THEN
    RAISE EXCEPTION 'ABORT: the self-check left a fixture entity behind';
  END IF;
  IF EXISTS (SELECT 1 FROM public.entity_aliases WHERE entity_id IN (v_group, v_legal, v_oper, v_juris)) THEN
    RAISE EXCEPTION 'ABORT: the self-check left a fixture alias behind';
  END IF;
  IF EXISTS (SELECT 1 FROM public.entity_relations WHERE parent_entity_id IN (v_group, v_legal, v_oper, v_juris)) THEN
    RAISE EXCEPTION 'ABORT: the self-check left a fixture relation behind';
  END IF;
END $$;

-- 5. Post-checks (structure; the guards themselves were attacked above) ---------------------------------
DO $$
DECLARE
  n_cols int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'entities' AND column_name = 'entity_level' AND data_type = 'text' AND is_nullable = 'YES';
  IF n_cols <> 1 THEN RAISE EXCEPTION 'ABORT: entities.entity_level is missing, not text or not nullable after migration 377'; END IF;
  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'entity_relations';
  IF n_cols <> 7 THEN RAISE EXCEPTION 'ABORT: entity_relations has % columns, expected 7', n_cols; END IF;
  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'entity_aliases';
  IF n_cols <> 7 THEN RAISE EXCEPTION 'ABORT: entity_aliases has % columns, expected 7', n_cols; END IF;

  IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.entity_relations'::regclass, 'public.entity_aliases'::regclass) AND relrowsecurity) <> 2 THEN
    RAISE EXCEPTION 'ABORT: row level security is not enabled on both new tables';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('entity_relations', 'entity_aliases')) <> 2 THEN
    RAISE EXCEPTION 'ABORT: expected exactly one (read) policy on each new table';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'propagation_outbox_trg' AND NOT tgisinternal
        AND tgrelid IN ('public.entity_relations'::regclass, 'public.entity_aliases'::regclass)) <> 2 THEN
    RAISE EXCEPTION 'ABORT: propagation_outbox_trg is not attached to both new tables';
  END IF;
  IF (SELECT tgnargs FROM pg_trigger WHERE tgname = 'propagation_outbox_trg' AND tgrelid = 'public.entity_relations'::regclass) <> 2 THEN
    RAISE EXCEPTION 'ABORT: the entity_relations outbox trigger must carry the entity column argument';
  END IF;

  RAISE NOTICE 'migration 377 OK: entities.entity_level, entity_relations and entity_aliases created, guards attacked and rolled back, RLS on, 0 rows by design';
END $$;

COMMIT;
