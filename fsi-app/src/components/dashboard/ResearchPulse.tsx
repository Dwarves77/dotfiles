/**
 * ResearchPulse — the Dashboard's first-class Research block (five-surface rebalance, Lane DASH,
 * 2026-09-02). Server component; async.
 *
 * DATA PATH: getResearchItems() (src/lib/data.ts, unchanged by this lane — already the real fetcher
 * /research itself uses to build its allow-list, get_research_items via fetchResearchItems). Not a
 * new read, not a placeholder: the same verified, category-routed Research population, sliced to
 * its top 3 by priority then recency for the home page. Source tier renders in the meta line when
 * present (chip-source enrichment already runs inside getResearchItems); never a fabricated figure.
 */

import { getResearchItems } from "@/lib/data";
import { itemDetailHref } from "@/lib/item-links";
import { SurfacePulseCard, type SurfacePulseItem } from "./SurfacePulseCard";
import { rankByPriorityThenRecency, formatShortDate } from "./pulse-shared.mjs";

export async function ResearchPulse() {
  const { resources, total } = await getResearchItems();
  const top = rankByPriorityThenRecency(resources).slice(0, 3);

  const items: SurfacePulseItem[] = top.map((r) => {
    const tier = typeof r.sourceTier === "number" ? `T${Math.max(1, Math.min(7, Math.round(r.sourceTier)))}` : null;
    return {
      id: r.id,
      href: itemDetailHref(r),
      title: r.title,
      priority: r.priority,
      meta: [r.sourceName, tier, formatShortDate(r.added)].filter((v): v is string => !!v).join(" · "),
    };
  });

  return (
    <SurfacePulseCard
      title="Research"
      titleHref="/research"
      countLabel={items.length > 0 ? `${items.length} of ${total}` : undefined}
      items={items}
      emptyBody="No verified Research findings yet. Horizon-scan assessments — what's emerging, who's studying it, how it changes your planning horizon — appear here once the workspace has verified coverage."
      emptyCtaLabel="Open Research →"
      emptyCtaHref="/research"
    />
  );
}
