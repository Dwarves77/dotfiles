import { getSurfaceDenominator } from "@/lib/coverage/matrix-data";
import type { CoverageSurface } from "@/lib/coverage/index-data";
import { CoverageDenominatorLineView } from "@/components/coverage/CoverageDenominatorLineView";

export async function CoverageDenominatorLine({ surface, surfacePath }: { surface: CoverageSurface; surfacePath: string }) {
  const { denominator, error } = await getSurfaceDenominator(surface);
  return <CoverageDenominatorLineView denominator={denominator} error={error} surfacePath={surfacePath} />;
}
