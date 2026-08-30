/** How a watchlist row is LABELLED and where it GOES when clicked. One
 *  definition, consumed by the dashboard rail and by the /watchlist page.
 *
 *  CLIENT-SAFE BY CONSTRUCTION. The only import is a type, which TypeScript
 *  erases, so neither consumer drags a server module into the client bundle.
 *
 *  WHY THIS IS ITS OWN MODULE. The maps were previously hand-typed inside
 *  DashboardWatchlist.tsx, which is how both of the defects below survived:
 *  a component-local table has nothing tying it to the app's actual route
 *  tree, so it can name a route that does not exist and no build step
 *  disagrees. Copying that table into a second surface would have doubled the
 *  blast radius of the next drift. It is deliberately NOT folded into
 *  watchlist-order.ts: that module answers "which row is this in the stored
 *  order", this one answers "where does this row go", and they change for
 *  different reasons.
 *
 *  The maps are keyed by the FULL WatchlistItemType union, so a newly
 *  watchable type is a compile error here rather than a silently mislabelled
 *  row. Landing B widened the vocabulary to five values without widening the
 *  maps, which sent every watched research finding to /market#id as a
 *  "Signal".
 */

import type { WatchlistItemType } from "@/lib/data";

export const WATCHLIST_TYPE_LABEL: Record<WatchlistItemType, string> = {
  source: "Source",
  reg: "Reg",
  signal: "Signal",
  research: "Research",
  operations: "Operations",
  market_series: "Series",
};

/**
 * The destination for a watched row, or null when the platform has no surface
 * to send it to.
 *
 * NULL IS A REAL ANSWER, not a failure. `source` rows have no detail page:
 * there is no /sources route in the app at all, and the previous map pointed
 * at `/sources/{id}`, which would have 404'd the moment a WatchButton started
 * writing that type. Returning null lets a surface render the row honestly,
 * unlinked, instead of offering a click that dead-ends. When a source detail
 * page ships, this is the one place that changes.
 *
 * `signal` was the live half of that same defect. It pointed at
 * `/market#{id}`, but /market carries no such anchor — the only ids on that
 * page are the `mi-body-{id}` accordion bodies, and accordions are closed by
 * default across the platform, so the fragment matched nothing and the link
 * simply landed at the top of the index. /market/[slug] is the real detail
 * route and is what WatchButton's own surface already uses.
 *
 * `market_series` (WO-23, migration 270) is the newest case, and it is
 * ANOTHER honest null, not a guess: there is no per-series detail route in
 * the app today — /market renders the signal board, not a market_series
 * table, and market_series rows are per-period observations, not stable
 * per-page entities. Inventing a route here would 404 the moment a
 * market_series row was actually watched. When a real detail surface for a
 * series ships, this is the one case that changes.
 */
export function watchlistHref(item: {
  type: WatchlistItemType;
  id: string;
}): string | null {
  const id = encodeURIComponent(item.id);
  switch (item.type) {
    case "reg":
      return `/regulations/${id}`;
    case "research":
      return `/research/${id}`;
    case "operations":
      return `/operations/${id}`;
    case "signal":
      return `/market/${id}`;
    case "source":
      return null;
    case "market_series":
      return null;
  }
}
