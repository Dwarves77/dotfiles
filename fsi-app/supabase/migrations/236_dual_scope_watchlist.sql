-- 236: dual-scope watchlist (item-management program, 2026-08-02).
-- org_watchlist (077) shipped with NO item_type CHECK while user_watchlist
-- (060, widened by 233) constrains it to five values. That asymmetry is debt:
-- the two tables are the two scopes of one feature and must accept the same
-- vocabulary. Both tables are empty (0 rows verified pre-apply), so the
-- constraint is free to add. No role gate is introduced here; 077's
-- member-scoped RLS (any org member may add or remove) is the shipped ruling
-- for the team watchlist and stands.
-- Applied to the live DB 2026-08-02 via MCP apply_migration (schema-first per
-- the two-track policy); this file is the repo audit copy.
ALTER TABLE public.org_watchlist DROP CONSTRAINT IF EXISTS org_watchlist_item_type_check;
ALTER TABLE public.org_watchlist ADD CONSTRAINT org_watchlist_item_type_check
  CHECK (item_type IN ('source','reg','signal','research','operations'));

COMMENT ON COLUMN public.org_watchlist.item_type IS
  'Kind of watched item. Vocabulary mirrors user_watchlist (migration 233): source|reg|signal|research|operations. Kept in lockstep, the two tables are the team and personal scopes of one feature.';

COMMENT ON COLUMN public.org_watchlist.note IS
  'Optional rationale shown to every org member on the team watchlist. Personal watches carry no note.';
