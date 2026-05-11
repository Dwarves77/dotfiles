import { getResourcesOnly, getScopedWorkspaceAggregates } from "@/lib/data";
import { OperationsPage } from "@/components/pages/OperationsPage";

// Scope filter must mirror the client-side filter inside OperationsPage:
//   regionalItems: r.type === "regional_data" || r.domain === 3
//   facilityItems: r.domain === 6
// → item_types ∋ "regional_data", domains ⊇ {3, 6}.
// Migration 069's RPC OR-combines item_types and domains so this matches
// the union of regional + facility tabs.
const OPERATIONS_SCOPE = {
  item_types: ["regional_data"],
  domains: [3, 6],
};

export default async function Operations() {
  const t0 = Date.now();
  // Fetch the row payload and the scoped aggregates in parallel. Aggregates
  // power the masthead meta + StatStrip totals; rows power the cards. Both
  // ride APP_DATA_TAG so override mutations invalidate them in lockstep.
  const [data, aggregates] = await Promise.all([
    getResourcesOnly(),
    getScopedWorkspaceAggregates(OPERATIONS_SCOPE),
  ]);
  console.log(`[perf] /operations data ${Date.now() - t0}ms`);
  return <OperationsPage initialResources={data.resources} aggregates={aggregates} />;
}
