import { getListingsMapData } from "@/lib/data";
import { getCoverageGaps } from "@/lib/coverage-gaps";
import { MapPageView } from "@/components/map/MapPageView";

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
  // Both fetches are independent — parallelise for cold-cache speed.
  // getCoverageGaps is itself wrapped in unstable_cache (60s TTL,
  // APP_DATA_TAG) so warm hits return ~ms.
  // Listings RPC (066): drops `summary` on top of slim. Resource.note arrives
  // empty here. MapPageView / MapView never read r.note (audit 2026-05-10).
  const [{ region: regionParam }, data, coverageGaps] = await Promise.all([
    searchParams,
    getListingsMapData(),
    getCoverageGaps(),
  ]);
  console.log(`[perf] /map data ${Date.now() - t0}ms`);

  return (
    <MapPageView
      resources={data.resources}
      changelog={data.changelog}
      disputes={data.disputes}
      xrefPairs={data.xrefPairs}
      supersessions={data.supersessions}
      coverageGaps={coverageGaps}
      initialRegionFilter={regionParam ?? null}
    />
  );
}
