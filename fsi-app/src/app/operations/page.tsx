import { getOperationsItems, getResourcesOnly, getScopedWorkspaceAggregates } from "@/lib/data";
import { OperationsPage } from "@/components/pages/OperationsPage";

// Scope filter for the aggregates RPC must mirror the page-scope intent:
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
  // Sprint 2 Build 4: category routing wiring (OBS-26 / REC-OBS-G).
  // Previously this page received the unfiltered slim payload via
  // getResourcesOnly and shared its content with /market through the same
  // shape. getOperationsItems wraps get_operations_items
  // (source_role = 'statistical_data_agency') with skill Section 3
  // exception filtering (Carbon Trust + Project Drawdown excluded; those
  // route to Research). getResourcesOnly still runs in parallel as a
  // fallback so the surface is never blank when the category RPC is
  // empty (anon / misconfigured).
  const [opsItems, fallback, aggregates] = await Promise.all([
    getOperationsItems(),
    getResourcesOnly(),
    getScopedWorkspaceAggregates(OPERATIONS_SCOPE),
  ]);
  console.log(
    `[perf] /operations data ${Date.now() - t0}ms (category-routed=${opsItems.total}, fallback=${fallback.resources.length})`
  );
  const initialResources = opsItems.resources.length
    ? opsItems.resources
    : fallback.resources;
  return <OperationsPage initialResources={initialResources} aggregates={aggregates} />;
}
