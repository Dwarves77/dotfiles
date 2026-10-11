import type { Resource, ChangeLogEntry } from "@/types/resource";
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
  /** "What changed" only (D23, migration 319): the item changed without being newly added - a
   *  regenerated brief or a newly recorded timeline, never a fresh mint. Mutually exclusive with
   *  `isNew` (a row is exactly one of the two, per computeChangeLabel's own precedence). */
  isUpdated?: boolean;
  /** "What changed"/updated rows only: the item_changelog `field` that produced the update
   *  ("full_brief" | "timeline"), read from the SAME changelog map fetchChangelog already builds
   *  for the item (its newest entry, since that read is ordered change_date DESC) - chooses
   *  "brief regenerated" vs "timeline added" in the row label without a second query. */
  updatedField?: string;
  /** "What changed" only: the date of the underlying change (change_date for an updated row,
   *  added_date for a new one) - carried so the row label can show it without a second lookup. */
  changeDate?: string;
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
 *
 * D23 (migration 319, defect-fix-plan-2026-09-12.md): the feed now also carries UPDATED items (a
 * regenerated brief, a backfilled timeline), never only newly minted ones. `c.changeKind` decides
 * `isNew` vs `isUpdated`; a row absent `changeKind` (a pre-319 database, or an older cached
 * payload) reads as `isNew`, the only meaning this feed carried before, so nothing regresses.
 * `changelogByItemId` (fetchChangelog's own map, already built for the item detail rail) supplies
 * the updated field ("full_brief" or "timeline") for the row's label; its own read is ordered
 * change_date DESC, so index 0 is the item's newest change.
 */
export function buildChangedRows(
  recentChanges: RecentChangeRow[],
  resources: Resource[],
  now: Date,
  cap = CHANGED_CAP,
  changelogByItemId: Record<string, ChangeLogEntry[]> = {},
): BriefRow[] {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const rows: BriefRow[] = [];
  for (const c of recentChanges) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const isUpdated = c.changeKind === "updated";
    const changeDate = c.changeDate ?? c.added ?? undefined;
    const updatedField = isUpdated ? changelogByItemId[c.id]?.[0]?.fields?.[0] : undefined;
    const r = byId.get(c.id);
    if (r) {
      rows.push({ ...toListRowFields(r, now), isNew: !isUpdated, isUpdated, changeDate, updatedField });
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
        // Lane P2: the grade the follow-up read supplied, when it did; never a guess.
        ...(c.itemGrade ? { itemGrade: c.itemGrade } : {}),
        // ITEM F2: the row still needs a watchlist type for its ⋯ control's Watch toggle, and the
        // change feed carries the same (itemType, domain) pair the href above is built from, so it
        // goes through the SAME classifier rather than defaulting to "reg".
        watchType: watchTypeForItem({ type: c.itemType, domain: c.domain }),
        isNew: !isUpdated,
        isUpdated,
        changeDate,
        updatedField,
      });
    }
    if (rows.length >= cap) break;
  }
  return rows;
}

/**
 * The "What changed" row's own kind + date prefix, computed once here so DashboardBrief.tsx never
 * re-derives the D23 label vocabulary inline (defect-fix-plan-2026-09-12.md part (b)): "NEW · first
 * seen this pass" for a new row, "UPDATED · brief regenerated <date>" for a regenerated brief,
 * "UPDATED · timeline added <date>" for a backfilled timeline. Null for a row that is neither (the
 * Due-next rows this same module builds never carry isNew/isUpdated).
 */
export function changeRowPrefix(
  row: Pick<BriefRow, "isNew" | "isUpdated" | "updatedField" | "changeDate">,
): string | null {
  if (row.isNew) return "NEW · first seen this pass";
  if (row.isUpdated) {
    const what = row.updatedField === "timeline" ? "timeline added" : "brief regenerated";
    return row.changeDate ? `UPDATED · ${what} ${row.changeDate}` : `UPDATED · ${what}`;
  }
  return null;
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

/**
 * The What-changed card's own "Detection pass <date>" header — computed from the SAME rows the
 * card renders, never from a second, unrelated source.
 *
 * WHY THIS EXISTS (lane CHANGEDATA, 2026-09-09, defect C). `supabase-server.ts` used to compute
 * this date by taking the newest `item_changelog` row FIRST, falling back to the newest
 * `recentChanges[].added` only when `item_changelog` was empty. On the live workspace
 * `item_changelog` holds 9 rows and every one of them is dated 2026-03-01 [CONFIRMED, measured
 * 2026-09-09] — a frozen, unrelated table — so that branch order meant the header could NEVER
 * read anything but "2026-03-01", no matter how recent the actual detected changes were. The
 * card's own rows and its own foot ("All N changes in the last 7 days") are built from
 * `get_workspace_recent_changes(org, 7)`, which is a real, moving 7-day `added_date` window — so
 * the header and the rows beneath it were two different facts wearing one card. A row can
 * legitimately say "NEW · first seen this pass" while the header claims the pass was six months
 * ago, and the foot's "last 7 days" then contradicts the header outright.
 *
 * The fix is precedence, not a new source: the rows actually on screen (`recentChanges`) are the
 * primary evidence for "when did the pass that produced THESE rows run" — `item_changelog` is
 * now only the fallback for the honest case where the workspace has no recent changes at all but
 * does carry an older changelog entry. Nothing is invented; the empty-string "No detection pass
 * on record" case is unchanged.
 *
 * D23 (migration 319): a row's `changeDate` (added_date for a new item, item_changelog.change_date
 * for an updated one) is the more precise fact and wins when present; `added` stays the fallback
 * for a row built before 319 shipped (or a stale cached payload), so no existing caller regresses.
 */
export function computeAuditDate(
  recentChanges: Array<{ added?: string | null; changeDate?: string | null }>,
  changelogDates: Array<string | null | undefined>,
): string {
  let auditDate = "";
  for (const c of recentChanges) {
    const d = c.changeDate ?? c.added;
    if (d && d > auditDate) auditDate = d;
  }
  if (auditDate) return auditDate;
  for (const d of changelogDates) {
    if (d && d > auditDate) auditDate = d;
  }
  return auditDate;
}
