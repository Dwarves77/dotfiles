-- Migration 220 — B1 portal-harvest consumer: disposition columns on portal_link_candidates.
--
-- The ledger (mig 162) records status (candidate|promoted|rejected) but no WHY and no link to the
-- item a promotion produced. B1 (scrape-and-build plan, docs/plans/scrape-and-build-content-plan-
-- 2026-07-19.md) builds the consume step (classify -> intake); a disposition without a recorded
-- reason is the silent-backlog shape RD-6 forbids, so the consumer stamps:
--   disposition_reason  why the row left 'candidate' (entity-gate verdict / chokepoint reject reason
--                       / 'minted' trail), verbatim from the machine gate that acted
--   dispositioned_at    when the consumer dispositioned the row
--   item_id             the intelligence_item a promoted row minted (NULL for rejected; SET NULL on
--                       item delete so the ledger row survives as history)
--
-- Two-track: schema DDL applied via MCP before the dependent consumer code merges. Reversible
-- (ALTER TABLE ... DROP COLUMN). No data change; existing rows keep NULLs (never dispositioned yet).

BEGIN;

ALTER TABLE public.portal_link_candidates
  ADD COLUMN IF NOT EXISTS disposition_reason TEXT,
  ADD COLUMN IF NOT EXISTS dispositioned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.intelligence_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.portal_link_candidates.disposition_reason IS
  'B1 consumer (mig 220): why the row left candidate — entity-gate verdict, chokepoint reject reason, or mint trail. A disposition without a reason is the RD-6 silent-backlog shape.';
COMMENT ON COLUMN public.portal_link_candidates.item_id IS
  'B1 consumer (mig 220): the intelligence_item a promoted candidate minted; NULL for rejected rows.';

COMMIT;
