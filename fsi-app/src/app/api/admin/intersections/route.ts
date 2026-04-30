// GET /api/admin/intersections
//
// Returns intersection candidates detected from the operational_scenario_tags
// and compliance_object_tags emitted during B.2 regeneration.
//
// Query params:
//   minStrength (default 5)  — filter pairs below this strength score
//   limit       (default 100) — cap returned rows
//
// Each row represents one canonicalized pair (A.id < B.id) with the
// shared tags and a strength score. The detect_intersections RPC
// (migration 021) does the heavy lifting in SQL. This route adds auth
// + rate limit + a JSON envelope for the UI.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const minStrengthRaw = searchParams.get("minStrength");
  const limitRaw = searchParams.get("limit");

  const minStrength = minStrengthRaw ? Math.max(1, parseInt(minStrengthRaw, 10) || 5) : 5;
  const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 100)) : 100;

  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc("detect_intersections", {
    min_strength: minStrength,
    max_results: limit,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stats — cheap aggregations the UI banner can show without a second query
  const rows = data || [];
  const stats = {
    total: rows.length,
    explicit_count: rows.filter((r: any) => r.explicitly_linked).length,
    by_strength: {
      strong: rows.filter((r: any) => r.strength >= 12).length,    // 4+ shared scenarios + something explicit-ish
      medium: rows.filter((r: any) => r.strength >= 8 && r.strength < 12).length,
      weak: rows.filter((r: any) => r.strength < 8).length,
    },
  };

  return NextResponse.json(
    { intersections: rows, stats, params: { minStrength, limit } },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
