// GET /api/admin/attention
//
// Returns aggregated admin-attention counts across all needs-attention
// categories (provisional sources, staged updates, materialization failures,
// integrity flags, source attribution mismatches, auto-approved awaiting
// spot-check, coverage gaps). Wraps the `admin_attention_counts()` RPC
// added in migration 036 (W2.E).
//
// Auth: requireAuth + isPlatformAdmin. 401 for unauthenticated, 403 for
// authenticated non-admins — non-admin users should never see the red dot,
// so the API answer matches the UI gate.
//
// Cache (perf v2 — 2026-05-08):
//   - 200 (admin) responses: `private, max-age=30` so the browser cache
//     absorbs duplicate fetches within a 30s window. The hook polls at 60s,
//     so the cache TTL is half the poll interval — admins get a fresh
//     snapshot each tick, but spurious re-mounts (workspace store hydration
//     race, mobile/desktop sidebar both rendered) hit cache instead of
//     re-querying the RPC.
//   - 401/403 responses: `private, max-age=60` so a non-admin browser
//     navigating between routes doesn't re-issue the auth-failed call on
//     every paint. Admin status is sticky for the session — a one-minute
//     negative cache avoids the 500-1500 ms auth-check storm reported in
//     the perf v2 baseline (two simultaneous 401s on every route).
//   - 5xx responses: `no-store` so transient failures don't poison cache.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";

const NEGATIVE_CACHE = "private, max-age=60";
const POSITIVE_CACHE = "private, max-age=30";

function withCacheHeader(resp: NextResponse, value: string): NextResponse {
  resp.headers.set("Cache-Control", value);
  return resp;
}

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
  // Auth ordering (perf v2): the cheapest gate runs first. requireAuth
  // returns 401 on missing/invalid token before the rate limiter or any
  // DB query touches. Stamp negative-cache on the 401 so a non-admin
  // browser doesn't keep refetching on every navigation.
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return withCacheHeader(auth, NEGATIVE_CACHE);

  const limited = checkRateLimit(auth.userId);
  if (limited) return withCacheHeader(limited, NEGATIVE_CACHE);

  const supabase = getServiceClient();

  // Platform-admin gate. Service-role client bypasses RLS so the role
  // lookup works regardless of the caller's session scoping. Stamp the
  // 403 with negative-cache so authenticated non-admins don't re-query
  // org_memberships every navigation.
  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      {
        status: 403,
        headers: {
          ...rateLimitHeaders(auth.userId),
          "Cache-Control": NEGATIVE_CACHE,
        },
      }
    );
  }

  const { data, error } = await supabase.rpc("admin_attention_counts");

  if (error) {
    return NextResponse.json(
      { error: `admin_attention_counts RPC failed: ${error.message}` },
      {
        status: 500,
        headers: {
          ...rateLimitHeaders(auth.userId),
          "Cache-Control": "no-store",
        },
      }
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
      "Cache-Control": POSITIVE_CACHE,
    },
  });
}
