/**
 * Operations index (`/operations`) — server component.
 *
 * UI system handoff 2026-09-06, artboard 08 "Operations list". Composes
 * <OperationsLedger> (masthead + band tiles + Mode/Region facets + region x
 * dimension matrix + band-grouped rows + rail).
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06): the old <EditorialMasthead> is
 * gone.
 *
 * PAGE SCOPE (UI fix round 2026-09-08, item D3). Artboard 08 defines the WHOLE page, and everything
 * that used to sit below its last card has moved or gone:
 *   - the "Capacity investment estimate" calculator, and with it the "Recent recalculations" list
 *     that is its own foot, MOVED to /operations/calculator (the operator ruled that move earlier and
 *     restated it this round).
 *   - the auxiliary-energy and grid-queue panels MOVED onto the Operations PROFILE page as
 *     S-sections (the DQI panel was removed by ADR-042), with their existing data paths, see /operations/[slug]/page.tsx.
 *   - the "By state" sub-list REMOVED. It was restored in the UILISTS2 lane on ruling R7 ("a feature
 *     no artboard draws is left as it is"); item D3 names it for removal, and a later ruling wins.
 *     The state cost facts it read are NOT orphaned: /api/ask still grounds Operations answers on
 *     state_cost_facts, and the Coverage gaps rail card artboard 08 DOES draw still reports the
 *     sourced-state tally, which is why `fetchStateCostFacts()` is still read here.
 */

import { Suspense } from "react";
import { getPublicOperationsItems, getPublicResourcesOnly, getPublicSurfaceCounts } from "@/lib/data";
import { fetchOperationsCoverage, fetchStateCostFacts } from "@/lib/supabase-server";
import { OperationsLedger } from "@/components/operations/OperationsLedger";
import { renderNowIso } from "@/lib/render-now";
import { isRegulationItem } from "@/lib/regulation-item-types";
import { LIST_FIRST_PAGE_SIZE, toLedgerRowPayload } from "@/lib/list-pagination";

/**
 * The page's data read, with its own timing.
 *
 * DELIBERATELY NOT INLINE IN THE COMPONENT. `react-hooks/purity` flags `Date.now()` called
 * inside a component body (watchlist/page.tsx's header is the canonical rationale this repo
 * carries for the pattern). Hosting the timer in a plain async function keeps the observability
 * and drops the violation instead of suppressing it.
 */
async function loadOperationsPageData() {
  const t0 = Date.now();
  const [opsItems, fallback, aggregates, operationsCoverage, stateCosts] = await Promise.all([
    getPublicOperationsItems(),
    getPublicResourcesOnly({ limit: LIST_FIRST_PAGE_SIZE, offset: 0 }),
    getPublicSurfaceCounts("operations"),
    fetchOperationsCoverage(),
    fetchStateCostFacts(),
  ]);
  console.log(
    `[perf] /operations data ${Date.now() - t0}ms (category-routed=${opsItems.total}, fallback=${fallback.resources.length}, coverage_rows=${operationsCoverage.coverage.length}, fact_rows=${operationsCoverage.facts.length})`,
  );
  return { opsItems, fallback, aggregates, operationsCoverage, stateCosts };
}

export default async function Operations() {
  const { opsItems, fallback, aggregates, operationsCoverage, stateCosts } = await loadOperationsPageData();

  const initialResources = opsItems.resources.map(toLedgerRowPayload);
  const regulationsByRegion = fallback.resources.filter(isRegulationItem);

  return (
    <>
      {/* COUNTS-61: useSearchParams() inside the ledger (the facet URL contract) needs a Suspense
          boundary, Next's own rule, so the surface streams rather than opting the whole route into
          client rendering. */}
      <Suspense fallback={null}>
        <OperationsLedger
          initialResources={initialResources}
          aggregates={aggregates}
          regulationsByRegion={regulationsByRegion}
          operationsCoverage={operationsCoverage}
          stateCosts={stateCosts}
          nowIso={renderNowIso()}
        />
      </Suspense>
    </>
  );
}
