import { unstable_cache } from "next/cache";
import { APP_DATA_TAG } from "@/lib/data";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { getCoverageEntries, getCoverageIndex, type CoverageSurface } from "./index-data";
import { COVERAGE_UNAVAILABLE, loadCoverageMatrixWith, loadSurfaceDenominatorWith } from "./load-matrix.mjs";
import { emptyCoverageMatrix } from "./coverage-matrix.mjs";

const REVALIDATE_SECONDS = 600;

type Matrix = ReturnType<typeof emptyCoverageMatrix>;
type Denominator = Awaited<ReturnType<typeof loadSurfaceDenominatorWith>>["denominator"];

const cachedMatrix = unstable_cache(
  async (): Promise<Matrix> => {
    const out = await loadCoverageMatrixWith({
      getEntries: () => getCoverageEntries(),
      getIndex: () => getCoverageIndex(),
      now: () => new Date().toISOString(),
      labelOf: (code: string) => isoToDisplayLabel(code),
    });
    if (out.error) throw new Error(out.error); // never cache an outage
    return out.matrix;
  },
  ["coverage-matrix-v1"],
  { revalidate: REVALIDATE_SECONDS, tags: [APP_DATA_TAG] }
);

const cachedDenominator = unstable_cache(
  async (surface: CoverageSurface): Promise<NonNullable<Denominator>> => {
    const out = await loadSurfaceDenominatorWith(surface, { getIndex: (s: string) => getCoverageIndex(s as CoverageSurface) });
    if (out.error || !out.denominator) throw new Error(out.error ?? COVERAGE_UNAVAILABLE);
    return out.denominator;
  },
  ["coverage-denominator-v1"],
  { revalidate: REVALIDATE_SECONDS, tags: [APP_DATA_TAG] }
);

/** The matrix for the Coverage page and its routes. `error` is set, and the matrix is empty, when the read failed. */
export async function getCoverageMatrix(): Promise<{ matrix: Matrix; error: string | null }> {
  try {
    return { matrix: await cachedMatrix(), error: null };
  } catch {
    return { matrix: emptyCoverageMatrix(new Date().toISOString()), error: COVERAGE_UNAVAILABLE };
  }
}

/** One surface's denominator line data, or null with `error` set when the read failed. */
export async function getSurfaceDenominator(surface: CoverageSurface): Promise<{ denominator: Denominator; error: string | null }> {
  try {
    return { denominator: await cachedDenominator(surface), error: null };
  } catch {
    return { denominator: null, error: COVERAGE_UNAVAILABLE };
  }
}
