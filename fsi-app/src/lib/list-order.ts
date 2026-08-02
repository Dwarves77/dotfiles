/** Shared rules for the personal drag order (migrations 237 + 238,
 *  /api/user/list-order). Consumed by the server reader (fetchWatchlist), by
 *  the browser hook (useListOrder), and by every surface that renders a
 *  user-arranged list.
 *
 *  CLIENT-SAFE BY CONSTRUCTION. This module imports nothing, so the server and
 *  the browser can share it without dragging a server-only dependency into the
 *  client bundle.
 *
 *  WHY THE COMPARATOR LIVES HERE. "An item with no stored position sorts first"
 *  is a subtle rule with a non-obvious reason (below), and it has to hold
 *  identically in the server reader and in the client. Two hand-written copies
 *  of a three-branch comparator in two files is exactly the shape that drifts:
 *  one gets a tweak, the other does not, and the same list then renders in two
 *  different orders depending on whether it came from SSR or from an optimistic
 *  client update. One definition, both callers.
 */

/** Longest item_id the column accepts (user_list_order_item_id_check). Stated
 *  here so a client can refuse a malformed id locally instead of discovering
 *  the route's 400. Imported by the route rather than re-typed there. */
export const LIST_ORDER_ITEM_ID_MAX = 128;

/** Bounds the seed array, which is the FULL list a surface renders, not just
 *  the visible slice.
 *
 *  The bound has to clear the real corpus with room to spare, because a seed
 *  the client has to truncate is worse than no seed: every dropped id stays
 *  unplaced, and unplaced rows sort FIRST (see compareRanks), so a truncated
 *  tail would leap to the top of the list the user just arranged. The verified
 *  regulations corpus is in the hundreds today, so this is an order of
 *  magnitude of headroom while still refusing an unbounded array — which is
 *  the abuse this bound actually exists to stop. A text[] of this size is a
 *  single trivial INSERT for Postgres. */
export const LIST_ORDER_SEED_MAX = 5000;

/**
 * Order two rows by their stored rank.
 *
 * A rank is an ARRAY INDEX, not the stored `position`. `position` is `numeric`
 * and postgrest-js returns it as a STRING to preserve exactness; parsing it
 * into a JS number to sort would round a deeply split midpoint through an
 * IEEE-754 double, which is the exact defect migration 238 moved the
 * arithmetic into the database to avoid. Postgres orders the rows, so the
 * index of a row in that ordered array IS its rank and no arithmetic happens
 * outside the database.
 *
 * UNPLACED ROWS SORT FIRST. An item the caller has never dragged has no row in
 * user_list_order at all. It sorts ABOVE every placed row rather than below,
 * because the surfaces that carry a drag order also truncate: the watchlist
 * rail renders its first three entries, a regulations band renders its first
 * five. Appending a newly arrived item beneath a custom order would make it
 * invisible on exactly the surfaces where the user asked to control what sits
 * at the top. Dragging it assigns a position like any other row, so the
 * exception resolves itself the first time the user acts on it.
 *
 * Callers must apply their own natural order FIRST and then re-sort with this
 * comparator. `Array.prototype.sort` is stable (ES2019), so returning 0 for two
 * unplaced rows preserves that natural order rather than leaving it to the
 * engine.
 */
export function compareRanks(a: number | undefined, b: number | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a - b;
}

/**
 * Rebuild an ordered array after a drag, and report the two ids the moved item
 * landed BETWEEN so the caller can hand them to the reorder RPC.
 *
 * The neighbours are read from the POST-MOVE array, which is what makes this
 * correct on a truncated surface. A band renders `rows.slice(0, 5)`; a drop
 * onto the last visible slot has no visible successor, but it does have a real
 * one, row 6. Passing null there would append the item past the end of the
 * whole stored list instead of placing it above row 6. Because the rendered
 * slice is a PREFIX of the full array, a display index is also a full-array
 * index, so the caller passes the full array and the truncation stops mattering.
 */
export function applyMove<T>(
  items: readonly T[],
  from: number,
  to: number
): { items: T[]; prevIndex: number; nextIndex: number } {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { items: next, prevIndex: to - 1, nextIndex: to + 1 };
}
