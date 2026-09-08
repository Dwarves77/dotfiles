/**
 * brief-rows — the dashboard's Due-next / What-changed row SELECTION, moved to the server.
 *
 * WHY (lane HYDRATION-59, defects D1 + D3, 2026-09-07). Both row sets used to be derived inside
 * `<DashboardBrief/>` ("use client"), which meant:
 *   - the "nearest deadline" sort and the "N days" label were computed from the CLIENT's clock
 *     during hydration and the SERVER's clock during SSR (the React #418 class — render-now.ts);
 *   - the rows could not be enriched with anything that needs a database read, so every row's
 *     source tier rendered the Absence convention ("not in primary source") while the SAME item
 *     on /regulations rendered its real T1/T2/T3 chip (defect D3).
 *
 * Selecting here, on the server, fixes both: one instant, one row shape (`toListRowFields`,
 * src/lib/list-row-fields.ts — the same derivation the list ledgers use, fallback scorer
 * included), and a row set small enough (≤ DUE_NEXT_CAP + CHANGED_CAP = 11) that the source-chip
 * enrichment /regulations already runs is a BOUNDED read here too (F38/F39): one `.in()` over the
 * distinct source_ids of at most eleven rows, never a corpus-scale fan-out.
 *
 * Pure and clock-injected; `brief-rows.npmtest.mjs` proves the selection and the shared shape.
 */

import type { Resource } from "@/types/resource";
import type { RecentChangeRow } from "@/lib/supabase-server";
import { toListRowFields, watchTypeForItem, type ListRowFields } from "@/lib/list-row-fields";
import { dueInfo } from "@/lib/dashboard/row-fields";
import { itemDetailHref } from "@/lib/item-links";

export const DUE_NEXT_CAP = 5;
export const CHANGED_CAP = 6;

export interface BriefRow extends ListRowFields {
  /** "What changed" only: first seen in this detection pass. */
  isNew?: boolean;
}

/** The items with the nearest future binding date, soonest first, capped. */
export function buildDueNextRows(resources: Resource[], now: Date, cap = DUE_NEXT_CAP): BriefRow[] {
  return resources
    .map((r) => ({ r, due: dueInfo(r, now) }))
    .filter((x): x is { r: Resource; due: NonNullable<ReturnType<typeof dueInfo>> } => x.due != null)
    .sort((a, b) => a.due.daysNum - b.due.daysNum)
    .slice(0, cap)
    .map(({ r }) => toListRowFields(r, now));
}

/**
 * The last detection pass's changed items, de-duplicated, capped.
 *
 * D3: a change row carries only id/title/priority/classification. Where the SAME item is present
 * in the corpus payload this page already loaded, the row is built from that Resource through the
 * shared derivation — so a changed item shows the same score, meta line and tier the list shows.
 * Where it is not (an item outside the loaded slice), the row degrades to what the change feed
 * actually carries and the absent cells render the Absence convention. Nothing is invented.
 */
export function buildChangedRows(
  recentChanges: RecentChangeRow[],
  resources: Resource[],
  now: Date,
  cap = CHANGED_CAP,
): BriefRow[] {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const rows: BriefRow[] = [];
  for (const c of recentChanges) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const r = byId.get(c.id);
    if (r) {
      rows.push({ ...toListRowFields(r, now), isNew: true });
    } else {
      rows.push({
        id: c.id,
        href: itemDetailHref({ id: c.id, type: c.itemType, domain: c.domain } as unknown as Resource),
        priority: String(c.priority ?? ""),
        jurisdiction: "",
        title: c.title,
        meta: "",
        impact: null,
        due: null,
        timeline: null,
        tier: null,
        // ITEM F2: the row still needs a watchlist type for its ⋯ control's Watch toggle, and the
        // change feed carries the same (itemType, domain) pair the href above is built from, so it
        // goes through the SAME classifier rather than defaulting to "reg".
        watchType: watchTypeForItem({ type: c.itemType, domain: c.domain }),
        isNew: true,
      });
    }
    if (rows.length >= cap) break;
  }
  return rows;
}

/**
 * The ≤ (DUE_NEXT_CAP + CHANGED_CAP) Resource objects the two row sets above will actually
 * render, de-duplicated by identity. `src/app/page.tsx` runs the source-chip enrichment over
 * exactly this set (bounded read, F38/F39) BEFORE calling the builders — the builders then read
 * `r.sourceTier` off the same object references and the tier chip resolves.
 */
export function selectBriefResources(
  resources: Resource[],
  recentChanges: RecentChangeRow[],
  now: Date,
): Resource[] {
  const picked = new Map<string, Resource>();
  for (const r of buildDueNextRows(resources, now)) {
    const res = resources.find((x) => x.id === r.id);
    if (res) picked.set(res.id, res);
  }
  const byId = new Map(resources.map((r) => [r.id, r]));
  let n = 0;
  for (const c of recentChanges) {
    if (n >= CHANGED_CAP) break;
    n++;
    const res = byId.get(c.id);
    if (res) picked.set(res.id, res);
  }
  return Array.from(picked.values());
}
