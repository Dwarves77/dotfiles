import { getMapData } from "@/lib/data";
import { MapPageView } from "@/components/map/MapPageView";

export default async function MapRoute() {
  const t0 = Date.now();
  const data = await getMapData();
  console.log(`[perf] /map data ${Date.now() - t0}ms`);

  return (
    <MapPageView
      resources={data.resources}
      changelog={data.changelog}
      disputes={data.disputes}
      xrefPairs={data.xrefPairs}
      supersessions={data.supersessions}
    />
  );
}
