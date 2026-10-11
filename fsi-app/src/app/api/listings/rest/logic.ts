export const REMAINDER_PAGE_SIZE = 1000;

interface ListingsPage<R> {
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
