-- Migration 093: tier_override mechanism on sources (Q5 decision)
--
-- Why this migration exists.
-- Per the source-credibility-model skill Section 7 and the Q5 decision
-- (docs/sprint-2/source-credibility-model-decisions-2026-05-19.md, lines
-- 185-211), operators need an explicit per-source tier override that takes
-- precedence in the effective_tier formula:
--
--   effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)
--
-- The override carries a mandatory reason (operator domain knowledge MUST
-- be captured so the audit trail explains classifier-vs-evidence
-- disagreement, network-signal misleading cases, and T7 bridging
-- classification gaps). Override audit history lives in the existing
-- `source_trust_events` table (migration 004) with new event_types
-- 'tier_override' (set) and 'tier_override_revert' (clear).
--
-- This migration is the schema half of Q5. The endpoint that writes these
-- columns is src/app/api/admin/sources/[id]/tier-override/route.ts (new
-- file in the same commit), gated by requireAuth + isPlatformAdmin per
-- the sweep-discipline + Track B-code admin-gating precedent.
--
-- What this migration does NOT do.
--   - It does NOT modify base_tier (Q5: "override does NOT modify base_tier;
--     base preserves the classifier's original judgment for provenance").
--   - It does NOT add any computed_dynamic_tier column. That column lands
--     when Q2 schema work runs (Sprint 2 or Sprint 3); the effective_tier
--     formula's middle term remains absent until then. Until Q2 lands,
--     effective_tier resolves to COALESCE(tier_override, base_tier).
--   - It does NOT write any sources rows (no backfill needed; columns
--     default to NULL which is the "no override" state).
--
-- Constraints captured here.
--   - tier_override INT NULL CHECK (BETWEEN 1 AND 7)
--   - override_reason TEXT NULL (required-when-non-null enforced at the
--     endpoint, not in SQL; SQL keeps the column nullable so a clean
--     revert (tier_override + override_reason + override_date -> NULL)
--     does not require a non-null reason).
--   - override_date TIMESTAMPTZ NULL (set by the endpoint to NOW() on
--     each write; cleared on revert).
--   - source_trust_events.event_type CHECK constraint extended to include
--     'tier_override' and 'tier_override_revert'. The original CHECK
--     (migration 004 lines 311-318) is dropped and recreated as a
--     superset; existing rows remain valid because the new set strictly
--     contains the old set.

BEGIN;

-- ──────────────────────────────────────────────────────────
-- 1. Add the three override columns on sources
-- ──────────────────────────────────────────────────────────

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS tier_override INT NULL
    CHECK (tier_override IS NULL OR (tier_override BETWEEN 1 AND 7));

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS override_reason TEXT NULL;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS override_date TIMESTAMPTZ NULL;

-- ──────────────────────────────────────────────────────────
-- 2. Column comments (per dispatch brief)
-- ──────────────────────────────────────────────────────────

COMMENT ON COLUMN public.sources.tier_override IS
  'Operator tier override per source-credibility-model skill Section 7. When non-null, takes precedence in effective_tier formula: COALESCE(tier_override, computed_dynamic_tier, base_tier). Set via POST /api/admin/sources/[id]/tier-override.';

COMMENT ON COLUMN public.sources.override_reason IS
  'Mandatory operator reason for tier override. Required field on override endpoint.';

COMMENT ON COLUMN public.sources.override_date IS
  'Timestamp of most recent override action (set or revert).';

-- ──────────────────────────────────────────────────────────
-- 3. Extend source_trust_events.event_type CHECK to admit
--    'tier_override' + 'tier_override_revert'
-- ──────────────────────────────────────────────────────────
--
-- The original CHECK (migration 004 line 311-318) admitted 12 values:
--   confirmation, conflict_opened, conflict_resolved,
--   accessibility_check, citation_received,
--   tier_promotion, tier_demotion,
--   manual_review, stale_flag, paywall_change,
--   self_citation, discovery
--
-- The new CHECK admits all 12 originals plus 2 new values. Existing rows
-- remain valid by strict-superset construction. The constraint name is
-- the conventional Postgres default (table_column_check); we discover
-- and drop the actual name dynamically so this migration works whether
-- the original was named conventionally or explicitly.

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
    FROM pg_constraint con
    JOIN pg_class       cls ON cls.oid = con.conrelid
    JOIN pg_namespace   nsp ON nsp.oid = cls.relnamespace
   WHERE nsp.nspname = 'public'
     AND cls.relname = 'source_trust_events'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) LIKE '%event_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.source_trust_events DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;
END $$;

ALTER TABLE public.source_trust_events
  ADD CONSTRAINT source_trust_events_event_type_check
  CHECK (event_type IN (
    'confirmation', 'conflict_opened', 'conflict_resolved',
    'accessibility_check', 'citation_received',
    'tier_promotion', 'tier_demotion',
    'manual_review', 'stale_flag', 'paywall_change',
    'self_citation', 'discovery',
    'tier_override', 'tier_override_revert'
  ));

COMMIT;
