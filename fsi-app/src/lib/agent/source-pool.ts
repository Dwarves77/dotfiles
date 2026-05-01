// Per-item source-pool builder for /api/agent/run.
//
// Picks up to 40 sources most relevant to a given intelligence item, ranked
// by topical match × tier authority × trust score. The static "first 40
// active sources" pool used during the B.2 pilot put the same generic pool
// in front of every item, which is one reason 3 of 10 pilot items emitted
// empty sources_used: the registry didn't surface anything topically aligned.
//
// Selection logic (in order of importance):
//   1. The item's primary source (item.source_id) is always included if
//      present and active. Top of pool.
//   2. Sources whose `domains` array contains the item's `domain` ID.
//   3. Sources whose `jurisdictions` array overlaps the item's
//      `jurisdictions`, OR contains "global" (always-relevant).
//   4. Sources whose `topic_tags` array overlaps the item's `topic_tags`.
//
// Each match contributes a positive score; sources matching all three (after
// domain) score highest. Within the matched set, secondary sort is by tier
// ASC (T1 first) then trust_score_overall DESC. Cap the result at 40.
//
// If filtering produces fewer than ~10 sources (rare, e.g., a niche
// jurisdiction with no matching registry coverage), backfill with general
// global high-tier sources up to 40 so the agent always has *some* registry
// pool to draw on.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PoolSource {
  id: string;
  url: string;
  name: string;
  description: string;
  tier: number;
  trust_score_overall: number;
}

export interface PoolItem {
  id: string;
  source_id?: string | null;
  domain?: number | null;
  jurisdictions?: string[] | null;
  topic_tags?: string[] | null;
}

interface ScoredSource extends PoolSource {
  score: number;
  reasons: string[];
}

const POOL_CAP = 40;
const MIN_RELEVANT = 10;

export async function buildSourcePool(
  supabase: SupabaseClient,
  item: PoolItem
): Promise<{ sources: PoolSource[]; pool_size: number; primary_included: boolean; reason_breakdown: Record<string, number> }> {
  // Pull every active, workspace-visible source. The pool selection runs
  // client-side after this single query — registry size is currently <200
  // rows so over-the-wire cost is trivial.
  const { data: rows, error } = await supabase
    .from("sources")
    .select("id, url, name, description, tier, trust_score_overall, domains, jurisdictions, topic_tags")
    .eq("status", "active")
    .eq("admin_only", false);

  if (error || !rows) {
    throw new Error(`Failed to load source pool: ${error?.message || "no rows"}`);
  }

  const itemDomain = item.domain ?? null;
  const itemJurisdictions = new Set(item.jurisdictions || []);
  const itemTopics = new Set(item.topic_tags || []);

  // Score each source against the item.
  const scored: ScoredSource[] = [];
  for (const r of rows as any[]) {
    const reasons: string[] = [];
    let score = 0;

    if (itemDomain != null && Array.isArray(r.domains) && r.domains.includes(itemDomain)) {
      score += 3;
      reasons.push(`domain ${itemDomain}`);
    }
    if (Array.isArray(r.jurisdictions) && r.jurisdictions.some((j: string) => itemJurisdictions.has(j))) {
      score += 2;
      reasons.push("jurisdiction overlap");
    } else if (Array.isArray(r.jurisdictions) && r.jurisdictions.includes("global")) {
      score += 1;
      reasons.push("global");
    }
    if (Array.isArray(r.topic_tags) && r.topic_tags.some((t: string) => itemTopics.has(t))) {
      score += 2;
      reasons.push("topic overlap");
    }

    if (score > 0) {
      scored.push({
        id: r.id,
        url: r.url,
        name: r.name,
        description: r.description || "",
        tier: r.tier,
        trust_score_overall: r.trust_score_overall || 0,
        score,
        reasons,
      });
    }
  }

  // Sort: score DESC, tier ASC, trust_score DESC
  scored.sort((a, b) => b.score - a.score || a.tier - b.tier || b.trust_score_overall - a.trust_score_overall);

  // Backfill if topical pool is sparse: take additional T1-T3 global/regulator
  // sources to fill up to MIN_RELEVANT, then cap at POOL_CAP.
  if (scored.length < MIN_RELEVANT) {
    const haveIds = new Set(scored.map((s) => s.id));
    const fillers = (rows as any[])
      .filter((r) => !haveIds.has(r.id) && r.tier <= 3)
      .map((r) => ({
        id: r.id, url: r.url, name: r.name, description: r.description || "",
        tier: r.tier, trust_score_overall: r.trust_score_overall || 0,
        score: 0, reasons: ["filler-low-tier"],
      }))
      .sort((a, b) => a.tier - b.tier || b.trust_score_overall - a.trust_score_overall);
    scored.push(...fillers.slice(0, MIN_RELEVANT - scored.length));
  }

  let pool = scored.slice(0, POOL_CAP);

  // Primary source guarantee: if item.source_id exists and isn't already in the
  // pool, prepend it (drop the lowest-ranked entry to keep cap at 40).
  let primaryIncluded = false;
  if (item.source_id) {
    const already = pool.find((p) => p.id === item.source_id);
    if (already) {
      primaryIncluded = true;
    } else {
      const primary = (rows as any[]).find((r) => r.id === item.source_id);
      if (primary) {
        pool = [
          {
            id: primary.id, url: primary.url, name: primary.name, description: primary.description || "",
            tier: primary.tier, trust_score_overall: primary.trust_score_overall || 0,
            score: 99, reasons: ["primary-source"],
          } as ScoredSource,
          ...pool,
        ].slice(0, POOL_CAP);
        primaryIncluded = true;
      }
    }
  }

  // Reason breakdown for diagnostics
  const reasonBreakdown: Record<string, number> = {};
  for (const s of pool) {
    for (const reason of (s as ScoredSource).reasons || []) {
      reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
    }
  }

  return {
    sources: pool.map((s) => ({
      id: s.id, url: s.url, name: s.name, description: s.description,
      tier: s.tier, trust_score_overall: s.trust_score_overall,
    })),
    pool_size: pool.length,
    primary_included: primaryIncluded,
    reason_breakdown: reasonBreakdown,
  };
}
