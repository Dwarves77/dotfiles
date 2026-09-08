/**
 * toListRowFields — THE one derivation of a `<ListRow/>`'s field set from a `Resource`.
 *
 * WHY THIS EXISTS (lane HYDRATION-59, defect D3, 2026-09-07). Two code paths were building the
 * same row and disagreeing about it:
 *
 *   - the list ledgers (`RegulationsLedger.tsx`) built `impact: r.impactScores ?? scoreResource(r)`
 *     — i.e. they fall back to the pure, deterministic scorer when the row carries no stored score;
 *   - the dashboard (`DashboardBrief.tsx`) passed `impact={r.impactScores}` bare, with no fallback,
 *     and `impact={null}` outright for every "What changed" row.
 *
 * There is NO stored `impact_scores` column anywhere in this schema — `supabase-server.ts`'s own
 * watchlist mapper states it verbatim ("every other list surface computes it client-side via
 * scoreResource()"), so `r.impactScores` is undefined on EVERY row of every RPC. The ledger's
 * fallback is therefore the path that always runs, and the dashboard's missing fallback is why the
 * same item read "6/12" on /regulations and "UNSCORED" on the dashboard on the same load.
 * [CONFIRMED, code read + the mapper's own comment, 2026-09-07.]
 *
 * The tier half of the same defect is a DATA-path difference, not a derivation one, and is fixed
 * where it belongs: `/regulations` runs `enrichCategoryRows` over its rows (source name + effective
 * tier, one bounded `.in()` by distinct source_id) and the dashboard's `getAppData` never did.
 * `src/app/page.tsx` now runs the SAME enrichment over ONLY the ≤11 rows it actually renders — see
 * `enrichRowSourceChips` in supabase-server.ts.
 *
 * This module is pure and isomorphic (no clock of its own: `now` is always passed in — see
 * src/lib/render-now.ts), so the server can build a row set and the client can render it, or a
 * client ledger can build its own, and the two can never diverge again.
 */

import type { Resource, ImpactScores, TimelineEntry } from "@/types/resource";
import { scoreResource } from "@/lib/scoring";
import { dueInfo, jurisdictionCode, metaLine } from "@/lib/dashboard/row-fields";
import { itemDetailHref } from "@/lib/item-links";

/** The serialisable field set a `<ListRow/>` needs. `band` is carried as the stored platform
 *  priority (not a UrgencyBand object) so this shape crosses the server/client boundary as plain
 *  JSON; the renderer maps it with `bandFromPriority`. */
export interface ListRowFields {
  id: string;
  href: string;
  priority: string;
  jurisdiction: string;
  title: string;
  meta: string;
  impact: ImpactScores | null;
  due: { label: string; days: string } | null;
  timeline: TimelineEntry[] | null;
  tier: number | null;
}

/**
 * One row's fields. `now` is REQUIRED — a caller that has no server instant to hand is a caller
 * that would reintroduce the #418 class (render-now.ts).
 */
export function toListRowFields(r: Resource, now: Date): ListRowFields {
  const due = dueInfo(r, now);
  return {
    id: r.id,
    href: itemDetailHref(r),
    priority: String(r.priority ?? ""),
    jurisdiction: jurisdictionCode(r),
    title: r.title,
    meta: metaLine(r),
    // The ledger's own fallback, now shared rather than re-typed per surface. `scoreResource` is
    // pure and deterministic over fields the row always carries (type/priority/tags/cat).
    impact: r.impactScores ?? scoreResource(r),
    due: due ? { label: due.label, days: due.days } : null,
    timeline: r.timeline ?? null,
    tier: r.sourceTier ?? null,
  };
}
