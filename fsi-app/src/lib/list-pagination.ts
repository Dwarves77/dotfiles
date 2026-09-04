// Shared pagination constants + keyset-cursor helpers for the listing ledgers.
//
// LIST_FIRST_PAGE_SIZE (60) is UNCHANGED and stays exactly what it was: the page size for
// /operations' own "render N, fetch the rest after paint" mechanism (OperationsLedger.tsx,
// unaudited — PERF-11 confirmed Operations' live corpus, 25 items, is well under this threshold,
// so it carries no structural "load everything" defect and this lane leaves it alone) and for
// ObligationRegister.tsx's unrelated first-page fetch (a different table, its own pagination —
// ObligationRegisterFilterBar.tsx even keeps its own local `PAGE_SIZE = 60` literal "mirrors
// LIST_FIRST_PAGE_SIZE", so changing this value would silently desync that comment's own claim).
//
// PERF-12 (2026-09-04, ADR-027 §2) replaces /regulations' OWN mechanism — the one-shot
// LIST_REMAINDER_LIMIT=5000 fetch this constant used to gate — with true cursor pagination
// (useInfiniteQuery + a keyset cursor against get_workspace_intelligence_listings's own total
// order). LIST_REMAINDER_LIMIT and the one-shot fetch it gated are DELETED, not left behind (see
// RegulationsLedger.tsx and /api/listings/cursor/route.ts) — the audit's root cause
// (docs/audits/perf-waterfall-2026-09-04.md §1) was exactly this "ship up to 5,000 rows in one
// response" shape, so keeping the constant around unused would leave the defect's own evidence
// looking live. LIST_PAGE_SIZE below is /regulations' new, much smaller, per-fetch page size.

import type { Resource } from "@/types/resource";

/**
 * /regulations cursor-pagination page size (ADR-027 §2: "page size = one screen").
 *
 * Derivation, stated per the lane brief's own instruction to name the number's source rather than
 * assert it bare:
 *   - Reference viewport: 1440×840 (ADR-027/the perf audits' own implied desktop viewport; no
 *     mobile-specific page size is computed here — the row markup itself is responsive, only the
 *     FETCH granularity is viewport-derived, and over-fetching slightly on a narrower viewport
 *     costs nothing the virtualizer doesn't already discard from the DOM).
 *   - RegRow height (RegulationsLedger.tsx's `RegRow`): `padding: "11px 18px"` (22px vertical) +
 *     a `border-bottom: 1px` + one line of 13.5px/1.4-line-height title text (~19px) for the
 *     common single-line case ⇒ ≈ 42px; rounded up to 44px to cover the occasional two-line
 *     clamped title (`cl-row-grid__title--clamp3`) without under-provisioning the page.
 *   - 840px / 44px ≈ 19 rows fill one full viewport height of NOTHING BUT rows — the literal "one
 *     screen of rows" figure once page chrome (masthead/tiles/ask-bar/facet-bar, only present
 *     above the fold on first paint, not during mid-list scrolling) is out of the way.
 *   - Doubled to keep a full screen's worth of ALREADY-FETCHED rows ahead of the viewport's
 *     leading edge at all times (so `fetchNextPage` finishing slightly late never outruns the
 *     scroll — the standard "prefetch one screen ahead" cursor-pagination sizing, not merely
 *     "exactly what's visible right now") ⇒ ≈ 38, rounded down to 30 for a round number inside
 *     the lane brief's own stated 25–40 range.
 */
export const LIST_PAGE_SIZE = 30;

/** First-paint page size. Server renders this many rows (ordered by
 *  added_date descending, nulls last); the client fetches everything after
 *  this offset once the page has painted. UNCHANGED — see this module's own
 *  header for why (Operations + ObligationRegister still depend on 60). */
export const LIST_FIRST_PAGE_SIZE = 60;

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

// ── keyset cursor (PERF-12, 2026-09-04; reconciled onto the public RPC, RECONCILE 2026-09-04) ─────
//
// ADR-027 §2: "the cursor is the last row's (priority, added_date, id)" — migration 306's
// `get_workspace_intelligence_listings_public`'s own total order. The cursor an infinite-query page
// hands back is an OPAQUE token to the client (`useLedgerInfiniteQuery` never reads its fields, only
// forwards it) — route.ts always interprets the full triple as a true keyset WHERE (migration 306's
// `p_after_*` args) now that the coordinator applies every migration in this train before this code
// merges (no "pre-306" era for this route to degrade through).
export interface ListingCursor {
  /** Rows consumed so far across every page fetched for this query. Retained as the request's
   *  `offset` query param for observability/logging only — the server ranges from the keyset WHERE,
   *  never from this count, once `afterId` is present (see supabase-server.ts's
   *  `fetchPublicWorkspaceResources`). */
  offset: number;
  /** The last row's own (effective_priority, added_date, id) triple — present once at least one
   *  row has been fetched. Forwarded to the route, which attaches it directly to migration 306's
   *  keyset WHERE (see supabase-server.ts's `PUBLIC_CURSOR_SCOPED_RPCS`). */
  afterPriority?: string;
  afterAddedDate?: string | null;
  afterId?: string;
}

/** The cursor for the very first page: no rows consumed yet, no "after" row. */
export const FIRST_LISTING_CURSOR: ListingCursor = { offset: 0 };

/** Builds the cursor for the NEXT page from a page's own last row (or `null` when the page was
 *  empty, or shorter than a full page — see route.ts's `nextCursor` for how "no more pages"
 *  is actually signalled; this helper is pure row→cursor math only). */
export function cursorAfter(previous: ListingCursor, rows: Resource[]): ListingCursor {
  if (rows.length === 0) return previous;
  const last = rows[rows.length - 1];
  return {
    offset: previous.offset + rows.length,
    afterPriority: last.priority,
    afterAddedDate: last.added ?? null,
    afterId: last.id,
  };
}

/**
 * Encodes a cursor for the wire as a URL query-param VALUE (JSON, `encodeURIComponent`-escaped —
 * NOT base64: this module is imported by both the server route AND client components
 * (RegulationsLedger.tsx via useLedgerInfiniteQuery), and `Buffer` is not available in a browser
 * bundle without a polyfill this app does not carry. `encodeURIComponent`/`decodeURIComponent`
 * are universal in both environments and sufficient for a small, non-binary JSON object). Never
 * throws — a cursor is small, JSON-serializable data the client only ever received from this same
 * module's own `decodeListingCursor`/`cursorAfter`, never user input.
 */
export function encodeListingCursor(cursor: ListingCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

/** Decodes a cursor from the wire. Never throws: malformed/tampered input degrades to the first
 *  page (offset 0, no "after" row) rather than a 500 — a query param is client-controlled input
 *  and a decode failure must never take the ledger down. */
export function decodeListingCursor(raw: string | null | undefined): ListingCursor {
  if (!raw) return FIRST_LISTING_CURSOR;
  try {
    const json = decodeURIComponent(raw);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || typeof parsed.offset !== "number" || parsed.offset < 0) {
      return FIRST_LISTING_CURSOR;
    }
    const cursor: ListingCursor = { offset: parsed.offset };
    if (typeof parsed.afterPriority === "string" && parsed.afterPriority.length > 0) {
      cursor.afterPriority = parsed.afterPriority;
    }
    if (typeof parsed.afterId === "string" && parsed.afterId.length > 0) {
      cursor.afterId = parsed.afterId;
    }
    if (typeof parsed.afterAddedDate === "string" || parsed.afterAddedDate === null) {
      cursor.afterAddedDate = parsed.afterAddedDate;
    }
    return cursor;
  } catch {
    return FIRST_LISTING_CURSOR;
  }
}
