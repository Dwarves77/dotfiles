// load-matrix.mjs: the injected-dependency core of the Coverage surface's data loader (lane COV-1, 2026-10-08).
//
// The I/O half is src/lib/coverage/matrix-data.ts (it imports next/cache and the Supabase service client, which
// a bare `node --test` cannot resolve; the same split coverage-gaps.ts / coverage-gaps-rollup.ts use). This half
// takes the readers as arguments, so the loader's behaviour, including its failure behaviour, is proven on fixtures.
//
// WHAT IT READS. Only what `getCoverageIndex` / `getCoverageEntries` (src/lib/coverage/index-data.ts) already
// return: the full catalogued entry list for the matrix cells, and the exact platform counts (including the
// separate verified-brief count) for the headline. It adds no query of its own.
//
// FAILURE IS A STATE, NOT A ZERO. If the entry read throws, or the index reports `_error`, the result carries
// `error` and an empty matrix of the same shape. The page renders that as the coverage "error" state with a
// retry; it never renders an empty matrix as if the platform had catalogued nothing (that would be a lie of the
// exact kind spec 00 section 4 exists to prevent).

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
