-- D3 heartbeat store — DEFINED, NOT APPLIED (no deploy target yet; additive fences hold).
-- This is the table the self-liveness reader queries: a run leaves a FACT row here, and
-- an EXTERNAL reader derives LIVE/STALE/NEVER from max(ran_at). D3 never self-attests.
--
-- Apply only when there is a deploy target (a Supabase project + a scheduler/CI to fire
-- d3-run). Until then liveness correctly reports NEVER -> UNKNOWN (loud), because no run
-- has been recorded — which is the honest state of an undeployed verification layer.
--
-- Additive only: a new table, no ALTER/NOT-NULL/CHECK on existing columns.

CREATE TABLE IF NOT EXISTS public.d3_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        timestamptz NOT NULL DEFAULT now(),
  scope         text NOT NULL,            -- 'data' | 'code' | 'periodic' | 'manual'
  trigger_event text NOT NULL,            -- e.g. 'ingest:source-admit', 'pr:merge', 'cron:daily'
  checks_run    text[] NOT NULL DEFAULT '{}',
  n_loud        integer NOT NULL DEFAULT 0,   -- count of LOUD findings this run
  verdict_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok            boolean NOT NULL DEFAULT true, -- did the orchestrator itself complete
  created_by    text NOT NULL DEFAULT 'd3-run'
);

-- liveness reads the most recent run; index the timestamp.
CREATE INDEX IF NOT EXISTS d3_runs_ran_at_idx ON public.d3_runs (ran_at DESC);

-- Optional: scope-scoped liveness (e.g. "has a DATA-scope run happened since the last
-- ingestion?") — a periodic sweep can be live while ingestion-triggered runs are dead.
CREATE INDEX IF NOT EXISTS d3_runs_scope_ran_at_idx ON public.d3_runs (scope, ran_at DESC);
