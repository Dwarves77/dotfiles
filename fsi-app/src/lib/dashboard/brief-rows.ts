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
 *
 * ── Lane BRIEFDATA, 2026-09-08. THE OPERATOR'S RULING: "do next and whats changed need to stay
 * populated." Three separate causes were between that ruling and the rendered page, and this
 * module is where two of them are answered:
 *
 *   1. THE DEGRADE PATH. `buildChangedRows` resolved each changed item against the corpus payload
 *      the page had loaded, which is `get_workspace_intelligence_dashboard` — LIMIT 50, ordered by
 *      priority band. The change feed is date-windowed and not priority-capped, so the two sets
 *      barely overlap: measured against the live workspace on 2026-09-08, 6 of 6 rendered change
 *      rows were absent from the loaded slice and every one of them took the degrade branch,
 *      rendering UNSCORED / PENDING / not-in-primary-source. The rows are now backfilled by a
 *      bounded `.in()` before they get here (fetchBriefResourcesByIds, supabase-server.ts), and
 *      `page.tsx` merges that backfill into ONE corpus with `mergeBriefCorpus` below. The degrade
 *      branch stays, because an id the corpus genuinely cannot resolve must still render honestly
 *      rather than be dropped or invented — it is now a last resort, not the common path.
 *
 *   2. THE WINDOW. Due next takes items with a FUTURE binding date, nearest first, capped at five.
 *      The card's own aside states a window ("week of Sep 8"), and honouring the ruling without
 *      inventing rows (CLAUDE.md rule 2) means WIDENING the window rather than padding the card:
 *      take the nearest future dates however far out they run, and say so in the card's own label.
 *      `dueNextWindowLabel` below is that label, computed on the server from the rows actually
 *      selected, and threaded to `<DashboardBrief/>` as a prop. Items with NO date are never
 *      admitted; if there are genuinely no future-dated items at all, the card says so and says
 *      which corpus it looked at (`briefCardState` -> "empty").
 */

import type { Resource } from "@/types/resource";
import type { RecentChangeRow } from "@/lib/supabase-server";
import { toListRowFields, watchTypeForItem, type ListRowFields } from "@/lib/list-row-fields";
import { dueInfo } from "@/lib/dashboard/row-fields";
import { itemDetailHref } from "@/lib/item-links";

export const DUE_NEXT_CAP = 5;
export const CHANGED_CAP = 6;

/** Days from `now` past which a Due-next row has left the week the card's aside names. The aside
 *  reads "week of <date>", so a row 7 or more days out is outside the stated window and the label
 *  must say how far the card actually reaches. */
export const DUE_NEXT_STATED_WINDOW_DAYS = 7;

export interface BriefRow extends ListRowFields {
  /** "What changed" only: first seen in this detection pass. */
  isNew?: boolean;
  /** Due-next only: whole days from the render instant to this row's binding date. Carried so the
   *  card's window label is computed from the SELECTED ROWS rather than re-derived from a second
   *  pass over the corpus (which could disagree with what is on screen). */
  dueDays?: number;
}

/**
 * One corpus for both cards: the page's own payload plus the bounded backfill the fetcher read for
 * the rows these cards render (DashboardData.briefResources). De-duplicated by id, payload first,
 * so a row can never be built from two different versions of the same item.
 */
export function mergeBriefCorpus(resources: Resource[], extra: Resource[]): Resource[] {
  const merged: Resource[] = [];
  const seen = new Set<string>();
  for (const r of [...resources, ...extra]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(r);
  }
  return merged;
}

/** The items with the nearest future binding date, soonest first, capped. No date, no row. */
export function buildDueNextRows(resources: Resource[], now: Date, cap = DUE_NEXT_CAP): BriefRow[] {
  return resources
    .map((r) => ({ r, due: dueInfo(r, now) }))
    .filter((x): x is { r: Resource; due: NonNullable<ReturnType<typeof dueInfo>> } => x.due != null)
    .sort((a, b) => a.due.daysNum - b.due.daysNum)
    .slice(0, cap)
    .map(({ r, due }) => ({ ...toListRowFields(r, now), dueDays: due.daysNum }));
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

/**
 * The Due-next card's own window label — the card's EXISTING aside, extended when the rows on
 * screen run past the week it names.
 *
 * The label was `By next binding date · week of <Mon D>`, built in `<DashboardBrief/>` from the
 * server instant. Widening the selection window (see this module's header, cause 2) makes that
 * sentence false the moment the nearest five dates are not all in this week — which is the live
 * case: measured 2026-09-08, the nearest five binding dates in the corpus are Sep 8, Sep 30,
 * Sep 30, Sep 30 and Oct 1. So the label states how far the card actually reaches, in the aside's
 * existing voice (middot-separated clauses, the row's own date formatting), rather than adding a
 * second sentence anywhere.
 *
 * `weekOfLabel` is passed in already formatted so this function stays pure and locale-free; the
 * furthest date is read off the selected rows themselves.
 */
export function dueNextWindowLabel(rows: BriefRow[], weekOfLabel: string): string {
  const base = `By next binding date · week of ${weekOfLabel}`;
  const furthest = rows.reduce<BriefRow | null>(
    (best, r) => (r.dueDays == null ? best : best?.dueDays == null || r.dueDays > best.dueDays ? r : best),
    null,
  );
  if (!furthest || furthest.dueDays == null || furthest.dueDays < DUE_NEXT_STATED_WINDOW_DAYS) return base;
  if (!furthest.due) return base;
  return `${base}, reaching to ${furthest.due.label}`;
}

/**
 * What a brief card must render, as one decision made in one place.
 *
 * WHY THIS IS NOT `rows.length === 0`. Lane rsc503 (train 61) fixed the CAUSE of the production
 * "DUE NEXT · 0 ITEMS" state — a fail-soft empty payload being written into the Next data cache
 * (src/lib/cache/fallback-guard.ts). It did not close the other half: when the read fails RIGHT
 * NOW, both cards still render their honest-empty copy, so "the corpus has nothing due" and "we
 * could not read the corpus" are the same pixels. They are opposite facts and the reader is
 * entitled to know which one they are looking at, which is why "failed" is a state of its own,
 * carrying the reason and a retry — a retry that, since the cache fix, actually re-reads.
 */
export type BriefCardState = "rows" | "empty" | "failed";

export function briefCardState(rowCount: number, fetchError?: string): BriefCardState {
  if (rowCount > 0) return "rows";
  return fetchError ? "failed" : "empty";
}
