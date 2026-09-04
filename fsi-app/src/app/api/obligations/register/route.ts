import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import {
  fetchObligationRegister,
  fetchObligationRegisterPage,
  fetchForwardEventCount,
  fetchRegisterFacetOptions,
  DUE_WINDOWS,
} from "@/lib/obligations/read-register.mjs";
import { withErrorCapture } from "@/lib/telemetry/capture-error";

/**
 * GET /api/obligations/register?itemId=&jurisdiction=&mode=&bindingPosition=&dueWindow=&offset=&limit=
 *
 * PERF-MERGE (2026-09-04) CONVERGED DESIGN — one route serving both the design PERF-11 built (paged
 * list variant, filters, an honest corpus-wide `total`) and the mount PERF-10 needed (a Route Handler
 * ObligationRegister.tsx can `fetch()` from a CLIENT component, so the register never runs a Dynamic
 * API — cookies() via createSupabaseServerClient — inside /regulations' own server render, which is
 * what forced that page `ƒ` before this lane).
 *
 * TWO VARIANTS, ONE ROUTE (PERF-10's contract, kept): no `itemId` = list variant, the register section
 * on /regulations. `?itemId=<uuid-or-legacy_id>` = detail variant, one item's own obligations (mirrors
 * ObligationRegister's `variant="detail"` mount on the item detail pages — legacy_id resolved to a real
 * uuid here, the same resolution the pre-PERF-10 server component performed inline).
 *
 * LIST VARIANT IS PERF-11's PAGED DESIGN, UNCHANGED IN SHAPE: ObligationRegister.tsx fetches this route
 * ONCE on mount for the first page (offset 0, no filters — LIST_FIRST_PAGE_SIZE rows, soonest-due
 * first); ObligationRegisterFilterBar.tsx (unmodified by this merge) then calls this same route
 * directly on every filter change (offset 0, new filters, REPLACES `rows`) and on "Load more"
 * (`offset = rows.length`, current filters, APPENDS) — see that component's own header. Every request
 * runs the same `fetchObligationRegisterPage`/`filterJoinedRowsPage` server-side logic; filter
 * correctness is never approximated client-side and a fetch in flight never blanks what is already
 * shown.
 *
 * META FIELDS (`jurisdictionOptions`, `modeOptions`, `sourceEventCount`) ride along ONLY on the true
 * "first ever load" shape — list variant, offset 0, no filters applied — since that is the one call
 * ObligationRegister.tsx makes itself; every subsequent FilterBar-driven call (a filter change or "Load
 * more") omits them (`undefined` in the JSON body — cheaper than re-running two extra queries a caller
 * that already has the facets from its first response will never read again; see
 * fetchRegisterFacetOptions's own header for why the facets must be independent of the loaded page).
 *
 * REQUEST-SCOPED CLIENT, RLS APPLIES — never service-role, same posture read-register.mjs's own header
 * requires of every caller of fetchObligationRegister / fetchObligationRegisterPage.
 *
 * force-dynamic: reads cookies via createSupabaseServerClient, can never be statically generated — this
 * ROUTE stays dynamic; what changed under PERF-10 is that a page merely `fetch()`ing a dynamic Route
 * Handler from the client does NOT make the PAGE dynamic (ADR-026 Follow-up / this lane's REPORT name
 * the mechanism), which is the entire reason ObligationRegister.tsx's own read moved here.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function handleGET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const itemIdParam = searchParams.get("itemId");
  const variant: "list" | "detail" = itemIdParam ? "detail" : "list";
  const jurisdiction = searchParams.get("jurisdiction");
  const mode = searchParams.get("mode");
  const bindingPosition = searchParams.get("bindingPosition");
  const dueWindowRaw = searchParams.get("dueWindow");
  const dueWindow = dueWindowRaw && (DUE_WINDOWS as readonly string[]).includes(dueWindowRaw) ? dueWindowRaw : "all";
  const offset = parseIntParam(searchParams.get("offset"), 0, 0, 100000);
  const limit = parseIntParam(searchParams.get("limit"), 60, 1, 500);
  // The unfiltered-first-page shape ObligationRegister.tsx's own initial mount always requests —
  // see this file's header, "META FIELDS".
  const isFirstLoad =
    variant === "list" && offset === 0 && !jurisdiction && !mode && !bindingPosition && dueWindow === "all";

  try {
    const supabase = await createSupabaseServerClient();

    if (variant === "detail") {
      // legacy_id -> uuid resolution, via the SAME request-scoped client — mirrors
      // UpcomingObligationsStrip's/the pre-PERF-10 server component's own resolution, including its RLS
      // reasoning: intelligence_items_read already scopes anon/authenticated reads to
      // provenance_status='verified' AND is_archived IS NOT TRUE, so this lookup needs no elevated
      // client, and an id that does not resolve yields no rows (honest omission, never a leak or error).
      let resolvedItemId: string | undefined = itemIdParam ?? undefined;
      if (itemIdParam && !UUID_RE.test(itemIdParam)) {
        const { data } = await supabase.from("intelligence_items").select("id").eq("legacy_id", itemIdParam).maybeSingle();
        resolvedItemId = data?.id ?? undefined;
      }
      if (!resolvedItemId) {
        return NextResponse.json({ rows: [], total: 0 }, { headers: { "Cache-Control": "private, no-store" } });
      }
      const rows = await fetchObligationRegister(supabase, { itemId: resolvedItemId, limit: 200 });
      return NextResponse.json({ rows, total: rows.length }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const { rows, total } = await fetchObligationRegisterPage(supabase, {
      jurisdiction,
      mode,
      bindingPosition,
      dueWindow,
      offset,
      limit,
    });

    let sourceEventCount: number | null | undefined;
    let jurisdictionOptions: string[] | undefined;
    let modeOptions: string[] | undefined;
    if (isFirstLoad) {
      if (total === 0) sourceEventCount = await fetchForwardEventCount(supabase);
      const facets = await fetchRegisterFacetOptions(supabase);
      jurisdictionOptions = facets.jurisdictions;
      modeOptions = facets.modes;
    }

    return NextResponse.json(
      { rows, total, sourceEventCount, jurisdictionOptions, modeOptions },
      {
        headers: {
          // Same trade-off /api/listings/rest states for itself: this is per-viewer content (RLS-scoped
          // via the request-scoped client), never a shared/CDN cache; short browser cache so a rapid
          // repeat of the same (filters, offset) within one session skips a network round trip.
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    console.error(`[api/obligations/register] variant=${variant} offset=${offset} limit=${limit} threw:`, e);
    return NextResponse.json({ error: "internal error fetching obligations" }, { status: 500 });
  }
}

export const GET = withErrorCapture("/api/obligations/register", handleGET);
