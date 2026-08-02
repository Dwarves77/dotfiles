-- Migration 238: atomic single-row reorder for user_list_order (drag ordering,
-- item-management program, 2026-08-02).
--
-- WHY AN RPC rather than a read-then-write in the API route (the obvious path,
-- rejected on two concrete defects, not on taste):
--
--   1. PRECISION. position is `numeric` precisely so repeated midpoint splits
--      stay exact. Reading the two neighbours into JavaScript, averaging them
--      there, and writing the result back would round every midpoint through an
--      IEEE-754 double and throw away the exactness the column type exists to
--      provide. The arithmetic has to happen where the numeric lives.
--
--   2. RACE. Read-neighbours-then-write is two statements. Two drops landing in
--      the same gap would both read the same pair, both compute the same
--      midpoint, and both write it. The unique constraint on user_list_order is
--      (user_id, list_key, item_id), NOT position, so nothing would reject the
--      collision: two items would silently share one position and their order
--      would then depend on whatever tiebreak the planner picked. This function
--      takes a transaction-scoped advisory lock keyed on (user_id, list_key), so
--      concurrent reorders of the SAME list serialise while different users and
--      different lists never contend.
--
-- SEEDING. A list that has never been dragged has zero rows here, so the prev
-- and next lookups would both come back NULL and the first drag would compute a
-- position with nothing to anchor it against. Rather than leave that to the
-- client, the caller passes the full rendered order as p_seed_item_ids and the
-- function seeds the list once, in the same transaction, before computing the
-- move. Steady-state drags still write exactly ONE row, which is the whole point
-- of fractional positions.
--
-- RENORMALISATION. numeric is arbitrary-precision, so midpoints never run out of
-- room the way float8 does, but a gap that has been split several thousand times
-- carries a long scale for no benefit. When the gap falls below v_min_gap the
-- function rewrites the whole list to a clean 1000-step ladder and then computes
-- the midpoint against the fresh neighbours. That is a bounded, rare, in-
-- transaction repair, not a per-drag cost.

CREATE OR REPLACE FUNCTION public.reorder_user_list_item(
  p_user_id       uuid,
  p_list_key      text,
  p_item_id       text,
  p_prev_item_id  text DEFAULT NULL,
  p_next_item_id  text DEFAULT NULL,
  p_seed_item_ids text[] DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step    constant numeric := 1000;
  v_min_gap constant numeric := 0.000001;
  v_prev    numeric;
  v_next    numeric;
  v_pos     numeric;
  v_count   integer;
BEGIN
  IF p_user_id IS NULL OR p_list_key IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'reorder_user_list_item: user_id, list_key and item_id are required';
  END IF;

  -- An item cannot be its own neighbour. This is a caller bug, not a state the
  -- function should paper over: silently ignoring it would place the item at a
  -- position derived from where it already was, so the drag would appear to do
  -- nothing and the client would have no way to tell why.
  IF p_item_id = p_prev_item_id OR p_item_id = p_next_item_id THEN
    RAISE EXCEPTION 'reorder_user_list_item: item_id may not equal prev_item_id or next_item_id';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_list_key));

  SELECT count(*) INTO v_count
    FROM user_list_order
   WHERE user_id = p_user_id AND list_key = p_list_key;

  IF v_count = 0 AND p_seed_item_ids IS NOT NULL AND array_length(p_seed_item_ids, 1) > 0 THEN
    INSERT INTO user_list_order (user_id, list_key, item_id, position)
    SELECT p_user_id, p_list_key, s.item_id, s.ord * v_step
      FROM unnest(p_seed_item_ids) WITH ORDINALITY AS s(item_id, ord)
    ON CONFLICT (user_id, list_key, item_id) DO NOTHING;
  END IF;

  SELECT position INTO v_prev
    FROM user_list_order
   WHERE user_id = p_user_id AND list_key = p_list_key AND item_id = p_prev_item_id;

  SELECT position INTO v_next
    FROM user_list_order
   WHERE user_id = p_user_id AND list_key = p_list_key AND item_id = p_next_item_id;

  -- A neighbour id that carries no stored position is indistinguishable here
  -- from no neighbour at all, and that is the correct reading: the anchor the
  -- caller named does not participate in the stored order yet.
  IF v_prev IS NOT NULL AND v_next IS NOT NULL AND (v_next - v_prev) < v_min_gap THEN
    WITH ladder AS (
      SELECT id, row_number() OVER (ORDER BY position, item_id) AS rn
        FROM user_list_order
       WHERE user_id = p_user_id AND list_key = p_list_key
    )
    UPDATE user_list_order u
       SET position = ladder.rn * v_step,
           updated_at = now()
      FROM ladder
     WHERE u.id = ladder.id;

    SELECT position INTO v_prev
      FROM user_list_order
     WHERE user_id = p_user_id AND list_key = p_list_key AND item_id = p_prev_item_id;
    SELECT position INTO v_next
      FROM user_list_order
     WHERE user_id = p_user_id AND list_key = p_list_key AND item_id = p_next_item_id;
  END IF;

  IF v_prev IS NULL AND v_next IS NULL THEN
    -- No anchors: append past the end of whatever is stored. Subtracting from
    -- the head or adding to the tail by a fixed step (rather than halving
    -- toward zero) is deliberate: a step walk can run forever on numeric, while
    -- repeated halving would consume fractional scale for no gain.
    SELECT coalesce(max(position), 0) + v_step INTO v_pos
      FROM user_list_order
     WHERE user_id = p_user_id AND list_key = p_list_key AND item_id <> p_item_id;
  ELSIF v_prev IS NULL THEN
    v_pos := v_next - v_step;
  ELSIF v_next IS NULL THEN
    v_pos := v_prev + v_step;
  ELSE
    v_pos := (v_prev + v_next) / 2;
  END IF;

  INSERT INTO user_list_order (user_id, list_key, item_id, position)
  VALUES (p_user_id, p_list_key, p_item_id, v_pos)
  ON CONFLICT (user_id, list_key, item_id)
  DO UPDATE SET position = EXCLUDED.position, updated_at = now();

  RETURN v_pos;
END;
$$;

COMMENT ON FUNCTION public.reorder_user_list_item(uuid, text, text, text, text, text[]) IS
  'Atomically place one item between two neighbours in a personal list order. '
  'Advisory-locked per (user_id, list_key); seeds an unordered list from '
  'p_seed_item_ids on first use; renormalises to a 1000-step ladder when a gap '
  'collapses. Returns the assigned position.';

-- service_role only. The route authenticates the caller and passes its OWN
-- auth.userId as p_user_id; the parameter is never taken from a request body.
-- Granting this to authenticated would hand any signed-in user the ability to
-- rewrite another user's list order, because SECURITY DEFINER bypasses the RLS
-- policies on user_list_order that would otherwise stop exactly that.
REVOKE ALL ON FUNCTION public.reorder_user_list_item(uuid, text, text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_user_list_item(uuid, text, text, text, text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.reorder_user_list_item(uuid, text, text, text, text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_user_list_item(uuid, text, text, text, text, text[]) TO service_role;
