import {
  getMarketIntelItems,
  getResourcesOnly,
  getSurfaceCounts,
  getSourceCitationStats,
} from "@/lib/data";
import { MarketPage } from "@/components/pages/MarketPage";

// Sprint 3 (2026-05-27): force-dynamic per /community precedent. Static
// generation at build time has no cookies; resolveOrgIdFromCookies
// returns null; runCategoryRpc early-returns empty (supabase-server.ts
// :1018-1020); static HTML bakes in total: 0 + seed fallback.
// Force-dynamic skips static generation so the page renders on request
// with the user's cookie-auth context, and category-routing RPCs see
// a real orgId.
export const dynamic = "force-dynamic";

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
    // Count-integrity: single classification+counting SoT (migration 148). Classification via
    // surface_of, population gated verified. Fails soft to scoped aggregates (069) over the
    // SURFACE_RULES-derived market scope when the RPC is absent (pre-apply). Replaces MARKET_SCOPE.
    getSurfaceCounts("market"),
  ]);
  console.log(
    `[perf] /market data ${Date.now() - t0}ms (category-routed=${marketIntel.total}, fallback=${fallback.resources.length})`
  );
  // Fail CLOSED: render ONLY the item_type-gated RPC result. On RPC error/empty the surface
  // shows its honest empty state; it does NOT fall through to the ungated seed (getResourcesOnly),
  // which would leak mixed-type items onto /market. Class fix for the fail-open that turned the
  // routing-RPC bug into the /research leak. (fallback is still fetched for the perf log only.)
  const initialResources = marketIntel.resources;

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
