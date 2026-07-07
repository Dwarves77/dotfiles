-- Migration 151 (redesign T05 — signal-detail price board backing store).
--
-- The Signal Detail hero (HANDOFF §6.5) shows a PRICE BOARD of Anton figures with
-- per-figure context lines. HANDOFF §7 names the "Live price feed (signal hero board
-- slots)" as KNOWN NEW BACKEND WORK — until it ships the board must NOT fake ticks; it
-- shows an honest published-statistics caption. This migration commits the backing store
-- so "when the live feed lands these slots tick", per the dispatch: committed migration
-- file + honest caption only. NO seed data — the board renders the honest §4 pending
-- frame until real rows exist.
--
-- These are PUBLISHED STATISTICS (e.g. EIA/EUA/bunker releases), not live market ticks:
-- each row carries the published figure, its per-figure context line, the release date it
-- was drawn from, and the next scheduled release date so the surface can state "next
-- release: <date>". A separate live-tick feed, if ever added, would layer on top; this
-- store is the honest, release-cadence-anchored substrate.
--
-- SCHEMA CHOICE — a dedicated table keyed to the signal item (intelligence_items), NOT a
-- JSON column: the board is a variable-length ordered list of figures with their own
-- provenance (source tier) and release cadence, and the "Next data drops" rail reads the
-- same next_release_at values. First-class rows keep each figure independently sourced
-- and independently refreshable when its release lands.
--
-- Customer read gate: RLS grants SELECT to authenticated readers (the board is
-- customer-facing published data). Writes are service-role only (no anon/auth INSERT) —
-- the feed writer runs server-side, mirroring the sources/citations write posture.
-- Reversible: DROP TABLE.

CREATE TABLE IF NOT EXISTS public.published_price_statistics (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The signal this figure belongs to. ON DELETE CASCADE — figures are meaningless
  -- without their signal.
  item_id        UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  -- Display label of the figure, e.g. "WTI Crude · Cushing", "Jet Fuel · Gulf Coast".
  label          TEXT NOT NULL,
  -- The published figure as a display string, e.g. "$95.96", "€78.40". Stored as text so
  -- the surface renders it verbatim (currency/precision are release-defined, not derived).
  value_display  TEXT NOT NULL,
  -- Unit suffix rendered small after the figure, e.g. "/bbl", "/gal", "/tCO2". Optional.
  unit           TEXT NULL,
  -- Per-figure context line beneath the figure, e.g. "Jun 1 · intraday low $91.16 May 29".
  context_line   TEXT NULL,
  -- Severity tone key for the figure color (mirrors the 5-label vocab / §2 severity ramp).
  -- NULL → neutral ink. CHECK keeps it inside the known set.
  severity_tone  TEXT NULL
    CHECK (severity_tone IS NULL OR severity_tone IN ('critical', 'high', 'moderate', 'low', 'neutral')),
  -- Provenance tier of the release this figure was drawn from (1-7 customer-facing scale).
  source_tier    SMALLINT NULL CHECK (source_tier IS NULL OR source_tier BETWEEN 1 AND 7),
  -- The release date this figure was drawn from (published statistic, not a live tick).
  released_at    DATE NULL,
  -- The next scheduled release date for this series — drives the "Next data drops" rail
  -- and the board caption ("next release: <date>").
  next_release_at DATE NULL,
  -- Optional label for the next release, e.g. "STEO revision", "EIA spot prices".
  next_release_label TEXT NULL,
  -- Display order within the board (ascending).
  sort_order     SMALLINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS published_price_statistics_item_idx
  ON public.published_price_statistics (item_id, sort_order);

COMMENT ON TABLE public.published_price_statistics IS
  'Redesign T05 signal-detail price board (HANDOFF §6.5 / §7 KNOWN NEW BACKEND). Published statistics (release-cadence anchored), NOT live ticks. One row per board figure keyed to a signal item. Empty until the price feed writer populates it — the surface renders the honest §4 published-statistics pending frame while empty (never faked figures).';

ALTER TABLE public.published_price_statistics ENABLE ROW LEVEL SECURITY;

-- Customer-facing published data: authenticated readers may SELECT. No anon/auth write
-- policy — the feed writer uses the service-role key, which bypasses RLS.
DROP POLICY IF EXISTS published_price_statistics_read ON public.published_price_statistics;
CREATE POLICY published_price_statistics_read
  ON public.published_price_statistics
  FOR SELECT
  TO authenticated
  USING (true);
