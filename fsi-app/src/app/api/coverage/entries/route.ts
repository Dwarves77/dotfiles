// GET /api/coverage/entries?surface=regulations|operations|market_intel|research
//
// Lazy-load the FULL per-surface Coverage Index entry set for the customer panel (client-side sort/filter
// over all rows). Kept OFF the page payload so a default-closed panel doesn't inflate every surface's RSC
// load. This is CUSTOMER READ-ONLY CONTENT (dispatch 3): any authenticated user may read; the payload
// carries titles/jurisdiction/type/tags/identity only — NO promote/action field. All promotion controls
// live under /api/admin/** behind the admin gate; this route never mutates and never authorizes spend.
//
// Auth: requireAuth (401 unauthenticated) + the standard per-user rate limiter. No admin gate — the
// catalogue is customer content, same visibility class as the surface it sits on.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getCoverageEntries, COVERAGE_SURFACES, type CoverageSurface } from "@/lib/coverage/index-data";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const surfaceParam = request.nextUrl.searchParams.get("surface");
  const surface = surfaceParam && (COVERAGE_SURFACES as readonly string[]).includes(surfaceParam)
    ? (surfaceParam as CoverageSurface)
    : undefined;

  try {
    const entries = await getCoverageEntries(surface);
    return NextResponse.json(
      { entries, total: entries.length, surface: surface ?? "all" },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (e) {
    console.warn("/api/coverage/entries error:", e);
    return NextResponse.json({ error: "Coverage entries temporarily unavailable." }, { status: 503 });
  }
}
