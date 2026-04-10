import { fetchDashboardData, fetchSourceData } from "@/lib/supabase-server";

/**
 * Shared data fetching for all pages.
 * Deduplicates the fetch calls that were previously only in page.tsx.
 * Next.js automatically deduplicates fetch calls within a single request,
 * so calling this from multiple server components is safe.
 */
export async function getAppData() {
  const [dashboardData, sourceData] = await Promise.all([
    fetchDashboardData(),
    fetchSourceData(),
  ]);

  return {
    ...dashboardData,
    ...sourceData,
  };
}
