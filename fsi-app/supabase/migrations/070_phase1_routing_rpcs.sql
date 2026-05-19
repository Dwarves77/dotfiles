-- ─────────────────────────────────────────────────────────────────────────────
-- RECONSTRUCTION HEADER (added 2026-05-18; not part of the original migration)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This file is a RECONSTRUCTION of migration 070. The original file was
-- present on a feature branch (commit 651ae78, authored 2026-05-11
-- "feat(routing): Phase 1 source-role-driven routing for /market /research
-- /operations") but did NOT carry forward to master when the branch was
-- merged. The migration is RECORDED as applied in
-- `supabase_migrations.schema_migrations` (entry pre-existed via Build 1
-- Stage 2 backfill at commit 2e8f329, or via the original out-of-band
-- application path), the 3 functions it created exist in the live DB, and
-- the site behaves normally. The loss was documentary only: a fresh-DB
-- replay from migrations 001..N would skip from 069 to 071 with no on-disk
-- 070 file.
--
-- Source of reconstruction
-- ------------------------
-- This file is the VERBATIM body of git object
-- d51bccf2233b19f5cb55853e79d2f5221b2626ec (308 lines), the only blob in
-- the repository's full history at `fsi-app/supabase/migrations/070_*.sql`.
-- Retrieved via `git cat-file -p` against the all-refs object graph. Git
-- history was the canonical source; no current-DB-state snapshot was
-- needed to author the function bodies.
--
-- Verification snapshot
-- ---------------------
-- `fsi-app/scripts/tmp/mig070-snapshot.mjs` was run against the live DB
-- (READ-ONLY, OBS-12 pooler pattern, port 5432) to confirm the 3 RPCs
-- this file creates plus the 2 prior RPCs (064 dashboard, 066 listings)
-- are all present. The dump is at
-- `fsi-app/scripts/tmp/mig070-snapshot.json`. The live function bodies
-- reflect 071 (deterministic tiebreaker `, id ASC`) and 073 (refactored
-- to source from `_workspace_active_items`) overrides on top of 070's
-- originals; that is expected and correct.
--
-- Scope discrepancy with discovery doc Finding 5
-- ----------------------------------------------
-- `docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md` Finding 5
-- inferred that 070 created 5 RPCs (the 5 listed in migration 071's
-- header as scope for the tiebreaker fix). Git history corrects this
-- inference: 070 created only 3 NEW RPCs
-- (`get_research_items`, `get_market_intel_items`, `get_operations_items`).
-- The other 2 RPCs in 071's tiebreaker scope were created earlier:
-- `get_workspace_intelligence_dashboard` in migration 064 and
-- `get_workspace_intelligence_listings` in migration 066. 071 simply
-- applies its `, id ASC` fix across all 5 row-set RPCs regardless of
-- which migration originally created each. This reconstruction reflects
-- the ground truth from git history.
--
-- Replay parity guarantee
-- -----------------------
-- A fresh-DB replay sequence with this file in place produces the same
-- final state as production:
--
--   001..069  → baseline schema + prior workspace-intel RPCs
--               (064 dashboard, 066 listings, 068/069 aggregates)
--   070       → THIS FILE creates 3 new RPCs (research, market_intel,
--               operations) per source_role + status routing rules
--   071       → CREATE OR REPLACE on all 5 row-set RPCs, appends
--               `, id ASC` tiebreaker to the trailing ORDER BY
--   072       → jurisdiction_normalizer (separate workstream)
--   073       → CREATE OR REPLACE on 7 workspace-intel RPCs, refactored
--               to source from new `_workspace_active_items` SQL function
--   074..N    → subsequent migrations
--
-- The CREATE OR REPLACE chain in 071 and 073 OVERRIDES this file's
-- function bodies on a fresh replay; the end state is identical to
-- production's current state. Documentary parity is restored; live DB
-- is untouched by this reconstruction (this file is not applied; the
-- ledger entry pre-exists).
--
-- References
-- ----------
-- - `docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md` Finding 5
-- - `docs/sprint-1/followups.md` OBS-40
-- - `docs/sprint-2/sprint-2-planning-2026-05-18.md` D15
-- - git commit 651ae78 (original authorship)
-- - git commit 2e8f329 (Build 1 Stage 2 ledger backfill, per dispatch brief)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ORIGINAL MIGRATION 070 CONTENT (verbatim from git blob d51bccf)
-- ─────────────────────────────────────────────────────────────────────────────

-- Phase 1 routing RPCs: source_role + status driven splits for /market,
-- /research, /operations, per the four-purpose framework
-- (docs/four-page-architecture-survey-2026-05-09.md):
--
--   Regulations  = what binds you now (NOT in scope of this migration;
--                  existing /regulations route untouched).
--   Research     = what's coming (forward-looking, formal rulemaking,
--                  intergovernmental working papers, academic, named
--                  research institutions).
--   Market Intel = how the commercial world is moving (forward commercial
--                  signals from trade press, industry data providers,
--                  vendors, industry associations).
--   Operations   = jurisdictional cost realities (utility tariffs, labor
--                  costs, permitting, infrastructure, surfaced via
--                  statistical data agencies in v1).
--
-- Routing rules (Phase 1, source_role + status driven, no item-level
-- classifier yet):
--
--   get_research_items:
--     source_role IN ('intergovernmental_body', 'academic_research')
--     OR (source_role = 'standards_body' AND status NOT IN ('in_force', 'adopted'))
--     OR (source_role = 'primary_legal_authority' AND status = 'proposed')
--
--   get_market_intel_items:
--     source_role IN ('trade_press', 'industry_data_provider',
--                     'vendor_corporate', 'industry_association')
--
--   get_operations_items:
--     source_role = 'statistical_data_agency'
--
-- intelligence_items.status uses the values verified live on the operator
-- DB: 'monitoring' (default, ~95%), 'adopted', 'in_force', 'proposed'.
--
-- Each RPC scopes to the org's workspace, applies workspace_item_overrides
-- (priority + archive merge), and filters effective_archived = false.
-- Returns rows in the same shape as the slim/listings RPCs (047/066) so
-- page components consume them with minimal change. Resource.note is
-- populated from summary like the slim variant retains it.
--
-- 39 sources are AMBIGUOUS (source_role IS NULL) holding ~30 items that
-- will not route under Phase 1. Designed behavior; per-row operator
-- triage is a separate workstream. The PR description surfaces an
-- impact table with the source IDs.
--
-- All three are SECURITY DEFINER, mirror the merge logic from 047/066,
-- and are exposed via the implicit PUBLIC EXECUTE chain (no explicit
-- GRANT, matching the prior RPCs).
--
-- Idempotent via CREATE OR REPLACE.

-- get_research_items

CREATE OR REPLACE FUNCTION get_research_items(p_org_id UUID)
RETURNS TABLE (
  id                       UUID,
  legacy_id                TEXT,
  title                    TEXT,
  summary                  TEXT,
  what_is_it               TEXT,
  why_matters              TEXT,
  key_data                 TEXT[],
  tags                     TEXT[],
  domain                   INT,
  category                 TEXT,
  item_type                TEXT,
  source_id                UUID,
  source_url               TEXT,
  jurisdictions            TEXT[],
  transport_modes          TEXT[],
  verticals                TEXT[],
  status                   TEXT,
  severity                 TEXT,
  confidence               TEXT,
  priority                 TEXT,
  entry_into_force         DATE,
  compliance_deadline      DATE,
  next_review_date         DATE,
  added_date               DATE,
  last_verified            TIMESTAMPTZ,
  is_archived              BOOLEAN,
  effective_priority       TEXT,
  effective_archived       BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  JOIN sources s ON s.id = ii.source_id
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND (
      s.source_role IN ('intergovernmental_body', 'academic_research')
      OR (s.source_role = 'standards_body' AND COALESCE(ii.status, 'monitoring') NOT IN ('in_force', 'adopted'))
      OR (s.source_role = 'primary_legal_authority' AND ii.status = 'proposed')
    )
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC;
$$;

COMMENT ON FUNCTION get_research_items(UUID) IS
  'Phase 1 routing: returns intelligence_items routed to /research per source_role + status. Includes intergovernmental_body, academic_research, standards_body working papers (status NOT in_force/adopted), and primary_legal_authority items with status=proposed. Same merge / shape as get_workspace_intelligence_slim (047). See migration 070 header.';

-- get_market_intel_items

CREATE OR REPLACE FUNCTION get_market_intel_items(p_org_id UUID)
RETURNS TABLE (
  id                       UUID,
  legacy_id                TEXT,
  title                    TEXT,
  summary                  TEXT,
  what_is_it               TEXT,
  why_matters              TEXT,
  key_data                 TEXT[],
  tags                     TEXT[],
  domain                   INT,
  category                 TEXT,
  item_type                TEXT,
  source_id                UUID,
  source_url               TEXT,
  jurisdictions            TEXT[],
  transport_modes          TEXT[],
  verticals                TEXT[],
  status                   TEXT,
  severity                 TEXT,
  confidence               TEXT,
  priority                 TEXT,
  entry_into_force         DATE,
  compliance_deadline      DATE,
  next_review_date         DATE,
  added_date               DATE,
  last_verified            TIMESTAMPTZ,
  is_archived              BOOLEAN,
  effective_priority       TEXT,
  effective_archived       BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  JOIN sources s ON s.id = ii.source_id
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND s.source_role IN (
      'trade_press',
      'industry_data_provider',
      'vendor_corporate',
      'industry_association'
    )
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC;
$$;

COMMENT ON FUNCTION get_market_intel_items(UUID) IS
  'Phase 1 routing: returns intelligence_items routed to /market per source_role. Includes trade_press, industry_data_provider, vendor_corporate, industry_association. Same merge / shape as get_workspace_intelligence_slim (047). See migration 070 header.';

-- get_operations_items

CREATE OR REPLACE FUNCTION get_operations_items(p_org_id UUID)
RETURNS TABLE (
  id                       UUID,
  legacy_id                TEXT,
  title                    TEXT,
  summary                  TEXT,
  what_is_it               TEXT,
  why_matters              TEXT,
  key_data                 TEXT[],
  tags                     TEXT[],
  domain                   INT,
  category                 TEXT,
  item_type                TEXT,
  source_id                UUID,
  source_url               TEXT,
  jurisdictions            TEXT[],
  transport_modes          TEXT[],
  verticals                TEXT[],
  status                   TEXT,
  severity                 TEXT,
  confidence               TEXT,
  priority                 TEXT,
  entry_into_force         DATE,
  compliance_deadline      DATE,
  next_review_date         DATE,
  added_date               DATE,
  last_verified            TIMESTAMPTZ,
  is_archived              BOOLEAN,
  effective_priority       TEXT,
  effective_archived       BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ii.id,
    ii.legacy_id,
    ii.title,
    ii.summary,
    ii.what_is_it,
    ii.why_matters,
    ii.key_data,
    ii.tags,
    ii.domain,
    ii.category,
    ii.item_type,
    ii.source_id,
    ii.source_url,
    ii.jurisdictions,
    ii.transport_modes,
    ii.verticals,
    ii.status,
    ii.severity,
    ii.confidence,
    ii.priority,
    ii.entry_into_force,
    ii.compliance_deadline,
    ii.next_review_date,
    ii.added_date,
    ii.last_verified,
    ii.is_archived,
    COALESCE(wo.priority_override, ii.priority) AS effective_priority,
    COALESCE(wo.is_archived, ii.is_archived)    AS effective_archived
  FROM intelligence_items ii
  JOIN sources s ON s.id = ii.source_id
  LEFT JOIN workspace_item_overrides wo
    ON  wo.item_id = ii.id
    AND wo.org_id  = p_org_id
  WHERE NOT COALESCE(wo.is_archived, ii.is_archived)
    AND s.source_role = 'statistical_data_agency'
  ORDER BY
    CASE COALESCE(wo.priority_override, ii.priority)
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH'     THEN 2
      WHEN 'MODERATE' THEN 3
      WHEN 'LOW'      THEN 4
      ELSE 5
    END,
    ii.added_date DESC;
$$;

COMMENT ON FUNCTION get_operations_items(UUID) IS
  'Phase 1 routing: returns intelligence_items routed to /operations per source_role. v1 surfaces only statistical_data_agency (utility tariffs, labor cost stats, infrastructure capacity data). See migration 070 header.';
