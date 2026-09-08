// getNavCounts — the one source of nav-rail counts (UI system handoff
// 2026-09-06, README §0.3: "sections Brief / Intelligence / Network /
// Operator with right-aligned live counts"). Server-only.
//
// REUSES the existing bounded/cached helpers rather than adding a new
// Supabase read (F38/F39): getSurfaceCoverageSnapshot (unstable_cache,
// 60s, migration-148-backed RPC with a scanning fallback) is the same
// call the dashboard's own rail already makes; getWatchlist() is the
// same cached call the dashboard's watchlist card already makes.

import { getSurfaceCoverageSnapshot } from "@/lib/dashboard/surface-coverage";
import { getWatchlist, getWorkspaceAggregates } from "@/lib/data";

export interface NavCounts {
  regulations: number;
  market: number;
  research: number;
  operations: number;
  community: number;
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
  community: 0,
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
      // COUNTS-61: the badge counts regional ROOMS, which is what the /community page's own
      // header states. It used to count groups the workspace had joined, so the rail said
      // "Community 1" over a page saying "7 regional rooms".
      community: coverage.community.regionalRooms,
      watchlist: watchlist.length,
      byPriority: aggregates.byPriority,
    };
  } catch {
    return EMPTY_NAV_COUNTS;
  }
}
