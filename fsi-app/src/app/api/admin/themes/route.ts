// GET /api/admin/themes
//
// Returns the last connection-cluster pass (flywheel U1/U2): connection_themes ordered by
// convergence desc, plus the most recent connection_theme_runs row so the UI can show when/how the
// snapshot was computed. No compute happens here — connection_themes is a cache U2's
// scripts/connections/analyze-corpus.mjs already replaced wholesale; this route only reads it.
//
// Query params:
//   limit (default 50, max 500) — cap returned rows (themes are pre-sorted by convergence desc, so
//     this is "top N most convergent themes", matching the intersections route's limit semantics)
//
// Auth: requireAuth + rate limit + platform-admin gate (mirrors admin/intersections, admin/coverage).
// Superseding note (flywheel U3, build plan): detect_intersections (migration 023's RPC, still live
// and still the source for admin/intersections) is NOT touched by this route or retired here — it
// scores item-pairs from operational_scenario_tags/compliance_object_tags, a different signal from
// connection_themes' clustered graph. U3 adds this route alongside it; deciding whether/how to fold
// admin/intersections into the themes view is the "supersession" the build plan names, and is a UI/UX
// call (D1, customer surface placement) deliberately left open per the plan, not a data-layer change.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { computeThemeStats } from "@/lib/connections/theme-stats.mjs";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 50)) : 50;

  const supabase = getServiceSupabase();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data, error } = await supabase
    .from("connection_themes")
    .select("id, computed_at, member_ids, dominant_signals, surfaces, density, convergence, pivots")
    .order("convergence", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const themes = data || [];

  const { data: runRows, error: runError } = await supabase
    .from("connection_theme_runs")
    .select("id, started_at, finished_at, status, nodes_read, edges_read, nodes_clustered, edges_used, themes_written, gaps_flagged, rounds")
    .order("started_at", { ascending: false })
    .limit(1);

  // A run-row read failure is non-fatal — the themes snapshot is still valid without its provenance
  // banner; only surface it as a soft null rather than failing the whole route.
  const lastRun = !runError && runRows && runRows.length ? runRows[0] : null;

  return NextResponse.json(
    { themes, stats: computeThemeStats(themes), last_run: lastRun, params: { limit } },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
