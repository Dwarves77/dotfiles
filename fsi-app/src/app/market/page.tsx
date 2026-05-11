import { getResourcesOnly, getScopedWorkspaceAggregates } from "@/lib/data";
import { MarketPage } from "@/components/pages/MarketPage";

// Scope filter must mirror the client-side filter inside MarketPage:
//   techItems:  r.type === "technology" || r.type === "innovation" || r.domain === 2
//   priceItems: r.type === "market_signal" || r.domain === 4
// → item_types ⊇ {technology, innovation, market_signal}, domains ⊇ {2, 4}.
// Migration 069's RPC OR-combines item_types and domains so this matches
// the union of both tabs.
const MARKET_SCOPE = {
  item_types: ["technology", "innovation", "market_signal"],
  domains: [2, 4],
};

export default async function Market() {
  const t0 = Date.now();
  // Fetch the row payload and the scoped aggregates in parallel. Aggregates
  // power the masthead meta + watch sidebar totals; rows power the cards.
  // Both ride APP_DATA_TAG so override mutations invalidate them in lockstep.
  const [data, aggregates] = await Promise.all([
    getResourcesOnly(),
    getScopedWorkspaceAggregates(MARKET_SCOPE),
  ]);
  console.log(`[perf] /market data ${Date.now() - t0}ms`);
  return <MarketPage initialResources={data.resources} aggregates={aggregates} />;
}
