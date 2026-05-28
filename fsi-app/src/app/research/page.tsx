import { ResearchView, type ResearchPipelineItem } from "@/components/research/ResearchView";
import {
  getResearchItems,
  getResearchPipeline,
  getResearchSourceCoverage,
  getScopedWorkspaceAggregates,
} from "@/lib/data";

// Sprint 3 (2026-05-27): force-dynamic per /community precedent. Static
// generation at build time has no cookies; resolveOrgIdFromCookies
// returns null; runCategoryRpc early-returns empty (supabase-server.ts
// :1018-1020); static HTML bakes in pipeline=0 and category-routed=0.
// Force-dynamic skips static generation so the page renders on request
// with the user's cookie-auth context.
//
// Note: previous `export const revalidate = 60` removed.
// Per docs/ISR-WRITE-INVESTIGATION.md, /research was the *only* page with
// a working ISR declaration (no cookie reads in its data path), and it
// generated ~200K ISR writes over the prior 30 days. Going dynamic is
// correct here — the new fetcher reads cookies via the authed Supabase
// server client.
export const dynamic = "force-dynamic";

// Research scope: the surface presents the horizon-scan slice per
// environmental-policy-and-innovation Section 3. Pass an empty filter so
// the scoped aggregates RPC degrades to workspace-wide totals; the
// category-routing layer (getResearchItems) narrows the row payload to
// the Research-bound source set.
const RESEARCH_SCOPE = {};

export default async function Research() {
  const t0 = Date.now();
  // Sprint 2 Build 4: category routing wiring (OBS-26 / REC-OBS-G).
  //
  // Previously this page rendered pipeline rows fetched by intelligence_items
  // query alone, with no category filter (is_archived=false only). That
  // surfaced regulatory drafts, market signals, and operations content
  // alongside actual horizon-scan research, conflating the surfaces.
  //
  // Now /research intersects the pipeline rows with the category-routed
  // ID allow-list from getResearchItems, which applies skill Section 3
  // rules:
  //   - IMO + ICAO removed (route to Regulations)
  //   - FreightWaves / Loadstar / GreenBiz / Environmental Finance /
  //     Splash247 / Supply Chain Digital / Edie / Reuters Sustainable
  //     Business added in (skill places trade-press analytical content
  //     here, not Market Intel)
  //   - Carbon Trust + Project Drawdown added in (skill places these
  //     here, not Operations)
  //
  // The pipeline_stage UI control still functions; it filters within the
  // category-routed slice.
  const [pipeline, research, aggregates, sourceCoverage] = await Promise.all([
    getResearchPipeline(),
    getResearchItems(),
    getScopedWorkspaceAggregates(RESEARCH_SCOPE),
    // Build 8.5: source coverage matrix from get_research_source_coverage()
    // (migration 100). Pivots active Research-bound sources by
    // (transport_mode x jurisdiction_iso) so the coverage tab renders a
    // real registry breadth signal, not the prior hardcoded stub.
    getResearchSourceCoverage(),
  ]);
  console.log(
    `[perf] /research data ${Date.now() - t0}ms (pipeline=${pipeline.total}, category-routed=${research.total}, coverage_cells=${sourceCoverage.length})`
  );

  // Build the allow-list of IDs from the category-routed payload.
  // research.resources carries legacy_id || uuid IDs (rpcRowToResource
  // mapper), matching the IDs the pipeline fetcher emits.
  const allow = new Set(research.resources.map((r) => r.id));
  // If the category RPC came back empty (anon / no-auth / RPC failure
  // path), don't apply the filter — render the pipeline view as before so
  // the surface is never blank.
  const filteredRows = allow.size
    ? pipeline.rows.filter((r) => allow.has(r.id))
    : pipeline.rows;

  // Adapter: ResearchPipelineRow → ResearchPipelineItem (the existing UI
  // shape). owner / partnerFlagged are placeholders preserved from the
  // previous fetcher pending the owner-attribution work.
  // Build 8.1: pass through citationCount + lastCitedAt so the PipelineRow
  // card can render the CitationCountChip + RecencyChip credibility chips.
  const items: ResearchPipelineItem[] = filteredRows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    pipelineStage: r.pipelineStage,
    transportModes: r.transportModes,
    jurisdictions: r.jurisdictions,
    sourceName: r.sourceName,
    sourceUrl: r.sourceUrl,
    addedDate: r.addedDate,
    citationCount: r.citationCount,
    lastCitedAt: r.lastCitedAt,
    baseTier: r.baseTier,
    effectiveTier: r.effectiveTier,
    biasTags: r.biasTags,
    owner: null,
    partnerFlagged: false,
    whatItChanges: r.whatItChanges,
    doesNotResolve: r.doesNotResolve,
  }));

  return (
    <ResearchView
      items={items}
      aggregates={aggregates}
      total={allow.size ? filteredRows.length : pipeline.total}
      shown={items.length}
      cap={pipeline.cap}
      sourceCoverage={sourceCoverage}
    />
  );
}
