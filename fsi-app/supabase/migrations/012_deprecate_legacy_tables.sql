-- ════════════════════════════════════════════════════════════════════
-- Migration 012 — mark legacy intelligence tables as deprecated.
--
-- Phase A.5.b complement. The application data layer no longer reads
-- from these tables (lib/supabase-server.ts now reads exclusively
-- from the item_* equivalents). The tables are retained for the
-- moment as an audit-trail / rollback safety net; they will be
-- dropped in a follow-up commit once Phase A has been observed
-- stable in production for at least a release cycle.
--
-- These COMMENT ON statements are pure metadata (no data change, no
-- behaviour change). Apply via the Supabase dashboard SQL editor —
-- DDL of any kind, including COMMENT ON, cannot be executed through
-- the @supabase/supabase-js client.
--
-- ════════════════════════════════════════════════════════════════════

COMMENT ON TABLE resources IS
  'DEPRECATED 2026-04-28 (Phase A.5.b). Replaced by intelligence_items.
   No code path reads from this table. Retained as audit-trail and
   rollback safety net pending stability verification. Scheduled for
   DROP in a post-Phase-A cleanup migration.';

COMMENT ON TABLE timelines IS
  'DEPRECATED 2026-04-28 (Phase A.5.b). Replaced by item_timelines.
   No code path reads from this table. Retained as audit-trail and
   rollback safety net pending stability verification. Scheduled for
   DROP in a post-Phase-A cleanup migration.';

COMMENT ON TABLE changelog IS
  'DEPRECATED 2026-04-28 (Phase A.5.b). Replaced by item_changelog.
   No code path reads from this table. Retained as audit-trail and
   rollback safety net pending stability verification. Scheduled for
   DROP in a post-Phase-A cleanup migration.';

COMMENT ON TABLE disputes IS
  'DEPRECATED 2026-04-28 (Phase A.5.b). Replaced by item_disputes.
   No code path reads from this table. Retained as audit-trail and
   rollback safety net pending stability verification. Scheduled for
   DROP in a post-Phase-A cleanup migration.';

COMMENT ON TABLE cross_references IS
  'DEPRECATED 2026-04-28 (Phase A.5.b). Replaced by item_cross_references.
   No code path reads from this table. Retained as audit-trail and
   rollback safety net pending stability verification. Scheduled for
   DROP in a post-Phase-A cleanup migration.';

COMMENT ON TABLE supersessions IS
  'DEPRECATED 2026-04-28 (Phase A.5.b). Replaced by item_supersessions.
   The 5 historical orphan rows (ss1..ss5) were preserved via ghost
   intelligence_items in migration 011. No code path reads from this
   table. Retained as audit-trail and rollback safety net pending
   stability verification. Scheduled for DROP in a post-Phase-A
   cleanup migration.';
