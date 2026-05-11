import { ResearchView, type ResearchPipelineItem } from "@/components/research/ResearchView";
import { createClient } from "@supabase/supabase-js";
import { getResearchItems } from "@/lib/data";

// Note: previous `export const revalidate = 60` removed.
// Per docs/ISR-WRITE-INVESTIGATION.md, /research was the *only* page with
// a working ISR declaration (no cookie reads in its data path), and it
// generated ~200K ISR writes over the prior 30 days. Vercel's edge ISR
// buckets cache entries by the full request envelope (cookies, vary
// headers), so each distinct session cookie produced its own cache
// bucket, each requiring its own 60s revalidation regeneration. Pipeline
// data is not freshness-critical at 60s granularity — pipeline_stage
// updates are daily-or-slower. Going dynamic is correct here.

/**
 * Fetch a slim view of intelligence_items for the Research surface.
 *
 * Uses the pipeline_stage column added in migration 026 (live on remote).
 * Existing rows are backfilled to 'published'; NULL is treated as
 * 'published' by ResearchView's normalizeStage.
 *
 * Returns an empty list if Supabase is not configured or the request
 * fails — the surface degrades to an empty pipeline rather than the
 * page exploding.
 */
async function fetchPipelineItems(): Promise<ResearchPipelineItem[]> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return [];
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Initial paint cap of 100 — keeps wire payload + parse cost light.
    // TODO(perf): wire a "load more" UI cursor so users can fetch
    // beyond the first 100 as the pipeline grows.
    const { data, error } = await supabase
      .from("intelligence_items")
      .select(
        "id, legacy_id, title, summary, pipeline_stage, transport_modes, jurisdictions, added_date, source:sources(name, url)"
      )
      .eq("is_archived", false)
      .order("added_date", { ascending: false })
      .limit(100);

    if (error || !data) {
      console.error("research/page fetchPipelineItems failed:", error);
      return [];
    }

    return data.map((row: any) => {
      const src = Array.isArray(row.source) ? row.source[0] : row.source;
      return {
        id: row.legacy_id || row.id,
        title: row.title || "(untitled)",
        summary: row.summary || "",
        pipelineStage: row.pipeline_stage ?? null,
        transportModes: row.transport_modes || [],
        jurisdictions: row.jurisdictions || [],
        sourceName: src?.name ?? null,
        sourceUrl: src?.url ?? null,
        addedDate: row.added_date ?? null,
        owner: null,
        partnerFlagged: false,
      };
    });
  } catch (e) {
    console.error("research/page fetchPipelineItems failed:", e);
    return [];
  }
}

/**
 * Phase 1 v2 path: hydrate ResearchView from get_research_items
 * (migration 070), the source_role + status driven RPC. Resource shape
 * is mapped down to the legacy ResearchPipelineItem shape so
 * ResearchView is unchanged.
 *
 * Source name is resolved via a single follow-up read on `sources` keyed
 * by sourceId (the routing RPC returns source_id but not source name).
 * Returns [] on any failure (matches the v1 behavior).
 */
async function fetchPipelineItemsV2(): Promise<ResearchPipelineItem[]> {
  try {
    const { resources } = await getResearchItems();
    if (resources.length === 0) return [];

    const sourceIds = Array.from(
      new Set(resources.map((r) => r.sourceId).filter((x): x is string => !!x))
    );

    const sourceLabels = new Map<string, { name: string; url: string }>();
    if (sourceIds.length > 0 &&
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      const { data: srcs } = await supabase
        .from("sources")
        .select("id, name, url")
        .in("id", sourceIds);
      for (const s of (srcs || []) as Array<{ id: string; name: string; url: string }>) {
        sourceLabels.set(s.id, { name: s.name, url: s.url });
      }
    }

    return resources.map((r) => {
      const src = r.sourceId ? sourceLabels.get(r.sourceId) : undefined;
      return {
        id: r.id,
        title: r.title,
        summary: r.note || "",
        // Phase 1 has no item-level pipeline classifier yet; the routing
        // RPC pre-filters to research-flavored items, so default the
        // stage to 'published' (ResearchView's normalize fallback).
        pipelineStage: null,
        transportModes: r.modes || [],
        jurisdictions: r.jurisdiction ? [r.jurisdiction] : [],
        sourceName: src?.name ?? null,
        sourceUrl: src?.url ?? r.url ?? null,
        addedDate: r.added ?? null,
        owner: null,
        partnerFlagged: false,
      };
    });
  } catch (e) {
    console.error("research/page fetchPipelineItemsV2 failed:", e);
    return [];
  }
}

// Phase 1 routing gate (PR feat/phase1-routing-restructure):
//   ?routing=v2 -> source_role + status driven get_research_items RPC
//   default     -> legacy inline anon-key fetcher (no source_role filter)
//
// Default flips to v2 in a follow-up commit on this branch after operator
// preview-deploy confirm. To flip: change `routing === "v2"` to
// `routing !== "v1"` (or equivalent) so v1 becomes the explicit opt-out.
export default async function Research({
  searchParams,
}: {
  searchParams: Promise<{ routing?: string }>;
}) {
  const params = await searchParams;
  const useV2 = params.routing === "v2";
  const t0 = Date.now();
  const items = useV2 ? await fetchPipelineItemsV2() : await fetchPipelineItems();
  console.log(`[perf] /research data ${Date.now() - t0}ms (routing=${useV2 ? "v2" : "v1"})`);
  return <ResearchView items={items} />;
}
