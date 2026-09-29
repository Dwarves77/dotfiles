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
-- never-overwritten-in-place posture derived_values uses for a recompute), `derived_from jsonb` (see
-- DOCUMENTED DEVIATION below).
--
-- DOCUMENTED DEVIATION (mirrors migration 285's own header convention of naming its deliberate
-- deviations from the spec's literal DDL, so this migration stays honest about where it diverges from
-- the dispatch's literal wording rather than silently reinterpreting it). The dispatch and ADR-036 both
-- say inference_records' `derived_from` goes "into derivation_edges... so it inherits the existing
-- invalidation DAG." Migration 285's `derivation_edges.to_value_id` is `uuid NOT NULL REFERENCES
-- derived_values(value_id)`, it can ONLY point at a derived_values row, and its `from_table` CHECK
-- (`derivation_edges_from_table_allowed`) is a closed 6-table allowlist that does not include
-- `inference_records` on either side. Widening that allowlist and FK is a migration-285-touching change
-- outside this lane's write set (wave2b-lanes-2026-09-29.md names migration 338/339 as W2-G's own
-- numbers; 285 belongs to no lane in this wave). So `inference_records.derived_from` is instead a
-- `jsonb` DECLARED-INPUT list, the SAME PATTERN `derived_values.inputs` already uses (285's own
-- comment: "the DECLARED input list a caller supplies... derivation_edges is the SAME information,
-- normalised into queryable rows"), here WITHOUT the normalised-rows half, since derivation_edges
-- cannot take this table as a participant yet. This is flagged, not silently dropped (CLAUDE.md rule
-- 13): a follow-on migration that widens derivation_edges' allowlist to admit inference_records as a
-- first-class DAG participant is the honest next step, not built here. `cited_item_ids` (this table's
-- own citation array, checked non-empty below) is the load-bearing provenance link today; `derived_from`
-- is the SAME declared-input shape derived_values.inputs uses, for any additional non-item input
-- (a derived_values row, an obligation, another inference_record) an inference cites.
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
  derived_from  jsonb NOT NULL DEFAULT '[]'::jsonb, -- declared-input list; see DOCUMENTED DEVIATION above
  supersedes    uuid REFERENCES public.inference_records(inference_id),
  trigger_question_ref text, -- the S1 trigger_question.subjectRef this inference answers (buildSubjectRef
                              -- shape from src/lib/connections/flag-namespaces.mjs); best-effort provenance
                              -- back to the question that produced this row, nullable (an inference minted
                              -- by a future non-question path, e.g. directly off the drain, has none).
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
COMMENT ON COLUMN public.inference_records.derived_from IS
  'jsonb array of declared, non-item inputs (the derived_values.inputs InputRef shape: {table, pk, '
  'version}) this inference cites beyond cited_item_ids. See this migration''s header, DOCUMENTED '
  'DEVIATION, for why this is NOT a derivation_edges row today (that table''s to_value_id FK and '
  'from_table allowlist do not yet admit inference_records as a participant).';

CREATE INDEX IF NOT EXISTS inference_records_subject_idx ON public.inference_records (subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inference_records_status_idx ON public.inference_records (status_token);
CREATE INDEX IF NOT EXISTS inference_records_supersedes_idx ON public.inference_records (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX IF NOT EXISTS inference_records_trigger_question_idx ON public.inference_records (trigger_question_ref) WHERE trigger_question_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS inference_records_current_idx ON public.inference_records (inference_id) WHERE supersedes IS NULL;

-- ── RLS: raw table denied, service-role only (same posture as derived_values, migration 285) ──────────
ALTER TABLE public.inference_records ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT policy on inference_records for anon/authenticated: deliberate. service_role bypasses
-- RLS by default (Postgres/Supabase convention); every write rides src/lib/propagation/drain.ts's Pass 2
-- (via the infer-from-question method, when wired) or a guarded script, never a direct client write.

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
  INSERT INTO public.inference_records (claim_text, status_token, confidence, cited_item_ids, origin_class, computed_by)
  VALUES ('probe claim', 'HYPOTHESIS', 0.6, ARRAY[gen_random_uuid()], 'derived', 'infer-from-question@v1')
  RETURNING inference_id INTO v_id;

  BEGIN
    INSERT INTO public.inference_records (claim_text, status_token, confidence, cited_item_ids, origin_class, computed_by)
    VALUES ('bad status', 'MAYBE', 0.5, ARRAY[gen_random_uuid()], 'derived', 'x');
    v_failed := true; -- should never reach here
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  BEGIN
    INSERT INTO public.inference_records (claim_text, status_token, confidence, cited_item_ids, origin_class, computed_by)
    VALUES ('empty cites', 'HYPOTHESIS', 0.5, ARRAY[]::uuid[], 'derived', 'x');
    v_failed := true; -- should never reach here
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  INSERT INTO public.inference_records (claim_text, status_token, confidence, cited_item_ids, origin_class, computed_by, supersedes)
  VALUES ('probe claim, revised', 'HYPOTHESIS', 0.65, ARRAY[gen_random_uuid()], 'derived', 'infer-from-question@v1', v_id)
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
