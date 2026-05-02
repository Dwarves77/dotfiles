import { getAppData } from "@/lib/data";
import { MapPageView } from "@/components/map/MapPageView";

export const revalidate = 60;

export default async function MapRoute() {
  const data = await getAppData();

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
