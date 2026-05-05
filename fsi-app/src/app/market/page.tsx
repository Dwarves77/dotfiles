import { getResourcesOnly } from "@/lib/data";
import { MarketPage } from "@/components/pages/MarketPage";

export default async function Market() {
  const t0 = Date.now();
  const data = await getResourcesOnly();
  console.log(`[perf] /market data ${Date.now() - t0}ms`);
  return <MarketPage initialResources={data.resources} />;
}
