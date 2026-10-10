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
//   - Community: carries NO count here (ADR-041, 2026-10-03). Community is a
//                social place, not a source of information, so no
//                Community-derived count, state or aggregate feeds the
//                Dashboard or the nav rail.
//
// The four subtotals + "uncategorized" are derived so they always sum to
// the workspace-wide totalItems for intelligence content, so a sharp-eyed
// user can verify the per-surface tiles add up.

import { unstable_cache } from "next/cache";
import { fetchAllRows, fetchAllByIdChunks } from "@/lib/db/paginate.mjs";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/supabase-server";
import { APP_DATA_TAG } from "@/lib/data";
import { surfaceOf } from "@/lib/surface-of.mjs";

interface IntelligenceSurfaceCounts {
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

export interface SurfaceCoverageSnapshot {
  intelligence: IntelligenceSurfaceCounts;
}

const EMPTY_INTEL: IntelligenceSurfaceCounts = {
  regulations: 0,
  marketIntel: 0,
  research: 0,
  operations: 0,
  uncategorized: 0,
  totalIntelligence: 0,
};

const EMPTY_SNAPSHOT: SurfaceCoverageSnapshot = {
  intelligence: EMPTY_INTEL,
};

interface ScopeItem {
  id: string;
  item_type: string | null;
  domain: number | null;
}

// Fail-soft fallback ONLY: the rail's primary count source is the get_all_surface_counts RPC
// (migration 148); this scan runs when that RPC is absent (pre-apply) or errors. Classification
// delegates to the single SoT surfaceOf (src/lib/surface-of.mjs) so this fallback and the SQL
// surface_of can never disagree (the vocab-drift guard enforces it). surfaceOf returns the canonical
// surface key; only the "market" -> "marketIntel" bucket name differs here.
function classifyItem(row: ScopeItem): keyof Omit<IntelligenceSurfaceCounts, "totalIntelligence"> {
  switch (surfaceOf(row.item_type, row.domain)) {
    case "regulations":
      return "regulations";
    case "market":
      return "marketIntel";
    case "research":
      return "research";
    case "operations":
      return "operations";
    default:
      return "uncategorized";
  }
}

interface SurfaceCountPair {
  verified?: number | null;
  total?: number | null;
}

/**
 * Primary count path: get_all_surface_counts (migration 148) returns {verified,total} per surface in
 * one scan, applying surface_of + the override overlay server-side — so the rail counts the SAME
 * verified population as the surface headers (closes the rail-vs-aggregates leak). Customer rail
 * consumes .verified (ruling 1). Returns null when the RPC is absent (pre-apply) or errors, so the
 * caller fails soft to the classifyItem scan. No behaviour change until the DDL window.
 */
async function fetchIntelligenceCountsViaRpc(
  supabase: ReturnType<typeof getServiceSupabase>,
  orgId: string
): Promise<IntelligenceSurfaceCounts | null> {
  const { data, error } = await supabase.rpc("get_all_surface_counts", { p_org_id: orgId });
  if (error || !data || typeof data !== "object") {
    if (error) {
      console.warn(
        "[dashboard/surface-coverage] get_all_surface_counts unavailable, using fallback scan:",
        error.message
      );
    }
    return null;
  }
  const obj = data as Record<string, SurfaceCountPair>;
  const verified = (key: string): number => {
    const v = obj[key]?.verified;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  const counts: IntelligenceSurfaceCounts = {
    regulations: verified("regulations"),
    marketIntel: verified("market"),
    research: verified("research"),
    operations: verified("operations"),
    uncategorized: verified("uncategorized"),
    totalIntelligence: 0,
  };
  counts.totalIntelligence =
    counts.regulations +
    counts.marketIntel +
    counts.research +
    counts.operations +
    counts.uncategorized;
  return counts;
}

async function fetchIntelligenceCounts(orgId: string): Promise<IntelligenceSurfaceCounts> {
  if (!isSupabaseConfigured()) return EMPTY_INTEL;
  try {
    const supabase = getServiceSupabase();

    // Primary path: the single-scan RPC. Fail-soft to the classifyItem scan below on absent/error.
    const viaRpc = await fetchIntelligenceCountsViaRpc(supabase, orgId);
    if (viaRpc) return viaRpc;

    // Pull active item ids + (item_type, domain) for classification. Same
    // active-row scope as 068: items LEFT JOIN this workspace's overrides
    // (archive-after-overrides excluded). Two queries since PostgREST
    // embedded selects with workspace_item_overrides have been finicky
    // here; one for base rows, one for overlay archives.
    // PAGINATED (case-file 9): the verified corpus can exceed 1000 rows; a truncated read here would bias the
    // dashboard five-surface counts (this fallback only fires when get_all_surface_counts is absent/errors).
    let items: ScopeItem[];
    try {
      items = (await fetchAllRows((from, to) =>
        supabase
          .from("intelligence_items")
          .select("id, item_type, domain")
          .eq("is_archived", false)
          .eq("provenance_status", "verified") // Sprint 4 task 1.10: customer read gate
          .order("id", { ascending: true })
          .range(from, to)
      )) as ScopeItem[];
    } catch (e: unknown) {
      console.error("[dashboard/surface-coverage] intelligence_items fetch error:", e instanceof Error ? e.message : e);
      return EMPTY_INTEL;
    }

    // ids is the whole corpus (every verified, non-archived intelligence_items row — fetchAllRows
    // above already pages PAST 1000), so it is corpus-scaled with no cap. Chunked via
    // fetchAllByIdChunks (src/lib/db/paginate.mjs), never a single .in(), IN-CHUNK class (2026-09-06).
    const ids = items.map((r) => r.id);
    const overlayArchived = new Set<string>();
    if (ids.length > 0) {
      const ovRaw = await fetchAllByIdChunks(ids, async (slice) => {
        const { data, error } = await supabase
          .from("workspace_item_overrides")
          .select("item_id, is_archived")
          .eq("org_id", orgId)
          .in("item_id", slice);
        if (error) {
          console.error(
            "[dashboard/surface-coverage] overlay fetch error:",
            error.message
          );
          return [];
        }
        return data ?? [];
      });
      for (const row of ovRaw as Array<{ item_id: string; is_archived: boolean | null }>) {
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

const cachedSurfaceCoverage = unstable_cache(
  async (orgId: string | null): Promise<SurfaceCoverageSnapshot> => {
    if (!orgId) return EMPTY_SNAPSHOT;
    const intelligence = await fetchIntelligenceCounts(orgId);
    return { intelligence };
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
