-- subject: Migration 340 (drop dead column `sources.reliability_score`, lane R4-5 MIGRATION-TRUTH-CATALOG-DROPS, 2026-10-01, closes CF-DATA-4). Drops `sources.reliability_score` (NUMERIC(3,2) DEFAULT 0.00, added by migration 007_community_layer.sql's "ALTER TABLE sources - add universal tag arrays" block alongside `topic_tags`/`vertical_tags`). Evidence (A5, confirmed 2026-09-30): 2,572 of 2,572 live `sources` rows carry the column at EXACTLY its default (0.00) - nothing has ever written a non-default value - and it has been superseded end-to-end by `src/lib/trust.ts`'s live Bayesian-prior trust-score computation (accuracy 40% / timeliness 20% / reliability 20% / citation 20%, per `.claude/CLAUDE.md`'s Architecture Model), which writes its own score elsewhere, never to this column. No src/ code reads or writes `sources.reliability_score` by name. Pre-check `DO $$` block ABORTS if any row's `reliability_score` is non-default (reality drifted from the zero-divergence audit) or non-null-and-not-0.00, so a genuinely written value is never silently destroyed. Post-check `DO $$` block asserts the column no longer exists in `information_schema.columns`. **APPLIED 2026-10-01** by the coordinator's DB-executor: column dropped, post-check confirmed 0 residual sources.reliability_score columns (see db-executor-2026-10-01-r45.md B1/C1). Reversible: `ALTER TABLE public.sources ADD COLUMN reliability_score NUMERIC(3,2) DEFAULT 0.00;` (structure only - no data to recover, since every live value was already the default).
-- 340 - Drop the dead `sources.reliability_score` column (CF-DATA-4).
--
-- WHAT GOES, AND WHY. `sources.reliability_score` (NUMERIC(3,2) DEFAULT 0.00) was added by migration
-- 007_community_layer.sql, bundled into an ALTER TABLE block that was really about adding
-- `topic_tags`/`vertical_tags` arrays to `sources`. The confirmed A5 audit finding (CF-DATA-4,
-- 2026-09-30): all 2,572 live `sources` rows carry this column at EXACTLY its default (0.00) - zero
-- divergence, meaning nothing has EVER written a value into it since the column was created. The
-- column was superseded before it was ever exercised: `src/lib/trust.ts` computes the live trust score
-- (accuracy 40% / timeliness 20% / reliability 20% / citation 20%) and writes it elsewhere on the row,
-- never to `reliability_score`. No application code, migration, or SQL function outside this file's own
-- DDL references the column by name.
--
-- SAFETY. Same content-gated-tombstone shape as migrations 219/254/261: a PRE-CHECK `DO $$` block
-- counts any row whose `reliability_score` is NOT NULL and NOT equal to the column default (0.00). If
-- that count is greater than zero, the migration ABORTS with an explicit RAISE EXCEPTION naming the
-- count, because a non-default value appearing after a "2,572/2,572 at default" audit means something
-- started writing to this column and dropping it would destroy real data, not dead weight. A POST-CHECK
-- `DO $$` block confirms the column is gone from `information_schema.columns` for `public.sources`.
--
-- REVERSIBILITY. Structure only: `ALTER TABLE public.sources ADD COLUMN reliability_score NUMERIC(3,2)
-- DEFAULT 0.00;` restores the column. No data to recover - every live value was already the default.

DO $$
DECLARE
  nondefault_rows bigint;
BEGIN
  -- GATE: every row must still carry NULL or exactly the 0.00 default. Any other value means the
  -- "2,572/2,572 at default" audit (CF-DATA-4) no longer holds and this migration's premise is wrong  - 
  -- stop and re-audit rather than drop a column something has started using.
  IF to_regclass('public.sources') IS NOT NULL THEN
    SELECT count(*) INTO nondefault_rows
    FROM public.sources
    WHERE reliability_score IS NOT NULL AND reliability_score <> 0.00;

    IF nondefault_rows > 0 THEN
      RAISE EXCEPTION
        'Migration 340 ABORTED: % row(s) of public.sources carry a non-default reliability_score. '
        'CF-DATA-4''s "2,572/2,572 at default, never written" premise no longer holds live - re-audit '
        'before dropping this column.', nondefault_rows;
    END IF;
  END IF;
END $$;

ALTER TABLE public.sources DROP COLUMN IF EXISTS reliability_score;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sources' AND column_name = 'reliability_score'
  ) THEN
    RAISE EXCEPTION 'Migration 340 POST-CHECK FAILED: public.sources.reliability_score still exists after DROP COLUMN.';
  END IF;
END $$;
