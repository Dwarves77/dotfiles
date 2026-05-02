import { ResearchView, type ResearchPipelineItem } from "@/components/research/ResearchView";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 60;

/**
 * Fetch a slim view of intelligence_items for the Research surface.
 *
 * Uses the new pipeline_stage column added in migration 026. Existing
 * rows are backfilled to 'published'; NULL is treated as 'published'
 * by ResearchView's normalizeStage.
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

    const { data, error } = await supabase
      .from("intelligence_items")
      .select(
        "id, legacy_id, title, summary, pipeline_stage, transport_modes, jurisdictions, added_date, source:sources(name, url)"
      )
      .eq("is_archived", false)
      .order("added_date", { ascending: false })
      .limit(500);

    if (error || !data) return [];

    return data.map((row: any) => {
      // PostgREST returns embedded relationships as either an object or a
      // single-element array depending on FK inference. Handle both shapes.
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
  const items = await fetchPipelineItems();
  return <ResearchView items={items} />;
}
