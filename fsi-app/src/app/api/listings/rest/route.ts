import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getResourcesOnly } from "@/lib/data";
import { toLedgerRowPayload } from "@/lib/list-pagination";

// PERF-12 (2026-09-04, ADR-027 §2): Regulations-only cap this route used to share with Operations
// (LIST_REMAINDER_LIMIT, list-pagination.ts) is DELETED along with Regulations' one-shot remainder
// fetch itself — RegulationsLedger.tsx now calls /api/listings/cursor (true page-at-a-time keyset
// pagination via useLedgerInfiniteQuery). This route narrows to Operations only. Operations keeps
// its EXISTING one-shot-remainder shape unmodified: PERF-11 (2026-09-04) confirmed Operations' live
// corpus (25 items) is well under LIST_FIRST_PAGE_SIZE, so it carries no structural "load
// everything" defect this lane's audit named — a local literal (not a shared constant two ledgers
// used to reach for identically, which is what made deleting one half of that sharing safe) is
// kept here rather than re-exporting a Regulations-flavored cap under a new name.
const OPERATIONS_REMAINDER_LIMIT = 5000;

/**
 * GET /api/listings/rest?surface=operations&offset=60
 *
 * Serves "the rest" of the Operations D1 regulation cross-references after the server has already
 * rendered the first LIST_FIRST_PAGE_SIZE rows (see operations/page.tsx). OperationsLedger calls
 * this on mount and appends the result to the rows it already holds.
 *
 * Reuses the exact data-access function the page itself calls — getResourcesOnly — including its
 * own orgId resolution (resolveOrgIdFromCookies), so this route can never see a different
 * workspace slice than the page that requested it, and there is no second query implementation to
 * keep in sync with supabase-server.ts.
 *
 * Response shape is `{ resources, archived }`, the SAME Resource[] shape OperationsLedger already
 * consumes from the initial SSR payload — no client-side mapping required, aside from each
 * resource now being the TRIMMED ledger-row shape (see toLedgerRowPayload's own header) rather
 * than the full row.
 *
 * force-dynamic: reads cookies (via resolveOrgIdFromCookies inside getResourcesOnly), so this can
 * never be statically generated.
 *
 * PERF-3 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md item (3)):
 *   - SERVER-SIDE caching for this exact (org, surface, offset) triple already exists —
 *     src/lib/data.ts's `cachedResourcesOnly` wraps getResourcesOnly (the function this route
 *     calls, unchanged) in `unstable_cache`, keyed by `(orgId, page)` where `page` is
 *     `{limit, offset}`, tagged APP_DATA_TAG, 60s revalidate — landed same-day by an earlier
 *     PERF-train pass (see that file's own header). This route was already inheriting that cache
 *     before this lane touched it; re-wrapping it here would duplicate an existing module, which
 *     the lane contract forbids. What was MISSING, added here: (a) HTTP-level Cache-Control + ETag
 *     on the RESPONSE, so a repeat client-side fetch to the SAME (surface, offset) within the
 *     browser's cache window skips the network round trip entirely instead of merely hitting a
 *     warm server-side cache; (b) trimming each row to the fields the ledgers actually render
 *     (toLedgerRowPayload).
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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const surface = searchParams.get("surface") ?? "";
  const offsetRaw = searchParams.get("offset") ?? "";
  const offset = Number.parseInt(offsetRaw, 10);

  if (surface !== "operations") {
    return NextResponse.json(
      { error: 'surface must be "operations" — /api/listings/cursor now serves regulations' },
      { status: 400 }
    );
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "offset must be a non-negative integer" }, { status: 400 });
  }

  try {
    const result = await getResourcesOnly({ limit: OPERATIONS_REMAINDER_LIMIT, offset });

    if (result._error) {
      // Non-fatal: log with full detail (message/details/hint/code already
      // baked into fetcher-level logs) and still return whatever rows came
      // back (possibly none) rather than a 500 — the caller keeps its first
      // LIST_FIRST_PAGE_SIZE rows either way.
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
