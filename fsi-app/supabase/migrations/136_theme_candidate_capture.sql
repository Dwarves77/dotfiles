-- Migration 136: theme_candidate — minimal capture-not-null for out-of-vocabulary theme values.
--
-- Context (metadata-persist audit, 2026-06-07): the agent/parser emit `theme` from the topic-tag
-- vocabulary {emissions, fuels, transport, ...}, but the live intelligence_items_theme_check requires the
-- /research grouping vocabulary {emissions_accounting, fuels_saf, ...}. They do not map 1:1. The pipeline
-- now writes a DB-valid theme or NULL (no force-fit) — but the agent's proposed value must not be silently
-- lost (Emergence-Capture INV-1: nothing observed is silently dropped; "capture, never null").
--
-- This column banks the dropped value WITH its row's provenance (the item + its source_id/source_url), so
-- the eventual Emergence-Capture recurrence detector can mine it. It is the MINIMAL capture — NOT the full
-- residual store + recurrence/promotion pipeline (that stays the governed follow-on). No CHECK: a residual
-- candidate is free-form by definition (it exists precisely because it matched no closed vocabulary).
-- Nullable; written atomically with the brief in synthesiseAndWriteBrief (cleared when theme is DB-valid).

BEGIN;

ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS theme_candidate TEXT;

COMMENT ON COLUMN intelligence_items.theme_candidate IS
  'Capture-not-null residual (Emergence-Capture INV-1): the agent-proposed theme value that matched no live theme_check vocabulary, banked with the row''s provenance instead of being dropped. NULL when theme is DB-valid or absent. Mined by the (follow-on) recurrence detector; not a customer-facing field.';

CREATE INDEX IF NOT EXISTS idx_items_theme_candidate
  ON intelligence_items(theme_candidate)
  WHERE theme_candidate IS NOT NULL;

COMMIT;
