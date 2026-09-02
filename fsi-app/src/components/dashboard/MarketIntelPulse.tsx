/**
 * MarketIntelPulse — the Dashboard's first-class Market Intel block (five-surface rebalance, Lane
 * DASH, 2026-09-02). Server component; async.
 *
 * DATA PATH: getMarketIntelItems() (src/lib/data.ts, unchanged by this lane — already the real
 * fetcher /market itself renders from, get_market_intel_items via fetchMarketIntelItems). Not a new
 * read, not a placeholder: the same verified, category-routed Market Intel population, sliced to
 * its top 3 by priority then recency for the home page. `priceStat` (when a published rate/price
 * row exists) renders in the meta line — never fabricated; omitted, not zero-filled, when absent.
 */

import { getMarketIntelItems } from "@/lib/data";
import { itemDetailHref } from "@/lib/item-links";
import { SurfacePulseCard, type SurfacePulseItem } from "./SurfacePulseCard";
import { rankByPriorityThenRecency, formatShortDate } from "./pulse-shared.mjs";

export async function MarketIntelPulse() {
  const { resources, total } = await getMarketIntelItems();
  const top = rankByPriorityThenRecency(resources).slice(0, 3);

  const items: SurfacePulseItem[] = top.map((r) => ({
    id: r.id,
    href: itemDetailHref(r),
    title: r.title,
    priority: r.priority,
    meta: [r.sourceName, r.priceStat?.valueDisplay ?? null, formatShortDate(r.added)]
      .filter((v): v is string => !!v)
      .join(" · "),
  }));

  return (
    <SurfacePulseCard
      title="Market Intel"
      titleHref="/market"
      countLabel={items.length > 0 ? `${items.length} of ${total}` : undefined}
      items={items}
      emptyBody="No verified Market Intel items yet. Rate bands, carbon-cost overlays and carrier signals for your corridors appear here once the workspace has verified coverage."
      emptyCtaLabel="Open Market Intel →"
      emptyCtaHref="/market"
    />
  );
}
