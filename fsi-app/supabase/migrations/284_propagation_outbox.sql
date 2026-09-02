-- 284 — the propagation outbox: propagation_events + emit_propagation_event() (Lane DP-ENGINE,
-- system-completion train, 2026-09-02 — docs/specs/08-flywheel-design.md §2.1-§2.2 Part 1;
-- docs/decisions/ADR-024-decision-propagation.md).
--
-- WHAT THIS IS. Spec §2.2 Part 1: "A Postgres trigger writes the event in the SAME transaction as the
-- change, so an event cannot be lost and cannot exist for a write that rolled back." This migration ships
-- the outbox table and the trigger function that appends to it — nothing more. Per spec §2.1's binding
-- constraint ("nothing armed... no path that falls back to spend"), NOTHING here computes, recomputes, or
-- invalidates: the trigger's only job is a cheap, row-level INSERT. Invalidation (marking dependents
-- stale) and recomputation both live in migration 285 (`invalidate_dependents()`) and are INVOKED ONLY
-- BY THE GOVERNED DRAIN (`src/lib/propagation/drain.ts`), never by a trigger — "propagation invalidates,
-- it does not compute" (spec §2.2) is read literally here: the WRITE-TIME trigger does not even invalidate,
-- it only records that something happened. Invalidation is deferred to drain time so a burst of writes to
-- `emission_factors` cannot cascade a recursive UPDATE across `derived_values` inside someone else's
-- INSERT transaction, holding locks across a dependency fan-out — the exact "classic mistake" spec §2.1
-- names and rules out for the SAME reason it rules out recompute-in-trigger.
--
-- DEVIATION FROM THE SPEC'S OWN ILLUSTRATIVE DDL, STATED UP FRONT (spec's `propagation_events` uses
-- `subject_id text NOT NULL REFERENCES entities(entity_id)` and a free-text `event_type`). This lane
-- builds the DP-SPINE-handed schema instead, per the governing plan's literal instruction to this lane:
--
--   propagation_events(event_id bigserial PK, occurred_at, table_name text, row_pk text,
--                       entity_id text references entities NULL, change_kind text CHECK
--                       (insert/update/delete/supersede), old_row jsonb, new_row jsonb,
--                       txid bigint default txid_current(), drained_at timestamptz null,
--                       drain_run_id text null)
--
-- WHY: the spec's `subject_id NOT NULL REFERENCES entities` cannot be satisfied by this lane's actual
-- source tables today. `emission_factors`, `market_series`, and `regional_data_facts` — three of the four
-- tables spec §2.1's own worked example (§2.3) names as propagation sources — carry NO entity_id column
-- (DP-SPINE's migration 283 deliberately left `emission_factors.corridor_id` as text per migration 258,
-- "do not touch" — see ADR-024 decision 4's own note; `market_series`/`regional_data_facts` were never in
-- DP-SPINE's progressive-re-keying scope at all). A NOT-NULL entity_id FK would make this migration
-- inapplicable to its own stated trigger targets. `(table_name, row_pk)` is the honest generic address —
-- IDENTICAL in shape to `derivation_edges.(from_table, from_pk)` (migration 285), which is what lets
-- `invalidate_dependents()` join an outbox event directly onto the DAG with no translation layer:
-- `derivation_edges e WHERE e.from_table = propagation_events.table_name AND e.from_pk =
-- propagation_events.row_pk`. `entity_id` is carried ADDITIONALLY, nullable, populated when the changed
-- row happens to carry one (true for `derived_values`/`statutory_computations`/`estimated_values`, all
-- created in migrations 285/286 with an entity_id column) — this is what lets a future reader group events
-- by the customer-facing entity they concern without requiring every source row to have one today.
-- `change_kind` (insert/update/delete/supersede) is this lane's own addition beyond the spec's single
-- `event_type` free-text column: "supersede" is detected structurally (a row whose `superseded_by`/
-- equivalent column moved from NULL to NOT NULL — see the trigger below), giving the drain a
-- machine-distinguishable "this is a correction, not merely an update" signal spec §2.3's worked example
-- narrates in prose ("factor cl:method:glec-road-eu v3.1 superseded by v3.2") but its own DDL block never
-- encodes as a queryable value.
--
-- TRIGGERS ATTACHED HERE: `emission_factors`, `market_series`, `regional_data_facts` — the three source
-- tables that already exist. The spec's fourth trigger target, `derived_values`, does not exist until
-- migration 285 creates it in the SAME commit; that migration attaches the identical trigger to
-- `derived_values`, and migration 286 attaches it to `statutory_computations`/`estimated_values` (also
-- spec-named propagation sources, both created there) — the trigger FUNCTION is defined once, here, and
-- reused by every later CREATE TRIGGER, exactly the "one function, many attachments" shape
-- `emission_factors_append_only()` (migration 258) already established in this schema.
--
-- CHEAP BY CONSTRUCTION (spec §2.1's "triggers must be cheap"): one INSERT, no subquery, no join, no
-- recursive walk, no call to any other function. The only computation is a jsonb key-diff against
-- `updated_at` (mirroring spec §2.2's own `emit_propagation_event()` body verbatim: "Only emit when a
-- MATERIAL field moved... emitting on every UPDATE makes the outbox a write-amplifier") plus the
-- `change_kind` classification, both O(1) in the row's own column count.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: no invalidation, no recompute, nothing scheduled, nothing armed —
-- same posture migration 258's own header states for its own append-only trigger ("nothing scheduled,
-- nothing armed... the only trigger here refuses writes"; this one only records, an even narrower job).

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist — migration 282 (Lane DP-SPINE) must be applied first';
  END IF;
  IF to_regclass('public.emission_factors') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.emission_factors does not exist — migration 258 must be applied first';
  END IF;
  IF to_regclass('public.market_series') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.market_series does not exist — migration 268 must be applied first';
  END IF;
  IF to_regclass('public.regional_data_facts') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.regional_data_facts does not exist — migration 106 must be applied first';
  END IF;
END $$;

-- ── propagation_events — the outbox ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.propagation_events (
  event_id      bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  table_name    text NOT NULL,
  row_pk        text NOT NULL,
  entity_id     text REFERENCES public.entities(entity_id),
  change_kind   text NOT NULL CHECK (change_kind IN ('insert', 'update', 'delete', 'supersede')),
  old_row       jsonb,
  new_row       jsonb,
  txid          bigint NOT NULL DEFAULT txid_current(),
  drained_at    timestamptz,
  drain_run_id  text
);

COMMENT ON TABLE public.propagation_events IS
  'The transactional outbox (spec 08 §2.2 Part 1): one row per material change to a propagation source '
  'table, written in the SAME transaction as the change by emit_propagation_event(). The queue depth '
  '(count WHERE drained_at IS NULL) IS the visible flywheel tension (spec''s own words) — see the '
  'propagation_queue_depth view below. NEVER written to by anything except the trigger below and the '
  'governed drain (which only sets drained_at/drain_run_id, never touches the event''s own facts).';
COMMENT ON COLUMN public.propagation_events.table_name IS
  'The changed table, e.g. ''emission_factors''. Paired with row_pk, this is the SAME (table,pk) address '
  'shape derivation_edges.(from_table,from_pk) uses (migration 285) — the join between an event and its '
  'dependents is a plain equality, no translation layer.';
COMMENT ON COLUMN public.propagation_events.row_pk IS
  'The changed row''s own primary key value, stringified (factor_id/id/value_id/entity_id depending on '
  'table_name — never re-derived, always the literal PK column TG_ARGV[0] names for that trigger).';
COMMENT ON COLUMN public.propagation_events.entity_id IS
  'NULLABLE. Populated only when the changed row itself carries an entity_id column (derived_values, '
  'statutory_computations, estimated_values — migrations 285/286). NULL for emission_factors/'
  'market_series/regional_data_facts today: none of the three carries an entity_id column yet (progressive '
  're-keying, ADR-024) — see this migration''s header for why the spec''s own NOT NULL subject_id could '
  'not be used as written.';
COMMENT ON COLUMN public.propagation_events.change_kind IS
  '''insert''/''delete'' mirror TG_OP directly. ''supersede'' is a structurally-detected UPDATE where a '
  'superseded_by-shaped column moved from NULL to NOT NULL (a correction, not an ordinary edit — spec '
  '§2.3''s worked example narrates this case in prose; this column makes it queryable). Every other UPDATE '
  'is ''update''.';
COMMENT ON COLUMN public.propagation_events.txid IS
  'txid_current() of the writing transaction — lets a reader confirm two events landed atomically together, '
  'or diagnose a partial batch.';
COMMENT ON COLUMN public.propagation_events.drained_at IS
  'NULL = pending (the default, and the queue-depth signal). Set once by the governed drain (drain.ts), '
  'never by the trigger, never reset.';
COMMENT ON COLUMN public.propagation_events.drain_run_id IS
  'The drain run (scripts/harness-runs/propagation/propagation-run-NNN.json''s run_id) that drained this '
  'event. NULL exactly when drained_at is NULL.';

CREATE INDEX IF NOT EXISTS propagation_events_pending_idx
  ON public.propagation_events (occurred_at) WHERE drained_at IS NULL;
CREATE INDEX IF NOT EXISTS propagation_events_table_pk_idx
  ON public.propagation_events (table_name, row_pk);
CREATE INDEX IF NOT EXISTS propagation_events_entity_idx
  ON public.propagation_events (entity_id) WHERE entity_id IS NOT NULL;

-- ── propagation_queue_depth — the visible flywheel tension (spec §2.2) ─────────────────────────────────
CREATE OR REPLACE VIEW public.propagation_queue_depth AS
SELECT count(*) AS pending_count, min(occurred_at) AS oldest_pending_at
FROM public.propagation_events
WHERE drained_at IS NULL;

COMMENT ON VIEW public.propagation_queue_depth IS
  '"The queue depth IS the visible flywheel tension" (spec §2.2). One row always (count(*) over zero rows '
  'is 0, not empty) so a reader never has to special-case "no pending events" as "no row".';

-- ── emit_propagation_event() — the ONE trigger function every source table attaches (cheap, O(1)) ──────
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
    -- Only emit when a MATERIAL field moved (spec §2.2's own emit_propagation_event() body, verbatim
    -- reasoning): comparing minus 'updated_at' so a bare touch-the-timestamp write is not a queue event.
    IF (v_new - 'updated_at') IS NOT DISTINCT FROM (v_old - 'updated_at') THEN
      RETURN NEW; -- nothing material changed; do not amplify the outbox
    END IF;
    -- 'supersede' detection: a superseded_by-shaped column moved NULL -> NOT NULL. Generic across every
    -- attached table because it reads the jsonb key rather than assuming the column exists structurally —
    -- a table with no such column simply never classifies as 'supersede'.
    IF (v_old ? 'superseded_by') AND (v_old->>'superseded_by') IS NULL AND (v_new->>'superseded_by') IS NOT NULL THEN
      v_kind := 'supersede';
    ELSE
      v_kind := 'update';
    END IF;
  END IF;

  v_row_pk := coalesce(v_new->>v_pk_col, v_old->>v_pk_col);
  v_entity_id := coalesce(v_new->>'entity_id', v_old->>'entity_id');

  INSERT INTO public.propagation_events (table_name, row_pk, entity_id, change_kind, old_row, new_row)
  VALUES (TG_TABLE_NAME, v_row_pk, v_entity_id, v_kind, v_old, v_new);

  RETURN NEW; -- AFTER trigger; return value is ignored by Postgres but a non-null RETURN is conventional
END $$;

COMMENT ON FUNCTION public.emit_propagation_event() IS
  'The outbox writer (spec 08 §2.2 Part 1). ONE INSERT, no recursion, no other function call — cheap by '
  'construction. TG_ARGV[0] names the triggering table''s primary-key column (e.g. ''factor_id'', ''id'', '
  '''value_id'', ''entity_id''); TG_TABLE_NAME supplies table_name automatically. Attached AFTER INSERT OR '
  'UPDATE OR DELETE FOR EACH ROW on every propagation source table — see this migration''s CREATE TRIGGER '
  'statements below, and migrations 285/286 for the derived_values/statutory_computations/estimated_values '
  'attachments (those tables do not exist until those migrations run).';

-- ── Attach to the three source tables that exist as of this migration ──────────────────────────────────
DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.emission_factors;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.emission_factors
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('factor_id');

DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.market_series;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.market_series
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('id');

DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.regional_data_facts;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.regional_data_facts
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('id');

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────────────
-- propagation_events is an internal engine mechanism, not a customer-facing table (no figure, no chip,
-- no export reads it directly — the drain and the fitness/harness tooling are its only readers). RLS
-- enabled, NO SELECT/INSERT/UPDATE/DELETE policy for anon/authenticated: the trigger writes via the
-- table owner's implicit privilege (definer context of the function, same as every other trigger in this
-- schema), and the drain reads/writes via the service-role client, which bypasses RLS — same posture
-- migration 258 states for emission_factors' own writes ("writes arrive through the service role").
ALTER TABLE public.propagation_events ENABLE ROW LEVEL SECURITY;
-- No policy created: default-deny for every non-service-role caller.

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols int;
  n_trg  int;
  n_idx  int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'propagation_events';
  IF n_cols <> 11 THEN
    RAISE EXCEPTION 'ABORT: propagation_events has % columns, expected 11', n_cols;
  END IF;

  SELECT count(*) INTO n_trg FROM pg_trigger
    WHERE tgname = 'propagation_outbox_trg' AND NOT tgisinternal
      AND tgrelid IN ('public.emission_factors'::regclass, 'public.market_series'::regclass, 'public.regional_data_facts'::regclass);
  IF n_trg <> 3 THEN
    RAISE EXCEPTION 'ABORT: propagation_outbox_trg attached to % tables, expected 3 (emission_factors, market_series, regional_data_facts)', n_trg;
  END IF;

  SELECT count(*) INTO n_idx FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'propagation_events';
  IF n_idx < 4 THEN -- PK index + the 3 explicit indexes above
    RAISE EXCEPTION 'ABORT: propagation_events has % indexes, expected >= 4', n_idx;
  END IF;

  IF (SELECT count(*) FROM public.propagation_events) <> 0 THEN
    RAISE EXCEPTION 'ABORT: propagation_events is not empty at migration time';
  END IF;

  RAISE NOTICE 'migration 284 OK: propagation_events (% cols), emit_propagation_event() attached to % tables, propagation_queue_depth live, RLS on, 0 rows', n_cols, n_trg;
END $$;
