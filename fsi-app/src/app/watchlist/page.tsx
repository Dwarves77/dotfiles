import { WatchlistSurface } from "@/components/watchlist/WatchlistSurface";
import { getWatchlistFull, WATCHLIST_PAGE_LIMIT } from "@/lib/data";

// force-dynamic for the same reason /research and /operations are: the read
// resolves the caller from cookies. Static generation has no cookies, so the
// user id and org id both come back null, fetchWatchlist early-returns an empty
// array, and the build would bake "Nothing watched yet" into the HTML for every
// user. This page is per-user by definition and can never be prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Watchlist",
  description: "Everything you and your workspace are following.",
};

/**
 * The read, with its own timing.
 *
 * DELIBERATELY NOT INLINE IN THE COMPONENT. `react-hooks/purity` flags
 * `Date.now()` called inside a component body, and it is right to: a value read
 * from the clock during render is not idempotent. /research and /operations
 * carry that lint error today for exactly this pattern. Measuring the DATA READ
 * rather than the RENDER is what the log was always about, so hosting the timer
 * in a plain async function keeps the observability and drops the violation
 * instead of suppressing it. (The two existing instances are pre-existing debt,
 * reported, not fixed here.)
 */
async function readWatchlist() {
  const t0 = Date.now();
  const items = await getWatchlistFull();
  const team = items.filter((i) => i.scope === "team").length;
  console.log(
    `[perf] /watchlist data ${Date.now() - t0}ms (rows=${items.length}, team=${team})`
  );
  return items;
}

export default async function Watchlist() {
  const items = await readWatchlist();

  // The bound is passed rather than imported by the client component so the
  // cap the surface reports is provably the same number the read used, not a
  // second copy that could drift from it.
  return <WatchlistSurface items={items} limit={WATCHLIST_PAGE_LIMIT} />;
}
