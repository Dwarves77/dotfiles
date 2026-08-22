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
// Superseding note (flywheel U3 — EXECUTED 2026-08-17): the detect_intersections RPC is retired
// (migration 265) and admin/intersections now assembles pairs from the persisted graph via
// pair-view.mjs. The two admin views split the same graph by grain: this route serves THEMES
// (clusters), admin/intersections serves PAIRS (edges). One scoring home (discover.mjs) feeds both.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { computeThemeStats } from "@/lib/connections/theme-stats.mjs";
import { isBriefStale } from "@/lib/connections/brief-staleness.mjs";

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
