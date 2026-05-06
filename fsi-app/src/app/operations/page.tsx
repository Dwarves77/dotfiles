import { getResourcesOnly } from "@/lib/data";
import { OperationsPage } from "@/components/pages/OperationsPage";

export default async function Operations() {
  const t0 = Date.now();
  const data = await getResourcesOnly();
  console.log(`[perf] /operations data ${Date.now() - t0}ms`);
  return <OperationsPage initialResources={data.resources} />;
}
