// src/lib/sources/source-growth.ts
//
// THE source-growth step — PATH-AGNOSTIC, shared by every brief on every surface (it is NOT a
// Research detail). One step: register cited sources -> record source_citations edges -> COLLAPSE
// SYNDICATION -> compound convergence (independent_citers / highest_citing_tier) -> recompute
// trust_score_citation. This is the load-bearing piece that makes the platform GROW source
// credibility ("the more a source is referenced by good sources, the higher its rating").
//
// REUSE: the trust score itself is the existing engine (computeCitationComponent in trust.ts). The
// genuine NET-NEW vs the existing aggregation is SYNDICATION COLLAPSE: the existing path dedupes by
// distinct citing_source_id, so N trade sites republishing one press release count as N independent
// citers — inflating credibility from a single announcement. The integrity rule (operator-stated):
// one announcement syndicated across N sites = ONE corroboration. aggregateConvergence enforces it.
//
// The pure functions (aggregateConvergence, citationScore) are unit-provable in ISOLATION with no
// DB — that is the gate this build passes BEFORE it is wired into the canonical workflow path.

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCitationComponent } from "@/lib/trust";
import type { TrustMetrics } from "@/types/source";

export interface CitationEdge {
  citer_source_id: string;
  citer_tier: number; // 1 (best authority) .. 7
  /** Citers republishing the SAME underlying announcement share a group key (the origin/press
   *  release). Citers with no group are independent. One group collapses to ONE corroboration. */
  syndication_group?: string | null;
}

export interface ConvergenceMetrics {
  independent_citers: number; // distinct INDEPENDENT corroborators (syndication-collapsed)
  highest_citing_tier: number | null; // best (lowest) tier among independent corroborators
  confirmation_count: number; // one confirmation per independent corroborator
  total_citations: number; // raw edge count (audit only — NOT used for credibility)
}

/**
 * PURE. Collapse syndication, then count distinct independent corroborators + the best citing tier.
 * A syndication group counts ONCE (at its best tier); ungrouped citers count once each.
 */
export function aggregateConvergence(edges: CitationEdge[]): ConvergenceMetrics {
  const unit = new Map<string, number>(); // independent-unit key -> best (min) tier in that unit
  for (const e of edges) {
    const key = e.syndication_group ? `g:${e.syndication_group}` : `s:${e.citer_source_id}`;
    const prev = unit.get(key);
    unit.set(key, prev == null ? e.citer_tier : Math.min(prev, e.citer_tier));
  }
  const independent = unit.size;
  const bestTier = independent ? Math.min(...unit.values()) : null;
  return {
    independent_citers: independent,
    highest_citing_tier: bestTier,
    confirmation_count: independent,
    total_citations: edges.length,
  };
}

/** Trust citation component for these convergence metrics — REUSES trust.ts (no fork). */
export function citationScore(m: ConvergenceMetrics): number {
  const metrics = {
    independent_citers: m.independent_citers,
    highest_citing_tier: m.highest_citing_tier,
    confirmation_count: m.confirmation_count,
    conflict_count: 0,
    total_checks: 0,
    self_citation_count: 0,
  } as unknown as TrustMetrics;
  return computeCitationComponent(metrics);
}

// ── DB side (wired into the canonical workflow path; proven only after the pure core passes) ──

export interface CitedSourceInput {
  name: string;
  url: string;
  tier_estimate?: number | null;
  /** When the source could not be fetched (e.g. Cloudflare), register as a CANDIDATE not a usable
   *  source, recording why so D1's Browserless path can recover it later. */
  rejection_reason?: string | null;
  syndication_group?: string | null;
}

/** Register cited sources: a fetchable source becomes a `sources` row (so it can be cited and
 *  accumulate credibility); a blocked one becomes a `provisional_sources` candidate carrying its
 *  rejection_reason. Returns the resolved source_id per input (null for candidates). Idempotent. */
export async function registerCitedSources(
  supabase: SupabaseClient,
  cited: CitedSourceInput[]
): Promise<Array<{ url: string; source_id: string | null; registered: "existing" | "new_source" | "candidate" }>> {
  const out: Array<{ url: string; source_id: string | null; registered: "existing" | "new_source" | "candidate" }> = [];
  for (const cs of cited) {
    let host = ""; try { host = new URL(cs.url).host; } catch { /* */ }
    const { data: existing } = await supabase.from("sources").select("id").ilike("url", `%${host}%`).limit(1);
    if (existing && existing.length) { out.push({ url: cs.url, source_id: existing[0].id, registered: "existing" }); continue; }
    if (cs.rejection_reason) {
      await supabase.from("provisional_sources").upsert(
        { name: cs.name, url: cs.url, status: "pending_review", notes: `auto-surfaced citation; blocked: ${cs.rejection_reason}` },
        { onConflict: "url" }
      );
      out.push({ url: cs.url, source_id: null, registered: "candidate" });
    } else {
      const { data: ins } = await supabase.from("sources")
        .insert({ name: cs.name, url: cs.url, base_tier: cs.tier_estimate ?? 5, status: "provisional", auto_run_enabled: false })
        .select("id").single();
      out.push({ url: cs.url, source_id: ins?.id ?? null, registered: "new_source" });
    }
  }
  return out;
}

/** Record citation edges (citing source -> each registered cited source). Dedupe is at scoring
 *  time (aggregateConvergence), so edges stay a faithful audit log. */
export async function recordCitations(
  supabase: SupabaseClient,
  citingSourceId: string,
  citedSourceIds: string[],
  context: string
): Promise<number> {
  let n = 0;
  for (const cited of citedSourceIds) {
    if (cited === citingSourceId) continue; // no self-citation
    const { error } = await supabase.from("source_citations").insert({ citing_source_id: citingSourceId, cited_source_id: cited, context });
    if (!error) n++;
  }
  return n;
}
