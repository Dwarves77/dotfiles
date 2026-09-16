-- 323_agent_run_searches_result_chars_backfill.sql
-- D32 (defect-fix-plan-2026-09-12.md, lane L21). Migration 322 added agent_run_searches.result_chars,
-- trigger-maintained on every future insert/update -- this migration backfills the column for every
-- PRE-EXISTING row (the trigger only fires going forward).
--
-- WHY CHUNKED, WITH SLEEPS: a single corpus-wide `UPDATE agent_run_searches SET result_chars =
-- length(result_content)` would decompress every stored capture's TOAST-ed text in one statement -- the
-- SAME shape of read (~240 MB decompressed, per the live catalog numbers read 2026-09-16 [CONFIRMED]:
-- ~6,393 rows, 2.5 MB heap, 239 MB TOAST, 245 MB total) that exhausted the Supabase small-tier disk IO
-- burst budget and hung the database for three and a half hours on 2026-09-13. The backfill that exists to
-- fix that failure mode must not itself reproduce it -- so it walks the table 200 rows at a time, ordered
-- by id (keyset pagination: each chunk reads `id > last_id ORDER BY id LIMIT 200`, a flat-cost scan that
-- does not re-walk earlier rows as the backfill progresses), and sleeps 0.5s between chunks to keep the
-- burst rate well under the budget.
--
-- EXPECTED WORK: ~6,393 rows / 200 per chunk is about 32 chunks; each chunk's UPDATE decompresses only
-- that chunk's own result_content values, so the corpus is fully decompressed exactly ONCE across the
-- whole backfill (not once per chunk, and never again after this migration -- every future insert/update
-- is covered by the migration-322 trigger, which computes result_chars from the row already in hand, no
-- extra read).
--
-- COORDINATOR RULE: apply this migration only when no brief-apply run is active (the same run the pre-
-- flight IO check in scripts/turns/io-preflight.mjs gates -- see docs/runbooks/MAINTENANCE-RUNBOOK.md
-- section 57). Running the backfill concurrently with an apply run stacks two IO-bearing workloads against
-- the same small-tier budget, which is exactly the combination that caused the 2026-09-13 hang.
--
-- Idempotent: `WHERE result_chars IS NULL` means a re-run after a partial completion (or after the
-- trigger has already covered some rows) does no redundant work and is safe to re-invoke.
--
-- This is the ONE sanctioned SQL site for length(result_content) besides the migration-322 trigger itself
-- (scripts/verify/capture-length-scan.test.mjs allowlists both, by file, with a reason each).
--
-- Migration two-track policy (CLAUDE.md standing rule 3): AUTHORED, NOT YET APPLIED as of this lane -- no
-- database access in this worktree (fake/fixture-only discipline). Applies via Supabase CLI, coordinator
-- dispatch, per the rule above.

DO $$
DECLARE
  last_id uuid := '00000000-0000-0000-0000-000000000000';
  chunk_ids uuid[];
  chunk_number integer := 0;
  rows_in_chunk integer;
BEGIN
  LOOP
    SELECT array_agg(id) INTO chunk_ids
    FROM (
      SELECT id
      FROM public.agent_run_searches
      WHERE id > last_id
      ORDER BY id
      LIMIT 200
    ) s;

    EXIT WHEN chunk_ids IS NULL OR array_length(chunk_ids, 1) IS NULL;

    chunk_number := chunk_number + 1;

    UPDATE public.agent_run_searches
    SET result_chars = length(result_content)
    WHERE id = ANY(chunk_ids) AND result_chars IS NULL;

    GET DIAGNOSTICS rows_in_chunk = ROW_COUNT;
    RAISE NOTICE 'agent_run_searches result_chars backfill: chunk % updated % row(s)', chunk_number, rows_in_chunk;

    last_id := chunk_ids[array_length(chunk_ids, 1)];

    -- Keep the burst rate well under the small-tier IO budget -- the backfill must not itself exhaust
    -- the budget it exists to protect (see header).
    PERFORM pg_sleep(0.5);
  END LOOP;

  RAISE NOTICE 'agent_run_searches result_chars backfill: done, % chunk(s)', chunk_number;
END;
$$;
