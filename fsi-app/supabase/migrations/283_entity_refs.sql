-- 283 — progressive re-keying: nullable entity_id FK columns beside existing text keys, plus
-- entity_refs for the multi-valued case (lane DP-SPINE, system-completion train, 2026-09-02).
--
-- WHY THIS IS SPLIT FROM MIGRATION 282. 282 creates the spine (entities/entity_identifiers/entity_scope)
-- with zero rows and zero readers pointing at it. This migration is the first thing that makes an EXISTING
-- table referenceable BY the spine — additive, nullable, and (per ADR-024's progressive-re-keying decision)
-- deliberately NOT a rewrite of any existing text column. No NOT NULL, no DROP, no rewrite of an existing
-- column's type or values anywhere in this file.
--
-- WHY SINGLE-VALUED COLUMNS FOR SOME REFERENCES AND A JOIN TABLE FOR OTHERS — the split this migration's
-- header exists to justify:
--
--   `intelligence_items.instrument_entity_id` and `sources.organisation_entity_id` are plain nullable FK
--   COLUMNS because the relationship they encode is genuinely single-valued: one intelligence_item names
--   at most one canonical instrument (canonical_instrument_key is already a single text column, migration
--   200/255), and one source has at most one owning organisation (a source's url resolves to one
--   registrable host). A single column is the honest, simplest shape for a single fact, and it is exactly
--   what a reader migrating off `.eq("canonical_instrument_key", ...)` / `.eq("source_url", ...)` wants:
--   `.eq("instrument_entity_id", ...)` / `.eq("organisation_entity_id", ...)`, same shape, one join fewer.
--
--   `jurisdiction_iso` on BOTH `intelligence_items` (migration 033) and `regions` (migration 106) is a
--   `TEXT[]` — genuinely MULTI-valued (an item can name several jurisdictions; a region groups several ISO
--   codes). A single `jurisdiction_entity_id` column cannot hold that without either picking one arbitrary
--   winner (a silent, undocumented narrowing of an existing array-valued fact — the exact class of defect
--   this codebase's own doctrine forbids, see ADR-018/021 on not collapsing a real one-to-many relationship
--   into a scalar for convenience) or being ITSELF an array of entity ids, which would then need its own
--   ordinal/provenance handling per element and would duplicate exactly what a join table already gives for
--   free. `entity_refs` is that join table: one row per (table, row, entity, role), so N jurisdictions on one
--   item become N rows rather than one lossy scalar or a second parallel array a caller could get out of
--   sync with the first.
--
--   NOTE — this migration's `entity_refs` shape supersedes the illustrative `jurisdiction_entity_id` column
--   names that this lane's own governing plan document (docs/plans/system-completion-plan-2026-09-02.md §2,
--   Lane DP-SPINE paragraph) names for `intelligence_items` and `regions`. That plan text pre-dates reading
--   migration 033's actual column type (`jurisdiction_iso TEXT[]`, confirmed multi-valued) and this lane's
--   own live-facts brief, which states the array type explicitly. A singular `jurisdiction_entity_id` FK
--   column on either table would be exactly the silent-narrowing defect the paragraph above names — so this
--   migration implements the array-consistent `entity_refs` join instead, and this note records the
--   deliberate deviation from the plan's literal (and, on this evidence, inconsistent) column names rather
--   than silently diverging from it.
--
-- `entity_refs.ref_table` is CHECK-restricted to the two tables that actually carry a TEXT[] jurisdiction
-- column today (`intelligence_items`, `regions`) — a closed, reason-bearing allowlist in the same spirit as
-- this codebase's other shrinking/growing allowlists (F14/F22/F24/F27), not an open text column a future
-- writer could point at an arbitrary table by typo.
--
-- BACKFILL IS A SEPARATE, GUARDED STEP (scripts/entities/backfill-entities.mjs, same commit) — this
-- migration is schema-only and asserts zero rows in entity_refs and zero non-null instrument_entity_id/
-- organisation_entity_id values on apply, matching migration 258's "structure now, numbers separately"
-- posture (see that migration's header on emission_factors).

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist — migration 282 must be applied first';
  END IF;
  IF to_regclass('public.intelligence_items') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.intelligence_items does not exist';
  END IF;
  IF to_regclass('public.sources') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.sources does not exist';
  END IF;
  IF to_regclass('public.regions') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.regions does not exist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='intelligence_items' AND column_name='jurisdiction_iso'
  ) THEN
    RAISE EXCEPTION 'ABORT: intelligence_items.jurisdiction_iso missing — migration 033 must be applied first';
  END IF;
END $$;

-- ── Single-valued progressive FK columns ────────────────────────────────────────────────────────────
ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS instrument_entity_id text REFERENCES public.entities(entity_id);
COMMENT ON COLUMN public.intelligence_items.instrument_entity_id IS
  'FK-backed replacement for text-keyed lookups on canonical_instrument_key (migration 200/255). Nullable, '
  'additive, backfilled by scripts/entities/backfill-entities.mjs. canonical_instrument_key is UNTOUCHED — '
  'this is progressive re-keying (ADR-024), not a rewrite: both columns coexist until every reader has '
  'migrated, tracked by F30 (entity-spine fitness function).';

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS organisation_entity_id text REFERENCES public.entities(entity_id);
COMMENT ON COLUMN public.sources.organisation_entity_id IS
  'FK-backed replacement for a host-derived organisation identity (previously implicit in sources.url). '
  'Nullable, additive, backfilled by scripts/entities/backfill-entities.mjs (one organisation entity per '
  'registrable host, scheme HOST in entity_identifiers). sources.url is UNTOUCHED.';

CREATE INDEX IF NOT EXISTS intelligence_items_instrument_entity_idx
  ON public.intelligence_items (instrument_entity_id) WHERE instrument_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sources_organisation_entity_idx
  ON public.sources (organisation_entity_id) WHERE organisation_entity_id IS NOT NULL;

-- ── entity_refs — the multi-valued join (jurisdiction_iso TEXT[] on intelligence_items AND regions) ────
CREATE TABLE IF NOT EXISTS public.entity_refs (
  ref_table   text NOT NULL,
  ref_id      uuid NOT NULL,
  entity_id   text NOT NULL REFERENCES public.entities(entity_id),
  role        text NOT NULL,
  asserted_by text NOT NULL,
  asserted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ref_table, ref_id, entity_id, role),
  CONSTRAINT entity_refs_ref_table_allowed CHECK (ref_table IN ('intelligence_items', 'regions'))
);

COMMENT ON TABLE public.entity_refs IS
  'Progressive-re-keying join for MULTI-valued text-keyed references (ADR-024) — today, one row per '
  '(jurisdiction ISO code on a TEXT[] column) x (referencing row). role=''jurisdiction'' is the only role '
  'this lane''s backfill writes; the column is open text (not a CHECK-closed vocabulary) because a future '
  'multi-valued relation (e.g. multiple obligations scoping one item) can reuse this table with a new role '
  'value rather than a new join table, once entity_refs_ref_table_allowed is widened for that table.';
COMMENT ON COLUMN public.entity_refs.ref_table IS
  'Closed allowlist (entity_refs_ref_table_allowed): the tables known to carry a multi-valued text column '
  'this migration''s backfill resolves. Widen deliberately, in a reviewed migration, never by inference.';
COMMENT ON COLUMN public.entity_refs.role IS
  'What relationship this ref asserts between ref_table/ref_id and entity_id. ''jurisdiction'' today (from '
  'jurisdiction_iso); open text so a later producer can add a role without a schema change, same posture as '
  'entity_scope.relation in migration 282.';

CREATE INDEX IF NOT EXISTS entity_refs_entity_idx ON public.entity_refs (entity_id);
CREATE INDEX IF NOT EXISTS entity_refs_ref_idx ON public.entity_refs (ref_table, ref_id);

-- ── RLS — mirrors migration 282 (world-readable, no PII, service-role-only writes) ──────────────────────
ALTER TABLE public.entity_refs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_refs_read ON public.entity_refs;
CREATE POLICY entity_refs_read ON public.entity_refs FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policy: writes arrive through scripts/entities/backfill-entities.mjs's guarded
-- service-role path, same posture as migration 282's three tables.

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols_refs int;
  n_instrument_col int;
  n_org_col int;
  n_refs_rows bigint;
  n_instrument_nonnull bigint;
  n_org_nonnull bigint;
BEGIN
  SELECT count(*) INTO n_cols_refs FROM information_schema.columns
    WHERE table_schema='public' AND table_name='entity_refs';
  IF n_cols_refs <> 6 THEN
    RAISE EXCEPTION 'ABORT: entity_refs has % columns, expected 6', n_cols_refs;
  END IF;

  SELECT count(*) INTO n_instrument_col FROM information_schema.columns
    WHERE table_schema='public' AND table_name='intelligence_items' AND column_name='instrument_entity_id';
  IF n_instrument_col <> 1 THEN
    RAISE EXCEPTION 'ABORT: intelligence_items.instrument_entity_id missing after ADD COLUMN';
  END IF;

  SELECT count(*) INTO n_org_col FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sources' AND column_name='organisation_entity_id';
  IF n_org_col <> 1 THEN
    RAISE EXCEPTION 'ABORT: sources.organisation_entity_id missing after ADD COLUMN';
  END IF;

  -- Additive-only proof: this migration must not have populated anything (backfill is a separate,
  -- guarded, later step) and must not have touched an existing row's existing columns.
  EXECUTE 'SELECT count(*) FROM public.entity_refs' INTO n_refs_rows;
  EXECUTE 'SELECT count(*) FROM public.intelligence_items WHERE instrument_entity_id IS NOT NULL' INTO n_instrument_nonnull;
  EXECUTE 'SELECT count(*) FROM public.sources WHERE organisation_entity_id IS NOT NULL' INTO n_org_nonnull;
  IF n_refs_rows <> 0 OR n_instrument_nonnull <> 0 OR n_org_nonnull <> 0 THEN
    RAISE EXCEPTION 'ABORT: this migration must land with zero populated entity refs (refs=%, instrument=%, org=%) — backfill is a separate step', n_refs_rows, n_instrument_nonnull, n_org_nonnull;
  END IF;

  RAISE NOTICE 'migration 283 OK: instrument_entity_id + organisation_entity_id columns added, entity_refs created, RLS on, 0 rows/0 populated FKs by design';
END $$;
