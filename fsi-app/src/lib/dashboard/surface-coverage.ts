// Per-surface count snapshot for the Dashboard five-surface widget.
//
// Build 11 deliverable. The Dashboard surface has been regulation-skewed
// (per OBS-41 + dead-code disposition B.6) because all four hero tiles
// + the WeeklyBriefing rank Regulations by priority and the other three
// intelligence surfaces + Community are unrepresented in the editorial
// body. This module supplies one server-side fetch that returns a stable
// breakdown across the canonical five customer-facing surfaces.
//
// Surface taxonomy mirrors the page-level scope filters that the
// /market, /research, /operations, /regulations pages already pass to
// get_workspace_intelligence_aggregates_scoped (migration 069):
//   - Regulations: domain = 1 OR item_type IN (regulation, directive,
//                  standard, guidance, framework, law)
//   - Market Intel: item_type IN (technology, innovation, market_signal)
//                   OR domain IN (2, 4)
//   - Research: item_type IN (research_finding)
//   - Operations: item_type = regional_data OR domain IN (3, 6)
//   - Community: not a category-routed intelligence_items query; per
//                source-credibility-model Section 8 Community uses a
//                different data model (groups + memberships + threads).
//                Counted from public.community_groups (active count) +
//                community_memberships (member of) when the workspace
//                has a community footprint. Falls back to zeros when
//                community schema unavailable.
//
// The five subtotals + "uncategorized" are derived so they always sum to
// the workspace-wide totalItems for intelligence content; Community is
// reported alongside as a co-equal surface with its own data shape (the
// count is "active groups in your workspace" + "unread mentions"). The
// dashboard headline shows both the intelligence total and the Community
// activity, transparently labelled so a sharp-eyed user can verify the
// per-surface tiles add up.

import { unstable_cache } from "next/cache";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/supabase-server";
import { APP_DATA_TAG } from "@/lib/data";
import {
  REGULATIONS_DOMAIN,
  MARKET_TECH_DOMAIN,
  MARKET_SIGNALS_DOMAIN,
  OPERATIONS_REGIONAL_DOMAIN,
  OPERATIONS_FACILITY_DOMAIN,
} from "@/lib/domains";

const REGULATION_ITEM_TYPES = new Set([
  "regulation",
  "directive",
  "standard",
  "guidance",
  "framework",
  "law",
]);
const MARKET_ITEM_TYPES = new Set(["technology", "innovation", "market_signal", "initiative"]);
const RESEARCH_ITEM_TYPES = new Set(["research_finding"]);
const OPERATIONS_ITEM_TYPES = new Set(["regional_data"]);

export interface IntelligenceSurfaceCounts {
  regulations: number;
  marketIntel: number;
  research: number;
  operations: number;
  /** Items not classifiable into any of the four routed surfaces. Tracked
   *  explicitly so the four surface counts + uncategorized sum to the
   *  workspace-wide intelligence total (no silent off-by-N). */
  uncategorized: number;
  /** Sum of regulations + marketIntel + research + operations + uncategorized.
   *  By construction equals the workspace's active intelligence_items count. */
  totalIntelligence: number;
}

export interface CommunitySurfaceCounts {
  /** Distinct active groups (private + public) the workspace member belongs to. */
  activeGroups: number;
  /** Unread notifications for the current user (cross-group). */
  unreadNotifications: number;
  /** Mention-kind unread count (subset of unreadNotifications). */
  unreadMentions: number;
}

export interface SurfaceCoverageSnapshot {
  intelligence: IntelligenceSurfaceCounts;
  community: CommunitySurfaceCounts;
}

const EMPTY_INTEL: IntelligenceSurfaceCounts = {
  regulations: 0,
  marketIntel: 0,
  research: 0,
  operations: 0,
  uncategorized: 0,
  totalIntelligence: 0,
};

const EMPTY_COMMUNITY: CommunitySurfaceCounts = {
  activeGroups: 0,
  unreadNotifications: 0,
  unreadMentions: 0,
};

const EMPTY_SNAPSHOT: SurfaceCoverageSnapshot = {
  intelligence: EMPTY_INTEL,
  community: EMPTY_COMMUNITY,
};

interface ScopeItem {
  id: string;
  item_type: string | null;
  domain: number | null;
}

function classifyItem(row: ScopeItem): keyof Omit<IntelligenceSurfaceCounts, "totalIntelligence"> {
  const t = row.item_type;
  const d = row.domain;
  // Regulations wins first; per skill, regulatory item_types or
  // REGULATIONS_DOMAIN always sit on /regulations.
  if (d === REGULATIONS_DOMAIN || (t && REGULATION_ITEM_TYPES.has(t))) return "regulations";
  if (t === "regional_data" || d === OPERATIONS_REGIONAL_DOMAIN || d === OPERATIONS_FACILITY_DOMAIN) return "operations";
  if (t && RESEARCH_ITEM_TYPES.has(t)) return "research";
  if ((t && MARKET_ITEM_TYPES.has(t)) || d === MARKET_TECH_DOMAIN || d === MARKET_SIGNALS_DOMAIN) return "marketIntel";
  return "uncategorized";
}

async function fetchIntelligenceCounts(orgId: string): Promise<IntelligenceSurfaceCounts> {
  if (!isSupabaseConfigured()) return EMPTY_INTEL;
  try {
    const supabase = getServiceSupabase();

    // Pull active item ids + (item_type, domain) for classification. Same
    // active-row scope as 068: items LEFT JOIN this workspace's overrides
    // (archive-after-overrides excluded). Two queries since PostgREST
    // embedded selects with workspace_item_overrides have been finicky
    // here; one for base rows, one for overlay archives.
    const { data: itemsRaw, error: itemsErr } = await supabase
      .from("intelligence_items")
      .select("id, item_type, domain")
      .eq("is_archived", false);
    if (itemsErr) {
      console.error(
        "[dashboard/surface-coverage] intelligence_items fetch error:",
        itemsErr.message
      );
      return EMPTY_INTEL;
    }
    const items = (itemsRaw ?? []) as ScopeItem[];

    const ids = items.map((r) => r.id);
    const overlayArchived = new Set<string>();
    if (ids.length > 0) {
      const { data: ovRaw, error: ovErr } = await supabase
        .from("workspace_item_overrides")
        .select("item_id, is_archived")
        .eq("org_id", orgId)
        .in("item_id", ids);
      if (ovErr) {
        console.error(
          "[dashboard/surface-coverage] overlay fetch error:",
          ovErr.message
        );
      }
      for (const row of (ovRaw ?? []) as Array<{ item_id: string; is_archived: boolean | null }>) {
        if (row.is_archived) overlayArchived.add(row.item_id);
      }
    }

    const counts: IntelligenceSurfaceCounts = { ...EMPTY_INTEL };
    for (const row of items) {
      if (overlayArchived.has(row.id)) continue;
      const bucket = classifyItem(row);
      counts[bucket] += 1;
      counts.totalIntelligence += 1;
    }
    return counts;
  } catch (e) {
    console.error("[dashboard/surface-coverage] fetchIntelligenceCounts failed:", e);
    return EMPTY_INTEL;
  }
}

async function fetchCommunityCounts(orgId: string): Promise<CommunitySurfaceCounts> {
  if (!isSupabaseConfigured()) return EMPTY_COMMUNITY;
  try {
    const supabase = getServiceSupabase();

    // Resolve org users first (one round-trip), then fan out to
    // community_group_members + notifications. Avoiding embedded selects
    // here because the org_memberships → community_group_members → groups
    // chain isn't a clean PostgREST FK alias and per OBS-50 sweep
    // discipline we prefer enumerate-first patterns over join-string
    // guesses.
    const { data: orgUserRowsRaw, error: orgUserErr } = await supabase
      .from("org_memberships")
      .select("user_id")
      .eq("org_id", orgId);
    if (orgUserErr) {
      console.error(
        "[dashboard/surface-coverage] org member lookup error:",
        orgUserErr.message
      );
      return EMPTY_COMMUNITY;
    }
    const userIds = ((orgUserRowsRaw ?? []) as Array<{ user_id: string }>).map(
      (r) => r.user_id
    );

    let activeGroups = 0;
    let unreadNotifications = 0;
    let unreadMentions = 0;

    if (userIds.length === 0) {
      return EMPTY_COMMUNITY;
    }

    // Active groups the workspace's members belong to. Counted as the
    // distinct group_id set in community_group_members whose user_id is
    // one of the org's members. Schema reference: migration 029.
    const { data: cgmRowsRaw, error: cgmErr } = await supabase
      .from("community_group_members")
      .select("group_id")
      .in("user_id", userIds);
    if (cgmErr) {
      console.error(
        "[dashboard/surface-coverage] community_group_members fetch error:",
        cgmErr.message
      );
    } else {
      const groupSet = new Set<string>();
      for (const row of (cgmRowsRaw ?? []) as Array<{ group_id: string }>) {
        if (row.group_id) groupSet.add(row.group_id);
      }
      activeGroups = groupSet.size;
    }

    // Unread + mention counts: aggregate across all org members. This is
    // the workspace-level signal ("X unread across your team") versus the
    // per-user signal that /api/community/notifications/counts powers in
    // the Community sidebar. The dashboard wants the org rollup.
    const { data: notifRowsRaw, error: notifErr } = await supabase
      .from("notifications")
      .select("kind")
      .in("user_id", userIds)
      .is("read_at", null);
    if (notifErr) {
      console.error(
        "[dashboard/surface-coverage] notifications aggregate error:",
        notifErr.message
      );
    } else {
      for (const row of (notifRowsRaw ?? []) as Array<{ kind: string }>) {
        unreadNotifications += 1;
        if (row.kind === "mention") unreadMentions += 1;
      }
    }

    return { activeGroups, unreadNotifications, unreadMentions };
  } catch (e) {
    console.error("[dashboard/surface-coverage] fetchCommunityCounts failed:", e);
    return EMPTY_COMMUNITY;
  }
}

const cachedSurfaceCoverage = unstable_cache(
  async (orgId: string | null): Promise<SurfaceCoverageSnapshot> => {
    if (!orgId) return EMPTY_SNAPSHOT;
    const [intelligence, community] = await Promise.all([
      fetchIntelligenceCounts(orgId),
      fetchCommunityCounts(orgId),
    ]);
    return { intelligence, community };
  },
  ["dashboard-surface-coverage-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Fetch the per-surface coverage snapshot for the dashboard's five-surface
 * widget + reconciled headline counts. Returns empty defaults on any
 * failure so the widget can render placeholder zeros without crashing.
 */
export async function getSurfaceCoverageSnapshot(): Promise<SurfaceCoverageSnapshot> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedSurfaceCoverage(orgId);
  } catch (e) {
    console.error("getSurfaceCoverageSnapshot failed, returning empty:", e);
    return EMPTY_SNAPSHOT;
  }
}
