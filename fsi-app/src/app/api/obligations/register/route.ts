import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { fetchObligationRegisterPage, DUE_WINDOWS } from "@/lib/obligations/read-register.mjs";

/**
 * GET /api/obligations/register?jurisdiction=&mode=&bindingPosition=&dueWindow=&offset=&limit=
 *
 * PERF-11 (2026-09-04). The register's "Load more" / filter-change round trip. ObligationRegister.tsx
 * (server component) renders only the FIRST PAGE on the initial response (list variant: offset 0, no
 * filters, the default LIST_FIRST_PAGE_SIZE-aligned page); ObligationRegisterFilterBar.tsx (client) calls
 * this route on every filter change and on "Load more", appending or replacing rows as appropriate. This
 * is the SAME "small first-paint page + a dedicated client fetch for the rest" mechanism FIRSTPAGE built
 * for /regulations (that one is Resource rows via /api/listings/rest; this one is ObligationRow via a
 * dedicated route because the shape is different and the underlying table is a different mechanism, per
 * ObligationRegister.tsx's own header — "NOT A DUPLICATE OF UpcomingObligationsStrip").
 *
 * REQUEST-SCOPED CLIENT, RLS APPLIES — never service-role, same posture ObligationRegister.tsx and
 * read-register.mjs's own header require of every caller of fetchObligationRegister /
 * fetchObligationRegisterPage.
 *
 * Response shape: `{ rows: ObligationRow[], total: number }` — `total` is the corpus-wide count AFTER the
 * requested filters and BEFORE the offset/limit slice, so the client can render an honest "N of M" and
 * know whether a further "Load more" click would return anything.
 *
 * force-dynamic: reads cookies via createSupabaseServerClient, can never be statically generated.
 */
export const dynamic = "force-dynamic";

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const jurisdiction = searchParams.get("jurisdiction");
  const mode = searchParams.get("mode");
  const bindingPosition = searchParams.get("bindingPosition");
  const dueWindowRaw = searchParams.get("dueWindow");
  const dueWindow = dueWindowRaw && (DUE_WINDOWS as readonly string[]).includes(dueWindowRaw) ? dueWindowRaw : "all";
  const offset = parseIntParam(searchParams.get("offset"), 0, 0, 100000);
  const limit = parseIntParam(searchParams.get("limit"), 60, 1, 500);

  try {
    const supabase = await createSupabaseServerClient();
    const { rows, total } = await fetchObligationRegisterPage(supabase, {
      jurisdiction,
      mode,
      bindingPosition,
      dueWindow,
      offset,
      limit,
    });

    return NextResponse.json(
      { rows, total },
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
    console.error(`[api/obligations/register] offset=${offset} limit=${limit} threw:`, e);
    return NextResponse.json({ error: "internal error fetching obligations" }, { status: 500 });
  }
}
