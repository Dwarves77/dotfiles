import { getMapData } from "@/lib/data";
import { getCoverageGaps } from "@/lib/coverage-gaps";
import { MapPageView } from "@/components/map/MapPageView";

export default async function MapRoute() {
  const t0 = Date.now();
  // Both fetches are independent — parallelise for cold-cache speed.
  // getCoverageGaps is itself wrapped in unstable_cache (60s TTL,
  // APP_DATA_TAG) so warm hits return ~ms.
  const [data, coverageGaps] = await Promise.all([
    getMapData(),
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
    />
  );
}
