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
 * gone. `fetchStateCostFacts()` is no longer read here — OperationsLedger no
 * longer renders the by-state cost sub-list (see its own header; logged in
 * DEVIATION-LOG.md).
 */

import { getPublicOperationsItems, getPublicResourcesOnly, getPublicSurfaceCounts } from "@/lib/data";
import { fetchOperationsCoverage } from "@/lib/supabase-server";
import { OperationsLedger } from "@/components/operations/OperationsLedger";
import { isRegulationItem } from "@/lib/regulation-item-types";
import { LIST_FIRST_PAGE_SIZE, toLedgerRowPayload } from "@/lib/list-pagination";
import { AutomateVsHireCalculator } from "./AutomateVsHireCalculator";
import { DqiPanel } from "@/components/operations/DqiPanel";
import { AuxiliaryEnergyPanel } from "@/components/operations/AuxiliaryEnergyPanel";
import { GridQueuePanel } from "@/components/operations/GridQueuePanel";

export default async function Operations() {
  const t0 = Date.now();
  const [opsItems, fallback, aggregates, operationsCoverage] = await Promise.all([
    getPublicOperationsItems(),
    getPublicResourcesOnly({ limit: LIST_FIRST_PAGE_SIZE, offset: 0 }),
    getPublicSurfaceCounts("operations"),
    fetchOperationsCoverage(),
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
