-- Migration 162: portal_link_candidates — deep-link discovery queue (P2-5 / chrome-audit S2-08).
--
-- ~55% of registry sources are ROOT PORTALS (regulator homepages); nothing enumerated the deep
-- links where the actual instruments live, so discovery had exactly one path (manual / scan).
-- The check-sources worker now extracts candidate instrument links from the SAME uncapped HTML
-- the accessibility render already returns (zero extra Browserless units) and persists them here.
--
-- This table is DISCOVERY, deliberately not intake: a bare URL is not a stageable item — it still
-- needs fetch + classification through the intake gate before it can become an intelligence_item.
-- The consume step (classify → stage) rides the loop flip (operator's word); until then this is
-- an append-only, deduped candidate ledger the admin can review.
--
--   source_id      the portal the link was found on
--   url            candidate deep link (canonicalized, UNIQUE — one row per URL ever)
--   anchor_text    the link's anchor text at discovery (title hint for review/classification)
--   status         candidate (default) | promoted | rejected — dispositions recorded, never deleted
--   first_seen_at / last_seen_at — re-crawls bump last_seen_at (freshness signal), never duplicate
--
-- RLS: service-role only (no anon/customer policy — an unclassified URL list is admin working set,
-- same posture as provisional_sources post-157).
--
-- APPLY: delegated; schema DDL before dependent code (two-track). Ledger row 162 same transaction.
-- Reversible (DROP TABLE).

BEGIN;

CREATE TABLE IF NOT EXISTS public.portal_link_candidates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  url            TEXT NOT NULL UNIQUE,
  anchor_text    TEXT,
  status         TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'promoted', 'rejected')),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plc_source ON public.portal_link_candidates (source_id);
CREATE INDEX IF NOT EXISTS idx_plc_status ON public.portal_link_candidates (status) WHERE status = 'candidate';

ALTER TABLE public.portal_link_candidates ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only (admin working set).

COMMENT ON TABLE public.portal_link_candidates IS
  'P2-5 portal deep-link discovery: candidate instrument URLs extracted from portal-source renders by check-sources (portal-links.mjs). Discovery only — classification/staging rides the loop flip.';

COMMIT;
