-- 237_personal_list_order.sql
-- Per-user drag ordering. Operator ruling: "Drag order is personal."
--
-- APPLIED LIVE 2026-08-02 via the Supabase MCP before this commit, per the
-- migration two-track policy (schema DDL lands before the dependent code).
-- This file is the repo audit copy of what is already in production.
--
-- WHY A NEW TABLE rather than a column on user_item_state (reuse-before-
-- construction was checked first, and rejected on evidence):
--   1. user_item_state is keyed (user_id, item_id). A position column there
--      could express exactly ONE global order per item, so the watchlist rail
--      and the regulations ledger could never be ordered independently. The
--      list dimension is not optional; it is what makes the feature usable.
--   2. user_item_state.item_id is a uuid referencing intelligence_items. The
--      watchlist carries TEXT ids (legacy_id or uuid) and item types including
--      'source', which is not an intelligence_items row at all. Reusing that
--      table would silently exclude source entries from ordering.
--
-- POSITION IS numeric, NOT integer, and that is the point. A fractional
-- position lets a drop between two neighbours write ONE row ((a+b)/2) instead
-- of renumbering the whole list. numeric is exact-decimal, so repeated
-- midpoint splits do not drift the way float8 would; a rebalance pass is a
-- future concern, not a correctness one.
--
-- No org scope by design. This table is personal by ruling, so there is no
-- org_id, not even as nullable metadata: a nullable org column on a table that
-- is never filtered by org is dead schema that invites a wrong query later.

CREATE TABLE IF NOT EXISTS public.user_list_order (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which list is being ordered, e.g. 'watchlist', 'regulations'. Text rather
  -- than an enum so a new orderable surface does not need a migration; the
  -- writer validates against its own allowlist.
  list_key    text NOT NULL,
  -- Matches user_watchlist.item_id: TEXT, holding a legacy_id or a uuid.
  item_id     text NOT NULL,
  position    numeric NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_list_order_unique UNIQUE (user_id, list_key, item_id),
  CONSTRAINT user_list_order_list_key_check CHECK (char_length(list_key) BETWEEN 1 AND 64),
  CONSTRAINT user_list_order_item_id_check CHECK (char_length(item_id) BETWEEN 1 AND 128)
);

-- The read is always "one user's one list, in order". This index serves it
-- fully and also serves the neighbour lookup the midpoint insert needs.
CREATE INDEX IF NOT EXISTS user_list_order_lookup_idx
  ON public.user_list_order (user_id, list_key, position);

ALTER TABLE public.user_list_order ENABLE ROW LEVEL SECURITY;

-- Policies mirror user_watchlist (migration 060): the row is the caller's own
-- or it is invisible. Service role bypasses RLS, which is how the API routes
-- reach it; these policies are the second line, not the only one.
DROP POLICY IF EXISTS user_list_order_select ON public.user_list_order;
CREATE POLICY user_list_order_select ON public.user_list_order
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_list_order_insert ON public.user_list_order;
CREATE POLICY user_list_order_insert ON public.user_list_order
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_list_order_update ON public.user_list_order;
CREATE POLICY user_list_order_update ON public.user_list_order
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_list_order_delete ON public.user_list_order;
CREATE POLICY user_list_order_delete ON public.user_list_order
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_list_order IS
  'Per-user drag ordering for orderable lists. Personal by operator ruling ("Drag order is personal") - no org scope. position is numeric so a reorder writes one row via midpoint insertion instead of renumbering the list.';
COMMENT ON COLUMN public.user_list_order.list_key IS
  'Which orderable surface, e.g. watchlist | regulations. Validated by the writer, not by a DB enum, so a new surface does not need a migration.';
COMMENT ON COLUMN public.user_list_order.item_id IS
  'TEXT to match user_watchlist.item_id: holds a legacy_id or a uuid. This is why the ordering could not live on user_item_state, whose item_id is a uuid FK.';
COMMENT ON COLUMN public.user_list_order.position IS
  'Fractional sort key. Exact-decimal numeric, not float8, so repeated midpoint splits do not drift.';
