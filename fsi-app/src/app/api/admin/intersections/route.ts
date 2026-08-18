// GET /api/admin/intersections
//
// Returns canonical item PAIRS from the persisted connection graph (item_cross_references) — the
// flywheel U3 supersession. The detect_intersections RPC (migration 023) that previously scored
// pairs in SQL from raw tags was the SECOND scoring home; it is retired (migration 265 drops it).
// discover.mjs is the ONE scoring home, its output is persisted with grounded basis by
// write-edges.mjs / mint-item.ts, and this route only ASSEMBLES what is stored — no compute-at-read,
// same posture as admin/themes.
//
// Directionality (ADR-018): storage keeps both directed rows; this reader canonicalizes to one
// undirected pair (pair-view.mjs), merging basis and taking max score.
//
// Query params:
//   minScore (default 0.3, the discovery threshold) — filter scored pairs below this; pairs carried
//     only by curated edges (manual / entity_extraction) are always included
//   limit    (default 100, max 500) — cap returned pairs after ranking (score desc)
//
// Auth: requireAuth + rate limit + platform-admin gate (house pattern, mirrors admin/themes).

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { assemblePairs } from "@/lib/connections/pair-view.mjs";

const PAGE = 1000; // supabase-js caps a select at 1000 rows; the edge table exceeds it (1,771 on 2026-08-17)

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const minScoreRaw = searchParams.get("minScore");
  const limitRaw = searchParams.get("limit");

  const parsedMinScore = minScoreRaw ? Number.parseFloat(minScoreRaw) : NaN;
  const minScore = Number.isFinite(parsedMinScore) ? Math.min(1, Math.max(0, parsedMinScore)) : 0.3;
  const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 100)) : 100;

  const supabase = getServiceSupabase();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // 1. Load the full edge set (any origin — curated edges mark explicit linkage), paged past the
  // 1000-row client cap.
  const edgeRows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("item_cross_references")
      .select("source_item_id, target_item_id, origin, basis, score")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    edgeRows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // 2. Fetch metadata for only the items the edges touch (live corpus — archived items drop out and
  // pair-view drops their pairs), chunked to keep the .in() list bounded.
  const ids = [...new Set(edgeRows.flatMap((e) => [e.source_item_id, e.target_item_id]))];
  const itemsById = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select("id, title, legacy_id, priority, intersection_summary")
      .eq("is_archived", false)
      .in("id", ids.slice(i, i + 200));
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const row of data ?? []) itemsById.set(row.id, row);
  }

  // 3. Pure assembly — canonical pairs, ranked, banded, with stats (pair-view.mjs, tested).
  const { pairs, stats } = assemblePairs(edgeRows, itemsById, { minScore, limit });

  return NextResponse.json(
    { intersections: pairs, stats, params: { minScore, limit } },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
