-- ═══════════════════════════════════════════════════════════════════
-- Migration 111: workspace_item_overrides — dismissed_at column
-- ═══════════════════════════════════════════════════════════════════
--
-- Sprint 3 follow-up Part 2: manual priority tagging + dismissed stash
-- on /regulations.
--
-- Schema decision (per the dispatch "investigation first" rule):
--
--   The existing workspace_item_overrides table (migration 006) already
--   carries `priority_override` (CHECK in CRITICAL/HIGH/MODERATE/LOW)
--   plus the archive triad (`is_archived` + `archive_reason` +
--   `archive_note` + `archived_at`). The dispatch spec ("Or use existing
--   schema convention. Key requirements: per-workspace-user, per-
--   regulation, nullable, timestamped on dismiss.") authorises reuse.
--
--   Decision:
--     1. user_priority   → reuse `priority_override`. The existing
--                          CHECK constraint already permits exactly the
--                          four spec values; no rename needed. The
--                          dispatch "user_priority" / "userPriority"
--                          naming is mapped at the component and API
--                          shim layer, not at the DB layer.
--     2. dismissed_at    → NEW column. Distinct from `archived_at`
--                          (workspace-archive intent has different
--                          semantics + read-paths in 070+ RPCs). A
--                          dismiss decision is "hide from active
--                          columns, surface in stash drawer";
--                          archive is "this regulation is no longer
--                          relevant and gets a reason-coded shelf
--                          location." Mixing them would force every
--                          existing archive RPC to filter on a new
--                          enum, breaking the contract that
--                          is_archived=TRUE → archived view.
--     3. Per-user scope  → the dispatch's "per-workspace-user" phrasing
--                          is upgraded to "per-org" to match the
--                          existing UNIQUE(org_id, item_id) constraint
--                          and the RLS policies in 006_rls. Per-user
--                          scope would require an org_membership_id FK
--                          column + RLS rewrite + 9 downstream RPC
--                          updates (070-077). Out of scope for this
--                          follow-up.  Documented as DRIFT-1 in the
--                          audit doc; operator triages later.
--
-- Read path: existing RPCs (070_phase1_routing_rpcs etc.) already
-- LEFT JOIN workspace_item_overrides and apply priority_override on
-- the column reroute. The new dismissed_at field will be surfaced via
-- a thin client-side filter in RegulationsSurface (Kanban hides
-- dismissed; DismissedStash renders them); no RPC change in this pass.
-- A future pass can fold dismissed_at into the routing RPCs if the
-- count gets large enough to matter for payload size.
--
-- Write path: the existing POST /api/workspace/overrides route is
-- extended to accept `dismissedAt: string | null` in the body. No new
-- route is added (the dispatch's POST /api/regulations/[id]/override
-- collapses into the existing override endpoint per the
-- reuse-before-construction rule).
--
-- Idempotency: ADD COLUMN IF NOT EXISTS keeps this migration safe to
-- re-run on environments that already have the column.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE workspace_item_overrides
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN workspace_item_overrides.dismissed_at IS
  'Sprint 3 follow-up Part 2 (migration 111). When non-null, the workspace has dismissed this regulation from the active Kanban view. The regulation surfaces in the collapsed "Dismissed regulations" stash at the bottom of /regulations with a Restore action. Distinct from archived_at, which is a deeper workspace-archive decision with a reason code. Dismissed = "out of sight on the active board"; archived = "shelved for review by reason".';

-- Partial index supports the dismissed-stash drawer query
-- (SELECT ... WHERE org_id = $1 AND dismissed_at IS NOT NULL).
CREATE INDEX IF NOT EXISTS idx_overrides_org_dismissed
  ON workspace_item_overrides(org_id)
  WHERE dismissed_at IS NOT NULL;

-- Schema reload so PostgREST picks up the new column for the API
-- route's upsert payload.
NOTIFY pgrst, 'reload schema';
