/**
 * Pure paging helper for GET /api/listings/rest, in a sibling module rather than route.ts because a
 * route.ts may export only route handlers and config (F34; the same reason
 * src/app/api/notices/logic.ts exists).
 *
 * COUNTS-61 (production defect, click-through audit 2026-09-08). Root cause [CONFIRMED]: this route
 * asked for the whole remainder in ONE `.range(offset, offset + 5000 - 1)` call. PostgREST caps a
 * single response at its `db-max-rows` setting (1000 on this project), silently, with no error and
 * no truncation signal — the exact class this repo already named CAP-1000 on 2026-09-05 and fixed
 * for `getPublicSurfaceSlugs` with `fetchAllRows`, while this route kept the defect.
 *
 * The arithmetic that confirms it, on the corpus as it stood 2026-09-08: /regulations server-renders
 * the first 60 rows and fetches the rest here, so the ledger held 60 + 1000 = 1060 rows. The listing
 * RPC orders by priority band, and the corpus carries 15 CRITICAL + 14 HIGH ahead of the MODERATE
 * rows, so 1060 - 29 = 1031 — the exact number the production list printed as "showing 5 of 1031"
 * and "All 1031 monitor →", 88 short of the 1,119 its own band tile printed from
 * `get_surface_counts('regulations')`. Not a different corpus slice, not a stale cache: a silently
 * truncated read.
 *
 * The fix is the fix CAP-1000 already prescribes — walk the range one `REMAINDER_PAGE_SIZE` page at
 * a time until a short page proves the end, never one wide range. `cap` stays a genuine safety
 * ceiling, not a per-request limit.
 */

/** One page's worth of rows. Must be <= the server's `db-max-rows`, or a page can itself truncate. */
export const REMAINDER_PAGE_SIZE = 1000;

export interface ListingsPage<R> {
  resources: R[];
  archived: R[];
  _error?: string;
  _fallbackTrigger?: string;
}

/**
 * Walk `fetchPage` from `offset` in `REMAINDER_PAGE_SIZE` pages until a short page proves the end,
 * `cap` rows are collected, or a page reports `_error`. A page's row count is resources + archived,
 * because the fetcher splits ONE underlying row page into those two arrays.
 *
 * An `_error` on any page is propagated (with whatever rows already came back) rather than thrown:
 * this route's own contract is "return whatever rows came back rather than a 500", and a partial
 * remainder is still better than none for the caller, which keeps its first-paint page either way.
 */
export async function fetchRemainderPaged<R>(
  fetchPage: (from: number, to: number) => Promise<ListingsPage<R>>,
  offset: number,
  cap: number
): Promise<ListingsPage<R>> {
  const resources: R[] = [];
  const archived: R[] = [];
  let firstError: string | undefined;
  let firstTrigger: string | undefined;

  for (let from = offset; resources.length + archived.length < cap; from += REMAINDER_PAGE_SIZE) {
    const page = await fetchPage(from, from + REMAINDER_PAGE_SIZE - 1);
    if (page._error && firstError === undefined) {
      firstError = page._error;
      firstTrigger = page._fallbackTrigger;
    }
    resources.push(...page.resources);
    archived.push(...page.archived);
    const pageRows = page.resources.length + page.archived.length;
    if (page._error || pageRows < REMAINDER_PAGE_SIZE) break;
  }

  const out: ListingsPage<R> = { resources, archived };
  if (firstError !== undefined) {
    out._error = firstError;
    out._fallbackTrigger = firstTrigger;
  }
  return out;
}
