/**
 * OperationsPulse — the Dashboard's first-class Operations block (five-surface rebalance, Lane
 * DASH, 2026-09-02). Server component; async.
 *
 * DATA PATH: getOperationsItems() (src/lib/data.ts, unchanged by this lane — already the real
 * fetcher /operations itself uses, get_operations_items via fetchOperationsItems, citation-
 * enriched). Not a new read, not a placeholder: the same verified, category-routed Operations
 * population, sliced to its top 3 by priority then recency for the home page.
 */

import { getOperationsItems } from "@/lib/data";
import { itemDetailHref } from "@/lib/item-links";
import { SurfacePulseCard, type SurfacePulseItem } from "./SurfacePulseCard";
import { rankByPriorityThenRecency, formatShortDate } from "./pulse-shared.mjs";

export async function OperationsPulse() {
  const { resources, total } = await getOperationsItems();
  const top = rankByPriorityThenRecency(resources).slice(0, 3);

  const items: SurfacePulseItem[] = top.map((r) => ({
    id: r.id,
    href: itemDetailHref(r),
    title: r.title,
    priority: r.priority,
    meta: [r.sourceName, formatShortDate(r.added)].filter((v): v is string => !!v).join(" · "),
  }));

  return (
    <SurfacePulseCard
      title="Operations"
      titleHref="/operations"
      countLabel={items.length > 0 ? `${items.length} of ${total}` : undefined}
      items={items}
      emptyBody="No verified Operations items yet. Regional cost, feasibility and infrastructure signals appear here once the workspace has verified coverage."
      emptyCtaLabel="Open Operations →"
      emptyCtaHref="/operations"
    />
  );
}
