import { buildCoverageMatrix, emptyCoverageMatrix, surfaceDenominator } from "./coverage-matrix.mjs";

export const COVERAGE_UNAVAILABLE = "Coverage could not be read just now.";

/**
 * @param {{
 *   getEntries: () => Promise<Array<object>>,
 *   getIndex: () => Promise<{ counts?: { verifiedBriefs?: number }, _error?: string }>,
 *   now: () => string,
 *   labelOf?: (code: string) => string,
 * }} deps
 * @returns {Promise<{ matrix: ReturnType<typeof buildCoverageMatrix>, error: string | null }>}
 */
export async function loadCoverageMatrixWith(deps) {
  const generatedAt = deps.now();
  try {
    const [entries, index] = await Promise.all([deps.getEntries(), deps.getIndex()]);
    if (index && index._error) return { matrix: emptyCoverageMatrix(generatedAt), error: COVERAGE_UNAVAILABLE };
    const matrix = buildCoverageMatrix(entries, {
      generatedAt,
      verifiedBriefs: index?.counts?.verifiedBriefs,
      labelOf: deps.labelOf,
    });
    return { matrix, error: null };
  } catch (e) {
    console.warn("[coverage] matrix read failed:", e instanceof Error ? e.message : String(e));
    return { matrix: emptyCoverageMatrix(generatedAt), error: COVERAGE_UNAVAILABLE };
  }
}

/**
 * The denominator a surface shows. `getIndex(surface)` is getCoverageIndex bound to the surface.
 * @param {string} surface
 * @param {{ getIndex: (surface: string) => Promise<{ counts?: object, _error?: string }> }} deps
 * @returns {Promise<{ denominator: ReturnType<typeof surfaceDenominator>, error: string | null }>}
 */
export async function loadSurfaceDenominatorWith(surface, deps) {
  try {
    const index = await deps.getIndex(surface);
    if (!index || index._error) return { denominator: null, error: COVERAGE_UNAVAILABLE };
    const denominator = surfaceDenominator(surface, index.counts);
    return { denominator, error: denominator ? null : COVERAGE_UNAVAILABLE };
  } catch (e) {
    console.warn(`[coverage] ${surface} denominator read failed:`, e instanceof Error ? e.message : String(e));
    return { denominator: null, error: COVERAGE_UNAVAILABLE };
  }
}
