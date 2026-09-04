import { NextRequest, NextResponse } from "next/server";
import { getPublicListingsOnly } from "@/lib/data";
import {
  LIST_PAGE_SIZE,
  decodeListingCursor,
  encodeListingCursor,
  cursorAfter,
  toLedgerRowPayload,
} from "@/lib/list-pagination";
import { REGULATIONS_DOMAIN } from "@/lib/domains";

/**
 * GET /api/listings/cursor?surface=regulations&cursor=<opaque>
 *
 * PERF-12 (2026-09-04, ADR-027 §2) — replaces RegulationsLedger's old one-shot
 * `/api/listings/rest?offset=` remainder fetch (LIST_REMAINDER_LIMIT=5000, DELETED — see
 * list-pagination.ts's own header) with true page-at-a-time cursor pagination, consumed by
 * `useLedgerInfiniteQuery` (TanStack Query's `useInfiniteQuery`) via `fetchNextPage`.
 *
 * RECONCILE (2026-09-04, item 1, ADR-027 §2 + PERF-10's org-independent architecture): a scroll page
 * needs no per-viewer data — the same reason /regulations itself was moved off `getListingsOnly`
 * (org-scoped, cookies-dependent) onto `getPublicListingsOnly` (PERF-10's zero-argument public RPC).
 * PERF-12 originally built this route on the ORG-scoped RPC, forwarding an `X-Org-Id` header for the
 * server to verify against the session — that entire mechanism (the header, `resolveOrgIdFromCookies`
 * here, the org-scoped keyset variant of `get_workspace_intelligence_listings`) is deleted. This route
 * now calls the SAME org-independent, cacheable public RPC PERF-10 built for the first page
 * (`get_workspace_intelligence_listings_public`, migration 306), just with the keyset triple attached
 * — see supabase-server.ts's `fetchPublicWorkspaceResources` and `PUBLIC_CURSOR_SCOPED_RPCS`. Reading
 * no cookie and needing no per-request auth is what makes this route itself cacheable
 * (`Cache-Control: public, s-maxage=...` below) — an org-scoped response never could be, because two
 * different orgs' overrides could otherwise collide in one shared cache entry.
 *
 * Per-viewer overrides (priority override, archive state, owner, notes) are NOT part of this
 * response, by design — same split as the first page: the client merges them in from
 * useWorkspaceOverridesHydration()/mergeWithOverrides (resourceStore.ts), never baked into a
 * server-cached response keyed only by page/cursor.
 *
 * Regulations-only today (`surface` accepts only "regulations"): Operations/Market/Research keep
 * their existing, unaudited-as-broken mechanisms unchanged (PERF-11 confirmed their live corpora —
 * 25/55/39 items — are under the first-page threshold; see /api/listings/rest, still Operations'
 * route). A second `surface` value is additive here whenever a future audit confirms one of those
 * three needs the same treatment — nothing about this route's shape is Regulations-specific besides
 * the domain filter below.
 *
 * CURSOR CONTRACT (list-pagination.ts's own header): the cursor is opaque to the CLIENT — it never
 * inspects or builds one field-by-field, only round-trips whatever `nextCursor` this route handed
 * back. `getPublicListingsOnly` forwards `afterPriority`/`afterAddedDate`/`afterId` straight through
 * to migration 306's keyset WHERE (a true identity-scoped filter, not a `.range(offset, ...)` reread)
 * — see supabase-server.ts's `ResourcePage.afterPriority` header.
 *
 * Response: `{ resources, archived, nextCursor, hasMore }`. `nextCursor` is `null` when this page
 * came back shorter than LIST_PAGE_SIZE (the corpus is exhausted) — `useLedgerInfiniteQuery`'s
 * `getNextPageParam` reads exactly that field, never re-derives "is there more" from row counts on
 * its own.
 *
 * FAILS LOUD (RECONCILE, 2026-09-04, item 3): a real RPC failure (wrong signature, dropped function)
 * is a genuine defect now that the coordinator guarantees every migration in this train applies
 * before this code merges — it is never "306 probably hasn't landed yet, degrade quietly." This route
 * therefore returns 500 (with the underlying Supabase-derived error logged) rather than 200 with an
 * empty/short page standing in for a real failure, which would otherwise read to a scrolling viewer
 * as "you've reached the end of the list" when the true state is "the server failed to answer."
 *
 * No `force-dynamic`: this route reads no cookie and needs no per-request Dynamic API — see the
 * cacheable-response note above.
 */
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

  try {
    const result = await getPublicListingsOnly({
      limit: LIST_PAGE_SIZE,
      offset: cursor.offset,
      domain: REGULATIONS_DOMAIN,
      afterPriority: cursor.afterPriority,
      afterAddedDate: cursor.afterAddedDate,
      afterId: cursor.afterId,
    });

    if (result._error) {
      // FAILS LOUD (item 3): a real fetch failure, not a legitimate empty page — 500, not a
      // degraded 200. getPublicListingsOnly's own catch already logged the underlying exception;
      // this line adds the request context (surface/cursor) a bare stack trace wouldn't carry.
      console.error(
        `[api/listings/cursor] surface=${surface} offset=${cursor.offset} fetch failed: ${result._error} (trigger=${result._fallbackTrigger ?? "none"})`
      );
      return NextResponse.json(
        { error: "failed to fetch the next page" },
        { status: 500 }
      );
    }

    // hasMore/the next cursor are derived from the RPC's own returned count. Migration 306's
    // `get_workspace_intelligence_listings_public` is called WITH `p_domain` (see
    // fetchPublicWorkspaceResources), so every returned row already matches REGULATIONS_DOMAIN —
    // raw and filtered counts are identical, unlike the pre-305/306 era this route's own history
    // used to need to reconcile.
    const hasMore = result.resources.length >= LIST_PAGE_SIZE;
    const next = cursorAfter(cursor, result.resources);
    const nextCursor = hasMore ? encodeListingCursor(next) : null;

    // Defensive domain assertion, not a scoping mechanism: migration 306's `p_domain` argument is
    // what actually scopes this query server-side now (see the RPC call above) — this filter is a
    // correctness backstop against a future regression (e.g. someone calling this route path without
    // the domain arg), not dead code compensating for an unscoped RPC the way it did pre-306.
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
        // public + s-maxage/stale-while-revalidate (RECONCILE item 1): this response carries no
        // per-viewer data and reads no cookie (see the file header), so — unlike the old org-scoped
        // "private, no-store" response — it is safe to cache at a shared edge/CDN layer, keyed by the
        // full URL (surface + cursor), matching the 60s revalidate window getPublicListingsOnly's own
        // unstable_cache entry already uses server-side (data.ts's cachedPublicListingsOnly). A stale
        // read within the window returns a page that is at most 60s old, the same staleness bound the
        // first page (/regulations itself) already accepts.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    console.error(`[api/listings/cursor] surface=${surface} offset=${cursor.offset} threw:`, e);
    return NextResponse.json({ error: "internal error fetching the next page" }, { status: 500 });
  }
}
