import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getResourcesOnly, getListingsOnly } from "@/lib/data";
import { LIST_REMAINDER_LIMIT, toLedgerRowPayload } from "@/lib/list-pagination";

/**
 * GET /api/listings/rest?surface=regulations|operations&offset=60
 *
 * Serves "the rest" of a ledger surface after the server has already
 * rendered the first LIST_FIRST_PAGE_SIZE rows (see regulations/page.tsx,
 * operations/page.tsx). RegulationsLedger / OperationsLedger call this on
 * mount and append the result to the rows they already hold.
 *
 * Reuses the exact data-access functions the pages themselves call —
 * getListingsOnly for /regulations, getResourcesOnly for /operations —
 * including their own orgId resolution (resolveOrgIdFromCookies), so this
 * route can never see a different workspace slice than the page that
 * requested it, and there is no second query implementation to keep in
 * sync with supabase-server.ts.
 *
 * Response shape is `{ resources, archived }`, the SAME Resource[] shape
 * the ledgers already consume from the initial SSR payload — no client-side
 * mapping required, aside from each resource now being the TRIMMED ledger-row
 * shape (see toLedgerRowPayload's own header) rather than the full row.
 *
 * force-dynamic: reads cookies (via resolveOrgIdFromCookies inside the
 * reused fetchers), so this can never be statically generated.
 *
 * PERF-3 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md item (3)):
 *   - SERVER-SIDE caching for this exact (org, surface, offset) triple already exists —
 *     src/lib/data.ts's `cachedResourcesOnly`/`cachedListingsOnly` wrap getResourcesOnly/
 *     getListingsOnly (the two functions this route calls, unchanged) in `unstable_cache`, keyed
 *     by `(orgId, page)` where `page` is `{limit, offset}`, tagged APP_DATA_TAG, 60s revalidate —
 *     landed same-day by an earlier PERF-train pass (see that file's own header). This route was
 *     already inheriting that cache before this lane touched it; re-wrapping it here would
 *     duplicate an existing module, which the lane contract forbids. What was MISSING, added here:
 *     (a) HTTP-level Cache-Control + ETag on the RESPONSE, so a repeat client-side fetch to the
 *     SAME (surface, offset) within the browser's cache window skips the network round trip
 *     entirely instead of merely hitting a warm server-side cache; (b) trimming each row to the
 *     fields the ledgers actually render (toLedgerRowPayload).
 *   - `private`: this payload is per-org (resolveOrgIdFromCookies-scoped), matching next.config.ts's
 *     existing precedent for every dynamic route in this app — never cacheable by a shared/CDN
 *     cache. `max-age=300, stale-while-revalidate=600`: the browser can reuse the SAME (surface,
 *     offset) response for up to 5 minutes without asking the network, and up to 10 minutes while
 *     revalidating in the background. TRADE-OFF, stated honestly: unlike the server-side
 *     unstable_cache above, a browser HTTP cache is NOT reachable by revalidateTag — a mint event
 *     that changes these rows will not evict an already-cached browser response early, so a viewer
 *     mid-session could see remainder rows up to 5 minutes stale after a mint. Accepted because
 *     this endpoint only ever supplies rows PAST the first-paint page (the first 60, freshest-first,
 *     are always server-rendered live); the remainder is lower-stakes, append-only content.
 */
export const dynamic = "force-dynamic";

const SURFACES = new Set(["regulations", "operations"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const surface = searchParams.get("surface") ?? "";
  const offsetRaw = searchParams.get("offset") ?? "";
  const offset = Number.parseInt(offsetRaw, 10);

  if (!SURFACES.has(surface)) {
    return NextResponse.json(
      { error: `surface must be one of: ${[...SURFACES].join("|")}` },
      { status: 400 }
    );
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "offset must be a non-negative integer" }, { status: 400 });
  }

  try {
    const page = { limit: LIST_REMAINDER_LIMIT, offset };
    const result =
      surface === "regulations"
        ? await getListingsOnly(page)
        : await getResourcesOnly(page);

    if (result._error) {
      // Non-fatal: log with full detail (message/details/hint/code already
      // baked into fetcher-level logs) and still return whatever rows came
      // back (possibly none) rather than a 500 — the caller keeps its first
      // 60 rows either way.
      console.error(
        `[api/listings/rest] surface=${surface} offset=${offset} fetch degraded: ${result._error} (trigger=${result._fallbackTrigger ?? "none"})`
      );
    }

    const body = JSON.stringify({
      resources: result.resources.map(toLedgerRowPayload),
      archived: result.archived.map(toLedgerRowPayload),
    });
    // Weak ETag over the trimmed body: two identical (org, surface, offset) responses (the common
    // case within the cache window, since the server-side cache above returns the same object) hash
    // identically, so a conditional revalidation request costs one hash compare, not a re-fetch.
    const etag = `W/"${createHash("sha1").update(body).digest("hex")}"`;
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=300, stale-while-revalidate=600" },
      });
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        ETag: etag,
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    console.error(`[api/listings/rest] surface=${surface} offset=${offset} threw:`, e);
    return NextResponse.json({ error: "internal error fetching remainder" }, { status: 500 });
  }
}
