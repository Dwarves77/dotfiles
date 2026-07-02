// Per-source credibility enrichment for dashboard intelligence-item cards.
//
// Build 11 deliverable: mount the Q9 credibility chip set (tier badge +
// citation count + recency + bias tags) on dashboard intelligence-item
// cards, mirroring the Build 7/8/9 PipelineRow pattern. Suppress chips
// when the underlying value is null/zero per the chip contracts.
//
// Implementation pattern follows Build 8.1 / 8.3 in fetchResearchPipelineRows:
//   1. Caller passes the distinct source_ids that the dashboard top-N is
//      about to render.
//   2. We do one query for source-level tier (base_tier, effective_tier)
//      and one query for source_bias_tags.
//   3. We call get_source_citation_stats RPC for the same source_id set.
//   4. Caller joins by source_id at render time and feeds the credibility
//      components.
//
// The result map is shape-compatible with the existing credibility
// component contract: { tier, citationCount, lastCitedAt, biasTags }.
// Empty results / lookup failure produce nulls so the components suppress
// themselves cleanly.

import { unstable_cache } from "next/cache";
import {
  getServiceSupabase,
  isSupabaseConfigured,
  type SourceCitationStat,
} from "@/lib/supabase-server";
import { APP_DATA_TAG } from "@/lib/data";

export type BiasDim = "funding" | "methodology" | "stakeholder";

export interface SourceCredibilityProfile {
  baseTier: number | null;
  effectiveTier: number | null;
  citationCount: number | null;
  lastCitedAt: string | null;
  biasTags: Array<{ dimension: BiasDim; tag: string; confidence: number | null }>;
}

// A FRESH profile per source — never a shared constant. The mutable `biasTags` array MUST be its own
// object per source: the bias-grouping loop below push()es into it, so a shared array cross-contaminates
// every card. (Do not reintroduce a `const EMPTY_PROFILE` that gets shallow-spread — that WAS the bug.)
function makeEmptyProfile(): SourceCredibilityProfile {
  return {
    baseTier: null,
    effectiveTier: null,
    citationCount: null,
    lastCitedAt: null,
    biasTags: [],
  };
}

export type SourceCredibilityMap = Record<string, SourceCredibilityProfile>;

async function fetchProfiles(sortedKey: string): Promise<SourceCredibilityMap> {
  if (!sortedKey || !isSupabaseConfigured()) return {};
  const sourceIds = sortedKey.split(",").filter(Boolean);
  if (sourceIds.length === 0) return {};

  const out: SourceCredibilityMap = {};
  for (const id of sourceIds) out[id] = makeEmptyProfile();

  try {
    const supabase = getServiceSupabase();

    // 1) Tier (base + effective) per source
    const { data: tierRowsRaw, error: tierErr } = await supabase
      .from("sources")
      .select("id, base_tier, effective_tier")
      .in("id", sourceIds);
    if (tierErr) {
      console.error("[dashboard/credibility] sources tier error:", tierErr.message);
    } else {
      for (const row of (tierRowsRaw ?? []) as Array<{
        id: string;
        base_tier: number | null;
        effective_tier: number | null;
      }>) {
        if (!out[row.id]) continue;
        out[row.id].baseTier = typeof row.base_tier === "number" ? row.base_tier : null;
        out[row.id].effectiveTier =
          typeof row.effective_tier === "number" ? row.effective_tier : null;
      }
    }

    // 2) Citation stats per source via get_source_citation_stats (migration 098)
    const { data: statsRowsRaw, error: statsErr } = await supabase.rpc(
      "get_source_citation_stats",
      { source_ids: sourceIds }
    );
    if (statsErr) {
      console.error("[dashboard/credibility] citation stats error:", statsErr.message);
    } else if (Array.isArray(statsRowsRaw)) {
      for (const s of statsRowsRaw as Array<{
        source_id: string;
        citation_count: number;
        recency: string | null;
      }>) {
        const profile = out[s.source_id];
        if (!profile) continue;
        const stat: SourceCitationStat = {
          count: typeof s.citation_count === "number" ? s.citation_count : 0,
          recency: s.recency ?? null,
        };
        profile.citationCount = stat.count;
        profile.lastCitedAt = stat.recency;
      }
    }

    // 3) Bias tags per source (migration 092)
    const { data: biasRowsRaw, error: biasErr } = await supabase
      .from("source_bias_tags")
      .select("source_id, dimension, tag, confidence")
      .in("source_id", sourceIds);
    if (biasErr) {
      console.error("[dashboard/credibility] source_bias_tags error:", biasErr.message);
    } else {
      for (const row of (biasRowsRaw ?? []) as Array<{
        source_id: string;
        dimension: string;
        tag: string;
        confidence: number | null;
      }>) {
        const profile = out[row.source_id];
        if (!profile) continue;
        const dim = row.dimension as BiasDim;
        if (dim !== "funding" && dim !== "methodology" && dim !== "stakeholder") continue;
        profile.biasTags.push({
          dimension: dim,
          tag: row.tag,
          confidence: typeof row.confidence === "number" ? row.confidence : null,
        });
      }
    }

    return out;
  } catch (e) {
    console.error("[dashboard/credibility] fetchProfiles failed:", e);
    return out;
  }
}

const cachedDashboardCredibility = unstable_cache(
  async (sortedKey: string): Promise<SourceCredibilityMap> => {
    return fetchProfiles(sortedKey);
  },
  ["dashboard-credibility-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Fetch a credibility profile per source for the dashboard top-N items.
 * Empty input or failure returns {} so callers can degrade gracefully.
 */
export async function getDashboardCredibility(
  sourceIds: Array<string | null | undefined>
): Promise<SourceCredibilityMap> {
  try {
    const cleaned = Array.from(
      new Set(
        sourceIds.filter((s): s is string => typeof s === "string" && s.length > 0)
      )
    ).sort();
    if (cleaned.length === 0) return {};
    return await cachedDashboardCredibility(cleaned.join(","));
  } catch (e) {
    console.error("getDashboardCredibility failed, returning empty:", e);
    return {};
  }
}
