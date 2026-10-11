import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { computeThemeStats } from "@/lib/connections/theme-stats.mjs";
import { isBriefStale } from "@/lib/connections/brief-staleness.mjs";

export async function GET(request: NextRequest) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 50)) : 50;

  const { data, error } = await supabase
    .from("connection_themes")
    .select("id, computed_at, member_ids, dominant_signals, surfaces, density, convergence, pivots")
    .order("convergence", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const themes = data || [];

  // theme_briefs (migration 266, flywheel U6): durable per-theme editorial content that survives
  // connection_themes cache replacement. Loaded in a single .in() query scoped to the theme ids this
  // response is already returning — same service client, no extra round trip per theme. A row whose
  // theme_id has no match in `themes` (orphaned — the theme no longer exists in the live cluster) is
  // simply never attached, per migration 266's contract; it is not deleted or surfaced here.
  const themeIds = themes.map((t: { id: string }) => t.id);
  const briefsByThemeId = new Map<
    string,
    { title: string; brief_md: string; generated_at: string; member_hash: string }
  >();
  if (themeIds.length > 0) {
    const { data: briefRows, error: briefError } = await supabase
      .from("theme_briefs")
      .select("theme_id, title, brief_md, generated_at, member_hash")
      // fitness-allow: F39 (themeIds is the connection_themes cluster count — curated, not corpus-item-scaled)
      .in("theme_id", themeIds);

    // A brief-load failure is non-fatal, same posture as the last-run read below — the themes snapshot
    // is still valid without briefs attached; only surface it as a soft absence rather than failing the
    // whole route.
    if (!briefError && briefRows) {
      for (const row of briefRows) {
        briefsByThemeId.set(row.theme_id, row);
      }
    }
  }

  const themesWithBriefs = themes.map((t: { id: string; member_ids: string[] }) => {
    const briefRow = briefsByThemeId.get(t.id);
    const brief = briefRow
      ? {
          title: briefRow.title,
          brief_md: briefRow.brief_md,
          generated_at: briefRow.generated_at,
          // STALE = the live theme's membership no longer matches what the brief was generated against
          // (migration 266's contract). Recomputed here, never trusted from storage, so drift is always
          // detected rather than silently rendered as current.
          stale: isBriefStale(briefRow.member_hash, t.member_ids),
        }
      : null;
    return { ...t, brief };
  });

  const { data: runRows, error: runError } = await supabase
    .from("connection_theme_runs")
    .select("id, started_at, finished_at, status, nodes_read, edges_read, nodes_clustered, edges_used, themes_written, gaps_flagged, rounds")
    .order("started_at", { ascending: false })
    .limit(1);

  // A run-row read failure is non-fatal — the themes snapshot is still valid without its provenance
  // banner; only surface it as a soft null rather than failing the whole route.
  const lastRun = !runError && runRows && runRows.length ? runRows[0] : null;

  return NextResponse.json(
    { themes: themesWithBriefs, stats: computeThemeStats(themes), last_run: lastRun, params: { limit } },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
