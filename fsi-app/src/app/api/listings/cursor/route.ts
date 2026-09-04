import { NextRequest, NextResponse } from "next/server";
import { getListingsOnly } from "@/lib/data";
import {
  LIST_PAGE_SIZE,
  decodeListingCursor,
  encodeListingCursor,
  cursorAfter,
  toLedgerRowPayload,
} from "@/lib/list-pagination";
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { resolveOrgIdFromCookies } from "@/lib/api/org";

/**
 * GET /api/listings/cursor?surface=regulations&cursor=<opaque>
 *
 * PERF-12 (2026-09-04, ADR-027 §2) — replaces RegulationsLedger's old one-shot
 * `/api/listings/rest?offset=` remainder fetch (LIST_REMAINDER_LIMIT=5000, DELETED — see
 * list-pagination.ts's own header) with true page-at-a-time cursor pagination, consumed by
 * `useLedgerInfiniteQuery` (TanStack Query's `useInfiniteQuery`) via `fetchNextPage`.
 *
 * Regulations-only today (`surface` accepts only "regulations"): Operations/Market/Research keep
 * their existing, unaudited-as-broken mechanisms unchanged (PERF-11 confirmed their live corpora —
 * 25/55/39 items — are under the first-page threshold; see /api/listings/rest, still Operations'
 * route). A second `surface` value is additive here whenever a future audit confirms one of those
 * three needs the same treatment — nothing about this route's shape is Regulations-specific
 * besides the domain filter below.
 *
 * CURSOR CONTRACT (list-pagination.ts's own header): the cursor is opaque to the CLIENT — it never
 * inspects or builds one field-by-field, only round-trips whatever `nextCursor` this route handed
 * back. What the cursor carries, and how THIS route uses it, is allowed to change (specifically:
 * once migration 306 is live, `getListingsOnly` starts honoring `afterPriority`/`afterAddedDate`/
 * `afterId` for a true keyset WHERE instead of a plain `.range(offset, ...)` — see
 * supabase-server.ts's CURSOR_SCOPED_RPCS fail-soft ladder) with ZERO change to this route's
 * response shape or to the client hook that calls it.
 *
 * Response: `{ resources, archived, nextCursor, hasMore }`. `nextCursor` is `null` when this page
 * came back shorter than LIST_PAGE_SIZE (the corpus is exhausted) — `useLedgerInfiniteQuery`'s
 * `getNextPageParam` reads exactly that field, never re-derives "is there more" from row counts on
 * its own.
 *
 * force-dynamic: reads cookies (via resolveOrgIdFromCookies inside getListingsOnly), so this can
 * never be statically generated — same constraint /api/listings/rest already documents.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const surface = searchParams.get("surface") ?? "";
  if (surface !== "regulations") {
    return NextResponse.json(
      { error: 'surface must be "regulations" — /api/listings/rest still serves operations' },
      { status: 400 }
    );
  }

  const cursor = decodeListingCursor(searchParams.get("cursor"));

  // PERF-12 (2026-09-04, ADR-027 §5/item 4): the client (useLedgerInfiniteQuery, sourced from
  // useWorkspaceBootstrap's own session-resolved orgId) MAY forward its last-known org id as
  // `X-Org-Id` — verified here against resolveOrgIdFromCookies(), the SAME request-scoped cache()
  // resolver getListingsOnly itself uses below to actually scope the query. The header is NEVER
  // trusted as input to the query itself (getListingsOnly ignores it entirely, exactly as before
  // this lane) — this check exists only to catch a client whose cached org id has drifted from its
  // current session (e.g. an org switch) and tell it to reload, rather than silently letting a
  // TanStack Query cache keyed only by `surface` (ledgerListingQueryKey) go on serving pages under
  // an org the session no longer agrees with. A MISSING header (bootstrap still loading, or a caller
  // that predates this header) is "nothing to verify" — not a mismatch — so it never 409s.
  const claimedOrgId = request.headers.get("x-org-id");
  if (claimedOrgId) {
    const sessionOrgId = await resolveOrgIdFromCookies();
    if (sessionOrgId !== claimedOrgId) {
      return NextResponse.json(
        { error: "org mismatch — the session's org no longer matches the client's cached org id" },
        { status: 409 }
      );
    }
  }

  try {
    const result = await getListingsOnly({
      limit: LIST_PAGE_SIZE,
      offset: cursor.offset,
      domain: REGULATIONS_DOMAIN,
      afterPriority: cursor.afterPriority,
      afterAddedDate: cursor.afterAddedDate,
      afterId: cursor.afterId,
    });

    if (result._error) {
      // Non-fatal: log with full detail and still return whatever rows came back (possibly none)
      // rather than a 500 — the caller keeps every page it already holds either way (same
      // fail-soft contract /api/listings/rest already established for this exact ledger).
      console.error(
        `[api/listings/cursor] surface=${surface} offset=${cursor.offset} fetch degraded: ${result._error} (trigger=${result._fallbackTrigger ?? "none"})`
      );
    }

    // hasMore/the next cursor are derived from the RAW fetch (result.resources, BEFORE the domain
    // filter below), not the filtered set — deliberately. `offset` (the fail-soft floor's own
    // pagination unit) is a position within the RAW `.range()` result, and until migration 305 is
    // live the domain filter below runs purely client-side (the RPC itself is still unscoped), so
    // a fetched page can legitimately contain FEWER than LIST_PAGE_SIZE regulations while the raw
    // corpus still has more rows past this window — using the filtered count here would signal
    // "exhausted" early and silently truncate the ledger. Once migrations 305+306 are live the RPC
    // itself only ever returns domain-matching rows, so raw and filtered are identical and this
    // distinction becomes a no-op — correct in both eras with the same code.
    const hasMore = result.resources.length >= LIST_PAGE_SIZE;
    const next = cursorAfter(cursor, result.resources);
    const nextCursor = hasMore ? encodeListingCursor(next) : null;

    // Defensive domain filter (mirrors /api/listings/rest's own pre-306/pre-305 backstop): a no-op
    // once migrations 305+306 are live and every row already matches; the render-correctness floor
    // before then. Applied AFTER the hasMore/cursor computation above — see that comment.
    const resources = result.resources.filter((r) => r.domain === REGULATIONS_DOMAIN);
    const archived = result.archived.filter((r) => r.domain === REGULATIONS_DOMAIN);

    const body = JSON.stringify({
      resources: resources.map(toLedgerRowPayload),
      archived: archived.map(toLedgerRowPayload),
      nextCursor,
      hasMore,
    });

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        // private: per-org (resolveOrgIdFromCookies-scoped), matching /api/listings/rest's own
        // precedent. No stale-while-revalidate here (unlike the old remainder route): each page is
        // a small, cheap, cursor-identified slice fetched on demand as the user actually scrolls,
        // not a 5-minute-cacheable "the rest of everything" blob — caching it would also risk
        // returning a stale nextCursor pointing at a row a later mutation moved.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error(`[api/listings/cursor] surface=${surface} offset=${cursor.offset} threw:`, e);
    return NextResponse.json({ error: "internal error fetching the next page" }, { status: 500 });
  }
}
