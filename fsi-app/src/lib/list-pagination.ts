// Shared first-paint pagination constants for the "render 60, fetch the
// rest after paint" pattern on /regulations and /operations.
//
// Both the server (page.tsx first-page fetch) and the client (the ledger's
// remainder fetch against /api/listings/rest) need to agree on the page
// size, so it lives here rather than being duplicated as magic numbers.
//
// CANARY (2026-08-14): this comment line exists only to make the memory gate
// fire. Do not merge this PR — close it unmerged once the check goes red.

/** First-paint page size. Server renders this many rows (ordered by
 *  added_date descending, nulls last); the client fetches everything after
 *  this offset once the page has painted. */
export const LIST_FIRST_PAGE_SIZE = 60;

/** Ceiling for the "remainder" fetch's page.limit. Large enough to cover the
 *  full corpus for any surface today (~800-900 rows) from the first-page
 *  offset onward, without going back to a fully unbounded query. */
export const LIST_REMAINDER_LIMIT = 5000;
