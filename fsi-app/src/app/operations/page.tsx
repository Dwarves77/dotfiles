/**
 * Operations index (`/operations`) — server component.
 *
 * UI system handoff 2026-09-06, artboard 08 "Operations list". Composes
 * <OperationsLedger> (masthead + band tiles + Mode/Region facets + region x
 * dimension matrix + band-grouped rows + rail) plus the pre-existing
 * DQI/auxiliary-energy/grid-queue panels and the automate-vs-hire
 * calculator, none of which duplicate list-row UI.
 *
 * REWRITTEN this lane (UILISTS, 2026-09-06): the old <EditorialMasthead> is
 * gone.
 *
 * RESTORED (UILISTS2 lane, 2026-09-07, operator ruling: an app feature not
 * shown in the 17 artboards is restored exactly): `fetchStateCostFacts()` is
 * read again here and passed to OperationsLedger, which renders the By-state
 * sub-list below the region x dimension matrix — see that component's own
 * header.
 */

import { getPublicOperationsItems, getPublicResourcesOnly, getPublicSurfaceCounts } from "@/lib/data";
import { fetchOperationsCoverage, fetchStateCostFacts } from "@/lib/supabase-server";
import { OperationsLedger } from "@/components/operations/OperationsLedger";
import { renderNowIso } from "@/lib/render-now";
import { isRegulationItem } from "@/lib/regulation-item-types";
import { LIST_FIRST_PAGE_SIZE, toLedgerRowPayload } from "@/lib/list-pagination";
import { AutomateVsHireCalculator } from "./AutomateVsHireCalculator";
import { DqiPanel } from "@/components/operations/DqiPanel";
import { AuxiliaryEnergyPanel } from "@/components/operations/AuxiliaryEnergyPanel";
import { GridQueuePanel } from "@/components/operations/GridQueuePanel";

export default async function Operations() {
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

  const initialResources = opsItems.resources.map(toLedgerRowPayload);
  const regulationsByRegion = fallback.resources.filter(isRegulationItem);

  return (
    <>
      <OperationsLedger
        initialResources={initialResources}
        aggregates={aggregates}
        regulationsByRegion={regulationsByRegion}
        operationsCoverage={operationsCoverage}
        stateCosts={stateCosts}
        nowIso={renderNowIso()}
      />
      {/* Lane DP-SURF: the automate-vs-hire calculator. Pure client-side compute. */}
      <AutomateVsHireCalculator />
      {/* Spec 09 §1.4/§1.5/§1.6: DQI, auxiliary energy, grid queue. */}
      <DqiPanel />
      <AuxiliaryEnergyPanel />
      <GridQueuePanel />
    </>
  );
}
