-- subject: Migration 376 (lane OBL-2, 2026-10-08, spec 01 sections 3.2 to 3.6): `obligation_objects`, the obligation as the atomic unit of the Regulations surface, one row per versioned obligation of one instrument item (`obligation_id` is a `cl:obligation:<16 hex>` entity id registered in `entities` by the guard trigger, `supersedes` links versions), carrying pinpoint citation, a verbatim span proven verbatim in a held capture (`agent_run_searches.result_content`, ADR-016) by a BEFORE trigger, plain language, `binding_position` (the four codes), `duty_holder_class[]`, the `applicability_trigger` jsonb that put the row in scope, `jurisdiction[]`/`mode[]`/`vertical[]`, `frequency`, the four dates as four columns, evidence and retention, the cost slots carried separately (penalty exposure as `statutory_maximum` or `cost_formula`, `direct_compliance_cost` jsonb, `effort` jsonb never money), the three-value `status` (yes, no, not_assessed; default not_assessed), review dates, `source_id` and `capture_id`; RLS read for authenticated on the parent item not being archived, no write grant to anyone but service_role; outbox trigger in migration 352's two-argument form keyed on the instrument's entity; `obligations` gains nullable `obligation_id` so forward events hang off objects; APPLIED (production ledger version 20261008233421, as of 2026-10-08), zero rows by construction, population is a later grounded drain batch.
-- 376 -- obligation_objects: the obligation object of spec 01 section 3.2 (lane OBL-2, 2026-10-08).
--
-- APPLIED (production ledger version 20261008233421, as of 2026-10-08). Authored by lane OBL-2; the coordinator applies it (two-track policy, CLAUDE.md standing rule 3).
-- Requires 282 (entities), 283 (intelligence_items.instrument_entity_id), 284 and 352 (the outbox and its two-argument
-- trigger function), 112 and 264 (agent_run_searches.result_content), 290 (obligations). Zero rows by construction:
-- no population here (operator ruling 2026-10-04: no data population until every build layer is complete).
--
-- WHY. OBL-1's register (fsi-app/scripts/tmp/obl1-obligations-register-2026-10-08.md section 8) found the obligation
-- layer for the four forwarder-direct instruments absent: migration 290's `obligations` is event grain with 14
-- columns and carries no pinpoint, verbatim text, duty-holder class, applicability trigger, four dates, cost slots or
-- version. This table is the spec 01 section 3.2 object. `obligations` is NOT dropped or rewritten (ADR-043, standing
-- rule 1): it stays the forward-event record, and gains `obligation_id` so a forward event can hang off an object.
--
-- DECISIONS, each stated so a reviewer can disagree with it.
--  1. ID SHAPE. The brief says `cl:oblig:<16 hex>`; migration 282's CHECK `id_matches_kind` requires an entity_id of
--     kind `obligation` to start `cl:obligation:`, and src/lib/entities/entity-id.mjs mints `cl:<kind>:<16 hex>` for
--     every kind. The real shape is therefore `cl:obligation:<16 lowercase hex>` (CHECK below); `cl:oblig:` could never
--     be registered in `entities`.
--  2. VERBATIM GUARD IS A TRIGGER, NOT AN RPC. The capture text lives in `agent_run_searches.result_content` (the full
--     captured source, migration 264 / ADR-016). A SECURITY DEFINER trigger function can read it, so the guard is the
--     BEFORE INSERT OR UPDATE trigger `obligation_objects_guard` and no `insert_obligation_object` RPC is built. The
--     span rule is validate_item_provenance criterion 3 (migrations 114/119): lower(btrim(span)) is a substring of
--     lower(result_content) of a capture of THIS item. Migration 356's `item_corrections_span_is_verbatim` states the
--     same rule but is itself NOT APPLIED, so this migration does not depend on it; the rule is written once here.
--  3. CAPTURE NAMING. section_claim_provenance names a capture by `search_result_id uuid REFERENCES
--     agent_run_searches(id)` (migration 112). `capture_id` here is the same FK target (agent_run_searches.id), NOT
--     NULL: an obligation object without a held capture has no verbatim proof and is refused.
--  4. instrument_item_id IS NOT NULL. The brief types it as a bare FK; the capture must belong to the instrument item
--     and the outbox is keyed on the instrument's entity, so a row without one is meaningless.
--  5. instrument_entity_id (text FK entities) is a column, not computed at emit time, because
--     emit_propagation_event('obligation_id','instrument_entity_id') (migration 352) reads the entity from a column of
--     the changed row. The guard trigger fills it from intelligence_items.instrument_entity_id (migration 283). An
--     instrument with no entity yet leaves it NULL and the outbox row carries a NULL entity, exactly as 352 does for
--     an unknown corridor.
--  6. SPEC 01 section 3.2 `owner`, `control_action` and the section 4 evidence upload are NOT columns: they are
--     customer-entered data (ADR-042, ADR-043). `evidence_required` and `retention_period` are external-law attributes
--     (what the regulation says to keep, and for how long), not customer uploads, and are kept.
--  7. COST SLOTS, never merged (spec 01 section 3.4; coordinator addendum 2026-10-08): slot 1 penalty exposure is
--     `statutory_maximum` (text, as published) and `cost_formula` (text, only where a published formula exists);
--     slot 2 `direct_compliance_cost` jsonb {amount, currency, basis, source}; slot 3 `effort` jsonb {person_days,
--     recurrence}. A CHECK refuses an `effort` object that carries a money key (amount, currency, price, cost): effort
--     is never money. Nothing in this table computes or sums across slots.
--  8. FOUR DATES are four nullable columns (entry_into_force, date_of_application, first_deadline, enforcement_start),
--     never collapsed; a date is NULL rather than invented.
--  9. duty_holder_class VALUES have no CHECK here (coordinator ruling 2026-10-08): the authoritative list is
--     DUTY_HOLDER_CLASSES in src/lib/contracts/vocabularies.mjs (spec 01 section 3.2 list, each with a definition
--     line); spec 01 section 10 treats volatile taxonomies as data, and the vocabulary module is the one site. The
--     static test asserts every fixture row's classes are in it. The column is only required to be non-empty.
-- 10. ADMIN OVERRIDE. No automatic writer for this table exists in this lane. Migration 356's correction kinds do not
--     include obligation objects; an override mechanism for this table is not built here (recorded in the lane log).
--
-- Reversible: DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.obligation_objects;
--   ALTER TABLE public.obligations DROP COLUMN IF EXISTS obligation_id;
--   DROP TABLE public.obligation_objects; DROP FUNCTION public.obligation_objects_guard();
--   (0 rows until populated; entities rows of kind obligation, if any were registered, stay as tombstone-able entities.)

BEGIN;

-- Preconditions ----------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist, migration 282 must be applied first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'intelligence_items' AND column_name = 'instrument_entity_id') THEN
    RAISE EXCEPTION 'ABORT: intelligence_items.instrument_entity_id does not exist, migration 283 must be applied first';
  END IF;
  IF to_regclass('public.propagation_events') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.propagation_events does not exist, migration 284 must be applied first';
  END IF;
  IF position('TG_NARGS' IN pg_get_functiondef('public.emit_propagation_event()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'ABORT: emit_propagation_event() does not take the optional entity column argument, migration 352 must be applied first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'agent_run_searches' AND column_name = 'result_content') THEN
    RAISE EXCEPTION 'ABORT: agent_run_searches.result_content does not exist, migration 264 must be applied first';
  END IF;
  IF to_regclass('public.obligations') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.obligations does not exist, migration 290 must be applied first';
  END IF;
  IF to_regclass('public.sources') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.sources does not exist';
  END IF;
END $$;

-- The table --------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.obligation_objects (
  obligation_id          text        PRIMARY KEY REFERENCES public.entities(entity_id),
  instrument_item_id     uuid        NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  instrument_entity_id   text        REFERENCES public.entities(entity_id),
  version                int         NOT NULL DEFAULT 1,
  supersedes             text        REFERENCES public.obligation_objects(obligation_id),
  pinpoint_citation      text        NOT NULL,
  verbatim_text          text        NOT NULL,
  plain_language         text,
  binding_position       text        NOT NULL,
  duty_holder_class      text[]      NOT NULL,
  applicability_trigger  jsonb       NOT NULL,
  jurisdiction           text[],
  mode                   text[],
  vertical               text[],
  frequency              text,
  entry_into_force       date,
  date_of_application    date,
  first_deadline         date,
  enforcement_start      date,
  evidence_required      text,
  retention_period       text,
  sanction_class         text,
  severity_score         int,
  statutory_maximum      text,
  cost_formula           text,
  direct_compliance_cost jsonb,
  effort                 jsonb,
  status                 text        NOT NULL DEFAULT 'not_assessed',
  date_reviewed          date,
  next_review_due        date,
  source_id              uuid        REFERENCES public.sources(id),
  capture_id             uuid        NOT NULL REFERENCES public.agent_run_searches(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT obligation_objects_id_shape_check
    CHECK (obligation_id ~ '^cl:obligation:[0-9a-f]{16}$'),
  CONSTRAINT obligation_objects_version_check
    CHECK (version >= 1),
  CONSTRAINT obligation_objects_not_self_superseding_check
    CHECK (supersedes IS NULL OR supersedes <> obligation_id),
  CONSTRAINT obligation_objects_pinpoint_nonblank_check
    CHECK (btrim(pinpoint_citation) <> ''),
  CONSTRAINT obligation_objects_verbatim_nonblank_check
    CHECK (btrim(verbatim_text) <> ''),
  CONSTRAINT obligation_objects_binding_position_check
    CHECK (binding_position IN ('direct_duty', 'carrier_passthrough', 'customer_contract', 'monitoring_only')),
  CONSTRAINT obligation_objects_duty_holder_nonempty_check
    CHECK (cardinality(duty_holder_class) >= 1),
  -- The profile attribute that includes the row: {"attribute": "...", "value": "..."} (spec 01 section 3.5 design
  -- rule: every register row carries the trigger that put it there). Both keys are non-blank strings.
  CONSTRAINT obligation_objects_trigger_shape_check
    -- PRESENCE FIRST: jsonb_typeof(col -> 'k') is NULL when k is absent, and a CHECK whose condition is NULL PASSES,
    -- so a type test alone accepted '{"attribute":"org_role"}' (production apply of 376 aborted on self-check step
    -- (e), 2026-10-08). Every key a CHECK inspects through jsonb_typeof is paired with a presence test on that key.
    CHECK (jsonb_typeof(applicability_trigger) = 'object'
       AND applicability_trigger ? 'attribute'
       AND applicability_trigger ? 'value'
       AND jsonb_typeof(applicability_trigger -> 'attribute') = 'string'
       AND jsonb_typeof(applicability_trigger -> 'value') = 'string'
       AND btrim(applicability_trigger ->> 'attribute') <> ''
       AND btrim(applicability_trigger ->> 'value') <> ''),
  -- Same canonical-mode rule as obligations_modes_no_alias_check (migration 290): aliases are never stored.
  CONSTRAINT obligation_objects_mode_no_alias_check
    CHECK (mode IS NULL OR NOT (mode && ARRAY['sea', 'maritime', 'water', 'vessel', 'marine', 'truck', 'lorry', 'hgv',
                                              'barge', 'iww', 'inland-waterway', 'freighter', 'airfreight']::text[])),
  CONSTRAINT obligation_objects_frequency_check
    CHECK (frequency IS NULL OR frequency IN ('annual', 'per_consignment', 'per_voyage', 'event_triggered')),
  -- Spec 01 section 3.2: status is exactly three values; "not assessed" is a first-class state, never a null.
  CONSTRAINT obligation_objects_status_check
    CHECK (status IN ('yes', 'no', 'not_assessed')),
  CONSTRAINT obligation_objects_direct_cost_shape_check
    CHECK (direct_compliance_cost IS NULL
       OR (jsonb_typeof(direct_compliance_cost) = 'object'
           AND direct_compliance_cost ?& ARRAY['amount', 'currency', 'basis', 'source']
           AND jsonb_typeof(direct_compliance_cost -> 'amount') = 'number')),
  CONSTRAINT obligation_objects_effort_shape_check
    CHECK (effort IS NULL
       OR (jsonb_typeof(effort) = 'object'
           AND effort ?& ARRAY['person_days', 'recurrence']
           AND jsonb_typeof(effort -> 'person_days') = 'number')),
  -- Effort is never money: a money key inside it is refused, so the slot cannot be read as a cost.
  CONSTRAINT obligation_objects_effort_not_money_check
    CHECK (effort IS NULL OR NOT (effort ?| ARRAY['amount', 'currency', 'price', 'cost']))
);

COMMENT ON TABLE public.obligation_objects IS
  'The obligation object (spec 01 section 3.2): one row per versioned obligation of one instrument item. The atom of '
  'the Regulations surface; migration 290 obligations stays the forward-event record and points here through '
  'obligations.obligation_id. verbatim_text is proven verbatim in the held capture by obligation_objects_guard '
  '(ADR-016). Cost slots are separate columns and are never merged or summed.';
COMMENT ON COLUMN public.obligation_objects.obligation_id IS
  'cl:obligation:<16 lowercase hex> (entity kind obligation, migration 282). Registered in entities by the guard '
  'trigger. A new version of an obligation is a new row with a new id and supersedes pointing at the old one.';
COMMENT ON COLUMN public.obligation_objects.verbatim_text IS
  'The provision text, verbatim in the capture named by capture_id (lower(btrim()) substring of '
  'agent_run_searches.result_content, the criterion 3 rule). Never truncated.';
COMMENT ON COLUMN public.obligation_objects.applicability_trigger IS
  '{"attribute": <profile attribute>, "value": <value>}: the profile answer that put this row in scope. Read by '
  'src/lib/workspace/relevance.mjs at obligation grain and shown on the detail page binding banner.';
COMMENT ON COLUMN public.obligation_objects.statutory_maximum IS
  'Cost slot 1 (penalty exposure), as published. Never a modelled number (spec 01 section 3.4).';
COMMENT ON COLUMN public.obligation_objects.cost_formula IS
  'Cost slot 1 (penalty exposure), only where a published formula exists.';
COMMENT ON COLUMN public.obligation_objects.direct_compliance_cost IS
  'Cost slot 2: {amount, currency, basis, source}. Verifier fees, certificate purchase, registration fees: knowable.';
COMMENT ON COLUMN public.obligation_objects.effort IS
  'Cost slot 3: {person_days, recurrence}. Never money; a money key is refused by obligation_objects_effort_not_money_check.';
COMMENT ON COLUMN public.obligation_objects.status IS
  'yes | no | not_assessed. not_assessed is the default and a first-class state.';

CREATE INDEX IF NOT EXISTS idx_obligation_objects_instrument_item
  ON public.obligation_objects (instrument_item_id);
CREATE INDEX IF NOT EXISTS idx_obligation_objects_instrument_entity
  ON public.obligation_objects (instrument_entity_id) WHERE instrument_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obligation_objects_supersedes
  ON public.obligation_objects (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obligation_objects_capture
  ON public.obligation_objects (capture_id);

-- The guard: entity registration, instrument entity, supersession sanity, verbatim span -----------------------------
CREATE OR REPLACE FUNCTION public.obligation_objects_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_capture_item uuid;
  v_capture_text text;
  v_item_entity  text;
  v_item_title   text;
  v_prev         record;
BEGIN
  -- The capture must be a held capture of THIS instrument item, and the span must be verbatim in it.
  SELECT ars.intelligence_item_id, ars.result_content
    INTO v_capture_item, v_capture_text
    FROM public.agent_run_searches ars
   WHERE ars.id = NEW.capture_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'obligation_object_capture_missing: capture_id % is not an agent_run_searches row', NEW.capture_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_capture_item IS DISTINCT FROM NEW.instrument_item_id THEN
    RAISE EXCEPTION 'obligation_object_capture_not_of_instrument: capture % belongs to another item than instrument_item_id %', NEW.capture_id, NEW.instrument_item_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_capture_text IS NULL
     OR btrim(NEW.verbatim_text) = ''
     OR position(lower(btrim(NEW.verbatim_text)) IN lower(v_capture_text)) = 0 THEN
    RAISE EXCEPTION 'obligation_object_span_not_verbatim: verbatim_text is not verbatim in capture % (ADR-016, validate_item_provenance criterion 3)', NEW.capture_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- The instrument's entity (migration 283), read here so the outbox trigger can name it (migration 352).
  SELECT i.instrument_entity_id, i.title INTO v_item_entity, v_item_title
    FROM public.intelligence_items i WHERE i.id = NEW.instrument_item_id;
  IF NEW.instrument_entity_id IS NULL THEN
    NEW.instrument_entity_id := v_item_entity;
  END IF;

  -- Versioning: a superseding row is a later version of an object of the same instrument.
  IF NEW.supersedes IS NOT NULL THEN
    SELECT o.version, o.instrument_item_id INTO v_prev FROM public.obligation_objects o WHERE o.obligation_id = NEW.supersedes;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'obligation_object_supersedes_missing: % does not exist', NEW.supersedes USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_prev.instrument_item_id IS DISTINCT FROM NEW.instrument_item_id THEN
      RAISE EXCEPTION 'obligation_object_supersedes_other_instrument: % belongs to another instrument item', NEW.supersedes USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.version <= v_prev.version THEN
      RAISE EXCEPTION 'obligation_object_version_not_increasing: version % must exceed superseded version %', NEW.version, v_prev.version USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Register the object as an entity of kind obligation (the id is the entity id; the FK is satisfied after this
    -- BEFORE trigger). Idempotent: a re-registered id keeps its original row.
    INSERT INTO public.entities (entity_id, kind, canonical_name)
    VALUES (NEW.obligation_id, 'obligation',
            left(coalesce(v_item_title, 'instrument') || ' ' || NEW.pinpoint_citation || ' v' || NEW.version::text, 500))
    ON CONFLICT (entity_id) DO NOTHING;
  ELSE
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END $fn$;

COMMENT ON FUNCTION public.obligation_objects_guard() IS
  'BEFORE INSERT OR UPDATE guard on obligation_objects: capture belongs to the instrument item, verbatim_text is verbatim '
  'in it (ADR-016), fills instrument_entity_id, checks supersession, registers the obligation entity on insert.';

REVOKE ALL ON FUNCTION public.obligation_objects_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS obligation_objects_guard_trg ON public.obligation_objects;
CREATE TRIGGER obligation_objects_guard_trg
  BEFORE INSERT OR UPDATE ON public.obligation_objects
  FOR EACH ROW EXECUTE FUNCTION public.obligation_objects_guard();

-- The outbox, in migration 352's two-argument form: the pk column and the column that names the entity ---------------
DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.obligation_objects;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.obligation_objects
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('obligation_id', 'instrument_entity_id');

-- RLS and grants: read for authenticated on the parent item not being archived; writes service_role only ---------------
ALTER TABLE public.obligation_objects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.obligation_objects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.obligation_objects TO authenticated;
GRANT ALL ON public.obligation_objects TO service_role;

DROP POLICY IF EXISTS obligation_objects_read ON public.obligation_objects;
CREATE POLICY obligation_objects_read ON public.obligation_objects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.intelligence_items i
       WHERE i.id = obligation_objects.instrument_item_id
         AND i.is_archived = false
    )
  );
-- No INSERT, UPDATE or DELETE policy and no write grant: the service-role path is the only writer.

-- obligations: forward events hang off objects. Nullable, no backfill (data track, later) --------------------------------
ALTER TABLE public.obligations
  ADD COLUMN IF NOT EXISTS obligation_id text REFERENCES public.obligation_objects(obligation_id);
COMMENT ON COLUMN public.obligations.obligation_id IS
  'The obligation object (migration 376) this forward event belongs to. NULL until a population pass links it; no backfill in the migration.';
CREATE INDEX IF NOT EXISTS idx_obligations_obligation_id
  ON public.obligations (obligation_id) WHERE obligation_id IS NOT NULL;

-- Self-check, rolled back by a sentinel exception: nothing from it survives --------------------------------------------
DO $selfcheck$
DECLARE
  v_item     uuid;
  v_cap      uuid;
  v_inst_ent text := 'cl:instrument:00000000000000b1';
  v_oid      text := 'cl:obligation:00000000000000c1';
  v_oid2     text := 'cl:obligation:00000000000000c2';
  v_capture  text := 'FIXTURE capture text. Indirect customs representatives must apply for authorised CBAM declarant status. End of fixture.';
  v_span     text := 'indirect customs representatives must apply for authorised CBAM declarant status';
  v_trig     jsonb := '{"attribute":"org_role","value":"forwarder"}';
  v_n        bigint;
  v_n_before bigint;
  v_n_after  bigint;
  v_status   text;
  v_ent      text;
  v_refused  boolean;
  v_rls_on   boolean;
BEGIN
  SELECT count(*) INTO v_n_before FROM public.propagation_events;
  SELECT relrowsecurity INTO v_rls_on FROM pg_class WHERE oid = 'public.obligation_objects'::regclass;
  IF NOT v_rls_on THEN RAISE EXCEPTION '376 self-check FAILED: RLS is not enabled on obligation_objects'; END IF;

  SELECT i.id INTO v_item FROM public.intelligence_items i ORDER BY i.id LIMIT 1;
  IF v_item IS NULL THEN
    RAISE NOTICE '376 self-check: no intelligence_items row, fixture steps skipped';
  ELSE
    BEGIN
      INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (v_inst_ent, 'instrument', '376 self-check instrument');
      UPDATE public.intelligence_items SET instrument_entity_id = v_inst_ent WHERE id = v_item;
      INSERT INTO public.agent_run_searches (id, intelligence_item_id, result_content)
      VALUES (gen_random_uuid(), v_item, v_capture) RETURNING id INTO v_cap;

      -- (a) a verbatim span inserts; status defaults to not_assessed; the entity is registered; the instrument entity is filled
      INSERT INTO public.obligation_objects (obligation_id, instrument_item_id, pinpoint_citation, verbatim_text, binding_position,
                                             duty_holder_class, applicability_trigger, capture_id)
      VALUES (v_oid, v_item, 'FIXTURE pinpoint', v_span, 'direct_duty', ARRAY['customs_representative_indirect'], v_trig, v_cap);
      SELECT o.status, o.instrument_entity_id INTO v_status, v_ent FROM public.obligation_objects o WHERE o.obligation_id = v_oid;
      IF v_status IS DISTINCT FROM 'not_assessed' THEN
        RAISE EXCEPTION '376 self-check FAILED: status default is %, expected not_assessed', v_status;
      END IF;
      IF v_ent IS DISTINCT FROM v_inst_ent THEN
        RAISE EXCEPTION '376 self-check FAILED: instrument_entity_id is %, expected the instrument entity', v_ent;
      END IF;
      SELECT count(*) INTO v_n FROM public.entities WHERE entity_id = v_oid AND kind = 'obligation';
      IF v_n <> 1 THEN RAISE EXCEPTION '376 self-check FAILED: the obligation entity was not registered'; END IF;

      -- (b) the outbox row carries the instrument's entity
      SELECT count(*) INTO v_n FROM public.propagation_events
       WHERE table_name = 'obligation_objects' AND row_pk = v_oid AND change_kind = 'insert' AND entity_id = v_inst_ent;
      IF v_n <> 1 THEN RAISE EXCEPTION '376 self-check FAILED: the outbox row does not carry the instrument entity'; END IF;

      -- (c) a paraphrase is refused on INSERT
      v_refused := false;
      BEGIN
        INSERT INTO public.obligation_objects (obligation_id, instrument_item_id, pinpoint_citation, verbatim_text, binding_position,
                                               duty_holder_class, applicability_trigger, capture_id)
        VALUES (v_oid2, v_item, 'FIXTURE pinpoint 2', 'customs representatives need to register as CBAM declarants', 'direct_duty',
                ARRAY['customs_representative_indirect'], v_trig, v_cap);
      EXCEPTION WHEN check_violation THEN
        IF SQLERRM LIKE 'obligation_object_span_not_verbatim%' THEN v_refused := true; ELSE RAISE; END IF;
      END;
      IF NOT v_refused THEN RAISE EXCEPTION '376 self-check FAILED: a paraphrase was accepted on INSERT'; END IF;

      -- (d) a paraphrase is refused on UPDATE
      v_refused := false;
      BEGIN
        UPDATE public.obligation_objects SET verbatim_text = 'a paraphrase that is not in the capture' WHERE obligation_id = v_oid;
      EXCEPTION WHEN check_violation THEN
        IF SQLERRM LIKE 'obligation_object_span_not_verbatim%' THEN v_refused := true; ELSE RAISE; END IF;
      END;
      IF NOT v_refused THEN RAISE EXCEPTION '376 self-check FAILED: a paraphrase was accepted on UPDATE'; END IF;

      -- (e) the CHECKs fire: a fourth status, an empty duty holder, money inside effort, a trigger with no value
      v_refused := false;
      BEGIN UPDATE public.obligation_objects SET status = 'maybe' WHERE obligation_id = v_oid;
      EXCEPTION WHEN check_violation THEN v_refused := true; END;
      IF NOT v_refused THEN RAISE EXCEPTION '376 self-check FAILED: status maybe was accepted'; END IF;
      v_refused := false;
      BEGIN UPDATE public.obligation_objects SET duty_holder_class = ARRAY[]::text[] WHERE obligation_id = v_oid;
      EXCEPTION WHEN check_violation THEN v_refused := true; END;
      IF NOT v_refused THEN RAISE EXCEPTION '376 self-check FAILED: an empty duty_holder_class was accepted'; END IF;
      v_refused := false;
      BEGIN UPDATE public.obligation_objects SET effort = '{"person_days": 3, "recurrence": "annual", "currency": "EUR"}' WHERE obligation_id = v_oid;
      EXCEPTION WHEN check_violation THEN v_refused := true; END;
      IF NOT v_refused THEN RAISE EXCEPTION '376 self-check FAILED: effort carrying a money key was accepted'; END IF;
      v_refused := false;
      BEGIN UPDATE public.obligation_objects SET applicability_trigger = '{"attribute":"org_role"}' WHERE obligation_id = v_oid;
      EXCEPTION WHEN check_violation THEN v_refused := true; END;
      IF NOT v_refused THEN RAISE EXCEPTION '376 self-check FAILED: a trigger with no value was accepted'; END IF;

      -- (f) the three cost slots and the four dates are separate and accepted when well formed
      UPDATE public.obligation_objects
         SET statutory_maximum = 'FIXTURE maximum', cost_formula = NULL,
             direct_compliance_cost = '{"amount": 100, "currency": "EUR", "basis": "FIXTURE", "source": "FIXTURE"}',
             effort = '{"person_days": 2, "recurrence": "annual"}',
             entry_into_force = DATE '2026-06-02', date_of_application = DATE '2030-12-02'
       WHERE obligation_id = v_oid;

      -- (g) attack the grants as role authenticated: no write path
      SET LOCAL ROLE authenticated;
      v_refused := false;
      BEGIN
        INSERT INTO public.obligation_objects (obligation_id, instrument_item_id, pinpoint_citation, verbatim_text, binding_position,
                                               duty_holder_class, applicability_trigger, capture_id)
        VALUES (v_oid2, v_item, 'FIXTURE pinpoint 2', v_span, 'direct_duty', ARRAY['forwarder'], v_trig, v_cap);
      EXCEPTION WHEN insufficient_privilege THEN v_refused := true; END;
      RESET ROLE;
      IF NOT v_refused THEN RAISE EXCEPTION '376 self-check FAILED: authenticated could INSERT into obligation_objects'; END IF;
      SET LOCAL ROLE authenticated;
      v_refused := false;
      BEGIN UPDATE public.obligation_objects SET status = 'yes' WHERE obligation_id = v_oid;
      EXCEPTION WHEN insufficient_privilege THEN v_refused := true; END;
      RESET ROLE;
      IF NOT v_refused THEN RAISE EXCEPTION '376 self-check FAILED: authenticated could UPDATE obligation_objects'; END IF;

      RAISE EXCEPTION 'c376_selfcheck_rollback';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'c376_selfcheck_rollback' THEN RAISE; END IF;
    END;
  END IF;

  SELECT count(*) INTO v_n_after FROM public.propagation_events;
  IF v_n_after <> v_n_before THEN
    RAISE EXCEPTION '376 self-check FAILED: left % propagation_events row(s) behind', v_n_after - v_n_before;
  END IF;
  SELECT count(*) INTO v_n FROM public.obligation_objects;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '376 self-check FAILED: obligation_objects is not empty (% rows), this migration ships schema only', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.entities WHERE entity_id IN (v_oid, v_oid2, v_inst_ent)) THEN
    RAISE EXCEPTION '376 self-check FAILED: a fixture entity survived';
  END IF;

  RAISE NOTICE 'migration 376 OK: obligation_objects created (guard + outbox triggers, RLS on, 0 rows), obligations.obligation_id added; self-check fixtures rolled back';
END
$selfcheck$;

COMMIT;
