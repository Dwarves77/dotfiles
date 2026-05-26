import { getListingsMapData } from "@/lib/data";
import { getCoverageGaps } from "@/lib/coverage-gaps";
import { MapPageView } from "@/components/map/MapPageView";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import type { CommunityActivityRow } from "@/components/map/MapView";

export default async function MapRoute({
  searchParams,
}: {
  // PR-N (Wave 5): `?region=us-ca` accepts any Tier 1 ISO sub-national or
  // national code (case-insensitive) and pre-filters the map + side rail
  // to items whose `jurisdictionIso[]` array contains that code. The
  // existing `?region-filter=<region.id>` link from the Coverage gaps
  // card remains untouched — they target different scopes (ISO vs region
  // group). This new param matches the /regulations URL schema for
  // consistency across surfaces.
  searchParams: Promise<{ region?: string }>;
}) {
  const t0 = Date.now();
  // Phase 6 (2026-05-25): added community activity by region fetch
  // alongside the existing two. Aggregates top-level community_posts
  // by community_groups.region; powers the community-activity dot
  // overlay on the map.
  const supabase = await createSupabaseServerClient();
  const [{ region: regionParam }, data, coverageGaps, communityActivity] = await Promise.all([
    searchParams,
    getListingsMapData(),
    getCoverageGaps(),
    fetchCommunityActivityByRegion(supabase),
  ]);
  console.log(`[perf] /map data ${Date.now() - t0}ms`);

  return (
    <MapPageView
      resources={data.resources}
      coverageGaps={coverageGaps}
      initialRegionFilter={regionParam ?? null}
      communityActivity={communityActivity}
    />
  );
}

// Aggregate top-level community posts by their group's region. RLS
// scopes the visible posts to the caller's workspace; service-role
// is not used here. Returns empty array on RLS-denied (anon / not
// signed in) or query failure so the map still renders without dots.
async function fetchCommunityActivityByRegion(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<CommunityActivityRow[]> {
  try {
    const { data, error } = await supabase
      .from("community_posts")
      .select("group_id, community_groups!inner(region)")
      .is("parent_post_id", null)
      .limit(1000);
    if (error || !data) return [];
    const counts = new Map<string, number>();
    for (const row of data as Array<{ community_groups: { region: string } | { region: string }[] | null }>) {
      const cg = Array.isArray(row.community_groups)
        ? row.community_groups[0]
        : row.community_groups;
      if (!cg?.region) continue;
      counts.set(cg.region, (counts.get(cg.region) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([regionCode, count]) => ({ regionCode, count }));
  } catch {
    return [];
  }
}
