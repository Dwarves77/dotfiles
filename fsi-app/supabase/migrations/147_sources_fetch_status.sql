-- Migration 147 (item 5b — unreadable-source flag): sources.fetch_status records the transport's last
-- fetch outcome for a source, so customer surfaces never display a source the pipeline could not read.
-- The IEA/Cloudflare case: an Operations item's displayed Source linked a URL its OWN brief flagged as
-- "yielded no extractable data due to a Cloudflare security page" — yet the link still rendered.
--
-- TABLE CHOICE — SOURCE-LEVEL (public.sources), NOT an item-source pairing. Rationale: the block is a
-- property of the SOURCE/host reachability — a Cloudflare/CDN challenge on the host affects every fetch of
-- it, and detection fires in the UNIFIED TRANSPORT (fetchPrimaryWithFallback → detectRoadblock, reason
-- 'cdn_block'; fetch-quality 'blocked_cloudflare'), which operates on a source URL, not a per-item
-- relationship. So the readability verdict lives once on the source and every item citing it inherits it.
--
-- Applies TOGETHER with migration 146 on the operator DDL window (single supabase db push) — the dependent
-- code (the transport write + the customer render gate) is merge/deploy-gated on this being live, because
-- the render gate SELECTs fetch_status. Do NOT apply independently. Reversible: DROP COLUMN (x2).

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS fetch_status TEXT NULL
    CHECK (fetch_status IS NULL OR fetch_status IN ('ok', 'cdn_block', 'soft_404', 'blocked', 'error')),
  ADD COLUMN IF NOT EXISTS fetch_status_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.sources.fetch_status IS
  'Last transport fetch outcome for this source (item 5b). ok = readable; cdn_block / soft_404 / blocked / error = the pipeline could not extract usable content (detectRoadblock / fetch-quality). Customer surfaces gate the displayed source link on this — a non-ok status suppresses or labels the link. Written at the detection site in canonical-pipeline (the fetchPrimaryDeep result). NULL = never fetched under this signal (treat as readable/unknown).';

COMMENT ON COLUMN public.sources.fetch_status_at IS
  'Timestamp fetch_status was last written (item 5b). Lets a stale block clear on a later successful fetch.';
