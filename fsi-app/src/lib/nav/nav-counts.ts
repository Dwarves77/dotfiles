import { getSurfaceCoverageSnapshot } from "@/lib/dashboard/surface-coverage";
import { getWatchlist, getWorkspaceAggregates } from "@/lib/data";

export interface NavCounts {
  regulations: number;
  market: number;
  research: number;
  operations: number;
  watchlist: number;
  /** Real per-band counts (CRITICAL/HIGH/MODERATE/LOW, the same
   *  WorkspaceAggregates.byPriority the dashboard's own band tiles read) —
   *  feeds the nav's band-gradient rule (README §0.2/§0.3) with the
   *  workspace's ACTUAL urgency mix, never a fabricated split. */
  byPriority: { CRITICAL: number; HIGH: number; MODERATE: number; LOW: number };
}

export const EMPTY_NAV_COUNTS: NavCounts = {
  regulations: 0,
  market: 0,
  research: 0,
  operations: 0,
  watchlist: 0,
  byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
};

export async function getNavCounts(): Promise<NavCounts> {
  try {
    const [coverage, watchlist, aggregates] = await Promise.all([
      getSurfaceCoverageSnapshot(),
      getWatchlist().catch(() => []),
      getWorkspaceAggregates(),
    ]);
    return {
      regulations: coverage.intelligence.regulations,
      market: coverage.intelligence.marketIntel,
      research: coverage.intelligence.research,
      operations: coverage.intelligence.operations,
      watchlist: watchlist.length,
      byPriority: aggregates.byPriority,
    };
  } catch {
    return EMPTY_NAV_COUNTS;
  }
}
