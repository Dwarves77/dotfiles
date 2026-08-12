-- 260 — foreign-key indexes and scanner hygiene (2026-08-12).
--
-- FOUND BY the 2026-08-12 Supabase performance advisor run: eight foreign-key columns across
-- intelligence_items, org_watchlist, user_item_state, and workspace_item_overrides carry a FK constraint
-- but no covering index. An unindexed FK forces a sequential scan on the referencing table for every
-- parent-row UPDATE/DELETE (to check for orphaned children) and for every application join/filter through
-- that column — the exact shape this project's other read paths (item_timelines, item_changelog, etc.,
-- migration 049) were already indexed for. These eight were missed because none of them back a query this
-- codebase's own read-path audits happened to exercise; the advisor's static FK-vs-index scan is what
-- caught them, not a slow-query trace.
--
-- CREATE INDEX CONCURRENTLY CANNOT RUN INSIDE A TRANSACTION BLOCK. Supabase's migration runner
-- (`supabase db push`, and the `apply_migration` MCP tool) wraps each migration file in an implicit
-- transaction, and Postgres rejects CONCURRENTLY inside one ("CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction block"). This file is therefore COMMITTED AS DOCUMENTATION / OWNER-BUNDLE ONLY — it must
-- be applied OUTSIDE the normal migration-push transaction wrapper, e.g. via a direct psql session
-- (`psql "$DATABASE_URL" -f 260_fk_indexes_and_scanner_hygiene.sql`) or by running each statement
-- individually through a tool that does not wrap it in BEGIN/COMMIT. Do not `supabase db push` this file
-- as-is; it will fail the same way CONCURRENTLY always fails inside a transactional migration runner.
-- IF NOT EXISTS makes every statement idempotent and safe to re-run once applied correctly.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intelligence_items_agent_integrity_resolved_by
  ON public.intelligence_items (agent_integrity_resolved_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intelligence_items_replaced_by
  ON public.intelligence_items (replaced_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_watchlist_added_by_user_id
  ON public.org_watchlist (added_by_user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_item_state_item_id
  ON public.user_item_state (item_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_item_state_org_id
  ON public.user_item_state (org_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_item_overrides_archived_by
  ON public.workspace_item_overrides (archived_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_item_overrides_owner_assigned_by
  ON public.workspace_item_overrides (owner_assigned_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_item_overrides_owner_user_id
  ON public.workspace_item_overrides (owner_user_id);
