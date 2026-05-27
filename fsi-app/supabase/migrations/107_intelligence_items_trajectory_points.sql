-- Migration 107: trajectory_points JSONB column + band-gated CHECK constraint
-- on intelligence_items per Sprint 3 A4 dispatch (2026-05-27).
--
-- Replaces the H1 Path B cosmetic stopgap (commit 2026-05-25, stripped
-- fabricated TrajectoryBars from MarketPage and replaced with
-- TrajectoryEmptyState) with a substantive schema + ingestion path. This
-- migration lands the schema half. Ingestion (agent-prompt extension)
-- and the UI-swap guard land in A4-2 / A4-3.
--
-- Three-belt enforcement (operator-stated 2026-05-27):
--   Belt 1: this DB CHECK constraint forbids trajectory_points on non-
--           price bands. Caught at INSERT/UPDATE; impossible to bypass
--           by direct SQL.
--   Belt 2: agent parser validation strips trajectory_points when
--           signal_band != 'price'. Lands in A4-2.
--   Belt 3: component-layer guard renders TrajectoryBars only when
--           item.signalBand === 'price' AND item.trajectoryPoints
--           is non-empty. Lands in A4-3.
--
-- Backfill scope: none. All rows start NULL. Ingestion populates
-- organically per the agent-extension path. Per H1 trajectory precedent
-- (operator integrity rule), honest empty-state beats fabricated content;
-- no defaults, no synthetic seeds.
--
-- Constraint name `intelligence_items_trajectory_band_check` verified
-- against existing 102-106 constraint names: no collision.

BEGIN;

-- ── Schema ─────────────────────────────────────────────────────────
ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS trajectory_points JSONB;

COMMENT ON COLUMN intelligence_items.trajectory_points IS
  'B1 Price signal time-series for TrajectoryBars rendering. JSONB '
  'shape: { "points": [{"date":"YYYY-MM-DD","value":Number}, ...], '
  '"base_date":"YYYY-MM-DD", "base_label": "Base 100 = ..." }. '
  'Nullable. Constrained to signal_band = ''price'' via '
  'intelligence_items_trajectory_band_check.';

-- ── Belt 1: CHECK constraint ───────────────────────────────────────
-- Idempotent: drop-then-add per migration 102's pattern. Allows the
-- column to be NULL on any band; non-null only allowed when band is
-- 'price'. Constraint name namespaced with `intelligence_items_` prefix
-- and `_check` suffix matching 102/103/106 conventions.

ALTER TABLE intelligence_items
  DROP CONSTRAINT IF EXISTS intelligence_items_trajectory_band_check;

ALTER TABLE intelligence_items
  ADD CONSTRAINT intelligence_items_trajectory_band_check
  CHECK (trajectory_points IS NULL OR signal_band = 'price');

COMMIT;

-- After apply: NOTIFY pgrst, 'reload schema' so PostgREST picks up the
-- new column for select-list extension in A4-2's RPC payload.
