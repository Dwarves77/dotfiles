-- Migration 116: active_intelligence_items view (Sprint 4 Block 1, task 1.10).
--
-- The customer-facing read gate. Filters intelligence_items to the rows that
-- have passed the provenance invariant (provenance_status = 'verified').
-- Direct-read customer fetchers in src/lib/supabase-server.ts cut over to this
-- view; RPC-routed customer surfaces are gated separately in migration 117
-- (_workspace_active_items + get_market_intel_items). Admin surfaces continue
-- to read the base table so reviewers still see unverified / quarantined /
-- pending_human_verify items.
--
-- ADDITIVE per the Block 1 hard fence:
--   - NO ALTER/DROP of intelligence_items or any existing column/constraint.
--   - NO NOT NULL / CHECK on existing columns. NO row data touched. NO status
--     flipped. A view is a pure read object over the base table.
--
-- Pre-reconciliation state: every existing row is still provenance_status
-- 'unverified' (the migration-112 default; the trigger fires only on future
-- writes, and Phase 2 reconciliation has not run). So this view returns ZERO
-- rows on apply — the correct, designed pre-launch state. It fills as verified
-- content lands via reconciliation (Phase 2) and gated generation (Phase 4).
--
-- SELECT * is intentional: the direct-read fetchers select a wide and evolving
-- column set; the view forwards the full row so callers pick columns as before.

BEGIN;

CREATE OR REPLACE VIEW public.active_intelligence_items AS
  SELECT *
    FROM public.intelligence_items
   WHERE provenance_status = 'verified';

COMMENT ON VIEW public.active_intelligence_items IS
  'Sprint 4 task 1.10 customer read gate: intelligence_items filtered to provenance_status = ''verified''. Direct-read customer fetchers read this; admin reads use the base table. Returns 0 rows pre-reconciliation by design.';

COMMIT;
