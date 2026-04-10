import { getAppData } from "@/lib/data";
import { MapPage } from "@/components/pages/MapPage";

export const dynamic = 'force-dynamic';

export default async function Map() {
  const data = await getAppData();

  return (
    <MapPage
      initialResources={data.resources}
      changelog={data.changelog}
      disputes={data.disputes}
      xrefPairs={data.xrefPairs}
      supersessions={data.supersessions}
    />
  );
}
