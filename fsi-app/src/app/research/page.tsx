import { ResearchLedger, type ResearchPipelineItem } from "@/components/research/ResearchLedger";
import { ThemeStrip } from "@/components/research/ThemeStrip";
import { CredibilityChipEvidence } from "@/components/research/CredibilityChipEvidence";
import { CredibilityChipAuthority } from "@/components/research/CredibilityChipAuthority";
import {
  getPublicResearchItems,
  getPublicResearchPipeline,
  getResearchSourceCoverage,
  getPublicSurfaceCounts,
} from "@/lib/data";

// PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up / migration 306): `force-dynamic` REMOVED.
// It existed because getResearchItems()/getResearchPipeline() both called resolveOrgIdFromCookies()
// — a Dynamic API read in this page's own server render (independent of the shared-layout cause
// this lane's layout.tsx commit removes) — and would degrade to an empty payload without it (the
// comment this replaces named exactly that failure mode). This page now renders from
// getPublicResearchItems/getPublicResearchPipeline (org-independent, unstable_cache-backed, migration
// 305 + the fetchPublicResearchPipelineRows finding that orgId was already unused by the pipeline
// query) — no cookies() read, so there is nothing left for force-dynamic to route around. Per-org
// personalization (pipeline_stage user overrides, when they land) stays a client-side concern via
// useWorkspaceOverridesHydration, same split as /regulations.
//
// Historical note preserved from the removed comment: /research was once the only page with a
// working ISR declaration (no cookie reads in its data path) before getResearchPipeline() started
// reading cookies, and generated ~200K ISR writes over 30 days (docs/ISR-WRITE-INVESTIGATION.md).
// This lane's fix returns /research to that no-cookie-reads state by a different route (public RPC +
// client-merged overrides, not the pre-cookie anon-key fetcher ISR-WRITE-INVESTIGATION.md describes).

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
    getPublicResearchPipeline(),
    getPublicResearchItems(),
    // Count-integrity: research-scoped counts from the single SoT (migration 148), gated verified.
    // PERF-10: getPublicSurfaceCounts (no cookies) — see its header in data.ts for the platform-wide
    // vs per-org-override-adjusted count trade-off this lane accepts.
    getPublicSurfaceCounts("research"),
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
    <>
      {/* Lane SURF (2026-09-01): customer-facing connection_themes strip — see ThemeStrip.tsx's own
          header (including the live theme_briefs RLS finding). Self-contained server component;
          soft-fails to nothing on a read error. Mounted here (page.tsx) rather than inside
          ResearchLedger, which owns its own internal masthead and is out of this lane's write set. */}
      <ThemeStrip />
      {/* Split-credibility legend (spec-03 §4 "two scores, never merged"; Lane DASH, 2026-09-02).
          Page-level placement, once: the same two chip components each finding row below carries,
          shown here with no item bound so a reader sees the model before hitting the per-row chips.
          "Chip placement only" per this lane's write set — no restructuring of the surrounding page. */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 36px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            Credibility model
          </span>
          <CredibilityChipEvidence biasTags={[]} />
          <CredibilityChipAuthority />
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            Two scores, never merged (spec-03 §4). Click a chip for the GRADE modifier ledger.
          </span>
        </div>
      </div>
      <ResearchLedger
        items={items}
        aggregates={aggregates}
        total={allow.size ? filteredRows.length : pipeline.total}
        sourceCoverage={sourceCoverage}
      />
    </>
  );
}
