import { unstable_cache } from "next/cache";
import {
  fetchDashboardData,
  fetchResourcesOnly,
  fetchMapData,
  fetchSourceData,
  fetchSettingsData,
} from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import type { WorkspaceOverrideRow } from "@/lib/supabase-server";

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
