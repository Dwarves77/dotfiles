import { getAppData } from "@/lib/data";
import { OperationsPage } from "@/components/pages/OperationsPage";

export const revalidate = 60;

export default async function Operations() {
  const data = await getAppData();
  return <OperationsPage initialResources={data.resources} />;
}
