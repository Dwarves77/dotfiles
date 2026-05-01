import { getAppData } from "@/lib/data";
import { MarketPage } from "@/components/pages/MarketPage";

export const revalidate = 60;

export default async function Market() {
  const data = await getAppData();
  return <MarketPage initialResources={data.resources} />;
}
