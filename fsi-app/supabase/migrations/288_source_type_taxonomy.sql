-- 288 — source_type taxonomy column (Lane HYG-2, finish plan 2026-09-02).
--
-- WHAT THIS RETIRES. `fsi-app/src/lib/coverage-gaps.ts` has carried a STOPGAP since it was written: two
-- regex pattern sets (`ENV_BODY_PATTERNS`, `LEGISLATURE_PATTERNS`) matched against each source's
-- `name + url` text blob, at READ time, on every cache miss, to answer "is this source an environmental
-- body?" / "is this source a legislature?" for the Map . Coverage gaps card. The STOPGAP comment names
-- the fix: `docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md` (2026-05-08) — a structured classification tag
-- populated once and queried with a simple array-membership filter, instead of re-deriving it from text
-- on every read. This migration is that column. The classifier + backfill script that populate it are
-- `fsi-app/src/lib/sources/source-type-taxonomy.mjs` and `fsi-app/scripts/sources/backfill-source-type.mjs`
-- (same lane, same commit); `coverage-gaps.ts` is refactored in the same commit to read the column first
-- and fall back to the classifier only when a row has not been backfilled yet.
--
-- CHECKED FOR A COMPETING AXIS BEFORE ADDING THIS ONE (ledger discipline B1/B2). `sources` already
-- carries THREE classification axes landed after the May proposal was written:
--   * `source_role` (migration 063) + `category` (migration 084/123) — WHAT CONTENT a source routes to
--     (primary_legal_authority / intergovernmental_body / trade_press / ... -> regulatory / research /
--     market_news / operational_data). This is a content-routing axis. Neither value set distinguishes
--     "environmental regulator" from "legislature" from "generic executive-branch regulator" — a
--     `primary_legal_authority` row could be any of the three — so it cannot answer the Map card's
--     question and is NOT superseded by this column.
--   * `institution_id` (migration 122) — WHO published (grouping/identity), explicitly "orthogonal to
--     source_role/category" per that migration's own header. Also not a type-of-body axis.
-- No ADR names `source_type` or governs this axis (`grep -ril source_type docs/decisions/` — 0 hits,
-- confirmed this session). `source_type` is therefore a genuinely new, non-duplicating axis: WHAT KIND
-- OF BODY is this (environmental regulator vs legislature vs ...), which is what the coverage-gaps
-- consumer has always needed and the two existing axes do not encode.
--
-- SCOPE DEVIATION FROM THE PROPOSAL, STATED (per this lane's brief: "nullable; NO default that lies").
-- The proposal's own migration 049 sketch (§5) defaults the column to `'{}'::TEXT[]` (empty array,
-- NOT NULL). An empty array asserts "classified as having zero types" — a claim this migration cannot
-- back for any of the ~718 existing rows, none of which have been classified yet. NULL is the honest
-- value for "not yet classified" (distinct from "classified as none of the 11 known types"), so this
-- migration uses `TEXT[] NULL` with no default. Every other piece of this migration (the 11-value
-- vocabulary, TEXT[]+CHECK over ENUM, the GIN index) follows the proposal's design as specified.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the CHECK constraint and the index are each guarded by an
-- existence probe so a re-run of this file is a no-op, matching the ADD COLUMN IF NOT EXISTS convention
-- migration 063 set for this same table.

-- 1. The column. NULLable, no default — see "SCOPE DEVIATION" above.
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS source_type TEXT[] NULL;

-- 2. Validity CHECK. The 11 values match docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md §3 exactly, and
-- match SOURCE_TYPE_VALUES in src/lib/sources/source-type-taxonomy.mjs byte-for-byte (drift-guarded by
-- that module's own test — see source-type-taxonomy.test.mjs). Multi-type (overlap cases — proposal
-- §3.1, e.g. US EPA = environmental_body + regulatory_executive) is allowed by design: TEXT[], not a
-- scalar enum. NULL (not yet classified) passes the CHECK — `NULL <@ ARRAY[...]` evaluates to NULL, and
-- Postgres treats a NULL CHECK result as satisfied, never as a violation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sources_source_type_valid' AND conrelid = 'public.sources'::regclass
  ) THEN
    ALTER TABLE public.sources
      ADD CONSTRAINT sources_source_type_valid CHECK (
        source_type IS NULL OR source_type <@ ARRAY[
          'environmental_body',
          'legislature',
          'gazette',
          'regulatory_executive',
          'judiciary',
          'standards_body',
          'industry_assoc',
          'treaty_org',
          'research_institute',
          'news',
          'data_aggregator'
        ]::TEXT[]
      );
  END IF;
END $$;

-- 3. GIN index for the ANY()/`<@`/`&&` query pattern coverage-gaps.ts uses after refactor (proposal §5.2:
-- B-tree only supports whole-array equality, the wrong operation for "does this row carry this type").
-- Mirrors the existing idx_sources_jurisdictions / idx_sources_transport GIN indexes on this table.
CREATE INDEX IF NOT EXISTS idx_sources_source_type ON public.sources USING GIN (source_type);

-- 4. Documentation.
COMMENT ON COLUMN public.sources.source_type IS
  'Type-of-body taxonomy (11 values, docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md §3): what KIND of body '
  'this source is (environmental regulator, legislature, gazette, ...), orthogonal to source_role/category '
  '(migration 063/084 — WHAT CONTENT it routes to) and institution_id (migration 122 — WHO published). '
  'Multi-valued: many T1-T2 sources legitimately carry two tags (e.g. EPA = environmental_body + '
  'regulatory_executive). NULL means not yet classified — NOT an assertion of zero types; see migration '
  '288 header. Vocabulary + classifier: src/lib/sources/source-type-taxonomy.mjs. Backfilled by '
  'scripts/sources/backfill-source-type.mjs (dry by default; never overwrites an already-classified row). '
  'Consumed by src/lib/coverage-gaps.ts, which reads this column first and falls back to the classifier '
  'only for a still-NULL row.';

-- ── Post-check (idempotent — safe to re-run) ────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_check int;
  n_idx int;
  col_type text;
BEGIN
  SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sources' AND column_name = 'source_type';
  IF col_type IS DISTINCT FROM 'ARRAY' THEN
    RAISE EXCEPTION 'ABORT: sources.source_type has unexpected type % (expected ARRAY/text[])', col_type;
  END IF;

  SELECT count(*) INTO n_check FROM pg_constraint
    WHERE conname = 'sources_source_type_valid' AND conrelid = 'public.sources'::regclass;
  IF n_check <> 1 THEN
    RAISE EXCEPTION 'ABORT: sources_source_type_valid CHECK constraint missing (found %)', n_check;
  END IF;

  SELECT count(*) INTO n_idx FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'sources' AND indexname = 'idx_sources_source_type';
  IF n_idx <> 1 THEN
    RAISE EXCEPTION 'ABORT: idx_sources_source_type GIN index missing (found %)', n_idx;
  END IF;

  RAISE NOTICE 'migration 288 OK: sources.source_type (text[], nullable, no default), CHECK '
    'sources_source_type_valid (11-value vocabulary), idx_sources_source_type (GIN) all present';
END $$;
