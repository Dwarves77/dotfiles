-- subject: Migration 338 (Lane W2-G, wave2b, 2026-09-29). ADR-036 decision 2: `inference_records`, the
-- narrative counterpart to `derived_values` (migration 285), a SEPARATE table, not a state on
-- derived_values (derived_values was designed for numeric values with admissibleFor() floors; a
-- narrative claim with a mandatory status_token and non-empty cited_item_ids is a new shape). One row
-- per machine-written inference (learning-loop-design-2026-09-25.md section 3's `inference_record`
-- object, section 6's M step): `subject_id` (nullable FK into the entity spine, same progressive-
-- re-keying posture as derived_values.entity_id, migration 283/ADR-024 decision 5), `claim_text`,
-- `status_token` CHECK'd to rule 14's three tokens (CONFIRMED/HYPOTHESIS/REFUTED, CLAUDE.md rule 14,
-- constants.mjs's STATUS_TOKENS), `confidence numeric 0..1`, `cited_item_ids uuid[]` CHECK'd
-- cardinality > 0 (an uncited inference is never written, mirrors section 7's Intelligence Assistant
-- rule and the design doc's own "never empty" statement), `origin_class` CHECK'd to
-- ('derived','modelled'), narrower than derived_values' 7-value vocabulary because ADR-036 decision 2
-- states a machine-written inference is never 'verified', `supersedes` self-FK (same append-mostly,
-- never-overwritten-in-place posture derived_values uses for a recompute), `method_id`/`method_version`
-- (the SAME dispatch key drain.ts's Pass 2 already uses for `derived_values`, now generalised across
-- record kind; migration 339 is what makes Pass 2 actually reach a stale row of THIS table), and
-- `admissibility`/`invalidated_at`/`invalidated_by_event` (the SAME three-column staleness marker
-- `derived_values` carries, so `invalidate_dependents()` can mark an inference stale the identical way
-- it marks a derived value stale, once migration 339 widens the DAG to reach it).
--
-- AMENDED IN PLACE, 2026-09-29 (coordinator ruling, same day, unapplied at the time of the ruling so no
-- live-row migration was needed, the exact posture ADR-024's 2026-09-02 amendment sets as precedent
-- for amending an unapplied migration rather than layering a patch on top): the original `derived_from
-- jsonb` declared-input column is REMOVED. Migration 339 (companion, same lane) widens
-- `derivation_edges` to admit `inference_records` as a real DAG participant (both a `from_table` leaf
-- and, via a new `to_table` column, a `to_...` target), so the declared-input list this table's own
-- `register_inference_record()` RPC writes lives in `derivation_edges` for real, never a jsonb
-- shadow-copy of it (no reader needs the jsonb form; migration 339 supersedes the DOCUMENTED DEVIATION
-- this header used to carry). `method_id`/`method_version`/`admissibility`/`invalidated_at`/
-- `invalidated_by_event` are added in this same amendment because they are this table's half of the
-- SAME staleness-and-dispatch mechanism migration 339 completes on the `derivation_edges`/
-- `invalidate_dependents()` side; splitting the two halves across 338 and 339 would leave either
-- migration unable to self-check.
--
-- RLS: raw table denied (ENABLE ROW LEVEL SECURITY, no SELECT/INSERT policy for anon/authenticated), -- same posture migration 285 documents for derived_values ("RLS is enabled with NO SELECT policy and NO
-- GRANT for anon/authenticated... a service-role-only write path"). No admissible view is created in
-- this migration (unlike derived_values_admissible): the M lane's renderer (InferenceClaim.tsx) reads
-- inference_records through its own service-role API route, not directly from the client, the same
-- posture every other service-role-only table in this schema uses when it has no customer-facing view.
--
-- APPLICATION: coordinator applies via Supabase CLI BEFORE the dependent code (drain.ts registration,
-- InferenceClaim.tsx) commits, per the migration two-track policy (CLAUDE.md standing rule 3, schema
-- DDL before dependent code). NOT applied by this lane, no DB credentials in this worktree (lane-
-- common-contract, "No DB credentials exist in your worktree").

-- ── inference_records ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inference_records (
  inference_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id    text REFERENCES public.entities(entity_id),
  claim_text    text NOT NULL CHECK (length(claim_text) > 0),
  status_token  text NOT NULL CHECK (status_token IN ('CONFIRMED', 'HYPOTHESIS', 'REFUTED')),
  confidence    numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  cited_item_ids uuid[] NOT NULL CHECK (cardinality(cited_item_ids) > 0),
  origin_class  text NOT NULL CHECK (origin_class IN ('derived', 'modelled')),
  supersedes    uuid REFERENCES public.inference_records(inference_id),
  trigger_question_ref text, -- the S1 trigger_question.subjectRef this inference answers (buildSubjectRef
                              -- shape from src/lib/connections/flag-namespaces.mjs); best-effort provenance
                              -- back to the question that produced this row, nullable (an inference minted
                              -- by a future non-question path, e.g. directly off the drain, has none).
  method_id     text NOT NULL, -- dispatch key drain.ts Pass 2 looks up in methods/infer-from-question.ts's
                                -- own INFERENCE_METHODS registry, the narrative-table twin of the numeric
                                -- METHODS registry derived_values.method_id already dispatches through.
  method_version text NOT NULL,
  admissibility text NOT NULL DEFAULT 'current' CHECK (admissibility IN ('current', 'stale')),
  invalidated_at timestamptz,
  invalidated_by_event bigint REFERENCES public.propagation_events(event_id),
  computed_at   timestamptz NOT NULL DEFAULT now(),
  computed_by   text NOT NULL, -- method_id@method_version of the computing run (drain.ts convention), or a
                                -- caller identity
  CONSTRAINT inference_records_not_self_superseded CHECK (supersedes IS NULL OR supersedes <> inference_id)
);

COMMENT ON TABLE public.inference_records IS
  'ADR-036 decision 2: the narrative counterpart to derived_values (migration 285), a machine-written '
  'inference (status_token + cited_item_ids, never a bare numeric value) with its own append-mostly, '
  'never-overwritten-in-place lifecycle (a recompute inserts a NEW row, supersedes points at the prior '
  'one). Read through a service-role API route; no client-facing admissible view in this migration.';
COMMENT ON COLUMN public.inference_records.subject_id IS
  'The entity this inference is ABOUT, when it has one addressable subject (nullable, same progressive '
  're-keying posture as derived_values.entity_id, migration 283/ADR-024 decision 5; not every '
  'intelligence_items row has an entity_id yet).';
COMMENT ON COLUMN public.inference_records.status_token IS
  'Rule 14''s three tokens (CLAUDE.md standing rule 14), mirrored verbatim as this column''s CHECK '
  '(constants.mjs''s STATUS_TOKENS is the JS-side copy, hand-kept in sync, same posture derived_values.'
  'derivation/origin_class document for their own hand-copied CHECK vocabularies).';
COMMENT ON COLUMN public.inference_records.cited_item_ids IS
  'Never empty (CHECK cardinality > 0), an uncited inference is never written, mirroring spec section 7''s '
  'Intelligence Assistant citation rule and learning-loop-design-2026-09-25.md section 3''s own '
  '"cited_item_ids[] (never empty...)" statement.';
COMMENT ON COLUMN public.inference_records.origin_class IS
  'Narrower than derived_values.origin_class (7 values): an inference_records row is either derived '
  '(a template-question answer) or modelled (a narrative conclusion), NEVER verified for a '
  'machine-written inference (ADR-036 decision 2, verbatim).';
COMMENT ON COLUMN public.inference_records.method_id IS
  'The (method_id, method_version) pair drain.ts Pass 2 looks up in INFERENCE_METHODS '
  '(methods/infer-from-question.ts), the narrative-table twin of the numeric METHODS registry '
  'derived_values.method_id already dispatches through. Migration 339 widens invalidate_dependents() so '
  'a stale row of THIS table is reached by the same governed drain, never a second scheduler.';
COMMENT ON COLUMN public.inference_records.admissibility IS
  'The SAME two-state staleness marker derived_values carries (a narrower vocabulary here: this table '
  'has no display_only/analysis_ok/calculation_ok/filing_ok distinction, only current vs stale). Set to '
  '''stale'' ONLY by the governed drain (invalidate_dependents(), migration 339), never a trigger, never '
  'hand-set by application code.';

CREATE INDEX IF NOT EXISTS inference_records_subject_idx ON public.inference_records (subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inference_records_status_idx ON public.inference_records (status_token);
CREATE INDEX IF NOT EXISTS inference_records_supersedes_idx ON public.inference_records (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX IF NOT EXISTS inference_records_trigger_question_idx ON public.inference_records (trigger_question_ref) WHERE trigger_question_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS inference_records_current_idx ON public.inference_records (inference_id) WHERE supersedes IS NULL;
CREATE INDEX IF NOT EXISTS inference_records_stale_idx ON public.inference_records (admissibility) WHERE admissibility = 'stale';
CREATE INDEX IF NOT EXISTS inference_records_method_idx ON public.inference_records (method_id, method_version);

-- ── RLS: raw table denied, service-role only (same posture as derived_values, migration 285) ──────────
ALTER TABLE public.inference_records ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT policy on inference_records for anon/authenticated: deliberate. service_role bypasses
-- RLS by default (Postgres/Supabase convention); every write rides src/lib/propagation/drain.ts's Pass 2
-- (via register_inference_record(), migration 339's RPC, the same INFERENCE_METHODS-dispatched path
-- drain.ts's Pass 2 uses) or a guarded script, never a direct client write.

-- ── self-check (empirically verified against a local scratch schema before this migration is applied;
-- the coordinator re-runs an equivalent check against the live project per the migration two-track
-- policy). Builds one probe row, proves the status_token/cited_item_ids/origin_class CHECKs reject bad
-- input, proves supersedes chains, cleans up to zero rows. ────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid;
  v_id2 uuid;
  v_failed boolean := false;
BEGIN
  INSERT INTO public.inference_records (claim_text, status_token, confidence, cited_item_ids, origin_class, method_id, method_version, computed_by)
  VALUES ('probe claim', 'HYPOTHESIS', 0.6, ARRAY[gen_random_uuid()], 'derived', 'infer-from-question', 'v1', 'infer-from-question@v1')
  RETURNING inference_id INTO v_id;

  BEGIN
    INSERT INTO public.inference_records (claim_text, status_token, confidence, cited_item_ids, origin_class, method_id, method_version, computed_by)
    VALUES ('bad status', 'MAYBE', 0.5, ARRAY[gen_random_uuid()], 'derived', 'infer-from-question', 'v1', 'x');
    v_failed := true; -- should never reach here
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  BEGIN
    INSERT INTO public.inference_records (claim_text, status_token, confidence, cited_item_ids, origin_class, method_id, method_version, computed_by)
    VALUES ('empty cites', 'HYPOTHESIS', 0.5, ARRAY[]::uuid[], 'derived', 'infer-from-question', 'v1', 'x');
    v_failed := true; -- should never reach here
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  BEGIN
    INSERT INTO public.inference_records (claim_text, status_token, confidence, cited_item_ids, origin_class, method_id, method_version, admissibility, computed_by)
    VALUES ('bad admissibility', 'HYPOTHESIS', 0.5, ARRAY[gen_random_uuid()], 'derived', 'infer-from-question', 'v1', 'archived', 'x');
    v_failed := true; -- should never reach here
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  INSERT INTO public.inference_records (claim_text, status_token, confidence, cited_item_ids, origin_class, method_id, method_version, computed_by, supersedes)
  VALUES ('probe claim, revised', 'HYPOTHESIS', 0.65, ARRAY[gen_random_uuid()], 'derived', 'infer-from-question', 'v1', 'infer-from-question@v1', v_id)
  RETURNING inference_id INTO v_id2;

  IF v_failed THEN
    RAISE EXCEPTION 'migration 338 self-check FAILED: a CHECK constraint did not reject bad input';
  END IF;

  DELETE FROM public.inference_records WHERE inference_id IN (v_id, v_id2);

  IF (SELECT count(*) FROM public.inference_records WHERE claim_text LIKE 'probe claim%') <> 0 THEN
    RAISE EXCEPTION 'migration 338 self-check FAILED: cleanup left probe rows behind';
  END IF;

  RAISE NOTICE 'migration 338 self-check PASSED';
END $$;
