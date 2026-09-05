-- 308 — census_worklist archive columns (W2.2 / ruling R-A: the archive path for off-vertical rows).
--
-- THE GAP [CONFIRMED, migration 221 re-read this session]: census_worklist carries no is_archived /
-- archive_reason columns — only flagged_reason/flagged_at (a narrower "malformed/incomplete" vocabulary,
-- unrelated to relevance) and the enumeration_status ladder (discovered/classified/dry_run_complete/
-- reconciled/flagged, none of which mean "archived as off-vertical"). scripts/maintenance/census-off-
-- vertical.mjs's `arg=archive` apply path has therefore always returned NOT RUNNABLE (see that file's own
-- header, and docs/runbooks/MAINTENANCE-RUNBOOK.md §5): `archivePatch("census_worklist", ...)`
-- (scripts/lib/db.mjs) has nothing to set on this table. This migration is that column pair, unblocking
-- R-A's "archive (reversible)" branch the same lane's code change makes runnable in the same commit.
--
-- WHY THIS EXACT SHAPE (reuse, not a new convention). `is_archived BOOLEAN NOT NULL DEFAULT FALSE` +
-- `archive_reason TEXT` is intelligence_items' own pair, verbatim (migration 004_source_trust_framework.sql
-- lines 176-177) — no CHECK constraint pairing them there either, so none is added here; db.mjs's
-- `archivePatch(table, archive_reason)` is TABLE-GENERIC (`{ is_archived: true, archive_reason }`, with an
-- extra `provenance_status` reset ONLY when table === "intelligence_items") and needs no change to serve
-- census_worklist — reused unmodified, per CLAUDE.md's "no copies of logic". `archive_reason` is free text
-- (not a CHECK'd vocabulary) matching intelligence_items' own column and this lane's one live value
-- ('off_vertical', screen-verdict.mjs's own vocabulary) without inventing a second enum to keep in sync.
--
-- WHY NOT dryrun_disposition. That column's CHECK (migration 221) enumerates exactly
-- ('would_mint','dedup_hit','congruence_reject','invariant_reject','hold') — 'archived' is not a member,
-- and widening a CHECK'd disposition vocabulary to mean something orthogonal (relevance archival, not a
-- mint-chokepoint verdict) would conflate two different lifecycles the table's own migration 221 header
-- already distinguishes. is_archived is therefore an ORTHOGONAL terminal flag, exactly how intelligence_items
-- already uses it (its own customer-read gate is `is_archived=false AND provenance_status='verified'` — two
-- independent axes, never folded into one enum). An archived row's dryrun_disposition is left exactly as it
-- was (usually 'would_mint') — reversible with nothing to reconcile on the disposition axis if un-archived.
--
-- CONSUMERS UPDATED IN THE SAME COMMIT (never a copy of the exclusion logic): every live reader of the
-- would_mint pool must now also exclude is_archived=true rows, or an archived off-vertical row would still
-- be exported and dry-run mint-evaluated, defeating the archive. scripts/mint/export-census-rows.mjs's
-- live `census_worklist` read (the population-turn export) adds `.eq("is_archived", false)`, and its pure
-- `selectCensusRows` filter (used by that same read AND unit-tested independently) adds `!r.is_archived` —
-- the ONE place this exclusion is expressed, consumed both live and in tests. census-off-vertical.mjs's own
-- dry-count read adds the same filter so a re-run after an apply does not recount already-archived rows.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, matching migration 288's own convention for this repo); additive
-- only, no data touched — 0 rows are archived by this migration itself (the apply is a separate, later,
-- ruling-gated MAINT dispatch: docs/runbooks/MAINTENANCE-RUNBOOK.md §5).

BEGIN;

ALTER TABLE public.census_worklist
  ADD COLUMN IF NOT EXISTS is_archived    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_census_worklist_archived
  ON public.census_worklist (is_archived) WHERE is_archived = TRUE;

COMMENT ON COLUMN public.census_worklist.is_archived IS
  'Terminal, reversible archive flag — orthogonal to dryrun_disposition and enumeration_status (migration '
  '221''s two existing lifecycles). Set by scripts/maintenance/census-off-vertical.mjs''s `arg=archive` '
  'apply path (ruling R-A) for would_mint rows the shared relevance screen '
  '(scripts/mint/lib/screen-verdict.mjs, via export-census-rows.mjs''s partitionByScreen) calls '
  'off_vertical. Every live reader of the would_mint pool excludes is_archived=true rows (see migration '
  '308''s header for the exact call sites updated in the same commit). Default FALSE for every existing '
  'and future row until an archive apply runs; reversible by a future guarded UPDATE back to FALSE (no rows '
  'are ever deleted — census_worklist is APPEND-ONLY, migration 221).';
COMMENT ON COLUMN public.census_worklist.archive_reason IS
  'Free text (not CHECK''d — mirrors intelligence_items.archive_reason, migration 004), paired with '
  'is_archived. This lane''s one live value is ''off_vertical'' (ruling R-A), set by '
  'scripts/maintenance/census-off-vertical.mjs via scripts/lib/db.mjs''s table-generic archivePatch().';

-- ── Post-check (idempotent — safe to re-run) ────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_type     text;
  col_notnull  boolean;
  col_default  text;
  reason_type  text;
  n_idx        int;
  n_archived   int;
BEGIN
  SELECT data_type, is_nullable = 'NO', column_default
    INTO col_type, col_notnull, col_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'census_worklist' AND column_name = 'is_archived';
  IF col_type IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'ABORT: census_worklist.is_archived has unexpected type % (expected boolean)', col_type;
  END IF;
  IF NOT col_notnull THEN
    RAISE EXCEPTION 'ABORT: census_worklist.is_archived is nullable (expected NOT NULL DEFAULT FALSE)';
  END IF;
  IF col_default IS NULL OR position('false' IN lower(col_default)) = 0 THEN
    RAISE EXCEPTION 'ABORT: census_worklist.is_archived default is % (expected a FALSE default)', col_default;
  END IF;

  SELECT data_type INTO reason_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'census_worklist' AND column_name = 'archive_reason';
  IF reason_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'ABORT: census_worklist.archive_reason has unexpected type % (expected text)', reason_type;
  END IF;

  SELECT count(*) INTO n_idx FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'census_worklist' AND indexname = 'idx_census_worklist_archived';
  IF n_idx <> 1 THEN
    RAISE EXCEPTION 'ABORT: idx_census_worklist_archived partial index missing (found %)', n_idx;
  END IF;

  SELECT count(*) INTO n_archived FROM public.census_worklist WHERE is_archived;
  IF n_archived <> 0 THEN
    RAISE EXCEPTION 'ABORT: expected 0 archived rows immediately after this additive migration, found % — this migration must not itself archive anything', n_archived;
  END IF;

  RAISE NOTICE 'migration 308 OK: census_worklist.is_archived (boolean, not null, default false), '
    'census_worklist.archive_reason (text), idx_census_worklist_archived (partial) all present; 0 rows '
    'archived by the migration itself';
END $$;

COMMIT;
