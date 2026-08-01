-- 233: watchlist item_type expansion (item-management program Landing B, 2026-08-01).
-- user_watchlist's CHECK was ('source','reg','signal') — research and operations
-- detail surfaces had no Watch affordance (spec-audit gap M-5). Expand the CHECK;
-- org_watchlist (077) already has no type CHECK, so no change there.
-- Applied to the live DB 2026-08-01 via MCP apply_migration (schema-first per
-- the two-track policy); this file is the repo audit copy.
ALTER TABLE public.user_watchlist DROP CONSTRAINT IF EXISTS user_watchlist_item_type_check;
ALTER TABLE public.user_watchlist ADD CONSTRAINT user_watchlist_item_type_check
  CHECK (item_type IN ('source','reg','signal','research','operations'));
