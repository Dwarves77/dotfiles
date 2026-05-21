import {
  getMarketIntelItems,
  getResourcesOnly,
  getScopedWorkspaceAggregates,
  getSourceCitationStats,
} from "@/lib/data";
import { MarketPage } from "@/components/pages/MarketPage";

// Scope filter for the aggregates RPC must mirror the page-scope intent:
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
  // Sprint 2 Build 4: category routing wiring (OBS-26 / REC-OBS-G).
  // Previously this page received the unfiltered slim payload via
  // getResourcesOnly and relied on client-side item_type / domain filters,
  // which left /market and /operations sharing essentially the same payload
  // (alignment audit Section B). Now it pulls getMarketIntelItems, which
  // wraps get_market_intel_items and applies the skill Section 3 routing
  // rules (trade-press outlets routed to Research are excluded; see
  // supabase-server.ts "Category-Aware Routing Fetchers" block).
  //
  // getResourcesOnly still runs in parallel to supply the seed-fallback
  // surface (e.g. archived / overrides) the MarketPage chrome consumes
  // from its initialResources shape. If the category RPC is empty (anon /
  // misconfigured), we fall back to the slim payload so the page is
  // never blank.
  const [marketIntel, fallback, aggregates] = await Promise.all([
    getMarketIntelItems(),
    getResourcesOnly(),
    getScopedWorkspaceAggregates(MARKET_SCOPE),
  ]);
  console.log(
    `[perf] /market data ${Date.now() - t0}ms (category-routed=${marketIntel.total}, fallback=${fallback.resources.length})`
  );
  const initialResources = marketIntel.resources.length
    ? marketIntel.resources
    : fallback.resources;

  // Build 7: per-source citation stats for Q9 chip mounts on Market Intel
  // cards, watchlist rail, and key metrics rows. Mirrors Build 8.1 ResearchView
  // pattern. Fans out a single RPC call across the distinct source_ids on the
  // page; failures degrade to no chips (empty map).
  const distinctSourceIds = Array.from(
    new Set(
      initialResources
        .map((r) => r.sourceId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );
  const citationStats = await getSourceCitationStats(distinctSourceIds);

  return (
    <MarketPage
      initialResources={initialResources}
      aggregates={aggregates}
      citationStats={citationStats}
    />
  );
}
