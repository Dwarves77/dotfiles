// Shared per-row field derivations for the UI system dashboard
// (src/components/dashboard/DashboardBrief.tsx). Extracted so the same
// jurisdiction-code / due-date logic isn't hand-copied — DashboardTopPriority.tsx
// (src/components/home/DashboardTopPriority.tsx) carries its own near-identical
// `jurTag`/`deadlineLabel` pair; that component is pre-existing "This week" UI
// this lane does not touch (out of scope: it belongs to the old HomeSurface body,
// superseded by DashboardBrief on the dashboard route but still mounted by
// /regulations' own glance-list use elsewhere). Consolidating the two onto this
// module is flagged in docs/design/handoff-2026-09-06/DEVIATION-LOG.md as
// follow-up for the lane that retires DashboardTopPriority.

import type { Resource } from "@/types/resource";

// Widened from `Resource` to the two optional fields each function actually reads (CMDSEARCH lane,
// 2026-09-09): the command bar's Standard Search result rows come from a trimmed API payload (id,
// title, item_type, domain, priority, jurisdictions, transport_modes, topic — never the full
// Resource shape a list surface's own fetch returns), so a signature requiring every Resource field
// could not be reused there without either a second copy of this same three-line logic or an unsafe
// cast. Every existing caller already passes a full `Resource`, which satisfies the narrower `Pick`
// type structurally, so this is additive: no existing call site's behavior changes.
export function jurisdictionCode(r: Pick<Resource, "jurisdictionIso" | "jurisdiction">): string {
  const iso = r.jurisdictionIso?.[0];
  if (iso) return iso.toUpperCase();
  if (r.jurisdiction) return r.jurisdiction.toUpperCase();
  return "GLOBAL";
}

export interface DueInfo {
  label: string;
  days: string;
  daysNum: number;
}

/** Nearest future deadline (UTC day math — SSR/hydration-stable, see
 *  DashboardTopPriority's own comment for why UTC). Returns null when the
 *  item carries no future dated deadline. */
export function dueInfo(r: Resource, now: Date = new Date()): DueInfo | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const candidates: string[] = [];
  if (r.complianceDeadline) candidates.push(r.complianceDeadline);
  if (r.timeline) for (const t of r.timeline) if (t.date) candidates.push(t.date);
  let best: number | null = null;
  for (const raw of candidates) {
    const d = new Date(raw + (raw.length === 10 ? "T00:00:00Z" : ""));
    const ms = d.getTime();
    if (Number.isNaN(ms)) continue;
    if (ms < today) continue;
    if (best === null || ms < best) best = ms;
  }
  if (best === null) return null;
  const diff = Math.round((best - today) / 86400000);
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(best);
  return { label, days: `${diff} day${diff === 1 ? "" : "s"}`, daysNum: diff };
}

export interface RecentRegenInfo {
  /** Short formatted date for display, e.g. "Sep 12" (UTC, matching dueInfo's own formatting). */
  label: string;
  /** The raw date portion (YYYY-MM-DD), for callers that want the unformatted fact. */
  iso: string;
}

/**
 * D23 part (d) (defect-fix-plan-2026-09-12.md): whether an item's brief was regenerated within
 * `days` (default 30) of `now`. The Regulations ledger row's "Updated <date>" chip and the detail
 * header's "Brief regenerated <date>" line share this so the two surfaces never disagree about the
 * same item. UTC day math, the same convention `dueInfo` above uses; `now` is REQUIRED (render-now.ts,
 * no `Date.now()`/`new Date()` in a rendered component). Returns null when there is no
 * last_regenerated_at at all, it is outside the window, or it is in the future (a clock skew or bad
 * write, never presented as a recent change).
 */
export function recentRegenInfo(
  lastRegeneratedAt: string | null | undefined,
  now: Date,
  days = 30,
): RecentRegenInfo | null {
  if (!lastRegeneratedAt) return null;
  const ts = new Date(lastRegeneratedAt).getTime();
  if (Number.isNaN(ts)) return null;
  const diffDays = (now.getTime() - ts) / 86400000;
  if (diffDays < 0 || diffDays > days) return null;
  const iso = lastRegeneratedAt.slice(0, 10);
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(ts);
  return { label, iso };
}

/** Meta line for a ListRow: "<type> · <modes> · <topic>" from whatever the
 *  item actually carries — never a fabricated category. Widened parameter, see jurisdictionCode's
 *  header above (same lane, same reason). */
export function metaLine(r: { type?: Resource["type"] | null; modes?: Resource["modes"]; topic?: Resource["topic"] }): string {
  const parts: string[] = [];
  if (r.type) parts.push(String(r.type));
  if (r.modes && r.modes.length) parts.push(r.modes.join(", "));
  if (r.topic) parts.push(r.topic);
  return parts.join(" · ");
}
