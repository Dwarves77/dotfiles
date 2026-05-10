-- Migration 063: sources classification axes (5-axis framework v1)
--
-- Adds columns to sources table to hold the 5-axis classification per
-- dotfiles/docs/source-classification-framework-2026-05-10.md (544 lines).
-- This migration is the schema-side prerequisite for Task 6 (registering
-- 12 priority sources with framework classifications).
--
-- All columns are NULLABLE in v1 because existing 783 sources are not
-- yet classified. A separate backfill workstream will populate over time.
-- Future migration may tighten to NOT NULL once corpus is fully classified.
--
-- CHECK constraints on source_role and tier values are deferred to a
-- follow-up migration once the framework's value sets stabilize across
-- the first wave of registrations.
--
-- Two optional columns from Claude Code review (observed_correctness_count
-- and last_observed_at) are INCLUDED in v1 since they are cheap and the
-- migration is open. They support tier-conflict tie-breaking per
-- framework Section 2 ("Within recency, observed correctness history wins").
--
-- Idempotent: every column uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS source_role TEXT NULL,
  ADD COLUMN IF NOT EXISTS secondary_roles TEXT[] NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tier TEXT NULL,
  ADD COLUMN IF NOT EXISTS jurisdictions TEXT[] NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_topics TEXT[] NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_modes TEXT[] NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_verticals TEXT[] NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expected_output JSONB NULL,
  ADD COLUMN IF NOT EXISTS classification_assigned_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS classification_observed_distribution JSONB NULL,
  ADD COLUMN IF NOT EXISTS observed_correctness_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_observed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN sources.source_role IS
  'Axis 1 primary role per framework. Valid values v1: primary_legal_authority, intergovernmental_body, standards_body, academic_research, statistical_data_agency, industry_data_provider, trade_press, industry_association, vendor_corporate, government_press. CHECK constraint deferred to a follow-up migration once value set stabilizes.';

COMMENT ON COLUMN sources.secondary_roles IS
  'Axis 1 secondary roles, fallback only. Multi-role situations should prefer the URL-path split mechanism (separate registered sources per URL pattern) per framework. This array is the single-source multi-role fallback.';

COMMENT ON COLUMN sources.tier IS
  'Axis 2 authority weight. Valid values v1: T1, T2, T3, T4, T5, T6. Derived from source_role at registration; conflict resolution uses higher tier wins. CHECK constraint deferred.';

COMMENT ON COLUMN sources.jurisdictions IS
  'Axis 3 legal scope under which the source operates. Distinct from content scope (scope_*). Examples: us-federal, eu, uk, global, multi-list of member states.';

COMMENT ON COLUMN sources.scope_topics IS
  'Axis 4a content topics. Multi-valued. Example values: regulatory, finance, technology, fuel, labor, infrastructure, environmental, social, governance, transport, packaging, customs, conservation, materials_science.';

COMMENT ON COLUMN sources.scope_modes IS
  'Axis 4b transport modes covered. Example values: air, road, ocean, rail, all, none.';

COMMENT ON COLUMN sources.scope_verticals IS
  'Axis 4c Caro''s Ledge verticals covered. Example values: fine_art, live_events, luxury, film_tv, automotive, humanitarian, freight_general, all, none.';

COMMENT ON COLUMN sources.expected_output IS
  'Axis 5 probability distribution across the five item categories. Shape: {"Regulatory":0.5,"Research":0.4,"Market_Intel":0.05,"Operations":0,"Out_of_Scope":0.05}. Set at registration; refined by classification_observed_distribution after 30-90 days of observation.';

COMMENT ON COLUMN sources.classification_assigned_at IS
  'When the 5-axis classification was assigned. NULL means not yet classified.';

COMMENT ON COLUMN sources.classification_observed_distribution IS
  'Empirical distribution of item categories observed for this source over a rolling window. Same shape as expected_output. NULL until enough history accumulates. Drift detection (framework Section 5b) compares this to expected_output.';

COMMENT ON COLUMN sources.observed_correctness_count IS
  'Increments when the source produces an item later confirmed-correct by downstream review. Used for tier conflict tie-breaking per framework Section 2 (within recency, observed correctness wins).';

COMMENT ON COLUMN sources.last_observed_at IS
  'Last time the source produced any classified item. Distinct from last_intelligence_item_at which captures last successful ingestion regardless of classification outcome.';
