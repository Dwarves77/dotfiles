// GET /api/admin/attention
//
// Returns aggregated admin-attention counts across all needs-attention
// categories (provisional sources, staged updates, materialization failures,
// integrity flags, source attribution mismatches, auto-approved awaiting
// spot-check, coverage gaps). Wraps the `admin_attention_counts()` RPC
// added in migration 036 (W2.E).
//
// Auth: requireAuth + isPlatformAdmin. 403 for authenticated non-admins —
// non-admin users should never see the red dot, so the API answer matches
// the UI gate.
//
// Cache: none. The whole point is fresh counts; the client polls at 60s.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface AttentionCounts {
  provisional_sources_pending: number;
  staged_updates_pending: number;
  staged_updates_materialization_failed: number;
  integrity_flags_unresolved: number;
  source_attribution_mismatches: number;
  auto_approved_awaiting_spotcheck: number;
  coverage_gaps_critical: number;
  total: number;
}

const EMPTY_COUNTS: AttentionCounts = {
  provisional_sources_pending: 0,
  staged_updates_pending: 0,
  staged_updates_materialization_failed: 0,
  integrity_flags_unresolved: 0,
  source_attribution_mismatches: 0,
  auto_approved_awaiting_spotcheck: 0,
  coverage_gaps_critical: 0,
  total: 0,
};

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  // Platform-admin gate. Service-role client bypasses RLS so the role
  // lookup works regardless of the caller's session scoping.
  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data, error } = await supabase.rpc("admin_attention_counts");

  if (error) {
    return NextResponse.json(
      { error: `admin_attention_counts RPC failed: ${error.message}` },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // RPC returns a one-row table. Take the first row; default to zeroes if
  // the migration hasn't been applied yet (defensive — prevents a 500 on
  // a fresh deploy where 036 trails).
  const row: AttentionCounts =
    Array.isArray(data) && data.length > 0
      ? (data[0] as AttentionCounts)
      : EMPTY_COUNTS;

  return NextResponse.json(row, {
    headers: {
      ...rateLimitHeaders(auth.userId),
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
