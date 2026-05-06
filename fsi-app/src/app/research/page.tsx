import { ResearchView, type ResearchPipelineItem } from "@/components/research/ResearchView";
import { createClient } from "@supabase/supabase-js";

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

export default async function Research() {
  const t0 = Date.now();
  const items = await fetchPipelineItems();
  console.log(`[perf] /research data ${Date.now() - t0}ms`);
  return <ResearchView items={items} />;
}
