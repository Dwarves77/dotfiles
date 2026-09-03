// Shared first-paint pagination constants for the "render 60, fetch the
// rest after paint" pattern on /regulations and /operations.
//
// Both the server (page.tsx first-page fetch) and the client (the ledger's
// remainder fetch against /api/listings/rest) need to agree on the page
// size, so it lives here rather than being duplicated as magic numbers.

/** First-paint page size. Server renders this many rows (ordered by
 *  added_date descending, nulls last); the client fetches everything after
 *  this offset once the page has painted. */
export const LIST_FIRST_PAGE_SIZE = 60;

/** Ceiling for the "remainder" fetch's page.limit. Large enough to cover the
 *  full corpus for any surface today (~800-900 rows) from the first-page
 *  offset onward, without going back to a fully unbounded query. */
export const LIST_REMAINDER_LIMIT = 5000;

import type { Resource } from "@/types/resource";

// ── PERF-3 (2026-09-03) payload trim ────────────────────────────────────────────────────────────
//
// docs/audits/perf-load-times-2026-09-03.md item (3): "/api/listings/rest returns 150-170 KB in
// 1.7-2.7s on both /regulations and /operations". Grepped every `.fieldName` read against a
// Resource on the two consumers of this route's response (src/components/regulations/
// RegulationsLedger.tsx, src/components/operations/OperationsLedger.tsx — both read/greped in
// full this lane): the search haystack uses title/jurisdiction/tags/whatIsIt/whyMatters; the
// priority-sort tiebreak (nextMilestone) uses `timeline`; row cards and filters use the rest of
// the fields below. NONE of the fields this function blanks out are read by either file — they
// are detail-surface-only content (the full regulatory/signal brief, structured sections, source
// list), never rendered by a compact ledger row. `keyData`/`reasoning` are non-optional on the
// Resource type (every RPC row carries them) but are blanked to their empty zero-value rather than
// omitted, so the trimmed object still satisfies the type honestly (an empty list/string, not a
// fabricated one) instead of requiring the type itself to be loosened for this one response.
//
// This does not duplicate the RPC-level "listings vs slim vs full" projection Postgres already
// does (get_workspace_intelligence_listings/_slim, migration 066's own field-dropping) — it trims
// what THAT projection still includes but this specific client (the remainder-fetch ledgers, never
// a detail page) never reads.
/** Trims one Resource row to the fields RegulationsLedger.tsx / OperationsLedger.tsx actually
 *  read (search haystack, sort tiebreak, row card, filters) — see this module's header for the
 *  field-by-field accounting. Used only by /api/listings/rest's remainder response; the first-
 *  paint SSR payload (page.tsx) is unaffected. */
export function toLedgerRowPayload(r: Resource): Resource {
  return {
    ...r,
    keyData: [],
    reasoning: "",
    fullBrief: undefined,
    regulatoryConflict: undefined,
    trajectoryPoints: undefined,
    operationalImpact: undefined,
    riskRegister: undefined,
    recommendedActions: undefined,
    openQuestions: undefined,
    sourceUrls: undefined,
  };
}
