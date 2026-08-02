/** Shared identity for a watchlist rail row inside the personal drag order
 *  (migrations 237 + 238, /api/user/list-order).
 *
 *  CLIENT-SAFE BY CONSTRUCTION. This module imports nothing. It is consumed by
 *  the server reader (fetchWatchlist) and by the browser drag component, and
 *  both must agree on the stored item_id byte-for-byte or a drag would write a
 *  position the reader never looks up. One definition, no second copy.
 *
 *  WHY A COMPOSITE KEY rather than the bare item_id: the watchlist rail is the
 *  one surface that merges item TYPES — reg, research, operations, source and
 *  signal all land on the same rail, and item_id is only unique within a type
 *  (`source` ids come from the sources registry, the rest from
 *  intelligence_items). Storing the bare id would let two different rows share
 *  one stored position. The rail's own dedupe key has always been
 *  `type:id` for exactly this reason; this is that key, promoted to a
 *  function so the drag order and the dedupe cannot drift apart.
 *
 *  Single-type surfaces (regulations, market, research, operations) have no
 *  such collision and pass their bare id, which is why this helper is scoped
 *  to the watchlist list_key rather than applied to every list.
 */

/** The list_key this surface owns. Must appear in LIST_KEYS in the route. */
export const WATCHLIST_LIST_KEY = "watchlist";

/** Longest key the column accepts (user_list_order_item_id_check). A composite
 *  key is a type prefix plus a uuid (36) or a legacy id (longest in the corpus
 *  at time of writing: 80), so the worst real key is ~91 chars and sits inside
 *  the bound. It is stated here so the client can refuse a malformed id
 *  locally instead of discovering the route's 400. */
export const WATCHLIST_ORDER_KEY_MAX = 128;

export function watchlistOrderKey(itemType: string, itemId: string): string {
  return `${itemType}:${itemId}`;
}
