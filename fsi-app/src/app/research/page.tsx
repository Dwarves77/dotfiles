/**
 * Research index (`/research`) — server component.
 *
 * UI system handoff 2026-09-06, artboard 06 "Research list". Composes
 * <ResearchLedger> (masthead + band tiles + theme cards + Window row +
 * band-grouped rows + rail, see that component's own header for the full
 * assembly). ThemeStrip and the credibility-model legend, both pre-existing
 * content the artboard has no region for, are handed to the ledger's
 * `belowRows` slot so they render at the foot of the content column instead
 * of above the masthead (lane comp-06, 2026-09-08, operator ruling R7).
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06): ResearchLedger now consumes
 * `getPublicResearchItems()`'s full `Resource[]` directly (band/impact/
 * timeline/tier all present) instead of the separate `getPublicResearchPipeline()`
 * shape intersected against a category-routed id allow-list — see
 * ResearchLedger.tsx's own header for why. `getPublicResearchPipeline()` is
 * no longer read by this page (nothing else in this lane's write set
 * consumed it); getResearchSourceCoverage() is unchanged.
 */

import { ResearchLedger } from "@/components/research/ResearchLedger";
import { renderNowIso } from "@/lib/render-now";
import { ThemeStrip } from "@/components/research/ThemeStrip";
import { CredibilityChipEvidence } from "@/components/research/CredibilityChipEvidence";
import { CredibilityChipAuthority } from "@/components/research/CredibilityChipAuthority";
import { getPublicResearchItems, getResearchSourceCoverage, getPublicSurfaceCounts } from "@/lib/data";

export default async function Research() {
  const t0 = Date.now();
  const [research, aggregates, sourceCoverage] = await Promise.all([
    getPublicResearchItems(),
    getPublicSurfaceCounts("research"),
    getResearchSourceCoverage(),
  ]);
  console.log(`[perf] /research data ${Date.now() - t0}ms (category-routed=${research.total}, coverage_cells=${sourceCoverage.length})`);

  return (
    <ResearchLedger
      resources={research.resources}
      aggregates={aggregates}
      sourceCoverage={sourceCoverage}
      nowIso={renderNowIso()}
      belowRows={
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Lane SURF (2026-09-01): customer-facing connection_themes strip, see ThemeStrip.tsx's
              own header. Self-contained server component; soft-fails to nothing on a read error.
              MOVED here (lane comp-06, 2026-09-08) from above the masthead: artboard 06/id="p6"
              puts the masthead first and draws no strip, and operator ruling R7 keeps an app
              feature the artboards have no region for, at the foot of the content column rather
              than in a region an artboard region must occupy. */}
          <ThemeStrip />
          {/* Split-credibility legend (spec-03 §4 "two scores, never merged"). Same R7 move: it
              already sat below the ledger, now inside the content column so it shares the page's
              one geometry instead of its own centred 1180px band. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
              }}
            >
              Credibility model
            </span>
            <CredibilityChipEvidence biasTags={[]} />
            <CredibilityChipAuthority />
            <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
              Two scores, never merged (spec-03 §4). Click a chip for the GRADE modifier ledger.
            </span>
          </div>
        </div>
      }
    />
  );
}
