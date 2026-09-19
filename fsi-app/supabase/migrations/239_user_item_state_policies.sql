-- subject: Migration 239 (RLS policies for `user_item_state`, item-management program, 2026-08-02). Hardening, not an incident: 235 created the personal-archive table with RLS ENABLED and ZERO policies, which is deny-all, and the only writer (`/api/workspace/personal-state`) uses the service client, which bypasses RLS, so nothing was ever exposed and the feature worked. Fixed because every sibling in the family carries policies (`user_watchlist` 3, `org_watchlist` 4, `workspace_item_overrides` 4, `user_list_order` 4) and deny-all-by-omission fails QUIETLY: the day a read path reaches this table with the anon or authenticated client, zero rows come back rather than an error, so a personal archive would silently read as empty and an archived item would reappear. Adds four policies mirroring 237 exactly, all `auth.uid() = user_id` (SELECT/UPDATE/DELETE USING, INSERT WITH CHECK, UPDATE carrying both so a row cannot be updated into another user's ownership), plus a COMMENT ON TABLE. `org_id` is deliberately absent from every predicate: it is nullable contextual metadata on a table whose point is the PERSONAL scope, and including it would hide a row written before the org resolved from its own author. Additive and idempotent (DROP POLICY IF EXISTS first); service_role behaviour is unchanged, so no existing caller's results move. Operator-ruled into this PR rather than filed as debt. **APPLIED 2026-08-02** via apply_migration before the consumer code merged (two-track policy); verified live n_policies=4, rls=true, n_rows=0. Reversible (drop the four policies).
-- Migration 239: RLS policies for user_item_state (personal archive scope,
-- item-management program, 2026-08-02).
--
-- WHAT WAS WRONG. 235 created user_item_state with `ALTER TABLE ... ENABLE ROW
-- LEVEL SECURITY` and no policies at all. RLS-enabled-with-zero-policies is
-- deny-all, and the only writer (/api/workspace/personal-state) uses the
-- service-role client, which bypasses RLS entirely — so the feature works and
-- nothing is exposed. This is a hardening migration, not an incident.
--
-- WHY FIX IT ANYWAY. Every sibling in this family carries policies:
-- user_watchlist (3), org_watchlist (4), workspace_item_overrides (4),
-- user_list_order (4, migration 237). user_item_state was the only one relying
-- on deny-all-by-omission. The failure mode that creates is quiet: the day some
-- future read path reaches this table with the anon or authenticated client
-- instead of the service client, deny-all returns ZERO ROWS rather than an
-- error, so a personal archive would silently read as empty and an item the
-- user archived would reappear. A table whose intended access rule is
-- "your own rows" should SAY so, so that the client choice stops being
-- load-bearing.
--
-- SHAPE. Four policies mirroring 237's user_list_order exactly: auth.uid() =
-- user_id on SELECT/UPDATE/DELETE (USING) and INSERT (WITH CHECK), UPDATE
-- carrying both so a row cannot be updated INTO another user's ownership.
-- org_id is deliberately NOT in any predicate: it is nullable contextual
-- metadata on a table whose whole point is the PERSONAL scope ("archiving
-- should be an option for group or individual"), and adding it would make a
-- row written before the org resolved invisible to its own author.
--
-- This is additive and idempotent: it grants access that deny-all currently
-- refuses, and service_role behaviour does not change (it bypasses RLS either
-- way), so no existing caller's results move.

DROP POLICY IF EXISTS user_item_state_select ON public.user_item_state;
DROP POLICY IF EXISTS user_item_state_insert ON public.user_item_state;
DROP POLICY IF EXISTS user_item_state_update ON public.user_item_state;
DROP POLICY IF EXISTS user_item_state_delete ON public.user_item_state;

CREATE POLICY user_item_state_select ON public.user_item_state
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_item_state_insert ON public.user_item_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_item_state_update ON public.user_item_state
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_item_state_delete ON public.user_item_state
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_item_state IS
  'Personal (per-user) item state: the individual archive scope, distinct from '
  'the org-scoped workspace_item_overrides. RLS: own rows only (migration 239). '
  'Written by /api/workspace/personal-state via the service client.';
