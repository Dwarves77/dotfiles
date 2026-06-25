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
import { hostOf, hostInstitution, buildResolver, type SourceRow } from "@/lib/sources/institution";
import { defaultTierForHost } from "@/lib/sources/host-authority";

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
      const tier = cs.tier_estimate ?? 5;
      const { data: ins, error: insErr } = await supabase.from("sources")
        .insert({ name: cs.name, url: cs.url, base_tier: tier, tier_at_creation: tier, status: "provisional", auto_run_enabled: false })
        .select("id").single();
      if (insErr) { console.warn(`[source-growth] register failed for ${cs.url}: ${insErr.message}`); out.push({ url: cs.url, source_id: null, registered: "candidate" }); continue; }
      out.push({ url: cs.url, source_id: ins?.id ?? null, registered: "new_source" });
    }
  }
  return out;
}

/** Record citation edges. Each corroborating source (citing) -> the subject source (cited).
 *  IDEMPOTENT: an edge already present (same citing+cited pair) is skipped, so regenerating a brief
 *  does not duplicate the audit log. (Convergence scoring dedups too, but the edge log must stay
 *  faithful across re-gens.) The syndication group (when known) is stored in `context`. */
export async function recordCitations(
  supabase: SupabaseClient,
  edges: Array<{ citing_source_id: string; cited_source_id: string; syndication_group?: string | null }>
): Promise<number> {
  let n = 0;
  for (const e of edges) {
    if (e.citing_source_id === e.cited_source_id) continue; // no self-citation
    const { data: existing } = await supabase.from("source_citations")
      .select("id").eq("citing_source_id", e.citing_source_id).eq("cited_source_id", e.cited_source_id).limit(1);
    if (existing && existing.length) continue; // edge already recorded — idempotent re-gen
    const context = e.syndication_group ? `syndication:${e.syndication_group}` : "brief-citation";
    const { error } = await supabase.from("source_citations").insert({ citing_source_id: e.citing_source_id, cited_source_id: e.cited_source_id, context });
    if (!error) n++;
  }
  return n;
}

/** Parse the brief's `# New Sources Identified` table into corroborating-source inputs. A row whose
 *  text mentions a block (cloudflare/blocked/403/captcha) is flagged with a rejection_reason so it
 *  registers as a candidate, not a usable citer. */
export function parseNewSourcesFromBrief(brief: string): CitedSourceInput[] {
  if (!brief) return [];
  const m = brief.match(/#+\s*New Sources Identified[\s\S]*?(?=\n#+\s|\s*$)/i);
  if (!m) return [];
  const out: CitedSourceInput[] = [];
  for (const line of m[0].split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((s) => s.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const urlCell = cells.find((c) => /https?:\/\//.test(c));
    if (!urlCell) continue; // header / separator row
    const url = (urlCell.match(/https?:\/\/[^\s)|]+/) || [])[0];
    if (!url) continue;
    const name = cells[0].replace(/\*+/g, "");
    if (/^source name$/i.test(name)) continue; // header
    const tierCell = cells.find((c) => /^\(?[1-7]\)?$/.test(c));
    const tier = tierCell ? parseInt(tierCell.replace(/\D/g, ""), 10) : 5;
    const blocked = /cloudflare|blocked|\b403\b|captcha|access denied/i.test(line);
    out.push({ name, url, tier_estimate: tier, rejection_reason: blocked ? "cloudflare_block" : null });
  }
  return out;
}

/** Read all citation edges for a CITED (subject) source, recompute convergence with syndication
 *  collapse, and write the convergence fields + trust_score_citation back. Returns before/after. */
export async function compoundSourceCredibility(
  supabase: SupabaseClient,
  citedSourceId: string
): Promise<{ before: { independent_citers: number; trust_score_citation: number }; after: ConvergenceMetrics & { trust_score_citation: number } }> {
  const { data: pre } = await supabase.from("sources").select("independent_citers, trust_score_citation").eq("id", citedSourceId).single();
  const { data: cits } = await supabase.from("source_citations").select("citing_source_id, context").eq("cited_source_id", citedSourceId);
  const citerIds = Array.from(new Set((cits ?? []).map((r) => r.citing_source_id)));
  const { data: citers } = await supabase.from("sources").select("id, base_tier, effective_tier").in("id", citerIds.length ? citerIds : ["00000000-0000-0000-0000-000000000000"]);
  const tierById = new Map((citers ?? []).map((s) => [s.id, (s.effective_tier ?? s.base_tier) as number]));
  const edges: CitationEdge[] = (cits ?? []).map((r) => ({
    citer_source_id: r.citing_source_id,
    citer_tier: tierById.get(r.citing_source_id) ?? 7,
    syndication_group: typeof r.context === "string" && r.context.startsWith("syndication:") ? r.context.slice("syndication:".length) : null,
  }));
  const conv = aggregateConvergence(edges);
  const score = citationScore(conv);
  await supabase.from("sources").update({
    independent_citers: conv.independent_citers,
    highest_citing_tier: conv.highest_citing_tier,
    confirmation_count: conv.confirmation_count,
    total_citations: conv.total_citations,
    trust_score_citation: score,
  }).eq("id", citedSourceId);
  return {
    before: { independent_citers: pre?.independent_citers ?? 0, trust_score_citation: Number(pre?.trust_score_citation ?? 0) },
    after: { ...conv, trust_score_citation: score },
  };
}

/** Register the item's GROUNDING-POOL corroborator hosts (agent_run_searches) that are not yet in the
 *  registry, BEFORE grounding, so a FACT span stamped against a pool corroborator resolves to a real
 *  tier the authority floor can EVALUATE — instead of NULL, which escapes the floor entirely (the
 *  sub-floor-masking defect: 1034 FACT claims hidden behind NULL). The brief-cited path
 *  (registerCitedSources) only covers hosts in the brief's "New Sources Identified" table; grounding
 *  stamps spans against the WIDER pool, so non-cited pool hosts NULL-stamped. We register ONE
 *  PROVISIONAL row per NULL-resolving institution at its source-TYPE default tier (defaultTierForHost:
 *  enacted/legal -> T1, gov/official -> T2, else sub-floor) — NOT scanned (auto_run_enabled false),
 *  registered only so the resolver gives the span a tier. Idempotent: institutions that already
 *  resolve are skipped (no new row, no one-tier-per-host churn). Go-forward fix; reduces NEW NULL-stamps. */
export async function registerPoolHostsForGrounding(
  supabase: SupabaseClient,
  itemId: string,
): Promise<{ registered: number; institutions: number }> {
  const { data: pool } = await supabase
    .from("agent_run_searches").select("result_url").eq("intelligence_item_id", itemId);
  if (!pool?.length) return { registered: 0, institutions: 0 };
  // ALL sources (paginate past the 1000-row PostgREST cap) -> institution-keyed resolver.
  const sources: SourceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("sources")
      .select("id,url,base_tier,effective_tier,tier_override").order("id").range(from, from + 999);
    if (!data?.length) break;
    sources.push(...(data as SourceRow[]));
    if (data.length < 1000) break;
  }
  const resolver = buildResolver(sources);
  const seen = new Set<string>();
  const toRegister: CitedSourceInput[] = [];
  for (const r of pool) {
    const url = (r as { result_url: string | null }).result_url;
    if (!url) continue;
    const inst = hostInstitution(hostOf(url));
    if (!inst || seen.has(inst)) continue;
    if (resolver.resolveSpan(url).tier != null) continue; // institution already resolves — no action
    seen.add(inst);
    toRegister.push({ name: inst, url, tier_estimate: defaultTierForHost(hostOf(url)) });
  }
  if (!toRegister.length) return { registered: 0, institutions: 0 };
  const out = await registerCitedSources(supabase, toRegister);
  return { registered: out.filter((o) => o.registered === "new_source").length, institutions: toRegister.length };
}

/** THE source-growth step end-to-end: parse the brief's surfaced sources, register each as a
 *  corroborating source (or blocked candidate), record citation edges (corroborator -> subject),
 *  and compound the SUBJECT source's credibility. citedSourceId = the brief item's own source. */
export async function growSourcesFromBrief(
  supabase: SupabaseClient,
  citedSourceId: string,
  brief: string
): Promise<{ registered: Array<{ url: string; source_id: string | null; registered: string }>; citationsRecorded: number; compound: Awaited<ReturnType<typeof compoundSourceCredibility>> }> {
  const cited = parseNewSourcesFromBrief(brief);
  const registered = await registerCitedSources(supabase, cited);
  const edges = registered
    .filter((r) => r.source_id) // candidates (blocked) cannot cite yet
    .map((r) => ({ citing_source_id: r.source_id as string, cited_source_id: citedSourceId }));
  const citationsRecorded = await recordCitations(supabase, edges);
  const compound = await compoundSourceCredibility(supabase, citedSourceId);
  return { registered, citationsRecorded, compound };
}
