-- subject: Migration 385 (lane DRIFT-1, 2026-10-10): repair. Creates on production the five indexes the migration files define and production lacks (chain proof fire 9, schema oracle: five indexes only in the replay), idempotent.
-- 385 -- schema oracle repair: indexes the files define and production lacks (lane DRIFT-1, 2026-10-10).
--
-- NOT APPLIED. Authored by lane DRIFT-1 with no database access; the coordinator's executor applies it (two-track policy, CLAUDE.md
-- standing rule 3). UNLIKE migration 384 THIS ONE CHANGES PRODUCTION: it creates up to five indexes. The tables are small (intelligence_summaries
-- 2,040 rows and intelligence_changes 0 rows at AUD-AT-1, 2026-10-08; assumption_register has no row count recorded in the tree), so each
-- CREATE INDEX is instant and takes its short lock without CONCURRENTLY (which cannot run in a transaction). Idempotent: IF NOT EXISTS, so a second
-- apply, and the replay (whose earlier files already create all five), change nothing.
--
-- WHY. The oracle (scripts/proof/schema-diff.mjs) reported five indexes only in the replay: the file is the truth of what SHOULD exist (CLAUDE.md
-- standing rule 1) and production lacks them.
--   idx_intel_summaries_item_id, idx_intel_summaries_sector, idx_intel_changes_item_id, idx_intel_changes_detected_at: migration 009 creates them;
--     009 is ledger class identical (APPLIED-MAP.json: applied as written) and no migration file drops them, so production lost them out of band
--     ([HYPOTHESIS]: an index cleanup by hand; no file or audit records it). The definitions below are 009's, unchanged.
--   assumption_register_subsystem_idx: migration 271 creates it; APPLIED-MAP.json marks 271 code-differs / changed-in-place (21 lines only in the file),
--     so production ran an earlier text of 271 that lacks it ([HYPOTHESIS] on the index being among those lines). The definition is 271's, unchanged.
-- If an operator ruling later retires an index here as redundant (idx_intel_summaries_item_id shares its leading column with the unique key on
-- (item_id, sector), which migration 384 records), the route is a new migration that drops it, never an edit of this one.
--
-- No row is read, written, updated or deleted.

BEGIN;

DO $idx$
BEGIN
  IF to_regclass('public.intelligence_summaries') IS NULL OR to_regclass('public.intelligence_changes') IS NULL OR to_regclass('public.assumption_register') IS NULL THEN
    RAISE EXCEPTION 'ABORT: migration 385 needs intelligence_summaries, intelligence_changes (migration 009) and assumption_register (migration 271)';
  END IF;
END $idx$;

CREATE INDEX IF NOT EXISTS idx_intel_summaries_item_id ON public.intelligence_summaries (item_id);
CREATE INDEX IF NOT EXISTS idx_intel_summaries_sector ON public.intelligence_summaries (sector);
CREATE INDEX IF NOT EXISTS idx_intel_changes_item_id ON public.intelligence_changes (item_id);
CREATE INDEX IF NOT EXISTS idx_intel_changes_detected_at ON public.intelligence_changes (detected_at DESC);
CREATE INDEX IF NOT EXISTS assumption_register_subsystem_idx ON public.assumption_register (subsystem, assumption_key);

-- ---- self-check: the five indexes exist on the named table and column(s) (read-only) -------------------------------------
DO $check$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(k, ', ') INTO v_missing FROM unnest(ARRAY[
    'intelligence_summaries.idx_intel_summaries_item_id', 'intelligence_summaries.idx_intel_summaries_sector',
    'intelligence_changes.idx_intel_changes_item_id', 'intelligence_changes.idx_intel_changes_detected_at',
    'assumption_register.assumption_register_subsystem_idx'
  ]) AS k WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = split_part(k, '.', 1) AND i.indexname = split_part(k, '.', 2)
  );
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'ABORT: index(es) missing after the create: %', v_missing; END IF;
  RAISE NOTICE 'migration 385 OK: 5 indexes present';
END $check$;

COMMIT;
