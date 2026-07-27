// paginate.mjs — the shared paginated PostgREST read (error-swallow case-file instance 9).
//
// PostgREST silently caps a range-less `.select()` at 1000 rows. A truncated read that feeds a COUNT, SUM,
// VERDICT, or DELETE is the read-cap defect class: the ledger baseline read $0.99 of a true $16.21, the
// clean-slate "affected items" saw 159 of 240, and the spend watch computed "207 of 207" from a 1000-row
// slice of 19,898. The rule (case-file 9): any read whose result feeds a count/sum/verdict/delete MUST be
// paginated through this helper, OR be explicitly bounded with an assertBound() that fails closed if the
// bound was actually hit. No silent truncation at a decision site.
//
// Both `.ts` (API routes) and `.mjs` (runners/probes/scripts) import this; it is transport-agnostic — it
// takes a factory that applies `.range(from, to)` to whatever query builder the caller already has.

/**
 * Read EVERY row of a PostgREST query, one page at a time, until a short page.
 * @template T
 * @param {(from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }>} pageFactory
 *   Given an inclusive [from, to] range, returns the builder with `.range(from, to)` applied and awaited.
 *   CONTRACT: the builder MUST apply a TOTAL order — `.order(<unique column>)`, e.g. the PK `id`. Ordering by
 *   a NON-unique column (created_at, started_at) leaves ties in an undefined order that varies per page query,
 *   so offset paging silently SKIPS/duplicates rows at page boundaries (observed: 219 markers sharing one
 *   created_at lost ~15 across pages). A unique order key makes offset paging lossless on a stable dataset.
 * @param {{ pageSize?: number, cap?: number }} [opts] pageSize (default 1000); cap = optional hard upper bound
 *   on total rows (throws if exceeded, so an unexpectedly huge read cannot silently balloon a sum/verdict).
 * @returns {Promise<T[]>} every row. THROWS on any page error (fail-closed — never returns a partial result).
 */
export async function fetchAllRows(pageFactory, { pageSize = 1000, cap = Infinity } = {}) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await pageFactory(from, from + pageSize - 1);
    if (error) throw new Error(`paginated read failed at offset ${from}: ${error.message}`);
    const page = data || [];
    all.push(...page);
    if (all.length > cap) throw new Error(`paginated read exceeded its cap of ${cap} rows (got ${all.length}); a decision on this many rows was not expected — raise the cap deliberately or narrow the query`);
    if (page.length < pageSize) break;
  }
  return all;
}

/**
 * For a read that is DELIBERATELY bounded (top-N, a sample) rather than paginated: assert the bound was not
 * actually hit, so a silent truncation can never masquerade as a complete result at a decision site.
 * @param {number} rowCount how many rows the bounded read returned
 * @param {number} bound the limit that was requested
 * @param {string} label what the read is (for the error message)
 */
export function assertBound(rowCount, bound, label) {
  if (rowCount >= bound) {
    throw new Error(`${label}: bounded read returned ${rowCount} rows == its ${bound}-row bound — result is likely TRUNCATED. Paginate via fetchAllRows, or raise the bound if a complete read genuinely fits under it.`);
  }
}
