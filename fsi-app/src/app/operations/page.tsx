import { Suspense } from "react";
import { getPublicOperationsItems, getPublicResourcesOnly, getPublicSurfaceCounts } from "@/lib/data";
import { fetchOperationsCoverage, fetchStateCostFacts } from "@/lib/supabase-server";
import { OperationsLedger } from "@/components/operations/OperationsLedger";
import { ThemeStrip } from "@/components/shell/ThemeStrip";
import { CoverageDenominatorLine } from "@/components/coverage/CoverageDenominatorLine";
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
          belowRows={
            <>
              <ThemeStrip surface="operations" />
              <CoverageDenominatorLine surface="operations" surfacePath="/operations" />
            </>
          }
        />
      </Suspense>
    </>
  );
}
