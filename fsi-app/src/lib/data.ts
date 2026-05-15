import { unstable_cache } from "next/cache";
import {
  fetchDashboardData,
  fetchResourcesOnly,
  fetchListingsOnly,
  fetchMapData,
  fetchListingsMapData,
  fetchSourceData,
  fetchSettingsData,
  fetchWatchlist,
  fetchCoverageGaps,
  fetchAwaitingReview,
  fetchWorkspaceAggregates,
} from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import type {
  WorkspaceOverrideRow,
  WatchlistItem,
  CoverageGap,
  ReviewItem,
  WorkspaceAggregates,
} from "@/lib/supabase-server";

// Re-export the Phase 3 widget types so HomeSurface and the widget files
// can import them from a single module rather than reaching into
// supabase-server directly.
export type { WatchlistItem, CoverageGap, ReviewItem, WorkspaceAggregates };

/**
 * Cache invalidation tag for workspace data. Mutation routes
 * (api/staged-updates approval, api/workspace/overrides) call
 * `revalidateTag(APP_DATA_TAG)` so users see their changes immediately
 * instead of waiting up to 60s for the cache to refresh.
 */
export const APP_DATA_TAG = "app-data";

/**
 * Cached inner getAppData. The cookies-read happens OUTSIDE this
 * function (in getAppData below); only the resolved orgId enters as a
 * function argument and becomes part of the cache key.
 *
 * Anonymous users (orgId=null) and authed users without org membership
 * share one cache key — they all see the seed fallback shape.
 *
 * 60s TTL bounds staleness; revalidateTag(APP_DATA_TAG) from mutation
 * routes invalidates immediately on user-driven changes.
 */
const cachedAppData = unstable_cache(
  async (orgId: string | null) => {
    const dataPromise = Promise.all([fetchDashboardData(orgId), fetchSourceData()]);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getAppData timeout")), 10000)
    );
    const [dashboardData, sourceData] = await Promise.race([
      dataPromise,
      timeout.then(() => {
        throw new Error("timeout");
      }),
    ]);
    return { ...dashboardData, ...sourceData };
  },
  ["app-data-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

async function appDataSeedFallback() {
  const seed = await import("@/data");
  return {
    resources: seed.resources,
    archived: seed.archived,
    changelog: seed.changelog,
    disputes: seed.disputes,
    xrefPairs: seed.xrefPairs,
    supersessions: seed.supersessions,
    auditDate: seed.AUDIT_DATE,
    sources: [],
    provisionalSources: [],
    openConflicts: [],
    synopses: [],
    intelligenceChanges: [],
    sectorDisplayNames: [],
    overrides: [],
  };
}

/**
 * Shared data fetching for all pages.
 *
 * Resolves orgId from auth cookies (uncacheable — cookies opt the page
 * into dynamic rendering) and then calls a cached inner fetcher keyed by
 * orgId. The 9-query data path now runs at most once per minute per
 * workspace; subsequent renders within the TTL hit the Vercel data
 * cache (~5ms) instead of round-tripping to Supabase.
 *
 * Falls back to seed data on timeout / error so the page still renders.
 */
export async function getAppData() {
  const t0 = Date.now();
  try {
    const orgId = await resolveOrgIdFromCookies();
    const data = await cachedAppData(orgId);
    console.log(`[perf] getAppData ${Date.now() - t0}ms`);
    return data;
  } catch (e) {
    console.error("getAppData failed, using fallback:", e);
    return appDataSeedFallback();
  }
}

/**
 * Slim fetcher: only resources + overrides. Used by pages that consume
 * `data.resources` (and optionally `data.overrides`) but not the heavy
 * dashboard payload (changelog, disputes, xrefs, supersessions, synopses,
 * intelligence changes, sector names, sources).
 *
 * Runs the workspace RPC + workspace_item_overrides only. ~2 queries
 * vs. ~15 for getAppData(). Falls back to seed resources on failure.
 *
 * Used by: /operations, /market, /regulations index.
 */
export async function getResourcesOnly(): Promise<{
  resources: Resource[];
  archived: Resource[];
  overrides: WorkspaceOverrideRow[];
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getResourcesOnly timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchResourcesOnly(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getResourcesOnly ${Date.now() - t0}ms`);
    return result;
  } catch (e) {
    console.error("getResourcesOnly failed, using fallback:", e);
    const seed = await import("@/data");
    return {
      resources: seed.resources,
      archived: seed.archived,
      overrides: [],
    };
  }
}

/**
 * Listings fetcher: resources + overrides via the listings RPC (066),
 * which additionally drops `summary` on top of slim. Resource.note arrives
 * empty on every row.
 *
 * Used by: /regulations (card body never renders r.note; the search
 * hay-stack stops contributing the empty value, no functional regression).
 *
 * /market and /operations DO render r.note on cards and stay on
 * getResourcesOnly until those cards are refactored or per-route summary
 * retention is added. See migration 066 header.
 */
export async function getListingsOnly(): Promise<{
  resources: Resource[];
  archived: Resource[];
  overrides: WorkspaceOverrideRow[];
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getListingsOnly timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchListingsOnly(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getListingsOnly ${Date.now() - t0}ms`);
    return result;
  } catch (e) {
    console.error("getListingsOnly failed, using fallback:", e);
    const seed = await import("@/data");
    return {
      resources: seed.resources,
      archived: seed.archived,
      overrides: [],
    };
  }
}

/**
 * Slim fetcher for /map: resources + the relationship payload the map
 * surface needs (changelog, disputes, xrefPairs, supersessions). Drops
 * sources, provisional sources, conflicts, synopses, intelligence
 * changes, sector display names, and overrides.
 *
 * Used by: /map.
 */
export async function getMapData(): Promise<{
  resources: Resource[];
  archived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getMapData timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchMapData(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getMapData ${Date.now() - t0}ms`);
    return result;
  } catch (e) {
    console.error("getMapData failed, using fallback:", e);
    const seed = await import("@/data");
    return {
      resources: seed.resources,
      archived: seed.archived,
      changelog: seed.changelog,
      disputes: seed.disputes,
      xrefPairs: seed.xrefPairs,
      supersessions: seed.supersessions,
    };
  }
}

/**
 * Listings fetcher for /map: resources + relationship payload, but via the
 * listings RPC (066) which additionally drops `summary` on top of slim.
 * Resource.note arrives empty on every row. Safe for /map per the
 * 2026-05-10 audit (no MapPageView / MapView reference to r.note).
 */
export async function getListingsMapData(): Promise<{
  resources: Resource[];
  archived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getListingsMapData timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchListingsMapData(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getListingsMapData ${Date.now() - t0}ms`);
    return result;
  } catch (e) {
    console.error("getListingsMapData failed, using fallback:", e);
    const seed = await import("@/data");
    return {
      resources: seed.resources,
      archived: seed.archived,
      changelog: seed.changelog,
      disputes: seed.disputes,
      xrefPairs: seed.xrefPairs,
      supersessions: seed.supersessions,
    };
  }
}

/**
 * Slim fetcher for /settings: resources + archived + supersessions only.
 * SettingsPage consumes only these; everything else getAppData returns
 * was dead weight on this surface. ~3 queries vs ~14 via getAppData.
 *
 * Used by: /settings.
 */
export async function getSettingsData(): Promise<{
  resources: Resource[];
  archived: Resource[];
  supersessions: Supersession[];
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getSettingsData timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchSettingsData(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getSettingsData ${Date.now() - t0}ms`);
    return result;
  } catch (e) {
    console.error("getSettingsData failed, using fallback:", e);
    const seed = await import("@/data");
    return {
      resources: seed.resources,
      archived: seed.archived,
      supersessions: seed.supersessions,
    };
  }
}

// ── Phase 3 dashboard sidebar fetchers (Wave 1 / Track 5) ────────
//
// Each getX wraps the fetchX in supabase-server.ts behind unstable_cache
// keyed by the natural identity (userId for watchlist + awaiting-review,
// orgId for coverage gaps). 60s revalidate, tagged APP_DATA_TAG so any
// existing mutation route that flushes APP_DATA_TAG also invalidates these
// entries. Each is wrapped in try/catch so a missing migration (060/061)
// or RPC failure returns [] rather than throwing — the widgets render
// their empty-state copy in that case, keeping the dashboard merge-safe
// before migrations apply.

async function resolveUserIdFromCookies(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

const cachedWatchlist = unstable_cache(
  async (userId: string | null): Promise<WatchlistItem[]> => {
    return fetchWatchlist(userId);
  },
  ["watchlist-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

const cachedCoverageGaps = unstable_cache(
  async (
    orgId: string | null,
    activeSectorsKey: string
  ): Promise<CoverageGap[]> => {
    void orgId; // orgId participates in the cache key for future filtering
    const sectors = activeSectorsKey ? activeSectorsKey.split("|") : [];
    return fetchCoverageGaps(sectors);
  },
  ["coverage-gaps-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

const cachedAwaitingReview = unstable_cache(
  async (userId: string | null): Promise<ReviewItem[]> => {
    return fetchAwaitingReview(userId);
  },
  ["awaiting-review-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

// Workspace aggregates (migration 068). Same TTL + tag as cachedAppData so
// the aggregates and the dashboard payload refresh together — when an
// override mutation calls revalidateTag(APP_DATA_TAG), both invalidate
// in lockstep and the rendered counts stay consistent with the row payload.
const cachedWorkspaceAggregates = unstable_cache(
  async (orgId: string | null): Promise<WorkspaceAggregates> => {
    return fetchWorkspaceAggregates(orgId);
  },
  ["workspace-aggregates-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Fetch the current user's watchlist items (regulations, sources, signals)
 * for the Dashboard Watchlist widget. Returns [] for anon users and on any
 * error (including migration 060 not yet applied).
 */
export async function getWatchlist(): Promise<WatchlistItem[]> {
  try {
    const userId = await resolveUserIdFromCookies();
    return await cachedWatchlist(userId);
  } catch (e) {
    console.error("getWatchlist failed, returning empty:", e);
    return [];
  }
}

/**
 * Fetch coverage gaps for the current workspace. v1 reads the hand-curated
 * `coverage_gaps` table (migration 061). Active sectors are not yet
 * resolved server-side from workspace settings, so this passes [] which
 * returns all curated gaps; the result is capped at 2 by the fetcher.
 */
export async function getCoverageGaps(): Promise<CoverageGap[]> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    // Active-sector filtering is a v2 enhancement once workspace sector
    // profile is exposed to server components. v1 returns the curated
    // top-N for any workspace.
    return await cachedCoverageGaps(orgId, "");
  } catch (e) {
    console.error("getCoverageGaps failed, returning empty:", e);
    return [];
  }
}

/**
 * Fetch the top oldest items awaiting admin review for the Dashboard
 * Awaiting Review widget. Returns [] for non-admins (the widget hides
 * itself in that case).
 */
export async function getAwaitingReview(): Promise<ReviewItem[]> {
  try {
    const userId = await resolveUserIdFromCookies();
    return await cachedAwaitingReview(userId);
  } catch (e) {
    console.error("getAwaitingReview failed, returning empty:", e);
    return [];
  }
}

/**
 * Fetch scalar aggregates over the workspace's active intelligence row set.
 * Used by the dashboard masthead, DashboardHero tiles, and WeeklyBriefing
 * summary so render-time stats no longer derive from the LIMIT-50
 * dashboard row payload (migration 068).
 *
 * Cached at the same TTL + tag as getAppData; the override / staged-update
 * mutation routes that revalidateTag(APP_DATA_TAG) flush both in lockstep.
 */
export async function getWorkspaceAggregates(): Promise<WorkspaceAggregates> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedWorkspaceAggregates(orgId);
  } catch (e) {
    console.error("getWorkspaceAggregates failed, returning empty:", e);
    return {
      totalItems: 0,
      byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
      byStatus: {},
      byJurisdiction: {},
      totalJurisdictions: 0,
      lastUpdatedAt: null,
    };
  }
}
