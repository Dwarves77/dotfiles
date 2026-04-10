import { fetchDashboardData, fetchSourceData } from "@/lib/supabase-server";

/**
 * Shared data fetching for all pages.
 * Has a 10-second overall timeout — if Supabase is slow,
 * pages still render with seed/empty data rather than hanging.
 */
export async function getAppData() {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getAppData timeout")), 10000)
    );

    const dataPromise = Promise.all([fetchDashboardData(), fetchSourceData()]);
    const [dashboardData, sourceData] = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);

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
    };
  }
}
