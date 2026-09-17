// GET /api/coverage/entries?surface=regulations|operations|market_intel|research
//
// The full Coverage Index entry set for the /admin Coverage tab. ADMIN-ONLY (operator ruling 2026-07-29:
// the catalogue and all coverage/census tooling are admin-only; customer surfaces carry verified briefs
// exclusively — no customer-reachable endpoint serves census data). Server-side gated: requireAuth (401
// unauthenticated) + isPlatformAdmin (403 non-admin), same as /api/admin/promotion-policy. Read-only.
import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getCoverageEntries, COVERAGE_SURFACES, type CoverageSurface } from "@/lib/coverage/index-data";
import { isRefusal, requireUserRoute } from "@/lib/api/route-guard";

export async function GET(request: NextRequest) {
  const auth = await requireUserRoute(request);
  if (isRefusal(auth)) return auth;
  const admin = await isPlatformAdmin(auth.userId, getServiceSupabase());
  if (!admin) return NextResponse.json({ error: "Platform admin access required" }, { status: 403 });

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
