-- subject: Defect D32 part (a) and (c), `docs/plans/defect-fix-plan-2026-09-12.md` (lane L21, 2026-09-16). Schema: adds `agent_run_searches.result_chars` (integer, maintained by trigger `agent_run_searches_result_chars_trg` on insert and update of `result_content`), the index `idx_agent_run_searches_item_chars (intelligence_item_id, result_chars)`, and the table `brief_apply_runs` (one row per apply-record-briefs.mjs run: run_id, mode, started_at, finished_at, bytes_read, items_applied, stop_reason; RLS enabled, service role only) read by the pre-flight cooldown check. Readers that only measure a capture must read `result_chars`, never compute the length of `result_content` in SQL (a corpus-wide scan of that shape exhausted the disk IO budget on 2026-09-13). Applied 2026-09-16 via the management API.
-- 322_agent_run_searches_result_chars.sql
-- D32 (defect-fix-plan-2026-09-12.md, lane L21, "nothing meters disk IO"). Evidence [CONFIRMED],
-- 2026-09-13: two coordinator SQL selections over intelligence_items shaped
-- `exists(select 1 from agent_run_searches where length(result_content) > 200)`, 23 and 26 seconds each,
-- read and decompressed EVERY stored capture in the database (agent_run_searches is ~6,393 rows, 2.5 MB
-- heap, 239 MB TOAST, 245 MB total on 2026-09-16 [CONFIRMED] -- a corpus-wide length(result_content) scan
-- decompresses about 240 MB every time it runs), and that spend preceded the batch-004 apply that
-- exhausted the small-tier disk IO burst budget and hung the database for three and a half hours.
--
-- FIX: a stored, trigger-maintained capture length (result_chars) so every reader that only needs to know
-- HOW LONG a capture is can read an indexed integer column instead of decompressing result_content to
-- measure it. Readers that need the capture TEXT itself (grounding, export, census) are unaffected -- this
-- column serves length-only callers exclusively.
--
-- Also in this migration (part (c) of the same lane, D32): brief_apply_runs, the durable run record the
-- apply driver's pre-flight cooldown check reads (scripts/turns/apply-record-briefs.mjs /
-- scripts/turns/io-preflight.mjs). Bundled here rather than a separate migration because both are schema
-- DDL for the same lane and the coordinator applies schema DDL before the dependent code merges (CLAUDE.md
-- standing rule 3) -- one CLI apply covers both.
--
-- Backfill of existing rows is migration 323 (chunked, with sleeps, so the backfill itself cannot exhaust
-- the budget it exists to protect).
--
-- Migration two-track policy (CLAUDE.md standing rule 3): schema DDL, applies via Supabase CLI BEFORE the
-- dependent code (part (a) readers, part (b)/(c) of this lane) is exercised live. AUTHORED, NOT YET
-- APPLIED as of this lane -- no database access in this worktree (fake/fixture-only discipline).

-- ── (1) result_chars: trigger-maintained, never hand-set ────────────────────────────────────────────────

ALTER TABLE public.agent_run_searches ADD COLUMN IF NOT EXISTS result_chars integer;

CREATE OR REPLACE FUNCTION public.agent_run_searches_set_result_chars()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- length(NULL) is NULL in Postgres, so a NULL result_content leaves result_chars NULL -- never coerced
  -- to 0, which would read as "an empty capture" rather than "no capture text at all".
  NEW.result_chars := length(NEW.result_content);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_run_searches_result_chars_trg ON public.agent_run_searches;
CREATE TRIGGER agent_run_searches_result_chars_trg
  BEFORE INSERT OR UPDATE OF result_content ON public.agent_run_searches
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_run_searches_set_result_chars();

CREATE INDEX IF NOT EXISTS idx_agent_run_searches_item_chars
  ON public.agent_run_searches (intelligence_item_id, result_chars);

COMMENT ON COLUMN public.agent_run_searches.result_chars IS
  'Trigger-maintained (agent_run_searches_result_chars_trg, migration 322): the character length of '
  'result_content, kept in sync on every insert and update of that column. Readers that only need to know '
  'how long a capture is must use result_chars instead of computing the length of result_content in SQL -- '
  'a corpus-wide scan that decompresses result_content to measure it exhausted the Supabase small-tier '
  'disk IO burst budget for three and a half hours on 2026-09-13 (D32, defect-fix-plan-2026-09-12.md). '
  'Backfilled for pre-existing rows by migration 323.';

-- ── (2) brief_apply_runs: the apply driver's durable run record (D32 part (c), same lane) ─────────────────

CREATE TABLE IF NOT EXISTS public.brief_apply_runs (
  run_id        text primary key,
  mode          text not null check (mode in ('dry', 'apply')),
  started_at    timestamptz not null,
  finished_at   timestamptz,
  bytes_read    bigint not null default 0,
  items_applied integer not null default 0,
  stop_reason   text
);

COMMENT ON TABLE public.brief_apply_runs IS
  'One row per apply-record-briefs.mjs run (dry or apply), written at start and updated in the driver''s '
  'own finally block. Read by the pre-flight cooldown check (scripts/turns/io-preflight.mjs) before the '
  'next apply run starts. D32, defect-fix-plan-2026-09-12.md, lane L21.';

ALTER TABLE public.brief_apply_runs ENABLE ROW LEVEL SECURITY;
-- No policy created: default-deny for every non-service-role caller. Same posture as
-- migration 284's propagation_events -- writes and reads both go through the service-role client
-- (the apply driver / pre-flight check), which bypasses RLS.
