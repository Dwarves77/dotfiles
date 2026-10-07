-- subject: Migration 355 (lane G5-TERMS, 2026-10-06, buildout plan Stage 5): `vocabulary_terms` and `vocabulary_mentions` are created, the durable home for repeated mentions of an entity, material, theme or term the system does not hold (counted, proposed, adopted by rule); `intelligence_items.compliance_object_candidates` captures the out-of-vocabulary compliance-object values the parser used to drop silently; RLS on, admin read only, service role writes; NOT APPLIED.
-- 355 -- vocabulary terms, their mentions, and the compliance-object candidate capture (lane G5-TERMS, 2026-10-06).
--
-- NOT APPLIED. Authored by lane G5-TERMS; the coordinator applies it (two-track policy, CLAUDE.md standing
-- rule 3: schema DDL applies via the Supabase CLI before the dependent code commits). Until it is applied
-- the collector (scripts/connections/term-recurrence.mjs) is dry by default and must not be applied. The
-- dependent code writes intelligence_items.compliance_object_candidates on every brief write, exactly as it
-- writes theme_candidate, so this DDL MUST be applied before the code merges (two-track policy).
-- Requires the sources and intelligence_items tables and profiles.is_platform_admin (migrations 027, 249).
--
-- WHY. Vocabularies in this system are code constants and DB CHECKs (the 7 topic tags, the 19 compliance
-- roles, the glossary of scenario tags, the 20 named standards, the 7 themes). Nothing counts a mention of
-- something the system does not hold, so a recurring unknown never becomes a term: the theme_candidate bank
-- (migration 136) says it is "mined by the follow-on recurrence detector" and no such detector exists, and
-- the parser drops an out-of-vocabulary compliance role without recording it. Plan Stage 5: "Repeated
-- mentions of an entity, material, theme or term the system does not hold raise a proposal, adopt past a
-- threshold, and become a source search target."
--
-- (a) vocabulary_terms. One row per (kind, term_key). kind is the class of thing: standard, material, theme,
--   scenario, compliance_object, term. term_key is the normalised mention (lower case, single spaces) and is
--   unique per kind. status is proposed (counted, below threshold), adopted (past the threshold, by rule, no
--   human) or retired (set by an admin, never overwritten by an automatic writer). distinct_items and
--   distinct_sources are the recurrence counts. adoption_rule records the rule text that adopted the term
--   (a term adopts when distinct_items >= CITATION_FREQUENCY_PROMOTION_THRESHOLD from src/lib/trust.ts and
--   distinct_sources >= 2); evidence is a small jsonb of what was counted.
-- (b) vocabulary_mentions. One row per (term, item, detector): which item mentioned the term, through which
--   detector, in what words (surface_text), and which source that item came from (source_id, nullable).
--   Detectors: entity-link (an unresolved, ambiguous or unknown-standard mention in an intake-entity-link
--   flag), theme-candidate (a theme_candidate value other than unclassified), scenario-tag (a scenario tag
--   outside the system-prompt glossary), compliance-object (a compliance_object_candidates value), brief-terms
--   (the optional mentioned_terms array a session brief author emits).
-- (c) intelligence_items.compliance_object_candidates text[]. The capture-not-null idiom of theme_candidate
--   (migration 136): the compliance-object values the parser found outside the closed 19-value list are banked
--   on the row instead of dropped (parse-output.ts, canonical-pipeline.ts writeSynthesizedBrief).
--
-- RLS. Both tables: RLS on; one SELECT policy for platform admins (profiles.is_platform_admin, the pattern of
-- migrations 249 and 342); no INSERT, UPDATE or DELETE policy, so writes arrive only through the service role
-- (scripts/connections/term-recurrence.mjs and apply-record-briefs.mjs, both through the guarded path of
-- scripts/lib/db.mjs). A proposed term is visible to the admin through the table only.
--
-- SELF-CHECK. Column and constraint presence, RLS on, the admin policy present on each table and no write
-- policy, and an ADVERSARIAL check (CLAUDE.md standing rule 15: a guard is proven by attack, not by presence):
-- inside a sub-transaction that is rolled back, a duplicate (kind, term_key), an unknown kind, an unknown
-- status and an adopted row with no adoption stamp are each attempted and must each be refused.
--
-- Reversible: DROP TABLE public.vocabulary_mentions; DROP TABLE public.vocabulary_terms;
--   ALTER TABLE public.intelligence_items DROP COLUMN compliance_object_candidates;

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF to_regclass('public.intelligence_items') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.intelligence_items does not exist';
  END IF;
  IF to_regclass('public.sources') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.sources does not exist';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.profiles does not exist (the admin read policy keys on profiles.is_platform_admin)';
  END IF;
END $$;

-- (a) vocabulary_terms
CREATE TABLE IF NOT EXISTS public.vocabulary_terms (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text        NOT NULL CHECK (kind IN ('standard', 'material', 'theme', 'scenario', 'compliance_object', 'term')),
  term_key          text        NOT NULL CHECK (length(term_key) > 0 AND term_key = lower(btrim(term_key))),
  label             text        NOT NULL,
  status            text        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'adopted', 'retired')),
  distinct_items    integer     NOT NULL DEFAULT 0 CHECK (distinct_items >= 0),
  distinct_sources  integer     NOT NULL DEFAULT 0 CHECK (distinct_sources >= 0),
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  adopted_at        timestamptz,
  adoption_rule     text,
  evidence          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT vocabulary_terms_kind_key_unique UNIQUE (kind, term_key),
  CONSTRAINT vocabulary_terms_adopted_is_stamped CHECK (status <> 'adopted' OR (adopted_at IS NOT NULL AND adoption_rule IS NOT NULL))
);

COMMENT ON TABLE public.vocabulary_terms IS
  'Terms the system does not hold in a code vocabulary, counted from repeated mentions (lane G5-TERMS, plan Stage 5). status proposed = counted; adopted = past the recurrence threshold by rule (distinct_items >= trust.ts CITATION_FREQUENCY_PROMOTION_THRESHOLD and distinct_sources >= 2), no human; retired = set by an admin, never overwritten by an automatic writer. Written only by scripts/connections/term-recurrence.mjs and scripts/turns/apply-record-briefs.mjs through the guarded path. Admin read only.';
COMMENT ON COLUMN public.vocabulary_terms.term_key IS 'The normalised mention (lower case, single spaces); unique per kind.';
COMMENT ON COLUMN public.vocabulary_terms.adoption_rule IS 'The rule text that adopted the term, recorded at adoption so a later change to the threshold never rewrites history.';
COMMENT ON COLUMN public.vocabulary_terms.evidence IS 'What was counted: per-detector mention counts and a few sample item ids. Informational; the counts columns are the contract.';

CREATE INDEX IF NOT EXISTS vocabulary_terms_status_kind_idx ON public.vocabulary_terms (status, kind);

-- (b) vocabulary_mentions
CREATE TABLE IF NOT EXISTS public.vocabulary_mentions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id       uuid        NOT NULL REFERENCES public.vocabulary_terms(id) ON DELETE CASCADE,
  item_id       uuid        NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  source_id     uuid        REFERENCES public.sources(id) ON DELETE SET NULL,
  detector      text        NOT NULL CHECK (detector IN ('entity-link', 'theme-candidate', 'scenario-tag', 'compliance-object', 'brief-terms')),
  surface_text  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vocabulary_mentions_one_per_term_item_detector UNIQUE (term_id, item_id, detector)
);

COMMENT ON TABLE public.vocabulary_mentions IS
  'One row per (term, item, detector): the item that mentioned the term, through which detector, in what words, and the source that item came from (nullable). Written only by scripts/connections/term-recurrence.mjs and scripts/turns/apply-record-briefs.mjs through the guarded path. Admin read only.';

CREATE INDEX IF NOT EXISTS vocabulary_mentions_term_idx ON public.vocabulary_mentions (term_id);
CREATE INDEX IF NOT EXISTS vocabulary_mentions_item_idx ON public.vocabulary_mentions (item_id);

-- (c) the compliance-object capture
ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS compliance_object_candidates TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.intelligence_items.compliance_object_candidates IS
  'Capture-not-null residual (the compliance_object_tags twin of theme_candidate, migration 136): the compliance-object values the agent emitted that matched none of the 19 closed compliance_object_tags values, banked instead of dropped by parse-output.ts. Mined by scripts/connections/term-recurrence.mjs (kind compliance_object); not a customer-facing field.';

-- RLS: admin read, no write policy (service role only writes).
ALTER TABLE public.vocabulary_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vocabulary_terms_admin_read ON public.vocabulary_terms;
CREATE POLICY vocabulary_terms_admin_read ON public.vocabulary_terms
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));

ALTER TABLE public.vocabulary_mentions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vocabulary_mentions_admin_read ON public.vocabulary_mentions;
CREATE POLICY vocabulary_mentions_admin_read ON public.vocabulary_mentions
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));

-- Self-check
DO $$
DECLARE
  n_cols_terms int;
  n_cols_ment  int;
  n_col_cand   int;
  v_rls_t      boolean;
  v_rls_m      boolean;
  n_pol_t      int;
  n_pol_m      int;
  n_write_pol  int;
  v_refused_dup    boolean := false;
  v_refused_kind   boolean := false;
  v_refused_status boolean := false;
  v_refused_stamp  boolean := false;
BEGIN
  SELECT count(*) INTO n_cols_terms FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vocabulary_terms';
  IF n_cols_terms <> 12 THEN RAISE EXCEPTION 'ABORT: vocabulary_terms has % columns, expected 12', n_cols_terms; END IF;

  SELECT count(*) INTO n_cols_ment FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vocabulary_mentions';
  IF n_cols_ment <> 7 THEN RAISE EXCEPTION 'ABORT: vocabulary_mentions has % columns, expected 7', n_cols_ment; END IF;

  SELECT count(*) INTO n_col_cand FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'intelligence_items' AND column_name = 'compliance_object_candidates';
  IF n_col_cand <> 1 THEN RAISE EXCEPTION 'ABORT: intelligence_items.compliance_object_candidates is missing'; END IF;

  SELECT c.relrowsecurity INTO v_rls_t FROM pg_class c WHERE c.oid = 'public.vocabulary_terms'::regclass;
  SELECT c.relrowsecurity INTO v_rls_m FROM pg_class c WHERE c.oid = 'public.vocabulary_mentions'::regclass;
  IF NOT v_rls_t THEN RAISE EXCEPTION 'ABORT: RLS is not enabled on vocabulary_terms'; END IF;
  IF NOT v_rls_m THEN RAISE EXCEPTION 'ABORT: RLS is not enabled on vocabulary_mentions'; END IF;

  SELECT count(*) INTO n_pol_t FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vocabulary_terms' AND policyname = 'vocabulary_terms_admin_read' AND cmd = 'SELECT';
  SELECT count(*) INTO n_pol_m FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vocabulary_mentions' AND policyname = 'vocabulary_mentions_admin_read' AND cmd = 'SELECT';
  IF n_pol_t <> 1 OR n_pol_m <> 1 THEN RAISE EXCEPTION 'ABORT: the admin read policy is missing on a vocabulary table'; END IF;
  SELECT count(*) INTO n_write_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('vocabulary_terms', 'vocabulary_mentions') AND cmd <> 'SELECT';
  IF n_write_pol <> 0 THEN RAISE EXCEPTION 'ABORT: a vocabulary table must have no write policy, found %', n_write_pol; END IF;

  IF (SELECT count(*) FROM public.vocabulary_terms) <> 0 OR (SELECT count(*) FROM public.vocabulary_mentions) <> 0 THEN
    RAISE EXCEPTION 'ABORT: the vocabulary tables are not empty at migration time';
  END IF;

  -- Attack: the constraints must refuse a duplicate key, an unknown kind, an unknown status, and an
  -- adopted term with no adoption stamp. Everything below is rolled back.
  BEGIN
    INSERT INTO public.vocabulary_terms (kind, term_key, label) VALUES ('standard', 'g5-selfcheck', 'g5-selfcheck');
    BEGIN
      INSERT INTO public.vocabulary_terms (kind, term_key, label) VALUES ('standard', 'g5-selfcheck', 'g5-selfcheck');
    EXCEPTION WHEN unique_violation THEN v_refused_dup := true;
    END;
    BEGIN
      INSERT INTO public.vocabulary_terms (kind, term_key, label) VALUES ('bogus', 'g5-selfcheck-kind', 'x');
    EXCEPTION WHEN check_violation THEN v_refused_kind := true;
    END;
    BEGIN
      INSERT INTO public.vocabulary_terms (kind, term_key, label, status) VALUES ('term', 'g5-selfcheck-status', 'x', 'bogus');
    EXCEPTION WHEN check_violation THEN v_refused_status := true;
    END;
    BEGIN
      INSERT INTO public.vocabulary_terms (kind, term_key, label, status) VALUES ('term', 'g5-selfcheck-stamp', 'x', 'adopted');
    EXCEPTION WHEN check_violation THEN v_refused_stamp := true;
    END;
    IF NOT v_refused_dup THEN RAISE EXCEPTION 'ABORT: a duplicate (kind, term_key) was accepted'; END IF;
    IF NOT v_refused_kind THEN RAISE EXCEPTION 'ABORT: an unknown kind was accepted'; END IF;
    IF NOT v_refused_status THEN RAISE EXCEPTION 'ABORT: an unknown status was accepted'; END IF;
    IF NOT v_refused_stamp THEN RAISE EXCEPTION 'ABORT: an adopted term without an adoption stamp was accepted'; END IF;
    RAISE EXCEPTION 'g5_355_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'g5_355_selfcheck_rollback' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'migration 355 OK: vocabulary_terms (% columns), vocabulary_mentions (% columns), compliance_object_candidates present, constraints attacked and held, RLS on with admin read and no write policy, 0 rows', n_cols_terms, n_cols_ment;
END $$;

COMMIT;
