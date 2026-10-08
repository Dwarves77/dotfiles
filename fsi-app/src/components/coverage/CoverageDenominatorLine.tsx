/**
 * CoverageDenominatorLine: a surface's coverage denominator line, server component (lane COV-1, 2026-10-08).
 *
 * The fetch half of the view/fetch split (see CoverageDenominatorLineView.tsx). It is a CALLER of
 * getCoverageIndex(surface) through the cached loader in src/lib/coverage/matrix-data.ts, which makes the index
 * reachable from a customer page for the first time (VERIFY-1 register row 00S4). Soft-fails to the view's error
 * state on any read error: a denominator line must never break a list page, and a failed read must never read as
 * "nothing catalogued".
 *
 * Mounted through the `belowRows` slot of the Regulations, Market Intel, Research and Operations list pages,
 * beside the ThemeStrip. Community is human-operated and has no census, so it carries no line.
 */

import { getSurfaceDenominator } from "@/lib/coverage/matrix-data";
import type { CoverageSurface } from "@/lib/coverage/index-data";
import { CoverageDenominatorLineView } from "@/components/coverage/CoverageDenominatorLineView";

export async function CoverageDenominatorLine({ surface, surfacePath }: { surface: CoverageSurface; surfacePath: string }) {
  const { denominator, error } = await getSurfaceDenominator(surface);
  return <CoverageDenominatorLineView denominator={denominator} error={error} surfacePath={surfacePath} />;
}
