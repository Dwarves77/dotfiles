-- 285 — the derivation DAG and derived_values (Lane DP-ENGINE, system-completion train, 2026-09-02 —
-- docs/specs/08-flywheel-design.md §2.2 Part 2, §3.1-§3.3; docs/decisions/ADR-024-decision-propagation.md).
--
-- FOUR PIECES: (1) `derived_values` — one row per computed value, versioned, never overwritten in place;
-- (2) `derivation_edges` + `assert_acyclic()` — the invalidation DAG, DERIVED from the provenance chain,
-- never hand-maintained (spec §2.2 Part 2); (3) `invalidate_dependents()` + `effective_confidence()` — the
-- two pure/near-pure functions the governed drain (`drain.ts`) calls, never a trigger (see migration 284's
-- header: propagation invalidates only at drain time, never eagerly); (4) `derived_values_admissible` —
-- the ONE view every consumer reads (spec §3.3's second enforcement point).
--
-- `value_id` IS uuid, NOT `cl:value:<16hex>` — A DELIBERATE CHOICE AGAINST THE TASK BRIEF'S OWN FIRST
-- OPTION, STATED AND JUSTIFIED. `cl:<kind>:<hex>` (entity-id.mjs) is reserved for rows that mint an
-- ENTITY — a real-world thing with a PERMANENT identity that is "NEVER reused" (spec §1.3 rule 2) and
-- resolves via tombstone/merge, never superseded-in-place. A `derived_values` row is the opposite kind of
-- thing: it is DATA ABOUT an entity (or about nothing addressable at all, when entity_id is null — e.g. a
-- carbon-intensity-per-corridor figure that has no single entity subject), it is EXPECTED to be superseded
-- routinely (every recompute inserts a NEW row and points `supersedes` at the old one — spec §2.2 Part 3:
-- "writes a NEW derived_values row; the prior row is retained"), and MANY rows legitimately exist for the
-- same (entity, method) pair over time. Minting a `cl:value:...` id for each would be a category error —
-- the same "false cognate" this schema's own conventions warn against elsewhere (every other uuid-PK'd
-- envelope-value table in this schema — `emission_factors.factor_id`, `market_series.id`,
-- `regional_data_facts.id` — already uses uuid for exactly this reason: a VALUE row, not an ENTITY row).
-- `uuid` is therefore the consistent choice, not merely the easier one. `derivation_edges.to_value_id` is
-- typed `uuid REFERENCES derived_values(value_id)` accordingly (the governing plan's own literal `text`
-- typing for that column assumed the `text` value_id option — this migration's header records the
-- resulting, deliberate type change).
--
-- `derivation_edges` USES THE SAME (from_table, from_pk) GENERIC ADDRESS AS `propagation_events.
-- (table_name, row_pk)` (migration 284) — NOT spec §2.2's own `(derived_id, input_id)` pair, which typed
-- BOTH ends as `entities(entity_id)`. An edge's INPUT is very often NOT an entity: it is a row in
-- `emission_factors`, `market_series`, `regional_data_facts`, or another `derived_values` row — none of
-- which (per migration 284's header) reliably carries an entity_id today. `to_value_id` (the CONSUMING
-- end) is always a `derived_values` row by construction (only a derived_values row can BE the object of a
-- derivation — spec §4's isolation design keeps `statutory_computations` terminal, never an input to
-- anything else, and `estimated_values` likewise), so it is a plain FK. `from_table`/`from_pk` names the
-- INPUT generically. This is what makes `invalidate_dependents()` a plain join against
-- `propagation_events` with NO translation layer between "what changed" and "what depends on it" — the
-- exact convergence migration 284's header names.
--
-- WHY THE TRIGGER TARGETS SPLIT ACROSS 284/285/286: `derived_values` does not exist until this migration
-- creates it, so ITS `propagation_outbox_trg` attachment lives here, reusing `emit_propagation_event()`
-- (defined in 284) unchanged.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.propagation_events') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.propagation_events does not exist — migration 284 must be applied first';
  END IF;
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist — migration 282 must be applied first';
  END IF;
END $$;

-- ── derived_values ───────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.derived_values (
  value_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     text REFERENCES public.entities(entity_id),
  method_id     text NOT NULL,
  method_version text NOT NULL,
  value         numeric,
  value_low     numeric,
  value_high    numeric,
  unit          text,
  currency      text,
-- >>> derivation/origin_class: SAME 9/7-value vocabularies as emission_factors (migration 258) — the
-- source of truth is src/lib/contracts/envelope.mjs DERIVATION / vocabularies.mjs ORIGIN_CLASS; this
-- CHECK is a hand-transcription of the SAME literal list migration 258/268 already carry (byte-identical
-- values, not re-derived), matching this schema's established "same vocabulary, hand-copied CHECK,
-- generator-owned source of truth" convention for tables that are not themselves codegen'd.
  derivation    text NOT NULL CHECK (derivation IN ('statutory_fixed', 'statutory_formula', 'observed', 'transacted_index', 'assessed', 'calculated', 'interpolated', 'modelled', 'estimated')),
  origin_class  text NOT NULL CHECK (origin_class IN ('community', 'community-corroborated', 'modelled', 'derived', 'partner', 'verified', 'official')),
  lifecycle     text NOT NULL CHECK (lifecycle IN ('emerging', 'strengthening', 'corroborated', 'verified', 'stalled', 'falsified', 'superseded', 'obsolete')),
  admissibility text NOT NULL CHECK (admissibility IN ('display_only', 'analysis_ok', 'calculation_ok', 'filing_ok', 'stale')),
  base_confidence numeric NOT NULL CHECK (base_confidence >= 0 AND base_confidence <= 1),
  asserted_at   timestamptz NOT NULL,
  half_life_days integer CHECK (half_life_days IS NULL OR half_life_days > 0), -- NULL = no decay (spec §3.2: statutory text)
  inputs        jsonb NOT NULL, -- [{table, pk, version}, ...] — the InputRef shape types.ts defines
  supersedes    uuid REFERENCES public.derived_values(value_id),
  computed_at   timestamptz NOT NULL DEFAULT now(),
  computed_by   text NOT NULL, -- method_id@method_version of the computing run, or a caller identity
  invalidated_at timestamptz,
  invalidated_by_event bigint REFERENCES public.propagation_events(event_id),
  CONSTRAINT derived_values_range_ordered CHECK (value_low IS NULL OR value_high IS NULL OR value_low <= value_high),
  CONSTRAINT derived_values_value_brackets CHECK (value IS NULL OR value_low IS NULL OR value_high IS NULL OR (value BETWEEN value_low AND value_high)),
  CONSTRAINT derived_values_not_self_superseded CHECK (supersedes IS NULL OR supersedes <> value_id)
);

COMMENT ON TABLE public.derived_values IS
  'One row per computed value (spec 08 §2.2 Part 2, §3). Append-mostly: a recompute inserts a NEW row '
  'pointing supersedes at the prior one; the prior row is retained for the audit trail (spec §2.2 Part 3). '
  'Read ONLY through derived_values_admissible below (spec §3.3''s second enforcement point) or through '
  'admissibleFor() (src/lib/propagation/admissible-for.ts) — never directly; F31 fails CI on a direct read '
  'outside src/lib/propagation/.';
COMMENT ON COLUMN public.derived_values.entity_id IS
  'The entity this value is ABOUT, when it has one addressable subject (nullable — a corridor carbon-cost '
  'figure may have no single entity.entity_id subject yet; see migration 284''s header on why the three '
  'existing source tables carry no entity_id today either).';
COMMENT ON COLUMN public.derived_values.inputs IS
  'jsonb array of {"table": "...", "pk": "...", "version": "..."} — the InputRef shape (types.ts). This is '
  'the DECLARED input list a caller supplies to registerDerivedValue(); derivation_edges (below) is the '
  'SAME information, normalised into queryable rows by register-derivation.ts in the same write. Kept '
  'BOTH ways deliberately: inputs is the audit-friendly, human-readable provenance a reader opens directly '
  'on this row; derivation_edges is the machine-walkable graph invalidate_dependents() traverses. The two '
  'must never disagree — register-derivation.ts derives derivation_edges FROM inputs in one write, never '
  'independently.';
COMMENT ON COLUMN public.derived_values.half_life_days IS
  'NULL means NO DECAY (spec §3.2: statutory text has half-life infinity). Consumed by effective_confidence() '
  'below — a NULL here makes that function return base_confidence unchanged regardless of age.';
COMMENT ON COLUMN public.derived_values.admissibility IS
  '''stale'' is set ONLY by the governed drain (invalidate_dependents(), never a trigger — spec §2.2: '
  '"propagation invalidates, it does not compute"). The other four values describe what a FRESH value may '
  'be used for (spec §3.1''s admissibility axis) and are set at write time by registerDerivedValue/the '
  'recomputing method, never derived automatically from lifecycle (the two axes are orthogonal by design — '
  'spec §3.1: "a strengthening signal is still inadmissible in a financial output").';

CREATE INDEX IF NOT EXISTS derived_values_entity_idx ON public.derived_values (entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS derived_values_method_idx ON public.derived_values (method_id, method_version);
CREATE INDEX IF NOT EXISTS derived_values_supersedes_idx ON public.derived_values (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX IF NOT EXISTS derived_values_stale_idx ON public.derived_values (admissibility) WHERE admissibility = 'stale';
CREATE INDEX IF NOT EXISTS derived_values_current_idx ON public.derived_values (value_id) WHERE invalidated_at IS NULL;

-- ── derivation_edges — the invalidation DAG, DERIVED, never hand-maintained ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.derivation_edges (
  from_table  text NOT NULL,
  from_pk     text NOT NULL,
  to_value_id uuid NOT NULL REFERENCES public.derived_values(value_id),
  edge_kind   text NOT NULL DEFAULT 'input',
  PRIMARY KEY (from_table, from_pk, to_value_id, edge_kind),
  CONSTRAINT derivation_edges_from_table_allowed CHECK (
    from_table IN ('emission_factors', 'market_series', 'regional_data_facts', 'derived_values', 'statutory_computations', 'estimated_values')
  )
);

COMMENT ON TABLE public.derivation_edges IS
  'The invalidation DAG (spec 08 §2.2 Part 2): one row per (input, derived value) dependency, one row per '
  'registerDerivedValue() call per declared input (register-derivation.ts writes this table AND '
  'derived_values.inputs from the SAME caller-supplied list — see that column''s comment). from_table is a '
  'closed allowlist (derivation_edges_from_table_allowed) mirroring entity_refs_ref_table_allowed''s '
  'posture (migration 283): widen deliberately, in a reviewed migration, never by inference. '
  'invalidate_dependents() (below) walks this table; propagation_events.(table_name,row_pk) (migration '
  '284) addresses an input in the IDENTICAL shape, so the walk''s seed step is a plain equality join.';
COMMENT ON COLUMN public.derivation_edges.edge_kind IS
  '''input'' (the only value this lane writes) for a value genuinely computed FROM the referenced row. '
  'Open text, not a closed CHECK beyond the one default, matching entity_scope.relation''s (migration 282) '
  'and entity_refs.role''s (migration 283) posture: a future edge kind (e.g. a weaker "informed_by" '
  'relation that should NOT propagate staleness) can be added without a schema change.';

CREATE INDEX IF NOT EXISTS derivation_edges_to_value_idx ON public.derivation_edges (to_value_id);
CREATE INDEX IF NOT EXISTS derivation_edges_from_idx ON public.derivation_edges (from_table, from_pk);

-- assert_acyclic() — spec §2.2 Part 2, adapted to the (from_table, from_pk) -> to_value_id shape. A cycle
-- can only occur through derived_values -> derived_values edges (every other from_table is a leaf: it is
-- never itself a to_value_id, by the FK). So the walk only engages when the NEW edge's input is itself a
-- derived_values row.
CREATE OR REPLACE FUNCTION public.assert_acyclic() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.from_table = 'derived_values' THEN
    IF EXISTS (
      -- reach = every value that (transitively) has NEW.to_value_id as one of its inputs, starting from
      -- NEW.to_value_id itself (depth 0) — i.e. everything DOWNSTREAM of the value this edge feeds.
      WITH RECURSIVE reach(value_id, depth) AS (
        SELECT NEW.to_value_id, 0
        UNION ALL
        SELECT e.to_value_id, r.depth + 1
        FROM public.derivation_edges e
        JOIN reach r ON e.from_table = 'derived_values' AND e.from_pk = r.value_id::text
        WHERE r.depth < 32 -- hard depth cap: cheap protection against a deep chain (spec §2.2's own limit)
      )
      SELECT 1 FROM reach WHERE value_id = NEW.from_pk::uuid
    ) THEN
      RAISE EXCEPTION 'derivation cycle: % (%) -> % would close a loop back through its own downstream',
        NEW.from_pk, NEW.from_table, NEW.to_value_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.assert_acyclic() IS
  'Spec 08 §2.2 Part 2: "Must be a DAG. A cycle here means a value depends on itself and the drain would '
  'not terminate." Only engages when the new edge''s input is itself a derived_values row (every other '
  'from_table is a leaf by construction — see derivation_edges_from_table_allowed).';

DROP TRIGGER IF EXISTS derivation_edges_acyclic_trg ON public.derivation_edges;
CREATE TRIGGER derivation_edges_acyclic_trg
  BEFORE INSERT OR UPDATE ON public.derivation_edges
  FOR EACH ROW EXECUTE FUNCTION public.assert_acyclic();

-- ── invalidate_dependents() — the governed drain's ONE invalidation call (spec §2.2 Part 2) ────────────
-- p_apply = false computes the transitive closure and returns its size WITHOUT WRITING (drain.ts's `dry`
-- mode: "computes the invalidated closure per event... dry: counts only"). p_apply = true (the default)
-- marks every non-stale member of the closure admissibility='stale', invalidated_at=now(),
-- invalidated_by_event=p_event, and returns the count actually changed.
CREATE OR REPLACE FUNCTION public.invalidate_dependents(
  p_table text, p_pk text, p_event bigint DEFAULT NULL, p_apply boolean DEFAULT true
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  IF p_apply THEN
    WITH RECURSIVE affected(value_id) AS (
      SELECT dv.value_id
      FROM public.derived_values dv
      JOIN public.derivation_edges e ON e.to_value_id = dv.value_id
      WHERE e.from_table = p_table AND e.from_pk = p_pk
      UNION
      SELECT e2.to_value_id
      FROM public.derivation_edges e2
      JOIN affected a ON e2.from_table = 'derived_values' AND e2.from_pk = a.value_id::text
    )
    UPDATE public.derived_values d
       SET admissibility = 'stale', invalidated_at = now(), invalidated_by_event = p_event
      FROM affected a
     WHERE d.value_id = a.value_id AND d.admissibility <> 'stale';
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    WITH RECURSIVE affected(value_id) AS (
      SELECT dv.value_id
      FROM public.derived_values dv
      JOIN public.derivation_edges e ON e.to_value_id = dv.value_id
      WHERE e.from_table = p_table AND e.from_pk = p_pk
      UNION
      SELECT e2.to_value_id
      FROM public.derivation_edges e2
      JOIN affected a ON e2.from_table = 'derived_values' AND e2.from_pk = a.value_id::text
    )
    SELECT count(*) INTO n
    FROM affected a
    JOIN public.derived_values d ON d.value_id = a.value_id
    WHERE d.admissibility <> 'stale';
  END IF;
  RETURN coalesce(n, 0);
END $$;

COMMENT ON FUNCTION public.invalidate_dependents(text, text, bigint, boolean) IS
  'Spec 08 §2.2 Part 2''s "one recursive statement, marking the transitive closure stale", generalised to '
  'a callable function with a dry (p_apply=false, count only) and apply (p_apply=true, default, writes) '
  'mode — drain.ts calls this ONCE PER UNDRAINED EVENT (dry mode in dry runs, apply mode in apply runs) '
  'rather than running the recursive UPDATE inline, so the SQL exists in exactly one place either way. '
  'UNION (not UNION ALL) in the recursive term dedupes a diamond fan-out, matching spec''s own note.';

-- ── effective_confidence() — spec §3.2, byte-identical formula ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.effective_confidence(
  base numeric, asserted_at timestamptz, half_life_days integer, now_ts timestamptz
) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN half_life_days IS NULL THEN base -- spec §3.2: NULL half-life = no decay (statutory text)
    ELSE round(base * power(0.5, extract(epoch FROM (now_ts - asserted_at)) / (half_life_days * 86400.0)), 3)
  END;
$$;

COMMENT ON FUNCTION public.effective_confidence(numeric, timestamptz, integer, timestamptz) IS
  'Spec 08 §3.2''s decay formula, byte-identical, with the one addition the spec''s own SQL block leaves '
  'implicit in prose ("Statutory text | infinity (no decay)"): a NULL half_life_days returns base '
  'unchanged rather than dividing by NULL (which SQL would silently propagate as NULL, not "no decay"). '
  'Mirrored in JS by src/lib/propagation/effective-confidence.mjs, proven to agree on fixtures.';

-- ── register_derived_value() — the ONE atomic write path for a new value + its edges ────────────────────
-- register-derivation.ts's `registerDerivedValue(sb, {...})` calls this via `sb.rpc(...)` rather than
-- issuing a `derived_values` INSERT followed by N separate `derivation_edges` INSERTs from JS. Reason
-- (documented per the task brief's own "one RPC or a transaction-safe sequence; document which"): a plain
-- sequence of `sb.from(...).insert(...)` calls is NOT transaction-safe by default (each is its own
-- round-trip/transaction over PostgREST) — if `assert_acyclic()` rejects one of several edge inserts AFTER
-- the value row has already committed, the result is a `derived_values` row whose `derivation_edges` no
-- longer match its own `inputs` column, exactly the drift COMMENT ON COLUMN derived_values.inputs above
-- says must never happen. Wrapping the value INSERT and the inputs-array loop in one PL/pgSQL function
-- makes the whole write one statement from the CALLER's perspective (a single `SELECT
-- register_derived_value(...)`), hence one transaction: if any edge is rejected, the value row's own INSERT
-- is rolled back with it, and register-derivation.ts sees a thrown error with NOTHING partially written.
--
-- ACYCLIC BY CONSTRUCTION, NOTED (not merely tested): every edge this function inserts has
-- `to_value_id = v_value_id`, the row THIS SAME CALL just created — a value that did not exist before this
-- call cannot already be any other row's (transitive) input, so `assert_acyclic()`'s reach-from-
-- `NEW.to_value_id` walk always starts and stays at a singleton set containing only the brand-new row and
-- trivially passes. A cycle can therefore only ever be introduced by a HAND-WRITTEN `derivation_edges`
-- INSERT that points an existing row's edge at a value created after it (exactly what migration 285's own
-- assert_acyclic self-check constructs, above) — never by this function. Recorded here so a future reader
-- does not expect (or add) a redundant cycle-guard self-check specifically for register_derived_value.
--
-- `p_supersedes` (trailing, default NULL): drain.ts's recompute pass writes the NEW value AND points it at
-- the stale row it replaces IN THE SAME CALL, rather than a follow-up UPDATE ... SET supersedes = ... after
-- the fact — the same atomicity argument as the value+edges write above applies here: a follow-up UPDATE
-- would be a second, separate statement that could succeed even if the caller crashes between the two,
-- leaving a new value with no recorded lineage back to what it replaced.
CREATE OR REPLACE FUNCTION public.register_derived_value(
  p_entity_id text, p_method_id text, p_method_version text,
  p_value numeric, p_value_low numeric, p_value_high numeric, p_unit text, p_currency text,
  p_derivation text, p_origin_class text, p_lifecycle text, p_admissibility text,
  p_base_confidence numeric, p_asserted_at timestamptz, p_half_life_days integer,
  p_inputs jsonb, p_computed_by text, p_supersedes uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_value_id uuid;
  v_ref jsonb;
BEGIN
  INSERT INTO public.derived_values (
    entity_id, method_id, method_version, value, value_low, value_high, unit, currency,
    derivation, origin_class, lifecycle, admissibility, base_confidence, asserted_at,
    half_life_days, inputs, computed_by, supersedes
  ) VALUES (
    p_entity_id, p_method_id, p_method_version, p_value, p_value_low, p_value_high, p_unit, p_currency,
    p_derivation, p_origin_class, p_lifecycle, p_admissibility, p_base_confidence, p_asserted_at,
    p_half_life_days, coalesce(p_inputs, '[]'::jsonb), p_computed_by, p_supersedes
  ) RETURNING value_id INTO v_value_id;

  FOR v_ref IN SELECT * FROM jsonb_array_elements(coalesce(p_inputs, '[]'::jsonb))
  LOOP
    INSERT INTO public.derivation_edges (from_table, from_pk, to_value_id, edge_kind)
    VALUES (v_ref->>'table', v_ref->>'pk', v_value_id, 'input');
  END LOOP;

  RETURN v_value_id;
END $$;

COMMENT ON FUNCTION public.register_derived_value(text, text, text, numeric, numeric, numeric, text, text, text, text, text, text, numeric, timestamptz, integer, jsonb, text, uuid) IS
  'The ONE write path for a new derived_values row + its derivation_edges, atomically (one PL/pgSQL call = '
  'one transaction from the caller''s side). register-derivation.ts''s registerDerivedValue(sb, {...}) calls '
  'this via sb.rpc(), never a bare INSERT — see the header comment above for why a JS-side sequence of '
  'separate inserts is not transaction-safe here.';

-- No GRANT EXECUTE to authenticated/anon: this is a service-role-only write path (register-derivation.ts's
-- Supabase client authenticates with SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS/grants entirely), the
-- same posture as derived_values itself carrying no INSERT policy for authenticated.

-- ── derived_values_admissible — the ONE view every consumer reads (spec §3.3) ───────────────────────────
CREATE OR REPLACE VIEW public.derived_values_admissible AS
SELECT
  d.*,
  public.effective_confidence(d.base_confidence, d.asserted_at, d.half_life_days, now()) AS effective_confidence
FROM public.derived_values d
WHERE d.lifecycle NOT IN ('falsified', 'obsolete')
  AND d.admissibility <> 'stale';

COMMENT ON VIEW public.derived_values_admissible IS
  'Spec 08 §3.3''s second enforcement point ("RLS denies SELECT on the raw table... granting it only on a '
  'view that has already applied the gate"). Hides stale/falsified/obsolete rows and pre-computes '
  'effective_confidence so a caller never re-derives the decay formula. Runs with the DEFINER''s (the '
  'migration-applying role''s) row-visibility, not the querying role''s — this view is deliberately NOT '
  '`security_invoker` — which is what lets a role with no direct grant on derived_values still read '
  'through this view: see the RLS section below for the full reasoning and the caveat named there.';

-- ── RLS — deny the raw table, grant the view (spec §3.3's second enforcement point) ────────────────────
-- CLOSEST SANCTIONED PATTERN, NAMED: no existing migration in this schema ships a bare "deny-raw,
-- grant-view" pair on a table that ALSO needs write traffic from a service-role client (258''s
-- licence_clear_sources/emission_factor_candidates GRANT both the view AND the underlying table to
-- authenticated — a different case: those tables carry no admissibility gate to protect). This migration
-- implements spec §3.3 literally: RLS is enabled with NO SELECT policy and NO GRANT for anon/authenticated
-- on derived_values itself; derived_values_admissible IS granted. The mechanism this relies on is
-- ordinary Postgres view semantics: a view with no `security_invoker` runs with the privileges AND the
-- RLS context of its OWNER (the migration-applying role, which as a table owner is exempt from its own
-- RLS by default) — so a role with a bare GRANT SELECT on the VIEW ALONE can read through it even though
-- it holds no privilege on the base table at all. Reading the raw table directly (`.from("derived_values")`)
-- fails on privilege before RLS is even consulted for that role. This is the standard Postgres idiom for
-- exactly this shape and is enforced a SECOND way in code: F31 (fitness) fails CI on any direct read of
-- derived_values outside src/lib/propagation/.
ALTER TABLE public.derived_values ENABLE ROW LEVEL SECURITY;
-- No SELECT policy on derived_values for anon/authenticated: deliberate.
GRANT SELECT ON public.derived_values_admissible TO authenticated;

-- ── Attach the outbox trigger (function defined in migration 284) now that derived_values exists ───────
DROP TRIGGER IF EXISTS propagation_outbox_trg ON public.derived_values;
CREATE TRIGGER propagation_outbox_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.derived_values
  FOR EACH ROW EXECUTE FUNCTION public.emit_propagation_event('value_id');

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_dv_cols int;
  n_edge_cols int;
  n_trg int;
  probe_a uuid;
  probe_b uuid;
  probe_c uuid;
  probe_d uuid;
  probe_e uuid;
  cyclic boolean := false;
BEGIN
  SELECT count(*) INTO n_dv_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'derived_values';
  IF n_dv_cols <> 22 THEN
    RAISE EXCEPTION 'ABORT: derived_values has % columns, expected 22', n_dv_cols;
  END IF;

  SELECT count(*) INTO n_edge_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'derivation_edges';
  IF n_edge_cols <> 4 THEN
    RAISE EXCEPTION 'ABORT: derivation_edges has % columns, expected 4', n_edge_cols;
  END IF;

  SELECT count(*) INTO n_trg FROM pg_trigger
    WHERE tgname = 'propagation_outbox_trg' AND NOT tgisinternal AND tgrelid = 'public.derived_values'::regclass;
  IF n_trg <> 1 THEN
    RAISE EXCEPTION 'ABORT: propagation_outbox_trg not attached to derived_values';
  END IF;

  IF (SELECT count(*) FROM public.derived_values) <> 0 THEN
    RAISE EXCEPTION 'ABORT: derived_values is not empty at migration time';
  END IF;

  -- effective_confidence: no decay at age 0; half the value after exactly one half-life; NULL half-life
  -- is unchanged regardless of age.
  IF public.effective_confidence(1.0, now(), 100, now()) <> 1.0 THEN
    RAISE EXCEPTION 'ABORT: effective_confidence at age 0 must equal base';
  END IF;
  IF abs(public.effective_confidence(1.0, now() - interval '100 days', 100, now()) - 0.5) > 0.001 THEN
    RAISE EXCEPTION 'ABORT: effective_confidence at exactly one half-life must be ~0.5';
  END IF;
  IF public.effective_confidence(0.9, now() - interval '10000 days', NULL, now()) <> 0.9 THEN
    RAISE EXCEPTION 'ABORT: effective_confidence with NULL half_life_days must never decay';
  END IF;

  -- assert_acyclic: build a two-node chain (A -> B) via real derived_values rows, then prove a would-be
  -- B -> A edge (closing the loop) is rejected, and that a legitimate third node C depending on B is not.
  INSERT INTO public.derived_values (entity_id, method_id, method_version, value, unit, derivation, origin_class, lifecycle, admissibility, base_confidence, asserted_at, inputs, computed_by)
    VALUES (NULL, 'selftest', '1', 1, 'unit', 'calculated', 'derived', 'verified', 'analysis_ok', 0.9, now(), '[]'::jsonb, 'migration-285-selfcheck')
    RETURNING value_id INTO probe_a;
  INSERT INTO public.derived_values (entity_id, method_id, method_version, value, unit, derivation, origin_class, lifecycle, admissibility, base_confidence, asserted_at, inputs, computed_by)
    VALUES (NULL, 'selftest', '1', 2, 'unit', 'calculated', 'derived', 'verified', 'analysis_ok', 0.9, now(), '[]'::jsonb, 'migration-285-selfcheck')
    RETURNING value_id INTO probe_b;
  INSERT INTO public.derivation_edges (from_table, from_pk, to_value_id, edge_kind) VALUES ('derived_values', probe_a::text, probe_b, 'input');

  BEGIN
    INSERT INTO public.derivation_edges (from_table, from_pk, to_value_id, edge_kind) VALUES ('derived_values', probe_b::text, probe_a, 'input');
    cyclic := true; -- if we get here, the cycle was NOT rejected — a real bug
  EXCEPTION WHEN OTHERS THEN
    cyclic := false; -- expected: rejected
  END;
  IF cyclic THEN
    RAISE EXCEPTION 'ABORT: assert_acyclic() failed to reject a two-node cycle';
  END IF;

  -- invalidate_dependents: probe_b depends on probe_a (leaf-shaped: pretend probe_a is 'emission_factors'
  -- row 'ef-1' too, via a second edge) — invalidating 'emission_factors'/'ef-1' must mark probe_b stale
  -- via the derived_values->derived_values edge chain seeded from probe_a.
  INSERT INTO public.derivation_edges (from_table, from_pk, to_value_id, edge_kind) VALUES ('emission_factors', 'ef-selftest', probe_a, 'input');
  IF public.invalidate_dependents('emission_factors', 'ef-selftest', NULL, false) <> 2 THEN
    RAISE EXCEPTION 'ABORT: invalidate_dependents dry mode did not find both probe_a and probe_b in the closure';
  END IF;
  IF public.invalidate_dependents('emission_factors', 'ef-selftest', NULL, true) <> 2 THEN
    RAISE EXCEPTION 'ABORT: invalidate_dependents apply mode did not mark both rows stale';
  END IF;
  IF (SELECT admissibility FROM public.derived_values WHERE value_id = probe_b) <> 'stale' THEN
    RAISE EXCEPTION 'ABORT: probe_b was not marked stale by invalidate_dependents';
  END IF;
  IF EXISTS (SELECT 1 FROM public.derived_values_admissible WHERE value_id IN (probe_a, probe_b)) THEN
    RAISE EXCEPTION 'ABORT: derived_values_admissible still exposes a stale row';
  END IF;

  -- register_derived_value: one call writes BOTH the value row and its matching derivation_edges row(s).
  probe_c := public.register_derived_value(
    NULL, 'selftest', '1', 3, NULL, NULL, 'unit', NULL,
    'calculated', 'derived', 'verified', 'analysis_ok', 0.9, now(), NULL,
    jsonb_build_array(jsonb_build_object('table', 'emission_factors', 'pk', 'ef-rdv-selftest')),
    'migration-285-selfcheck'
  );
  IF (SELECT count(*) FROM public.derived_values WHERE value_id = probe_c) <> 1 THEN
    RAISE EXCEPTION 'ABORT: register_derived_value did not write the derived_values row';
  END IF;
  IF (SELECT count(*) FROM public.derivation_edges WHERE to_value_id = probe_c AND from_table = 'emission_factors' AND from_pk = 'ef-rdv-selftest') <> 1 THEN
    RAISE EXCEPTION 'ABORT: register_derived_value did not write the matching derivation_edges row for a leaf input';
  END IF;

  -- ...and a derived_values-typed input produces a derived_values-typed edge (proves the InputRef.table
  -- value is written through verbatim, not reinterpreted).
  probe_d := public.register_derived_value(
    NULL, 'selftest', '1', 4, NULL, NULL, 'unit', NULL,
    'calculated', 'derived', 'verified', 'analysis_ok', 0.9, now(), NULL,
    jsonb_build_array(jsonb_build_object('table', 'derived_values', 'pk', probe_c::text)),
    'migration-285-selfcheck'
  );
  IF (SELECT count(*) FROM public.derivation_edges WHERE to_value_id = probe_d AND from_table = 'derived_values' AND from_pk = probe_c::text) <> 1 THEN
    RAISE EXCEPTION 'ABORT: register_derived_value did not write a derived_values-typed edge for a derived-value input';
  END IF;

  -- p_supersedes: a recompute writes the NEW row pointing at the OLD one in the SAME call (drain.ts's
  -- recompute pass — see the function's header comment on why this is not a follow-up UPDATE).
  probe_e := public.register_derived_value(
    NULL, 'selftest', '2', 5, NULL, NULL, 'unit', NULL,
    'calculated', 'derived', 'verified', 'analysis_ok', 0.9, now(), NULL,
    '[]'::jsonb, 'migration-285-selfcheck', probe_d
  );
  IF (SELECT supersedes FROM public.derived_values WHERE value_id = probe_e) <> probe_d THEN
    RAISE EXCEPTION 'ABORT: register_derived_value did not record p_supersedes on the new row';
  END IF;

  -- Clean up the self-check rows (this migration must land with zero rows by design, same posture as 284).
  DELETE FROM public.derivation_edges WHERE to_value_id IN (probe_a, probe_b, probe_c, probe_d, probe_e) OR from_pk IN (probe_a::text, probe_b::text, probe_c::text, probe_d::text, probe_e::text);
  DELETE FROM public.derived_values WHERE value_id IN (probe_a, probe_b, probe_c, probe_d, probe_e);

  IF (SELECT count(*) FROM public.derived_values) <> 0 OR (SELECT count(*) FROM public.derivation_edges) <> 0 THEN
    RAISE EXCEPTION 'ABORT: self-check rows were not fully cleaned up';
  END IF;
  -- The probe inserts/deletes above fired the outbox trigger (285 attaches it to derived_values); a
  -- self-check must not leave its own events in the queue for the first real drain to find. Added at
  -- live apply (coordinator, 2026-09-02); the applied migration carries this line.
  DELETE FROM public.propagation_events WHERE table_name = 'derived_values' AND coalesce(new_row->>'computed_by', old_row->>'computed_by') = 'migration-285-selfcheck';

  RAISE NOTICE 'migration 285 OK: derived_values (% cols) + derivation_edges (% cols), assert_acyclic/invalidate_dependents/effective_confidence proven live, derived_values_admissible hides stale, 0 rows', n_dv_cols, n_edge_cols;
END $$;
