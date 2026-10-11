import { unstable_cache } from "next/cache";
import { fetchAllRows } from "@/lib/db/paginate.mjs";
import { getServiceSupabase } from "./supabase-service";
import { APP_DATA_TAG } from "@/lib/data";
import { TIER1_PRIORITY_REGIONS } from "@/lib/tier1-priority-jurisdictions";
import { rollupRegions, type RegionCoverage, type SourceRow } from "./coverage-gaps-rollup.ts";

export type { RegionCoverage } from "./coverage-gaps-rollup.ts";

// ── Inner fetch: Supabase service-role client to avoid cookie reads ──
// We don't need org scoping for coverage gaps — `sources` rows are
// platform-wide and not tenant-partitioned. Using a stateless service
// client keeps the cache key free of orgId.

async function fetchActiveSourceRows(): Promise<SourceRow[]> {
  // C1 fail-closed (2026-07-12): route through the canonical service client. On missing SERVICE_ROLE it THROWS
  // (never the old silent anon-key downgrade, which would compute coverage gaps from RLS-limited reads); we
  // catch → empty, so a misconfigured service key yields NO coverage data, never WRONG coverage data.
  let supabase;
  try { supabase = getServiceSupabase(); } catch { return []; }

  // PAGINATED (case-file 9): the full active source registry can exceed 1000 rows; a truncated read would
  // silently bias the per-region {covered, partial, gap} coverage verdict below.
  try {
    return (await fetchAllRows((from, to) =>
      supabase
        .from("sources")
        .select("name, url, jurisdictions, source_type")
        .eq("status", "active")
        .eq("admin_only", false)
        .order("id", { ascending: true }) // UNIQUE order key (PK) — url is not guaranteed unique
        .range(from, to)
    )) as SourceRow[];
  } catch (e: unknown) {
    console.error("[coverage-gaps] fetchActiveSourceRows failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

// ── Cached entry point ─────────────────────────────────────────
// 60s TTL · APP_DATA_TAG so admin/staged-update revalidations also
// invalidate this snapshot. Mirrors `cachedAppData` in lib/data.ts and
// `cachedPlatformTotal` in app/regulations/page.tsx.

const cachedCoverageGaps = unstable_cache(
  async (): Promise<RegionCoverage[]> => {
    const t0 = Date.now();
    const rows = await fetchActiveSourceRows();
    const result = rollupRegions(rows);
    console.log(
      `[perf] getCoverageGaps ${Date.now() - t0}ms (rows=${rows.length})`
    );
    return result;
  },
  ["coverage-gaps-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Single-source-of-truth coverage rollup. Returns one row per Tier 1
 * priority region, with per-region {covered, partial, gap, total}
 * counts. Order matches `TIER1_PRIORITY_REGIONS`. Consumers should sort
 * by their own criterion (e.g., gap-severity for the Map card).
 *
 * Falls back to a "all-gap" projection if Supabase is unconfigured or
 * the query fails — the card stays renderable on cold dev environments.
 */
export async function getCoverageGaps(): Promise<RegionCoverage[]> {
  try {
    return await cachedCoverageGaps();
  } catch (e) {
    console.error("getCoverageGaps failed, returning all-gap fallback:", e);
    return TIER1_PRIORITY_REGIONS.map((region) => ({
      region,
      covered: 0,
      partial: 0,
      gap: region.jurisdictions.length,
      total: region.jurisdictions.length,
    }));
  }
}
