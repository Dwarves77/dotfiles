-- Rollback for migration 184 — recreates the ingestion pair SCHEMA (tables, indexes, RLS, policies)
-- from live definitions captured 2026-07-11. DATA is restored separately by re-importing the archived
-- JSONL (ingestion_state.jsonl / ingestion_control_log.jsonl) from the private-repo snapshot
-- Dwarves77/caros-ledge-backups archives/ingestion-pair-2026-07-11/. Apply to undo migration 184.
-- (mig 058 = ingestion_control_log, mig 059 = ingestion_state.)

BEGIN;

CREATE TABLE public.ingestion_state (
  source_id                uuid PRIMARY KEY REFERENCES public.sources(id) ON DELETE CASCADE,
  auto_run_enabled         boolean NOT NULL DEFAULT true,
  processing_paused        boolean NOT NULL DEFAULT false,
  last_state_change_at     timestamptz NOT NULL DEFAULT now(),
  last_state_change_reason text
);
CREATE INDEX idx_ingestion_state_auto_run_enabled
  ON public.ingestion_state (auto_run_enabled, last_state_change_at DESC);

CREATE TABLE public.ingestion_control_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id  uuid REFERENCES public.sources(id) ON DELETE CASCADE,
  action     text NOT NULL,
  actor      text NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_icl_source_created ON public.ingestion_control_log (source_id, created_at DESC);
CREATE INDEX idx_icl_created_at     ON public.ingestion_control_log (created_at DESC);

ALTER TABLE public.ingestion_state       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_control_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY ingestion_state_service_role_all ON public.ingestion_state
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY icl_service_role_all ON public.ingestion_control_log
  FOR ALL USING (true) WITH CHECK (true);

COMMIT;
