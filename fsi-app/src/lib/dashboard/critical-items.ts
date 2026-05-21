// Workspace-scoped critical-items snapshot for the dashboard masthead.
//
// Replaces the hardcoded "3 inside 14 days, LL97 / FuelEU / CBAM" helper
// copy on DashboardHero with a real query. Per Build 11 brief: surface the
// count + the top-3 items (title + jurisdiction + deadline) so the helper
// copy under the CRITICAL tile is grounded in the workspace's actual data
// instead of a frozen demo string.
//
// "Effective deadline" definition (operator brief uses the term; schema
// does not have a single column with that name). For Build 11 the rank
// uses, in order:
//   1. intelligence_items.compliance_deadline (DATE)
//   2. earliest future entry from item_timelines.milestone_date
//
// Items with no future deadline within the trailing 14-day window are
// excluded. Items priority IN ('CRITICAL','HIGH') with a deadline within
// the next 14 days qualify; CRITICAL ranks above HIGH at the same
// distance.
//
// The query runs through the service-role client because the dashboard
// fetcher path already resolves orgId from cookies upstream. RLS-free
// reads are safe here: the SELECT is scoped to the resolved org_id via
// a separate workspace_item_overrides probe, matching the pattern used in
// fetchWorkspaceAggregates (068) and fetchDashboardData (064).
//
// Cached at the same TTL + tag as the rest of the dashboard payload so
// override mutations refresh the snapshot in lockstep.

import { unstable_cache } from "next/cache";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/supabase-server";
import { APP_DATA_TAG } from "@/lib/data";

const WINDOW_DAYS = 14;
const TOP_N = 3;

export interface CriticalItem {
  id: string;
  title: string;
  jurisdiction: string | null;
  /** ISO date string for the effective deadline (compliance_deadline or
   *  earliest future timeline milestone). */
  deadline: string;
  /** Days from today (UTC). 0 means today; positive means future. */
  daysUntil: number;
  priority: "CRITICAL" | "HIGH";
}

export interface CriticalItemsSnapshot {
  /** Count of items whose effective deadline is within the next WINDOW_DAYS. */
  totalWithinWindow: number;
  /** Top-N preview items, sorted by daysUntil ascending. */
  preview: CriticalItem[];
  /** Window the snapshot describes (in days from today). */
  windowDays: number;
}

const EMPTY_SNAPSHOT: CriticalItemsSnapshot = {
  totalWithinWindow: 0,
  preview: [],
  windowDays: WINDOW_DAYS,
};

function asISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(today: Date, deadline: Date): number {
  const MS_PER_DAY = 86400000;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const d = Date.UTC(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth(),
    deadline.getUTCDate()
  );
  return Math.round((d - t) / MS_PER_DAY);
}

interface ItemRow {
  id: string;
  title: string | null;
  jurisdictions: string[] | null;
  compliance_deadline: string | null;
  priority: string | null;
}

interface OverrideRow {
  item_id: string;
  priority_override: string | null;
  is_archived: boolean | null;
}

interface TimelineRow {
  item_id: string;
  milestone_date: string | null;
}

async function buildSnapshot(orgId: string | null): Promise<CriticalItemsSnapshot> {
  if (!isSupabaseConfigured() || !orgId) return EMPTY_SNAPSHOT;
  try {
    const supabase = getServiceSupabase();

    const today = new Date();
    const horizon = new Date(today.getTime() + WINDOW_DAYS * 86400000);
    const todayIso = asISO(today);
    const horizonIso = asISO(horizon);

    // Pass 1: CRITICAL/HIGH items with a compliance_deadline inside the
    // window. Override priorities apply via a separate overlay lookup.
    const { data: byDeadlineRaw, error: byDeadlineErr } = await supabase
      .from("intelligence_items")
      .select("id, title, jurisdictions, compliance_deadline, priority")
      .eq("is_archived", false)
      .in("priority", ["CRITICAL", "HIGH"])
      .gte("compliance_deadline", todayIso)
      .lte("compliance_deadline", horizonIso);

    if (byDeadlineErr) {
      console.error(
        "[dashboard/critical-items] deadline query error:",
        byDeadlineErr.message
      );
    }
    const byDeadline = (byDeadlineRaw ?? []) as ItemRow[];

    // Pass 2: CRITICAL/HIGH items WITHOUT a compliance_deadline but with
    // an item_timelines milestone inside the window. Catches items whose
    // only deadline lives on the timeline (common for older briefs and
    // timeline-driven enforcement dates).
    const { data: timelineRowsRaw, error: tlErr } = await supabase
      .from("item_timelines")
      .select("item_id, milestone_date")
      .gte("milestone_date", todayIso)
      .lte("milestone_date", horizonIso);

    if (tlErr) {
      console.error(
        "[dashboard/critical-items] timeline query error:",
        tlErr.message
      );
    }
    const timelineRows = (timelineRowsRaw ?? []) as TimelineRow[];

    const earliestByItem = new Map<string, string>();
    for (const row of timelineRows) {
      if (!row.item_id || !row.milestone_date) continue;
      const existing = earliestByItem.get(row.item_id);
      if (!existing || row.milestone_date < existing) {
        earliestByItem.set(row.item_id, row.milestone_date);
      }
    }

    const deadlineIds = new Set(byDeadline.map((r) => r.id));
    const timelineOnlyIds = Array.from(earliestByItem.keys()).filter(
      (id) => !deadlineIds.has(id)
    );

    let timelineItems: ItemRow[] = [];
    if (timelineOnlyIds.length > 0) {
      const { data: tlItemsRaw, error: tiErr } = await supabase
        .from("intelligence_items")
        .select("id, title, jurisdictions, compliance_deadline, priority")
        .in("id", timelineOnlyIds)
        .eq("is_archived", false)
        .in("priority", ["CRITICAL", "HIGH"]);
      if (tiErr) {
        console.error(
          "[dashboard/critical-items] timeline item lookup error:",
          tiErr.message
        );
      }
      timelineItems = (tlItemsRaw ?? []) as ItemRow[];
    }

    // Workspace override overlay for the candidate item ids. Single
    // round-trip; missing rows mean no override (use platform priority +
    // is_archived = false from the base row, already filtered above).
    const candidateIds = Array.from(
      new Set([...byDeadline.map((r) => r.id), ...timelineItems.map((r) => r.id)])
    );
    const overlayByItem = new Map<string, OverrideRow>();
    if (candidateIds.length > 0) {
      const { data: overrideRowsRaw, error: ovErr } = await supabase
        .from("workspace_item_overrides")
        .select("item_id, priority_override, is_archived")
        .eq("org_id", orgId)
        .in("item_id", candidateIds);
      if (ovErr) {
        console.error(
          "[dashboard/critical-items] override lookup error:",
          ovErr.message
        );
      }
      for (const row of (overrideRowsRaw ?? []) as OverrideRow[]) {
        if (row.item_id) overlayByItem.set(row.item_id, row);
      }
    }

    const byId = new Map<string, CriticalItem>();

    const addCandidate = (raw: ItemRow, deadlineStr: string) => {
      const overlay = overlayByItem.get(raw.id);
      if (overlay?.is_archived) return;
      const effPriority = overlay?.priority_override || raw.priority;
      if (effPriority !== "CRITICAL" && effPriority !== "HIGH") return;
      const deadlineDate = new Date(deadlineStr + "T00:00:00Z");
      if (Number.isNaN(deadlineDate.getTime())) return;
      const days = daysBetween(today, deadlineDate);
      if (days < 0 || days > WINDOW_DAYS) return;
      byId.set(raw.id, {
        id: raw.id,
        title: raw.title || "(untitled)",
        jurisdiction: raw.jurisdictions?.[0] || null,
        deadline: deadlineStr,
        daysUntil: days,
        priority: effPriority as "CRITICAL" | "HIGH",
      });
    };

    for (const raw of byDeadline) {
      if (!raw.compliance_deadline) continue;
      addCandidate(raw, raw.compliance_deadline);
    }
    for (const raw of timelineItems) {
      const tlDate = earliestByItem.get(raw.id);
      if (!tlDate) continue;
      addCandidate(raw, tlDate);
    }

    const items = Array.from(byId.values()).sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
      if (a.priority !== b.priority) return a.priority === "CRITICAL" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    return {
      totalWithinWindow: items.length,
      preview: items.slice(0, TOP_N),
      windowDays: WINDOW_DAYS,
    };
  } catch (e) {
    console.error("[dashboard/critical-items] buildSnapshot failed:", e);
    return EMPTY_SNAPSHOT;
  }
}

const cachedCriticalSnapshot = unstable_cache(
  async (orgId: string | null): Promise<CriticalItemsSnapshot> => {
    return buildSnapshot(orgId);
  },
  ["dashboard-critical-items-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Fetch the workspace-scoped critical-items snapshot for the dashboard
 * masthead. Returns empty defaults (count 0, empty preview) on any failure
 * so the caller can render the bare CRITICAL tile without the helper line.
 */
export async function getCriticalItemsSnapshot(): Promise<CriticalItemsSnapshot> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedCriticalSnapshot(orgId);
  } catch (e) {
    console.error("getCriticalItemsSnapshot failed, returning empty:", e);
    return EMPTY_SNAPSHOT;
  }
}
