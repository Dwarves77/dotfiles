-- 224_item_gate_a_state.sql — GATE A state layer (operator ruling 2026-07-26, interlock-free ordering).
--
-- Gate A guarantees every fact a customer could ACT ON (price, %, threshold, quantity, compliance deadline) is
-- individually span-proven. The JS scanner (src/lib/agent/gate-a-scan.mjs) computes each brief's orphan factual
-- tokens + an md5 of the exact prose it scanned. This table stores that state. It is landed FIRST, with NO
-- validate_item_provenance criterion yet, so state accumulates while nothing gates and grounding never breaks.
-- Criterion 7 (a later migration) will require: state exists AND scanned_hash = md5(current full_brief) [not stale]
-- AND orphan_count = 0 — so a brief can never hold verified status on a scan of text it no longer contains.
--
-- Scope (recorded): FIGURES + DEADLINE-DATES gate; citation apparatus excluded (governed by criterion 2). Years by
-- context — obligation/trajectory gate, citation excluded, never blanket-dropped.

CREATE TABLE IF NOT EXISTS public.item_gate_a_state (
  intelligence_item_id  uuid PRIMARY KEY REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  scanned_hash          text        NOT NULL,   -- md5 of the exact full_brief prose that was scanned
  orphan_count          integer     NOT NULL DEFAULT 0 CHECK (orphan_count >= 0),
  orphans               jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- [{token, class}] unresolved factual tokens
  gate_a_version        text        NOT NULL,   -- scanner version that produced this state
  scanned_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.item_gate_a_state IS
  'Gate A per-item prose-fact scan state. scanned_hash = md5(full_brief at scan time); validate_item_provenance''s Gate-A criterion rejects stale state (hash mismatch) and any orphan_count>0. Refreshed on every mint/ground write by the pipeline; backfilled for the existing corpus. Landed before the criterion so no grounding window breaks.';

ALTER TABLE public.item_gate_a_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_gate_a_state_service_role_all ON public.item_gate_a_state;
CREATE POLICY item_gate_a_state_service_role_all ON public.item_gate_a_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_item_gate_a_state_orphans
  ON public.item_gate_a_state (orphan_count) WHERE orphan_count > 0;
