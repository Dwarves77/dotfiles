import {
  fetchDashboardData,
  fetchResourcesOnly,
  fetchMapData,
  fetchSourceData,
} from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import type { WorkspaceOverrideRow } from "@/lib/supabase-server";

/**
 * Shared data fetching for all pages.
 * Has a 10-second overall timeout — if Supabase is slow,
 * pages still render with seed/empty data rather than hanging.
 *
 * Org id is resolved from the request's auth cookies. Anonymous callers
 * (or auth'd users with no org membership) get the seed/public view
 * without workspace overrides applied.
 */
export async function getAppData() {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getAppData timeout")), 10000)
    );

    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = Promise.all([fetchDashboardData(orgId), fetchSourceData()]);
    const [dashboardData, sourceData] = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);

    console.log(`[perf] getAppData ${Date.now() - t0}ms`);
    return { ...dashboardData, ...sourceData };
  } catch (e) {
    console.error("getAppData failed, using fallback:", e);
    // Import seed data as fallback
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
