import { getResourcesOnly, getOperationsItems } from "@/lib/data";
import { OperationsPage } from "@/components/pages/OperationsPage";

// Phase 1 routing gate (PR feat/phase1-routing-restructure):
//   ?routing=v2 -> source_role-driven get_operations_items RPC
//                  (statistical_data_agency only in v1)
//   default     -> legacy getResourcesOnly (everything, in-component split)
//
// Default flips to v2 in a follow-up commit on this branch after operator
// preview-deploy confirm. To flip: change `routing === "v2"` to
// `routing !== "v1"` (or equivalent) so v1 becomes the explicit opt-out.
export default async function Operations({
  searchParams,
}: {
  searchParams: Promise<{ routing?: string }>;
}) {
  const params = await searchParams;
  const useV2 = params.routing === "v2";
  const t0 = Date.now();
  const data = useV2 ? await getOperationsItems() : await getResourcesOnly();
  console.log(`[perf] /operations data ${Date.now() - t0}ms (routing=${useV2 ? "v2" : "v1"})`);
  return <OperationsPage initialResources={data.resources} />;
}
