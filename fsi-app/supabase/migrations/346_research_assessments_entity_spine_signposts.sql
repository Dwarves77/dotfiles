-- subject: Migration 346 (Lane L6, coordinator dispatch 2026-10-02, docs/dispatches/lane-briefs/2026-10-02/
-- brief-l6.md; the coordinator's 2026-10-02 schema ruling, README migration-number table). DDL SKETCH
-- ONLY -- AUTHORED, NOT APPLIED (two-track policy, CLAUDE.md standing rule 3). The coordinator applies
-- this via the Supabase CLI before the dependent `signpost-watch.ts` method writes any real row. Requires
-- migration 344 (`research_assessments`) and migration 282 (`entities`, `entity_kind`) already live.
--
-- WHAT THIS DOES, two independently-revertible halves.
--
-- (a) PROGRESSIVE RE-KEYING: `research_assessments.entity_id`, exactly the pattern migration 283 used for
-- `intelligence_items.instrument_entity_id` / `sources.organisation_entity_id` -- a nullable `text
-- REFERENCES entities(entity_id)` column beside the table's existing `uuid` PK, a partial index, and an
-- additive-only self-check (zero non-null values asserted at apply time; copied from 283's own post-check
-- block, lines ~160-170 of that file). This is what lets a research assessment be found FROM the entity
-- (corridor, instrument, technology) it is about. It does NOT make "assessment" a tenth entity kind --
-- `research_assessments` keeps its own uuid PK unchanged, same as `intelligence_items` and `sources` kept
-- theirs after 283. The backfill that populates this column is a SEPARATE, later, guarded script (not this
-- migration's job, not this lane's job -- name it as a follow-on, same posture as
-- `scripts/entities/backfill-entities.mjs` for 283's own columns).
--
-- (b) `signposts` -- the per-kind attribute table for the `signpost` entity kind (ADR-039(e): obligation and
-- signpost get their attribute tables first, "because they gate the most other work"; the remaining four
-- kinds are lane L19, not this lane). DDL is spec 08 section 1.2's literal CREATE TABLE, AS AMENDED by the
-- coordinator's 2026-10-02 schema ruling: `assessment_id` is a direct `uuid NOT NULL REFERENCES
-- research_assessments(id)` (not a detour through the entity spine for the signpost-to-assessment link
-- itself -- spec 08's own literal DDL predates migration 344's real, uuid-keyed `research_assessments`
-- table and cannot be followed byte-for-byte here). `watches` keeps its original `text NOT NULL REFERENCES
-- entities(entity_id)` shape, unchanged -- that half of the DDL was never in question.
--
-- THIRD, NAMED ADDITION BEYOND THE BRIEF'S LITERAL (a)/(b) TEXT -- flagged here and in the lane report
-- per CLAUDE.md rule 13 ("a flag is a commitment, not a comment"), not silently expanded scope.
-- `research_assessments.lifecycle_state` does not exist anywhere in migration 344 or in any later branch
-- on master as of this migration. Without it, the brief's own binding acceptance test ("the firing writes
-- a propagation_events row and transitions the parent assessment's lifecycle state per spec 08 S3.1's
-- table") and CLAUDE.md rule 17 ("a watcher that fires and leaves the assessment's state untouched is
-- exactly the defect rule 17 names") are not buildable at all -- there is nowhere on the row to write a
-- lifecycle transition. The column reuses spec 08 section 3.1's EXISTING 8-value lifecycle vocabulary
-- verbatim (the same `Lifecycle` TS union `src/lib/propagation/types.ts` already exports and
-- `methods/index.ts` already imports for `derived_values` rows) rather than inventing a second, narrower
-- vocabulary -- reuse-before-construction, not a new concept. `NOT NULL DEFAULT 'emerging'` (every
-- assessment starts at the weakest lifecycle state, matching spec 08's own diagram starting point),
-- additive, no backfill needed (migration 344 has 0 live rows; every existing row, if any exist by apply
-- time, lands at the honest default rather than a guessed value).
--
-- RLS -- mirrors migration 282/283 (world-readable `signposts`, no PII, service-role-only writes; the
-- `research_assessments.entity_id`/`lifecycle_state` additions inherit the base table's existing RLS
-- posture from migration 344 unchanged -- ALTER TABLE ADD COLUMN never touches a table's RLS policies).
--
-- `entity_kind` enum is UNCHANGED by this migration (grepped: `grep -rn "entity_kind\b"
-- fsi-app/supabase/migrations fsi-app/src/lib` against origin/master shows the enum's 11 values fixed at
-- migration 282; this migration adds no new value, confirming ADR-039(e)'s "nine [kinds], not ten" framing
-- is not reopened here -- 'signpost' was already one of the 11 enum values before this migration, the same
-- way 'obligation' was; this migration gives the signpost KIND its attribute TABLE, same relationship
-- migration 282 already has to migration 283's columns).
--
-- REVERSIBLE: `DROP TABLE IF EXISTS public.signposts; ALTER TABLE public.research_assessments DROP COLUMN
-- IF EXISTS lifecycle_state; ALTER TABLE public.research_assessments DROP COLUMN IF EXISTS entity_id;
-- CREATE OR REPLACE VIEW public.research_assessments_current AS SELECT ra.* FROM
-- public.research_assessments ra WHERE ra.is_current;` -- safe: 0 signposts rows exist by construction,
-- 0 populated entity_id/lifecycle_state-beyond-default values asserted at apply time below.

BEGIN;

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist -- migration 282 must be applied first';
  END IF;
  IF to_regclass('public.research_assessments') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.research_assessments does not exist -- migration 344 must be applied first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_kind') THEN
    RAISE EXCEPTION 'ABORT: entity_kind enum does not exist -- migration 282 must be applied first';
  END IF;
END $$;

-- ── (a) Progressive re-keying: research_assessments.entity_id (pattern: migration 283 lines 77-95) ────
ALTER TABLE public.research_assessments
  ADD COLUMN IF NOT EXISTS entity_id text REFERENCES public.entities(entity_id);
COMMENT ON COLUMN public.research_assessments.entity_id IS
  'Progressive-re-keying FK (ADR-024/ADR-039(e), pattern = migration 283''s instrument_entity_id/'
  'organisation_entity_id). Nullable, additive, backfilled by a SEPARATE later guarded script (not this '
  'migration). Lets a research assessment be found FROM the entity (corridor, instrument, technology) it '
  'is about. Does NOT make "assessment" an entity kind -- research_assessments keeps its own uuid PK, '
  'unchanged.';

CREATE INDEX IF NOT EXISTS research_assessments_entity_id_idx
  ON public.research_assessments (entity_id) WHERE entity_id IS NOT NULL;

-- ── Named addition: research_assessments.lifecycle_state (see header, "THIRD, NAMED ADDITION") ────────
ALTER TABLE public.research_assessments
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'emerging'
    CHECK (lifecycle_state IN ('emerging','strengthening','corroborated','verified','stalled','falsified','superseded','obsolete'));
COMMENT ON COLUMN public.research_assessments.lifecycle_state IS
  'Spec 08 section 3.1''s lifecycle axis (what the evidence has DONE), reused verbatim from the SAME 8-value '
  'vocabulary derived_values.lifecycle already carries (src/lib/propagation/types.ts Lifecycle). Written '
  'only by src/lib/propagation/methods/signpost-watch.ts''s fireSignpost() on a signpost firing, per the '
  'transitions that file documents (direction=refutes -> falsified per spec 08''s own table; '
  'direction=confirms advances one step toward corroborated, never auto-promoting to verified, which spec '
  '08''s table reserves for an editor+PROV action; direction=delays -> stalled, a named extension of the '
  'diagram''s own stalled branch, not literally in spec 08''s table -- see signpost-watch.ts header). Added '
  'by migration 346, not migration 344 -- that table shipped before this lifecycle concept existed on it.';

-- ── (b) signposts: the signpost entity kind's attribute table (spec 08 section 1.2, amended by ruling) ──
CREATE TABLE IF NOT EXISTS public.signposts (
  entity_id     text PRIMARY KEY REFERENCES public.entities(entity_id),
  assessment_id uuid NOT NULL REFERENCES public.research_assessments(id),
  watches       text NOT NULL REFERENCES public.entities(entity_id),
  predicate     jsonb NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('confirms','refutes','delays')),
  fired_at      timestamptz,
  CONSTRAINT predicate_is_evaluable CHECK (predicate ? 'op')
);

COMMENT ON TABLE public.signposts IS
  'Spec 08 section 1.2''s signpost DDL, amended by the coordinator''s 2026-10-02 schema ruling: '
  'assessment_id is a direct uuid FK to research_assessments(id), not a detour through the entity spine '
  '(research_assessments is outside the spine proper, joined only via its own entity_id progressive-'
  're-keying column above). watches keeps its original text REFERENCES entities(entity_id) shape. A '
  'machine-observable predicate whose firing changes a Research assessment''s lifecycle_state -- the '
  'mechanism that closes Loop B on the Research surface with zero human-approval affordance anywhere in '
  'the firing path (doctrine research-is-horizon-scan). Written by '
  'src/lib/propagation/methods/signpost-watch.ts.';
COMMENT ON COLUMN public.signposts.predicate IS
  'jsonb, must carry an "op" key (predicate_is_evaluable CHECK). Shapes signpost-watch.ts evaluates: '
  '{op:"date_passed", field:"..."} | {op:"threshold", metric:"...", gte:N} | '
  '{op:"count_gte", relation:"...", n:N}.';
COMMENT ON COLUMN public.signposts.direction IS
  'confirms | refutes | delays -- see research_assessments.lifecycle_state''s comment for the transition '
  'each direction drives on firing.';

CREATE INDEX IF NOT EXISTS signposts_assessment_id_idx ON public.signposts (assessment_id);
CREATE INDEX IF NOT EXISTS signposts_watches_idx ON public.signposts (watches);
CREATE INDEX IF NOT EXISTS signposts_unfired_idx ON public.signposts (fired_at) WHERE fired_at IS NULL;

-- ── RLS -- mirrors migration 282/283 (world-readable, no PII, service-role-only writes) ────────────────
ALTER TABLE public.signposts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signposts_read ON public.signposts;
CREATE POLICY signposts_read ON public.signposts FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policy: writes arrive only through signpost-watch.ts's guarded service-role
-- path (fireSignpost()), same posture as migration 282/283's own new tables.

-- ── research_assessments_current view -- re-stated so the new columns are visible through it ──────────
-- `SELECT ra.*` expands to the column list AT (RE)CREATION TIME in Postgres, so the two new columns
-- above would NOT appear through the existing view without this re-statement. Identical SQL text to
-- migration 344's own CREATE OR REPLACE VIEW -- a restatement, not a redesign.
CREATE OR REPLACE VIEW public.research_assessments_current AS
SELECT ra.*
FROM public.research_assessments ra
WHERE ra.is_current;

GRANT SELECT ON public.research_assessments_current TO authenticated;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols_ra int;
  n_cols_signposts int;
  n_entity_id_nonnull bigint;
  n_lifecycle_nondefault bigint;
  n_signposts_rows bigint;
BEGIN
  SELECT count(*) INTO n_cols_ra FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'research_assessments';
  IF n_cols_ra <> 26 THEN
    RAISE EXCEPTION 'migration 346 self-check failed: research_assessments has % columns, expected 26 (24 from migration 344 + entity_id + lifecycle_state)', n_cols_ra;
  END IF;

  SELECT count(*) INTO n_cols_signposts FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'signposts';
  IF n_cols_signposts <> 6 THEN
    RAISE EXCEPTION 'migration 346 self-check failed: signposts has % columns, expected 6', n_cols_signposts;
  END IF;

  -- Additive-only proof (pattern: migration 283's own post-check, lines ~160-168) -- this migration must
  -- not have populated entity_id on any row, and every existing research_assessments row must have
  -- landed on the honest default lifecycle_state, never a guessed non-default value.
  EXECUTE 'SELECT count(*) FROM public.research_assessments WHERE entity_id IS NOT NULL' INTO n_entity_id_nonnull;
  EXECUTE 'SELECT count(*) FROM public.research_assessments WHERE lifecycle_state <> ''emerging''' INTO n_lifecycle_nondefault;
  EXECUTE 'SELECT count(*) FROM public.signposts' INTO n_signposts_rows;
  IF n_entity_id_nonnull <> 0 OR n_lifecycle_nondefault <> 0 OR n_signposts_rows <> 0 THEN
    RAISE EXCEPTION 'ABORT: migration 346 must land additive-only (entity_id non-null=%, lifecycle_state non-default=%, signposts rows=%) -- backfill/population are separate, later steps', n_entity_id_nonnull, n_lifecycle_nondefault, n_signposts_rows;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'research_assessments_current'
  ) THEN
    RAISE EXCEPTION 'migration 346 self-check failed: research_assessments_current view missing';
  END IF;

  RAISE NOTICE 'migration 346 OK: research_assessments has % columns (entity_id + lifecycle_state added), signposts created (% columns), RLS on, additive-only', n_cols_ra, n_cols_signposts;
END $$;

COMMIT;

-- Rollback: BEGIN;
--   DROP TABLE IF EXISTS public.signposts;
--   ALTER TABLE public.research_assessments DROP COLUMN IF EXISTS lifecycle_state;
--   ALTER TABLE public.research_assessments DROP COLUMN IF EXISTS entity_id;
--   CREATE OR REPLACE VIEW public.research_assessments_current AS SELECT ra.* FROM public.research_assessments ra WHERE ra.is_current;
-- COMMIT;
