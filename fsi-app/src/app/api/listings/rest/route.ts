import { NextRequest, NextResponse } from "next/server";
import { getResourcesOnly, getListingsOnly } from "@/lib/data";
import { LIST_REMAINDER_LIMIT } from "@/lib/list-pagination";

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
 * mapping required.
 *
 * force-dynamic: reads cookies (via resolveOrgIdFromCookies inside the
 * reused fetchers), so this can never be statically generated.
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

    return NextResponse.json({
      resources: result.resources,
      archived: result.archived,
    });
  } catch (e) {
    console.error(`[api/listings/rest] surface=${surface} offset=${offset} threw:`, e);
    return NextResponse.json({ error: "internal error fetching remainder" }, { status: 500 });
  }
}
