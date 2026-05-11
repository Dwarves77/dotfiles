import { ResearchView, type ResearchPipelineItem } from "@/components/research/ResearchView";
import { getResearchPipeline, getScopedWorkspaceAggregates } from "@/lib/data";

// Note: previous `export const revalidate = 60` removed.
// Per docs/ISR-WRITE-INVESTIGATION.md, /research was the *only* page with
// a working ISR declaration (no cookie reads in its data path), and it
// generated ~200K ISR writes over the prior 30 days. Going dynamic is
// correct here — the new fetcher reads cookies via the authed Supabase
// server client.

// Research scope: the surface presents the entire pipeline of intelligence
// items (no item_type / domain narrowing, just pipeline_stage filtering on
// the client). Pass an empty filter so the scoped aggregates RPC degrades
// to workspace-wide totals — the same scope the page renders. We still go
// through getScopedWorkspaceAggregates so the cache key is stable and the
// 069 RPC contract is the canonical source.
const RESEARCH_SCOPE = {};

export default async function Research() {
  const t0 = Date.now();
  // Pull the pipeline rows AND scoped aggregates in parallel. The fetcher
  // uses the cookie-aware authed Supabase server client (mirrors
  // /operations and /market) instead of the prior inline anon-key fetcher.
  // `total` reflects the true row count so the page can show "Showing N of M"
  // instead of silently truncating at 100.
  const [pipeline, aggregates] = await Promise.all([
    getResearchPipeline(),
    getScopedWorkspaceAggregates(RESEARCH_SCOPE),
  ]);
  console.log(`[perf] /research data ${Date.now() - t0}ms`);

  // Adapter: ResearchPipelineRow → ResearchPipelineItem (the existing UI
  // shape). owner / partnerFlagged are placeholders preserved from the
  // previous fetcher pending the owner-attribution work.
  const items: ResearchPipelineItem[] = pipeline.rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    pipelineStage: r.pipelineStage,
    transportModes: r.transportModes,
    jurisdictions: r.jurisdictions,
    sourceName: r.sourceName,
    sourceUrl: r.sourceUrl,
    addedDate: r.addedDate,
    owner: null,
    partnerFlagged: false,
  }));

  return (
    <ResearchView
      items={items}
      aggregates={aggregates}
      total={pipeline.total}
      shown={items.length}
      cap={pipeline.cap}
    />
  );
}
