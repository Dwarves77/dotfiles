/**
 * Research index (`/research`) - server component.
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
 * shape intersected against a category-routed id allow-list - see
 * ResearchLedger.tsx's own header for why. `getPublicResearchPipeline()` is
 * no longer read by this page (nothing else in this lane's write set
 * consumed it); getResearchSourceCoverage() is unchanged.
 */

import { Suspense } from "react";
import { ResearchLedger } from "@/components/research/ResearchLedger";
import { renderNowIso } from "@/lib/render-now";
import { ThemeStrip } from "@/components/shell/ThemeStrip";
import { CoverageDenominatorLine } from "@/components/coverage/CoverageDenominatorLine";
import { CredibilityChipEvidence } from "@/components/research/CredibilityChipEvidence";
import { CredibilityChipAuthority } from "@/components/research/CredibilityChipAuthority";
import { BiasLegend } from "@/components/ui/BiasChips";
import { getPublicResearchItems, getResearchSourceCoverage, getPublicSurfaceCounts } from "@/lib/data";
import { getServiceSupabase } from "@/lib/supabase-service";
import { selectAssessmentViewsByItemId } from "@/lib/research/read-assessments.mjs";

/**
 * COUNTS-61 (2026-09-08). This route was the ONE list surface still statically prerendered; its
 * three siblings (/regulations, /market, /operations) already render per request. Once the ledger
 * reads its facet state from the URL, a statically prerendered page cannot server-render it: Next
 * defers the whole `useSearchParams` Suspense boundary to the client, and the build's own output
 * proves it - the prerendered research.html carried the frame and none of the rows [CONFIRMED,
 * this lane, by reading .next/server/app/research.html]. That is a first-paint regression, not a
 * trade this lane gets to make silently, so the route joins its siblings and renders per request.
 *
 * The DATA reads are unaffected: getPublicResearchItems / getPublicSurfaceCounts /
 * getResearchSourceCoverage are each `unstable_cache`-wrapped with their own TTL and tag, so what
 * this gives up is the cached HTML, not the cached queries.
 */
export const dynamic = "force-dynamic";

/**
 * Lane W2-R (2026-10-01): batched read of migration 336's `research_assessments_current` view for every
 * item this page is about to render, so the ledger's rows can carry a horizon band without an N+1 query
 * per row. Mirrors ThemeStrip.tsx's own soft-fail posture exactly (service-role client, try/catch to an
 * empty Map on any error - a missing/not-yet-applied migration must never break the Research list).
 */
async function readAssessmentsByItemId(itemIds: string[]) {
  if (itemIds.length === 0) return new Map();
  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch {
    return new Map();
  }
  try {
    const rows: unknown[] = [];
    for (let i = 0; i < itemIds.length; i += 200) {
      const { data } = await supabase
        .from("research_assessments_current")
        .select(
          "item_id, technical_maturity_low, technical_maturity_high, technical_maturity_method, " +
            "commercial_maturity_low, commercial_maturity_high, commercial_maturity_method, " +
            "horizon_kind, horizon_band, horizon_rule, horizon_confidence, horizon_trigger_note, " +
            "refusal_reason, credibility_evidence_score, credibility_authority_score, status_token, computed_at",
        )
        // fitness-allow: F39 (chunked above in 200-id slices, same pattern ThemeStrip.tsx already uses)
        .in("item_id", itemIds.slice(i, i + 200));
      rows.push(...(data ?? []));
    }
    return selectAssessmentViewsByItemId(rows as Parameters<typeof selectAssessmentViewsByItemId>[0]);
  } catch {
    return new Map();
  }
}

/**
 * The page's data read, with its own timing.
 *
 * DELIBERATELY NOT INLINE IN THE COMPONENT. `react-hooks/purity` flags `Date.now()` called
 * inside a component body (watchlist/page.tsx's header is the canonical rationale this repo
 * carries for the pattern, and names this file as one of the two pre-existing instances of the
 * violation). Hosting the timer in a plain async function keeps the observability and drops the
 * violation instead of suppressing it.
 */
async function loadResearchPageData() {
  const t0 = Date.now();
  const [research, aggregates, sourceCoverage] = await Promise.all([
    getPublicResearchItems(),
    getPublicSurfaceCounts("research"),
    getResearchSourceCoverage(),
  ]);
  const assessmentsByItemId = await readAssessmentsByItemId(research.resources.map((r) => r.id));
  console.log(`[perf] /research data ${Date.now() - t0}ms (category-routed=${research.total}, coverage_cells=${sourceCoverage.length}, assessed=${assessmentsByItemId.size})`);
  return { research, aggregates, sourceCoverage, assessmentsByItemId };
}

export default async function Research() {
  const { research, aggregates, sourceCoverage, assessmentsByItemId } = await loadResearchPageData();

  // COUNTS-61: useSearchParams() inside the ledger (the facet URL contract) needs a Suspense
  // boundary, Next's own rule, so the surface streams rather than opting the whole route into
  // client rendering.
  return (
    <Suspense fallback={null}>
      <ResearchLedger
        resources={research.resources}
        aggregates={aggregates}
        sourceCoverage={sourceCoverage}
        assessmentsByItemId={assessmentsByItemId}
        nowIso={renderNowIso()}
        belowRows={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Lane SURF (2026-09-01): customer-facing connection_themes strip, see ThemeStrip.tsx's
                own header. Self-contained server component; soft-fails to nothing on a read error.
                MOVED here (lane comp-06, 2026-09-08) from above the masthead: artboard 06/id="p6"
                puts the masthead first and draws no strip, and operator ruling R7 keeps an app
                feature the artboards have no region for, at the foot of the content column rather
                than in a region an artboard region must occupy. */}
            <ThemeStrip surface="research" />
            <CoverageDenominatorLine surface="research" surfacePath="/research" />
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
              <CredibilityChipEvidence />
              <CredibilityChipAuthority />
              <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
                Two scores, never merged (spec-03 §4). Click a chip for the GRADE modifier ledger.
              </span>
            </div>
            {/* Lane P1 (2026-10-05, CLAUDE.md rule 18): the source bias vocabulary the rows' chips draw
                from, one row per dimension, built from the stored vocabulary and its label table. The
                legend above only ever showed the two score chips with no data behind them. */}
            <BiasLegend />
          </div>
        }
      />
    </Suspense>
  );
}
